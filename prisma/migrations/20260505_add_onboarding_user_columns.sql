-- Migration: Add onboarding first-email tracking columns to User
-- Date: 2026-05-05
-- Author: Claude
-- Description:
--   1. Add User.onboardingFirstEmailSentAt + User.onboardingFirstSummaryId
--      for idempotency on the post-onboarding cached-summary email. Set
--      once when pickBestSummaryForUser fires (or fallback notice fires)
--      and reused by the post-onboarding hero card so dashboard + email
--      show the same chosen pick.
--   2. Backfill onboardingFirstEmailSentAt = createdAt for existing onboarded
--      users so they don't trigger a re-send if any future code path calls
--      deliverFirstOnboardingEmail for them.
--
-- Both columns nullable + no default → ADD COLUMN is non-blocking in
-- Postgres ≥11. Backfill is bounded (only matches onboardingCompleted = true)
-- and runs as a single UPDATE.
--
-- Apply via: prisma migrate deploy (or psql directly).
-- Rollback:
--   ALTER TABLE "app"."User" DROP COLUMN IF EXISTS "onboardingFirstSummaryId";
--   ALTER TABLE "app"."User" DROP COLUMN IF EXISTS "onboardingFirstEmailSentAt";

ALTER TABLE "app"."User"
  ADD COLUMN IF NOT EXISTS "onboardingFirstEmailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingFirstSummaryId" TEXT;

UPDATE "app"."User"
SET "onboardingFirstEmailSentAt" = "createdAt"
WHERE "onboardingCompleted" = true
  AND "onboardingFirstEmailSentAt" IS NULL;
