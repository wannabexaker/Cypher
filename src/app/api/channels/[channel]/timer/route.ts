import { ChannelStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { sendChannelPush } from "@/lib/push";
import { getCurrentUser } from "@/lib/session";
import { channelTimerSchema } from "@/lib/validation/timer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

const MINUTE_MS = 60_000;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to manage the voting timer." },
      { status: 401 },
    );
  }

  const { channel: channelId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid timer change." }, { status: 400 });
  }

  const parsed = channelTimerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timer change." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      code: true,
      name: true,
      hostId: true,
      status: true,
      votingOpenedAt: true,
      votingClosesAt: true,
    },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can manage the voting timer." },
      { status: 403 },
    );
  }

  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "The voting timer is only available while the room is open." },
      { status: 409 },
    );
  }

  const now = new Date();
  const input = parsed.data;

  let votingOpenedAt = channel.votingOpenedAt;
  let votingClosesAt = channel.votingClosesAt;

  if (input.action === "arm") {
    votingOpenedAt = channel.votingOpenedAt ?? now;
    votingClosesAt = new Date(now.getTime() + input.minutes * MINUTE_MS);
  } else if (input.action === "extend") {
    // Extend only: push the deadline later, never silently shorten.
    const base = Math.max(
      channel.votingClosesAt?.getTime() ?? now.getTime(),
      now.getTime(),
    );
    votingOpenedAt = channel.votingOpenedAt ?? now;
    votingClosesAt = new Date(base + input.minutes * MINUTE_MS);
  } else {
    // close: lock voting immediately.
    votingClosesAt = now;
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const next = await transaction.channel.update({
      where: { id: channel.id },
      data: { votingOpenedAt, votingClosesAt },
      select: { votingOpenedAt: true, votingClosesAt: true },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "voting.timer",
        entityType: "channel",
        entityId: channel.id,
        metadata: {
          action: input.action,
          votingClosesAt: next.votingClosesAt?.toISOString() ?? null,
        },
      },
    });

    return next;
  });

  // Fire-and-forget: notify room members of the voting event. Push is
  // best-effort (and a no-op without VAPID keys); never block or fail the
  // response on it.
  const roomUrl = `/c/${channel.code}`;
  const payload =
    input.action === "close"
      ? {
          title: channel.name,
          body: "Voting has closed.",
          url: roomUrl,
          tag: `voting-${channel.id}`,
        }
      : {
          title: channel.name,
          body: updated.votingClosesAt
            ? `Voting is open — closes ${updated.votingClosesAt.toLocaleTimeString(
                "en-GB",
                { hour: "2-digit", minute: "2-digit" },
              )}.`
            : "Voting is open.",
          url: roomUrl,
          tag: `voting-${channel.id}`,
        };
  void sendChannelPush(channel.id, payload);

  return NextResponse.json({
    votingOpenedAt: updated.votingOpenedAt,
    votingClosesAt: updated.votingClosesAt,
  });
}
