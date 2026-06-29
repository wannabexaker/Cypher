import {
  ContestMode,
  ContestStatus,
  ResultsVisibility,
} from "@prisma/client";
import type { ChannelStatus } from "@prisma/client";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Crown, Flag, Trophy } from "lucide-react";

import { ChannelBattleRoundCloseControl } from "@/components/channels/ChannelBattleRoundCloseControl";
import { ChannelFinalizeControl } from "@/components/channels/ChannelFinalizeControl";
import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { ContestTimerControl } from "@/components/contests/ContestTimerControl";
import { LeaderboardRankings } from "@/components/contests/LeaderboardRankings";
import { PodiumTop3 } from "@/components/contests/PodiumTop3";
import { RoomBanner } from "@/components/notifications/RoomBanner";
import { TrackPlayer } from "@/components/submissions/TrackPlayer";
import { buttonVariants } from "@/components/ui/button";
import { VoteControl } from "@/components/voting/VoteControl";
import { getBattleState } from "@/lib/battles";
import { canManageChannel } from "@/lib/channels";
import { parseRankingSnapshot } from "@/lib/contests";
import { GUEST_COOKIE_NAME, readGuestToken } from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { channelCodeSchema } from "@/lib/validation/channels";

export const metadata: Metadata = {
  title: "Contest",
  description: "Cast votes inside an active Cypher contest.",
};

type PageProps = {
  params: Promise<{ code: string; id: string }>;
};

function formatStartedAt(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ContestRoomPage({ params }: PageProps) {
  const { code: rawCode, id: contestId } = await params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) notFound();
  if (rawCode !== parsedCode.data) {
    redirect(`/c/${parsedCode.data}/contest/${contestId}`);
  }

  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);
  const guestToken = readGuestToken(cookieStore.get(GUEST_COOKIE_NAME)?.value);

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: {
      id: true,
      code: true,
      name: true,
      hostId: true,
      status: true,
      allowGuestUploads: true,
      allowGuestVotes: true,
    },
  });
  if (!channel) notFound();

  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      channelId: true,
      mode: true,
      status: true,
      number: true,
      bracketSize: true,
      votingClosesAt: true,
      championSubmissionId: true,
      rankingSnapshot: true,
      resultsVisibility: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!contest || contest.channelId !== channel.id) notFound();

  const membership = user
    ? await prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId: channel.id,
            userId: user.id,
          },
        },
        select: { id: true, role: true, participation: true },
      })
    : guestToken
      ? await prisma.channelMember.findUnique({
          where: {
            channelId_guestToken: {
              channelId: channel.id,
              guestToken,
            },
          },
          select: { id: true, role: true, participation: true },
        })
      : null;

  const callerIsHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(user && canManageChannel(user, { hostId: channel.hostId }));

  const contestCompleted = contest.status === ContestStatus.COMPLETED;
  const votingClosed = Boolean(
    contest.votingClosesAt && contest.votingClosesAt.getTime() <= Date.now(),
  );

  // Per-contest results-visibility gate. The Contest copy of `resultsVisibility`
  // is the source of truth; host/mod always see counts. AFTER_CLOSE reveals
  // when the timer has expired OR the contest is COMPLETED; HIDDEN reveals
  // only once COMPLETED.
  const canSeeCounts =
    contest.resultsVisibility === ResultsVisibility.LIVE ||
    (contest.resultsVisibility === ResultsVisibility.AFTER_CLOSE &&
      (votingClosed || contestCompleted)) ||
    (contest.resultsVisibility === ResultsVisibility.HIDDEN &&
      contestCompleted) ||
    callerIsHostOrModerator;
  const countsHiddenLabel =
    contest.resultsVisibility === ResultsVisibility.HIDDEN
      ? "Results reveal when the host finalizes this contest."
      : "Results reveal when voting closes.";

  const modeLabel = contest.mode === ContestMode.BATTLE ? "Battle" : "Leaderboard";
  const numberLabel = contest.number ? `#${contest.number}` : "";
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;

  return (
    <main id="main-content" className="min-h-svh bg-background">
      <header className="border-b border-border bg-background/90">
        <nav className="section-shell flex min-h-18 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ChannelStatusBadge status={channel.status} />
            <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-elevated px-3 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-cyan uppercase">
              {contest.mode === ContestMode.BATTLE ? (
                <Flag className="size-3.5" />
              ) : (
                <Trophy className="size-3.5" />
              )}
              {modeLabel}
              {numberLabel && <span className="ml-1">{numberLabel}</span>}
            </span>
            <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-elevated px-3 font-mono text-[0.625rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {contest.status.replaceAll("_", " ")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/c/${channel.code}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Room view
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

      <section className="section-shell py-10 sm:py-12">
        <p className="section-kicker">
          {channel.name} · {modeLabel} contest {numberLabel}
        </p>
        <h1 className="display-text mt-3 text-[clamp(2.5rem,8vw,5rem)] leading-[0.9] text-foreground">
          {modeLabel} {numberLabel}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Started {formatStartedAt(contest.createdAt)}
          {contest.completedAt
            ? ` · Completed ${formatStartedAt(contest.completedAt)}`
            : ""}
        </p>
        {contest.votingClosesAt && (
          <RoomBanner
            closesAt={contest.votingClosesAt.toISOString()}
            className="mt-4"
          />
        )}
      </section>

      {contest.mode === ContestMode.LEADERBOARD ? (
        <LeaderboardContestBody
          channelCode={channel.code}
          channelHostId={channel.hostId}
          contestId={contest.id}
          contestStatus={contest.status}
          contestCompleted={contestCompleted}
          rankingSnapshot={contest.rankingSnapshot}
          championSubmissionId={contest.championSubmissionId}
          completedAt={contest.completedAt}
          canSeeCounts={canSeeCounts}
          countsHiddenLabel={countsHiddenLabel}
          membership={membership}
          callerIsHostOrModerator={callerIsHostOrModerator}
          user={user}
          guestToken={guestToken}
          votingClosed={votingClosed}
          turnstileSiteKey={turnstileSiteKey}
          contestVotingClosesAt={contest.votingClosesAt}
        />
      ) : (
        <BattleContestBody
          channelId={channel.id}
          channelCode={channel.code}
          channelStatus={channel.status}
          contestId={contest.id}
          contestStatus={contest.status}
          contestVotingClosesAt={contest.votingClosesAt}
          canSeeCounts={canSeeCounts}
          membership={membership}
          callerIsHostOrModerator={callerIsHostOrModerator}
          user={user}
          guestToken={guestToken}
          turnstileSiteKey={turnstileSiteKey}
          contestResultsVisibility={contest.resultsVisibility}
          contestCompleted={contestCompleted}
          completedAt={contest.completedAt}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// LEADERBOARD body
// ---------------------------------------------------------------------------

type LeaderboardContestBodyProps = {
  channelCode: string;
  channelHostId: string;
  contestId: string;
  contestStatus: ContestStatus;
  contestCompleted: boolean;
  rankingSnapshot: unknown;
  championSubmissionId: string | null;
  completedAt: Date | null;
  canSeeCounts: boolean;
  countsHiddenLabel: string;
  membership: { id: string; role: string; participation: string | null } | null;
  callerIsHostOrModerator: boolean;
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  guestToken: string | null;
  votingClosed: boolean;
  turnstileSiteKey: string | undefined;
  contestVotingClosesAt: Date | null;
};

async function LeaderboardContestBody({
  channelCode,
  channelHostId,
  contestId,
  contestStatus,
  contestCompleted,
  rankingSnapshot,
  championSubmissionId,
  completedAt,
  canSeeCounts,
  countsHiddenLabel,
  membership,
  callerIsHostOrModerator,
  user,
  guestToken,
  votingClosed,
  turnstileSiteKey,
  contestVotingClosesAt,
}: LeaderboardContestBodyProps) {
  const participants = await prisma.contestParticipant.findMany({
    where: { contestId },
    select: {
      wins: true,
      losses: true,
      rank: true,
      submission: {
        select: {
          id: true,
          artistName: true,
          trackTitle: true,
          description: true,
          sourceType: true,
          externalUrl: true,
          mediaAssetId: true,
          submitterMemberId: true,
          status: true,
          submitterMember: { select: { displayName: true } },
        },
      },
    },
  });

  // Per-contest dedupe of the caller's votes — needed for the WIN/LOSS pill
  // state on each VoteControl.
  const ownVotes = membership
    ? await prisma.vote.findMany({
        where: {
          contestId,
          isValid: true,
          ...(user ? { voterUserId: user.id } : { cookieToken: guestToken }),
        },
        orderBy: { createdAt: "desc" },
        select: { submissionId: true, choice: true },
      })
    : [];
  const choices = new Map<string, "WIN" | "LOSS">();
  for (const vote of ownVotes) {
    if (!choices.has(vote.submissionId)) {
      choices.set(vote.submissionId, vote.choice);
    }
  }

  // Frozen entries when COMPLETED; live entries from ContestParticipant when
  // VOTING_OPEN. The Submission winCount/lossCount mirror was removed in H20a
  // so per-contest stats live only on ContestParticipant.
  const submissionsById = new Map(
    participants.map((entry) => [entry.submission.id, entry]),
  );
  const snapshotEntries = parseRankingSnapshot(rankingSnapshot);

  const liveEntries =
    contestCompleted && snapshotEntries.length > 0
      ? snapshotEntries
          .map((entry) => {
            const part = submissionsById.get(entry.submissionId);
            if (!part) return null;
            return {
              submissionId: entry.submissionId,
              rank: entry.rank,
              artistName: part.submission.artistName,
              trackTitle: part.submission.trackTitle,
              // rankingSnapshot.winPct is a 0..1 fraction — multiply for display.
              winPct: Math.round(entry.winPct * 100),
              wins: entry.wins,
              losses: entry.losses,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [...participants]
          .map((entry) => {
            const total = entry.wins + entry.losses;
            const winPct = total === 0 ? 0 : Math.round((entry.wins / total) * 100);
            return {
              submissionId: entry.submission.id,
              artistName: entry.submission.artistName,
              trackTitle: entry.submission.trackTitle,
              winPct,
              wins: entry.wins,
              losses: entry.losses,
            };
          })
          .sort((a, b) => {
            if (b.winPct !== a.winPct) return b.winPct - a.winPct;
            return b.wins + b.losses - (a.wins + a.losses);
          })
          .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const podiumEntries = liveEntries.slice(0, 3).map((entry) => ({
    rank: entry.rank,
    artistName: entry.artistName,
    trackTitle: entry.trackTitle,
    winPct: entry.winPct,
    wins: entry.wins,
    losses: entry.losses,
  }));

  // Ordering for the playable tracks list: rank-ordered (live or frozen).
  const orderedParticipants = liveEntries
    .map((entry) => submissionsById.get(entry.submissionId))
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== undefined,
    );

  const canVote =
    Boolean(membership) &&
    contestStatus === ContestStatus.VOTING_OPEN &&
    !votingClosed;
  const voteDisabledReason = votingClosed
    ? "Voting has closed for this contest."
    : contestCompleted
      ? "This contest is finalized."
      : membership
        ? "Voting opens once the host arms the contest."
        : "Join the room to cast a W or L.";

  // Host-side finalize control tracks. Wire current standings so the tie-break
  // menu (championSubmissionId) shows useful labels.
  const finalizeTracks = orderedParticipants.map((entry) => {
    const total = entry.wins + entry.losses;
    const winPct = total === 0 ? 0 : Math.round((entry.wins / total) * 100);
    return {
      id: entry.submission.id,
      label: `${entry.submission.artistName} — ${entry.submission.trackTitle}`,
      winPct,
      total,
    };
  });
  const championLabel =
    contestCompleted && championSubmissionId
      ? (() => {
          const sub = submissionsById.get(championSubmissionId);
          return sub
            ? `${sub.submission.artistName} — ${sub.submission.trackTitle}`
            : null;
        })()
      : finalizeTracks[0]?.label ?? null;

  const champion =
    contestCompleted && championSubmissionId
      ? (submissionsById.get(championSubmissionId)?.submission ?? null)
      : null;

  return (
    <>
      {podiumEntries.length > 0 && (
        <div className="section-shell pb-2">
          <PodiumTop3
            entries={podiumEntries}
            showCounts={canSeeCounts}
            completedAt={completedAt}
            heading={contestCompleted ? "Final podium" : "Live podium"}
          />
        </div>
      )}

      <section className="section-shell grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-12">
        <div>
          <p className="section-kicker">Tracks</p>
          <h2 className="mt-4 text-2xl font-bold text-foreground">
            Cast your votes
          </h2>

          {orderedParticipants.length === 0 ? (
            <p className="mt-6 rounded-md border border-border bg-elevated px-4 py-6 leading-7 text-muted-foreground">
              No participants in this contest yet.
            </p>
          ) : (
            <ul className="mt-6 grid gap-4">
              {orderedParticipants.map((entry, index) => {
                const sub = entry.submission;
                const isChampion =
                  contestCompleted && sub.id === championSubmissionId;
                return (
                  <li
                    key={sub.id}
                    className={`rounded-lg border bg-background p-4 ${
                      isChampion
                        ? "border-lime/50 shadow-glow-cyan"
                        : "border-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-bold text-foreground">
                        <span className="font-mono text-xs text-muted-foreground">
                          #{liveEntries[index]?.rank ?? index + 1}
                        </span>
                        {sub.artistName} — {sub.trackTitle}
                        {isChampion && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-lime/30 bg-lime/10 px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.12em] text-lime uppercase">
                            <Crown className="size-3" aria-hidden="true" />
                            Champion
                          </span>
                        )}
                      </p>
                      <span className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-cyan uppercase">
                        {sub.sourceType}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      By {sub.submitterMember?.displayName ?? "Anonymous"}
                    </p>
                    {sub.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {sub.description}
                      </p>
                    )}
                    <TrackPlayer
                      sourceType={sub.sourceType}
                      mediaAssetId={sub.mediaAssetId}
                      externalUrl={sub.externalUrl}
                      trackTitle={sub.trackTitle}
                      artistName={sub.artistName}
                      canPlayFile={
                        Boolean(
                          user && canManageChannel(user, { hostId: channelHostId }),
                        ) ||
                        membership?.role === "MODERATOR" ||
                        membership?.id === sub.submitterMemberId
                      }
                    />
                    <VoteControl
                      code={channelCode}
                      submissionId={sub.id}
                      initialWinCount={canSeeCounts ? entry.wins : 0}
                      initialLossCount={canSeeCounts ? entry.losses : 0}
                      initialChoice={choices.get(sub.id)}
                      canVote={canVote}
                      disabledReason={voteDisabledReason}
                      turnstileSiteKey={turnstileSiteKey}
                      showCounts={canSeeCounts}
                      countsHiddenLabel={
                        canSeeCounts ? undefined : countsHiddenLabel
                      }
                      contestId={contestId}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-10">
            <LeaderboardRankings
              entries={liveEntries.map((entry) => ({
                submissionId: entry.submissionId,
                rank: entry.rank,
                artistName: entry.artistName,
                trackTitle: entry.trackTitle,
                winPct: entry.winPct,
                wins: entry.wins,
                losses: entry.losses,
              }))}
              canSeeCounts={canSeeCounts}
              countsHiddenLabel={countsHiddenLabel}
            />
          </div>
        </div>

        <aside className="space-y-6">
          {callerIsHostOrModerator && (
            <div className="rounded-xl border border-border bg-elevated p-5">
              <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-cyan uppercase">
                Host controls
              </p>
              <h3 className="mt-2 text-lg font-bold text-foreground">
                Manage this contest
              </h3>
              <div className="mt-4 space-y-6">
                <ContestTimerControl
                  channelCode={channelCode}
                  contestId={contestId}
                  contestStatus={contestStatus}
                  closesAt={
                    contestVotingClosesAt
                      ? contestVotingClosesAt.toISOString()
                      : null
                  }
                />
                <ChannelFinalizeControl
                  channelId={channelCode}
                  status={contestStatus}
                  tracks={finalizeTracks}
                  championLabel={championLabel}
                  activeContestId={contestCompleted ? null : contestId}
                  contestCompleted={contestCompleted}
                />
              </div>
            </div>
          )}

          {champion && (
            <div className="rounded-xl border border-lime/40 bg-elevated p-5">
              <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-lime uppercase">
                Crowned
              </p>
              <p className="mt-2 text-lg font-bold text-foreground">
                {champion.artistName} — {champion.trackTitle}
              </p>
            </div>
          )}
        </aside>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// BATTLE body
// ---------------------------------------------------------------------------

type BattleContestBodyProps = {
  channelId: string;
  channelCode: string;
  channelStatus: ChannelStatus;
  contestId: string;
  contestStatus: ContestStatus;
  contestVotingClosesAt: Date | null;
  canSeeCounts: boolean;
  membership: { id: string; role: string; participation: string | null } | null;
  callerIsHostOrModerator: boolean;
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  guestToken: string | null;
  turnstileSiteKey: string | undefined;
  contestResultsVisibility: ResultsVisibility;
  contestCompleted: boolean;
  completedAt: Date | null;
};

async function BattleContestBody({
  channelId,
  channelCode,
  channelStatus,
  contestId,
  contestStatus,
  contestVotingClosesAt,
  canSeeCounts,
  membership,
  callerIsHostOrModerator,
  user,
  guestToken,
  turnstileSiteKey,
  contestResultsVisibility,
  contestCompleted,
  completedAt,
}: BattleContestBodyProps) {
  // H20a/H20b: getBattleState now accepts an optional {contestId} filter so
  // multiple concurrent BATTLE contests stay isolated per page render.
  const battle = await getBattleState(
    channelId,
    membership
      ? user
        ? { voterUserId: user.id }
        : guestToken
          ? { cookieToken: guestToken }
          : undefined
      : undefined,
    { contestId },
  );

  const openRound = battle.rounds.find((round) => round.status === "VOTING_OPEN");
  const submissionIds = new Set<string>();
  for (const round of battle.rounds) {
    for (const matchup of round.matchups) {
      if (matchup.submissionA) submissionIds.add(matchup.submissionA.id);
      if (matchup.submissionB) submissionIds.add(matchup.submissionB.id);
    }
  }
  const submissionsList = submissionIds.size
    ? await prisma.submission.findMany({
        where: { id: { in: [...submissionIds] } },
        select: {
          id: true,
          artistName: true,
          trackTitle: true,
        },
      })
    : [];
  const submissionMeta = new Map(submissionsList.map((sub) => [sub.id, sub]));

  // Cribbed from the legacy /battle page: derive a top-3 podium from the
  // final round's winner/loser + semifinal losers. Falls back gracefully.
  type BattlePodiumDraft = {
    submissionId: string;
    rank: number;
    sideStats: { winCount: number; lossCount: number; winPct: number } | null;
  };
  const battlePodiumDraft: BattlePodiumDraft[] = [];
  if (contestCompleted && battle.rounds.length > 0) {
    const finalRound = battle.rounds[battle.rounds.length - 1];
    const finalMatchup = finalRound.matchups.find(
      (matchup) => matchup.winnerSubmissionId !== null,
    );
    if (finalMatchup && finalMatchup.winnerSubmissionId) {
      const winnerId = finalMatchup.winnerSubmissionId;
      const winnerSide =
        finalMatchup.submissionA?.id === winnerId
          ? finalMatchup.sideA
          : finalMatchup.sideB;
      battlePodiumDraft.push({
        submissionId: winnerId,
        rank: 1,
        sideStats: winnerSide ?? null,
      });
      const runnerUp =
        finalMatchup.submissionA?.id === winnerId
          ? finalMatchup.submissionB
          : finalMatchup.submissionA;
      const runnerUpSide =
        finalMatchup.submissionA?.id === winnerId
          ? finalMatchup.sideB
          : finalMatchup.sideA;
      if (runnerUp) {
        battlePodiumDraft.push({
          submissionId: runnerUp.id,
          rank: 2,
          sideStats: runnerUpSide ?? null,
        });
      }
    }
    if (battle.rounds.length >= 2) {
      const semis = battle.rounds[battle.rounds.length - 2];
      for (const matchup of semis.matchups) {
        if (!matchup.winnerSubmissionId) continue;
        const loser =
          matchup.submissionA?.id === matchup.winnerSubmissionId
            ? matchup.submissionB
            : matchup.submissionA;
        const loserSide =
          matchup.submissionA?.id === matchup.winnerSubmissionId
            ? matchup.sideB
            : matchup.sideA;
        if (!loser) continue;
        battlePodiumDraft.push({
          submissionId: loser.id,
          rank: 3,
          sideStats: loserSide ?? null,
        });
      }
    }
  }
  const seenBattlePodium = new Set<string>();
  const battlePodiumEntries = battlePodiumDraft
    .map((draft) => {
      if (seenBattlePodium.has(draft.submissionId)) return null;
      seenBattlePodium.add(draft.submissionId);
      const meta = submissionMeta.get(draft.submissionId);
      if (!meta) return null;
      return {
        rank: draft.rank,
        artistName: meta.artistName,
        trackTitle: meta.trackTitle,
        winPct: draft.sideStats?.winPct ?? 0,
        wins: draft.sideStats?.winCount ?? 0,
        losses: draft.sideStats?.lossCount ?? 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 3);

  const matchupVotingClosed = Boolean(
    contestVotingClosesAt && contestVotingClosesAt.getTime() <= Date.now(),
  );

  return (
    <>
      {contestCompleted && battlePodiumEntries.length > 0 && (
        <div className="section-shell pb-4">
          <PodiumTop3
            entries={battlePodiumEntries}
            showCounts={canSeeCounts}
            completedAt={completedAt}
            heading="Bracket podium"
          />
        </div>
      )}

      <section className="section-shell grid gap-8 pb-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-x-auto pb-2">
          {!canSeeCounts && (
            <p className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
              {contestResultsVisibility === ResultsVisibility.HIDDEN
                ? "Results reveal when the host finalizes this contest."
                : "Results reveal when this contest is finalized."}
            </p>
          )}
          {battle.rounds.length === 0 ? (
            <p className="rounded-md border border-border bg-elevated px-4 py-6 leading-7 text-muted-foreground">
              No bracket yet. The host will seed the first round shortly.
            </p>
          ) : (
            <div className="inline-grid min-w-full grid-flow-col gap-4">
              {battle.rounds.map((round) => (
                <section
                  key={round.id}
                  className="w-[22rem] rounded-xl border border-border bg-elevated p-4 shadow-panel"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-cyan uppercase">
                      Round {round.roundNumber}
                    </p>
                    <span className="font-mono text-[0.625rem] text-muted-foreground uppercase">
                      {round.status.replaceAll("_", " ")}
                    </span>
                  </div>

                  <div className="mt-4 space-y-4">
                    {round.matchups.map((matchup) => (
                      <article
                        key={matchup.id}
                        className="rounded-lg border border-border bg-background p-3"
                      >
                        <p className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                          Matchup
                        </p>

                        <div className="mt-2 space-y-4">
                          {[matchup.submissionA, matchup.submissionB]
                            .filter(
                              (
                                entry,
                              ): entry is { id: string; trackTitle: string } =>
                                Boolean(entry),
                            )
                            .map((entry) => {
                              const side =
                                entry.id === matchup.submissionA?.id
                                  ? matchup.sideA
                                  : matchup.sideB;
                              if (!side) return null;
                              const isWinner =
                                matchup.winnerSubmissionId === entry.id;
                              const ownChoice =
                                battle.ownChoices[matchup.id]?.[entry.id];
                              // H20a: BATTLE matchup voting requires an open
                              // round + an open matchup + the contest itself
                              // being VOTING_OPEN and not past its timer.
                              const canVote =
                                Boolean(membership) &&
                                contestStatus === ContestStatus.VOTING_OPEN &&
                                round.status === "VOTING_OPEN" &&
                                matchup.status === "VOTING_OPEN" &&
                                !matchupVotingClosed;

                              return (
                                <div
                                  key={entry.id}
                                  className={`rounded-md border p-3 ${
                                    isWinner
                                      ? "border-lime/40 bg-lime/10"
                                      : "border-border bg-elevated"
                                  }`}
                                >
                                  <p className="text-sm font-bold text-foreground">
                                    {entry.trackTitle}
                                    {isWinner && (
                                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-lime/40 bg-lime/10 px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.1em] text-lime uppercase">
                                        <Trophy className="size-3" />
                                        Winner
                                      </span>
                                    )}
                                  </p>
                                  <VoteControl
                                    code={channelCode}
                                    submissionId={entry.id}
                                    initialWinCount={
                                      canSeeCounts ? side.winCount : 0
                                    }
                                    initialLossCount={
                                      canSeeCounts ? side.lossCount : 0
                                    }
                                    initialChoice={ownChoice}
                                    canVote={canVote}
                                    disabledReason={
                                      matchupVotingClosed
                                        ? "Voting has closed for this contest."
                                        : membership
                                          ? "Voting is open only on the active round's matchups."
                                          : "Join the room to cast battle votes."
                                    }
                                    turnstileSiteKey={turnstileSiteKey}
                                    votePath={`/api/channels/${channelCode}/battles/votes`}
                                    extraPayload={{ matchupId: matchup.id }}
                                  />
                                </div>
                              );
                            })}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          {callerIsHostOrModerator && (
            <div className="rounded-xl border border-border bg-elevated p-5">
              <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-cyan uppercase">
                Host controls
              </p>
              <h3 className="mt-2 text-lg font-bold text-foreground">
                Manage this contest
              </h3>
              <div className="mt-4 space-y-6">
                <ContestTimerControl
                  channelCode={channelCode}
                  contestId={contestId}
                  contestStatus={contestStatus}
                  closesAt={
                    contestVotingClosesAt
                      ? contestVotingClosesAt.toISOString()
                      : null
                  }
                />
                <ChannelBattleRoundCloseControl
                  channelId={channelCode}
                  openRound={openRound ?? null}
                  status={channelStatus}
                />
              </div>
            </div>
          )}
        </aside>
      </section>
    </>
  );
}

export const dynamic = "force-dynamic";
