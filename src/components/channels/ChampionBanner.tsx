import { Crown } from "lucide-react";

type ChampionBannerProps = {
  artistName: string;
  trackTitle: string;
  winPct: number;
  total: number;
  completedAt: Date | null;
};

// Frozen winner card shown on a COMPLETED room. Pure presentational server
// component — tokens only, no client state.
export function ChampionBanner({
  artistName,
  trackTitle,
  winPct,
  total,
  completedAt,
}: ChampionBannerProps) {
  return (
    <div className="gradient-border noise-panel rounded-xl border border-transparent p-5 shadow-panel sm:p-7">
      <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-lime uppercase">
        <Crown className="size-4" aria-hidden="true" />
        Champion
      </div>
      <p className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
        {artistName} — {trackTitle}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-3 font-mono text-xs font-bold tracking-[0.12em] text-lime uppercase">
          W {winPct}%
        </span>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 font-mono text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {total} {total === 1 ? "vote" : "votes"}
        </span>
        {completedAt && (
          <span className="font-mono text-xs text-muted-foreground">
            Finalized{" "}
            {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
              completedAt,
            )}
          </span>
        )}
      </div>
    </div>
  );
}
