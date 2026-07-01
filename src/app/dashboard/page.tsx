import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown, Plus, Radio, Users } from "lucide-react";

import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { CopyButton } from "@/components/channels/CopyButton";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Host dashboard",
  description: "Manage your Cypher channels.",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const displayName = user.displayName ?? user.username;
  const channels = await prisma.channel.findMany({
    where: { hostId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          members: true,
          submissions: true,
        },
      },
    },
  });

  const trackCount = channels.reduce(
    (total, channel) => total + channel._count.submissions,
    0,
  );
  const memberCount = channels.reduce(
    (total, channel) => total + channel._count.members,
    0,
  );

  return (
    <div className="section-shell py-8 sm:py-12">
      <section className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="section-kicker">Dashboard online</p>
          <h1 className="display-text mt-4 text-[clamp(3.25rem,8vw,6rem)] leading-[0.9] text-foreground">
            Welcome, <span className="text-gradient">{displayName}</span>
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
            Create rooms, share the code, and watch the member list fill.
          </p>
        </div>
        <Link
          href="/dashboard/channels/new"
          className={buttonVariants({ variant: "gradient", size: "lg" })}
        >
          <Plus />
          Create a channel
        </Link>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Channels", value: channels.length },
          { label: "Tracks", value: trackCount },
          { label: "Members", value: memberCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-elevated p-5"
          >
            <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              {stat.label}
            </p>
            <p className="display-text mt-3 text-4xl text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      {channels.length === 0 ? (
        <section className="gradient-border noise-panel mt-6 flex min-h-[22rem] flex-col items-center justify-center rounded-xl border border-transparent p-6 text-center shadow-panel sm:p-10">
          <span className="flex size-16 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary-glow shadow-glow-primary">
            <Crown className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-6 font-mono text-[0.6875rem] font-bold tracking-[0.18em] text-magenta uppercase">
            The stage is empty
          </p>
          <h2 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
            No channels yet — create your first room
          </h2>
          <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
            You will get a six-character code to share with artists and guests.
          </p>
          <Link
            href="/dashboard/channels/new"
            className={`${buttonVariants({ variant: "gradient", size: "lg" })} mt-7`}
          >
            <Plus />
            Create a channel
          </Link>

          <div className="mt-9 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
            {[
              { n: "1", t: "Create a room", d: "Name it and get a code to share." },
              { n: "2", t: "Collect tracks", d: "Artists join and submit; you approve them." },
              { n: "3", t: "Run a contest", d: "Open a leaderboard or battle — the crowd votes." },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-lg border border-border bg-background/50 p-4 text-left"
              >
                <span className="font-mono text-[0.625rem] font-bold tracking-[0.14em] text-primary-glow uppercase">
                  Step {step.n}
                </span>
                <p className="mt-2 font-bold text-foreground">{step.t}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.d}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-8" aria-labelledby="your-channels">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="section-kicker">Control rooms</p>
              <h2 id="your-channels" className="mt-3 text-2xl font-bold text-foreground">
                Your channels
              </h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {channels.map((channel) => (
              <article
                key={channel.id}
                className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold tracking-[0.14em] text-cyan uppercase">
                      {channel.genre ?? "Open format"}
                    </p>
                    <h3 className="mt-2 text-2xl font-bold text-foreground">
                      {channel.name}
                    </h3>
                  </div>
                  <ChannelStatusBadge status={channel.status} />
                </div>

                <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-[0.625rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                      Join code
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                      {channel.code}
                    </p>
                  </div>
                  <CopyButton value={channel.code} label="Copy code" />
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex min-h-11 items-center gap-2">
                    <Users className="size-4 text-primary-glow" />
                    {channel._count.members}{" "}
                    {channel._count.members === 1 ? "member" : "members"}
                  </span>
                  <span className="inline-flex min-h-11 items-center gap-2">
                    <Radio className="size-4 text-magenta" />
                    /c/{channel.code}
                  </span>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={`/dashboard/channels/${channel.id}`}
                    className={buttonVariants({ variant: "gradient", size: "default" })}
                  >
                    Manage
                    <ArrowRight />
                  </Link>
                  <Link
                    href={`/c/${channel.code}`}
                    className={buttonVariants({ variant: "outline", size: "default" })}
                  >
                    View room
                  </Link>
                  <CopyButton
                    value={`/c/${channel.code}`}
                    label="Share link"
                    className="sm:ml-auto"
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
