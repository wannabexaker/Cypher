import { ChannelStatus } from "@prisma/client";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Crown, Radio, Users } from "lucide-react";

import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { CopyButton } from "@/components/channels/CopyButton";
import { JoinRoomPanel } from "@/components/channels/JoinRoomPanel";
import { buttonVariants } from "@/components/ui/button";
import {
  GUEST_COOKIE_NAME,
  readGuestToken,
} from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { channelCodeSchema } from "@/lib/validation/channels";

export const metadata: Metadata = {
  title: "Channel room",
  description: "Enter a Cypher room and join the member list.",
};

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function ChannelRoomPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) notFound();
  if (rawCode !== parsedCode.data) redirect(`/c/${parsedCode.data}`);

  const [user, cookieStore] = await Promise.all([
    getCurrentUser(),
    cookies(),
  ]);
  const guestToken = readGuestToken(
    cookieStore.get(GUEST_COOKIE_NAME)?.value,
  );

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    include: {
      host: {
        select: {
          username: true,
          displayName: true,
        },
      },
      _count: {
        select: { members: true },
      },
    },
  });

  if (!channel) notFound();

  const membership = user
    ? await prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId: channel.id,
            userId: user.id,
          },
        },
        select: { id: true },
      })
    : guestToken
      ? await prisma.channelMember.findUnique({
          where: {
            channelId_guestToken: {
              channelId: channel.id,
              guestToken,
            },
          },
          select: { id: true },
        })
      : null;

  return (
    <main id="main-content" className="min-h-svh bg-background">
      <header className="border-b border-border bg-background/90">
        <nav className="section-shell flex min-h-18 items-center justify-between gap-4">
          <Link
            href="/"
            className="display-text inline-flex min-h-11 items-center text-2xl tracking-[0.04em]"
          >
            CYPHER<span className="text-magenta">.</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/join"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Enter another code
            </Link>
            {user && (
              <Link
                href="/dashboard"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Dashboard
              </Link>
            )}
          </div>
        </nav>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="absolute top-0 left-1/3 size-80 rounded-full bg-primary/15 shadow-glow-primary" />
        <div className="section-shell relative py-14 sm:py-20">
          <div className="flex flex-wrap items-center gap-3">
            <ChannelStatusBadge status={channel.status} />
            <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-elevated px-3 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-cyan uppercase">
              <Users className="size-3.5" />
              {channel._count.members}{" "}
              {channel._count.members === 1 ? "member" : "members"}
            </span>
          </div>
          <p className="section-kicker mt-8">
            Hosted by {channel.host.displayName ?? channel.host.username}
          </p>
          <h1 className="display-text mt-4 max-w-5xl text-[clamp(4rem,13vw,9rem)] leading-[0.82] text-foreground">
            {channel.name}
          </h1>
          {channel.tagline && (
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              {channel.tagline}
            </p>
          )}

          <div className="mt-8 inline-flex flex-col gap-3 rounded-xl border border-border bg-elevated/90 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono text-[0.625rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                Room code
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                {channel.code}
              </p>
            </div>
            <CopyButton value={channel.code} label="Copy code" className="sm:ml-4" />
          </div>
        </div>
      </section>

      <div className="section-shell grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:py-14">
        <div>
          <p className="section-kicker">Inside the channel</p>
          <h2 className="mt-4 text-3xl font-bold text-foreground">
            Room briefing
          </h2>

          <div className="mt-6 grid gap-5">
            <section className="rounded-xl border border-border bg-elevated p-6">
              <h3 className="text-lg font-bold text-foreground">About</h3>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-muted-foreground">
                {channel.description ?? "The host has not added a description yet."}
              </p>
            </section>
            <section className="rounded-xl border border-border bg-elevated p-6">
              <h3 className="text-lg font-bold text-foreground">House rules</h3>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-muted-foreground">
                {channel.rules ?? "The host has not posted room rules yet."}
              </p>
            </section>
            <section className="rounded-xl border border-primary/30 bg-primary/10 p-6">
              <Crown className="size-7 text-primary-glow" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-bold text-foreground">
                The next drop
              </h3>
              <p className="mt-3 leading-7 text-muted-foreground">
                Track submissions and host moderation arrive in H04.
              </p>
            </section>
          </div>
        </div>

        <aside>
          <div className="mb-4 flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-magenta uppercase">
            <Radio className="size-4" />
            Join state
          </div>
          <JoinRoomPanel
            code={channel.code}
            joined={Boolean(membership)}
            authenticated={Boolean(user)}
            allowGuestUploads={channel.allowGuestUploads}
            completed={channel.status === ChannelStatus.COMPLETED}
          />
        </aside>
      </div>
    </main>
  );
}
