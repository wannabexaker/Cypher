import { VoteChoice } from "@prisma/client";
import { z } from "zod";

export const castVoteSchema = z.object({
  submissionId: z.string().uuid(),
  choice: z.enum([VoteChoice.WIN, VoteChoice.LOSS]),
  fingerprint: z.string().trim().min(1).max(512).optional(),
  turnstileToken: z.string().trim().min(1).max(2048).optional(),
  // H20a: optional explicit contest id. When omitted the votes route falls
  // back to "the one active LEADERBOARD contest" if exactly one exists; with
  // two or more it returns 400 {code:"CONTEST_REQUIRED"} so the UI can ask.
  contestId: z.string().uuid().optional(),
});

export type CastVoteInput = z.infer<typeof castVoteSchema>;

