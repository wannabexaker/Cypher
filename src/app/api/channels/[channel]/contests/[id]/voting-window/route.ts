import { ContestStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canModerateChannel, resolveChannelByParam } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { sendChannelPush } from "@/lib/push";
import { getCurrentUser } from "@/lib/session";
import { contestTimerSchema } from "@/lib/validation/timer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string; id: string }>;
};

const MINUTE_MS = 60_000;

// H20a: per-contest voting window. Mirrors PATCH /api/channels/[channel]/timer
// but operates on Contest.votingClosesAt so that with multiple concurrent
// contests the host can arm / extend / close each independently. POST chosen
// (not PATCH) to match the contest-finalize route style and keep the audit
// action name (`contest.voting_window`) tidy.
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to manage the voting timer." },
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
      { error: "Invalid timer change." },
      { status: 400 },
    );
  }

  const parsed = contestTimerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid timer change." },
      { status: 400 },
    );
  }

  const channel = await resolveChannelByParam(prisma, channelId, {
    id: true,
    hostId: true,
    code: true,
    name: true,
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!(await canModerateChannel(user, channel))) {
    return NextResponse.json(
      { error: "Only hosts or moderators can manage the voting timer." },
      { status: 403 },
    );
  }

  const contest = await prisma.contest.findFirst({
    where: { id: contestId, channelId: channel.id },
    select: {
      id: true,
      mode: true,
      number: true,
      status: true,
      votingClosesAt: true,
    },
  });
  if (!contest) {
    return NextResponse.json({ error: "Contest not found." }, { status: 404 });
  }
  if (contest.status === ContestStatus.COMPLETED) {
    return NextResponse.json(
      { error: "This contest is already completed." },
      { status: 409 },
    );
  }

  const now = new Date();
  const input = parsed.data;

  let votingClosesAt: Date | null = contest.votingClosesAt;
  if (input.action === "arm") {
    votingClosesAt = new Date(now.getTime() + input.minutes * MINUTE_MS);
  } else if (input.action === "extend") {
    // Extend only: push the deadline later, never silently shorten.
    const base = Math.max(
      contest.votingClosesAt?.getTime() ?? now.getTime(),
      now.getTime(),
    );
    votingClosesAt = new Date(base + input.minutes * MINUTE_MS);
  } else {
    // close: lock voting immediately.
    votingClosesAt = now;
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const next = await transaction.contest.update({
      where: { id: contest.id },
      data: { votingClosesAt },
      select: { votingClosesAt: true },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "contest.voting_window",
        entityType: "contest",
        entityId: contest.id,
        metadata: {
          channelId: channel.id,
          action: input.action,
          votingClosesAt: next.votingClosesAt?.toISOString() ?? null,
        },
      },
    });

    return next;
  });

  const contestLabel = `${contest.mode === "BATTLE" ? "Battle" : "Leaderboard"}${contest.number ? ` #${contest.number}` : ""}`;
  const closed = input.action === "close";
  await sendChannelPush(channel.id, {
    title: `${channel.name}: voting ${closed ? "closed" : "open"}`,
    body: closed
      ? `${contestLabel} is no longer accepting votes.`
      : input.action === "extend"
        ? `${contestLabel} voting was extended.`
        : `${contestLabel} is now accepting votes.`,
    url: `/c/${channel.code}/contest/${contest.id}`,
    tag: `cypher-contest-voting-${contest.id}`,
  });

  return NextResponse.json({
    contestId: contest.id,
    votingClosesAt: updated.votingClosesAt,
  });
}
