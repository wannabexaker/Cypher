import { SubmissionStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

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

  const results = channel.submissions
    .map((submission) => ({
      submissionId: submission.id,
      trackTitle: submission.trackTitle,
      winCount: submission.winCount,
      lossCount: submission.lossCount,
      createdAt: submission.createdAt,
      ...getVoteSplit(submission),
    }))
    .sort((a, b) => {
      const ratioOrder = compareWinRatio(b, a);
      if (ratioOrder !== 0) return ratioOrder;
      if (b.total !== a.total) return b.total - a.total;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  const tiedSubmissionIds =
    results.length > 1
      ? results
          .filter((result) => hasSameWinRatio(result, results[0]))
          .map((result) => result.submissionId)
      : [];

  return NextResponse.json({
    results: results.map((result) => ({
      submissionId: result.submissionId,
      trackTitle: result.trackTitle,
      winCount: result.winCount,
      lossCount: result.lossCount,
      total: result.total,
      winPct: result.winPct,
    })),
    tie: tiedSubmissionIds.length > 1,
    tiedSubmissionIds:
      tiedSubmissionIds.length > 1 ? tiedSubmissionIds : [],
    choices,
    votingClosesAt: channel.votingClosesAt,
    votingClosed: Boolean(
      channel.votingClosesAt &&
        Date.now() >= channel.votingClosesAt.getTime(),
    ),
  });
}
