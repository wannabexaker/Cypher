import { expect, test } from "@playwright/test";

test("security headers allow supported embeds and deny framing", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);

  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  const csp = headers["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("https://open.spotify.com");
  expect(csp).toContain("https://w.soundcloud.com");
  expect(csp).toContain("https://www.youtube.com");
});
