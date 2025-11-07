-- Migration: Fix database field compatibility for monitoring system
-- This migration addresses status enum changes and field naming inconsistencies
-- identified in PR #170 admin access controls

-- This migration is designed to be idempotent and safe for both fresh and existing databases
-- It handles cases where old enum values may not exist

BEGIN;

-- Function to safely update enum values only if they exist
-- This avoids errors when trying to update non-existent enum values
DO $$
BEGIN
    -- Only update RUNNING -> STARTED if RUNNING values exist
    IF EXISTS (SELECT 1 FROM "CronJobExecution" WHERE status::text = 'RUNNING') THEN
        UPDATE "CronJobExecution" 
        SET status = 'STARTED' 
        WHERE status::text = 'RUNNING';
        RAISE NOTICE 'Updated RUNNING status values to STARTED';
    ELSE
        RAISE NOTICE 'No RUNNING status values found to update';
    END IF;
    
    -- Only update COMPLETED -> SUCCESS if COMPLETED values exist
    IF EXISTS (SELECT 1 FROM "CronJobExecution" WHERE status::text = 'COMPLETED') THEN
        UPDATE "CronJobExecution" 
        SET status = 'SUCCESS' 
        WHERE status::text = 'COMPLETED';
        RAISE NOTICE 'Updated COMPLETED status values to SUCCESS';
    ELSE
        RAISE NOTICE 'No COMPLETED status values found to update';
    END IF;
    
EXCEPTION
    WHEN invalid_text_representation THEN
        -- This catches cases where the enum values don't exist at all
        RAISE NOTICE 'Old enum values not found in database, skipping status updates';
    WHEN OTHERS THEN
        -- Log any other errors but don't fail the migration
        RAISE NOTICE 'Error during status update (continuing migration): %', SQLERRM;
END $$;

-- Ensure startedAt field is properly populated
-- This is safe and idempotent - only updates NULL values
DO $$
BEGIN
    -- Check if CronJobExecution table exists and has the required columns
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'CronJobExecution' 
        AND column_name = 'startedAt'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'CronJobExecution' 
        AND column_name = 'createdAt'
    ) THEN
        UPDATE "CronJobExecution" 
        SET "startedAt" = "createdAt" 
        WHERE "startedAt" IS NULL AND "createdAt" IS NOT NULL;
        RAISE NOTICE 'Updated NULL startedAt values from createdAt';
    ELSE
        RAISE NOTICE 'Required columns not found, skipping startedAt update';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error during startedAt update (continuing migration): %', SQLERRM;
END $$;

-- Create performance indexes (idempotent with IF NOT EXISTS)
DO $$
BEGIN
    -- Add index on status for better query performance
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'CronJobExecution' 
        AND indexname = 'CronJobExecution_status_idx'
    ) THEN
        CREATE INDEX "CronJobExecution_status_idx" ON "CronJobExecution"("status");
        RAISE NOTICE 'Created status index';
    ELSE
        RAISE NOTICE 'Status index already exists';
    END IF;

    -- Add index on startedAt for time-based queries
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'CronJobExecution' 
        AND indexname = 'CronJobExecution_startedAt_idx'
    ) THEN
        CREATE INDEX "CronJobExecution_startedAt_idx" ON "CronJobExecution"("startedAt");
        RAISE NOTICE 'Created startedAt index';
    ELSE
        RAISE NOTICE 'StartedAt index already exists';
    END IF;

    -- Add index on completedAt for completion time queries
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'CronJobExecution' 
        AND indexname = 'CronJobExecution_completedAt_idx'
    ) THEN
        CREATE INDEX "CronJobExecution_completedAt_idx" ON "CronJobExecution"("completedAt");
        RAISE NOTICE 'Created completedAt index';
    ELSE
        RAISE NOTICE 'CompletedAt index already exists';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error during index creation (continuing migration): %', SQLERRM;
END $$;

COMMIT;

-- Post-migration verification queries (for manual review)
-- SELECT status, COUNT(*) FROM "CronJobExecution" GROUP BY status;
-- SELECT COUNT(*) as total_executions FROM "CronJobExecution";
-- SELECT COUNT(*) as executions_with_started_at FROM "CronJobExecution" WHERE "startedAt" IS NOT NULL;