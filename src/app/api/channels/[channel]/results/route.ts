import {
  ChannelStatus,
  ContestMode,
  ContestStatus,
  ResultsVisibility,
  SubmissionStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { getActiveContest, getLatestCompletedContest } from "@/lib/contests";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { channelCodeSchema } from "@/lib/validation/channels";
import {
  compareWinRatio,
  getVoteSplit,
  hasSameWinRatio,
} from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: {
      id: true,
      hostId: true,
      status: true,
      resultsVisibility: true,
      completedAt: true,
      championSubmissionId: true,
      votingClosesAt: true,
      submissions: {
        where: { status: SubmissionStatus.APPROVED },
        select: {
          id: true,
          trackTitle: true,
          createdAt: true,
        },
      },
    },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  const ownVotes = membership
    ? await prisma.vote.findMany({
        where: {
          channelId: channel.id,
          isValid: true,
          submission: { status: SubmissionStatus.APPROVED },
          ...(identity.user
            ? { voterUserId: identity.user.id }
            : { cookieToken: identity.guestToken }),
        },
        orderBy: { createdAt: "desc" },
        select: { submissionId: true, choice: true },
      })
    : [];

  const choices: Record<string, "WIN" | "LOSS"> = {};
  for (const vote of ownVotes) {
    choices[vote.submissionId] ??= vote.choice;
  }

  const completed = channel.status === ChannelStatus.COMPLETED;

  // H22 fix #7: Submission.winCount/lossCount have been dead since H20a — the
  // mirror was dropped when concurrent contests landed and counts moved to
  // ContestParticipant. Resolve the relevant LEADERBOARD contest (active
  // VOTING_OPEN if present, otherwise the latest completed) and rank from
  // its participants so /results reflects the same numbers the per-contest
  // view shows.
  const activeLeaderboard = await getActiveContest(
    prisma,
    channel.id,
    ContestMode.LEADERBOARD,
  );
  const liveContest =
    activeLeaderboard?.status === ContestStatus.VOTING_OPEN
      ? activeLeaderboard
      : null;
  const latestCompleted = await getLatestCompletedContest(
    prisma,
    channel.id,
    ContestMode.LEADERBOARD,
  );
  const sourceContest = liveContest ?? latestCompleted;
  const sourceContestRow = sourceContest
    ? await prisma.contest.findUnique({
        where: { id: sourceContest.id },
        select: {
          id: true,
          status: true,
          votingClosesAt: true,
          completedAt: true,
          championSubmissionId: true,
        },
      })
    : null;

  const participantCounts = sourceContestRow
    ? await prisma.contestParticipant.findMany({
        where: { contestId: sourceContestRow.id },
        select: {
          submissionId: true,
          wins: true,
          losses: true,
        },
      })
    : [];
  const countsBySubmission = new Map(
    participantCounts.map((row) => [
      row.submissionId,
      { winCount: row.wins, lossCount: row.losses },
    ]),
  );

  const contestCompleted = sourceContestRow?.status === ContestStatus.COMPLETED;
  const championSubmissionId =
    sourceContestRow?.championSubmissionId ?? channel.championSubmissionId ?? null;
  const completedAt = sourceContestRow?.completedAt ?? channel.completedAt ?? null;
  const effectiveCompleted = completed || contestCompleted;

  // Voting-closed signal is per-contest (per H20a) when we have a contest;
  // fall back to the channel-level field for truly legacy data.
  const contestVotingClosed = Boolean(
    sourceContestRow?.votingClosesAt &&
      Date.now() >= sourceContestRow.votingClosesAt.getTime(),
  );
  const channelVotingClosed = Boolean(
    channel.votingClosesAt && Date.now() >= channel.votingClosesAt.getTime(),
  );
  const votingClosed = contestVotingClosed || channelVotingClosed;

  // The host, a platform ADMIN, and channel MODERATORs run the room, so they
  // always see live counts regardless of the visibility setting.
  const callerIsHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(
      identity.user &&
        canManageChannel(identity.user, { hostId: channel.hostId }),
    );

  // H22 fix #2: HIDDEN must never expose counts/rankings to non-members,
  // even after the contest is completed. AFTER_CLOSE opens up once voting
  // closed or the contest is finalized; LIVE always; host/mods always.
  const canSeeCounts =
    callerIsHostOrModerator ||
    channel.resultsVisibility === ResultsVisibility.LIVE ||
    (channel.resultsVisibility === ResultsVisibility.AFTER_CLOSE &&
      (votingClosed || effectiveCompleted));

  const ranked = channel.submissions
    .map((submission) => {
      const counts = countsBySubmission.get(submission.id) ?? {
        winCount: 0,
        lossCount: 0,
      };
      return {
        submissionId: submission.id,
        trackTitle: submission.trackTitle,
        winCount: counts.winCount,
        lossCount: counts.lossCount,
        createdAt: submission.createdAt,
        ...getVoteSplit(counts),
      };
    })
    .sort((a, b) => {
      // When counts are hidden, never leak the ranking order either — fall back
      // to a stable submission order (earliest first).
      if (!canSeeCounts) return a.createdAt.getTime() - b.createdAt.getTime();
      const ratioOrder = compareWinRatio(b, a);
      if (ratioOrder !== 0) return ratioOrder;
      if (b.total !== a.total) return b.total - a.total;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  const tiedSubmissionIds =
    canSeeCounts && ranked.length > 1
      ? ranked
          .filter((result) => hasSameWinRatio(result, ranked[0]))
          .map((result) => result.submissionId)
      : [];

  const base = {
    status: channel.status,
    completed: effectiveCompleted,
    completedAt,
    championSubmissionId: canSeeCounts ? championSubmissionId : null,
    votingClosesAt: sourceContestRow?.votingClosesAt ?? channel.votingClosesAt,
    votingClosed,
    choices,
  };

  if (!canSeeCounts) {
    const reason =
      channel.resultsVisibility === ResultsVisibility.HIDDEN
        ? "Results stay hidden in this room."
        : "Results reveal when voting closes.";

    return NextResponse.json({
      ...base,
      resultsHidden: true,
      reason,
      results: ranked.map((result) => ({
        submissionId: result.submissionId,
        trackTitle: result.trackTitle,
      })),
      tie: false,
      tiedSubmissionIds: [],
    });
  }

  return NextResponse.json({
    ...base,
    resultsHidden: false,
    results: ranked.map((result) => ({
      submissionId: result.submissionId,
      trackTitle: result.trackTitle,
      winCount: result.winCount,
      lossCount: result.lossCount,
      total: result.total,
      winPct: result.winPct,
    })),
    tie: tiedSubmissionIds.length > 1,
    tiedSubmissionIds: tiedSubmissionIds.length > 1 ? tiedSubmissionIds : [],
  });
}
