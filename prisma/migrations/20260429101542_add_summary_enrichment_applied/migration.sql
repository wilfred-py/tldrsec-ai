-- Migration: Add enrichmentApplied column to Summary
-- Source plan: tasks/x-search-max-only.md (Phase 2 — Architecture decision 1A)
--
-- Adds a boolean column to `app.Summary` indicating whether web-search enrichment
-- ("Why it matters") was applied to that summary's content. Models the data, not
-- the consumer — set true only when the writer ran enrichment. The tier-aware
-- shared cache lookup (Phase 4) will use this column to route Max readers to
-- enriched rows and Pro/Free readers to plain rows.
--
-- Performance characteristics:
--   - `ADD COLUMN ... NOT NULL DEFAULT false` is fast in PostgreSQL 11+ — the
--     default is stored as table metadata, no row rewrite required.
--   - Existing rows logically read `false` until the post-deploy backfill
--     (Phase 3, `scripts/backfill-enrichment-applied.ts`) populates them based
--     on `summaryJSON ? 'whyItMatters'`. New rows during backfill window
--     default `false`; the rare Max user hitting one of those rows gets a
--     one-shot fresh enrichment (acceptable).
--
-- The companion index swap (replace `[filingUrl, filingType]` with
-- `[filingUrl, filingType, enrichmentApplied]`) ships as a separate post-deploy
-- SQL file `prisma/migrations/add_enrichment_applied_index.sql` because
-- `CREATE INDEX CONCURRENTLY` cannot run inside a Prisma migration transaction.
-- Until that file is applied, the legacy 2-col index continues to serve cache
-- lookups (with a small redundant scan on `enrichmentApplied`).

ALTER TABLE "app"."Summary"
  ADD COLUMN IF NOT EXISTS "enrichmentApplied" BOOLEAN NOT NULL DEFAULT false;
