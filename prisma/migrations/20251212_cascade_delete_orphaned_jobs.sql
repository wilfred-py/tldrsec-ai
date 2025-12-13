-- Migration: Add userId column to JobQueue and create cascade delete trigger
-- Purpose: Prevent orphaned jobs when users are deleted
-- Date: 2025-12-12
-- Related Issue: Orphaned jobs caused pipeline stall (12,169 jobs for deleted user)

-- Step 1: Add userId column to JobQueue (nullable initially for backfill)
ALTER TABLE "JobQueue" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Step 2: Create index for userId lookups
CREATE INDEX IF NOT EXISTS "JobQueue_userId_idx" ON "JobQueue" ("userId");

-- Step 3: Create index for payload userId extraction (for queries during transition)
CREATE INDEX IF NOT EXISTS "JobQueue_payload_userId_idx" ON "JobQueue" ((payload->>'userId'));

-- Step 4: Backfill userId from payload JSON
UPDATE "JobQueue"
SET "userId" = payload->>'userId'
WHERE "userId" IS NULL
  AND payload->>'userId' IS NOT NULL;

-- Step 4b: Clean up orphaned jobs BEFORE adding foreign key constraint
-- Set userId to NULL for jobs referencing deleted users, and mark them as DEAD_LETTER
UPDATE "JobQueue"
SET
    "userId" = NULL,
    status = CASE
        WHEN status IN ('PENDING', 'RETRYING', 'PROCESSING') THEN 'DEAD_LETTER'
        ELSE status
    END,
    "failedAt" = CASE
        WHEN status IN ('PENDING', 'RETRYING', 'PROCESSING') THEN NOW()
        ELSE "failedAt"
    END,
    "lastError" = CASE
        WHEN status IN ('PENDING', 'RETRYING', 'PROCESSING') THEN 'User deleted - orphaned job cleaned up during migration'
        ELSE "lastError"
    END
WHERE "userId" IS NOT NULL
  AND "userId" NOT IN (SELECT id FROM "User");

-- Step 5: Create the cleanup function
-- This function is called BEFORE a user is deleted and marks their jobs as DEAD_LETTER
CREATE OR REPLACE FUNCTION cleanup_jobs_on_user_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark jobs with matching userId column as DEAD_LETTER
    UPDATE "JobQueue"
    SET
        status = 'DEAD_LETTER',
        "failedAt" = NOW(),
        "lastError" = 'User deleted - job orphaned and cleaned up automatically'
    WHERE "userId" = OLD.id
      AND status IN ('PENDING', 'RETRYING', 'PROCESSING');

    -- Also mark jobs where userId is in the payload JSON (safety net for unmigrated jobs)
    UPDATE "JobQueue"
    SET
        status = 'DEAD_LETTER',
        "failedAt" = NOW(),
        "lastError" = 'User deleted - job orphaned and cleaned up automatically'
    WHERE payload->>'userId' = OLD.id
      AND status IN ('PENDING', 'RETRYING', 'PROCESSING');

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create the trigger on User table
DROP TRIGGER IF EXISTS trigger_cleanup_jobs_on_user_delete ON "User";
CREATE TRIGGER trigger_cleanup_jobs_on_user_delete
    BEFORE DELETE ON "User"
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_jobs_on_user_delete();

-- Step 7: Add foreign key constraint (optional - with SET NULL to allow historical tracking)
-- Note: We use SET NULL instead of CASCADE to preserve job history for analytics
-- The trigger above handles the cleanup before the FK would be violated
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'JobQueue_userId_fkey'
    ) THEN
        ALTER TABLE "JobQueue"
        ADD CONSTRAINT "JobQueue_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Step 8: Create a function to sync userId column from payload for new jobs
-- This ensures the userId column stays in sync with payload
CREATE OR REPLACE FUNCTION sync_job_userid_from_payload()
RETURNS TRIGGER AS $$
BEGIN
    -- Extract userId from payload if not explicitly set
    IF NEW."userId" IS NULL AND NEW.payload->>'userId' IS NOT NULL THEN
        NEW."userId" = NEW.payload->>'userId';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Create trigger for new job insertions
DROP TRIGGER IF EXISTS trigger_sync_job_userid ON "JobQueue";
CREATE TRIGGER trigger_sync_job_userid
    BEFORE INSERT OR UPDATE ON "JobQueue"
    FOR EACH ROW
    EXECUTE FUNCTION sync_job_userid_from_payload();

-- Verification queries (for manual checking after migration)
-- COMMENT: Run these to verify the migration worked:
-- SELECT COUNT(*) FROM "JobQueue" WHERE "userId" IS NOT NULL;
-- SELECT COUNT(*) FROM "JobQueue" WHERE "userId" IS NULL AND payload->>'userId' IS NOT NULL;
