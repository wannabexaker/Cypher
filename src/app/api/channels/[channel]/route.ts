import { NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";
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

// H14: host/ADMIN destructive delete. Prisma cascade tears down members,
// submissions, votes, rounds and battles, but MinIO objects sit outside the
// database — we delete them first so the bucket doesn't accumulate orphans.
export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { channel: channelId } = await context.params;
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true, code: true, name: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (!canManageChannel(user, channel)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const storageKeys = await prisma.mediaAsset
    .findMany({
      where: { submission: { channelId: channel.id } },
      select: { storageKey: true },
    })
    .then((rows) => rows.map((row) => row.storageKey));

  // Best-effort: deleteObject already swallows S3 errors so a missing key
  // can't block the DB delete. Run sequentially to avoid burst-throttling.
  for (const key of storageKeys) {
    await deleteObject(key);
  }

  try {
    await prisma.$transaction(async (transaction) => {
      // Audit BEFORE the delete — once the row is gone the FK on AuditLog is
      // not enforced, but we want the metadata pinned to the original id.
      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "channel.delete",
          entityType: "channel",
          entityId: channel.id,
          metadata: {
            code: channel.code,
            name: channel.name,
            mediaObjects: storageKeys.length,
            reason: "host_delete",
          },
        },
      });

      await transaction.channel.delete({ where: { id: channel.id } });
    });
  } catch (error) {
    console.error("Channel delete failed", error);
    return NextResponse.json(
      { error: "Unable to delete the channel right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true, mediaObjects: storageKeys.length });
}
