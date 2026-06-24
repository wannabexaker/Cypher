import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Music2,
  Radio,
  Users,
} from "lucide-react";

import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { ChannelStatusControl } from "@/components/channels/ChannelStatusControl";
import { CopyButton } from "@/components/channels/CopyButton";
import { ManageChannelForm } from "@/components/channels/ManageChannelForm";
import { buttonVariants } from "@/components/ui/button";
import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Manage channel",
  description: "Manage room settings, status, and members.",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManageChannelPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;
  const channel = await prisma.channel.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      tagline: true,
      description: true,
      rules: true,
      genre: true,
      visibility: true,
      allowGuestUploads: true,
      status: true,
      hostId: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          displayName: true,
          role: true,
          createdAt: true,
        },
      },
    },
  });

  if (!channel || !canManageChannel(user, channel)) notFound();

  return (
    <div className="section-shell py-8 sm:py-12">
      <Link
        href="/dashboard"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft />
        Dashboard
      </Link>

      <section className="mt-6 flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="section-kicker">Room control</p>
            <ChannelStatusBadge status={channel.status} />
          </div>
          <h1 className="display-text mt-4 text-[clamp(3.25rem,8vw,6rem)] leading-[0.9] text-foreground">
            {channel.name}
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            {channel.tagline ?? "Set the signal, share the code, fill the room."}
          </p>
        </div>
        <ChannelStatusControl channelId={channel.id} status={channel.status} />
      </section>

      <section className="gradient-border noise-panel mt-8 rounded-xl border border-transparent p-5 shadow-panel sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-magenta uppercase">
              Join code
            </p>
            <p className="mt-3 font-mono text-[clamp(2.5rem,10vw,5rem)] font-bold leading-none tracking-[0.16em] text-foreground">
              {channel.code}
            </p>
            <p className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <Radio className="size-4 text-cyan" />
              /c/{channel.code}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <CopyButton value={channel.code} label="Copy code" />
            <CopyButton value={`/c/${channel.code}`} label="Copy share link" />
            <Link
              href={`/c/${channel.code}`}
              className={buttonVariants({ variant: "gradient", size: "sm" })}
            >
              Open room
              <ExternalLink />
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
            <div className="flex items-center gap-3">
              <Radio className="size-5 text-primary-glow" />
              <h2 className="text-2xl font-bold text-foreground">Room settings</h2>
            </div>
            <div className="mt-6">
              <ManageChannelForm
                channelId={channel.id}
                values={{
                  name: channel.name,
                  tagline: channel.tagline,
                  description: channel.description,
                  rules: channel.rules,
                  genre: channel.genre,
                  visibility: channel.visibility,
                  allowGuestUploads: channel.allowGuestUploads,
                }}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-cyan" />
                <h2 className="text-2xl font-bold text-foreground">Members</h2>
              </div>
              <span className="font-mono text-sm text-muted-foreground">
                {channel.members.length}
              </span>
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-border">
              <ul className="divide-y divide-border">
                {channel.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-col gap-3 bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-bold text-foreground">
                        {member.displayName}
                      </p>
                      <p className="mt-1 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-primary-glow uppercase">
                        {member.role}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      Joined{" "}
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                      }).format(member.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-border bg-surface p-6">
          <span className="flex size-12 items-center justify-center rounded-full border border-magenta/30 bg-magenta/10 text-magenta">
            <Music2 aria-hidden="true" />
          </span>
          <p className="mt-5 font-mono text-xs font-bold tracking-[0.16em] text-magenta uppercase">
            Tracks
          </p>
          <h2 className="mt-2 text-xl font-bold text-foreground">
            Uploads arrive in H04
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Membership is live. Submission, media, and moderation tools remain
            intentionally out of scope here.
          </p>
        </aside>
      </div>
    </div>
  );
}
