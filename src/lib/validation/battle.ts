import { VoteChoice } from "@prisma/client";
import { z } from "zod";

export const createBattleSchema = z.object({
  k: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
});

export const castBattleVoteSchema = z.object({
  matchupId: z.string().uuid(),
  submissionId: z.string().uuid(),
  choice: z.enum([VoteChoice.WIN, VoteChoice.LOSS]),
  fingerprint: z.string().trim().min(1).max(512).optional(),
  turnstileToken: z.string().trim().min(1).max(2048).optional(),
});

export const closeBattleRoundSchema = z.object({
  winners: z
    .array(
      z.object({
        matchupId: z.string().uuid(),
        submissionId: z.string().uuid(),
      }),
    )
    .optional(),
});

export type CreateBattleInput = z.infer<typeof createBattleSchema>;
export type CastBattleVoteInput = z.infer<typeof castBattleVoteSchema>;
export type CloseBattleRoundInput = z.infer<typeof closeBattleRoundSchema>;