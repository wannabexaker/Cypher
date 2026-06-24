import { NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { updateChannelSchema } from "@/lib/validation/channels";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { channel: channelId } = await context.params;
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true, status: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!canManageChannel(user, channel)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid channel details." }, { status: 400 });
  }

  const parsed = updateChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid channel details." }, { status: 400 });
  }

  if (
    parsed.data.status &&
    channel.status !== "DRAFT" &&
    channel.status !== "OPEN"
  ) {
    return NextResponse.json(
      { error: "This lifecycle state cannot be changed here." },
      { status: 409 },
    );
  }

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const nextChannel = await transaction.channel.update({
        where: { id: channel.id },
        data: parsed.data,
        select: {
          id: true,
          code: true,
          status: true,
          updatedAt: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: parsed.data.status
            ? "channel.transition"
            : "channel.update",
          entityType: "channel",
          entityId: channel.id,
          metadata: parsed.data,
        },
      });

      return nextChannel;
    });

    return NextResponse.json({ channel: updated });
  } catch (error) {
    console.error("Channel update failed", error);
    return NextResponse.json(
      { error: "Unable to update the channel right now." },
      { status: 500 },
    );
  }
}
