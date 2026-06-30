import { randomUUID } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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
const MEDIA_STAGING_PREFIX = "media/staging/";
const MEDIA_FINAL_PREFIX = "media/final/";

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

export function buildUploadStorageKey(mime: AudioMimeType): string {
  // The browser can write only to this temporary namespace.
  return `${MEDIA_STAGING_PREFIX}${randomUUID()}.${extensionForMime(mime)}`;
}

export function buildFinalStorageKey(mime: AudioMimeType): string {
  // Final keys are generated server-side and never receive a presigned PUT URL.
  return `${MEDIA_FINAL_PREFIX}${randomUUID()}.${extensionForMime(mime)}`;
}

export function isFinalStorageKey(key: string): boolean {
  return key.startsWith(MEDIA_FINAL_PREFIX);
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

export async function promoteUploadObject({
  sourceKey,
  contentType,
}: {
  sourceKey: string;
  contentType: AudioMimeType;
}): Promise<string> {
  const { client, bucket } = getStorage();
  const finalKey = buildFinalStorageKey(contentType);
  const encodedCopySource = [bucket, ...sourceKey.split("/")]
    .map(encodeURIComponent)
    .join("/");

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: finalKey,
      CopySource: encodedCopySource,
      ContentType: contentType,
      MetadataDirective: "REPLACE",
    }),
  );

  return finalKey;
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

export async function deleteObject(key: string): Promise<boolean> {
  const { client, bucket } = getStorage();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export type StorageObject = {
  key: string;
  lastModified: Date | null;
};

export async function listStorageObjectsPage({
  continuationToken,
  maxKeys = 1_000,
}: {
  continuationToken?: string;
  maxKeys?: number;
} = {}) {
  const { client, bucket } = getStorage();
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "media/",
      ContinuationToken: continuationToken,
      MaxKeys: Math.min(Math.max(maxKeys, 1), 1_000),
    }),
  );

  return {
    objects: (result.Contents ?? []).flatMap((object) =>
      object.Key
        ? [{ key: object.Key, lastModified: object.LastModified ?? null }]
        : [],
    ),
    nextContinuationToken: result.NextContinuationToken,
  };
}
