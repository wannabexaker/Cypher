// H17 item 4: all-time per-mode standings table. Server-component (no client
// state); parent passes pre-joined rows (submission title/artist + aggregates)
// so this stays render-only.

export type ModeStandingsRowDisplay = {
  submissionId: string;
  artistName: string;
  trackTitle: string;
  wins: number;
  losses: number;
  contests: number;
  championships: number;
  bestRank: number | null;
  // 0..100, already rounded.
  winPct: number;
};

type Props = {
  title: string;
  rows: ModeStandingsRowDisplay[];
  emptyLabel?: string;
};

export function ModeStandingsTable({
  title,
  rows,
  emptyLabel = "No completed contests in this mode yet.",
}: Props) {
  return (
    <section className="space-y-3">
      <h3 className="font-mono text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-surface font-mono text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">Track</th>
                <th className="hidden w-20 px-3 py-2 text-right sm:table-cell">
                  W%
                </th>
                <th className="w-16 px-3 py-2 text-right">W–L</th>
                <th className="hidden w-16 px-3 py-2 text-right sm:table-cell">
                  Contests
                </th>
                <th className="w-14 px-3 py-2 text-right">🏆</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.submissionId}
                  className="border-t border-border align-middle"
                >
                  <td className="px-3 py-2">
                    <p className="truncate font-bold text-foreground">
                      {row.artistName} — {row.trackTitle}
                    </p>
                    {row.bestRank !== null ? (
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        Best #{row.bestRank}
                      </p>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2 text-right font-mono text-xs text-lime sm:table-cell">
                    {row.winPct}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                    {row.wins}–{row.losses}
                  </td>
                  <td className="hidden px-3 py-2 text-right font-mono text-xs text-muted-foreground sm:table-cell">
                    {row.contests}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-amber-300">
                    {row.championships > 0 ? row.championships : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
