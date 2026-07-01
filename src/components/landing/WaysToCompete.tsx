import { Check, ListOrdered, Swords } from "lucide-react";

import { SectionHeading } from "@/components/landing/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { modes } from "@/lib/landing";

const icons = [ListOrdered, Swords] as const;

export function WaysToCompete() {
  return (
    <section id="modes" className="section-space border-y border-border bg-elevated/40">
      <div className="section-shell">
        <Reveal>
          <SectionHeading
            kicker="Two ways to run it"
            title={
              <>
                Pick the <span className="text-gradient">format</span>
              </>
            }
            description="Each room can run as many contests as you like — a ranked leaderboard, a knockout battle, or both."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {modes.map((mode, index) => {
            const Icon = icons[index];
            return (
              <Reveal key={mode.name} delay={index * 0.1}>
                <article className="h-full rounded-xl border border-border bg-elevated p-6 sm:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-primary-glow">
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{mode.name}</h3>
                      <p className="text-sm text-muted-foreground">{mode.tagline}</p>
                    </div>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {mode.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-3 text-sm leading-6 text-muted-foreground"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-lime" aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
