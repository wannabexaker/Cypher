"use client";

import { Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type RoomBannerProps = {
  // ISO timestamp of the armed voting deadline; null => no timer (renders nothing).
  closesAt: string | null;
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

export function RoomBanner({ closesAt, className }: RoomBannerProps) {
  // `mounted` gates anything derived from `Date.now()` so SSR HTML and the
  // client's first paint match (otherwise the countdown text differs by ~1s
  // and React rehydrates the whole banner).
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Dismissal is keyed by state so a flip from open -> closed re-surfaces the
  // banner even after the open one was dismissed.
  const [dismissed, setDismissed] = useState<"open" | "closed" | null>(null);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!closesAt) return null;

  const target = new Date(closesAt).getTime();
  if (Number.isNaN(target)) return null;

  const remaining = target - now;
  // Before mount we don't know the real remaining time, so assume "open" to
  // keep the server-rendered tree stable. The real state lands on first tick.
  const closed = mounted && remaining <= 0;
  const state: "open" | "closed" = closed ? "closed" : "open";
  if (mounted && dismissed === state) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium",
        closed
          ? "border-magenta/40 bg-magenta/10 text-magenta"
          : "border-cyan/40 bg-cyan/10 text-cyan",
        className,
      )}
    >
      <Megaphone className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1" suppressHydrationWarning>
        {closed ? (
          "Voting has closed for this room."
        ) : (
          <>
            Voting is open — closes in{" "}
            <span className="font-mono tabular-nums">
              {mounted ? formatRemaining(remaining) : "--:--"}
            </span>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(state)}
        aria-label="Dismiss notification"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none motion-reduce:transition-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
