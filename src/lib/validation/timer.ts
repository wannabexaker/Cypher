import { z } from "zod";

// Host-armed voting window controls. Minutes are bounded 1..1440 (1 min .. 24h).
const minutes = z.number().int().min(1).max(1440);

export const channelTimerSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("arm"), minutes }),
  z.object({ action: z.literal("extend"), minutes }),
  z.object({ action: z.literal("close") }),
]);

export type ChannelTimerInput = z.infer<typeof channelTimerSchema>;
