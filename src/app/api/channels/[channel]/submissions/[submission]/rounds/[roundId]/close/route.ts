import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { bumpChannelActivity } from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{
    channel: string;
    submission: string;
    roundId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to manage voting rounds." },
      { status: 401 },
    );
  }

  const { channel: channelId, submission: submissionId, roundId } = await context.params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true },
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

  const round = await prisma.trackVoteRound.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      submissionId: true,
      channelId: true,
      status: true,
      index: true,
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found." }, { status: 404 });
  }

  if (round.submissionId !== submissionId) {
    return NextResponse.json(
      { error: "Round does not belong to this submission." },
      { status: 404 },
    );
  }

  if (round.status === "CLOSED") {
    return NextResponse.json(
      { error: "Round is already closed." },
      { status: 409 },
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.trackVoteRound.update({
      where: { id: roundId },
      data: {
        status: "CLOSED",
        closedAt: now,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "track_round.close",
        entityType: "track_vote_round",
        entityId: roundId,
        metadata: {
          channelId,
          submissionId,
          roundIndex: round.index,
        },
      },
    });

    return result;
  });

  await bumpChannelActivity(prisma, channelId);

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    closedAt: updated.closedAt,
  });
}
