-- Migration: Fix database field compatibility for monitoring system
-- This migration addresses status enum changes and field naming inconsistencies
-- identified in PR #170 admin access controls

-- Update status values to match new enum constants
-- RUNNING -> STARTED, COMPLETED -> SUCCESS (leave FAILED as is)

BEGIN;

-- Update CronJobExecution status values
UPDATE "CronJobExecution" 
SET status = 'STARTED' 
WHERE status = 'RUNNING';

UPDATE "CronJobExecution" 
SET status = 'SUCCESS' 
WHERE status = 'COMPLETED';

-- Ensure startedAt field is properly populated from startTime if needed
-- (Note: Prisma schema uses startedAt, but some code referenced startTime)
UPDATE "CronJobExecution" 
SET "startedAt" = "createdAt" 
WHERE "startedAt" IS NULL AND "createdAt" IS NOT NULL;

-- Add index on status for better query performance
CREATE INDEX IF NOT EXISTS "CronJobExecution_status_idx" ON "CronJobExecution"("status");

-- Add index on startedAt for time-based queries
CREATE INDEX IF NOT EXISTS "CronJobExecution_startedAt_idx" ON "CronJobExecution"("startedAt");

-- Add index on completedAt for completion time queries
CREATE INDEX IF NOT EXISTS "CronJobExecution_completedAt_idx" ON "CronJobExecution"("completedAt");

-- Verify data integrity after migration
-- This will help identify any remaining inconsistencies
INSERT INTO "CronJobHealthMetric" ("id", "jobName", "metricName", "metricValue", "metricUnit", "recordedAt")
SELECT 
    gen_random_uuid(),
    'migration-verification',
    'status-migration-count',
    COUNT(*)::DECIMAL,
    'records',
    NOW()
FROM "CronJobExecution"
WHERE status IN ('STARTED', 'SUCCESS', 'FAILED');

COMMIT;

-- Post-migration verification queries (for manual review)
-- SELECT status, COUNT(*) FROM "CronJobExecution" GROUP BY status;
-- SELECT COUNT(*) as total_executions FROM "CronJobExecution";
-- SELECT COUNT(*) as executions_with_started_at FROM "CronJobExecution" WHERE "startedAt" IS NOT NULL;