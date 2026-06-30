import { Crown, Medal } from "lucide-react";

// H17 item 2: top-3 podium shown wherever a champion used to render alone.
// Gracefully degrades when fewer than 3 entries are available (room with two
// submissions only shows gold + silver, etc.). All counts and labels are
// prepared server-side so this stays a pure presentational component.

export type PodiumEntryDisplay = {
  rank: number;
  artistName: string;
  trackTitle: string;
  // Display percent in [0, 100]. Callers must convert from rankingSnapshot
  // (fraction 0..1) before passing it in.
  winPct: number;
  wins: number;
  losses: number;
};

type Tone = {
  label: string;
  textClass: string;
  ringClass: string;
  bgClass: string;
  emoji: string;
};

const TONES: Record<1 | 2 | 3, Tone> = {
  1: {
    label: "Champion",
    textClass: "text-lime",
    ringClass: "border-lime/40",
    bgClass: "bg-lime/10",
    emoji: "🥇",
  },
  2: {
    label: "Runner-up",
    textClass: "text-amber-300",
    ringClass: "border-amber-300/40",
    bgClass: "bg-amber-300/10",
    emoji: "🥈",
  },
  3: {
    label: "Bronze",
    textClass: "text-orange-300",
    ringClass: "border-orange-300/40",
    bgClass: "bg-orange-300/10",
    emoji: "🥉",
  },
};

type PodiumTop3Props = {
  entries: PodiumEntryDisplay[];
  showCounts?: boolean;
  completedAt?: Date | null;
  heading?: string | null;
};

export function PodiumTop3({
  entries,
  showCounts = true,
  completedAt,
  heading = "Podium",
}: PodiumTop3Props) {
  if (entries.length === 0) return null;
  const top = entries.slice(0, 3);

  return (
    <div className="gradient-border noise-panel rounded-xl border border-transparent p-5 shadow-panel sm:p-7">
      {heading ? (
        <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-lime uppercase">
          <Crown className="size-4" aria-hidden="true" />
          {heading}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {top.map((entry) => {
          const tone = TONES[Math.min(Math.max(entry.rank, 1), 3) as 1 | 2 | 3];
          return (
            <div
              key={`${entry.rank}-${entry.trackTitle}`}
              className={`rounded-lg border ${tone.ringClass} ${tone.bgClass} p-4`}
            >
              <div
                className={`flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase ${tone.textClass}`}
              >
                <span aria-hidden="true">{tone.emoji}</span>
                <Medal className="size-3.5" aria-hidden="true" />
                {tone.label}
              </div>
              <p className="mt-2 text-base font-bold text-foreground sm:text-lg">
                {entry.artistName} — {entry.trackTitle}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {showCounts ? (
                  <>
                    <span
                      className={`inline-flex min-h-7 items-center gap-1 rounded-full border ${tone.ringClass} ${tone.bgClass} px-2 font-mono text-[11px] font-bold tracking-[0.12em] uppercase ${tone.textClass}`}
                    >
                      W {entry.winPct}%
                    </span>
                    <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-surface px-2 font-mono text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                      {entry.wins}–{entry.losses}
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[11px] text-muted-foreground uppercase">
                    Counts hidden
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {completedAt && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Finalized{" "}
          {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
            completedAt,
          )}
        </p>
      )}
    </div>
  );
}
