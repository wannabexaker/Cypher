"use client";

import { ArrowRight, Mic2, Radio } from "lucide-react";

import { MagneticButton } from "@/components/motion/MagneticButton";
import { Reveal } from "@/components/motion/Reveal";
import { WaveformBars } from "@/components/motion/WaveformBars";

type FinalCtaProps = {
  createChannelHref: string;
};

export function FinalCta({ createChannelHref }: FinalCtaProps) {
  return (
    <section id="start" className="section-space">
      <div className="section-shell">
        <Reveal>
          <div className="gradient-border noise-panel relative overflow-hidden rounded-xl border border-transparent px-5 py-14 text-center shadow-panel sm:px-10 sm:py-20">
            <div className="surface-grid absolute inset-0 opacity-20" aria-hidden="true" />
            <div className="relative z-10 mx-auto max-w-4xl">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary-glow shadow-glow-primary">
                <Mic2 aria-hidden="true" />
              </span>
              <p className="section-kicker mt-6 justify-center">Your room. Your rules.</p>
              <h2 className="display-text mt-4 text-[length:var(--type-cta)] leading-[0.88] text-foreground">
                Start your <span className="text-gradient">cypher</span>
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Create the code, call the artists, and give the crowd something worth
                deciding.
              </p>
              <WaveformBars compact className="mx-auto mt-8 max-w-xs" />
              <div className="mt-8 flex justify-center">
                <MagneticButton href={createChannelHref} size="xl">
                  Create a channel
                  <ArrowRight />
                </MagneticButton>
              </div>
              <p className="mt-5 inline-flex items-center gap-2 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                <Radio className="size-3.5 text-lime" aria-hidden="true" />
                Static preview — channel tools arrive in H03
              </p>
            </div>
            <div className="absolute -top-24 -left-24 size-72 rounded-full bg-primary/15 shadow-glow-primary" />
            <div className="absolute -right-24 -bottom-24 size-72 rounded-full bg-magenta/15 shadow-glow-magenta" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
