import { expect, test } from "@playwright/test";

import { GUEST_DISPLAY_NAME_STORAGE_KEY } from "../../src/lib/guest-profile";

import {
  cleanupChannelFixture,
  createLeaderboardFixture,
  prisma,
} from "../support/database";

test("guest judge joins and casts independent W and L votes", async ({
  page,
}) => {
  const fixture = await createLeaderboardFixture({
    votingClosesAt: new Date(Date.now() + 10 * 60_000),
  });
  const guestName = `E2E Judge ${fixture.channel.code}`;

  try {
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: GUEST_DISPLAY_NAME_STORAGE_KEY, value: "Remembered Judge" },
    );
    await page.goto(`/c/${fixture.channel.code}`);
    await expect(page.getByLabel("Display name")).toHaveValue(
      "Remembered Judge",
    );
    await page.getByLabel("Display name").fill(guestName);
    await page.getByRole("button", { name: "Judge Vote, don't submit" }).click();
    await page.getByRole("button", { name: "Join room" }).click();
    await expect(page.getByText("You're in", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          GUEST_DISPLAY_NAME_STORAGE_KEY,
        ),
      )
      .toBe(guestName);

    await page.goto(
      `/c/${fixture.channel.code}/contest/${fixture.contest.id}`,
    );
    await expect(
      page.getByText("Voting is open — closes in", { exact: false }),
    ).toBeVisible();

    const trackList = page.getByRole("list").filter({
      has: page.getByRole("button", { name: "Vote Win" }),
    });
    const firstTrack = trackList
      .getByRole("listitem")
      .filter({ hasText: fixture.submissions[0].trackTitle });
    const secondTrack = trackList
      .getByRole("listitem")
      .filter({ hasText: fixture.submissions[1].trackTitle });
    await expect(firstTrack).toHaveCount(1);
    await expect(secondTrack).toHaveCount(1);

    await firstTrack.getByRole("button", { name: "Vote Win" }).click();
    await expect(firstTrack.getByText("You voted W.", { exact: true })).toBeVisible();

    const replay = await page.evaluate(
      async ({ channelCode, submissionId }) => {
        const response = await fetch(`/api/channels/${channelCode}/votes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            submissionId,
            choice: "LOSS",
            fingerprint: "rotated-e2e-fingerprint",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      {
        channelCode: fixture.channel.code,
        submissionId: fixture.submissions[0].id,
      },
    );
    expect(replay).toMatchObject({
      status: 200,
      body: { yourChoice: "WIN", locked: true },
    });

    await secondTrack.getByRole("button", { name: "Vote Loss" }).click();
    await expect(secondTrack.getByText("You voted L.", { exact: true })).toBeVisible();

    const member = await prisma.channelMember.findFirstOrThrow({
      where: { channelId: fixture.channel.id, displayName: guestName },
      select: { guestToken: true },
    });
    const votes = await prisma.vote.findMany({
      where: {
        contestId: fixture.contest.id,
        cookieToken: member.guestToken,
      },
    });
    expect(votes).toHaveLength(2);
    expect(votes.every((vote) => Boolean(vote.fingerprintHash))).toBe(true);
    expect(new Set(votes.map((vote) => vote.choice))).toEqual(
      new Set(["WIN", "LOSS"]),
    );
  } finally {
    await cleanupChannelFixture(fixture.channel.id, fixture.host.id);
  }
});
