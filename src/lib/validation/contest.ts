import { ContestMode } from "@prisma/client";
import { z } from "zod";

// H16b: body for POST /api/channels/[channel]/contests. LEADERBOARD contests
// take no extra fields. BATTLE contests require a bracket size in {2,4,8,16}.
export const createContestSchema = z
  .object({
    mode: z.enum([ContestMode.LEADERBOARD, ContestMode.BATTLE]),
    bracketSize: z
      .union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)])
      .optional(),
  })
  .refine(
    (data) =>
      data.mode === ContestMode.LEADERBOARD || data.bracketSize !== undefined,
    {
      message: "BATTLE contests require a bracketSize.",
      path: ["bracketSize"],
    },
  );

export type CreateContestInput = z.infer<typeof createContestSchema>;
