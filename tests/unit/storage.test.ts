import { describe, expect, it } from "vitest";

import {
  buildFinalStorageKey,
  buildUploadStorageKey,
  isFinalStorageKey,
} from "../../src/lib/storage";

describe("media storage namespaces", () => {
  it("separates caller-writable staging keys from server-only final keys", () => {
    const stagingKey = buildUploadStorageKey("audio/mpeg");
    const finalKey = buildFinalStorageKey("audio/mpeg");

    expect(stagingKey).toMatch(
      /^media\/staging\/[0-9a-f-]{36}\.mp3$/,
    );
    expect(finalKey).toMatch(/^media\/final\/[0-9a-f-]{36}\.mp3$/);
    expect(isFinalStorageKey(stagingKey)).toBe(false);
    expect(isFinalStorageKey(finalKey)).toBe(true);
  });
});
