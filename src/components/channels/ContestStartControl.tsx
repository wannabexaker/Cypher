"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// H16b: minimal host control to start a new leaderboard contest.
// Battle brackets keep their own existing control (ChannelBattleCreateControl)
// so the host UX stays distinct, but both endpoints route through
// POST /api/channels/[channel]/contests.
type ContestStartControlProps = {
  channelId: string;
  status: string;
  approvedCount: number;
  hasActiveContest: boolean;
};

export function ContestStartControl({
  channelId,
  status,
  approvedCount,
  hasActiveContest,
}: ContestStartControlProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const isOpen = status === "OPEN";
  const canStart = isOpen && !hasActiveContest && approvedCount > 0 && !pending;

  async function startLeaderboard() {
    if (pending) return;
    setError("");
    setInfo("");
    setPending(true);

    try {
      const response = await fetch(`/api/channels/${channelId}/contests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "LEADERBOARD" }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Unable to start a contest.");
        return;
      }

      setInfo("Contest started — voting is open.");
      router.refresh();
    } catch {
      setError("Unable to start a contest.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={!canStart}
        onClick={() => void startLeaderboard()}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        Start leaderboard contest
      </Button>

      {hasActiveContest && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          A contest is already running. Finalize it before starting another.
        </p>
      )}

      {!hasActiveContest && !isOpen && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Contests can only start while the room is open.
        </p>
      )}

      {!hasActiveContest && isOpen && approvedCount === 0 && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Approve at least one track before starting a contest.
        </p>
      )}

      {info && (
        <p className="mt-3 text-sm text-lime">{info}</p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
