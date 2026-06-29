import { randomBytes, randomUUID } from "node:crypto";

import {
  ChannelStatus,
  ContestMode,
  ContestStatus,
  MatchupStatus,
  MemberRole,
  ParticipationType,
  PrismaClient,
  ResultsVisibility,
  RoundStatus,
  SourceType,
  SubmissionStatus,
} from "@prisma/client";

import { createGuestSession } from "../../src/lib/guest-session";
import { hashPassword } from "../../src/lib/password";

export const prisma = new PrismaClient();
export const E2E_PASSWORD = "E2e-Pass-123!";

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 10);
}

function channelCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return [...bytes]
    .map((value) => alphabet[value % alphabet.length])
    .join("");
}

async function createHost(withPassword = false) {
  const id = suffix();
  return prisma.user.create({
    data: {
      email: `e2e_${id}@example.test`,
      username: `e2e_${id}`.slice(0, 20),
      displayName: `E2E Host ${id}`,
      passwordHash: withPassword ? await hashPassword(E2E_PASSWORD) : null,
    },
  });
}

async function createRoomBase(withPassword = false) {
  const host = await createHost(withPassword);
  const code = channelCode();
  const channel = await prisma.channel.create({
    data: {
      code,
      name: `E2E Room ${suffix()}`,
      hostId: host.id,
      status: ChannelStatus.OPEN,
      allowGuestUploads: true,
      allowGuestVotes: true,
      requireLoginToVote: false,
      resultsVisibility: ResultsVisibility.LIVE,
      members: {
        create: {
          userId: host.id,
          displayName: host.displayName ?? host.username,
          role: MemberRole.HOST,
        },
      },
    },
  });

  const artist = await prisma.channelMember.create({
    data: {
      channelId: channel.id,
      guestToken: `artist_${suffix()}`,
      displayName: "E2E Artist",
      role: MemberRole.MEMBER,
      participation: ParticipationType.ARTIST,
    },
  });

  const submissions = await Promise.all(
    ["First Track", "Second Track", "Third Track", "Fourth Track"].map(
      (trackTitle, index) =>
        prisma.submission.create({
          data: {
            channelId: channel.id,
            submitterMemberId: artist.id,
            artistName: "E2E Artist",
            trackTitle: `${trackTitle} ${suffix()}`,
            sourceType: SourceType.YOUTUBE,
            externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            status: SubmissionStatus.APPROVED,
            description: `E2E submission ${index + 1}`,
          },
        }),
    ),
  );

  return { host, channel, artist, submissions };
}

export async function createLeaderboardFixture(options?: {
  withPassword?: boolean;
  votingClosesAt?: Date | null;
}) {
  const base = await createRoomBase(options?.withPassword);
  const contest = await prisma.contest.create({
    data: {
      channelId: base.channel.id,
      mode: ContestMode.LEADERBOARD,
      status: ContestStatus.VOTING_OPEN,
      number: 1,
      votingClosesAt: options?.votingClosesAt ?? null,
      resultsVisibility: ResultsVisibility.LIVE,
      participants: {
        create: base.submissions.slice(0, 2).map((submission, index) => ({
          submissionId: submission.id,
          seed: index + 1,
        })),
      },
    },
  });

  return { ...base, contest };
}

export async function createConcurrentBattleFixture() {
  const base = await createRoomBase();
  const guest = createGuestSession();
  const voter = await prisma.channelMember.create({
    data: {
      channelId: base.channel.id,
      guestToken: guest.guestToken,
      displayName: "E2E Judge",
      role: MemberRole.MEMBER,
      participation: ParticipationType.JUDGE,
    },
  });

  async function createBattle(number: number, createdAt: Date) {
    const contest = await prisma.contest.create({
      data: {
        channelId: base.channel.id,
        mode: ContestMode.BATTLE,
        status: ContestStatus.VOTING_OPEN,
        number,
        bracketSize: 2,
        createdAt,
        resultsVisibility: ResultsVisibility.LIVE,
        participants: {
          create: base.submissions.slice(0, 2).map((submission, index) => ({
            submissionId: submission.id,
            seed: index + 1,
          })),
        },
      },
    });
    const round = await prisma.battleRound.create({
      data: {
        channelId: base.channel.id,
        contestId: contest.id,
        roundNumber: 1,
        status: RoundStatus.VOTING_OPEN,
      },
    });
    const matchup = await prisma.matchup.create({
      data: {
        roundId: round.id,
        position: 0,
        submissionAId: base.submissions[0].id,
        submissionBId: base.submissions[1].id,
        status: MatchupStatus.VOTING_OPEN,
      },
    });
    return { contest, round, matchup };
  }

  const olderBattle = await createBattle(1, new Date(Date.now() - 60_000));
  const newerBattle = await createBattle(2, new Date());

  return {
    ...base,
    guest,
    voter,
    olderBattle,
    newerBattle,
  };
}

export async function cleanupChannelFixture(channelId: string, hostId: string) {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: hostId },
        { metadata: { path: ["channelId"], equals: channelId } },
      ],
    },
  });
  // Matchup submission FKs are intentionally restrictive in the production
  // schema. Remove matchups first so the channel cascade can delete both the
  // battle rounds and their referenced submissions without an FK race.
  await prisma.matchup.deleteMany({
    where: { round: { channelId } },
  });
  await prisma.channel.deleteMany({ where: { id: channelId } });
  await prisma.user.deleteMany({ where: { id: hostId } });
}

export async function cleanupRegisteredHost(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, hostedChannels: { select: { id: true } } },
  });
  if (!user) return;

  for (const channel of user.hostedChannels) {
    await prisma.auditLog.deleteMany({
      where: { metadata: { path: ["channelId"], equals: channel.id } },
    });
    await prisma.matchup.deleteMany({
      where: { round: { channelId: channel.id } },
    });
  }
  await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
  await prisma.channel.deleteMany({ where: { hostId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
}
