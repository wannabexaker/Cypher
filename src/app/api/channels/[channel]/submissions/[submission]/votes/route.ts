import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{
    channel: string;
    submission: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view voting details." },
      { status: 401 },
    );
  }

  const { channel: channelId, submission: submissionId } = await context.params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId, channelId },
    select: { id: true, status: true },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  // Only host/mod can view who voted
  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only host can view voting details." },
      { status: 403 },
    );
  }

  const votes = await prisma.vote.findMany({
    where: {
      submissionId,
      isValid: true,
    },
    select: {
      id: true,
      choice: true,
      createdAt: true,
      voter: {
        select: { displayName: true },
      },
      voterUserId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Build voter list with names
  const voters = votes.map((vote) => ({
    id: vote.id,
    voterName: vote.voter?.displayName ?? "Guest",
    choice: vote.choice,
    timestamp: vote.createdAt,
  }));

  return NextResponse.json({ voters });
}
