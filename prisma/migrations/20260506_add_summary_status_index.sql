-- Migration: Covering index for the cached-summary ranking query
-- Date: 2026-05-06
-- Author: Claude
-- Description:
--   The post-onboarding cached-summary ranking query joins Summary by
--   tickerId (user-owned tickers), filters by processingStatus, and orders
--   by filingDate DESC. This index covers that access pattern.
--
-- IMPORTANT — APPLY OUT-OF-BAND:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction. Prisma
--   wraps each migration .sql in BEGIN/COMMIT, so this file MUST NOT be
--   applied via `prisma migrate deploy`. Apply via psql instead:
--
--     psql "$DATABASE_URL" -f prisma/migrations/20260506_add_summary_status_index.sql
--
--   After applying, mark Prisma's _prisma_migrations table so subsequent
--   `prisma migrate deploy` runs skip it:
--
--     INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
--     VALUES (gen_random_uuid()::text, 'manual', NOW(), '20260506_add_summary_status_index', NULL, NOW(), 1)
--     ON CONFLICT DO NOTHING;
--
-- Rollback (also out-of-band, also OUTSIDE a transaction):
--   DROP INDEX CONCURRENTLY IF EXISTS "app"."Summary_status_ticker_filingDate_idx";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Summary_status_ticker_filingDate_idx"
  ON "app"."Summary" ("processingStatus", "tickerId", "filingDate" DESC);
