import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTurnstileConfiguration,
  verifyTurnstile,
} from "@/lib/turnstile";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Turnstile enforcement", () => {
  it("is optional only in unconfigured non-production environments", async () => {
    await expect(
      verifyTurnstile({ environment: { NODE_ENV: "development" } }),
    ).resolves.toBe(true);
    await expect(
      verifyTurnstile({ environment: { NODE_ENV: "production" } }),
    ).resolves.toBe(false);
  });

  it("requires a token whenever a secret is configured", async () => {
    expect(
      getTurnstileConfiguration({
        NODE_ENV: "development",
        TURNSTILE_SECRET_KEY: "secret",
      }),
    ).toEqual({ secret: "secret", required: true });
    await expect(
      verifyTurnstile({
        environment: { TURNSTILE_SECRET_KEY: "secret" },
      }),
    ).resolves.toBe(false);
  });

  it("validates tokens server-side and forwards the platform IP", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyTurnstile({
        token: "challenge-token",
        remoteIp: "203.0.113.4",
        environment: { TURNSTILE_SECRET_KEY: "secret" },
      }),
    ).resolves.toBe(true);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(String(options.body)).toContain("response=challenge-token");
    expect(String(options.body)).toContain("remoteip=203.0.113.4");
  });

  it("fails closed on provider and network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("no", { status: 502 })),
    );
    await expect(
      verifyTurnstile({
        token: "challenge-token",
        environment: { TURNSTILE_SECRET_KEY: "secret" },
      }),
    ).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    await expect(
      verifyTurnstile({
        token: "challenge-token",
        environment: { TURNSTILE_SECRET_KEY: "secret" },
      }),
    ).resolves.toBe(false);
  });
});
