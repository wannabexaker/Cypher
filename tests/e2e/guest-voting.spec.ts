import { expect, test } from "@playwright/test";

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
    await page.goto(`/c/${fixture.channel.code}`);
    await page.getByLabel("Display name").fill(guestName);
    await page.getByRole("button", { name: "Judge Vote, don't submit" }).click();
    await page.getByRole("button", { name: "Join room" }).click();
    await expect(page.getByText("You're in", { exact: true })).toBeVisible();

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
    expect(new Set(votes.map((vote) => vote.choice))).toEqual(
      new Set(["WIN", "LOSS"]),
    );
  } finally {
    await cleanupChannelFixture(fixture.channel.id, fixture.host.id);
  }
});
