import { describe, expect, it } from "vitest";

import {
  GUEST_DISPLAY_NAME_STORAGE_KEY,
  normalizeGuestDisplayName,
  readGuestDisplayName,
  storeGuestDisplayName,
} from "@/lib/guest-profile";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(GUEST_DISPLAY_NAME_STORAGE_KEY, initial);
  }

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("guest display-name persistence", () => {
  it("normalizes names before storing them", () => {
    const storage = memoryStorage();

    expect(storeGuestDisplayName("  Night Shift  ", storage)).toBe(true);
    expect(readGuestDisplayName(storage)).toBe("Night Shift");
  });

  it.each([null, "", "x", "x".repeat(31)])(
    "rejects an invalid stored name: %s",
    (value) => {
      expect(normalizeGuestDisplayName(value)).toBeNull();
    },
  );

  it("fails open when browser storage is unavailable", () => {
    const blockedStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    expect(readGuestDisplayName(blockedStorage)).toBeNull();
    expect(storeGuestDisplayName("Night Shift", blockedStorage)).toBe(false);
  });

  it("is SSR-safe when window storage does not exist", () => {
    expect(readGuestDisplayName()).toBeNull();
    expect(storeGuestDisplayName("Night Shift")).toBe(false);
  });

  it("ignores invalid values already present in storage", () => {
    expect(readGuestDisplayName(memoryStorage("x"))).toBeNull();
    expect(storeGuestDisplayName("x", memoryStorage())).toBe(false);
  });
});
