-- H18: additive enum value for disqualified submissions.
-- Postgres requires `ALTER TYPE ... ADD VALUE` to run outside a transaction
-- block when the new value is used in the same migration, so this migration
-- is kept standalone (single DDL only).
ALTER TYPE "SubmissionStatus" ADD VALUE 'DISQUALIFIED';
