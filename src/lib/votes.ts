export type VoteCounts = {
  winCount: number;
  lossCount: number;
};

export function getVoteSplit({ winCount, lossCount }: VoteCounts) {
  const total = winCount + lossCount;
  const winPct = total === 0 ? 50 : Math.round((winCount / total) * 100);

  return {
    total,
    winPct,
    lossPct: 100 - winPct,
  };
}

function ratioParts({ winCount, lossCount }: VoteCounts) {
  const total = winCount + lossCount;
  return total === 0
    ? { numerator: 1, denominator: 2 }
    : { numerator: winCount, denominator: total };
}

export function compareWinRatio(a: VoteCounts, b: VoteCounts) {
  const left = ratioParts(a);
  const right = ratioParts(b);
  return (
    left.numerator * right.denominator -
    right.numerator * left.denominator
  );
}

export function hasSameWinRatio(a: VoteCounts, b: VoteCounts) {
  return compareWinRatio(a, b) === 0;
}

// H13.1: compute a submission's *final* W/L from its TrackVoteRounds and the
// host's chosen ResultMode. Both finalize (crowning) and battle seeding rank
// by this so the two paths agree. Fallback chain keeps legacy channel-wide
// votes working when a submission has no rounds at all.
import type { Prisma, PrismaClient, ResultMode } from "@prisma/client";

type VotesClient =
  | PrismaClient
  | Prisma.TransactionClient
  | { vote: PrismaClient["vote"] };

export type SubmissionRoundInfo = {
  id: string;
  advances: boolean;
};

export type ComputeSubmissionFinalCountsOptions = {
  // H16b: scope the tally to a specific contest. When omitted, all votes for
  // the submission count (legacy behaviour for the now-deprecated channel
  // finalize path).
  contestId?: string;
};

export async function computeSubmissionFinalCounts(
  client: VotesClient,
  submissionId: string,
  roundResultMode: ResultMode,
  rounds: SubmissionRoundInfo[],
  options?: ComputeSubmissionFinalCountsOptions,
): Promise<VoteCounts> {
  const base: Prisma.VoteWhereInput = options?.contestId
    ? { contestId: options.contestId }
    : {};

  // Legacy: no track rounds at all → count the channel-wide votes
  // (trackVoteRoundId = null) so older approved submissions still rank.
  if (rounds.length === 0) {
    return aggregateChoice(client, {
      ...base,
      submissionId,
      trackVoteRoundId: null,
    });
  }

  if (roundResultMode === "SELECTED") {
    const chosen = rounds.find((round) => round.advances);
    if (chosen) {
      return aggregateChoice(client, {
        ...base,
        submissionId,
        trackVoteRoundId: chosen.id,
      });
    }
    // No round was marked → fall back to MERGE instead of returning zeros.
  }

  return aggregateChoice(client, {
    ...base,
    submissionId,
    trackVoteRoundId: { in: rounds.map((round) => round.id) },
  });
}

async function aggregateChoice(
  client: VotesClient,
  where: Prisma.VoteWhereInput,
): Promise<VoteCounts> {
  const grouped = await client.vote.groupBy({
    by: ["choice"],
    where: { ...where, isValid: true },
    _count: { _all: true },
  });
  let winCount = 0;
  let lossCount = 0;
  for (const row of grouped) {
    if (row.choice === "WIN") winCount = row._count._all;
    else if (row.choice === "LOSS") lossCount = row._count._all;
  }
  return { winCount, lossCount };
}

