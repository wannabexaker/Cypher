import { expect, test } from "@playwright/test";

test("security headers restrict framing to Olamov and allow supported embeds", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);

  const headers = response.headers();

  // X-Frame-Options is intentionally NOT set: framing is governed solely by the
  // CSP frame-ancestors allowlist below. XFO cannot express an allowlist, and a
  // hard `DENY` alongside frame-ancestors would block the Olamov OS embed.
  expect(headers["x-frame-options"]).toBeUndefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  const csp = headers["content-security-policy"];
  // Only Olamov properties may frame the app; any other origin stays blocked
  // (clickjacking mitigated), and `'none'` must be gone so the embed can load.
  expect(csp).toContain(
    "frame-ancestors 'self' https://olamov.com https://*.olamov.com",
  );
  expect(csp).not.toContain("frame-ancestors 'none'");

  // Supported media embeds remain allowed.
  expect(csp).toContain("https://open.spotify.com");
  expect(csp).toContain("https://w.soundcloud.com");
  expect(csp).toContain("https://www.youtube.com");
});
