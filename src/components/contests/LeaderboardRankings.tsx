"use client";

import { useMemo, useState } from "react";

// H17 item 1: full ranked list for a contest with a client-side W↔L toggle.
// Pure presentational: parent server-component prepares display percent in
// 0..100 (already multiplied out from rankingSnapshot's 0..1 fraction). The
// L-order sort is "worst first": ascending winPct, tiebreak more losses.

export type LeaderboardRankingsEntry = {
  submissionId: string;
  rank: number;
  artistName: string;
  trackTitle: string;
  // 0..100, already rounded for display.
  winPct: number;
  wins: number;
  losses: number;
};

type Props = {
  entries: LeaderboardRankingsEntry[];
  canSeeCounts: boolean;
  countsHiddenLabel?: string;
};

const MEDALS = ["🥇", "🥈", "🥉"] as const;

export function LeaderboardRankings({
  entries,
  canSeeCounts,
  countsHiddenLabel = "Counts will appear when results are revealed.",
}: Props) {
  const [order, setOrder] = useState<"W" | "L">("W");

  const sorted = useMemo(() => {
    const copy = [...entries];
    if (order === "W") {
      // Honour the server-computed rank for "best first" so we match the
      // frozen snapshot exactly (rankingSnapshot is already W-sorted).
      copy.sort((a, b) => a.rank - b.rank);
    } else {
      // L-order: worst first — lowest winPct, then more losses (i.e. the
      // person who lost more is "more L"), then larger rank, then title.
      copy.sort((a, b) => {
        if (a.winPct !== b.winPct) return a.winPct - b.winPct;
        if (a.losses !== b.losses) return b.losses - a.losses;
        if (a.rank !== b.rank) return b.rank - a.rank;
        return a.trackTitle.localeCompare(b.trackTitle);
      });
    }
    return copy;
  }, [entries, order]);

  if (entries.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No participants yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-mono text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
          Standings
        </h3>
        <div
          className="inline-flex rounded-full border border-border bg-surface p-1"
          role="group"
          aria-label="Sort order"
        >
          <button
            type="button"
            onClick={() => setOrder("W")}
            className={`min-h-7 rounded-full px-3 font-mono text-[11px] font-bold tracking-[0.14em] uppercase transition ${
              order === "W"
                ? "bg-lime/15 text-lime"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={order === "W"}
          >
            W-order
          </button>
          <button
            type="button"
            onClick={() => setOrder("L")}
            className={`min-h-7 rounded-full px-3 font-mono text-[11px] font-bold tracking-[0.14em] uppercase transition ${
              order === "L"
                ? "bg-amber-300/15 text-amber-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={order === "L"}
          >
            L-order
          </button>
        </div>
      </div>

      <ol className="space-y-2">
        {sorted.map((entry, index) => {
          // Medals always reflect the frozen W-rank, even when the user is
          // browsing in L-order, so the iconography matches the snapshot.
          const medal =
            entry.rank >= 1 && entry.rank <= 3 ? MEDALS[entry.rank - 1] : null;
          const positionLabel =
            order === "W" ? `#${entry.rank}` : `L${index + 1}`;
          return (
            <li
              key={entry.submissionId}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <span className="inline-flex min-w-12 items-center justify-center font-mono text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
                {positionLabel}
              </span>
              {medal && (
                <span className="text-lg" aria-hidden="true">
                  {medal}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground sm:text-base">
                  {entry.artistName} — {entry.trackTitle}
                </p>
                {canSeeCounts ? (
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {entry.wins}W – {entry.losses}L
                  </p>
                ) : null}
              </div>
              {canSeeCounts ? (
                <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-lime/30 bg-lime/10 px-2 font-mono text-[11px] font-bold tracking-[0.12em] text-lime uppercase">
                  W {entry.winPct}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {!canSeeCounts ? (
        <p className="font-mono text-xs text-muted-foreground">
          {countsHiddenLabel}
        </p>
      ) : null}
    </div>
  );
}
