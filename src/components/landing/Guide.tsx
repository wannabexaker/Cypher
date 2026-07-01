import { Check, Mic2, Users } from "lucide-react";

import { SectionHeading } from "@/components/landing/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { guide } from "@/lib/landing";

const icons = [Mic2, Users] as const;

export function Guide() {
  return (
    <section id="guide" className="section-space">
      <div className="section-shell">
        <Reveal>
          <SectionHeading
            kicker="Who does what"
            title={
              <>
                Simple for <span className="text-gradient">everyone</span>
              </>
            }
            description="Hosts run the room. The crowd shows up with a code — no account required to join and vote."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {guide.map((group, index) => {
            const Icon = icons[index];
            return (
              <Reveal key={group.role} delay={index * 0.1}>
                <article className="h-full rounded-xl border border-border bg-elevated p-6 sm:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-cyan">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3 className="text-xl font-bold text-foreground">{group.role}</h3>
                  </div>
                  <ol className="mt-6 space-y-3">
                    {group.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-3 text-sm leading-6 text-muted-foreground"
                      >
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-primary-glow"
                          aria-hidden="true"
                        />
                        {point}
                      </li>
                    ))}
                  </ol>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
