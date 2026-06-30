import { describe, expect, it } from "vitest";

import {
  CHANNEL_CODE_ALPHABET,
  normalizeChannelCode,
} from "@/lib/channel-code";
import { channelCodeSchema } from "@/lib/validation/channels";

describe("channel codes", () => {
  it("normalizes spaces, dashes, casing, and surrounding whitespace", () => {
    expect(normalizeChannelCode("  w7-k z87 ")).toBe("W7KZ87");
  });

  it("uses an alphabet without ambiguous characters", () => {
    expect(CHANNEL_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it("accepts only normalized six-character codes", () => {
    expect(channelCodeSchema.parse("w7-kz87")).toBe("W7KZ87");
    expect(channelCodeSchema.safeParse("O01III").success).toBe(false);
    expect(channelCodeSchema.safeParse("ABC12").success).toBe(false);
  });
});
