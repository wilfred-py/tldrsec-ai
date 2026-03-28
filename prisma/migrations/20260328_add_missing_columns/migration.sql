-- Migration: Add missing columns from PRs #372 and #374
-- These columns were added to schema.prisma but never migrated to the database,
-- causing pipeline failures from 2026-03-26 onward.

-- TickerMonitoring: SEC Submissions API fast-poll watermarks (PR #374)
ALTER TABLE "app"."TickerMonitoring"
  ADD COLUMN IF NOT EXISTS "lastSeenAcceptanceDateTime" TEXT,
  ADD COLUMN IF NOT EXISTS "lastEtag" TEXT,
  ADD COLUMN IF NOT EXISTS "lastPollTime" TIMESTAMPTZ;

-- Summary: delivery latency tracking (PR #374)
ALTER TABLE "app"."Summary"
  ADD COLUMN IF NOT EXISTS "edgarAcceptedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deliveryLatencyMs" INTEGER;

-- Summary: importance scoring and smart subjects (PR #372)
ALTER TABLE "app"."Summary"
  ADD COLUMN IF NOT EXISTS "importance" TEXT,
  ADD COLUMN IF NOT EXISTS "smartSubject" TEXT;

-- User: soft delete support (PR #372)
ALTER TABLE "app"."User"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deleteScheduledFor" TIMESTAMPTZ;

-- User: hours saved tracking (PR #372)
ALTER TABLE "app"."User"
  ADD COLUMN IF NOT EXISTS "hoursSavedThisMonth" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hoursSavedTotal" INTEGER NOT NULL DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "app"."User" ("deletedAt");
