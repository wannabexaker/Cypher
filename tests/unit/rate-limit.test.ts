import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enforceRateLimit,
  getRateLimitConfiguration,
  hashRateLimitIdentifier,
  RateLimitUnavailableError,
} from "@/lib/rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Redis rate-limit configuration", () => {
  it("requires both Upstash credentials", () => {
    expect(getRateLimitConfiguration({ NODE_ENV: "development" })).toEqual({
      configured: false,
      production: false,
      url: "",
      token: "",
    });
    expect(
      getRateLimitConfiguration({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).toMatchObject({ configured: true, production: true });
  });

  it("is optional outside production and mandatory in production", async () => {
    await expect(
      enforceRateLimit("vote-ip", "hashed", {
        environment: { NODE_ENV: "test" },
      }),
    ).resolves.toMatchObject({ enabled: false });

    await expect(
      enforceRateLimit("vote-ip", "hashed", {
        environment: { NODE_ENV: "production" },
      }),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});

describe("sliding-window decisions", () => {
  const production = {
    NODE_ENV: "production",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "token",
  };

  it("returns remaining budget for an allowed request", async () => {
    await expect(
      enforceRateLimit("join-ip", "hashed", {
        environment: production,
        execute: async () => ({
          success: true,
          limit: 30,
          remaining: 29,
          reset: 70_000,
        }),
      }),
    ).resolves.toEqual({ enabled: true, remaining: 29, reset: 70_000 });
  });

  it("returns a bounded Retry-After when blocked", async () => {
    const result = enforceRateLimit("join-ip", "hashed", {
      environment: production,
      now: 10_000,
      execute: async () => ({
        success: false,
        limit: 30,
        remaining: 0,
        reset: 70_000,
      }),
    });

    await expect(result).rejects.toMatchObject({
      retryAfterSeconds: 60,
    });
  });

  it("fails closed on Redis errors only in production", async () => {
    const execute = async () => {
      throw new Error("offline");
    };

    await expect(
      enforceRateLimit("vote-ip", "hashed", {
        environment: { NODE_ENV: "development" },
        execute,
      }),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      enforceRateLimit("vote-ip", "hashed", {
        environment: production,
        execute,
      }),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("never exposes the raw identifier", () => {
    vi.stubEnv("AUTH_SECRET", "unit-test-secret");
    const hashed = hashRateLimitIdentifier("203.0.113.4");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    expect(hashed).not.toContain("203.0.113.4");
  });
});
