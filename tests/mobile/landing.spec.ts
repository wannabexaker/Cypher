import { expect, test } from "@playwright/test";

test("landing remains usable on a phone-sized viewport", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Let the chat decide" }),
  ).toBeVisible();

  const hero = page.locator("#top");
  const create = hero.getByRole("link", { name: "Create a channel" });
  const join = hero.getByRole("link", { name: "Enter a code" });
  await expect(create).toBeVisible();
  await expect(join).toBeVisible();

  for (const target of [create, join]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
