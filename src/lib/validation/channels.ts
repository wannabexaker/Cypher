import {
  ChannelStatus,
  ChannelVisibility,
  MemberRole,
  ParticipationType,
} from "@prisma/client";
import { z } from "zod";

import { normalizeChannelCode } from "@/lib/channel-code";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const channelCodeSchema = z
  .string()
  .transform((value) => normalizeChannelCode(value))
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/));

const editableChannelFieldsSchema = z.object({
  name: z.string().trim().min(2).max(60),
  tagline: optionalText(80),
  description: optionalText(2000),
  rules: optionalText(4000),
  genre: optionalText(30),
  visibility: z.enum([
    ChannelVisibility.PUBLIC,
    ChannelVisibility.UNLISTED,
  ]),
  allowGuestUploads: z.boolean(),
});

export const createChannelSchema = editableChannelFieldsSchema.extend({
  visibility: z
    .enum([ChannelVisibility.PUBLIC, ChannelVisibility.UNLISTED])
    .default(ChannelVisibility.UNLISTED),
  allowGuestUploads: z.boolean().default(false),
});

export const updateChannelSchema = editableChannelFieldsSchema
  .partial()
  .extend({
    status: z
      .enum([ChannelStatus.DRAFT, ChannelStatus.OPEN])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const participationSchema = z.enum([
  ParticipationType.ARTIST,
  ParticipationType.JUDGE,
]);

export const joinChannelSchema = z.object({
  displayName: z.string().trim().min(2).max(30).optional(),
  participation: participationSchema.optional(),
});

// Host/ADMIN promote or demote a member. HOST is never a valid target value.
export const updateMemberRoleSchema = z.object({
  role: z.enum([MemberRole.MODERATOR, MemberRole.MEMBER]),
});
