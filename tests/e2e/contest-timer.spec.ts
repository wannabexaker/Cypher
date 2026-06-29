import { expect, test } from "@playwright/test";

import {
  cleanupChannelFixture,
  createLeaderboardFixture,
  E2E_PASSWORD,
  prisma,
} from "../support/database";

test("host arms and closes a contest timer with an in-app banner", async ({
  page,
}) => {
  const fixture = await createLeaderboardFixture({ withPassword: true });

  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(fixture.host.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto(
      `/c/${fixture.channel.code}/contest/${fixture.contest.id}`,
    );
    await page.getByRole("button", { name: "1 min" }).click();
    await expect(
      page.getByText("Voting is open — closes in", { exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Close voting now" }).click();
    await expect(
      page
        .getByRole("status")
        .getByText("Voting has closed for this contest.", { exact: true }),
    ).toBeVisible();

    await expect
      .poll(() =>
        prisma.auditLog.count({
          where: {
            entityId: fixture.contest.id,
            action: "contest.voting_window",
          },
        }),
      )
      .toBe(2);
  } finally {
    await cleanupChannelFixture(fixture.channel.id, fixture.host.id);
  }
});
