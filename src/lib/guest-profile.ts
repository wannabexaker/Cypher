export const GUEST_DISPLAY_NAME_STORAGE_KEY =
  "cypher.guest.displayName";

type GuestStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeGuestDisplayName(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 30
    ? normalized
    : null;
}

export function readGuestDisplayName(storage?: GuestStorage) {
  try {
    const target = storage ??
      (typeof window === "undefined" ? undefined : window.localStorage);
    if (!target) return null;

    return normalizeGuestDisplayName(
      target.getItem(GUEST_DISPLAY_NAME_STORAGE_KEY),
    );
  } catch {
    // Browsers may disable storage in private or restricted contexts. Joining
    // still works because the signed guest cookie remains authoritative.
    return null;
  }
}

export function storeGuestDisplayName(
  value: unknown,
  storage?: GuestStorage,
) {
  const normalized = normalizeGuestDisplayName(value);
  if (!normalized) return false;

  try {
    const target = storage ??
      (typeof window === "undefined" ? undefined : window.localStorage);
    if (!target) return false;

    target.setItem(GUEST_DISPLAY_NAME_STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}
