import {
  ChannelStatus,
  ContestMode,
  ResultsVisibility,
  SubmissionStatus,
} from "@prisma/client";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Crown, Gavel, ListMusic, Radio, Users } from "lucide-react";

import { ChampionBanner } from "@/components/channels/ChampionBanner";
import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { CopyButton } from "@/components/channels/CopyButton";
import { JoinRoomPanel } from "@/components/channels/JoinRoomPanel";
import { LeaderboardRankings } from "@/components/contests/LeaderboardRankings";
import { ModeStandingsTable } from "@/components/contests/ModeStandingsTable";
import { PastContestsBrowser } from "@/components/contests/PastContestsBrowser";
import { PodiumTop3 } from "@/components/contests/PodiumTop3";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import { RoomBanner } from "@/components/notifications/RoomBanner";
import {
  SubmissionStatusPill,
  type SubmissionStatusValue,
} from "@/components/submissions/SubmissionStatusPill";
import { SubmitTrackPanel } from "@/components/submissions/SubmitTrackPanel";
import { TrackPlayer } from "@/components/submissions/TrackPlayer";
import { buttonVariants } from "@/components/ui/button";
import { VoteControl } from "@/components/voting/VoteControl";
import { VotingCountdown } from "@/components/voting/VotingCountdown";
import { TrackRoundControl } from "@/components/voting/TrackRoundControl";
import {
  GUEST_COOKIE_NAME,
  readGuestToken,
} from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { canManageChannel } from "@/lib/channels";
import {
  getLatestCompletedContest,
  getModeStandings,
  parseRankingSnapshot,
} from "@/lib/contests";
import { channelCodeSchema } from "@/lib/validation/channels";
import { compareWinRatio, getVoteSplit } from "@/lib/votes";

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
  if (channel.status === ChannelStatus.BATTLE) {
    redirect(`/c/${channel.code}/battle`);
  }

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

  const [approvedSubmissions, mySubmission, ownVotes] = await Promise.all([
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
        winCount: true,
        lossCount: true,
        roundResultMode: true, // H13
        submitterMember: {
          select: { displayName: true }, // H13: uploader name
        },
        trackVoteRounds: {
          // H13: fetch rounds
          orderBy: { index: "asc" },
          select: {
            id: true,
            index: true,
            status: true,
            durationSeconds: true,
            openedAt: true,
            closesAt: true,
            closedAt: true,
          },
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
    membership
      ? prisma.vote.findMany({
          where: {
            channelId: channel.id,
            isValid: true,
            submission: { status: SubmissionStatus.APPROVED },
            ...(user
              ? { voterUserId: user.id }
              : { cookieToken: guestToken }),
          },
          orderBy: { createdAt: "desc" },
          select: { submissionId: true, choice: true },
        })
      : [],
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
  const completed = channel.status === ChannelStatus.COMPLETED;
  // H16b: completed-room reads (champion banner, leaderboard freeze) now
  // pull from the latest COMPLETED LEADERBOARD contest with the legacy
  // channel fields as a fallback for pre-H16b rooms.
  const latestContest = await getLatestCompletedContest(
    prisma,
    channel.id,
    ContestMode.LEADERBOARD,
  );
  const effectiveChampionId =
    latestContest?.championSubmissionId ?? channel.championSubmissionId ?? null;
  const effectiveCompletedAt =
    latestContest?.completedAt ?? channel.completedAt ?? null;
  const contestCompleted = Boolean(latestContest);
  const effectiveCompleted = completed || contestCompleted;
  const votingClosed = Boolean(
    channel.votingClosesAt &&
      channel.votingClosesAt.getTime() <= Date.now(),
  );
  const canVote = Boolean(membership && isOpen && !votingClosed);
  const voteDisabledReason = votingClosed
    ? "Voting has closed for this room."
    : membership
      ? "Voting is available while this room is open."
      : "Join the room to cast a W or L.";

  // Results-visibility gate (mirrors the results route). The host, channel
  // MODERATORs, and platform ADMINs always see counts to run the room.
  const isHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(user && canManageChannel(user, channel));
  const canSeeCounts =
    channel.resultsVisibility === ResultsVisibility.LIVE ||
    (channel.resultsVisibility === ResultsVisibility.AFTER_CLOSE &&
      (votingClosed || effectiveCompleted)) ||
    (channel.resultsVisibility === ResultsVisibility.HIDDEN && effectiveCompleted) ||
    isHostOrModerator;
  const countsHiddenLabel =
    channel.resultsVisibility === ResultsVisibility.HIDDEN
      ? "Results reveal when the host finalizes the room."
      : "Results reveal when voting closes.";

  // Freeze the final leaderboard by W% once the room is COMPLETED; otherwise
  // keep the host's newest-first submission order.
  const rankedSubmissions = effectiveCompleted
    ? [...approvedSubmissions].sort((a, b) => {
        const ratioOrder = compareWinRatio(b, a);
        if (ratioOrder !== 0) return ratioOrder;
        return b.winCount + b.lossCount - (a.winCount + a.lossCount);
      })
    : approvedSubmissions;

  const champion =
    effectiveCompleted && effectiveChampionId
      ? approvedSubmissions.find(
          (submission) => submission.id === effectiveChampionId,
        )
      : undefined;
  const championSplit = champion ? getVoteSplit(champion) : null;

  // H17 item 2: derive the top-3 podium from the latest completed leaderboard
  // contest's rankingSnapshot when available. Fall back to ChampionBanner for
  // legacy rooms without a contest record.
  const submissionsById = new Map(
    approvedSubmissions.map((submission) => [submission.id, submission]),
  );
  const rankingSnapshotEntries = parseRankingSnapshot(
    latestContest?.rankingSnapshot ?? null,
  );
  const podiumEntries = rankingSnapshotEntries
    .slice(0, 3)
    .map((entry) => {
      const submission = submissionsById.get(entry.submissionId);
      if (!submission) return null;
      return {
        rank: entry.rank,
        artistName: submission.artistName,
        trackTitle: submission.trackTitle,
        // rankingSnapshot stores a 0..1 fraction — multiply for display.
        winPct: Math.round(entry.winPct * 100),
        wins: entry.wins,
        losses: entry.losses,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // H17 item 1: rankings entries — frozen from snapshot when the contest is
  // completed, otherwise live from rankedSubmissions (already W%-sorted).
  const liveLeaderboardEntries =
    rankingSnapshotEntries.length > 0
      ? rankingSnapshotEntries
          .map((entry) => {
            const submission = submissionsById.get(entry.submissionId);
            if (!submission) return null;
            return {
              submissionId: entry.submissionId,
              rank: entry.rank,
              artistName: submission.artistName,
              trackTitle: submission.trackTitle,
              winPct: Math.round(entry.winPct * 100),
              wins: entry.wins,
              losses: entry.losses,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : rankedSubmissions.map((submission, index) => {
          const split = getVoteSplit(submission);
          return {
            submissionId: submission.id,
            rank: index + 1,
            artistName: submission.artistName,
            trackTitle: submission.trackTitle,
            // getVoteSplit returns winPct as integer 0..100 already.
            winPct: split.winPct,
            wins: submission.winCount,
            losses: submission.lossCount,
          };
        });

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

  const choices = new Map<string, "WIN" | "LOSS">();
  for (const vote of ownVotes) {
    if (!choices.has(vote.submissionId)) {
      choices.set(vote.submissionId, vote.choice);
    }
  }
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;
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

      {effectiveCompleted && podiumEntries.length > 0 ? (
        <div className="section-shell pt-6">
          <PodiumTop3
            entries={podiumEntries}
            showCounts={canSeeCounts}
            completedAt={effectiveCompletedAt}
            heading="Podium"
          />
        </div>
      ) : (
        champion &&
        championSplit && (
          <div className="section-shell pt-6">
            <ChampionBanner
              artistName={champion.artistName}
              trackTitle={champion.trackTitle}
              winPct={championSplit.winPct}
              total={championSplit.total}
              completedAt={effectiveCompletedAt}
            />
          </div>
        )
      )}

      {channel.votingClosesAt && (
        <div className="section-shell pt-6">
          <RoomBanner closesAt={channel.votingClosesAt.toISOString()} />
        </div>
      )}

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

              {channel.votingClosesAt && (
                <div className="mt-4">
                  <VotingCountdown
                    closesAt={channel.votingClosesAt.toISOString()}
                  />
                </div>
              )}

              {approvedSubmissions.length === 0 ? (
                <p className="mt-4 leading-7 text-muted-foreground">
                  No approved tracks yet. Once the host signs off, they drop here.
                </p>
              ) : (
                <ul className="mt-5 grid gap-4">
                  {rankedSubmissions.map((submission, index) => {
                    const isChampion =
                      effectiveCompleted &&
                      submission.id === effectiveChampionId;
                    return (
                      <li
                        key={submission.id}
                        className={`rounded-lg border bg-background p-4 ${
                          isChampion
                            ? "border-lime/50 shadow-glow-cyan"
                            : "border-border"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-2 font-bold text-foreground">
                            {effectiveCompleted && (
                              <span className="font-mono text-xs text-muted-foreground">
                                #{index + 1}
                              </span>
                            )}
                            {submission.artistName} — {submission.trackTitle}
                            {isChampion && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-lime/30 bg-lime/10 px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.12em] text-lime uppercase">
                                <Crown className="size-3" aria-hidden="true" />
                                Champion
                              </span>
                            )}
                          </p>
                          <span className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-cyan uppercase">
                            {submission.sourceType}
                          </span>
                        </div>
                        {/* H13: Show uploader name */}
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
                            (membership?.id ===
                              submission.submitterMemberId)
                          }
                        />
                        {/* H13: Track round controls */}
                        {membership && (
                          <TrackRoundControl
                            submissionId={submission.id}
                            channelId={channel.id}
                            membership={membership}
                            rounds={submission.trackVoteRounds}
                            roundResultMode={submission.roundResultMode}
                          />
                        )}
                        <VoteControl
                          code={channel.code}
                          submissionId={submission.id}
                          initialWinCount={submission.winCount}
                          initialLossCount={submission.lossCount}
                          initialChoice={choices.get(submission.id)}
                          canVote={canVote}
                          disabledReason={voteDisabledReason}
                          turnstileSiteKey={turnstileSiteKey}
                          showCounts={canSeeCounts}
                          countsHiddenLabel={
                            canSeeCounts ? undefined : countsHiddenLabel
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-elevated p-6 space-y-6">
              <div className="flex items-center gap-3">
                <Crown
                  className="size-6 text-primary-glow"
                  aria-hidden="true"
                />
                <h3 className="text-lg font-bold text-foreground">Results</h3>
              </div>
              <LeaderboardRankings
                entries={liveLeaderboardEntries}
                canSeeCounts={canSeeCounts}
                countsHiddenLabel={countsHiddenLabel}
              />
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
    </main>
  );
}
