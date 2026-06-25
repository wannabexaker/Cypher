"use client";

import { Flag, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type OpenRound = {
  id: string;
  roundNumber: number;
  matchups: Array<{
    id: string;
    submissionA: { id: string; trackTitle: string };
    submissionB: { id: string; trackTitle: string } | null;
  }>;
};

type ChannelBattleRoundCloseControlProps = {
  channelId: string;
  status: string;
  openRound: OpenRound | null;
};

export function ChannelBattleRoundCloseControl({
  channelId,
  status,
  openRound,
}: ChannelBattleRoundCloseControlProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [tiedMatchupIds, setTiedMatchupIds] = useState<string[]>([]);
  const [winners, setWinners] = useState<Record<string, string>>({});

  const tieMatchups = useMemo(() => {
    if (!openRound) return [];
    return openRound.matchups.filter((matchup) => tiedMatchupIds.includes(matchup.id));
  }, [openRound, tiedMatchupIds]);

  const isBattle = status === "BATTLE";

  async function closeRound() {
    if (!openRound || pending) return;
    setPending(true);
    setError("");

    const winnerPayload = Object.entries(winners).map(([matchupId, submissionId]) => ({
      matchupId,
      submissionId,
    }));

    try {
      const response = await fetch(
        `/api/channels/${channelId}/battles/rounds/${openRound.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            winnerPayload.length > 0 ? { winners: winnerPayload } : {},
          ),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        tiedMatchupIds?: string[];
      };

      if (response.status === 409 && payload.tiedMatchupIds?.length) {
        setTiedMatchupIds(payload.tiedMatchupIds);
        setError(payload.error ?? "Round has ties. Pick winners to continue.");
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "Unable to close this round.");
        return;
      }

      setTiedMatchupIds([]);
      setWinners({});
      router.refresh();
    } catch {
      setError("Unable to close this round.");
    } finally {
      setPending(false);
    }
  }

  if (!isBattle) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Close rounds once the room enters battle mode.
      </p>
    );
  }

  if (!openRound) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No voting-open round right now.
      </p>
    );
  }

  return (
    <div>
      <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        Round {openRound.roundNumber}
      </p>

      {tieMatchups.length > 0 && (
        <fieldset className="mt-4" disabled={pending}>
          <legend className="text-sm font-bold text-foreground">Tie picks</legend>
          <div className="mt-3 space-y-3">
            {tieMatchups.map((matchup) => (
              <div
                key={matchup.id}
                className="rounded-lg border border-border bg-background p-3"
              >
                <p className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-cyan uppercase">
                  Matchup
                </p>
                <div className="mt-2 space-y-2">
                  {[matchup.submissionA, matchup.submissionB]
                    .filter((entry): entry is { id: string; trackTitle: string } => Boolean(entry))
                    .map((entry) => (
                      <label
                        key={entry.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-checked:border-lime/40"
                      >
                        <input
                          type="radio"
                          name={`winner-${matchup.id}`}
                          value={entry.id}
                          checked={winners[matchup.id] === entry.id}
                          onChange={() =>
                            setWinners((current) => ({
                              ...current,
                              [matchup.id]: entry.id,
                            }))
                          }
                          className="size-4 accent-lime"
                        />
                        <span className="text-foreground">{entry.trackTitle}</span>
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <Button
        type="button"
        size="sm"
        className="mt-4 w-full"
        disabled={
          pending ||
          (tieMatchups.length > 0 &&
            tieMatchups.some((matchup) => !winners[matchup.id]))
        }
        onClick={() => void closeRound()}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <Flag aria-hidden="true" />
        )}
        Close round & advance
      </Button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
