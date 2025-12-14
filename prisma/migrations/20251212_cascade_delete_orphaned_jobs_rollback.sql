-- Rollback migration for cascade delete orphaned jobs
-- This script safely removes the triggers and userId column added for orphaned job handling

-- Step 1: Drop the user delete trigger
DROP TRIGGER IF EXISTS cascade_delete_user_jobs ON "User";
DROP FUNCTION IF EXISTS mark_user_jobs_dead_letter();

-- Step 2: Drop the sync trigger that populates userId
DROP TRIGGER IF EXISTS sync_job_user_id ON "JobQueue";
DROP FUNCTION IF EXISTS sync_job_user_id_from_payload();

-- Step 3: Drop the foreign key constraint
ALTER TABLE "JobQueue" 
DROP CONSTRAINT IF EXISTS "JobQueue_userId_fkey";

-- Step 4: Drop the index on userId
DROP INDEX IF EXISTS "JobQueue_userId_idx";

-- Step 5: Drop the userId column
-- Note: This will permanently remove the userId data
-- Ensure this is intended before running
ALTER TABLE "JobQueue" 
DROP COLUMN IF EXISTS "userId";

-- Verification: Check that triggers and column are removed
-- SELECT * FROM information_schema.triggers WHERE trigger_schema = 'public';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'JobQueue' AND column_name = 'userId';