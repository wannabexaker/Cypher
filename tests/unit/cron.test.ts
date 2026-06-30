import { describe, expect, it } from "vitest";

import { isCronAuthorized } from "@/lib/cron";

function request(authorization?: string) {
  return new Request("https://cypher.test/api/cron", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("cron authorization", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isCronAuthorized(request("Bearer expected"), "expected")).toBe(true);
    expect(isCronAuthorized(request("Bearer wrong"), "expected")).toBe(false);
    expect(isCronAuthorized(request(), "expected")).toBe(false);
  });

  it("fails closed when the secret is not configured", () => {
    expect(isCronAuthorized(request("Bearer expected"), "")).toBe(false);
  });
});
