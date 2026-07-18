import type { ReactNode } from "react";

import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";

type LegalShellProps = {
  user: { username: string } | null;
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
};

export function LegalShell({ user, title, updated, intro, children }: LegalShellProps) {
  return (
    <>
      <Navbar user={user} />
      <main id="main-content" className="section-shell py-14 sm:py-20">
        <p className="section-kicker">Legal</p>
        <h1 className="display-text mt-4 text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] text-foreground">
          {title}
        </h1>
        <p className="mt-4 font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          Last updated: {updated}
        </p>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{intro}</p>
        <div className="mt-12 max-w-3xl">{children}</div>
      </main>
      <Footer />
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-border pt-8 first:mt-0 first:border-0 first:pt-0">
      <h2 className="text-2xl font-bold text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-primary-glow">{children}</ul>;
}
