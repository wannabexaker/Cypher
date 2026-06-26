import { Prisma, type VoteChoice } from "@prisma/client";
import type { NextRequest } from "next/server";

import type { ChannelIdentity } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { hashHmac } from "@/lib/hash";
import { verifyTurnstile } from "@/lib/turnstile";

const DEFAULT_VOTE_IP_CAP = 40;
const MAX_TRANSACTION_ATTEMPTS = 3;

export class VoteIpCapError extends Error {}
export class VoteTurnstileError extends Error {}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  return firstForwarded || request.headers.get("x-real-ip")?.trim() || null;
}

function getVoteIpCap() {
  const configured = Number.parseInt(process.env.VOTE_IP_CAP ?? "", 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_VOTE_IP_CAP;
}

type CastWlVoteInput = {
  request: NextRequest;
  identity: ChannelIdentity;
  membershipId: string;
  channelId: string;
  submissionId: string;
  choice: VoteChoice;
  fingerprint?: string;
  turnstileToken?: string;
  dedupeKeyForIdentity: (identityKey: string) => string;
  roundId?: string;
  matchupId?: string;
  tallyWhere?: Prisma.VoteWhereInput;
  updateAfterVote?: (
    transaction: Prisma.TransactionClient,
    counts: { winCount: number; lossCount: number; total: number },
  ) => Promise<void>;
  auditMetadata?: Record<string, unknown>;
};

export type CastWlVoteResult = {
  created: boolean;
  locked: boolean;
  choice: VoteChoice;
  winCount: number;
  lossCount: number;
  total: number;
};

export async function castWlVote(input: CastWlVoteInput): Promise<CastWlVoteResult> {
  const clientIp = getClientIp(input.request);
  const ipHash = hashHmac(clientIp ?? "unknown");
  const fingerprintHash = input.fingerprint ? hashHmac(input.fingerprint) : null;
  const voterIdentity = input.identity.user
    ? `u:${input.identity.user.id}`
    : fingerprintHash
      ? `f:${fingerprintHash}`
      : `g:${input.identity.guestToken ?? "unknown"}`;
  const dedupeKey = input.dedupeKeyForIdentity(voterIdentity);

  const priorVote = await prisma.vote.findUnique({
    where: { dedupeKey },
    select: { choice: true },
  });

  if (
    !priorVote &&
    !(await verifyTurnstile({
      token: input.turnstileToken,
      remoteIp: clientIp ?? undefined,
    }))
  ) {
    throw new VoteTurnstileError();
  }

  const userAgent = input.request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const voteIpCap = getVoteIpCap();

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.vote.findUnique({
            where: { dedupeKey },
            select: { choice: true },
          });

          if (!existing) {
            const votesFromIp = await transaction.vote.count({
              where: {
                channelId: input.channelId,
                ipHash,
                isValid: true,
              },
            });
            if (votesFromIp >= voteIpCap) throw new VoteIpCapError();
          }

          if (!existing) {
            await transaction.vote.create({
              data: {
                channelId: input.channelId,
                submissionId: input.submissionId,
                roundId: input.roundId,
                matchupId: input.matchupId,
                voterUserId: input.identity.user?.id ?? null,
                ipHash,
                fingerprintHash,
                cookieToken: input.identity.guestToken,
                userAgent,
                dedupeKey,
                choice: input.choice,
                isValid: true,
              },
            });
          }

          const grouped = await transaction.vote.groupBy({
            by: ["choice"],
            where: {
              submissionId: input.submissionId,
              isValid: true,
              ...(input.tallyWhere ?? {}),
            },
            _count: { _all: true },
          });
          const winCount =
            grouped.find((group) => group.choice === "WIN")?._count._all ?? 0;
          const lossCount =
            grouped.find((group) => group.choice === "LOSS")?._count._all ?? 0;
          const total = winCount + lossCount;

          if (!existing && input.updateAfterVote) {
            await input.updateAfterVote(transaction, { winCount, lossCount, total });
          }

          if (!existing) {
            await transaction.auditLog.create({
              data: {
                actorUserId: input.identity.user?.id ?? null,
                action: "vote.cast",
                entityType: "submission",
                entityId: input.submissionId,
                ipHash,
                metadata: {
                  channelId: input.channelId,
                  submissionId: input.submissionId,
                  memberId: input.membershipId,
                  choice: input.choice,
                  ...(input.roundId ? { roundId: input.roundId } : {}),
                  ...(input.matchupId ? { matchupId: input.matchupId } : {}),
                  ...(input.auditMetadata ?? {}),
                },
              },
            });
          }

          return {
            created: existing === null,
            locked: existing !== null,
            choice: existing?.choice ?? input.choice,
            winCount,
            lossCount,
            total,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002") &&
        attempt < MAX_TRANSACTION_ATTEMPTS - 1
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to record this vote right now.");
}