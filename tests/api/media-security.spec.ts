import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  cleanupChannelFixture,
  createLeaderboardFixture,
  E2E_PASSWORD,
  prisma,
} from "../support/database";
import {
  deleteObject,
  readObjectPrefix,
} from "../../src/lib/storage";

test("pending uploaded media cannot be approved or streamed", async ({
  request,
}) => {
  const fixture = await createLeaderboardFixture({ withPassword: true });
  let assetId: string | null = null;

  try {
    const csrfResponse = await request.get("/api/auth/csrf");
    const csrf = (await csrfResponse.json()) as { csrfToken: string };
    const signIn = await request.post("/api/auth/callback/credentials", {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: {
        csrfToken: csrf.csrfToken,
        callbackUrl: "/dashboard",
        email: fixture.host.email,
        password: E2E_PASSWORD,
      },
    });
    expect(signIn.ok()).toBe(true);
    await expect(request.get("/api/auth/session").then((response) => response.json())).resolves.toMatchObject({
      user: { id: fixture.host.id },
    });

    const hostMember = await prisma.channelMember.findUniqueOrThrow({
      where: {
        channelId_userId: {
          channelId: fixture.channel.id,
          userId: fixture.host.id,
        },
      },
    });
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerUserId: fixture.host.id,
        storageKey: `media/e2e-pending-${randomUUID()}.mp3`,
        mimeType: "audio/mpeg",
        sizeBytes: 1_024,
        originalFilename: "pending.mp3",
        scanStatus: "PENDING",
        transcodeStatus: "NOT_REQUIRED",
      },
    });
    assetId = asset.id;
    const submission = await prisma.submission.create({
      data: {
        channelId: fixture.channel.id,
        submitterMemberId: hostMember.id,
        artistName: "E2E Host",
        trackTitle: "Pending security scan",
        sourceType: "FILE_MP3",
        mediaAssetId: asset.id,
        status: "PENDING",
      },
    });

    const blockedMedia = await request.get(`/api/media/${asset.id}/url`);
    expect(blockedMedia.status()).toBe(423);
    await expect(blockedMedia.json()).resolves.toMatchObject({
      error: "Media is unavailable until its security scan passes.",
    });

    const blockedReview = await request.patch(
      `/api/submissions/${submission.id}/review`,
      { data: { decision: "APPROVE" } },
    );
    expect(blockedReview.status()).toBe(409);
    await expect(blockedReview.json()).resolves.toMatchObject({
      error: "This upload has not passed its security scan.",
    });
  } finally {
    if (assetId) {
      await prisma.mediaAsset.deleteMany({ where: { id: assetId } });
    }
    await cleanupChannelFixture(fixture.channel.id, fixture.host.id);
  }
});

test("reusing a presigned upload URL cannot replace promoted media", async ({
  request,
}) => {
  const fixture = await createLeaderboardFixture({ withPassword: true });
  const originalBytes = Buffer.from("ID3-original-safe-audio");
  const replacementBytes = Buffer.alloc(originalBytes.length, 0x41);
  let assetId: string | null = null;
  let stagingKey: string | null = null;
  let finalKey: string | null = null;

  try {
    const csrfResponse = await request.get("/api/auth/csrf");
    const csrf = (await csrfResponse.json()) as { csrfToken: string };
    const signIn = await request.post("/api/auth/callback/credentials", {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: {
        csrfToken: csrf.csrfToken,
        callbackUrl: "/dashboard",
        email: fixture.host.email,
        password: E2E_PASSWORD,
      },
    });
    expect(signIn.ok()).toBe(true);

    await prisma.channelMember.update({
      where: {
        channelId_userId: {
          channelId: fixture.channel.id,
          userId: fixture.host.id,
        },
      },
      data: { participation: "ARTIST" },
    });

    const signUpload = await request.post("/api/uploads/sign", {
      data: {
        channelCode: fixture.channel.code,
        filename: "security-test.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: originalBytes.length,
      },
    });
    expect(signUpload.status()).toBe(201);
    const signed = (await signUpload.json()) as {
      mediaAssetId: string;
      uploadUrl: string;
    };
    assetId = signed.mediaAssetId;

    const stagedAsset = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: assetId },
      select: { storageKey: true },
    });
    stagingKey = stagedAsset.storageKey;
    expect(stagingKey).toMatch(/^media\/staging\//);

    const upload = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(originalBytes.length),
      },
      body: originalBytes,
    });
    expect(upload.ok).toBe(true);

    const submit = await request.post(
      `/api/channels/${fixture.channel.code}/submissions`,
      {
        data: {
          sourceType: "FILE",
          mediaAssetId: assetId,
          artistName: "E2E Host",
          trackTitle: "Immutable upload",
        },
      },
    );
    expect(submit.status()).toBe(201);

    const securedAsset = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: assetId },
      select: { storageKey: true, scanStatus: true },
    });
    finalKey = securedAsset.storageKey;
    expect(finalKey).toMatch(/^media\/final\//);
    expect(securedAsset.scanStatus).toBe("CLEAN");
    await expect(
      readObjectPrefix(finalKey, originalBytes.length),
    ).resolves.toEqual(new Uint8Array(originalBytes));

    // The original URL can still be valid for its full five-minute window,
    // but it can recreate only the staging key, never mutate the final object.
    const replay = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(replacementBytes.length),
      },
      body: replacementBytes,
    });
    expect(replay.ok).toBe(true);
    await expect(
      readObjectPrefix(finalKey, originalBytes.length),
    ).resolves.toEqual(new Uint8Array(originalBytes));
  } finally {
    if (stagingKey) await deleteObject(stagingKey);
    if (finalKey) await deleteObject(finalKey);
    if (assetId) await prisma.mediaAsset.deleteMany({ where: { id: assetId } });
    await cleanupChannelFixture(fixture.channel.id, fixture.host.id);
  }
});
