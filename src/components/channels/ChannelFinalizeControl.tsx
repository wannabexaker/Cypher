"use client";

import { Crown, LoaderCircle, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type FinalizeTrack = {
  id: string;
  label: string;
  winPct: number;
  total: number;
};

type ChannelFinalizeControlProps = {
  channelId: string;
  status: string;
  tracks: FinalizeTrack[];
  championLabel: string | null;
};

export function ChannelFinalizeControl({
  channelId,
  status,
  tracks,
  championLabel,
}: ChannelFinalizeControlProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [tiedIds, setTiedIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState("");

  const isOpen = status === "OPEN";
  const completed = status === "COMPLETED";

  async function finalize(championSubmissionId?: string) {
    if (pending) return;
    setError("");
    setPending(true);

    try {
      const response = await fetch(`/api/channels/${channelId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          championSubmissionId ? { championSubmissionId } : {},
        ),
      });

      const payload = (await response.json()) as {
        error?: string;
        tiedSubmissionIds?: string[];
      };

      if (response.status === 409 && payload.tiedSubmissionIds?.length) {
        setTiedIds(payload.tiedSubmissionIds);
        setSelected(payload.tiedSubmissionIds[0] ?? "");
        setError(payload.error ?? "It's a tie — pick the champion to crown.");
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "Unable to finalize the room.");
        return;
      }

      setTiedIds(null);
      router.refresh();
    } catch {
      setError("Unable to finalize the room.");
    } finally {
      setPending(false);
    }
  }

  if (completed) {
    return (
      <div>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-3 font-mono text-xs font-bold tracking-[0.12em] text-lime uppercase">
          <Trophy className="size-3.5" aria-hidden="true" />
          Room finalized
        </span>
        {championLabel && (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Champion:{" "}
            <span className="font-bold text-foreground">{championLabel}</span>
          </p>
        )}
      </div>
    );
  }

  const tiedTracks = tiedIds
    ? tracks.filter((track) => tiedIds.includes(track.id))
    : [];

  return (
    <div>
      {tiedIds ? (
        <fieldset disabled={pending}>
          <legend className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
            Pick the champion
          </legend>
          <div className="mt-3 grid gap-2">
            {tiedTracks.map((track) => (
              <label
                key={track.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm has-checked:border-lime/50"
              >
                <input
                  type="radio"
                  name="champion"
                  value={track.id}
                  checked={selected === track.id}
                  onChange={() => setSelected(track.id)}
                  className="size-4 accent-lime"
                />
                <span className="font-bold text-foreground">{track.label}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  W {track.winPct}% · {track.total}
                </span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className="mt-4 w-full"
            disabled={pending || !selected}
            onClick={() => void finalize(selected)}
          >
            {pending ? (
              <LoaderCircle className="motion-safe:animate-spin" />
            ) : (
              <Crown aria-hidden="true" />
            )}
            Crown selected winner
          </Button>
        </fieldset>
      ) : (
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={!isOpen || pending}
          onClick={() => void finalize()}
        >
          {pending ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <Crown aria-hidden="true" />
          )}
          Finalize &amp; crown winner
        </Button>
      )}

      {!isOpen && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Open the room to finalize results.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
