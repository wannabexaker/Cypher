-- Additive enum value. Postgres requires `ALTER TYPE ... ADD VALUE` to run
-- outside a transaction block when the new value is used in the same
-- migration, so this migration is kept standalone (single DDL only).
ALTER TYPE "SourceType" ADD VALUE 'YOUTUBE';
