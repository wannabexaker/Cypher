import {
  ChannelStatus,
  Prisma,
  ScanStatus,
  SourceType,
  SubmissionStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { classifyEmbedUrl } from "@/lib/embeds";
import { bumpChannelActivity } from "@/lib/contests";
import {
  isAudioMimeType,
  MAGIC_BYTE_READ_LENGTH,
  magicBytesMatchMime,
  MAX_UPLOAD_BYTES,
  sourceTypeForMime,
} from "@/lib/media";
import { findChannelMembership, resolveChannelIdentity } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import {
  enforceRequestRateLimit,
  RateLimitExceededError,
  RateLimitUnavailableError,
} from "@/lib/rate-limit";
import { deleteObject, headObject, readObjectPrefix } from "@/lib/storage";
import { channelCodeSchema } from "@/lib/validation/channels";
import { createSubmissionSchema } from "@/lib/validation/submissions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  try {
    await enforceRequestRateLimit("upload-ip", request);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: "Too many submission attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    if (error instanceof RateLimitUnavailableError) {
      return NextResponse.json(
        { error: "Submission protection is temporarily unavailable." },
        { status: 503 },
      );
    }
    throw error;
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid submission details." },
      { status: 400 },
    );
  }

  const parsed = createSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission details." },
      { status: 400 },
    );
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true, status: true, allowGuestUploads: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (channel.status !== ChannelStatus.OPEN) {
    return NextResponse.json(
      { error: "This room is not open for submissions." },
      { status: 409 },
    );
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);

  if (!membership) {
    return NextResponse.json(
      { error: "Join the room before submitting." },
      { status: 403 },
    );
  }

  if (!identity.user && !channel.allowGuestUploads) {
    return NextResponse.json(
      { error: "Guests cannot submit in this room." },
      { status: 403 },
    );
  }

  if (membership.participation !== "ARTIST") {
    return NextResponse.json(
      {
        error:
          membership.participation === "JUDGE"
            ? "Judges vote — they don't submit tracks."
            : "Only artists can submit tracks in this room.",
      },
      { status: 403 },
    );
  }

  // One active submission per member: an approved track is locked; a pending or
  // rejected one is replaced by this new submission.
  const existing = await prisma.submission.findFirst({
    where: { channelId: channel.id, submitterMemberId: membership.id },
    select: {
      id: true,
      status: true,
      mediaAssetId: true,
      mediaAsset: { select: { id: true, storageKey: true } },
    },
  });

  if (existing && existing.status === SubmissionStatus.APPROVED) {
    return NextResponse.json(
      { error: "You already have an approved track in this room." },
      { status: 409 },
    );
  }

  let sourceType: SourceType;
  let mediaAssetId: string | null = null;
  let externalUrl: string | null = null;

  if (parsed.data.sourceType === "FILE") {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: parsed.data.mediaAssetId },
      select: {
        id: true,
        ownerUserId: true,
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
        submission: { select: { id: true } },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Upload not found." },
        { status: 404 },
      );
    }

    // Ownership: registered users own their assets; guest uploads have a null
    // owner and are claimed via the secret random asset id.
    const ownsAsset = identity.user
      ? asset.ownerUserId === identity.user.id
      : asset.ownerUserId === null;

    if (!ownsAsset) {
      return NextResponse.json(
        { error: "You cannot use this upload." },
        { status: 403 },
      );
    }

    // The asset is 1:1 with a submission; reject if already attached elsewhere.
    if (asset.submission && asset.submission.id !== existing?.id) {
      return NextResponse.json(
        { error: "This upload is already attached to a submission." },
        { status: 409 },
      );
    }

    if (!isAudioMimeType(asset.mimeType)) {
      await deleteObject(asset.storageKey);
      return NextResponse.json(
        { error: "Unsupported audio type." },
        { status: 422 },
      );
    }

    // Server-side verification: object exists + size within limits + matches.
    const head = await headObject(asset.storageKey);
    if (!head) {
      return NextResponse.json(
        { error: "Upload was not completed." },
        { status: 422 },
      );
    }

    if (
      head.contentLength <= 0 ||
      head.contentLength > MAX_UPLOAD_BYTES ||
      head.contentLength !== asset.sizeBytes
    ) {
      await deleteObject(asset.storageKey);
      return NextResponse.json(
        { error: "Uploaded file size is invalid." },
        { status: 422 },
      );
    }

    // Magic-byte check via a ranged GET of the leading bytes.
    const prefix = await readObjectPrefix(
      asset.storageKey,
      MAGIC_BYTE_READ_LENGTH,
    );
    if (!prefix || !magicBytesMatchMime(prefix, asset.mimeType)) {
      await deleteObject(asset.storageKey);
      return NextResponse.json(
        { error: "File content does not match its type." },
        { status: 422 },
      );
    }

    sourceType = sourceTypeForMime(asset.mimeType) as SourceType;
    mediaAssetId = asset.id;
  } else {
    const classified = classifyEmbedUrl(parsed.data.externalUrl);
    if (!classified) {
      return NextResponse.json(
        {
          error:
            "Only official Spotify or SoundCloud links are allowed.",
        },
        { status: 400 },
      );
    }
    sourceType = classified.sourceType as SourceType;
    externalUrl = classified.normalizedUrl;
  }

  // Capture the old object/asset so we can clean up storage after the txn.
  const staleStorageKey =
    existing && existing.mediaAsset && existing.mediaAssetId !== mediaAssetId
      ? existing.mediaAsset.storageKey
      : null;
  const staleAssetId =
    existing && existing.mediaAssetId && existing.mediaAssetId !== mediaAssetId
      ? existing.mediaAssetId
      : null;

  let submissionId: string;
  try {
    const created = await prisma.$transaction(async (transaction) => {
      if (existing) {
        await transaction.submission.delete({ where: { id: existing.id } });
        if (staleAssetId) {
          await transaction.mediaAsset.delete({ where: { id: staleAssetId } });
        }
      }

      const submission = await transaction.submission.create({
        data: {
          channelId: channel.id,
          submitterMemberId: membership.id,
          artistName: parsed.data.artistName,
          trackTitle: parsed.data.trackTitle,
          description: parsed.data.description ?? null,
          sourceType,
          mediaAssetId,
          externalUrl,
          status: SubmissionStatus.PENDING,
        },
        select: { id: true },
      });

      if (mediaAssetId) {
        await transaction.mediaAsset.update({
          where: { id: mediaAssetId },
          data: { scanStatus: ScanStatus.CLEAN },
        });
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: identity.user?.id ?? null,
          action: "submission.create",
          entityType: "submission",
          entityId: submission.id,
          metadata: {
            channelId: channel.id,
            memberId: membership.id,
            sourceType,
            replaced: existing?.id ?? null,
          },
        },
      });

      return submission;
    });
    submissionId = created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This upload is already attached to a submission." },
        { status: 409 },
      );
    }
    console.error("Failed to create submission", error);
    return NextResponse.json(
      { error: "Unable to submit right now." },
      { status: 500 },
    );
  }

  if (staleStorageKey) {
    await deleteObject(staleStorageKey);
  }

  // H16a: a new (or replaced) submission means the room is alive.
  await bumpChannelActivity(prisma, channel.id);

  return NextResponse.json(
    { submissionId, status: SubmissionStatus.PENDING },
    { status: 201 },
  );
}
