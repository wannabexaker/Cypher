-- H20a: per-channel-per-mode contest sequence number. Nullable column +
-- one-shot backfill so existing rows get a stable 1-based ordering by
-- createdAt. New rows are assigned at create time inside the contest
-- create transaction (count(*) + 1 over the same channel+mode).

ALTER TABLE "contests" ADD COLUMN "number" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "channel_id", "mode"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS "n"
  FROM "contests"
)
UPDATE "contests" c
SET    "number" = numbered."n"
FROM   numbered
WHERE  c."id" = numbered."id";
