import { ContestMode, SubmissionStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canModerateChannel } from "@/lib/channels";
import { bumpChannelActivity, getActiveContest } from "@/lib/contests";
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

  if (
    !(await canModerateChannel(user, {
      id: submission.channelId,
      hostId: submission.channel.hostId,
    }))
  ) {
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

    if (approved) {
      // H16a: an approval joins the submission to the active LEADERBOARD
      // contest, when one exists, so it shows up in contest-shaped reads.
      const activeContest = await getActiveContest(
        transaction,
        submission.channelId,
        ContestMode.LEADERBOARD,
      );
      if (activeContest) {
        await transaction.contestParticipant.upsert({
          where: {
            contestId_submissionId: {
              contestId: activeContest.id,
              submissionId: submission.id,
            },
          },
          create: {
            contestId: activeContest.id,
            submissionId: submission.id,
          },
          update: {},
        });
      }
    }

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

  await bumpChannelActivity(prisma, submission.channelId);

  return NextResponse.json({ id: submission.id, status: nextStatus });
}
