import { ContestMode, ContestStatus, type Prisma, type PrismaClient } from "@prisma/client";

// H16a helpers — Channel-as-venue / Contest-as-event groundwork.
// Both helpers are deliberately small and side-effect free beyond the writes
// they describe, so call sites can fold them into existing transactions.

type Db = PrismaClient | Prisma.TransactionClient;

// Bump the channel's activity clock. The cron purge (15-day inactivity) reads
// this column; every write path that means "the room is alive" should call it.
export async function bumpChannelActivity(db: Db, channelId: string): Promise<void> {
  await db.channel.update({
    where: { id: channelId },
    data: { lastActivityAt: new Date() },
  });
}

// Return the currently active contest for a channel + mode, or null when no
// contest exists yet. "Active" = DRAFT or VOTING_OPEN, most recent first.
// Callers use this to stamp `contestId` on new votes / rounds.
export async function getActiveContest(
  db: Db,
  channelId: string,
  mode: ContestMode,
): Promise<{ id: string; status: ContestStatus } | null> {
  const contest = await db.contest.findFirst({
    where: {
      channelId,
      mode,
      status: { in: [ContestStatus.DRAFT, ContestStatus.VOTING_OPEN] },
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  return contest;
}
