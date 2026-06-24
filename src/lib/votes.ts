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
