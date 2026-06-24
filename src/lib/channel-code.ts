export const CHANNEL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeChannelCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

