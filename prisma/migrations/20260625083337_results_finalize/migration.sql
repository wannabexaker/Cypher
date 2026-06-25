-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "champion_submission_id" TEXT,
ADD COLUMN     "completed_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_champion_submission_id_fkey" FOREIGN KEY ("champion_submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
