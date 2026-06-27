import {
  ChannelStatus,
  ContestMode,
  ContestStatus,
  MatchupStatus,
  Prisma,
  ResultsVisibility,
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
import { compareWinRatio, computeSubmissionFinalCounts } from "@/lib/votes";

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
      createdAt: true,
      roundResultMode: true,
      trackVoteRounds: {
        select: { id: true, advances: true },
      },
    },
  });

  const k = parsed.data.k;
  if (approved.length < k) {
    return NextResponse.json(
      { error: "Not enough approved tracks for that bracket size." },
      { status: 400 },
    );
  }

  // H13.1: seed by each track's final W% under its roundResultMode so battle
  // seeding agrees with the crown ranking. Falls back to legacy channel-wide
  // votes for tracks that never ran a TrackVoteRound.
  const scored = await Promise.all(
    approved.map(async (submission) => {
      const counts = await computeSubmissionFinalCounts(
        prisma,
        submission.id,
        submission.roundResultMode,
        submission.trackVoteRounds,
      );
      return {
        id: submission.id,
        createdAt: submission.createdAt,
        winCount: counts.winCount,
        lossCount: counts.lossCount,
      };
    }),
  );

  const ranked = [...scored].sort((a, b) => {
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

        // H16a: a battle bracket gets its own Contest so reads can group
        // matchups + matchup votes by it. Created before the round so we can
        // stamp `contestId` on the round inline.
        const battleContest = await transaction.contest.create({
          data: {
            channelId: channel.id,
            mode: ContestMode.BATTLE,
            status: ContestStatus.VOTING_OPEN,
            bracketSize: k,
          },
          select: { id: true },
        });

        const round = await transaction.battleRound.create({
          data: {
            channelId: channel.id,
            roundNumber: 1,
            status: RoundStatus.VOTING_OPEN,
            contestId: battleContest.id,
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

        // Seed = bracket order (1..k) using the ranking we just computed.
        await transaction.contestParticipant.createMany({
          data: seeded.map((submission, index) => ({
            contestId: battleContest.id,
            submissionId: submission.id,
            seed: index + 1,
          })),
        });

        await transaction.channel.update({
          where: { id: channel.id },
          data: {
            status: ChannelStatus.BATTLE,
            championSubmissionId: null,
            completedAt: null,
            lastActivityAt: new Date(),
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "battle.create",
            entityType: "channel",
            entityId: channel.id,
            metadata: { k, contestId: battleContest.id },
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
    select: {
      id: true,
      status: true,
      hostId: true,
      resultsVisibility: true,
      completedAt: true,
    },
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
  const completed = channel.status === ChannelStatus.COMPLETED;

  const callerIsHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(
      identity.user &&
        canManageChannel(identity.user, { hostId: channel.hostId }),
    );

  const canSeeCounts =
    channel.resultsVisibility === ResultsVisibility.LIVE ||
    (channel.resultsVisibility === ResultsVisibility.AFTER_CLOSE && completed) ||
    (channel.resultsVisibility === ResultsVisibility.HIDDEN && completed) ||
    callerIsHostOrModerator;

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

  const rounds = canSeeCounts
    ? state.rounds
    : state.rounds.map((round) => ({
        ...round,
        matchups: round.matchups.map((matchup) => ({
          ...matchup,
          sideA: matchup.sideA
            ? {
                ...matchup.sideA,
                winCount: 0,
                lossCount: 0,
                total: 0,
                winPct: 0,
              }
            : null,
          sideB: matchup.sideB
            ? {
                ...matchup.sideB,
                winCount: 0,
                lossCount: 0,
                total: 0,
                winPct: 0,
              }
            : null,
        })),
      }));

  return NextResponse.json({
    ...state,
    rounds,
    resultsHidden: !canSeeCounts,
    reason: canSeeCounts
      ? null
      : channel.resultsVisibility === ResultsVisibility.HIDDEN
        ? "Results reveal when the host finalizes the room."
        : "Results reveal when the battle is finalized.",
    member: Boolean(membership),
  });
}