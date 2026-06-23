"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type CodeTyperProps = {
  className?: string;
  code?: string;
};

export function CodeTyper({ className, code = "7K2P9X" }: CodeTyperProps) {
  const reduceMotion = useReducedMotion();
  const [visibleCount, setVisibleCount] = useState(reduceMotion ? code.length : 0);

  useEffect(() => {
    if (reduceMotion) {
      setVisibleCount(code.length);
      return;
    }

    const interval = window.setInterval(() => {
      setVisibleCount((current) => (current >= code.length ? 0 : current + 1));
    }, 420);

    return () => window.clearInterval(interval);
  }, [code.length, reduceMotion]);

  return (
    <span
      className={cn(
        "inline-flex min-h-12 min-w-[10rem] items-center justify-center rounded-md border border-border bg-background px-4 font-mono text-xl font-bold tracking-[0.3em] text-foreground shadow-panel",
        className,
      )}
      aria-label={`Demo join code ${code}`}
    >
      {code.slice(0, visibleCount)}
      <span
        className={cn(
          "ml-1 inline-block h-6 w-0.5 bg-cyan",
          !reduceMotion && "animate-pulse-soft",
        )}
        aria-hidden="true"
      />
    </span>
  );
}
