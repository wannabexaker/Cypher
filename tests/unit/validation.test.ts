import {
  ContestMode,
  MemberRole,
  ParticipationType,
  VoteChoice,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  castBattleVoteSchema,
  closeBattleRoundSchema,
  createBattleSchema,
} from "@/lib/validation/battle";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import {
  createChannelSchema,
  joinChannelSchema,
  updateChannelSchema,
  updateMemberRoleSchema,
} from "@/lib/validation/channels";
import { createContestSchema } from "@/lib/validation/contest";
import { finalizeChannelSchema } from "@/lib/validation/finalize";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from "@/lib/validation/push";
import {
  createSubmissionSchema,
  reviewSubmissionSchema,
  signUploadSchema,
} from "@/lib/validation/submissions";
import { contestTimerSchema } from "@/lib/validation/timer";
import { castVoteSchema } from "@/lib/validation/votes";

const UUID_1 = "00000000-0000-4000-8000-000000000001";
const UUID_2 = "00000000-0000-4000-8000-000000000002";

describe("auth validation", () => {
  it("normalizes email and username while enforcing password length", () => {
    expect(
      registerSchema.parse({
        email: " HOST@EXAMPLE.COM ",
        username: " E2E_HOST ",
        password: "password123",
      }),
    ).toMatchObject({ email: "host@example.com", username: "e2e_host" });
    expect(
      loginSchema.safeParse({ email: "host@example.com", password: "short" })
        .success,
    ).toBe(false);
  });
});

describe("channel validation", () => {
  it("applies safe room defaults and rejects empty patches", () => {
    expect(createChannelSchema.parse({ name: "E2E Room" })).toMatchObject({
      visibility: "UNLISTED",
      resultsVisibility: "LIVE",
      allowGuestUploads: false,
    });
    expect(updateChannelSchema.safeParse({}).success).toBe(false);
    expect(updateChannelSchema.safeParse({ status: "OPEN" }).success).toBe(true);
  });

  it("bounds membership input and prevents HOST promotion", () => {
    expect(
      joinChannelSchema.safeParse({
        displayName: "E2E Judge",
        participation: ParticipationType.JUDGE,
      }).success,
    ).toBe(true);
    expect(
      updateMemberRoleSchema.safeParse({ role: MemberRole.MODERATOR }).success,
    ).toBe(true);
    expect(updateMemberRoleSchema.safeParse({ role: MemberRole.HOST }).success).toBe(false);
  });
});

describe("contest validation", () => {
  it("requires a supported bracket size for battles", () => {
    expect(
      createContestSchema.safeParse({ mode: ContestMode.BATTLE }).success,
    ).toBe(false);
    expect(
      createContestSchema.safeParse({
        mode: ContestMode.BATTLE,
        bracketSize: 4,
      }).success,
    ).toBe(true);
    expect(
      createContestSchema.safeParse({
        mode: ContestMode.BATTLE,
        bracketSize: 3,
      }).success,
    ).toBe(false);
  });
});

describe("vote validation", () => {
  it("accepts only WIN or LOSS choices", () => {
    expect(
      castVoteSchema.safeParse({
        submissionId: UUID_1,
        choice: VoteChoice.WIN,
      }).success,
    ).toBe(true);
    expect(
      castVoteSchema.safeParse({
        submissionId: UUID_1,
        choice: "DRAW",
      }).success,
    ).toBe(false);
  });

  it("requires battle votes to identify a matchup and submission", () => {
    expect(
      castBattleVoteSchema.safeParse({
        matchupId: UUID_1,
        submissionId: UUID_2,
        choice: VoteChoice.LOSS,
      }).success,
    ).toBe(true);
    expect(
      castBattleVoteSchema.safeParse({
        submissionId: UUID_2,
        choice: VoteChoice.LOSS,
      }).success,
    ).toBe(false);
  });
});

describe("battle and finalize validation", () => {
  it("accepts supported bracket sizes and validates tie picks", () => {
    expect(createBattleSchema.safeParse({ k: 8 }).success).toBe(true);
    expect(createBattleSchema.safeParse({ k: 3 }).success).toBe(false);
    expect(
      closeBattleRoundSchema.safeParse({
        winners: [{ matchupId: UUID_1, submissionId: UUID_2 }],
      }).success,
    ).toBe(true);
    expect(
      finalizeChannelSchema.safeParse({ championSubmissionId: UUID_1 }).success,
    ).toBe(true);
  });
});

describe("submission validation", () => {
  it("validates bounded upload metadata", () => {
    expect(
      signUploadSchema.safeParse({
        channelCode: "W7KZ87",
        filename: "track.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 1024,
      }).success,
    ).toBe(true);
    expect(
      signUploadSchema.safeParse({
        channelCode: "W7KZ87",
        filename: "track.exe",
        mimeType: "application/octet-stream",
        sizeBytes: 1024,
      }).success,
    ).toBe(false);
  });

  it("keeps file and embed payloads discriminated", () => {
    expect(
      createSubmissionSchema.safeParse({
        sourceType: "FILE",
        mediaAssetId: UUID_1,
        artistName: "Artist",
        trackTitle: "Track",
      }).success,
    ).toBe(true);
    expect(
      createSubmissionSchema.safeParse({
        sourceType: "EMBED",
        externalUrl: "https://youtu.be/dQw4w9WgXcQ",
        artistName: "Artist",
        trackTitle: "Track",
      }).success,
    ).toBe(true);
    expect(
      reviewSubmissionSchema.parse({ decision: "REJECT", rejectionReason: " " }),
    ).toEqual({ decision: "REJECT", rejectionReason: undefined });
  });
});

describe("timer and push validation", () => {
  it("bounds timer changes", () => {
    expect(contestTimerSchema.safeParse({ action: "arm", minutes: 1 }).success).toBe(true);
    expect(contestTimerSchema.safeParse({ action: "extend", minutes: 1441 }).success).toBe(false);
    expect(contestTimerSchema.safeParse({ action: "close" }).success).toBe(true);
  });

  it("validates browser push subscription shapes", () => {
    const endpoint = "https://push.example.test/subscription";
    expect(
      pushSubscribeSchema.safeParse({
        endpoint,
        keys: { p256dh: "key", auth: "auth" },
      }).success,
    ).toBe(true);
    expect(pushUnsubscribeSchema.safeParse({ endpoint }).success).toBe(true);
    expect(pushSubscribeSchema.safeParse({ endpoint: "not-a-url", keys: {} }).success).toBe(false);
  });
});
