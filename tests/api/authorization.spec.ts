import { expect, test } from "@playwright/test";

test("protected channel creation rejects an anonymous caller", async ({
  request,
}) => {
  const response = await request.post("/api/channels", {
    data: {
      name: "Anonymous room",
      visibility: "UNLISTED",
      resultsVisibility: "LIVE",
      allowGuestUploads: true,
    },
  });

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: expect.any(String),
  });
});

test("invalid room codes fail closed", async ({ request }) => {
  const response = await request.post("/api/channels/INVALID0/join", {
    data: { displayName: "E2E Guest", participation: "JUDGE" },
  });
  expect(response.status()).toBe(404);
});
