-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "voting_closes_at" TIMESTAMP(3),
ADD COLUMN     "voting_opened_at" TIMESTAMP(3);
