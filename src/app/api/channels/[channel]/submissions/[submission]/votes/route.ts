import { type NextRequest, NextResponse } from "next/server";

import { canModerateChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{
    channel: string;
    submission: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: RouteContext) {
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

  // H13.1: host + ADMIN + channel MODERATORs can all see who voted.
  if (!(await canModerateChannel(user, channel))) {
    return NextResponse.json(
      { error: "Only host or moderators can view voting details." },
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
      cookieToken: true,
      trackVoteRound: {
        select: { index: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // H13.1: resolve guest voter names via the signed cookie token → the guest's
  // ChannelMember row in this channel. Falls back to "Guest" only when the
  // token has no member (e.g. an old vote whose member was deleted).
  const guestTokens = Array.from(
    new Set(
      votes
        .filter((vote) => !vote.voterUserId && vote.cookieToken)
        .map((vote) => vote.cookieToken as string),
    ),
  );
  const guestMembers = guestTokens.length
    ? await prisma.channelMember.findMany({
        where: { channelId, guestToken: { in: guestTokens } },
        select: { guestToken: true, displayName: true },
      })
    : [];
  const guestNameByToken = new Map(
    guestMembers
      .filter((member): member is { guestToken: string; displayName: string } =>
        member.guestToken !== null,
      )
      .map((member) => [member.guestToken, member.displayName] as const),
  );

  const voters = votes.map((vote) => {
    const voterName =
      vote.voter?.displayName ??
      (vote.cookieToken ? guestNameByToken.get(vote.cookieToken) : undefined) ??
      "Guest";
    return {
      id: vote.id,
      voterName,
      choice: vote.choice,
      timestamp: vote.createdAt,
      roundIndex: vote.trackVoteRound?.index ?? null,
    };
  });

  return NextResponse.json({ voters });
}

