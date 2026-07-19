import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CronStatus = "ok" | "degraded" | "failed";

export type RecordCronRunInput = {
  job: string;
  status: CronStatus;
  message?: string | null;
  summary?: Prisma.InputJsonValue | null;
};

/**
 * Upserts the single liveness row for a scheduled job.
 *
 * There is exactly one row per job and it is updated in place, so this never
 * grows the way an audit row per run would. `lastRunAt` moves on every run
 * (whatever the outcome) so you can see the job is alive; `lastSuccessAt` moves
 * only on a fully clean run, so a job that keeps finishing "degraded" still
 * shows a stale success timestamp.
 *
 * Never throws: ops bookkeeping must not be able to fail the job it records.
 */
export async function recordCronRun(input: RecordCronRunInput): Promise<void> {
  const now = new Date();
  const cleanRun = input.status === "ok";

  try {
    await prisma.cronRun.upsert({
      where: { job: input.job },
      create: {
        job: input.job,
        lastRunAt: now,
        lastStatus: input.status,
        lastSuccessAt: cleanRun ? now : null,
        lastMessage: input.message ?? null,
        ...(input.summary ? { summary: input.summary } : {}),
      },
      update: {
        lastRunAt: now,
        lastStatus: input.status,
        ...(cleanRun ? { lastSuccessAt: now } : {}),
        lastMessage: input.message ?? null,
        ...(input.summary ? { summary: input.summary } : {}),
      },
    });
  } catch (error) {
    console.error(`Failed to record cron run for "${input.job}"`, error);
  }
}
