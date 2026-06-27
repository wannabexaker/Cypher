import {
  ContestMode,
  ContestStatus,
  type Prisma,
  type PrismaClient,
  SubmissionStatus,
} from "@prisma/client";

import {
  compareWinRatio,
  computeSubmissionFinalCounts,
  hasSameWinRatio,
} from "@/lib/votes";

// H16a/H16b helpers — Channel-as-venue / Contest-as-event groundwork.
// Helpers are deliberately small and side-effect free beyond the writes they
// describe, so call sites can fold them into existing transactions.

type Db = PrismaClient | Prisma.TransactionClient;

// Bump the channel's activity clock. The cron purge (15-day inactivity) reads
// this column; every write path that means "the room is alive" should call it.
export async function bumpChannelActivity(db: Db, channelId: string): Promise<void> {
  await db.channel.update({
    where: { id: channelId },
    data: { lastActivityAt: new Date() },
  });
}

// Return the currently active contest for a channel + mode, or null when no
// contest exists yet. "Active" = DRAFT or VOTING_OPEN, most recent first.
// Callers use this to stamp `contestId` on new votes / rounds.
export async function getActiveContest(
  db: Db,
  channelId: string,
  mode: ContestMode,
): Promise<{ id: string; status: ContestStatus } | null> {
  const contest = await db.contest.findFirst({
    where: {
      channelId,
      mode,
      status: { in: [ContestStatus.DRAFT, ContestStatus.VOTING_OPEN] },
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  return contest;
}

// H16b: return the most recently completed contest for a channel, optionally
// filtered by mode. Reads consume this to render the venue's "current champion"
// banner once the active contest closes — without any state living on Channel
// anymore. Returns null when the channel has never run a contest of that mode.
export type LatestCompletedContest = {
  id: string;
  mode: ContestMode;
  championSubmissionId: string | null;
  completedAt: Date | null;
  rankingSnapshot: Prisma.JsonValue | null;
};

export async function getLatestCompletedContest(
  db: Db,
  channelId: string,
  mode?: ContestMode,
): Promise<LatestCompletedContest | null> {
  return db.contest.findFirst({
    where: {
      channelId,
      status: ContestStatus.COMPLETED,
      ...(mode ? { mode } : {}),
    },
    select: {
      id: true,
      mode: true,
      championSubmissionId: true,
      completedAt: true,
      rankingSnapshot: true,
    },
    orderBy: { completedAt: "desc" },
  });
}

// H16b: a single active-contest gate any vote/round-create can call so it
// returns the same 409 shape everywhere. Returns the contest when present.
export async function requireActiveContest(
  db: Db,
  channelId: string,
  mode: ContestMode,
): Promise<{ id: string; status: ContestStatus } | null> {
  return getActiveContest(db, channelId, mode);
}

// H16b: shared LEADERBOARD finalize logic. Used by both the new contest
// finalize endpoint and the legacy channel finalize wrapper so the ranking
// rules + tie-break shape stay in lockstep.
export type LeaderboardFinalizeResult =
  | {
      kind: "ok";
      contestId: string;
      championSubmissionId: string;
      completedAt: Date;
      rankingSnapshot: RankingSnapshotEntry[];
    }
  | { kind: "tie"; tiedSubmissionIds: string[] }
  | { kind: "no_approved" };

export type RankingSnapshotEntry = {
  submissionId: string;
  rank: number;
  wins: number;
  losses: number;
  winPct: number;
};

export type RunLeaderboardFinalizeInput = {
  contestId: string;
  channelId: string;
  actorUserId: string;
  championPick?: string;
};

export async function runLeaderboardFinalize(
  prisma: PrismaClient,
  input: RunLeaderboardFinalizeInput,
): Promise<LeaderboardFinalizeResult> {
  const submissions = await prisma.submission.findMany({
    where: { channelId: input.channelId, status: SubmissionStatus.APPROVED },
    select: {
      id: true,
      createdAt: true,
      roundResultMode: true,
      trackVoteRounds: {
        select: { id: true, advances: true },
      },
    },
  });

  if (submissions.length === 0) {
    return { kind: "no_approved" };
  }

  // Score each track using the same SELECTED/MERGE rules as the legacy crown
  // path, but scoped to this contest so older votes don't bleed in.
  const scored = await Promise.all(
    submissions.map(async (submission) => {
      const counts = await computeSubmissionFinalCounts(
        prisma,
        submission.id,
        submission.roundResultMode,
        submission.trackVoteRounds,
        { contestId: input.contestId },
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

  const topTier = ranked.filter((submission) =>
    hasSameWinRatio(submission, ranked[0]),
  );

  let championSubmissionId: string;
  let tieBroken = false;

  if (topTier.length > 1) {
    const tiedSubmissionIds = topTier.map((submission) => submission.id);
    const pick = input.championPick;
    if (!pick || !tiedSubmissionIds.includes(pick)) {
      return { kind: "tie", tiedSubmissionIds };
    }
    championSubmissionId = pick;
    tieBroken = true;
  } else {
    championSubmissionId = ranked[0].id;
  }

  const rankingSnapshot: RankingSnapshotEntry[] = ranked.map(
    (submission, index) => {
      const total = submission.winCount + submission.lossCount;
      const winPct = total === 0 ? 0 : submission.winCount / total;
      return {
        submissionId: submission.id,
        rank: index + 1,
        wins: submission.winCount,
        losses: submission.lossCount,
        winPct,
      };
    },
  );

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    // Mirror the contest counts onto the Submission row so live UI doesn't
    // jump after finalize. ContestParticipant remains the contest-of-record.
    for (const submission of scored) {
      await transaction.submission.update({
        where: { id: submission.id },
        data: {
          winCount: submission.winCount,
          lossCount: submission.lossCount,
        },
      });
    }

    await transaction.contest.update({
      where: { id: input.contestId },
      data: {
        status: ContestStatus.COMPLETED,
        championSubmissionId,
        completedAt: now,
        rankingSnapshot: rankingSnapshot as unknown as Prisma.InputJsonValue,
      },
    });

    for (const entry of rankingSnapshot) {
      await transaction.contestParticipant.updateMany({
        where: {
          contestId: input.contestId,
          submissionId: entry.submissionId,
        },
        data: {
          rank: entry.rank,
          wins: entry.wins,
          losses: entry.losses,
        },
      });
    }

    await transaction.channel.update({
      where: { id: input.channelId },
      data: { lastActivityAt: now },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "contest.finalize",
        entityType: "contest",
        entityId: input.contestId,
        metadata: {
          channelId: input.channelId,
          championSubmissionId,
          tieBroken,
          participants: rankingSnapshot.length,
        },
      },
    });
  });

  return {
    kind: "ok",
    contestId: input.contestId,
    championSubmissionId,
    completedAt: now,
    rankingSnapshot,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// H17 — results presentation helpers
// ─────────────────────────────────────────────────────────────────────────────

// Defensive parser for Contest.rankingSnapshot. The column is Json? and rows
// from older contests may legitimately be null/empty. Anything that doesn't
// match the documented shape is dropped so the UI never crashes on a stale or
// hand-edited row. NB: rankingSnapshot[].winPct is a FRACTION (0..1).
export function parseRankingSnapshot(value: unknown): RankingSnapshotEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: RankingSnapshotEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const submissionId = record.submissionId;
    const rank = record.rank;
    const wins = record.wins;
    const losses = record.losses;
    const winPct = record.winPct;
    if (
      typeof submissionId !== "string" ||
      typeof rank !== "number" ||
      typeof wins !== "number" ||
      typeof losses !== "number" ||
      typeof winPct !== "number"
    ) {
      continue;
    }
    entries.push({ submissionId, rank, wins, losses, winPct });
  }
  return entries.sort((a, b) => a.rank - b.rank);
}

// H17: a single shape both medal podium and rankings UI consume. `winPct` is
// the FRACTION (0..1) straight from the snapshot — callers ×100 to render.
export type PodiumEntry = {
  rank: number;
  submissionId: string;
  wins: number;
  losses: number;
  winPct: number;
};

// Return the top 3 entries from a rankingSnapshot, padded down if there are
// fewer than 3 participants (UI keeps a graceful fallback rather than 404'ing).
export function getContestPodium(
  snapshot: RankingSnapshotEntry[],
  limit = 3,
): PodiumEntry[] {
  return snapshot.slice(0, limit).map((entry) => ({
    rank: entry.rank,
    submissionId: entry.submissionId,
    wins: entry.wins,
    losses: entry.losses,
    winPct: entry.winPct,
  }));
}

// H17 item 4: per-mode "all-time" standings for a channel. Aggregates
// ContestParticipant rows joined to COMPLETED contests of the requested mode
// — a song that participated in both BATTLE and LEADERBOARD contests gets two
// independent records (callers render two tables side-by-side).
export type ModeStandingsRow = {
  submissionId: string;
  wins: number;
  losses: number;
  contests: number;
  championships: number;
  bestRank: number | null;
};

export async function getModeStandings(
  db: Db,
  channelId: string,
  mode: ContestMode,
): Promise<ModeStandingsRow[]> {
  const completed = await db.contest.findMany({
    where: {
      channelId,
      mode,
      status: ContestStatus.COMPLETED,
    },
    select: {
      championSubmissionId: true,
      participants: {
        select: {
          submissionId: true,
          wins: true,
          losses: true,
          rank: true,
        },
      },
    },
  });

  const acc = new Map<string, ModeStandingsRow>();
  for (const contest of completed) {
    for (const participant of contest.participants) {
      const existing = acc.get(participant.submissionId) ?? {
        submissionId: participant.submissionId,
        wins: 0,
        losses: 0,
        contests: 0,
        championships: 0,
        bestRank: null as number | null,
      };
      existing.wins += participant.wins;
      existing.losses += participant.losses;
      existing.contests += 1;
      if (
        contest.championSubmissionId &&
        contest.championSubmissionId === participant.submissionId
      ) {
        existing.championships += 1;
      }
      if (
        typeof participant.rank === "number" &&
        (existing.bestRank === null || participant.rank < existing.bestRank)
      ) {
        existing.bestRank = participant.rank;
      }
      acc.set(participant.submissionId, existing);
    }
  }

  return [...acc.values()].sort((a, b) => {
    const ratioOrder = compareWinRatio(
      { winCount: b.wins, lossCount: b.losses },
      { winCount: a.wins, lossCount: a.losses },
    );
    if (ratioOrder !== 0) return ratioOrder;
    if (b.championships !== a.championships) {
      return b.championships - a.championships;
    }
    if (b.contests !== a.contests) return b.contests - a.contests;
    return a.submissionId.localeCompare(b.submissionId);
  });
}
