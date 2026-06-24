-- CreateEnum
CREATE TYPE "ParticipationType" AS ENUM ('ARTIST', 'JUDGE');

-- AlterTable
ALTER TABLE "channel_members" ADD COLUMN     "participation" "ParticipationType";
