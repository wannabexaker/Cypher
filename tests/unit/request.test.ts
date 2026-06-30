import { describe, expect, it } from "vitest";

import { getClientIp } from "@/lib/request";

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("https://cypher.test", { headers });
}

describe("client IP resolution", () => {
  it("prefers Cloudflare's canonical connecting IP outside Vercel", () => {
    expect(
      getClientIp(
        requestWithHeaders({
          "cf-connecting-ip": "203.0.113.4",
          "x-forwarded-for": "198.51.100.8, 198.51.100.9",
        }),
      ),
    ).toBe("203.0.113.4");
  });

  it("uses Vercel's platform header and ignores a conflicting Cloudflare header", () => {
    expect(
      getClientIp(
        requestWithHeaders({
          "cf-connecting-ip": "203.0.113.4",
          "x-vercel-forwarded-for": "198.51.100.12",
          "x-forwarded-for": "198.51.100.13",
        }),
        { VERCEL: "1" },
      ),
    ).toBe("198.51.100.12");
  });

  it("does not trust generic proxy headers when Vercel provenance is missing", () => {
    expect(
      getClientIp(
        requestWithHeaders({
          "cf-connecting-ip": "203.0.113.4",
          "x-real-ip": "192.0.2.7",
        }),
        { VERCEL: "1" },
      ),
    ).toBeNull();
  });

  it("uses the first forwarded address then the real-IP fallback", () => {
    expect(
      getClientIp(
        requestWithHeaders({
          "x-forwarded-for": " 198.51.100.8, 198.51.100.9 ",
        }),
      ),
    ).toBe("198.51.100.8");
    expect(
      getClientIp(requestWithHeaders({ "x-real-ip": "192.0.2.7" })),
    ).toBe("192.0.2.7");
  });

  it("returns null when the platform supplied no client address", () => {
    expect(getClientIp(requestWithHeaders({}))).toBeNull();
  });

  it("ignores malformed addresses", () => {
    expect(
      getClientIp(
        requestWithHeaders({
          "cf-connecting-ip": "attacker-controlled",
          "x-forwarded-for": "198.51.100.8",
        }),
      ),
    ).toBe("198.51.100.8");
  });
});
