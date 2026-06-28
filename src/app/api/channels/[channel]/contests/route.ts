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

import { canManageChannel, canModerateChannel } from "@/lib/channels";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createContestSchema } from "@/lib/validation/contest";
import { compareWinRatio } from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

// H20a: a single entry point to start a contest in a channel. Concurrent
// contests are now allowed (any mode mix) — every create assigns the next
// per-channel-per-mode sequence `number` inside the transaction.
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

  // H20a: channel.status is no longer the "is the room busy" gate — a single
  // OPEN room can host many concurrent contests. We still require the room to
  // be OPEN as a coarse "not archived/completed" check (legacy COMPLETED rooms
  // are read-only). Battle-create no longer flips this to BATTLE either.
  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "Only an open room can start a new contest." },
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

    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          // H20a: assign the next 1-based sequence number scoped to this
          // channel+mode. Same SERIALIZABLE isolation guards us against two
          // concurrent creates picking the same number (the second tx will
          // retry on a conflict).
          const sameModeCount = await transaction.contest.count({
            where: {
              channelId: channel.id,
              mode: ContestMode.LEADERBOARD,
            },
          });

          const contest = await transaction.contest.create({
            data: {
              channelId: channel.id,
              mode: ContestMode.LEADERBOARD,
              status: ContestStatus.VOTING_OPEN,
              number: sameModeCount + 1,
            },
            select: {
              id: true,
              mode: true,
              status: true,
              createdAt: true,
              number: true,
            },
          });

          await transaction.contestParticipant.createMany({
            data: approved.map((submission) => ({
              contestId: contest.id,
              submissionId: submission.id,
              wins: 0,
              losses: 0,
            })),
          });

          // H20a: do NOT reset Submission.winCount/lossCount/voteCount on
          // contest create. With concurrent contests the denormalised
          // Submission counters can't represent N active contests at once;
          // ContestParticipant.wins/losses is the per-contest source of truth.

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
                number: contest.number,
                participants: approved.length,
              },
            },
          });

          return contest;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return NextResponse.json(
        {
          id: result.id,
          mode: result.mode,
          status: result.status,
          number: result.number,
          createdAt: result.createdAt,
        },
        { status: 201 },
      );
    } catch (error) {
      console.error("Contest create failed", error);
      return NextResponse.json(
        { error: "Unable to start the contest right now." },
        { status: 500 },
      );
    }
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
        const sameModeCount = await transaction.contest.count({
          where: {
            channelId: channel.id,
            mode: ContestMode.BATTLE,
          },
        });

        const battleContest = await transaction.contest.create({
          data: {
            channelId: channel.id,
            mode: ContestMode.BATTLE,
            status: ContestStatus.VOTING_OPEN,
            bracketSize,
            number: sameModeCount + 1,
          },
          select: {
            id: true,
            mode: true,
            status: true,
            createdAt: true,
            number: true,
          },
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

        // H20a: channel-as-venue — do NOT flip channel.status to BATTLE.
        // The room stays OPEN regardless; "battle-ness" lives on the Contest.
        await transaction.channel.update({
          where: { id: channel.id },
          data: { lastActivityAt: new Date() },
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
              number: battleContest.number,
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
        number: created.number,
        createdAt: created.createdAt,
        bracketSize,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Contest create failed", error);
    return NextResponse.json(
      { error: "Unable to start the contest right now." },
      { status: 500 },
    );
  }
}

// H17 item 3 / H20a item 5: public list of every contest that ever ran in a
// channel (newest first). Accepts the channel id OR the 6-char code so the
// public room page and the dashboard can both hit it. Results visibility
// gating mirrors GET /results — non-mod callers see no championSubmissionId /
// championTitle when the channel hides results for that contest.
//
// H20a extends each row with `number`, `votingClosesAt`, `participantCount`
// and `totalVotes` so the upcoming room-side "Active contests" + "Past
// contests" cards have a single source of truth.
export async function GET(request: NextRequest, context: RouteContext) {
  const { channel: channelKey } = await context.params;
  if (!channelKey) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const channel = await prisma.channel.findFirst({
    where: { OR: [{ id: channelKey }, { code: channelKey.toUpperCase() }] },
    select: {
      id: true,
      hostId: true,
      status: true,
      resultsVisibility: true,
      completedAt: true,
      votingClosesAt: true,
    },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  const callerIsHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(
      identity.user && canManageChannel(identity.user, { hostId: channel.hostId }),
    );

  const contests = await prisma.contest.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      mode: true,
      status: true,
      bracketSize: true,
      votingClosesAt: true,
      createdAt: true,
      completedAt: true,
      championSubmissionId: true,
      _count: {
        select: { participants: true, votes: true },
      },
    },
  });

  const championIds = Array.from(
    new Set(
      contests
        .map((contest) => contest.championSubmissionId)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const championRows = championIds.length
    ? await prisma.submission.findMany({
        where: { id: { in: championIds } },
        select: { id: true, trackTitle: true },
      })
    : [];
  const championTitleById = new Map(
    championRows.map((row) => [row.id, row.trackTitle]),
  );

  const channelCompleted = channel.status === ChannelStatus.COMPLETED;
  const channelVotingClosed = Boolean(
    channel.votingClosesAt && Date.now() >= channel.votingClosesAt.getTime(),
  );

  const items = contests.map((contest) => {
    const contestCompleted = contest.status === ContestStatus.COMPLETED;
    // H20a: prefer the contest's own votingClosesAt when present; fall back to
    // the channel-level one so back-compat callers (pre-per-contest-timer
    // contests) still get a "closed" signal. A contest's champion is "visible"
    // when the channel-level visibility rule would expose results for THIS
    // contest. Hidden until completion under HIDDEN; until close (or
    // completion) under AFTER_CLOSE; always under LIVE.
    const contestVotingClosed = Boolean(
      contest.votingClosesAt && Date.now() >= contest.votingClosesAt.getTime(),
    );
    const votingClosed = contestVotingClosed || channelVotingClosed;
    const visible =
      callerIsHostOrModerator ||
      channel.resultsVisibility === ResultsVisibility.LIVE ||
      (channel.resultsVisibility === ResultsVisibility.AFTER_CLOSE &&
        (votingClosed || contestCompleted || channelCompleted)) ||
      (channel.resultsVisibility === ResultsVisibility.HIDDEN && contestCompleted);

    return {
      id: contest.id,
      number: contest.number,
      mode: contest.mode,
      status: contest.status,
      bracketSize: contest.bracketSize,
      votingClosesAt: contest.votingClosesAt
        ? contest.votingClosesAt.toISOString()
        : null,
      createdAt: contest.createdAt.toISOString(),
      completedAt: contest.completedAt ? contest.completedAt.toISOString() : null,
      participantCount: contest._count.participants,
      totalVotes: contest._count.votes,
      championSubmissionId: visible ? contest.championSubmissionId : null,
      championTitle:
        visible && contest.championSubmissionId
          ? championTitleById.get(contest.championSubmissionId) ?? null
          : null,
    };
  });

  return NextResponse.json({ contests: items });
}
