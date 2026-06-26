import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";

// H14: retention sweep. Vercel cron hits this daily with
// `Authorization: Bearer <CRON_SECRET>`. Each overdue channel (purgeAfter <=
// now) gets its MinIO objects wiped first, then the row cascade-deletes the
// rest. No always-on worker — this is purely scheduled.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.channel.findMany({
    where: { purgeAfter: { lte: now } },
    select: { id: true, code: true, name: true },
    take: 50, // cap per run; daily cadence + 50/run is plenty for now
  });

  const results: Array<{ id: string; code: string; mediaObjects: number }> = [];

  for (const channel of due) {
    const storageKeys = await prisma.mediaAsset
      .findMany({
        where: { submission: { channelId: channel.id } },
        select: { storageKey: true },
      })
      .then((rows) => rows.map((row) => row.storageKey));

    for (const key of storageKeys) {
      await deleteObject(key);
    }

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.auditLog.create({
          data: {
            actorUserId: null,
            action: "channel.delete",
            entityType: "channel",
            entityId: channel.id,
            metadata: {
              code: channel.code,
              name: channel.name,
              mediaObjects: storageKeys.length,
              reason: "cron_purge",
            },
          },
        });
        await transaction.channel.delete({ where: { id: channel.id } });
      });
      results.push({
        id: channel.id,
        code: channel.code,
        mediaObjects: storageKeys.length,
      });
    } catch (error) {
      console.error("Cron purge failed for channel", channel.id, error);
    }
  }

  return NextResponse.json({ purged: results.length, channels: results });
}
