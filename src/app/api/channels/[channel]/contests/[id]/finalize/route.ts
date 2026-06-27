import { ContestMode, ContestStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canModerateChannel } from "@/lib/channels";
import { runLeaderboardFinalize } from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { finalizeChannelSchema } from "@/lib/validation/finalize";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string; id: string }>;
};

// H16b: explicit contest-level finalize. LEADERBOARD only — BATTLE contests
// auto-finalize when the final round closes. Same tie-break shape as the
// legacy /channels/[channel]/finalize endpoint so the UI can be repointed
// without a contract change.
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to finalize this contest." },
      { status: 401 },
    );
  }

  const { channel: channelId, id: contestId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid finalize request." },
      { status: 400 },
    );
  }

  const parsed = finalizeChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid finalize request." },
      { status: 400 },
    );
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!(await canModerateChannel(user, channel))) {
    return NextResponse.json(
      { error: "Only hosts or moderators can finalize a contest." },
      { status: 403 },
    );
  }

  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, channelId: true, mode: true, status: true },
  });
  if (!contest || contest.channelId !== channel.id) {
    return NextResponse.json({ error: "Contest not found." }, { status: 404 });
  }
  if (contest.mode !== ContestMode.LEADERBOARD) {
    return NextResponse.json(
      { error: "Only LEADERBOARD contests can be finalized here." },
      { status: 409 },
    );
  }
  if (contest.status !== ContestStatus.VOTING_OPEN) {
    return NextResponse.json(
      { error: "This contest is not open for finalization." },
      { status: 409 },
    );
  }

  const result = await runLeaderboardFinalize(prisma, {
    contestId: contest.id,
    channelId: channel.id,
    actorUserId: user.id,
    championPick: parsed.data.championSubmissionId,
  });

  if (result.kind === "no_approved") {
    return NextResponse.json(
      { error: "No approved tracks to finalize." },
      { status: 409 },
    );
  }
  if (result.kind === "tie") {
    return NextResponse.json(
      {
        error: "The top tracks are tied — pick the champion to finalize.",
        tiedSubmissionIds: result.tiedSubmissionIds,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    contestId: result.contestId,
    status: ContestStatus.COMPLETED,
    championSubmissionId: result.championSubmissionId,
    completedAt: result.completedAt,
    rankingSnapshot: result.rankingSnapshot,
  });
}
