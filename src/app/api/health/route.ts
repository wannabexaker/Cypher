import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { listStorageObjectsPage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 2_000;
const STORAGE_TIMEOUT_MS = 2_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function checkDatabase(): Promise<boolean> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

async function checkStorage(): Promise<boolean> {
  try {
    await withTimeout(
      listStorageObjectsPage({ maxKeys: 1 }),
      STORAGE_TIMEOUT_MS,
    );
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const [database, storage] = await Promise.all([
    checkDatabase(),
    checkStorage(),
  ]);

  const timestamp = new Date().toISOString();

  if (!database) {
    return NextResponse.json(
      {
        status: "unhealthy",
        checks: { database, storage },
        timestamp,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: storage ? "ok" : "degraded",
    checks: { database, storage },
    timestamp,
  });
}
