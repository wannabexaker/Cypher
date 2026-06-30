"use client";

import { LoaderCircle, Plus, Timer, TimerOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { VotingCountdown } from "@/components/voting/VotingCountdown";

// H20b: per-contest twin of ChannelTimerControl. Targets the contest-scoped
// voting-window route added in H20a so each concurrent contest manages its
// own deadline instead of borrowing the now-legacy channel kill switch.

type TimerAction =
  | { action: "arm"; minutes: number }
  | { action: "extend"; minutes: number }
  | { action: "close" };

type ContestTimerControlProps = {
  channelCode: string;
  contestId: string;
  contestStatus: "DRAFT" | "VOTING_OPEN" | "COMPLETED";
  closesAt: string | null;
};

const ARM_PRESETS = [1, 5, 10, 30] as const;
const EXTEND_MINUTES = 5;

export function ContestTimerControl({
  channelCode,
  contestId,
  contestStatus,
  closesAt,
}: ContestTimerControlProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const isOpen = contestStatus === "VOTING_OPEN" || contestStatus === "DRAFT";
  const hasTimer = Boolean(closesAt);

  async function send(body: TimerAction) {
    if (pending) return;
    setError("");
    setPending(true);

    try {
      const response = await fetch(
        `/api/channels/${channelCode}/contests/${contestId}/voting-window`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to update the voting timer.");
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to update the voting timer.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {hasTimer ? (
          <VotingCountdown closesAt={closesAt} />
        ) : (
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 font-mono text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
            <Timer className="size-3.5" aria-hidden="true" />
            No timer armed
          </span>
        )}
      </div>

      <p className="mt-4 font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        Arm voting window
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ARM_PRESETS.map((minutes) => (
          <Button
            key={minutes}
            type="button"
            variant="outline"
            size="sm"
            disabled={!isOpen || pending}
            onClick={() => void send({ action: "arm", minutes })}
          >
            <Timer aria-hidden="true" />
            {minutes} min
          </Button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:flex-1"
          disabled={!isOpen || pending}
          onClick={() => void send({ action: "extend", minutes: EXTEND_MINUTES })}
        >
          {pending ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Extend {EXTEND_MINUTES} min
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:flex-1 border-magenta/40 text-magenta hover:border-magenta hover:bg-magenta/10"
          disabled={!isOpen || pending || !hasTimer}
          onClick={() => void send({ action: "close" })}
        >
          <TimerOff aria-hidden="true" />
          Close voting now
        </Button>
      </div>

      {!isOpen && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This contest is already completed.
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
