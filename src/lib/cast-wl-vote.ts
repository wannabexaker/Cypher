import { Prisma, type VoteChoice } from "@prisma/client";
import type { NextRequest } from "next/server";

import type { ChannelIdentity } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { hashHmac } from "@/lib/hash";
import {
  enforceRateLimit,
  hashRateLimitIdentifier,
  RateLimitExceededError,
  RateLimitUnavailableError,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";

const DEFAULT_VOTE_IP_CAP = 40;
const MAX_TRANSACTION_ATTEMPTS = 3;

export class VoteIpCapError extends Error {}
export class VoteTurnstileError extends Error {}
export class VoteFingerprintError extends Error {}
export class VoteRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Vote rate limit exceeded.");
  }
}
export class VoteSecurityUnavailableError extends Error {}

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
  legacyDedupeKeysForIdentity?: (identityKey: string) => string[];
  roundId?: string;
  matchupId?: string;
  trackVoteRoundId?: string; // H13: for track round voting
  contestId?: string; // H16a: stamp the owning contest when one is active
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
  const guestToken = input.identity.guestToken;

  if (!input.identity.user && !guestToken) {
    throw new Error("A verified channel identity is required to vote.");
  }

  // The signed account/guest membership is authoritative. FingerprintJS is a
  // caller-controlled abuse signal and must never create a second identity.
  const voterIdentity = input.identity.user
    ? `u:${input.identity.user.id}`
    : `g:${guestToken}`;

  if (
    process.env.NODE_ENV === "production" &&
    !input.identity.user &&
    !fingerprintHash
  ) {
    throw new VoteFingerprintError();
  }

  try {
    const rateLimitChecks = [
      enforceRateLimit(
        "vote-ip",
        hashRateLimitIdentifier(`${input.channelId}:ip:${ipHash}`),
      ),
      enforceRateLimit(
        "vote-identity",
        hashRateLimitIdentifier(`${input.channelId}:${voterIdentity}`),
      ),
    ];
    if (fingerprintHash) {
      rateLimitChecks.push(
        enforceRateLimit(
          "vote-fingerprint",
          hashRateLimitIdentifier(
            `${input.channelId}:fingerprint:${fingerprintHash}`,
          ),
        ),
      );
    }
    await Promise.all(rateLimitChecks);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      throw new VoteRateLimitError(error.retryAfterSeconds);
    }
    if (error instanceof RateLimitUnavailableError) {
      throw new VoteSecurityUnavailableError();
    }
    throw error;
  }
  const dedupeKey = input.dedupeKeyForIdentity(voterIdentity);
  const acceptedDedupeKeys = [
    dedupeKey,
    ...(input.legacyDedupeKeysForIdentity?.(voterIdentity) ?? []),
  ];
  const voteContextWhere: Prisma.VoteWhereInput = input.matchupId
    ? { matchupId: input.matchupId }
    : input.trackVoteRoundId
      ? { trackVoteRoundId: input.trackVoteRoundId }
      : input.contestId
        ? {
            contestId: input.contestId,
            matchupId: null,
            trackVoteRoundId: null,
          }
        : {};
  const membershipVoteWhere: Prisma.VoteWhereInput = {
    channelId: input.channelId,
    submissionId: input.submissionId,
    ...voteContextWhere,
    ...(input.identity.user
      ? { voterUserId: input.identity.user.id }
      : { cookieToken: guestToken }),
  };
  const existingVoteWhere: Prisma.VoteWhereInput = {
    OR: [
      {
        dedupeKey: { in: acceptedDedupeKeys },
        submissionId: input.submissionId,
      },
      membershipVoteWhere,
    ],
  };

  const priorVote = await prisma.vote.findFirst({
    where: existingVoteWhere,
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
          const existing = await transaction.vote.findFirst({
            where: existingVoteWhere,
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
                trackVoteRoundId: input.trackVoteRoundId,
                contestId: input.contestId,
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
                  ...(input.trackVoteRoundId ? { trackVoteRoundId: input.trackVoteRoundId } : {}),
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
