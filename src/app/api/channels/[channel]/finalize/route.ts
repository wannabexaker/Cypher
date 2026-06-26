import { ChannelStatus, SubmissionStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { finalizeChannelSchema } from "@/lib/validation/finalize";
import {
  compareWinRatio,
  computeSubmissionFinalCounts,
  hasSameWinRatio,
} from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to finalize this room." },
      { status: 401 },
    );
  }

  const { channel: channelId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid finalize request." }, { status: 400 });
  }

  const parsed = finalizeChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid finalize request." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true, status: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  // Finalizing freezes the whole room, so it stays host/ADMIN. The owner wanted
  // host + mods to settle ties — swap this gate to `canModerateChannel` (async)
  // to let channel MODERATORs finalize as well.
  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can finalize this room." },
      { status: 403 },
    );
  }

  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "Only an open room can be finalized." },
      { status: 409 },
    );
  }

  const submissions = await prisma.submission.findMany({
    where: { channelId: channel.id, status: SubmissionStatus.APPROVED },
    select: {
      id: true,
      createdAt: true,
      roundResultMode: true,
      trackVoteRounds: {
        select: { id: true, advances: true },
      },
    },
  });

  if (submissions.length === 0) {
    return NextResponse.json(
      { error: "No approved tracks to finalize." },
      { status: 409 },
    );
  }

  // H13.1: compute each track's *final* W/L from its rounds + roundResultMode.
  // SELECTED counts only the advancing round; MERGE sums all rounds; the
  // helper falls back to legacy channel-wide votes when a track has no rounds.
  const scored = await Promise.all(
    submissions.map(async (submission) => {
      const counts = await computeSubmissionFinalCounts(
        prisma,
        submission.id,
        submission.roundResultMode,
        submission.trackVoteRounds,
      );
      return {
        id: submission.id,
        createdAt: submission.createdAt,
        winCount: counts.winCount,
        lossCount: counts.lossCount,
      };
    }),
  );

  // Rank by W ratio (highest first); break display order on more votes, then
  // earlier submission — same ordering the results route uses.
  const ranked = [...scored].sort((a, b) => {
    const ratioOrder = compareWinRatio(b, a);
    if (ratioOrder !== 0) return ratioOrder;
    const totalA = a.winCount + a.lossCount;
    const totalB = b.winCount + b.lossCount;
    if (totalB !== totalA) return totalB - totalA;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const topTier = ranked.filter((submission) =>
    hasSameWinRatio(submission, ranked[0]),
  );

  let championSubmissionId: string;
  let tieBroken = false;

  if (topTier.length > 1) {
    const tiedSubmissionIds = topTier.map((submission) => submission.id);
    const pick = parsed.data.championSubmissionId;
    if (!pick || !tiedSubmissionIds.includes(pick)) {
      return NextResponse.json(
        {
          error: "The top tracks are tied — pick the champion to finalize.",
          tiedSubmissionIds,
        },
        { status: 409 },
      );
    }
    championSubmissionId = pick;
    tieBroken = true;
  } else {
    championSubmissionId = ranked[0].id;
  }

  const now = new Date();
  // H14: stamp the retention cutoff at finalize. Cron sweeps channels with
  // purgeAfter <= now; the host can also delete sooner from the dashboard.
  const purgeAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const updated = await prisma.$transaction(async (transaction) => {
    // H13.1: persist each track's final counts so the results page mirrors the
    // ranking the crown used (otherwise MERGE-vs-SELECTED would diverge from
    // the denormalized live counters).
    for (const submission of scored) {
      await transaction.submission.update({
        where: { id: submission.id },
        data: {
          winCount: submission.winCount,
          lossCount: submission.lossCount,
        },
      });
    }

    const next = await transaction.channel.update({
      where: { id: channel.id },
      data: {
        status: ChannelStatus.COMPLETED,
        completedAt: now,
        championSubmissionId,
        votingClosesAt: now,
        purgeAfter,
      },
      select: {
        status: true,
        championSubmissionId: true,
        completedAt: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "channel.finalize",
        entityType: "channel",
        entityId: channel.id,
        metadata: { championSubmissionId, tieBroken },
      },
    });

    return next;
  });

  return NextResponse.json({
    status: updated.status,
    championSubmissionId: updated.championSubmissionId,
    completedAt: updated.completedAt,
  });
}
