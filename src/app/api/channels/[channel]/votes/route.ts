import {
  ChannelStatus,
  SubmissionStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import {
  castWlVote,
  VoteIpCapError,
  VoteTurnstileError,
} from "@/lib/cast-wl-vote";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { channelCodeSchema } from "@/lib/validation/channels";
import { castVoteSchema } from "@/lib/validation/votes";
import { getVoteSplit } from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

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

  // TODO: optional self-vote guard.
  // TODO: replace the basic DB IP cap with a Redis sliding window.

  try {
    const result = await castWlVote({
      request,
      identity,
      membershipId: membership.id,
      channelId: channel.id,
      submissionId: submission.id,
      choice: parsed.data.choice,
      fingerprint: parsed.data.fingerprint,
      turnstileToken: parsed.data.turnstileToken,
      dedupeKeyForIdentity: (identityKey) =>
        `ch:${channel.id}:s:${submission.id}:${identityKey}`,
      updateAfterVote: async (transaction, counts) => {
        await transaction.submission.update({
          where: { id: submission.id },
          data: {
            winCount: counts.winCount,
            lossCount: counts.lossCount,
            voteCount: counts.total,
          },
        });
      },
    });

    return NextResponse.json(
      {
        submissionId: submission.id,
        winCount: result.winCount,
        lossCount: result.lossCount,
        total: result.total,
        winPct: getVoteSplit(result).winPct,
        yourChoice: result.choice,
        locked: result.locked,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof VoteTurnstileError) {
      return NextResponse.json(
        { error: "Complete the anti-bot check before voting." },
        { status: 403 },
      );
    }
    if (error instanceof VoteIpCapError) {
      return NextResponse.json(
        { error: "Too many votes came from this network." },
        { status: 429 },
      );
    }

    console.error("Vote cast failed", error);
    return NextResponse.json(
      { error: "Unable to record this vote right now." },
      { status: 500 },
    );
  }
}
