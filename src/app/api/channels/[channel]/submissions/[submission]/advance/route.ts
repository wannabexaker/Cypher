import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{
    channel: string;
    submission: string;
  }>;
};

export const runtime = "nodejs";

const advanceSchema = z.union([
  z.object({
    mode: z.literal("MERGE"),
  }),
  z.object({
    mode: z.literal("SELECTED"),
    roundId: z.string().min(1),
  }),
]);

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to advance voting rounds." },
      { status: 401 },
    );
  }

  const { channel: channelId, submission: submissionId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can advance voting rounds." },
      { status: 403 },
    );
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId, channelId },
    select: { id: true, roundResultMode: true },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (parsed.data.mode === "SELECTED") {
    const selectedRound = await prisma.trackVoteRound.findUnique({
      where: { id: parsed.data.roundId },
      select: { id: true, submissionId: true },
    });

    if (!selectedRound || selectedRound.submissionId !== submissionId) {
      return NextResponse.json(
        { error: "Selected round not found for this submission." },
        { status: 404 },
      );
    }
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.submission.update({
      where: { id: submissionId },
      data: {
        roundResultMode: parsed.data.mode,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "track_round.advance",
        entityType: "submission",
        entityId: submissionId,
        metadata: {
          channelId,
          submissionId,
          resultMode: parsed.data.mode,
          ...(parsed.data.mode === "SELECTED" && parsed.data.roundId
            ? { selectedRoundId: parsed.data.roundId }
            : {}),
        },
      },
    });

    return result;
  });

  return NextResponse.json({
    submissionId: updated.id,
    roundResultMode: updated.roundResultMode,
  });
}
