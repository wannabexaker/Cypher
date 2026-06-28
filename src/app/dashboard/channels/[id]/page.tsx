import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContestMode, SubmissionStatus } from "@prisma/client";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  ListChecks,
  Radio,
  ScrollText,
  Sparkles,
  Swords,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

import { ChannelDeleteControl } from "@/components/channels/ChannelDeleteControl";
import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { ChannelStatusControl } from "@/components/channels/ChannelStatusControl";
import { ChannelTransferControl } from "@/components/channels/ChannelTransferControl";
import { ContestStartUnifiedControl } from "@/components/channels/ContestStartUnifiedControl";
import { CopyButton } from "@/components/channels/CopyButton";
import { ManageChannelForm } from "@/components/channels/ManageChannelForm";
import { MemberRoleControl } from "@/components/channels/MemberRoleControl";
import { KickMemberButton } from "@/components/channels/KickMemberButton";
import { PastContestsBrowser } from "@/components/contests/PastContestsBrowser";
import { PodiumTop3 } from "@/components/contests/PodiumTop3";
import { ModerationQueue } from "@/components/submissions/ModerationQueue";
import { buttonVariants } from "@/components/ui/button";
import { canManageChannel } from "@/lib/channels";
import {
  getActiveContestsForChannel,
  getLatestCompletedContest,
  parseRankingSnapshot,
} from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Manage channel",
  description: "Manage room settings, status, and members.",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

const MODE_LABEL: Record<ContestMode, string> = {
  LEADERBOARD: "Leaderboard",
  BATTLE: "Battle",
};

const STATUS_LABEL: Record<"DRAFT" | "VOTING_OPEN" | "COMPLETED", string> = {
  DRAFT: "Draft",
  VOTING_OPEN: "Voting open",
  COMPLETED: "Completed",
};

const dateTimeFmt = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
      resultsVisibility: true,
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
          userId: true,
        },
      },
    },
  });

  if (!channel || !canManageChannel(user, channel)) notFound();

  // H21: dashboard data is now scoped to layout/IA. Finalize + battle round
  // close moved to /c/[code]/contest/[id] (H20b), so we no longer need the
  // open-battle-round query, the active-leaderboard contest, or the ranked
  // approved-track list that powered the old "Crown winner" tie picker.
  const [
    pendingSubmissions,
    approvedTracks,
    rejectedCount,
    activeContests,
    latestLeaderboardContest,
  ] = await Promise.all([
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
    prisma.submission.findMany({
      where: { channelId: channel.id, status: SubmissionStatus.APPROVED },
      orderBy: { createdAt: "desc" },
      select: { id: true, artistName: true, trackTitle: true },
    }),
    prisma.submission.count({
      where: { channelId: channel.id, status: SubmissionStatus.REJECTED },
    }),
    getActiveContestsForChannel(prisma, channel.id),
    getLatestCompletedContest(prisma, channel.id, ContestMode.LEADERBOARD),
  ]);

  const approvedCount = approvedTracks.length;

  // H17 item 2 / kept by H21: a compact read-only top-3 from the latest
  // completed leaderboard contest. Useful at-a-glance summary now that the
  // host can't crown from the dashboard.
  const podiumSourceById = new Map(
    approvedTracks.map((track) => [
      track.id,
      { artistName: track.artistName, trackTitle: track.trackTitle },
    ]),
  );
  const dashboardPodium = parseRankingSnapshot(
    latestLeaderboardContest?.rankingSnapshot ?? null,
  )
    .slice(0, 3)
    .map((entry) => {
      const source = podiumSourceById.get(entry.submissionId);
      if (!source) return null;
      return {
        rank: entry.rank,
        artistName: source.artistName,
        trackTitle: source.trackTitle,
        winPct: Math.round(entry.winPct * 100),
        wins: entry.wins,
        losses: entry.losses,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

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

  // H14: transfer picker — only registered users (have userId) and not the
  // current host. Guests can never be hosts.
  const transferCandidates = channel.members
    .filter((member) => member.userId && member.userId !== channel.hostId)
    .map((member) => ({ id: member.id, displayName: member.displayName }));

  return (
    <div className="section-shell space-y-8 py-8 sm:py-12">
      <Link
        href="/dashboard"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft />
        Dashboard
      </Link>

      {/* Header */}
      <section className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
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

      <section className="gradient-border noise-panel rounded-xl border border-transparent p-5 shadow-panel sm:p-7">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <CopyButton value={channel.code} label="Copy code" />
            <CopyButton value={`/c/${channel.code}`} label="Copy share link" />
            <Link
              href={`/dashboard/channels/${channel.id}/stats`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Room stats
            </Link>
            <Link
              href={`/c/${channel.code}/audit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ScrollText />
              Audit log
            </Link>
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

      {/* Contests */}
      <section className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-primary-glow" />
          <h2 className="text-2xl font-bold text-foreground">Contests</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Start a leaderboard contest or a battle bracket. Each contest is an
          independent rally — voting opens for everyone the moment you start.
          Run as many at once as you like; everything else (timer, crown,
          close round) lives inside the contest view.
        </p>

        <div className="mt-6">
          <ContestStartUnifiedControl
            channelId={channel.id}
            status={channel.status}
            approvedCount={approvedCount}
          />
        </div>

        <div className="mt-8">
          <p className="font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
            Active contests
          </p>
          {activeContests.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              No active contests. Start one above to open voting.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {activeContests.map((contest) => {
                const modeAccent =
                  contest.mode === "BATTLE"
                    ? "text-cyan border-cyan/40 bg-cyan/10"
                    : "text-primary-glow border-primary-glow/40 bg-primary/10";
                return (
                  <li
                    key={contest.id}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.12em] uppercase ${modeAccent}`}
                      >
                        {contest.mode === "BATTLE" ? (
                          <Swords className="size-3" />
                        ) : (
                          <Sparkles className="size-3" />
                        )}
                        {MODE_LABEL[contest.mode]}
                      </span>
                      {contest.number !== null && (
                        <span className="font-mono text-sm font-bold text-foreground">
                          #{contest.number}
                        </span>
                      )}
                      <span className="font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">
                        {STATUS_LABEL[contest.status]}
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Started {dateTimeFmt.format(contest.createdAt)}
                      {contest.votingClosesAt && (
                        <>
                          {" · "}closes {dateTimeFmt.format(contest.votingClosesAt)}
                        </>
                      )}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {contest.participantCount} participants ·{" "}
                      {contest.totalVotes} votes
                    </p>
                    <Link
                      href={`/c/${channel.code}/contest/${contest.id}`}
                      className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`}
                    >
                      Open contest
                      <ExternalLink />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {dashboardPodium.length > 0 && (
          <div className="mt-8">
            <PodiumTop3
              entries={dashboardPodium}
              showCounts
              completedAt={latestLeaderboardContest?.completedAt ?? null}
              heading="Latest leaderboard podium"
            />
          </div>
        )}

        <div className="mt-8">
          <p className="font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
            Past contests
          </p>
          <div className="mt-3">
            <PastContestsBrowser channelKey={channel.code} />
          </div>
        </div>
      </section>

      {/* Submissions */}
      <section className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ListChecks className="size-5 text-lime" />
            <h2 className="text-2xl font-bold text-foreground">Submissions</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
            <span>
              <span className="text-muted-foreground">Pending</span>{" "}
              <span className="font-bold text-foreground">
                {moderationQueue.length}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-muted-foreground">Approved</span>{" "}
              <span className="font-bold text-lime">{approvedCount}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-muted-foreground">Rejected</span>{" "}
              <span className="font-bold text-magenta">{rejectedCount}</span>
            </span>
          </div>
        </div>

        <div className="mt-6">
          <p className="font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
            Pending review
          </p>
          <div className="mt-3">
            <ModerationQueue submissions={moderationQueue} />
          </div>
        </div>
      </section>

      {/* Room settings */}
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
              resultsVisibility: channel.resultsVisibility,
              allowGuestUploads: channel.allowGuestUploads,
            }}
          />
        </div>
      </section>

      {/* People */}
      <section className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="size-5 text-cyan" />
            <h2 className="text-2xl font-bold text-foreground">People</h2>
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
                      <div className="flex flex-wrap items-start gap-3 sm:items-center sm:justify-end">
                        <MemberRoleControl
                          channelId={channel.id}
                          memberId={member.id}
                          role={member.role}
                        />
                        <KickMemberButton
                          channelId={channel.id}
                          memberId={member.id}
                          displayName={member.displayName}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <div className="flex items-center gap-3">
            <UserCog className="size-5 text-cyan" />
            <h3 className="text-lg font-bold text-foreground">Transfer room</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Hand the host role to another registered member. They take over
            every host tool; you drop back to a normal member.
          </p>
          <div className="mt-4">
            <ChannelTransferControl
              channelId={channel.id}
              candidates={transferCandidates}
            />
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-magenta/30 bg-magenta/5 p-5 shadow-panel sm:p-7">
        <div className="flex items-center gap-3">
          <Trash2 className="size-5 text-magenta" />
          <h2 className="text-2xl font-bold text-foreground">Danger zone</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Rooms auto-delete after 15 days of inactivity. You can also delete
          this channel now &mdash; the room, members, submissions, votes and
          every uploaded track will be gone for good.
        </p>
        <div className="mt-6">
          <ChannelDeleteControl
            channelId={channel.id}
            channelName={channel.name}
          />
        </div>
      </section>
    </div>
  );
}
