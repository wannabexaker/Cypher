import { describe, expect, it, vi } from "vitest";

import {
  compareWinRatio,
  computeSubmissionFinalCounts,
  getVoteSplit,
  hasSameWinRatio,
} from "@/lib/votes";

describe("vote math", () => {
  it("renders an empty result as a neutral 50/50 split", () => {
    expect(getVoteSplit({ winCount: 0, lossCount: 0 })).toEqual({
      total: 0,
      winPct: 50,
      lossPct: 50,
    });
  });

  it("rounds percentages while preserving a 100% total", () => {
    expect(getVoteSplit({ winCount: 2, lossCount: 1 })).toEqual({
      total: 3,
      winPct: 67,
      lossPct: 33,
    });
  });

  it("compares exact ratios without floating-point drift", () => {
    expect(compareWinRatio({ winCount: 2, lossCount: 1 }, { winCount: 3, lossCount: 2 })).toBeGreaterThan(0);
    expect(hasSameWinRatio({ winCount: 2, lossCount: 2 }, { winCount: 1, lossCount: 1 })).toBe(true);
    expect(hasSameWinRatio({ winCount: 0, lossCount: 0 }, { winCount: 1, lossCount: 1 })).toBe(true);
  });
});

describe("computeSubmissionFinalCounts", () => {
  function clientReturning(rows: Array<{ choice: "WIN" | "LOSS"; total: number }>) {
    const groupBy = vi.fn().mockResolvedValue(
      rows.map((row) => ({
        choice: row.choice,
        _count: { _all: row.total },
      })),
    );
    const client = {
      vote: { groupBy },
    } as unknown as Parameters<typeof computeSubmissionFinalCounts>[0];
    return { client, groupBy };
  }

  it("uses only the advancing round in SELECTED mode", async () => {
    const { client, groupBy } = clientReturning([
      { choice: "WIN", total: 4 },
      { choice: "LOSS", total: 1 },
    ]);

    await expect(
      computeSubmissionFinalCounts(
        client,
        "submission-1",
        "SELECTED",
        [
          { id: "round-1", advances: false },
          { id: "round-2", advances: true },
        ],
        { contestId: "contest-1" },
      ),
    ).resolves.toEqual({ winCount: 4, lossCount: 1 });

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contestId: "contest-1",
          submissionId: "submission-1",
          trackVoteRoundId: "round-2",
          isValid: true,
        }),
      }),
    );
  });

  it("merges all rounds when no SELECTED round advances", async () => {
    const { client, groupBy } = clientReturning([]);

    await computeSubmissionFinalCounts(client, "submission-1", "SELECTED", [
      { id: "round-1", advances: false },
      { id: "round-2", advances: false },
    ]);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trackVoteRoundId: { in: ["round-1", "round-2"] },
        }),
      }),
    );
  });

  it("falls back to legacy non-round votes when no rounds exist", async () => {
    const { client, groupBy } = clientReturning([]);

    await computeSubmissionFinalCounts(client, "submission-1", "MERGE", []);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ trackVoteRoundId: null }),
      }),
    );
  });
});
