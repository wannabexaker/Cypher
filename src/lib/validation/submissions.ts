import { z } from "zod";

import { MAX_UPLOAD_BYTES } from "@/lib/media";
import { channelCodeSchema } from "@/lib/validation/channels";

export const signUploadSchema = z.object({
  channelCode: channelCodeSchema,
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(["audio/mpeg", "audio/wav"]),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type SignUploadInput = z.infer<typeof signUploadSchema>;

const submissionMeta = {
  artistName: z.string().trim().min(1).max(60),
  trackTitle: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => value || undefined),
};

export const createSubmissionSchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("FILE"),
    mediaAssetId: z.string().uuid(),
    ...submissionMeta,
  }),
  z.object({
    sourceType: z.literal("EMBED"),
    externalUrl: z.string().trim().min(1).max(2048),
    ...submissionMeta,
  }),
]);

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const reviewSubmissionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  rejectionReason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || undefined),
});

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;
