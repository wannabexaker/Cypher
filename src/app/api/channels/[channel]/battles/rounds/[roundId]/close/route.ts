import {
  ChannelStatus,
  MatchupStatus,
  Prisma,
  RoundStatus,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { closeBattleRoundSchema } from "@/lib/validation/battle";
import { compareWinRatio, hasSameWinRatio } from "@/lib/votes";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string; roundId: string }>;
};

type Counts = {
  winCount: number;
  lossCount: number;
};

function key(matchupId: string, submissionId: string) {
  return `${matchupId}:${submissionId}`;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to close this battle round." },
      { status: 401 },
    );
  }

  const { channel: channelId, roundId } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid round close details." }, { status: 400 });
  }

  const parsed = closeBattleRoundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid round close details." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, hostId: true, status: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (!canManageChannel(user, channel)) {
    return NextResponse.json(
      { error: "Only the host can close a battle round." },
      { status: 403 },
    );
  }
  if (channel.status !== ChannelStatus.BATTLE) {
    return NextResponse.json(
      { error: "Battle rounds can only close while the room is in battle mode." },
      { status: 409 },
    );
  }

  const round = await prisma.battleRound.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      channelId: true,
      roundNumber: true,
      status: true,
      matchups: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          status: true,
          position: true,
          submissionAId: true,
          submissionBId: true,
        },
      },
    },
  });
  if (!round || round.channelId !== channel.id) {
    return NextResponse.json({ error: "Battle round not found." }, { status: 404 });
  }
  if (round.status !== RoundStatus.VOTING_OPEN) {
    return NextResponse.json(
      { error: "Only the open battle round can be closed." },
      { status: 409 },
    );
  }

  const matchupIds = round.matchups.map((matchup) => matchup.id);
  const grouped = matchupIds.length
    ? await prisma.vote.groupBy({
        by: ["matchupId", "submissionId", "choice"],
        where: {
          channelId: channel.id,
          roundId: round.id,
          isValid: true,
          matchupId: { in: matchupIds },
        },
        _count: { _all: true },
      })
    : [];

  const countsMap = new Map<string, Counts>();
  for (const row of grouped) {
    if (!row.matchupId) continue;
    const bucket = countsMap.get(key(row.matchupId, row.submissionId)) ?? {
      winCount: 0,
      lossCount: 0,
    };
    if (row.choice === "WIN") {
      bucket.winCount = row._count._all;
    } else {
      bucket.lossCount = row._count._all;
    }
    countsMap.set(key(row.matchupId, row.submissionId), bucket);
  }

  const picks = new Map<string, string>();
  for (const winner of parsed.data.winners ?? []) {
    if (!picks.has(winner.matchupId)) {
      picks.set(winner.matchupId, winner.submissionId);
    }
  }

  const tiedMatchupIds: string[] = [];
  const decided: Array<{ matchupId: string; winnerSubmissionId: string }> = [];

  for (const matchup of round.matchups) {
    if (
      matchup.status !== MatchupStatus.VOTING_OPEN ||
      !matchup.submissionBId
    ) {
      return NextResponse.json(
        { error: "Only open head-to-head matchups can be closed." },
        { status: 409 },
      );
    }

    const sideA = countsMap.get(key(matchup.id, matchup.submissionAId)) ?? {
      winCount: 0,
      lossCount: 0,
    };
    const sideB = countsMap.get(key(matchup.id, matchup.submissionBId)) ?? {
      winCount: 0,
      lossCount: 0,
    };

    if (hasSameWinRatio(sideA, sideB)) {
      const picked = picks.get(matchup.id);
      if (!picked) {
        tiedMatchupIds.push(matchup.id);
        continue;
      }
      if (picked !== matchup.submissionAId && picked !== matchup.submissionBId) {
        return NextResponse.json(
          { error: "Tie winner must belong to its matchup." },
          { status: 400 },
        );
      }
      decided.push({ matchupId: matchup.id, winnerSubmissionId: picked });
      continue;
    }

    decided.push({
      matchupId: matchup.id,
      winnerSubmissionId:
        compareWinRatio(sideA, sideB) > 0
          ? matchup.submissionAId
          : matchup.submissionBId,
    });
  }

  if (tiedMatchupIds.length > 0) {
    return NextResponse.json(
      {
        error: "Round has tied matchups that require host picks.",
        tiedMatchupIds,
      },
      { status: 409 },
    );
  }

  const now = new Date();

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await Promise.all(
          decided.map((item) =>
            transaction.matchup.update({
              where: { id: item.matchupId },
              data: {
                winnerSubmissionId: item.winnerSubmissionId,
                status: MatchupStatus.DECIDED,
              },
            }),
          ),
        );

        await transaction.battleRound.update({
          where: { id: round.id },
          data: { status: RoundStatus.CLOSED },
        });

        let championSubmissionId: string | null = null;
        let completed = false;
        let nextRoundId: string | null = null;

        const winners = decided.map((item) => item.winnerSubmissionId);
        if (winners.length === 1) {
          championSubmissionId = winners[0];
          completed = true;
          // H14: room is COMPLETED → stamp the 3-day retention cutoff so the
          // cron purge can sweep it. Hosts can still delete sooner.
          const purgeAfter = new Date(
            now.getTime() + 3 * 24 * 60 * 60 * 1000,
          );
          await transaction.channel.update({
            where: { id: channel.id },
            data: {
              championSubmissionId,
              status: ChannelStatus.COMPLETED,
              completedAt: now,
              purgeAfter,
            },
          });
        } else {
          const next = await transaction.battleRound.create({
            data: {
              channelId: channel.id,
              roundNumber: round.roundNumber + 1,
              status: RoundStatus.VOTING_OPEN,
            },
            select: { id: true },
          });
          nextRoundId = next.id;

          const nextPairs = Array.from(
            { length: winners.length / 2 },
            (_, index) => ({
              roundId: next.id,
              position: index,
              submissionAId: winners[index * 2],
              submissionBId: winners[index * 2 + 1],
              status: MatchupStatus.VOTING_OPEN,
            }),
          );
          await transaction.matchup.createMany({ data: nextPairs });
        }

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "battle.round_close",
            entityType: "battle_round",
            entityId: round.id,
            metadata: {
              roundNumber: round.roundNumber,
              winners: decided,
              completed,
              championSubmissionId,
              nextRoundId,
            },
          },
        });

        return {
          roundId: round.id,
          completed,
          championSubmissionId,
          nextRoundId,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Battle round close failed", error);
    return NextResponse.json(
      { error: "Unable to close this battle round right now." },
      { status: 500 },
    );
  }
}