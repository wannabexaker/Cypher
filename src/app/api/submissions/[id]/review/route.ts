import { SubmissionStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { reviewSubmissionSchema } from "@/lib/validation/submissions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to moderate submissions." },
      { status: 401 },
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid review details." }, { status: 400 });
  }

  const parsed = reviewSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review details." },
      { status: 400 },
    );
  }

  const submission = await prisma.submission.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      channelId: true,
      channel: { select: { hostId: true } },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (!canManageChannel(user, { hostId: submission.channel.hostId })) {
    return NextResponse.json(
      { error: "You cannot moderate this room." },
      { status: 403 },
    );
  }

  if (submission.status !== SubmissionStatus.PENDING) {
    return NextResponse.json(
      { error: "This submission has already been reviewed." },
      { status: 409 },
    );
  }

  const approved = parsed.data.decision === "APPROVE";
  const nextStatus = approved
    ? SubmissionStatus.APPROVED
    : SubmissionStatus.REJECTED;

  await prisma.$transaction(async (transaction) => {
    await transaction.submission.update({
      where: { id: submission.id },
      data: {
        status: nextStatus,
        reviewedById: user.id,
        reviewedAt: new Date(),
        rejectionReason: approved ? null : parsed.data.rejectionReason ?? null,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "submission.review",
        entityType: "submission",
        entityId: submission.id,
        metadata: {
          channelId: submission.channelId,
          decision: parsed.data.decision,
        },
      },
    });
  });

  return NextResponse.json({ id: submission.id, status: nextStatus });
}
