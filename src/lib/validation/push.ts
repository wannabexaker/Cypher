import { z } from "zod";

// A browser PushSubscription serialized for the server. Endpoints and keys are
// length-capped to keep untrusted input bounded before it reaches the database.
export const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().url().max(1024),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(256),
    auth: z.string().trim().min(1).max(256),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().url().max(1024),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
