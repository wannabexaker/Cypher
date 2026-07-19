import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron";
import { recordCronRun } from "@/lib/cron-runs";
import { emitOpsAlert } from "@/lib/ops-alerts";
import { prisma } from "@/lib/prisma";
import { deleteObject, listStorageObjectsPage } from "@/lib/storage";

export const runtime = "nodejs";

const DEFAULT_ORPHAN_TTL_HOURS = 24;
const MAX_DATABASE_ORPHANS = 100;
const MAX_STORAGE_DELETIONS = 100;
const MAX_STORAGE_PAGES = 5;

const CRON_JOB = "media-maintenance";
const AUDIT_ENTITY_TYPE = "cron";

function orphanTtlHours() {
  const configured = Number.parseInt(
    process.env.MEDIA_ORPHAN_TTL_HOURS ?? "",
    10,
  );
  return Number.isSafeInteger(configured) &&
    configured >= 1 &&
    configured <= 720
    ? configured
    : DEFAULT_ORPHAN_TTL_HOURS;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    const cutoff = new Date(
      Date.now() - orphanTtlHours() * 60 * 60 * 1_000,
    );
    const databaseOrphans = await prisma.mediaAsset.findMany({
      where: {
        createdAt: { lt: cutoff },
        submission: { is: null },
      },
      select: { id: true, storageKey: true },
      orderBy: { createdAt: "asc" },
      take: MAX_DATABASE_ORPHANS,
    });

    let databaseRowsRemoved = 0;
    let storageObjectsRemoved = 0;
    let deletionFailures = 0;

    for (const asset of databaseOrphans) {
      // Delete the unlinked row conditionally first. A concurrent submission
      // either attaches before this statement or loses the FK race; an attached
      // asset is never deleted from storage underneath a valid submission.
      const deleted = await prisma.mediaAsset.deleteMany({
        where: {
          id: asset.id,
          createdAt: { lt: cutoff },
          submission: { is: null },
        },
      });
      if (deleted.count === 0) continue;

      databaseRowsRemoved += 1;
      if (await deleteObject(asset.storageKey)) {
        storageObjectsRemoved += 1;
      } else {
        deletionFailures += 1;
      }
    }

    // Recover objects whose database row disappeared before a previous S3/R2
    // delete succeeded. Age-gating prevents touching in-flight uploads.
    let continuationToken: string | undefined;
    let storagePagesReviewed = 0;
    let inventoryObjectsRemoved = 0;
    let inventoryComplete = true;

    try {
      do {
        const page = await listStorageObjectsPage({ continuationToken });
        storagePagesReviewed += 1;
        const oldObjects = page.objects.filter(
          (object) => object.lastModified && object.lastModified < cutoff,
        );
        const trackedRows = oldObjects.length
          ? await prisma.mediaAsset.findMany({
              where: {
                storageKey: { in: oldObjects.map((object) => object.key) },
              },
              select: { storageKey: true },
            })
          : [];
        const trackedKeys = new Set(trackedRows.map((row) => row.storageKey));

        for (const object of oldObjects) {
          if (
            trackedKeys.has(object.key) ||
            inventoryObjectsRemoved >= MAX_STORAGE_DELETIONS
          ) {
            continue;
          }
          if (await deleteObject(object.key)) {
            storageObjectsRemoved += 1;
            inventoryObjectsRemoved += 1;
          } else {
            deletionFailures += 1;
          }
        }

        continuationToken = page.nextContinuationToken;
        if (
          storagePagesReviewed >= MAX_STORAGE_PAGES ||
          inventoryObjectsRemoved >= MAX_STORAGE_DELETIONS
        ) {
          inventoryComplete =
            !continuationToken &&
            inventoryObjectsRemoved < MAX_STORAGE_DELETIONS;
          break;
        }
      } while (continuationToken);
    } catch (error) {
      inventoryComplete = false;
      console.error("Media orphan storage inventory failed", error);
    }

    const summary = {
      cutoff: cutoff.toISOString(),
      databaseRowsRemoved,
      storageObjectsRemoved,
      inventoryObjectsRemoved,
      deletionFailures,
      storagePagesReviewed,
      inventoryComplete,
    };
    const degraded = deletionFailures > 0 || !inventoryComplete;

    if (degraded) {
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: "cron.media_maintenance.degraded",
            entityType: AUDIT_ENTITY_TYPE,
            entityId: CRON_JOB,
            metadata: summary,
          },
        })
        .catch((auditError) => {
          console.error(
            "Failed to write cron.media_maintenance.degraded audit row",
            auditError,
          );
        });

      await emitOpsAlert({
        job: "cron.media_maintenance",
        status: "degraded",
        detail: summary,
      });
    }

    // Every outcome stamps the single cron_runs liveness row (updated in place)
    // so "when did this last run / last run cleanly?" is answerable without the
    // audit log growing a row per successful run.
    await recordCronRun({
      job: CRON_JOB,
      status: degraded ? "degraded" : "ok",
      summary,
    });

    return NextResponse.json(degraded ? { ...summary, degraded: true } : summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Cron media-maintenance failed", error);

    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: "cron.media_maintenance.failed",
          entityType: AUDIT_ENTITY_TYPE,
          entityId: CRON_JOB,
          metadata: { message },
        },
      })
      .catch((auditError) => {
        console.error(
          "Failed to write cron.media_maintenance.failed audit row",
          auditError,
        );
      });

    await recordCronRun({ job: CRON_JOB, status: "failed", message });

    await emitOpsAlert({
      job: "cron.media_maintenance",
      status: "failed",
      detail: { message },
    });

    return NextResponse.json(
      { error: "Cron media-maintenance failed." },
      { status: 500 },
    );
  }
}
