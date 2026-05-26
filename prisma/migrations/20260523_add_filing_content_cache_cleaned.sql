-- Migration: Add cleanedContent + cleanedAt to FilingContentCache
-- Date: 2026-05-23
-- Author: Claude (Layer A of NVDA 10-Q missing-metrics fix)
-- Description:
--   The summarization pipeline was passing raw iXBRL HTML directly to the LLM.
--   For 10-Q/10-K filings (all iXBRL since 2019), this produces "no extractable
--   financial metrics" summaries — most visibly the NVDA 2026-05-20 email.
--   See .claude/tasks/nvda-10q-missing-metrics-fix.md for full context.
--
--   This migration adds two nullable columns so the fetch handler can store
--   the iXBRL-cleaned text alongside the raw cache. The summarizer will be
--   updated (Layer C) to prefer cleanedContent when present, falling back to
--   raw content for legacy rows during the rollout window.
--
--   Both columns nullable + no default → ADD COLUMN is non-blocking on
--   Postgres ≥11 (no full-table rewrite, no exclusive lock).
--
-- Apply via: prisma migrate deploy
-- Rollback:
--   ALTER TABLE "pipeline"."FilingContentCache" DROP COLUMN IF EXISTS "cleanedContent";
--   ALTER TABLE "pipeline"."FilingContentCache" DROP COLUMN IF EXISTS "cleanedAt";

ALTER TABLE "pipeline"."FilingContentCache"
  ADD COLUMN IF NOT EXISTS "cleanedContent" TEXT,
  ADD COLUMN IF NOT EXISTS "cleanedAt" TIMESTAMP(3);
