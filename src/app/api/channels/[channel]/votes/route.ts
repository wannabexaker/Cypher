import {
  ChannelStatus,
  Prisma,
  SubmissionStatus,
  VoteChoice,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { hashHmac } from "@/lib/hash";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { verifyTurnstile } from "@/lib/turnstile";
import { channelCodeSchema } from "@/lib/validation/channels";
import { castVoteSchema } from "@/lib/validation/votes";
import { getVoteSplit } from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

const DEFAULT_VOTE_IP_CAP = 40;
const MAX_TRANSACTION_ATTEMPTS = 3;

class VoteIpCapError extends Error {}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  return firstForwarded || request.headers.get("x-real-ip")?.trim() || null;
}

function getVoteIpCap() {
  const configured = Number.parseInt(process.env.VOTE_IP_CAP ?? "", 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_VOTE_IP_CAP;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid vote details." }, { status: 400 });
  }

  const parsed = castVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid vote details." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true, status: true, votingClosesAt: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "Voting is only open while the room is open." },
      { status: 409 },
    );
  }
  if (channel.votingClosesAt && Date.now() >= channel.votingClosesAt.getTime()) {
    return NextResponse.json(
      { error: "Voting has closed for this room." },
      { status: 409 },
    );
  }

  const submission = await prisma.submission.findFirst({
    where: {
      id: parsed.data.submissionId,
      channelId: channel.id,
      status: SubmissionStatus.APPROVED,
    },
    select: { id: true },
  });
  if (!submission) {
    return NextResponse.json(
      { error: "Approved track not found." },
      { status: 404 },
    );
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  if (!membership) {
    return NextResponse.json(
      { error: "Join the room before voting." },
      { status: 403 },
    );
  }

  const clientIp = getClientIp(request);
  const ipHash = hashHmac(clientIp ?? "unknown");
  const fingerprintHash = parsed.data.fingerprint
    ? hashHmac(parsed.data.fingerprint)
    : null;
  const voterIdentity = identity.user
    ? `u:${identity.user.id}`
    : fingerprintHash
      ? `f:${fingerprintHash}`
      : `g:${identity.guestToken}`;
  const dedupeKey = `ch:${channel.id}:s:${submission.id}:${voterIdentity}`;

  if (
    !(await verifyTurnstile({
      token: parsed.data.turnstileToken,
      remoteIp: clientIp ?? undefined,
    }))
  ) {
    return NextResponse.json(
      { error: "Complete the anti-bot check before voting." },
      { status: 403 },
    );
  }

  // TODO(H09): optional self-vote guard.
  // TODO(H11): replace the basic DB IP cap with a Redis sliding window.
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const voteIpCap = getVoteIpCap();

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.vote.findUnique({
            where: { dedupeKey },
            select: { choice: true },
          });

          if (!existing) {
            const votesFromIp = await transaction.vote.count({
              where: {
                channelId: channel.id,
                ipHash,
                isValid: true,
              },
            });
            if (votesFromIp >= voteIpCap) throw new VoteIpCapError();
          }

          await transaction.vote.upsert({
            where: { dedupeKey },
            create: {
              channelId: channel.id,
              submissionId: submission.id,
              voterUserId: identity.user?.id ?? null,
              ipHash,
              fingerprintHash,
              cookieToken: identity.guestToken,
              userAgent,
              dedupeKey,
              choice: parsed.data.choice,
              isValid: true,
            },
            update: {
              choice: parsed.data.choice,
              isValid: true,
            },
          });

          const grouped = await transaction.vote.groupBy({
            by: ["choice"],
            where: { submissionId: submission.id, isValid: true },
            _count: { _all: true },
          });
          const winCount =
            grouped.find((group) => group.choice === VoteChoice.WIN)?._count
              ._all ?? 0;
          const lossCount =
            grouped.find((group) => group.choice === VoteChoice.LOSS)?._count
              ._all ?? 0;
          const total = winCount + lossCount;

          await transaction.submission.update({
            where: { id: submission.id },
            data: { winCount, lossCount, voteCount: total },
          });

          const flippedFrom =
            existing && existing.choice !== parsed.data.choice
              ? existing.choice
              : null;
          await transaction.auditLog.create({
            data: {
              actorUserId: identity.user?.id ?? null,
              action: "vote.cast",
              entityType: "submission",
              entityId: submission.id,
              ipHash,
              metadata: {
                channelId: channel.id,
                submissionId: submission.id,
                memberId: membership.id,
                choice: parsed.data.choice,
                ...(flippedFrom ? { flippedFrom } : {}),
              },
            },
          });

          return {
            created: existing === null,
            winCount,
            lossCount,
            total,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return NextResponse.json(
        {
          submissionId: submission.id,
          winCount: result.winCount,
          lossCount: result.lossCount,
          total: result.total,
          winPct: getVoteSplit(result).winPct,
          yourChoice: parsed.data.choice,
        },
        { status: result.created ? 201 : 200 },
      );
    } catch (error) {
      if (error instanceof VoteIpCapError) {
        return NextResponse.json(
          { error: "Too many votes came from this network." },
          { status: 429 },
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002") &&
        attempt < MAX_TRANSACTION_ATTEMPTS - 1
      ) {
        continue;
      }

      console.error("Vote cast failed", error);
      return NextResponse.json(
        { error: "Unable to record this vote right now." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "Unable to record this vote right now." },
    { status: 500 },
  );
}
