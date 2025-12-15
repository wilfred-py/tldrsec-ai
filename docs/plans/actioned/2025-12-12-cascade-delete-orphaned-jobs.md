# Cascade Delete Orphaned Jobs

**Date**: 2025-12-12
**Status**: Implementation Complete
**Branch**: `feature/cascade-delete-orphaned-jobs`

## Problem Statement

On December 12, 2025, we discovered that 12,169 jobs (100% of the pipeline backlog) were orphaned because they referenced a deleted user (`4b396924-d1f2-409a-8c5b-e23b85b61368`). This caused the entire pipeline to stall for 36+ hours.

**Root Cause**: When a user is deleted from the `User` table, their jobs in `JobQueue` remain because there's no foreign key relationship or cleanup trigger. The `userId` is stored in the JSON `payload` field rather than as a proper column with constraints.

## Solution

Implement a database trigger that automatically cleans up a user's jobs when they are deleted.

### Changes Made

1. **Added `userId` column to JobQueue** (`prisma/schema.prisma`)
   - New nullable `userId` column extracted from payload
   - Foreign key relationship to User table with `ON DELETE SET NULL`
   - Index for efficient lookups

2. **Created PostgreSQL triggers** (`prisma/migrations/20251212_cascade_delete_orphaned_jobs.sql`)
   - `cleanup_jobs_on_user_delete()`: BEFORE DELETE trigger on User table
     - Marks all PENDING/RETRYING/PROCESSING jobs as DEAD_LETTER
     - Works with both `userId` column and payload JSON (safety net)
   - `sync_job_userid_from_payload()`: BEFORE INSERT/UPDATE trigger on JobQueue
     - Automatically populates `userId` column from payload JSON

3. **Added verification script** (`scripts/verify-cascade-delete-trigger.ts`)
   - Validates trigger setup
   - Checks for orphaned jobs
   - Reports userId column population statistics

## Implementation Details

### Trigger Logic

```sql
CREATE OR REPLACE FUNCTION cleanup_jobs_on_user_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "JobQueue"
    SET
        status = 'DEAD_LETTER',
        "failedAt" = NOW(),
        "lastError" = 'User deleted - job orphaned and cleaned up automatically'
    WHERE "userId" = OLD.id
      AND status IN ('PENDING', 'RETRYING', 'PROCESSING');
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

### Why DEAD_LETTER instead of CASCADE DELETE?

1. **Audit Trail**: Preserves job history for debugging and analytics
2. **Less Destructive**: Doesn't lose information about what jobs were queued
3. **Recoverable**: Jobs can be inspected or reprocessed if needed
4. **Foreign Key Compatibility**: Works with `ON DELETE SET NULL` constraint

## Deployment Instructions

### 1. Apply the Migration

```bash
# Apply the SQL migration directly
npx prisma db execute --file prisma/migrations/20251212_cascade_delete_orphaned_jobs.sql

# Regenerate Prisma client
npx prisma generate
```

### 2. Verify the Setup

```bash
npx tsx scripts/verify-cascade-delete-trigger.ts
```

Expected output:
```
CHECK 1: JobQueue.userId column
  ✅ userId column exists

CHECK 2: cleanup_jobs_on_user_delete() function
  ✅ Function exists

CHECK 3: trigger_cleanup_jobs_on_user_delete trigger
  ✅ Trigger exists

CHECK 4: trigger_sync_job_userid trigger
  ✅ Sync trigger exists
```

### 3. Backfill Existing Jobs (if needed)

The migration includes a backfill statement, but if you need to run it again:

```sql
UPDATE "JobQueue"
SET "userId" = payload->>'userId'
WHERE "userId" IS NULL
  AND payload->>'userId' IS NOT NULL;
```

## Testing

### Manual Test

1. Create a test user
2. Queue a job for that user
3. Delete the user
4. Verify the job status changed to DEAD_LETTER

### Verification Query

```sql
-- Check for orphaned jobs
SELECT COUNT(*)
FROM "JobQueue" j
LEFT JOIN "User" u ON j."userId" = u.id
WHERE j."userId" IS NOT NULL
  AND u.id IS NULL
  AND j.status IN ('PENDING', 'RETRYING', 'PROCESSING');
```

## Future Considerations

1. **Consider similar triggers for other user-related data**
   - Currently, `Ticker`, `NotificationSent`, `AuditLog`, etc. use `onDelete: Cascade`
   - JobQueue now uses a trigger approach due to the JSON payload complexity

2. **Monitoring**
   - Add alerts when jobs are automatically marked as DEAD_LETTER due to user deletion
   - Track deleted user cleanup events in audit log

3. **Batch User Deletion**
   - For bulk user deletions, consider batching to avoid long-running triggers

## Related Documents

- [Clear Stale Locks and Unblock Pipeline](actioned/2025-12-12-clear-stale-locks-unblock-pipeline.md) - Original investigation
- [Fix Job Selection Prisma Field Reference Bug](actioned/2025-12-12-fix-job-selection-prisma-field-reference-bug.md) - Related fix
