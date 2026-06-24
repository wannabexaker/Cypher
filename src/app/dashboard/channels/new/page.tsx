import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";

import { CreateChannelForm } from "@/components/channels/CreateChannelForm";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Create channel",
  description: "Create a new Cypher room and generate its join code.",
};

export default function NewChannelPage() {
  return (
    <div className="section-shell py-8 sm:py-12">
      <Link
        href="/dashboard"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft />
        Dashboard
      </Link>

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <p className="section-kicker">New frequency</p>
          <h1 className="display-text mt-4 text-[clamp(3.25rem,8vw,6rem)] leading-[0.9] text-foreground">
            Create a <span className="text-gradient">channel</span>
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Define the room. Cypher generates the shareable code when you submit.
          </p>

          <div className="mt-8 rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
            <CreateChannelForm />
          </div>
        </section>

        <aside className="h-fit rounded-xl border border-primary/30 bg-primary/10 p-6">
          <Radio className="size-7 text-primary-glow" aria-hidden="true" />
          <h2 className="mt-5 text-xl font-bold text-foreground">
            Starts in draft
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The room is created as DRAFT. Open it from the management screen when
            the settings are ready.
          </p>
        </aside>
      </div>
    </div>
  );
}

