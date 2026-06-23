"use client";

import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MarqueeProps = {
  children: ReactNode;
  className?: string;
};

export function Marquee({ children, className }: MarqueeProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("mask-fade-x overflow-hidden", className)}>
      <div
        className={cn(
          "flex w-max items-center",
          reduceMotion ? "translate-x-0" : "animate-marquee",
        )}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        {!reduceMotion && (
          <div className="flex shrink-0 items-center" aria-hidden="true">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
