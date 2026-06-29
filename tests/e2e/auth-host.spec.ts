import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { cleanupRegisteredHost } from "../support/database";

test("host can register, create and open a room, then sign out", async ({
  page,
}) => {
  const id = randomUUID().replaceAll("-", "").slice(0, 10);
  const email = `e2e_ui_${id}@example.test`;
  const username = `e2e_ui_${id}`.slice(0, 20);

  try {
    await page.goto("/register");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill("E2e-Pass-123!");
    const callbackResponse = page.waitForResponse((response) =>
      response.url().includes("/api/auth/callback/credentials"),
    );
    await page.getByRole("button", { name: "Create host account" }).click();
    await callbackResponse;
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "authjs.session-token",
      ),
    ).toBe(true);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(`@${username}`)).toBeVisible();

    await page.goto("/dashboard/channels/new");
    await page.getByLabel("Channel name", { exact: true }).fill(`E2E UI Room ${id}`);
    await page.getByLabel("Allow guest members").check();
    await page.getByRole("button", { name: "Create channel" }).click();

    await expect(page).toHaveURL(/\/dashboard\/channels\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: "Open the room" }).click();
    await expect(page.getByRole("button", { name: "Close the room" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  } finally {
    await cleanupRegisteredHost(email);
  }
});
