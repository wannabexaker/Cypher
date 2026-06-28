import {
  ContestMode,
  MatchupStatus,
  RoundStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import {
  castWlVote,
  VoteIpCapError,
  VoteTurnstileError,
} from "@/lib/cast-wl-vote";
import { bumpChannelActivity, getActiveContest } from "@/lib/contests";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { castBattleVoteSchema } from "@/lib/validation/battle";
import { channelCodeSchema } from "@/lib/validation/channels";
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

  const parsed = castBattleVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid vote details." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: {
      id: true,
      allowGuestVotes: true,
      requireLoginToVote: true,
    },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  // H20a: no more channel.status === BATTLE gate. The room stays OPEN forever
  // and "battle-ness" lives on the active BATTLE Contest checked below.

  const identity = await resolveChannelIdentity(request);
  // H22 fix #3: honor per-channel guest-vote toggles for battle votes too —
  // they were previously ignored, letting anonymous voters slip past a host
  // who turned off guest voting.
  if (!identity.user && (channel.allowGuestVotes === false || channel.requireLoginToVote === true)) {
    return NextResponse.json(
      { error: "Sign in to vote in this room." },
      { status: 403 },
    );
  }
  const membership = await findChannelMembership(channel.id, identity);
  if (!membership) {
    return NextResponse.json(
      { error: "Join the room before voting." },
      { status: 403 },
    );
  }

  const matchup = await prisma.matchup.findUnique({
    where: { id: parsed.data.matchupId },
    select: {
      id: true,
      status: true,
      roundId: true,
      submissionAId: true,
      submissionBId: true,
      round: {
        select: {
          channelId: true,
          status: true,
        },
      },
    },
  });
  if (!matchup || matchup.round.channelId !== channel.id) {
    return NextResponse.json({ error: "Matchup not found." }, { status: 404 });
  }

  if (
    matchup.status !== MatchupStatus.VOTING_OPEN ||
    matchup.round.status !== RoundStatus.VOTING_OPEN
  ) {
    return NextResponse.json(
      { error: "Voting is closed for this matchup." },
      { status: 409 },
    );
  }

  if (
    parsed.data.submissionId !== matchup.submissionAId &&
    parsed.data.submissionId !== matchup.submissionBId
  ) {
    return NextResponse.json(
      { error: "Track does not belong to this matchup." },
      { status: 400 },
    );
  }

  try {
    // H16a/H16b: every matchup vote belongs to an active BATTLE contest.
    // 409 if none. H20a: also enforce the contest's per-contest voting
    // window — battle contests can now arm their own deadline.
    const activeContest = await getActiveContest(
      prisma,
      channel.id,
      ContestMode.BATTLE,
    );
    if (!activeContest) {
      return NextResponse.json(
        { error: "No active battle contest." },
        { status: 409 },
      );
    }
    const contestWindow = await prisma.contest.findUnique({
      where: { id: activeContest.id },
      select: { votingClosesAt: true },
    });
    if (
      contestWindow?.votingClosesAt &&
      Date.now() >= contestWindow.votingClosesAt.getTime()
    ) {
      return NextResponse.json(
        { error: "Voting has closed for this contest." },
        { status: 409 },
      );
    }
    const result = await castWlVote({
      request,
      identity,
      membershipId: membership.id,
      channelId: channel.id,
      roundId: matchup.roundId,
      matchupId: matchup.id,
      submissionId: parsed.data.submissionId,
      choice: parsed.data.choice,
      fingerprint: parsed.data.fingerprint,
      turnstileToken: parsed.data.turnstileToken,
      contestId: activeContest.id,
      // H22 fix #4: previously the dedupe key included `:s:${submissionId}`
      // so one identity could vote for BOTH sides of the same matchup (the
      // submission id made each side a distinct key). Make it matchup-scoped
      // so the unique constraint in `Vote.dedupeKey` enforces "one vote per
      // identity per matchup" — flipping sides now hits the `locked` path in
      // cast-wl-vote and returns the original choice.
      dedupeKeyForIdentity: (identityKey) =>
        `m:${matchup.id}:${identityKey}`,
      tallyWhere: { matchupId: matchup.id },
    });

    if (result.created) {
      await bumpChannelActivity(prisma, channel.id);
    }

    return NextResponse.json(
      {
        matchupId: matchup.id,
        submissionId: parsed.data.submissionId,
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

    console.error("Battle vote cast failed", error);
    return NextResponse.json(
      { error: "Unable to record this vote right now." },
      { status: 500 },
    );
  }
}