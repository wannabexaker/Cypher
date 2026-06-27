import {
  ChannelStatus,
  ContestMode,
  ContestStatus,
  MatchupStatus,
  Prisma,
  RoundStatus,
  SubmissionStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canModerateChannel } from "@/lib/channels";
import { getActiveContest } from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createContestSchema } from "@/lib/validation/contest";
import { compareWinRatio } from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

class ContestAlreadyActiveError extends Error {}

// H16b: a single entry point to start a contest in a channel. Replaces the
// old POST /battles seeding path so there is one "create a contest" route.
// Auth widens to canModerateChannel (host, ADMIN, or channel MODERATOR).
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to start a contest." },
      { status: 401 },
    );
  }

  const { channel: channelId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid contest details." },
      { status: 400 },
    );
  }

  const parsed = createContestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid contest details." },
      { status: 400 },
    );
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true, status: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!(await canModerateChannel(user, channel))) {
    return NextResponse.json(
      { error: "Only hosts or moderators can start a contest." },
      { status: 403 },
    );
  }

  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "Only an open room can start a new contest." },
      { status: 409 },
    );
  }

  // Single-active-contest invariant across both modes — checking either mode
  // is enough because the room cannot be OPEN while a BATTLE is in progress
  // and we forbid stacking LEADERBOARDs.
  const [activeLb, activeBattle] = await Promise.all([
    getActiveContest(prisma, channel.id, ContestMode.LEADERBOARD),
    getActiveContest(prisma, channel.id, ContestMode.BATTLE),
  ]);
  if (activeLb || activeBattle) {
    return NextResponse.json(
      { error: "A contest is already running in this room." },
      { status: 409 },
    );
  }

  const approved = await prisma.submission.findMany({
    where: { channelId: channel.id, status: SubmissionStatus.APPROVED },
    select: {
      id: true,
      createdAt: true,
      winCount: true,
      lossCount: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (parsed.data.mode === ContestMode.LEADERBOARD) {
    if (approved.length === 0) {
      return NextResponse.json(
        { error: "Approve at least one track before starting a leaderboard." },
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (transaction) => {
      const contest = await transaction.contest.create({
        data: {
          channelId: channel.id,
          mode: ContestMode.LEADERBOARD,
          status: ContestStatus.VOTING_OPEN,
        },
        select: { id: true, mode: true, status: true, createdAt: true },
      });

      await transaction.contestParticipant.createMany({
        data: approved.map((submission) => ({
          contestId: contest.id,
          submissionId: submission.id,
          wins: 0,
          losses: 0,
        })),
      });

      // Reset the denormalised live counters so the new contest starts at 0
      // votes. ContestParticipant.wins/losses is the authoritative per-contest
      // record; the Submission mirror just powers UI on the active contest.
      await transaction.submission.updateMany({
        where: { channelId: channel.id, status: SubmissionStatus.APPROVED },
        data: { winCount: 0, lossCount: 0, voteCount: 0 },
      });

      await transaction.channel.update({
        where: { id: channel.id },
        data: { lastActivityAt: new Date() },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "contest.create",
          entityType: "contest",
          entityId: contest.id,
          metadata: {
            channelId: channel.id,
            mode: ContestMode.LEADERBOARD,
            participants: approved.length,
          },
        },
      });

      return contest;
    });

    return NextResponse.json(
      {
        id: result.id,
        mode: result.mode,
        status: result.status,
        createdAt: result.createdAt,
      },
      { status: 201 },
    );
  }

  // BATTLE branch.
  const bracketSize = parsed.data.bracketSize;
  if (!bracketSize) {
    return NextResponse.json(
      { error: "BATTLE contests require a bracketSize." },
      { status: 400 },
    );
  }
  if (approved.length < bracketSize) {
    return NextResponse.json(
      { error: "Not enough approved tracks for that bracket size." },
      { status: 409 },
    );
  }

  // Seed top-K by the submission's standing in the latest COMPLETED LEADERBOARD
  // contest (rank ascending). Tracks with no standing fall back to live
  // winCount/lossCount, then to earliest createdAt.
  const lastLeaderboard = await prisma.contest.findFirst({
    where: {
      channelId: channel.id,
      mode: ContestMode.LEADERBOARD,
      status: ContestStatus.COMPLETED,
    },
    select: {
      id: true,
      participants: {
        select: {
          submissionId: true,
          rank: true,
          wins: true,
          losses: true,
        },
      },
    },
    orderBy: { completedAt: "desc" },
  });

  const standings = new Map<
    string,
    { rank: number | null; wins: number; losses: number }
  >();
  for (const participant of lastLeaderboard?.participants ?? []) {
    standings.set(participant.submissionId, {
      rank: participant.rank,
      wins: participant.wins,
      losses: participant.losses,
    });
  }

  const ranked = [...approved].sort((a, b) => {
    const standA = standings.get(a.id);
    const standB = standings.get(b.id);

    const rankA = standA?.rank ?? null;
    const rankB = standB?.rank ?? null;
    if (rankA !== null && rankB !== null) {
      if (rankA !== rankB) return rankA - rankB;
    } else if (rankA !== null) {
      return -1;
    } else if (rankB !== null) {
      return 1;
    }

    const left = standA ?? { wins: a.winCount, losses: a.lossCount };
    const right = standB ?? { wins: b.winCount, losses: b.lossCount };
    const ratioOrder = compareWinRatio(
      { winCount: right.wins, lossCount: right.losses },
      { winCount: left.wins, lossCount: left.losses },
    );
    if (ratioOrder !== 0) return ratioOrder;

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const seeded = ranked.slice(0, bracketSize);

  try {
    const created = await prisma.$transaction(
      async (transaction) => {
        const stillActive = await transaction.contest.findFirst({
          where: {
            channelId: channel.id,
            status: { in: [ContestStatus.DRAFT, ContestStatus.VOTING_OPEN] },
          },
          select: { id: true },
        });
        if (stillActive) {
          throw new ContestAlreadyActiveError();
        }

        const battleContest = await transaction.contest.create({
          data: {
            channelId: channel.id,
            mode: ContestMode.BATTLE,
            status: ContestStatus.VOTING_OPEN,
            bracketSize,
          },
          select: { id: true, mode: true, status: true, createdAt: true },
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

        const pairs = Array.from({ length: bracketSize / 2 }, (_, index) => {
          const left = seeded[index];
          const right = seeded[bracketSize - 1 - index];
          return {
            roundId: round.id,
            position: index,
            submissionAId: left.id,
            submissionBId: right.id,
            status: MatchupStatus.VOTING_OPEN,
          };
        });
        await transaction.matchup.createMany({ data: pairs });

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
            action: "contest.create",
            entityType: "contest",
            entityId: battleContest.id,
            metadata: {
              channelId: channel.id,
              mode: ContestMode.BATTLE,
              bracketSize,
              roundId: round.id,
            },
          },
        });

        return battleContest;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(
      {
        id: created.id,
        mode: created.mode,
        status: created.status,
        createdAt: created.createdAt,
        bracketSize,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ContestAlreadyActiveError) {
      return NextResponse.json(
        { error: "A contest is already running in this room." },
        { status: 409 },
      );
    }
    console.error("Contest create failed", error);
    return NextResponse.json(
      { error: "Unable to start the contest right now." },
      { status: 500 },
    );
  }
}
