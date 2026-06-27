import {
  ChannelStatus,
  ContestMode,
  ResultsVisibility,
  SubmissionStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { getLatestCompletedContest } from "@/lib/contests";
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
          winCount: true,
          lossCount: true,
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
  const votingClosed = Boolean(
    channel.votingClosesAt && Date.now() >= channel.votingClosesAt.getTime(),
  );

  // H16b: the latest COMPLETED LEADERBOARD contest now carries the canonical
  // champion/completedAt for the room. Fall back to legacy channel fields so
  // pre-H16b data still renders.
  const latestContest = await getLatestCompletedContest(
    prisma,
    channel.id,
    ContestMode.LEADERBOARD,
  );
  const championSubmissionId =
    latestContest?.championSubmissionId ?? channel.championSubmissionId ?? null;
  const completedAt = latestContest?.completedAt ?? channel.completedAt ?? null;
  const contestCompleted = Boolean(latestContest);
  const effectiveCompleted = completed || contestCompleted;

  // The host, a platform ADMIN, and channel MODERATORs run the room, so they
  // always see live counts regardless of the visibility setting.
  const callerIsHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(
      identity.user &&
        canManageChannel(identity.user, { hostId: channel.hostId }),
    );

  const canSeeCounts =
    channel.resultsVisibility === ResultsVisibility.LIVE ||
    (channel.resultsVisibility === ResultsVisibility.AFTER_CLOSE &&
      (votingClosed || effectiveCompleted)) ||
    (channel.resultsVisibility === ResultsVisibility.HIDDEN && effectiveCompleted) ||
    callerIsHostOrModerator;

  const ranked = channel.submissions
    .map((submission) => ({
      submissionId: submission.id,
      trackTitle: submission.trackTitle,
      winCount: submission.winCount,
      lossCount: submission.lossCount,
      createdAt: submission.createdAt,
      ...getVoteSplit(submission),
    }))
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
    championSubmissionId,
    votingClosesAt: channel.votingClosesAt,
    votingClosed,
    choices,
  };

  if (!canSeeCounts) {
    const reason =
      channel.resultsVisibility === ResultsVisibility.HIDDEN
        ? "Results reveal when the host finalizes the room."
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
