import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuroraBackground } from "@/components/motion/AuroraBackground";
import { WaveformBars } from "@/components/motion/WaveformBars";

type AuthShellProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <main
      id="main-content"
      className="relative isolate min-h-svh overflow-hidden"
    >
      <AuroraBackground />
      <div className="section-shell relative z-10 flex min-h-svh flex-col py-5 sm:py-8">
        <header className="flex min-h-12 items-center justify-between gap-4">
          <Link
            href="/"
            className="display-text inline-flex min-h-11 items-center text-2xl tracking-[0.04em]"
            aria-label="Cypher home"
          >
            CYPHER<span className="text-magenta">.</span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the crowd
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:py-16">
          <section className="max-w-2xl">
            <p className="section-kicker">{eyebrow}</p>
            <h1 className="display-text mt-5 text-[clamp(4rem,11vw,8.5rem)] leading-[0.82] text-foreground">
              {title}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              {description}
            </p>
            <div className="mt-8 hidden max-w-sm rounded-lg border border-border bg-elevated/70 px-5 py-4 lg:block">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-cyan/30 bg-cyan/10 text-cyan">
                  <ShieldCheck aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Host accounts only
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Channel tools unlock after you sign in.
                  </p>
                </div>
              </div>
              <WaveformBars compact className="mt-4 justify-start" />
            </div>
          </section>

          <section className="gradient-border noise-panel rounded-xl border border-transparent p-5 shadow-panel sm:p-8">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
