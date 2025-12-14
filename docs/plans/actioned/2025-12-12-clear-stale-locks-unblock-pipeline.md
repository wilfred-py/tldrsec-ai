# Clear Stale Locks and Unblock Pipeline - RESOLVED

**Date**: 2025-12-12
**Status**: ✅ RESOLVED
**Resolution**: Orphaned jobs cleanup (not lock issue)

## Summary

The SEC filing pipeline was stalled since December 10, 2025, with 12,135+ jobs stuck in backlog. After investigation, the root cause was **NOT** stale locks, but rather **orphaned jobs referencing a deleted user**.

## Investigation Timeline

### Initial Hypothesis: Stale Locks
- Research document suggested distributed locks might be blocking execution
- Created `scripts/test-cron-connectivity.ts` to test Cloudflare→Vercel connectivity

### Phase 0: Diagnosis
1. **Lock State Check**: All 5 locks were `released: true` AND expired - **locks NOT blocking**
2. **Connectivity Test**: All endpoints responding correctly:
   - Health check: 200 OK
   - Fetch queue: 200 OK (jobs processing!)
   - Summarize queue: 200 OK (but returning too fast - 2.2s instead of 17-90s)

3. **Fetch Jobs Working**: 10 ASYNC_FETCH_FILING jobs completed in last 30 minutes
4. **Summarize Jobs NOT Working**: Last completion was December 11, 2025 at 05:11:06 (36+ hours ago)

### Root Cause Discovery

Created `scripts/debug-summarize-job-flow.ts` to trace the job flow:

```
Job 969311cf:
  Status: PENDING
  Retries: 0/3
  Has cacheId: true
  Cache status: CACHED
  ...
  USER NOT FOUND: 4b396924-d1f2-409a-8c5b-e23b85b61368
```

**ROOT CAUSE**: User `4b396924-d1f2-409a-8c5b-e23b85b61368` was DELETED from the database, but their 12,000+ jobs remained in the queue.

### Analysis Results

```
Total pending/retrying ASYNC_SUMMARIZE_CACHED jobs: 2149
Orphaned jobs (user deleted): 2149
Orphaned job percentage: 100.0%

Total pending/retrying ASYNC_FETCH_FILING jobs: 9757
Orphaned ASYNC_FETCH_FILING jobs: 9737
```

**100% of the summarize backlog and 99.8% of the fetch backlog referenced a deleted user.**

## Resolution

### Cleanup Executed

Created and ran `scripts/cleanup-orphaned-summarize-jobs.ts`:

1. **Identified orphaned jobs**: 12,169 jobs referencing deleted user
2. **Marked as DEAD_LETTER**: All orphaned jobs moved to DEAD_LETTER status
3. **Cleaned up legacy job types**: Additional 147 legacy jobs (ASYNC_SUMMARIZE_FILING, filing_fetch)

### Post-Cleanup Status

```
Remaining PENDING/RETRYING jobs: 90
  ASYNC_SUMMARIZE_FILING: 70
  ASYNC_FETCH_FILING: 20

All remaining jobs belong to valid users:
  [VALID] 2009de85: wilfredchen1@gmail.com
  [VALID] user_2yA: wilfred.chen.python@gmail.com

PIPELINE STATUS: UNBLOCKED
  35 jobs completed in the last hour
```

## Files Created

- `scripts/test-cron-connectivity.ts` - Test Cloudflare→Vercel connectivity
- `scripts/debug-summarize-job-flow.ts` - Trace job processing flow
- `scripts/check-orphaned-summarize-jobs.ts` - Identify orphaned jobs
- `scripts/cleanup-orphaned-summarize-jobs.ts` - Clean up orphaned jobs
- `scripts/verify-pipeline-status.ts` - Verify pipeline health

## Lessons Learned

1. **User deletion should cascade to jobs**: When a user is deleted, their queued jobs should be automatically cleaned up
2. **Job selection silently fails for deleted users**: The handler tries to find the user, fails, but doesn't properly report the failure
3. **Monitoring should track job user validity**: Add alerts for jobs referencing non-existent users

## Recommendations

### Immediate
- [x] Clean up orphaned jobs (DONE)
- [x] Verify pipeline resumes (DONE - 35 jobs completed in last hour)

### Future
- [ ] Add database constraint or trigger to clean jobs when users are deleted
- [ ] Add monitoring for jobs with invalid user references
- [ ] Improve job handler to fail fast and mark jobs as DEAD_LETTER when user not found

## Related Documents

- `docs/plans/actioned/2025-12-12-fix-job-selection-prisma-field-reference-bug.md` - Previous fix for job selection query
- `thoughts/shared/research/2025-12-10-pipeline-job-selection-query-analysis.md` - Original investigation
- `thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md` - Follow-up investigation
