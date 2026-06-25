"use client";

import { Timer, TimerOff } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type VotingCountdownProps = {
  // ISO timestamp of the armed deadline; null/undefined => no timer (renders nothing).
  closesAt: string | null | undefined;
  className?: string;
};

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function VotingCountdown({ closesAt, className }: VotingCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!closesAt) return null;

  const target = new Date(closesAt).getTime();
  if (Number.isNaN(target)) return null;

  const remaining = target - now;
  const closed = remaining <= 0;

  return (
    <div
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-mono text-xs font-bold tracking-[0.12em] uppercase",
        closed
          ? "border-magenta/40 bg-magenta/10 text-magenta"
          : "border-cyan/40 bg-cyan/10 text-cyan",
        className,
      )}
    >
      {closed ? (
        <TimerOff className="size-3.5" aria-hidden="true" />
      ) : (
        <Timer className="size-3.5" aria-hidden="true" />
      )}
      {closed ? (
        <span aria-live="polite">Voting closed</span>
      ) : (
        <>
          <span className="text-muted-foreground">Closes in</span>
          <span
            aria-live="polite"
            suppressHydrationWarning
            className="tabular-nums"
          >
            {formatRemaining(remaining)}
          </span>
        </>
      )}
    </div>
  );
}
