import { MemberRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { updateMemberRoleSchema } from "@/lib/validation/channels";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string; memberId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to manage members." },
      { status: 401 },
    );
  }

  const { channel: channelId, memberId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid role change." }, { status: 400 });
  }

  const parsed = updateMemberRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role change." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  // Channel-level membership (promote/demote moderators) is host/ADMIN only.
  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can change member roles." },
      { status: 403 },
    );
  }

  const member = await prisma.channelMember.findFirst({
    where: { id: memberId, channelId: channel.id },
    select: { id: true, role: true, displayName: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (member.role === MemberRole.HOST) {
    return NextResponse.json(
      { error: "The host's role cannot be changed." },
      { status: 409 },
    );
  }

  if (member.role === parsed.data.role) {
    return NextResponse.json({ id: member.id, role: member.role });
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.channelMember.update({
      where: { id: member.id },
      data: { role: parsed.data.role },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "member.role_change",
        entityType: "channel_member",
        entityId: member.id,
        metadata: {
          channelId: channel.id,
          from: member.role,
          to: parsed.data.role,
        },
      },
    });
  });

  return NextResponse.json({ id: member.id, role: parsed.data.role });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to manage members." },
      { status: 401 },
    );
  }

  const { channel: channelId, memberId } = await context.params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  // Kick is host/ADMIN only (same gate as promote/demote).
  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can remove members." },
      { status: 403 },
    );
  }

  const member = await prisma.channelMember.findFirst({
    where: { id: memberId, channelId: channel.id },
    select: { id: true, role: true, displayName: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (member.role === MemberRole.HOST) {
    return NextResponse.json(
      { error: "The host can't be removed. Transfer the channel first." },
      { status: 409 },
    );
  }

  // ChannelMember is the FK target for Submission.submitterMemberId (required,
  // no cascade). If the member has submissions, the DB will refuse the delete
  // and "By <displayName>" attribution would be lost on past contests anyway.
  // Surface a clean 409 so the host disqualifies tracks first, then re-tries.
  const submissionCount = await prisma.submission.count({
    where: { submitterMemberId: member.id },
  });
  if (submissionCount > 0) {
    return NextResponse.json(
      {
        error:
          "Disqualify this member's tracks before kicking them so the bracket and audit stay clean.",
        submissionCount,
      },
      { status: 409 },
    );
  }

  // H18: the channel_member row goes away; past votes stay because Vote has
  // no FK to ChannelMember — it's keyed by voterUserId + identity hashes.
  await prisma.$transaction(async (transaction) => {
    // Audit BEFORE the delete so the actor + metadata are pinned to the
    // original id; AuditLog has no enforced FK to channel_members.
    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "member.remove",
        entityType: "channel_member",
        entityId: member.id,
        metadata: {
          channelId: channel.id,
          role: member.role,
          displayName: member.displayName,
        },
      },
    });

    await transaction.channelMember.delete({ where: { id: member.id } });
  });

  return NextResponse.json({ id: member.id, removed: true });
}
