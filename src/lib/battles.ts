import {
  MatchupStatus,
  RoundStatus,
  VoteChoice,
  type ChannelStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getVoteSplit } from "@/lib/votes";

type OwnVoteFilter =
  | { voterUserId: string }
  | { cookieToken: string };

type VoteBucket = {
  winCount: number;
  lossCount: number;
};

function bucketKey(matchupId: string, submissionId: string) {
  return `${matchupId}:${submissionId}`;
}

function toBucketMap(
  grouped: Array<{
    matchupId: string | null;
    submissionId: string;
    choice: VoteChoice;
    _count: { _all: number };
  }>,
) {
  const map = new Map<string, VoteBucket>();
  for (const row of grouped) {
    if (!row.matchupId) continue;
    const key = bucketKey(row.matchupId, row.submissionId);
    const bucket = map.get(key) ?? { winCount: 0, lossCount: 0 };
    if (row.choice === VoteChoice.WIN) {
      bucket.winCount = row._count._all;
    } else if (row.choice === VoteChoice.LOSS) {
      bucket.lossCount = row._count._all;
    }
    map.set(key, bucket);
  }
  return map;
}

function getCounts(
  map: Map<string, VoteBucket>,
  matchupId: string,
  submissionId: string,
) {
  const counts = map.get(bucketKey(matchupId, submissionId)) ?? {
    winCount: 0,
    lossCount: 0,
  };
  const split = getVoteSplit(counts);
  return {
    winCount: counts.winCount,
    lossCount: counts.lossCount,
    total: split.total,
    winPct: split.winPct,
  };
}

export type BattleState = {
  channelId: string;
  status: ChannelStatus;
  championSubmissionId: string | null;
  completedAt: Date | null;
  rounds: Array<{
    id: string;
    roundNumber: number;
    status: RoundStatus;
    matchups: Array<{
      id: string;
      status: MatchupStatus;
      winnerSubmissionId: string | null;
      submissionA: { id: string; trackTitle: string };
      submissionB: { id: string; trackTitle: string } | null;
      sideA: { winCount: number; lossCount: number; total: number; winPct: number };
      sideB: { winCount: number; lossCount: number; total: number; winPct: number } | null;
    }>;
  }>;
  ownChoices: Record<string, Record<string, "WIN" | "LOSS">>;
};

export async function getBattleState(
  channelId: string,
  ownVoteFilter?: OwnVoteFilter,
): Promise<BattleState> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      status: true,
      championSubmissionId: true,
      completedAt: true,
      battleRounds: {
        orderBy: { roundNumber: "asc" },
        select: {
          id: true,
          roundNumber: true,
          status: true,
          matchups: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              status: true,
              winnerSubmissionId: true,
              submissionA: { select: { id: true, trackTitle: true } },
              submissionB: { select: { id: true, trackTitle: true } },
            },
          },
        },
      },
    },
  });

  if (!channel) {
    throw new Error("Channel not found");
  }

  const matchupIds = channel.battleRounds.flatMap((round) =>
    round.matchups.map((matchup) => matchup.id),
  );

  const [grouped, ownVotes] = await Promise.all([
    matchupIds.length === 0
      ? Promise.resolve([])
      : prisma.vote.groupBy({
          by: ["matchupId", "submissionId", "choice"],
          where: {
            channelId,
            isValid: true,
            matchupId: { in: matchupIds },
          },
          _count: { _all: true },
        }),
    ownVoteFilter
      ? prisma.vote.findMany({
          where: {
            channelId,
            isValid: true,
            matchupId: { in: matchupIds },
            ...ownVoteFilter,
          },
          orderBy: { createdAt: "desc" },
          select: {
            matchupId: true,
            submissionId: true,
            choice: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const groupedMap = toBucketMap(grouped);
  const ownChoices: Record<string, Record<string, "WIN" | "LOSS">> = {};
  for (const vote of ownVotes) {
    if (!vote.matchupId) continue;
    ownChoices[vote.matchupId] ??= {};
    ownChoices[vote.matchupId][vote.submissionId] ??= vote.choice;
  }

  return {
    channelId: channel.id,
    status: channel.status,
    championSubmissionId: channel.championSubmissionId,
    completedAt: channel.completedAt,
    rounds: channel.battleRounds.map((round) => ({
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      matchups: round.matchups.map((matchup) => ({
        id: matchup.id,
        status: matchup.status,
        winnerSubmissionId: matchup.winnerSubmissionId,
        submissionA: matchup.submissionA,
        submissionB: matchup.submissionB,
        sideA: getCounts(groupedMap, matchup.id, matchup.submissionA.id),
        sideB: matchup.submissionB
          ? getCounts(groupedMap, matchup.id, matchup.submissionB.id)
          : null,
      })),
    })),
    ownChoices,
  };
}