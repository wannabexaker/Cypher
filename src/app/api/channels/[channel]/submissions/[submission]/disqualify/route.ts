import {
  ContestStatus,
  MatchupStatus,
  SourceType,
  SubmissionStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canModerateChannel } from "@/lib/channels";
import { bumpChannelActivity } from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string; submission: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { channel: channelId, submission: submissionId } = await context.params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to moderate submissions." },
      { status: 401 },
    );
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      channelId: true,
      sourceType: true,
      channel: { select: { id: true, hostId: true } },
      mediaAsset: { select: { storageKey: true } },
    },
  });

  if (!submission || submission.channelId !== channelId) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (
    !(await canModerateChannel(user, {
      id: submission.channel.id,
      hostId: submission.channel.hostId,
    }))
  ) {
    return NextResponse.json(
      { error: "You cannot moderate this room." },
      { status: 403 },
    );
  }

  if (submission.status !== SubmissionStatus.APPROVED) {
    return NextResponse.json(
      { error: "Only approved tracks can be disqualified." },
      { status: 409 },
    );
  }

  // H18: refuse to disqualify a track that is currently scheduled inside an
  // active BATTLE matchup — pulling the row would dangle the bracket. The
  // matchup's parent round belongs to a Contest, so use the Contest status as
  // the source of truth for "active".
  const activeMatchup = await prisma.matchup.findFirst({
    where: {
      status: { in: [MatchupStatus.PENDING, MatchupStatus.VOTING_OPEN] },
      OR: [{ submissionAId: submission.id }, { submissionBId: submission.id }],
      round: {
        contest: {
          status: { in: [ContestStatus.DRAFT, ContestStatus.VOTING_OPEN] },
        },
      },
    },
    select: { id: true },
  });
  if (activeMatchup) {
    return NextResponse.json(
      {
        error:
          "Can't disqualify a track while it's scheduled in an active battle matchup.",
      },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.submission.update({
        where: { id: submission.id },
        data: {
          status: SubmissionStatus.DISQUALIFIED,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });

      // Remove the track from any contests that haven't closed yet so it stops
      // counting toward live standings. COMPLETED contests are frozen — leave
      // their participant rows + rankingSnapshot intact so the historical
      // result stays honest.
      await transaction.contestParticipant.deleteMany({
        where: {
          submissionId: submission.id,
          contest: {
            status: { in: [ContestStatus.DRAFT, ContestStatus.VOTING_OPEN] },
          },
        },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "submission.disqualify",
          entityType: "submission",
          entityId: submission.id,
          metadata: { channelId: submission.channelId },
        },
      });
    });
  } catch (error) {
    console.error("Submission disqualify failed", error);
    return NextResponse.json(
      { error: "Unable to disqualify this track right now." },
      { status: 500 },
    );
  }

  await bumpChannelActivity(prisma, submission.channelId);

  // Best-effort media purge for uploaded FILE submissions — keep the
  // Submission + MediaAsset rows so audit/history reads still resolve, but
  // drop the S3 object since the track is out of rotation.
  if (
    (submission.sourceType === SourceType.FILE_MP3 ||
      submission.sourceType === SourceType.FILE_WAV) &&
    submission.mediaAsset?.storageKey
  ) {
    await deleteObject(submission.mediaAsset.storageKey);
  }

  return NextResponse.json({
    id: submission.id,
    status: SubmissionStatus.DISQUALIFIED,
  });
}
