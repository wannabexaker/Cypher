import { ChannelStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { extensionMatchesMime, sanitizeFilename } from "@/lib/media";
import { findChannelMembership, resolveChannelIdentity } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import {
  enforceRequestRateLimit,
  RateLimitExceededError,
  RateLimitUnavailableError,
} from "@/lib/rate-limit";
import { buildStorageKey, createUploadUrl } from "@/lib/storage";
import { signUploadSchema } from "@/lib/validation/submissions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await enforceRequestRateLimit("upload-ip", request);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: "Too many upload attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    if (error instanceof RateLimitUnavailableError) {
      return NextResponse.json(
        { error: "Upload protection is temporarily unavailable." },
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
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = signUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload details." },
      { status: 400 },
    );
  }

  const { channelCode, filename, mimeType, sizeBytes } = parsed.data;

  if (!extensionMatchesMime(filename, mimeType)) {
    return NextResponse.json(
      { error: "File extension does not match its type." },
      { status: 400 },
    );
  }

  const channel = await prisma.channel.findUnique({
    where: { code: channelCode },
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
      { error: "Join the room before uploading." },
      { status: 403 },
    );
  }

  if (!identity.user && !channel.allowGuestUploads) {
    return NextResponse.json(
      { error: "Guests cannot upload in this room." },
      { status: 403 },
    );
  }

  if (membership.participation !== "ARTIST") {
    return NextResponse.json(
      {
        error:
          membership.participation === "JUDGE"
            ? "Judges vote — they don't submit tracks."
            : "Only artists can upload tracks in this room.",
      },
      { status: 403 },
    );
  }

  const storageKey = buildStorageKey(mimeType);

  let uploadUrl: string;
  try {
    uploadUrl = await createUploadUrl({
      key: storageKey,
      contentType: mimeType,
      contentLength: sizeBytes,
    });
  } catch (error) {
    console.error("Failed to presign upload", error);
    return NextResponse.json(
      { error: "Storage is not available right now." },
      { status: 500 },
    );
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      ownerUserId: identity.user?.id ?? null,
      storageKey,
      mimeType,
      sizeBytes,
      originalFilename: sanitizeFilename(filename),
      scanStatus: "PENDING",
      transcodeStatus: "NOT_REQUIRED",
    },
    select: { id: true },
  });

  return NextResponse.json(
    {
      mediaAssetId: asset.id,
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": mimeType },
    },
    { status: 201 },
  );
}
