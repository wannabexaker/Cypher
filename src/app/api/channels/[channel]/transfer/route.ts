import { MemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

const bodySchema = z.object({
  memberId: z.string().uuid(),
});

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to transfer this room." },
      { status: 401 },
    );
  }

  const { channel: channelId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid transfer request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transfer request." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (!canManageChannel(user, channel)) {
    return NextResponse.json({ error: "Only the host can transfer this room." }, {
      status: 403,
    });
  }

  const target = await prisma.channelMember.findUnique({
    where: { id: parsed.data.memberId },
    select: { id: true, channelId: true, userId: true, displayName: true },
  });
  if (!target || target.channelId !== channel.id) {
    return NextResponse.json(
      { error: "Target member not found in this channel." },
      { status: 404 },
    );
  }
  // A host must be an account — guests have no userId. Reject hard.
  if (!target.userId) {
    return NextResponse.json(
      { error: "Only registered users can be hosts." },
      { status: 400 },
    );
  }
  if (target.userId === channel.hostId) {
    return NextResponse.json(
      { error: "This user is already the host." },
      { status: 409 },
    );
  }

  // The old host member becomes a normal MEMBER (not MODERATOR — handing the
  // room over should not auto-grant the previous host moderation power).
  const updated = await prisma.$transaction(async (transaction) => {
    const previousHostMember = await transaction.channelMember.findFirst({
      where: { channelId: channel.id, userId: channel.hostId, role: MemberRole.HOST },
      select: { id: true },
    });

    await transaction.channel.update({
      where: { id: channel.id },
      data: { hostId: target.userId! },
    });

    if (previousHostMember) {
      await transaction.channelMember.update({
        where: { id: previousHostMember.id },
        data: { role: MemberRole.MEMBER },
      });
    }

    await transaction.channelMember.update({
      where: { id: target.id },
      data: { role: MemberRole.HOST },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "channel.transfer",
        entityType: "channel",
        entityId: channel.id,
        metadata: { from: channel.hostId, to: target.userId },
      },
    });

    return { newHostId: target.userId, newHostDisplayName: target.displayName };
  });

  return NextResponse.json(updated);
}
