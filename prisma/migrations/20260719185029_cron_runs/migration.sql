-- CreateTable
CREATE TABLE "cron_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "last_run_at" TIMESTAMP(3) NOT NULL,
    "last_status" TEXT NOT NULL,
    "last_success_at" TIMESTAMP(3),
    "last_message" TEXT,
    "summary" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cron_runs_job_key" ON "cron_runs"("job");
