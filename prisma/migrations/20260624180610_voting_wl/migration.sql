/*
  Warnings:

  - Added the required column `choice` to the `votes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('WIN', 'LOSS');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "loss_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "win_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "votes" ADD COLUMN     "choice" "VoteChoice" NOT NULL;
