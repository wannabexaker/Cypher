-- H16a contest foundation: additive schema for the Channel-as-venue model.
-- Channels become persistent; each Contest captures one round of activity
-- (LEADERBOARD = open submissions + votes; BATTLE = single-elim bracket).
-- All additions are nullable/defaulted so existing rows stay valid and
-- existing flows keep working without resolving a contest first.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "ContestMode" AS ENUM ('BATTLE', 'LEADERBOARD');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'VOTING_OPEN', 'COMPLETED');

-- CreateTable
CREATE TABLE "contests" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "mode" "ContestMode" NOT NULL,
    "status" "ContestStatus" NOT NULL DEFAULT 'DRAFT',
    "bracket_size" INTEGER,
    "title" TEXT,
    "voting_closes_at" TIMESTAMP(3),
    "champion_submission_id" TEXT,
    "ranking_snapshot" JSONB,
    "results_visibility" "ResultsVisibility" NOT NULL DEFAULT 'AFTER_CLOSE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_participants" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "seed" INTEGER,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "eliminated_round" INTEGER,

    CONSTRAINT "contest_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contests_channel_id_mode_status_idx" ON "contests"("channel_id", "mode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contest_participants_contest_id_submission_id_key" ON "contest_participants"("contest_id", "submission_id");

-- CreateIndex
CREATE INDEX "contest_participants_submission_id_idx" ON "contest_participants"("submission_id");

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: H16a 15-day inactivity retention.
ALTER TABLE "channels" ADD COLUMN "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "channels_last_activity_at_idx" ON "channels"("last_activity_at");

-- AlterTable: nullable contest stamps on existing vote/round rows.
ALTER TABLE "votes" ADD COLUMN "contest_id" TEXT;
ALTER TABLE "track_vote_rounds" ADD COLUMN "contest_id" TEXT;
ALTER TABLE "battle_rounds" ADD COLUMN "contest_id" TEXT;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "track_vote_rounds" ADD CONSTRAINT "track_vote_rounds_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "battle_rounds" ADD CONSTRAINT "battle_rounds_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "votes_contest_id_is_valid_idx" ON "votes"("contest_id", "is_valid");
CREATE INDEX "track_vote_rounds_contest_id_idx" ON "track_vote_rounds"("contest_id");
CREATE INDEX "battle_rounds_contest_id_idx" ON "battle_rounds"("contest_id");

-- Backfill: preserve the existing "last report" test data.
-- For each existing channel, materialize the contests that already implicitly
-- ran inside it so reads on the new shape match what was rendered before.
DO $$
DECLARE
    ch RECORD;
    leaderboard_id TEXT;
    leaderboard_status "ContestStatus";
    battle_id TEXT;
    battle_status "ContestStatus";
    seed_count INTEGER;
BEGIN
    FOR ch IN
        SELECT "id", "status", "champion_submission_id",
               "completed_at", "voting_closes_at",
               "results_visibility", "created_at"
        FROM "channels"
        ORDER BY "created_at" ASC
    LOOP
        -- Did this channel ever run a battle bracket? Drives champion attribution.
        SELECT COUNT(*)::int / 2 INTO seed_count
        FROM "matchups" m
        JOIN "battle_rounds" br ON br."id" = m."round_id"
        WHERE br."channel_id" = ch."id" AND br."round_number" = 1;
        -- Each matchup contributes 2 seeded submissions; bracketSize = seeded count.
        seed_count := seed_count * 2;

        leaderboard_status := CASE WHEN ch."status" = 'COMPLETED' AND seed_count = 0
                                    THEN 'COMPLETED'::"ContestStatus"
                                    ELSE 'VOTING_OPEN'::"ContestStatus"
                               END;

        -- One LEADERBOARD contest per channel — owns channel-wide votes +
        -- TrackVoteRounds + the existing approved submissions.
        leaderboard_id := gen_random_uuid()::text;
        INSERT INTO "contests" (
            "id", "channel_id", "mode", "status", "bracket_size",
            "title", "voting_closes_at", "champion_submission_id",
            "ranking_snapshot", "results_visibility", "created_at", "completed_at"
        ) VALUES (
            leaderboard_id, ch."id", 'LEADERBOARD', leaderboard_status, NULL,
            NULL, ch.voting_closes_at,
            CASE WHEN seed_count > 0 THEN NULL ELSE ch.champion_submission_id END,
            NULL, ch.results_visibility, ch.created_at,
            CASE WHEN leaderboard_status = 'COMPLETED' THEN ch.completed_at ELSE NULL END
        );

        -- Participants = every APPROVED submission, carrying current W/L.
        INSERT INTO "contest_participants" ("id", "contest_id", "submission_id", "wins", "losses")
        SELECT gen_random_uuid()::text, leaderboard_id, s."id", s."win_count", s."loss_count"
        FROM "submissions" s
        WHERE s."channel_id" = ch."id" AND s."status" = 'APPROVED';

        -- Attach votes that came in through channel-wide voting or track rounds.
        UPDATE "votes"
        SET "contest_id" = leaderboard_id
        WHERE "channel_id" = ch."id"
          AND "round_id" IS NULL
          AND "matchup_id" IS NULL;

        UPDATE "track_vote_rounds"
        SET "contest_id" = leaderboard_id
        WHERE "channel_id" = ch."id";

        -- BATTLE contest only when the channel actually ran a bracket.
        IF seed_count > 0 THEN
            battle_status := CASE WHEN ch."status" = 'COMPLETED'
                                  THEN 'COMPLETED'::"ContestStatus"
                                  ELSE 'VOTING_OPEN'::"ContestStatus"
                             END;
            battle_id := gen_random_uuid()::text;
            INSERT INTO "contests" (
                "id", "channel_id", "mode", "status", "bracket_size",
                "title", "voting_closes_at", "champion_submission_id",
                "ranking_snapshot", "results_visibility", "created_at", "completed_at"
            ) VALUES (
                battle_id, ch."id", 'BATTLE', battle_status, seed_count,
                NULL, NULL, ch.champion_submission_id,
                NULL, ch.results_visibility, ch.created_at,
                CASE WHEN battle_status = 'COMPLETED' THEN ch.completed_at ELSE NULL END
            );

            -- Seed = position in round 1, A then B (left-then-right of pair).
            INSERT INTO "contest_participants" ("id", "contest_id", "submission_id", "seed")
            SELECT gen_random_uuid()::text, battle_id, sub_id, seed
            FROM (
                SELECT m."submission_a_id" AS sub_id, (m."position" * 2 + 1) AS seed
                FROM "matchups" m
                JOIN "battle_rounds" br ON br."id" = m."round_id"
                WHERE br."channel_id" = ch."id" AND br."round_number" = 1
                UNION ALL
                SELECT m."submission_b_id", (m."position" * 2 + 2)
                FROM "matchups" m
                JOIN "battle_rounds" br ON br."id" = m."round_id"
                WHERE br."channel_id" = ch."id"
                  AND br."round_number" = 1
                  AND m."submission_b_id" IS NOT NULL
            ) seeded
            ON CONFLICT ("contest_id", "submission_id") DO NOTHING;

            -- Attach the battle's rounds + matchup votes.
            UPDATE "battle_rounds"
            SET "contest_id" = battle_id
            WHERE "channel_id" = ch."id";

            UPDATE "votes"
            SET "contest_id" = battle_id
            WHERE "channel_id" = ch."id"
              AND "round_id" IS NOT NULL;
        END IF;

        -- Reset activity clock so existing rooms aren't immediately purged
        -- under the new 15-day inactivity rule.
        UPDATE "channels" SET "last_activity_at" = CURRENT_TIMESTAMP WHERE "id" = ch."id";
    END LOOP;
END $$;
