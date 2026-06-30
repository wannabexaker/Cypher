import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createUploadUrl,
  deleteObject,
  headObject,
} from "../../src/lib/storage";
import { prisma } from "../support/database";

const cronSecret = process.env.CRON_SECRET || "local-e2e-cron-secret";

test("media maintenance rejects anonymous calls and removes aged orphan uploads", async ({
  request,
}) => {
  const storageKey = `media/e2e-orphan-${randomUUID()}.mp3`;
  const freshStorageKey = `media/e2e-fresh-${randomUUID()}.mp3`;
  const bytes = Buffer.from("ID3-e2e-orphan");
  let orphanId: string | null = null;
  let freshId: string | null = null;

  try {
    const uploadUrl = await createUploadUrl({
      key: storageKey,
      contentType: "audio/mpeg",
      contentLength: bytes.length,
    });
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(bytes.length),
      },
      body: bytes,
    });
    expect(upload.ok).toBe(true);

    const orphan = await prisma.mediaAsset.create({
      data: {
        storageKey,
        mimeType: "audio/mpeg",
        sizeBytes: bytes.length,
        originalFilename: "orphan.mp3",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1_000),
        transcodeStatus: "NOT_REQUIRED",
      },
    });
    orphanId = orphan.id;
    const fresh = await prisma.mediaAsset.create({
      data: {
        storageKey: freshStorageKey,
        mimeType: "audio/mpeg",
        sizeBytes: bytes.length,
        originalFilename: "fresh.mp3",
        transcodeStatus: "NOT_REQUIRED",
      },
    });
    freshId = fresh.id;

    expect((await request.get("/api/cron/media-maintenance")).status()).toBe(401);

    const cleanup = await request.get("/api/cron/media-maintenance", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(cleanup.status()).toBe(200);
    await expect(cleanup.json()).resolves.toMatchObject({
      databaseRowsRemoved: 1,
      deletionFailures: 0,
    });
    await expect(prisma.mediaAsset.findUnique({ where: { id: orphan.id } })).resolves.toBeNull();
    await expect(headObject(storageKey)).resolves.toBeNull();
    await expect(prisma.mediaAsset.findUnique({ where: { id: fresh.id } })).resolves.not.toBeNull();
  } finally {
    if (orphanId) await prisma.mediaAsset.deleteMany({ where: { id: orphanId } });
    if (freshId) await prisma.mediaAsset.deleteMany({ where: { id: freshId } });
    await deleteObject(storageKey);
    await deleteObject(freshStorageKey);
  }
});
