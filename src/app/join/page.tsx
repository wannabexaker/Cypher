import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";

import { JoinCodeForm } from "@/components/channels/JoinCodeForm";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Enter a room code",
  description: "Join a Cypher channel with its six-character code.",
};

export default function JoinPage() {
  return (
    <main id="main-content" className="surface-grid min-h-svh bg-background">
      <div className="section-shell flex min-h-svh items-center py-12">
        <section className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-elevated/95 p-5 shadow-panel sm:p-10">
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft />
            Home
          </Link>
          <span className="mt-8 flex size-14 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary-glow shadow-glow-primary">
            <Radio aria-hidden="true" />
          </span>
          <p className="section-kicker mt-6">Tune into the room</p>
          <h1 className="display-text mt-4 text-[clamp(3.5rem,12vw,6.5rem)] leading-[0.86] text-foreground">
            Enter the <span className="text-gradient">code</span>
          </h1>
          <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
            Get the six-character code from the host. Public and unlisted rooms
            both resolve here.
          </p>
          <JoinCodeForm />
        </section>
      </div>
    </main>
  );
}

