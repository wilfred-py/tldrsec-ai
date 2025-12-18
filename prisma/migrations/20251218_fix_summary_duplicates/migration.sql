-- Fix Duplicate Summaries Migration
-- Created: 2025-12-18
-- Purpose: Add unique constraint on Summary table to prevent duplicate summaries for the same filing

-- Note: Duplicates were already cleaned up by scripts/fix-duplicate-summaries.ts

-- Step 1: Create a unique index on (tickerId, filingUrl) to prevent future duplicates
-- Using a partial index to handle NULL/empty filingUrls
CREATE UNIQUE INDEX IF NOT EXISTS "Summary_tickerId_filingUrl_key"
ON "Summary" ("tickerId", "filingUrl")
WHERE "filingUrl" IS NOT NULL AND "filingUrl" != '';

-- Step 2: Create an index on filingUrl for faster lookups
CREATE INDEX IF NOT EXISTS "Summary_filingUrl_idx" ON "Summary" ("filingUrl");
