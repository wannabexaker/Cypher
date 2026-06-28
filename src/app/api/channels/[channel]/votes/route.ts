import {
  ChannelStatus,
  ContestMode,
  ContestStatus,
  SubmissionStatus,
  RoundStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import {
  castWlVote,
  VoteIpCapError,
  VoteTurnstileError,
} from "@/lib/cast-wl-vote";
import {
  bumpChannelActivity,
  getActiveContestsForMode,
} from "@/lib/contests";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { channelCodeSchema } from "@/lib/validation/channels";
import { castVoteSchema } from "@/lib/validation/votes";
import { getVoteSplit } from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid vote details." }, { status: 400 });
  }

  const parsed = castVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid vote details." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true, status: true, votingClosesAt: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "Voting is only open while the room is open." },
      { status: 409 },
    );
  }
  // H20a review-fix: the channel-level `votingClosesAt` kill switch is gone.
  // Under the contest model voting is gated per-contest (status VOTING_OPEN +
  // the contest's own votingClosesAt, checked below). A stale legacy
  // channel.votingClosesAt (set by a pre-reframe finalize/timer) must NOT
  // block a freshly-started contest — that was blocking every reframed room.

  const submission = await prisma.submission.findFirst({
    where: {
      id: parsed.data.submissionId,
      channelId: channel.id,
      status: SubmissionStatus.APPROVED,
    },
    select: { id: true },
  });
  if (!submission) {
    return NextResponse.json(
      { error: "Approved track not found." },
      { status: 404 },
    );
  }

  // H13: per-track voting round (separate windowing for a single track).
  const openRound = await prisma.trackVoteRound.findFirst({
    where: {
      submissionId: submission.id,
      status: RoundStatus.VOTING_OPEN,
    },
    select: {
      id: true,
      closesAt: true,
      durationSeconds: true,
    },
  });
  if (openRound) {
    if (openRound.closesAt && Date.now() >= openRound.closesAt.getTime()) {
      return NextResponse.json(
        { error: "Voting has closed for this track round." },
        { status: 409 },
      );
    }
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  if (!membership) {
    return NextResponse.json(
      { error: "Join the room before voting." },
      { status: 403 },
    );
  }

  // H20a: resolve which contest this vote is for. Explicit `contestId` always
  // wins. Otherwise fall back to "the one active LEADERBOARD" — exactly one
  // active is fine, zero returns the legacy "no active contest" 409, and two
  // or more returns 400 {code:"CONTEST_REQUIRED"} so the UI can pick.
  let activeContestId: string;
  let activeVotingClosesAt: Date | null = null;

  if (parsed.data.contestId) {
    const contest = await prisma.contest.findFirst({
      where: { id: parsed.data.contestId, channelId: channel.id },
      select: { id: true, status: true, votingClosesAt: true },
    });
    if (!contest) {
      return NextResponse.json(
        { error: "Contest not found." },
        { status: 404 },
      );
    }
    if (contest.status !== ContestStatus.VOTING_OPEN) {
      return NextResponse.json(
        { error: "This contest is not accepting votes." },
        { status: 409 },
      );
    }
    if (
      contest.votingClosesAt &&
      Date.now() >= contest.votingClosesAt.getTime()
    ) {
      return NextResponse.json(
        { error: "Voting has closed for this contest." },
        { status: 409 },
      );
    }
    activeContestId = contest.id;
    activeVotingClosesAt = contest.votingClosesAt;
  } else {
    const actives = await getActiveContestsForMode(
      prisma,
      channel.id,
      ContestMode.LEADERBOARD,
    );
    if (actives.length === 0) {
      return NextResponse.json(
        { error: "No active contest. Ask the host to start one." },
        { status: 409 },
      );
    }
    if (actives.length > 1) {
      return NextResponse.json(
        {
          error: "Multiple contests are active — choose which one to vote in.",
          code: "CONTEST_REQUIRED",
        },
        { status: 400 },
      );
    }
    const only = actives[0];
    if (
      only.votingClosesAt &&
      Date.now() >= only.votingClosesAt.getTime()
    ) {
      return NextResponse.json(
        { error: "Voting has closed for this contest." },
        { status: 409 },
      );
    }
    activeContestId = only.id;
    activeVotingClosesAt = only.votingClosesAt;
  }
  void activeVotingClosesAt;

  // Submission must be a participant of the chosen contest. This is how
  // disqualified / non-included tracks get rejected once concurrent contests
  // each have their own roster.
  const participant = await prisma.contestParticipant.findFirst({
    where: {
      contestId: activeContestId,
      submissionId: submission.id,
    },
    select: { id: true },
  });
  if (!participant) {
    return NextResponse.json(
      { error: "Track is not part of this contest." },
      { status: 404 },
    );
  }

  // TODO: optional self-vote guard.
  // TODO: replace the basic DB IP cap with a Redis sliding window.

  try {
    // H13/H16b: TrackVoteRound votes dedupe per round, channel-wide
    // qualifying votes dedupe per contest so a fresh contest reopens W/L
    // for the same identities.
    const dedupeKeyForIdentity = (identityKey: string) => {
      if (openRound) {
        return `tr:${openRound.id}:${identityKey}`;
      }
      return `c:${activeContestId}:s:${submission.id}:${identityKey}`;
    };

    const result = await castWlVote({
      request,
      identity,
      membershipId: membership.id,
      channelId: channel.id,
      submissionId: submission.id,
      choice: parsed.data.choice,
      fingerprint: parsed.data.fingerprint,
      turnstileToken: parsed.data.turnstileToken,
      dedupeKeyForIdentity,
      trackVoteRoundId: openRound?.id,
      contestId: activeContestId,
      tallyWhere: openRound
        ? { contestId: activeContestId }
        : {
            contestId: activeContestId,
            matchupId: null,
            trackVoteRoundId: null,
          },
      updateAfterVote: async (transaction, counts) => {
        // H20a: ContestParticipant is the per-contest source of truth. The
        // denormalised Submission counter mirror is gone — concurrent
        // contests can't share one counter without lying to one of them.
        await transaction.contestParticipant.updateMany({
          where: {
            contestId: activeContestId,
            submissionId: submission.id,
          },
          data: {
            wins: counts.winCount,
            losses: counts.lossCount,
          },
        });
      },
    });

    if (result.created) {
      await bumpChannelActivity(prisma, channel.id);
    }

    return NextResponse.json(
      {
        submissionId: submission.id,
        contestId: activeContestId,
        winCount: result.winCount,
        lossCount: result.lossCount,
        total: result.total,
        winPct: getVoteSplit(result).winPct,
        yourChoice: result.choice,
        locked: result.locked,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof VoteTurnstileError) {
      return NextResponse.json(
        { error: "Complete the anti-bot check before voting." },
        { status: 403 },
      );
    }
    if (error instanceof VoteIpCapError) {
      return NextResponse.json(
        { error: "Too many votes came from this network." },
        { status: 429 },
      );
    }

    console.error("Vote cast failed", error);
    return NextResponse.json(
      { error: "Unable to record this vote right now." },
      { status: 500 },
    );
  }
}
