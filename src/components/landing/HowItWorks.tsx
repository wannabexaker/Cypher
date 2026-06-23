import { ArrowRight, Crown, RadioTower, Share2 } from "lucide-react";

import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { steps } from "@/lib/mock";

const icons = [RadioTower, Share2, Crown] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-space relative">
      <div className="section-shell">
        <Reveal>
          <SectionHeading
            kicker="Three moves. One crown."
            title={
              <>
                From room code to{" "}
                <span className="text-gradient">champion</span>
              </>
            }
            description="No complicated setup. Start the channel, invite the scene, and let the energy build round by round."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = icons[index];
            return (
              <Reveal key={step.number} delay={index * 0.1}>
                <article className="group relative h-full overflow-hidden rounded-xl border border-border bg-elevated p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-glow-primary sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="display-text text-5xl text-border transition-colors group-hover:text-primary/50">
                      {step.number}
                    </span>
                    <span className="flex size-12 items-center justify-center rounded-lg border border-border bg-surface text-primary-glow">
                      <Icon aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-12 text-xl font-bold text-foreground">{step.title}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">
                    {step.description}
                  </p>
                  <div className="mt-8 flex items-center gap-2 font-mono text-xs font-bold tracking-[0.12em] text-cyan uppercase">
                    Step {step.number}
                    {index < steps.length - 1 && <ArrowRight aria-hidden="true" />}
                  </div>
                  <div className="absolute -right-10 -bottom-10 size-32 rounded-full bg-primary/10 transition-transform duration-500 group-hover:scale-150" />
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
