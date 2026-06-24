import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmissionStatus } from "@prisma/client";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  ListChecks,
  Music2,
  Radio,
  Users,
} from "lucide-react";

import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { ChannelStatusControl } from "@/components/channels/ChannelStatusControl";
import { CopyButton } from "@/components/channels/CopyButton";
import { ManageChannelForm } from "@/components/channels/ManageChannelForm";
import { MemberRoleControl } from "@/components/channels/MemberRoleControl";
import { ModerationQueue } from "@/components/submissions/ModerationQueue";
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
          participation: true,
          createdAt: true,
        },
      },
    },
  });

  if (!channel || !canManageChannel(user, channel)) notFound();

  const [pendingSubmissions, approvedCount, rejectedCount] = await Promise.all([
    prisma.submission.findMany({
      where: { channelId: channel.id, status: SubmissionStatus.PENDING },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        artistName: true,
        trackTitle: true,
        description: true,
        sourceType: true,
        mediaAssetId: true,
        externalUrl: true,
        createdAt: true,
        submitterMember: { select: { displayName: true } },
      },
    }),
    prisma.submission.count({
      where: { channelId: channel.id, status: SubmissionStatus.APPROVED },
    }),
    prisma.submission.count({
      where: { channelId: channel.id, status: SubmissionStatus.REJECTED },
    }),
  ]);

  const moderationQueue = pendingSubmissions.map((submission) => ({
    id: submission.id,
    artistName: submission.artistName,
    trackTitle: submission.trackTitle,
    description: submission.description,
    sourceType: submission.sourceType,
    mediaAssetId: submission.mediaAssetId,
    externalUrl: submission.externalUrl,
    submitterName: submission.submitterMember.displayName,
    createdAt: submission.createdAt.toISOString(),
  }));

  const memberGroups = [
    {
      key: "HOST",
      label: "Host",
      accent: "text-magenta",
      members: channel.members.filter((member) => member.role === "HOST"),
    },
    {
      key: "ARTIST",
      label: "Artists",
      accent: "text-lime",
      members: channel.members.filter(
        (member) => member.role !== "HOST" && member.participation === "ARTIST",
      ),
    },
    {
      key: "JUDGE",
      label: "Judges",
      accent: "text-cyan",
      members: channel.members.filter(
        (member) => member.role !== "HOST" && member.participation === "JUDGE",
      ),
    },
    {
      key: "UNASSIGNED",
      label: "Unassigned",
      accent: "text-muted-foreground",
      members: channel.members.filter(
        (member) => member.role !== "HOST" && member.participation === null,
      ),
    },
  ].filter((group) => group.members.length > 0);

  const artistCount = channel.members.filter(
    (member) => member.role !== "HOST" && member.participation === "ARTIST",
  ).length;
  const judgeCount = channel.members.filter(
    (member) => member.role !== "HOST" && member.participation === "JUDGE",
  ).length;

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
              <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                <span className="text-lime">{artistCount} artists</span>
                <span aria-hidden="true">·</span>
                <span className="text-cyan">{judgeCount} judges</span>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {memberGroups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className={`font-mono text-[0.6875rem] font-bold tracking-[0.16em] uppercase ${group.accent}`}
                    >
                      {group.label}
                    </p>
                    <span className="font-mono text-xs text-muted-foreground">
                      {group.members.length}
                    </span>
                  </div>
                  <ul className="mt-3 overflow-hidden rounded-lg border border-border divide-y divide-border">
                    {group.members.map((member) => (
                      <li
                        key={member.id}
                        className="flex flex-col gap-3 bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-foreground">
                              {member.displayName}
                            </p>
                            {member.role === "MODERATOR" && (
                              <span className="inline-flex items-center rounded-full border border-primary-glow/40 bg-primary/10 px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.12em] text-primary-glow uppercase">
                                Mod
                              </span>
                            )}
                          </div>
                          <span className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <CalendarClock className="size-3.5" />
                            Joined{" "}
                            {new Intl.DateTimeFormat("en", {
                              dateStyle: "medium",
                            }).format(member.createdAt)}
                          </span>
                        </div>
                        {member.role !== "HOST" && (
                          <MemberRoleControl
                            channelId={channel.id}
                            memberId={member.id}
                            role={member.role}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ListChecks className="size-5 text-lime" />
                <h2 className="text-2xl font-bold text-foreground">
                  Pending review
                </h2>
              </div>
              <span className="font-mono text-sm text-muted-foreground">
                {moderationQueue.length}
              </span>
            </div>

            <div className="mt-6">
              <ModerationQueue submissions={moderationQueue} />
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
            Submission status
          </h2>
          <dl className="mt-5 grid gap-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <dt className="text-sm text-muted-foreground">Pending</dt>
              <dd className="font-mono font-bold text-foreground">
                {moderationQueue.length}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <dt className="text-sm text-muted-foreground">Approved</dt>
              <dd className="font-mono font-bold text-lime">{approvedCount}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <dt className="text-sm text-muted-foreground">Rejected</dt>
              <dd className="font-mono font-bold text-magenta">
                {rejectedCount}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
