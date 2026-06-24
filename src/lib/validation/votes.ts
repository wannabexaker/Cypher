import { VoteChoice } from "@prisma/client";
import { z } from "zod";

export const castVoteSchema = z.object({
  submissionId: z.string().uuid(),
  choice: z.enum([VoteChoice.WIN, VoteChoice.LOSS]),
  fingerprint: z.string().trim().min(1).max(512).optional(),
  turnstileToken: z.string().trim().min(1).max(2048).optional(),
});

export type CastVoteInput = z.infer<typeof castVoteSchema>;
