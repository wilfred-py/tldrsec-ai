-- Add trial tracking fields to User table
-- Part of FREE-to-Trial migration (docs/plans/2026-02-10-free-plan-to-trial-migration.md)

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isTrialing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "signupIpAddress" TEXT;

-- Partial index for efficient trial expiration queries (Review Issue #14)
-- Column order: equality predicate first (isTrialing), range predicate second (trialEndsAt)
CREATE INDEX IF NOT EXISTS "User_isTrialing_trialEndsAt_idx"
  ON "User"("isTrialing", "trialEndsAt")
  WHERE "isTrialing" = true;

-- Index for IP abuse prevention queries
CREATE INDEX IF NOT EXISTS "User_signupIpAddress_createdAt_idx"
  ON "User"("signupIpAddress", "createdAt");
