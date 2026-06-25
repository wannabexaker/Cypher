import {
  ChannelStatus,
  MatchupStatus,
  Prisma,
  RoundStatus,
  SubmissionStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { getBattleState } from "@/lib/battles";
import { canManageChannel } from "@/lib/channels";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  createBattleSchema,
} from "@/lib/validation/battle";
import { channelCodeSchema } from "@/lib/validation/channels";
import { compareWinRatio } from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

class ChannelNotOpenError extends Error {}
class BattleAlreadyExistsError extends Error {}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to create a battle bracket." },
      { status: 401 },
    );
  }

  const { channel: channelId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid battle details." }, { status: 400 });
  }

  const parsed = createBattleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid battle details." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true, status: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can create a battle bracket." },
      { status: 403 },
    );
  }
  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "Only an open room can start a battle bracket." },
      { status: 409 },
    );
  }

  const approved = await prisma.submission.findMany({
    where: {
      channelId: channel.id,
      status: SubmissionStatus.APPROVED,
    },
    select: {
      id: true,
      winCount: true,
      lossCount: true,
      createdAt: true,
    },
  });

  const k = parsed.data.k;
  if (approved.length < k) {
    return NextResponse.json(
      { error: "Not enough approved tracks for that bracket size." },
      { status: 400 },
    );
  }

  const ranked = [...approved].sort((a, b) => {
    const ratioOrder = compareWinRatio(b, a);
    if (ratioOrder !== 0) return ratioOrder;
    const totalA = a.winCount + a.lossCount;
    const totalB = b.winCount + b.lossCount;
    if (totalB !== totalA) return totalB - totalA;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const seeded = ranked.slice(0, k);

  try {
    const createdChannelId = await prisma.$transaction(
      async (transaction) => {
        const latest = await transaction.channel.findUnique({
          where: { id: channel.id },
          select: {
            id: true,
            status: true,
            battleRounds: { select: { id: true } },
          },
        });

        if (!latest) throw new Error("Channel not found.");
        if (latest.status !== ChannelStatus.OPEN) throw new ChannelNotOpenError();
        if (latest.battleRounds.length > 0) {
          throw new BattleAlreadyExistsError();
        }

        const round = await transaction.battleRound.create({
          data: {
            channelId: channel.id,
            roundNumber: 1,
            status: RoundStatus.VOTING_OPEN,
          },
          select: { id: true },
        });

        const pairs = Array.from({ length: k / 2 }, (_, index) => {
          const left = seeded[index];
          const right = seeded[k - 1 - index];
          return {
            roundId: round.id,
            position: index,
            submissionAId: left.id,
            submissionBId: right.id,
            status: MatchupStatus.VOTING_OPEN,
          };
        });

        await transaction.matchup.createMany({ data: pairs });

        await transaction.channel.update({
          where: { id: channel.id },
          data: {
            status: ChannelStatus.BATTLE,
            championSubmissionId: null,
            completedAt: null,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "battle.create",
            entityType: "channel",
            entityId: channel.id,
            metadata: { k },
          },
        });

        return channel.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const state = await getBattleState(createdChannelId);
    return NextResponse.json(state, { status: 201 });
  } catch (error) {
    if (error instanceof ChannelNotOpenError) {
      return NextResponse.json(
        { error: "Only an open room can start a battle bracket." },
        { status: 409 },
      );
    }
    if (error instanceof BattleAlreadyExistsError) {
      return NextResponse.json(
        { error: "Battle bracket already exists for this room." },
        { status: 409 },
      );
    }

    console.error("Battle create failed", error);
    return NextResponse.json(
      { error: "Unable to create the battle bracket right now." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true, status: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (
    channel.status !== ChannelStatus.BATTLE &&
    channel.status !== ChannelStatus.COMPLETED
  ) {
    return NextResponse.json(
      { error: "Battle bracket is not available for this room." },
      { status: 409 },
    );
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  const state = await getBattleState(
    channel.id,
    membership
      ? identity.user
        ? { voterUserId: identity.user.id }
        : identity.guestToken
          ? { cookieToken: identity.guestToken }
          : undefined
      : undefined,
  );

  return NextResponse.json({
    ...state,
    member: Boolean(membership),
  });
}