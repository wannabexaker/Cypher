"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Crown, Radio, Trophy } from "lucide-react";

import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { bracket } from "@/lib/mock";
import { cn } from "@/lib/utils";

type Slot = {
  artist: string;
  seed: string;
  score: number;
  winner: boolean;
};

function BracketSlot({ slot, final = false }: { slot: Slot; final?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex min-h-14 items-center gap-3 rounded-md border bg-background px-3",
        slot.winner
          ? final
            ? "border-gold/60 shadow-[0_0_1.5rem_color-mix(in_srgb,var(--gold)_22%,transparent)]"
            : "border-primary/60 shadow-glow-primary"
          : "border-border",
      )}
    >
      <span className="font-mono text-[0.6875rem] text-muted-foreground">{slot.seed}</span>
      <span className="flex-1 font-bold text-foreground">{slot.artist}</span>
      <span
        className={cn(
          "display-text text-xl",
          slot.winner ? (final ? "text-gold" : "text-primary-glow") : "text-muted-foreground",
        )}
      >
        {slot.score}
      </span>
    </div>
  );
}

function Matchup({ slots, final = false }: { slots: readonly Slot[]; final?: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-elevated p-2">
      {slots.map((slot) => (
        <BracketSlot key={slot.artist} slot={slot} final={final} />
      ))}
    </div>
  );
}

export function BattleTeaser() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="battles" className="section-space overflow-hidden">
      <div className="section-shell">
        <Reveal>
          <SectionHeading
            kicker="Survive the bracket"
            title={
              <>
                Every round gets{" "}
                <span className="text-gradient">louder</span>
              </>
            }
            description="Votes seed the battle. Winners advance head-to-head until one name owns the room."
          />
        </Reveal>

        <Reveal delay={0.12} className="mt-12">
          <div className="gradient-border noise-panel overflow-x-auto rounded-xl border border-transparent p-4 shadow-panel sm:p-8">
            <div className="relative min-w-[44rem]">
              <div className="mb-6 grid grid-cols-[1fr_4rem_1fr_4rem_0.72fr] items-center gap-4 font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                <span>Semifinals</span>
                <span />
                <span>Final</span>
                <span />
                <span>Champion</span>
              </div>

              <div className="grid grid-cols-[1fr_4rem_1fr_4rem_0.72fr] items-center gap-4">
                <div className="space-y-12">
                  <Matchup slots={bracket.semiFinals.slice(0, 2)} />
                  <Matchup slots={bracket.semiFinals.slice(2, 4)} />
                </div>

                <div className="space-y-28" aria-hidden="true">
                  {[0, 1].map((line) => (
                    <motion.div
                      key={line}
                      className="h-0.5 origin-left bg-[image:var(--gradient-signature)] shadow-glow-primary"
                      initial={reduceMotion ? false : { scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.7, delay: 0.25 + line * 0.14 }}
                    />
                  ))}
                </div>

                <Matchup slots={bracket.final} final />

                <motion.div
                  className="h-0.5 origin-left bg-gold shadow-[0_0_1.5rem_color-mix(in_srgb,var(--gold)_45%,transparent)]"
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: 0.58 }}
                  aria-hidden="true"
                />

                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: 0.72 }}
                  className="relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl border border-gold/50 bg-gold/10 p-5 text-center shadow-[0_0_2.5rem_color-mix(in_srgb,var(--gold)_24%,transparent)]"
                >
                  <Crown className="size-10 text-gold" aria-hidden="true" />
                  <span className="mt-3 font-mono text-[0.6875rem] font-bold tracking-[0.18em] text-gold uppercase">
                    Champion
                  </span>
                  <strong className="display-text mt-1 text-4xl text-foreground">KNOX</strong>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Trophy className="size-3.5 text-gold" aria-hidden="true" />
                    82% crowd vote
                  </span>
                  <div className="absolute -bottom-10 size-28 rounded-full bg-gold/15" />
                </motion.div>
              </div>

              <div className="mt-8 flex items-center gap-2 border-t border-border pt-5 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-cyan uppercase">
                <Radio className="size-4" aria-hidden="true" />
                Winning path illuminated live
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
