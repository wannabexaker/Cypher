import { ChannelStatus, ContestMode } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { getActiveContest, runLeaderboardFinalize } from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { finalizeChannelSchema } from "@/lib/validation/finalize";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

// H16b: legacy "finalize the room" endpoint is now a thin back-compat wrapper
// around the active LEADERBOARD contest's finalize. The channel itself stays
// OPEN as a venue — only the contest closes. UI that issues this call still
// gets the same tie-break shape.
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

  // Legacy behaviour stays host/ADMIN; the new /contests/[id]/finalize widens
  // to include channel MODERATORs.
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

  const activeContest = await getActiveContest(
    prisma,
    channel.id,
    ContestMode.LEADERBOARD,
  );
  if (!activeContest) {
    return NextResponse.json(
      {
        error:
          "No active leaderboard contest. Start a contest before finalizing.",
      },
      { status: 409 },
    );
  }

  const result = await runLeaderboardFinalize(prisma, {
    contestId: activeContest.id,
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

  // Channel-as-venue: room stays OPEN. The legacy response shape keeps the
  // same field names so existing callers don't break.
  return NextResponse.json({
    status: ChannelStatus.OPEN,
    championSubmissionId: result.championSubmissionId,
    completedAt: result.completedAt,
    contestId: result.contestId,
  });
}
