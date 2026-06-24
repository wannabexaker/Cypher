"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight, Radio, Sparkles, Users } from "lucide-react";

import { AuroraBackground } from "@/components/motion/AuroraBackground";
import { CodeTyper } from "@/components/motion/CodeTyper";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { WaveformBars } from "@/components/motion/WaveformBars";
import { buttonVariants } from "@/components/ui/button";
import { liveStats } from "@/lib/mock";

type HeroProps = {
  createChannelHref: string;
};

export function Hero({ createChannelHref }: HeroProps) {
  const reduceMotion = useReducedMotion();
  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
    visible: (delay: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: reduceMotion ? 0 : delay,
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    }),
  };

  return (
    <section
      id="top"
      className="relative isolate min-h-[calc(100svh-4.5rem)] overflow-hidden border-b border-border"
    >
      <AuroraBackground />
      <div className="section-shell relative z-10 flex min-h-[calc(100svh-4.5rem)] flex-col justify-center py-16 sm:py-20 lg:py-24">
        <div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <motion.div
              custom={0.05}
              variants={reveal}
              initial="hidden"
              animate="visible"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-elevated/80 px-4 font-mono text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-magenta motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-magenta" />
              </span>
              The room is live
              <Sparkles className="size-3.5 text-cyan" aria-hidden="true" />
            </motion.div>

            <h1 className="display-text mt-6 text-[length:var(--type-hero)] leading-[0.79] text-foreground">
              <motion.span
                className="block"
                custom={0.12}
                variants={reveal}
                initial="hidden"
                animate="visible"
              >
                Let the
              </motion.span>
              <motion.span
                className="text-gradient block motion-safe:animate-gradient"
                custom={0.2}
                variants={reveal}
                initial="hidden"
                animate="visible"
              >
                chat
              </motion.span>
              <motion.span
                className="block"
                custom={0.28}
                variants={reveal}
                initial="hidden"
                animate="visible"
              >
                decide
              </motion.span>
            </h1>

            <motion.div
              custom={0.36}
              variants={reveal}
              initial="hidden"
              animate="visible"
              className="mt-8 max-w-2xl"
            >
              <p className="text-lg leading-8 text-muted-foreground sm:text-xl">
                Drop your bars. The chat decides. Spin up a room, drop the code,
                and let every vote push the next name toward the crown.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <MagneticButton href={createChannelHref}>
                  Create a channel
                  <ArrowRight />
                </MagneticButton>
                <a
                  href="/join"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  <Radio />
                  Enter a code
                </a>
              </div>
            </motion.div>
          </div>

          <motion.aside
            id="join-demo"
            custom={0.44}
            variants={reveal}
            initial="hidden"
            animate="visible"
            className="gradient-border noise-panel relative rounded-xl border border-transparent p-5 shadow-panel sm:p-6"
            aria-labelledby="join-demo-title"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[0.6875rem] font-bold tracking-[0.18em] text-magenta uppercase">
                  Live room demo
                </p>
                <h2 id="join-demo-title" className="mt-1 text-lg font-bold">
                  Enter the frequency
                </h2>
              </div>
              <div className="flex size-11 items-center justify-center rounded-full border border-cyan/30 bg-cyan/10 text-cyan">
                <Radio aria-hidden="true" />
              </div>
            </div>
            <WaveformBars className="my-5" />
            <label className="block font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              Join code
              <CodeTyper className="mt-2 w-full" />
            </label>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5 text-primary-glow" aria-hidden="true" />
                384 listening
              </span>
              <span className="font-mono text-lime">ROUND 02</span>
            </div>
            <a
              href="/join"
              className={`${buttonVariants({ variant: "gradient", size: "sm" })} mt-5 w-full`}
            >
              Enter a room
              <ArrowRight />
            </a>
          </motion.aside>
        </div>

        <motion.div
          custom={0.52}
          variants={reveal}
          initial="hidden"
          animate="visible"
          className="mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:mt-16"
        >
          {liveStats.map((stat, index) => (
            <div
              key={stat.label}
              className="flex min-h-20 items-center gap-4 bg-elevated px-5 py-4"
            >
              <span className="display-text text-3xl text-foreground">{stat.value}</span>
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              {index === 0 && (
                <span className="ml-auto size-2 rounded-full bg-lime shadow-glow-cyan motion-safe:animate-pulse-soft" />
              )}
            </div>
          ))}
        </motion.div>

        <a
          href="#how-it-works"
          className="mt-8 inline-flex min-h-11 w-fit items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          See how it works
          <ArrowDown className="size-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
