-- H22 fix #6: BattleRound was uniquely keyed by (channel_id, round_number),
-- which blocked starting a 2nd BATTLE contest in the same channel (round 1
-- already existed). Move the uniqueness onto (contest_id, round_number) so
-- each contest gets its own round-number namespace. Legacy rows with
-- contest_id IS NULL are fine: Postgres treats NULLs as distinct in unique
-- indexes, so they never collide. H16a's backfill ensured every live round
-- already has a contest_id.

-- DropIndex
DROP INDEX "battle_rounds_channel_id_round_number_key";

-- AlterTable: add a plain channel_id index since channel-scoped lookups
-- (stats counts, ownership guards) lose the previous compound index.
CREATE INDEX "battle_rounds_channel_id_idx" ON "battle_rounds"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "battle_rounds_contest_id_round_number_key" ON "battle_rounds"("contest_id", "round_number");
