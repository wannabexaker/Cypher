import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  type AudioMimeType,
  extensionForMime,
  sanitizeFilename,
} from "@/lib/media";

const PRESIGN_PUT_TTL_SECONDS = 300; // ≤ 5 min for the upload window
const DEFAULT_MEDIA_URL_TTL_SECONDS = 300;
const MAX_MEDIA_URL_TTL_SECONDS = 3600;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required storage env var: ${name}`);
  }
  return value;
}

export function getMediaUrlTtlSeconds(): number {
  const raw = process.env.MEDIA_URL_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_MEDIA_URL_TTL_SECONDS) {
    return DEFAULT_MEDIA_URL_TTL_SECONDS;
  }
  return parsed;
}

let cachedClient: S3Client | null = null;
let cachedBucket: string | null = null;

function getStorage(): { client: S3Client; bucket: string } {
  if (!cachedClient || !cachedBucket) {
    cachedClient = new S3Client({
      endpoint: requireEnv("S3_ENDPOINT"),
      region: process.env.S3_REGION || "auto",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      },
    });
    cachedBucket = requireEnv("S3_BUCKET");
  }
  return { client: cachedClient, bucket: cachedBucket };
}

export function buildStorageKey(mime: AudioMimeType): string {
  // Random key — never derived from the user filename.
  return `media/${randomUUID()}.${extensionForMime(mime)}`;
}

export async function createUploadUrl({
  key,
  contentType,
  contentLength,
}: {
  key: string;
  contentType: AudioMimeType;
  contentLength: number;
}): Promise<string> {
  const { client, bucket } = getStorage();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  return getSignedUrl(client, command, {
    expiresIn: PRESIGN_PUT_TTL_SECONDS,
    // Bind the signature to the declared type + exact size.
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

export async function createDownloadUrl({
  key,
  contentType,
  filename,
}: {
  key: string;
  contentType: string;
  filename?: string | null;
}): Promise<string> {
  const { client, bucket } = getStorage();
  const safeName = sanitizeFilename(filename ?? "track");
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `inline; filename="${safeName}"`,
  });

  return getSignedUrl(client, command, {
    expiresIn: getMediaUrlTtlSeconds(),
  });
}

export type StorageObjectHead = {
  contentLength: number;
  contentType: string | null;
};

export async function headObject(key: string): Promise<StorageObjectHead | null> {
  const { client, bucket } = getStorage();
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? null,
    };
  } catch {
    return null;
  }
}

export async function readObjectPrefix(
  key: string,
  length: number,
): Promise<Uint8Array | null> {
  const { client, bucket } = getStorage();
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=0-${Math.max(0, length - 1)}`,
      }),
    );
    if (!result.Body) return null;
    return await result.Body.transformToByteArray();
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getStorage();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Best-effort cleanup; a leftover private object is harmless.
  }
}
