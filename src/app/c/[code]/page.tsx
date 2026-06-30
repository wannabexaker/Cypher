import {
  ChannelStatus,
  ContestMode,
  SubmissionStatus,
} from "@prisma/client";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Flag,
  Gavel,
  ListMusic,
  Radio,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";

import { ChannelDeleteControl } from "@/components/channels/ChannelDeleteControl";
import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { CopyButton } from "@/components/channels/CopyButton";
import { JoinRoomPanel } from "@/components/channels/JoinRoomPanel";
import { ModeStandingsTable } from "@/components/contests/ModeStandingsTable";
import { PastContestsBrowser } from "@/components/contests/PastContestsBrowser";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import {
  SubmissionStatusPill,
  type SubmissionStatusValue,
} from "@/components/submissions/SubmissionStatusPill";
import { SubmitTrackPanel } from "@/components/submissions/SubmitTrackPanel";
import { TrackPlayer } from "@/components/submissions/TrackPlayer";
import { DisqualifyTrackButton } from "@/components/submissions/DisqualifyTrackButton";
import { buttonVariants } from "@/components/ui/button";
import { VotingCountdown } from "@/components/voting/VotingCountdown";
import {
  GUEST_COOKIE_NAME,
  readGuestToken,
} from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { canManageChannel } from "@/lib/channels";
import {
  getActiveContestsForChannel,
  getModeStandings,
} from "@/lib/contests";
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
      })
    : guestToken
      ? await prisma.channelMember.findUnique({
          where: {
            channelId_guestToken: {
              channelId: channel.id,
              guestToken,
            },
          },
        })
      : null;

  // H20b: voting is now per-contest, so the room-level query no longer needs
  // win/loss mirrors, round metadata, or the caller's vote history. The room
  // page is a venue — it lists what's been approved + links into the active
  // contests where voting actually happens.
  const [approvedSubmissions, mySubmission] = await Promise.all([
    prisma.submission.findMany({
      where: { channelId: channel.id, status: SubmissionStatus.APPROVED },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        artistName: true,
        trackTitle: true,
        description: true,
        sourceType: true,
        externalUrl: true,
        mediaAssetId: true,
        submitterMemberId: true, // H14: needed for FILE playback gate
        submitterMember: {
          select: { displayName: true },
        },
      },
    }),
    membership
      ? prisma.submission.findFirst({
          where: {
            channelId: channel.id,
            submitterMemberId: membership.id,
          },
          select: {
            id: true,
            status: true,
            sourceType: true,
            artistName: true,
            trackTitle: true,
            description: true,
            rejectionReason: true,
            externalUrl: true,
            mediaAssetId: true,
          },
        })
      : null,
  ]);

  // H14: caller's last 5 submissions (account-wide for users, per-guest-token
  // for guests). Read-only, member-gated, own rows only.
  const recentSubmissions = membership
    ? await prisma.submission.findMany({
        where: {
          submitterMember: user
            ? { userId: user.id }
            : { guestToken: guestToken ?? "__none__" },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          trackTitle: true,
          sourceType: true,
          externalUrl: true,
          createdAt: true,
        },
      })
    : [];

  const isOpen = channel.status === ChannelStatus.OPEN;

  // H20b: the host/mod check still gates mod tools + the danger zone (the
  // results-visibility gate moved into the per-contest page).
  const isHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(user && canManageChannel(user, channel));

  // H20b: every DRAFT/VOTING_OPEN contest is surfaced as its own card so the
  // room becomes a venue with multiple concurrent rallies. Each card links
  // into the per-contest page where voting + standings actually live.
  const activeContests = await getActiveContestsForChannel(prisma, channel.id);

  // H17 item 4: per-mode all-time standings. Cheap — one query per mode —
  // and only completed contests count, so the rows are stable.
  const [battleStandings, leaderboardStandings] = await Promise.all([
    getModeStandings(prisma, channel.id, ContestMode.BATTLE),
    getModeStandings(prisma, channel.id, ContestMode.LEADERBOARD),
  ]);
  const standingsSubmissionIds = new Set<string>();
  for (const row of battleStandings) standingsSubmissionIds.add(row.submissionId);
  for (const row of leaderboardStandings)
    standingsSubmissionIds.add(row.submissionId);
  const standingsSubmissions = standingsSubmissionIds.size
    ? await prisma.submission.findMany({
        where: { id: { in: [...standingsSubmissionIds] } },
        select: { id: true, artistName: true, trackTitle: true },
      })
    : [];
  const standingsLookup = new Map(
    standingsSubmissions.map((row) => [row.id, row]),
  );
  const decorateStandings = (
    rows: Awaited<ReturnType<typeof getModeStandings>>,
  ) =>
    rows.map((row) => {
      const submission = standingsLookup.get(row.submissionId);
      const denom = row.wins + row.losses;
      return {
        submissionId: row.submissionId,
        artistName: submission?.artistName ?? "Unknown",
        trackTitle: submission?.trackTitle ?? "Unknown",
        wins: row.wins,
        losses: row.losses,
        contests: row.contests,
        championships: row.championships,
        bestRank: row.bestRank,
        winPct: denom === 0 ? 0 : Math.round((row.wins / denom) * 100),
      };
    });
  const battleStandingsRows = decorateStandings(battleStandings);
  const leaderboardStandingsRows = decorateStandings(leaderboardStandings);

  const vapidPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || undefined;

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

      {/*
        H20b: the channel is a venue now — no single champion lives at the
        top of the room. Contests carry their own podiums on their own pages.
        Active contests get a card list; past contests appear in the Results
        section further down via <PastContestsBrowser />.
      */}
      <div className="section-shell pt-8">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-primary-glow" aria-hidden="true" />
          <h2 className="text-2xl font-bold text-foreground">
            Active contests
          </h2>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {activeContests.length}{" "}
            {activeContests.length === 1 ? "live" : "live"}
          </span>
        </div>

        {activeContests.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-elevated/60 p-5 leading-7 text-muted-foreground">
            No live contests right now. The host can spin up a leaderboard or
            battle from the dashboard — they all run side-by-side here.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {activeContests.map((contest) => {
              const isBattle = contest.mode === ContestMode.BATTLE;
              const ModeIcon = isBattle ? Swords : Trophy;
              const modeLabel = isBattle ? "Battle" : "Leaderboard";
              const statusLabel =
                contest.status === "DRAFT" ? "Draft" : "Voting open";
              return (
                <li
                  key={contest.id}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[0.6875rem] font-bold tracking-[0.12em] uppercase ${
                        isBattle
                          ? "border-cyan/40 bg-cyan/10 text-cyan"
                          : "border-primary-glow/40 bg-primary-glow/10 text-primary-glow"
                      }`}
                    >
                      <ModeIcon className="size-3.5" aria-hidden="true" />
                      {modeLabel}
                    </span>
                    <span className="font-mono text-sm font-bold text-foreground">
                      #{contest.number}
                    </span>
                    <span className="ml-auto inline-flex min-h-7 items-center rounded-full border border-border bg-background px-2.5 font-mono text-[0.625rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                      {statusLabel}
                    </span>
                  </div>

                  {contest.votingClosesAt && (
                    <VotingCountdown
                      closesAt={contest.votingClosesAt.toISOString()}
                    />
                  )}

                  <dl className="grid grid-cols-2 gap-3 font-mono text-xs text-muted-foreground">
                    <div>
                      <dt className="font-bold tracking-[0.12em] uppercase">
                        Tracks
                      </dt>
                      <dd className="mt-1 text-lg font-bold text-foreground">
                        {contest.participantCount}
                        {isBattle && contest.bracketSize
                          ? ` / ${contest.bracketSize}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold tracking-[0.12em] uppercase">
                        Votes
                      </dt>
                      <dd className="mt-1 text-lg font-bold text-foreground">
                        {contest.totalVotes}
                      </dd>
                    </div>
                  </dl>

                  <Link
                    href={`/c/${channel.code}/contest/${contest.id}`}
                    className={`${buttonVariants({ variant: "default", size: "sm" })} mt-auto`}
                  >
                    <Flag />
                    Enter contest
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
            <section className="rounded-xl border border-border bg-elevated p-6">
              <div className="flex items-center gap-3">
                <ListMusic className="size-6 text-primary-glow" aria-hidden="true" />
                <h3 className="text-lg font-bold text-foreground">
                  Approved tracks
                </h3>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {approvedSubmissions.length}
                </span>
              </div>

              {approvedSubmissions.length === 0 ? (
                <p className="mt-4 leading-7 text-muted-foreground">
                  No approved tracks yet. Once the host signs off, they drop here.
                </p>
              ) : (
                <ul className="mt-5 grid gap-4">
                  {/*
                    H20b: voting moved off the roster — the per-track W/L
                    pads and round controls now live inside each contest at
                    /c/{code}/contest/{id}. The roster stays so members can
                    see who's in the channel + preview the music.
                  */}
                  {approvedSubmissions.map((submission) => (
                    <li
                      key={submission.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-foreground">
                          {submission.artistName} — {submission.trackTitle}
                        </p>
                        <span className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-cyan uppercase">
                          {submission.sourceType}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        By {submission.submitterMember?.displayName ?? "Anonymous"}
                      </p>
                      {submission.description && (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {submission.description}
                        </p>
                      )}
                      <TrackPlayer
                        sourceType={submission.sourceType}
                        mediaAssetId={submission.mediaAssetId}
                        externalUrl={submission.externalUrl}
                        trackTitle={submission.trackTitle}
                        artistName={submission.artistName}
                        canPlayFile={
                          // H14: FILE playback locked to host/ADMIN, mods, uploader
                          Boolean(user && canManageChannel(user, channel)) ||
                          membership?.role === "MODERATOR" ||
                          (membership?.id === submission.submitterMemberId)
                        }
                      />
                      {isHostOrModerator && (
                        <div className="mt-3 flex justify-end border-t border-border pt-3">
                          <DisqualifyTrackButton
                            channelId={channel.id}
                            submissionId={submission.id}
                            artistName={submission.artistName}
                            trackTitle={submission.trackTitle}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-elevated p-6 space-y-6">
              <div className="flex items-center gap-3">
                <Trophy
                  className="size-6 text-primary-glow"
                  aria-hidden="true"
                />
                <h3 className="text-lg font-bold text-foreground">
                  Past contests &amp; standings
                </h3>
              </div>
              {/*
                H20b: live leaderboard rankings live on each contest page
                now. The room only surfaces frozen, completed contests +
                cross-contest standings.
              */}
              <PastContestsBrowser channelKey={channel.code} />
              <div className="grid gap-6 lg:grid-cols-2">
                <ModeStandingsTable
                  title="Battle standings"
                  rows={battleStandingsRows}
                />
                <ModeStandingsTable
                  title="Leaderboard standings"
                  rows={leaderboardStandingsRows}
                />
              </div>
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
            allowGuestVotes={channel.allowGuestVotes}
            completed={channel.status === ChannelStatus.COMPLETED}
            participation={membership?.participation ?? undefined}
          />

          {membership && vapidPublicKey && (
            <div className="mt-6">
              <PushOptIn code={channel.code} vapidPublicKey={vapidPublicKey} />
            </div>
          )}

          {membership && isOpen && membership.participation === "ARTIST" && (
            <div className="mt-6">
              <SubmitTrackPanel
                code={channel.code}
                mySubmission={
                  mySubmission
                    ? {
                        ...mySubmission,
                        status: mySubmission.status as SubmissionStatusValue,
                      }
                    : null
                }
                recentSubmissions={recentSubmissions.map((entry) => ({
                  id: entry.id,
                  trackTitle: entry.trackTitle,
                  sourceType: entry.sourceType,
                  externalUrl: entry.externalUrl,
                }))}
              />
            </div>
          )}

          {membership && isOpen && membership.participation === "JUDGE" && (
            <div className="mt-6 rounded-xl border border-border bg-elevated p-6">
              <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-cyan uppercase">
                <Gavel className="size-4" />
                Judge seat
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                You joined as a judge. Listen close and cast W or L on every
                approved track. Every room member&apos;s vote counts equally.
              </p>
            </div>
          )}

          {membership && !isOpen && mySubmission && (
            <div className="mt-6 rounded-xl border border-border bg-elevated p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-foreground">
                  Your submission
                </h3>
                <SubmissionStatusPill
                  status={mySubmission.status as SubmissionStatusValue}
                />
              </div>
              <p className="mt-3 font-bold text-foreground">
                {mySubmission.artistName} — {mySubmission.trackTitle}
              </p>
              {mySubmission.status === "REJECTED" &&
                mySubmission.rejectionReason && (
                  <p className="mt-2 text-sm leading-6 text-magenta">
                    {mySubmission.rejectionReason}
                  </p>
                )}
              {mySubmission.status === "APPROVED" && (
                <TrackPlayer
                  sourceType={mySubmission.sourceType}
                  mediaAssetId={mySubmission.mediaAssetId}
                  externalUrl={mySubmission.externalUrl}
                  trackTitle={mySubmission.trackTitle}
                  artistName={mySubmission.artistName}
                />
              )}
            </div>
          )}
        </aside>
      </div>

      {isHostOrModerator && (
        <section className="mx-auto mt-10 max-w-3xl rounded-xl border border-border bg-elevated p-6 shadow-panel">
          <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-cyan uppercase">
            <ScrollText className="size-4" />
            Mod tools
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Review every moderation action — submissions, contests, members,
            channel changes — for this room.
          </p>
          <Link
            href={`/c/${channel.code}/audit`}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`}
          >
            <ScrollText />
            Open audit log
          </Link>
        </section>
      )}

      {user && user.id === channel.hostId && (
        <section className="mx-auto mt-6 max-w-3xl rounded-xl border border-magenta/40 bg-elevated p-6 shadow-panel">
          <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-magenta uppercase">
            <ShieldAlert className="size-4" />
            Danger zone
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Deleting this room removes its members, submissions, votes, and
            uploaded media. This can&apos;t be undone.
          </p>
          <div className="mt-4">
            <ChannelDeleteControl
              channelId={channel.id}
              channelName={channel.name}
            />
          </div>
        </section>
      )}
    </main>
  );
}
