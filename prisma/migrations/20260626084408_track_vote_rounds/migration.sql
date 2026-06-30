-- CreateEnum
CREATE TYPE "ResultMode" AS ENUM ('MERGE', 'SELECTED');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "round_result_mode" "ResultMode" NOT NULL DEFAULT 'MERGE';

-- AlterTable
ALTER TABLE "votes" ADD COLUMN     "track_vote_round_id" TEXT;

-- CreateTable
CREATE TABLE "track_vote_rounds" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'VOTING_OPEN',
    "advances" BOOLEAN NOT NULL DEFAULT false,
    "duration_seconds" INTEGER,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closes_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "track_vote_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "track_vote_rounds_channel_id_status_idx" ON "track_vote_rounds"("channel_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "track_vote_rounds_submission_id_index_key" ON "track_vote_rounds"("submission_id", "index");

-- CreateIndex
CREATE INDEX "votes_track_vote_round_id_idx" ON "votes"("track_vote_round_id");

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_track_vote_round_id_fkey" FOREIGN KEY ("track_vote_round_id") REFERENCES "track_vote_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_vote_rounds" ADD CONSTRAINT "track_vote_rounds_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_vote_rounds" ADD CONSTRAINT "track_vote_rounds_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
