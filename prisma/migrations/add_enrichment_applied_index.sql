-- Post-deploy: Swap Summary cache index from 2-col to 3-col
-- Source plan: tasks/x-search-max-only.md (Phase 2 — Performance decision 14A)
--
-- WHY THIS IS NOT A PRISMA MIGRATION:
--   Prisma wraps each migration file in a transaction. `CREATE INDEX CONCURRENTLY`
--   cannot run inside a transaction (Postgres rejects with "CREATE INDEX CONCURRENTLY
--   cannot run inside a transaction block"). On a multi-million-row table, the
--   non-concurrent variant blocks all writes for the duration of the build —
--   minutes-to-hours of production downtime.
--
--   Apply this file manually (or via the deploy pipeline) AFTER the Prisma migration
--   `20260429101542_add_summary_enrichment_applied` has applied:
--     psql "$DIRECT_URL" -f prisma/migrations/add_enrichment_applied_index.sql
--   Same pattern as `add_monitoring_optimization_indices.sql` already in this directory.
--
-- ORDERING:
--   1. Create the new 3-col index CONCURRENTLY (online, no write block).
--   2. Verify the new index is valid and being chosen by EXPLAIN on a sample query.
--   3. Drop the legacy 2-col index CONCURRENTLY.
--
-- The schema.prisma file already declares the 3-col index, so `prisma migrate
-- status` will eventually flag the legacy index as drift; that's expected and
-- resolves once step 3 runs.
--
-- IDEMPOTENCY:
--   `IF NOT EXISTS` / `IF EXISTS` guard against re-runs. Safe to apply twice.
--
-- ROLLBACK:
--   If the new index doesn't behave as expected, drop it concurrently and the
--   legacy 2-col index keeps serving lookups (cache logic was tier-blind before
--   Phase 4 anyway). Recreate the legacy index from `schema.prisma` history if
--   it was already dropped:
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS "Summary_filingUrl_filingType_idx"
--       ON "app"."Summary" ("filingUrl", "filingType");
--     DROP INDEX CONCURRENTLY IF EXISTS "app"."Summary_filingUrl_filingType_enrichmentApplied_idx";

-- ─── Step 1: Create the new 3-col index online ──────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Summary_filingUrl_filingType_enrichmentApplied_idx"
  ON "app"."Summary" ("filingUrl", "filingType", "enrichmentApplied");

-- ─── Step 2: Drop the legacy 2-col index online ─────────────────────────────
-- Defer this drop until after Step 1 has been verified in production EXPLAIN
-- output. If running this file in one shot during a quiet window, the back-to-back
-- create-then-drop is acceptable.
DROP INDEX CONCURRENTLY IF EXISTS "app"."Summary_filingUrl_filingType_idx";
