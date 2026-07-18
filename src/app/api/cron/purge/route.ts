import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron";
import { emitOpsAlert } from "@/lib/ops-alerts";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";

const CRON_JOB = "purge";
const AUDIT_ENTITY_TYPE = "cron";

// H14 + H16a: retention sweep. Vercel cron hits this daily with
// `Authorization: Bearer <CRON_SECRET>`. Channels with no activity for 15+
// days (lastActivityAt < now - 15d) get their MinIO objects wiped first,
// then the row cascade-deletes the rest. No always-on worker — purely
// scheduled.
// H13.1: Vercel Cron Jobs invoke the path with a GET request (not POST), so
// the handler must be exported as GET or the daily sweep would 405.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    const now = new Date();
    // H16a: 15-day inactivity rule replaces the old purge_after stamp. Channels
    // are "alive" until no submission / vote / round activity for 15 days.
    const cutoff = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const due = await prisma.channel.findMany({
      where: { lastActivityAt: { lt: cutoff } },
      select: { id: true, code: true, name: true },
      take: 50, // cap per run; daily cadence + 50/run is plenty for now
    });

    const results: Array<{ id: string; code: string; mediaObjects: number }> =
      [];

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

    const summary = { purged: results.length, channels: results };

    // Successful runs are deliberately NOT written to the audit log: a daily
    // "ok" row is pure noise in a table meant for accountable actions. Success
    // stays visible in the container logs and in this response; only failures
    // (and degraded runs) are persisted.
    console.log(`cron.purge ok — purged ${results.length} channel(s)`);

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Cron purge failed", error);

    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: "cron.purge.failed",
          entityType: AUDIT_ENTITY_TYPE,
          entityId: CRON_JOB,
          metadata: { message },
        },
      })
      .catch((auditError) => {
        console.error(
          "Failed to write cron.purge.failed audit row",
          auditError,
        );
      });

    await emitOpsAlert({
      job: "cron.purge",
      status: "failed",
      detail: { message },
    });

    return NextResponse.json(
      { error: "Cron purge failed." },
      { status: 500 },
    );
  }
}
