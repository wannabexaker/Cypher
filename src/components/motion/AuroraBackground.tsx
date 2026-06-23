"use client";

import { motion, useReducedMotion } from "framer-motion";

export function AuroraBackground() {
  const reduceMotion = useReducedMotion();

  const drift = reduceMotion
    ? undefined
    : {
        x: [0, 36, -24, 0],
        y: [0, -28, 18, 0],
        scale: [1, 1.08, 0.96, 1],
      };

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="surface-grid absolute inset-0 opacity-25" />
      <motion.div
        className="absolute -top-40 left-[-14rem] size-[34rem] rounded-full bg-primary/25 shadow-glow-primary"
        animate={drift}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-18rem] top-24 size-[38rem] rounded-full bg-magenta/20 shadow-glow-magenta"
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, -44, 20, 0],
                y: [0, 24, -20, 0],
                scale: [1, 0.92, 1.05, 1],
              }
        }
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-20rem] left-1/3 size-[36rem] rounded-full bg-cyan/15 shadow-glow-cyan"
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, 40, -16, 0],
                y: [0, -20, 28, 0],
                scale: [1, 1.08, 0.95, 1],
              }
        }
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,var(--bg-base)_78%)]" />
    </div>
  );
}
