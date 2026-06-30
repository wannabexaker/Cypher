import { expect, test } from "@playwright/test";

import {
  cleanupChannelFixture,
  createConcurrentBattleFixture,
  prisma,
} from "../support/database";

test("battle votes remain scoped to their matchup contest", async ({
  request,
}) => {
  const fixture = await createConcurrentBattleFixture();
  const cookie = `cypher_guest=${fixture.guest.cookieValue}`;
  const voteUrl = `/api/channels/${fixture.channel.code}/battles/votes`;

  try {
    const winResponse = await request.post(voteUrl, {
      headers: {
        cookie,
        "x-forwarded-for": "203.0.113.31",
      },
      data: {
        matchupId: fixture.olderBattle.matchup.id,
        submissionId: fixture.submissions[0].id,
        choice: "WIN",
        fingerprint: "battle-device-a",
      },
    });
    expect(winResponse.status()).toBe(201);
    await expect(winResponse.json()).resolves.toMatchObject({
      yourChoice: "WIN",
      locked: false,
    });

    const lossResponse = await request.post(voteUrl, {
      headers: {
        cookie,
        "x-forwarded-for": "203.0.113.31",
      },
      data: {
        matchupId: fixture.olderBattle.matchup.id,
        submissionId: fixture.submissions[1].id,
        choice: "LOSS",
        fingerprint: "battle-device-a",
      },
    });
    expect(lossResponse.status()).toBe(201);
    await expect(lossResponse.json()).resolves.toMatchObject({
      yourChoice: "LOSS",
      locked: false,
    });

    const lockedResponse = await request.post(voteUrl, {
      headers: {
        cookie,
        "x-forwarded-for": "203.0.113.31",
      },
      data: {
        matchupId: fixture.olderBattle.matchup.id,
        submissionId: fixture.submissions[0].id,
        choice: "LOSS",
        fingerprint: "battle-device-b",
      },
    });
    expect(lockedResponse.status()).toBe(200);
    await expect(lockedResponse.json()).resolves.toMatchObject({
      yourChoice: "WIN",
      locked: true,
    });

    const votes = await prisma.vote.findMany({
      where: {
        matchupId: fixture.olderBattle.matchup.id,
        cookieToken: fixture.guest.guestToken,
      },
      orderBy: { submissionId: "asc" },
    });
    expect(votes).toHaveLength(2);
    expect(new Set(votes.map((vote) => vote.contestId))).toEqual(
      new Set([fixture.olderBattle.contest.id]),
    );
    expect(votes.some((vote) => vote.contestId === fixture.newerBattle.contest.id)).toBe(false);
  } finally {
    await cleanupChannelFixture(fixture.channel.id, fixture.host.id);
  }
});
