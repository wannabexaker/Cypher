import { ContestMode } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageChannel } from "@/lib/channels";
import { bumpChannelActivity, getActiveContest } from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{ channel: string; submission: string }>;
};

export const runtime = "nodejs";

const openRoundSchema = z.object({
  durationSeconds: z.number().int().positive().max(3600).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to manage voting rounds." },
      { status: 401 },
    );
  }

  const { channel: channelId, submission: submissionId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = openRoundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true, code: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can manage voting rounds." },
      { status: 403 },
    );
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId, channelId },
    select: { id: true, channelId: true },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  // Get the highest existing round index
  const maxRound = await prisma.trackVoteRound.findFirst({
    where: { submissionId },
    orderBy: { index: "desc" },
    select: { index: true },
  });

  const nextIndex = (maxRound?.index ?? 0) + 1;
  if (nextIndex > 5) {
    return NextResponse.json(
      { error: "Maximum 5 voting rounds per track." },
      { status: 409 },
    );
  }

  // Ensure no other submission in this channel has an open voting round
  const existingOpen = await prisma.trackVoteRound.findFirst({
    where: {
      channelId,
      status: "VOTING_OPEN",
    },
    select: { id: true },
  });

  if (existingOpen) {
    return NextResponse.json(
      { error: "Another track already has an open voting round." },
      { status: 409 },
    );
  }

  const now = new Date();
  const closesAt = parsed.data.durationSeconds
    ? new Date(now.getTime() + parsed.data.durationSeconds * 1000)
    : null;

  const round = await prisma.$transaction(async (transaction) => {
    // H16a: stamp the active LEADERBOARD contest on the round so reads
    // can group rounds + their votes by contest.
    const activeContest = await getActiveContest(
      transaction,
      channelId,
      ContestMode.LEADERBOARD,
    );
    const created = await transaction.trackVoteRound.create({
      data: {
        channelId,
        submissionId,
        index: nextIndex,
        status: "VOTING_OPEN",
        durationSeconds: parsed.data.durationSeconds ?? null,
        openedAt: now,
        closesAt,
        contestId: activeContest?.id,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "track_round.open",
        entityType: "track_vote_round",
        entityId: created.id,
        metadata: {
          channelId,
          submissionId,
          index: nextIndex,
          durationSeconds: parsed.data.durationSeconds,
        },
      },
    });

    return created;
  });

  await bumpChannelActivity(prisma, channelId);

  return NextResponse.json({
    id: round.id,
    index: round.index,
    status: round.status,
    durationSeconds: round.durationSeconds,
    openedAt: round.openedAt,
    closesAt: round.closesAt,
  });
}
