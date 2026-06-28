"use client";

import { useEffect, useMemo, useState } from "react";

// H17 item 3: client browser for *past* (COMPLETED) contests in a room.
// Hits GET /api/channels/:code/contests on mount, then filters to COMPLETED
// only — active (DRAFT/VOTING_OPEN) contests are surfaced separately by the
// room/dashboard "Active contests" cards. Selecting an item expands to show
// its frozen champion line; rich snapshot/bracket views hydrate from
// dedicated detail routes in follow-ups.

type ApiContestItem = {
  id: string;
  mode: "BATTLE" | "LEADERBOARD";
  status: "DRAFT" | "VOTING_OPEN" | "COMPLETED";
  bracketSize: number | null;
  createdAt: string;
  completedAt: string | null;
  championSubmissionId: string | null;
  championTitle: string | null;
};

type ContestListItem = Omit<ApiContestItem, "status"> & {
  status: "COMPLETED";
};

type Props = {
  channelKey: string;
};

export function PastContestsBrowser({ channelKey }: Props) {
  const [items, setItems] = useState<ContestListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/channels/${encodeURIComponent(channelKey)}/contests`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as { contests: ApiContestItem[] };
        if (!cancelled) {
          // H23 P2.2: filter to COMPLETED so VOTING_OPEN/DRAFT contests can't
          // leak into "Past contests" — those are surfaced by the room +
          // dashboard "Active contests" cards instead.
          const completed = data.contests.filter(
            (item): item is ContestListItem => item.status === "COMPLETED",
          );
          setItems(completed);
        }
      })
      .catch((reason) => {
        if (cancelled) return;
        console.error("[past-contests] load failed", reason);
        setError("Couldn't load contest history.");
      });
    return () => {
      cancelled = true;
    };
  }, [channelKey]);

  const selected = useMemo(
    () => items?.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <section className="space-y-3">
      {/*
        H23 P3.5: the inner "Past contests" heading is gone — both call
        sites (dashboard channel page + room) already render their own
        outer label, so this would duplicate it.
      */}
      {error ? (
        <p className="font-mono text-xs text-amber-300">{error}</p>
      ) : items === null ? (
        <p className="font-mono text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          No contests have run in this room yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <li
                key={item.id}
                className="rounded-lg border border-border bg-surface"
              >
                <button
                  type="button"
                  onClick={() =>
                    setSelectedId(isSelected ? null : item.id)
                  }
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                  aria-expanded={isSelected}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {item.mode === "BATTLE"
                        ? `Battle${item.bracketSize ? ` · ${item.bracketSize}-bracket` : ""}`
                        : "Leaderboard"}
                      {" "}
                      <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                        · {item.status.toLowerCase()}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      Started{" "}
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                      }).format(new Date(item.createdAt))}
                      {item.completedAt
                        ? ` · finalized ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.completedAt))}`
                        : ""}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                    {isSelected ? "Hide" : "View"}
                  </span>
                </button>
                {isSelected && selected ? (
                  <div className="border-t border-border px-3 py-3">
                    {selected.championTitle ? (
                      <p className="text-sm text-foreground">
                        <span className="mr-2" aria-hidden="true">
                          🏆
                        </span>
                        <span className="font-bold">{selected.championTitle}</span>
                      </p>
                    ) : (
                      <p className="font-mono text-xs text-muted-foreground">
                        No champion recorded.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
