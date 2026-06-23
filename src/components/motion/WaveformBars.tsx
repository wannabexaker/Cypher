"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const bars = [22, 48, 68, 34, 82, 54, 94, 44, 74, 38, 88, 58, 30, 64, 46];

type WaveformBarsProps = {
  className?: string;
  compact?: boolean;
};

export function WaveformBars({ className, compact = false }: WaveformBarsProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1",
        compact ? "h-8" : "h-24 sm:h-28",
        className,
      )}
      aria-hidden="true"
    >
      {bars.map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          className={cn(
            "block rounded-full bg-[image:var(--gradient-signature)] shadow-glow-primary",
            compact ? "w-0.5" : "w-1 sm:w-1.5",
          )}
          style={{ height: `${height}%` }}
          animate={
            reduceMotion
              ? undefined
              : {
                  scaleY: [0.32, 1, 0.46, 0.86, 0.32],
                  opacity: [0.5, 1, 0.68, 0.9, 0.5],
                }
          }
          transition={{
            duration: 1.8,
            delay: index * 0.055,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
