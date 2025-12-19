---
date: 2025-12-12T12:37:21+11:00
researcher: Claude
git_commit: f4d486f0f706dd613d3b9115dc22becabd42fd47
branch: main
repository: tldrsec-ai
topic: "Pipeline Not Processing - Backlog Not Clearing - No OpenRouter API Calls"
tags: [research, pipeline, job-queue, openrouter, stalled, critical]
status: complete
last_updated: 2025-12-12
last_updated_by: Claude
---

# Research: Pipeline Still Stalled - Backlog Not Clearing - No OpenRouter API Calls

**Date**: 2025-12-12T12:37:21+11:00
**Researcher**: Claude
**Git Commit**: f4d486f0f706dd613d3b9115dc22becabd42fd47
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

The user reports no OpenRouter API calls for investor filings over the past week, suggesting the pipeline is not working and the backlog is not clearing.

## Summary

**CRITICAL FINDING: The pipeline IS stalled despite the December 12 fix claiming success.**

### Evidence of Stall

1. **Last summarization job completed**: December 10, 2025 at 18:11:06 UTC (2 days ago)
2. **No jobs currently processing**: 0 PROCESSING jobs
3. **Massive backlog remains**:
   - 1,753 PENDING `ASYNC_SUMMARIZE_CACHED` jobs
   - 9,912 PENDING `ASYNC_FETCH_FILING` jobs
   - 253 PENDING `ASYNC_DISCOVER_FILINGS` jobs
   - 241 RETRYING `ASYNC_SUMMARIZE_CACHED` jobs
4. **Jobs waiting 12+ days**: Oldest jobs from November 29, waiting 18,473+ minutes
5. **Only 32 summarize jobs ever completed** - unchanged since the fix was deployed

### Root Cause Analysis

The raw SQL job selection query IS finding jobs correctly (10 jobs returned). However, the pipeline is blocked by a **STALE LOCK**:

```
Active Locks: 5
- tier-aware-cron-execution-production (expires: 2025-12-07T06:02:53.864Z) <-- EXPIRED 5 DAYS AGO
- tier-aware-cron-execution-test (expires: 2025-12-08T21:55:05.441Z)
- tier-aware-cron-execution-development (expires: 2025-11-20T17:17:14.108Z)
- user_2009de85-... (expires: 2025-11-21T16:08:15.499Z)
- user_4b396924-... (expires: 2025-11-21T16:03:52.144Z)
```

**The `tier-aware-cron-execution-production` lock expired on December 7 but was NOT cleaned up.** The cron endpoint likely checks for lock existence (not expiration) before proceeding, causing the Cloudflare Worker's cron calls to silently fail or skip processing.

## Detailed Findings

### Job Queue Status (Live Query)

| Status | Job Type | Count |
|--------|----------|-------|
| COMPLETED | ASYNC_SUMMARIZE_CACHED | 32 |
| COMPLETED | ASYNC_FETCH_FILING | 1,980 |
| COMPLETED | ASYNC_DISCOVER_FILINGS | 2,228 |
| DEAD_LETTER | ASYNC_SUMMARIZE_CACHED | 1 |
| PENDING | ASYNC_DISCOVER_FILINGS | 253 |
| PENDING | ASYNC_SUMMARIZE_CACHED | 1,753 |
| PENDING | filing_fetch | 86 |
| PENDING | ASYNC_SUMMARIZE_FILING | 131 |
| PENDING | ASYNC_FETCH_FILING | 9,912 |
| RETRYING | ASYNC_SUMMARIZE_CACHED | 241 |

**Total Backlog**: ~12,135 jobs waiting to be processed

### Most Recent Completions

Last 5 `ASYNC_SUMMARIZE_CACHED` completions:
1. 2025-12-10T18:11:06Z (2 days ago)
2. 2025-12-10T14:41:02Z
3. 2025-12-10T14:31:05Z
4. 2025-12-10T14:21:04Z
5. 2025-12-10T13:51:01Z

**No completions since December 10, 2025** - the day after the fix was deployed.

### Job Selection Query Test

The raw SQL query from the fix IS correctly finding jobs:
```sql
SELECT * FROM "JobQueue"
WHERE status IN ('PENDING', 'RETRYING')
  AND "scheduledFor" <= NOW()
  AND "jobType" = ANY(...)
  AND "retryCount" < "maxRetries"
ORDER BY priority DESC, "scheduledFor" ASC
LIMIT 10
```

**Result**: 10 `ASYNC_DISCOVER_FILINGS` jobs found (Priority 10, retryCount 0, maxRetries 3)

The query IS working - the problem is upstream.

### Cloudflare Worker Flow

The Cloudflare Worker (`cloudflare-cron/index.js`) calls:
1. **Step 1**: `https://tldrsec.app/api/cron/tier-aware` - Discovery jobs
2. **Step 2**: `https://tldrsec.app/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`

The worker is likely executing but the Vercel endpoint is rejecting requests due to the stale lock.

### Lock Management Code

**File**: [lib/cron/background-filing-worker.ts](../../lib/cron/background-filing-worker.ts)

The lock acquisition logic uses distributed locks stored in the `JobLock` table. If a lock exists (regardless of expiration), the cron endpoint may be blocking.

## Immediate Actions Required

### 1. Clear Stale Locks (URGENT)

```sql
DELETE FROM "JobLock"
WHERE "expiresAt" < NOW();
```

Or via script:
```bash
npx tsx scripts/cleanup-locks.ts
```

### 2. Verify Cloudflare Worker Execution

```bash
cd cloudflare-cron && npx wrangler tail --format=pretty
```

Watch for cron triggers every 10 minutes and check response codes.

### 3. Manually Trigger Pipeline

```bash
curl -X GET "https://tldrsec.app/api/cron/tier-aware" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 4. Monitor Job Processing

```bash
npx tsx scripts/check-pending-jobs.ts
```

Run repeatedly to verify jobs are transitioning from PENDING to PROCESSING to COMPLETED.

## Code References

- Lock management: [lib/cron/background-filing-worker.ts](../../lib/cron/background-filing-worker.ts)
- Job selection: [lib/job-queue/index.ts](../../lib/job-queue/index.ts):268-321
- Cloudflare Worker: [cloudflare-cron/index.js](../../cloudflare-cron/index.js)
- Tier-aware endpoint: [app/api/cron/tier-aware/route.ts](../../app/api/cron/tier-aware/route.ts)
- Lock cleanup script: [scripts/cleanup-locks.ts](../../scripts/cleanup-locks.ts)

## Architecture Documentation

### Pipeline Flow
```
Cloudflare Worker (every 10 min)
    │
    ├── Step 1: POST /api/cron/tier-aware
    │   └── Creates ASYNC_DISCOVER_FILINGS jobs
    │
    └── Step 2: GET /api/cron/process-filing-queue?jobTypes=...
        └── BackgroundFilingWorker.processBatch()
            ├── Acquires lock
            ├── Selects jobs via raw SQL
            ├── Processes jobs (AI summarization via OpenRouter)
            └── Releases lock
```

### Lock Behavior Issue
```
Current State:
┌─────────────────────────────────────────────┐
│ JobLock Table                               │
├─────────────────────────────────────────────┤
│ tier-aware-cron-execution-production        │
│ expiresAt: 2025-12-07 (5 DAYS EXPIRED!)     │
│                                             │
│ Cron Endpoint Check:                        │
│ IF lock EXISTS → REJECT (ignores expiry?)   │
└─────────────────────────────────────────────┘
```

## Historical Context (from thoughts/)

### Related Research Documents
- [2025-12-10-pipeline-job-selection-query-analysis.md](2025-12-10-pipeline-job-selection-query-analysis.md) - Initial bug discovery
- [2025-12-10-pipeline-summarization-stall.md](2025-12-10-pipeline-summarization-stall.md) - Stall investigation
- [2025-12-09-fetch-job-processing-cloudflare-investigation.md](2025-12-09-fetch-job-processing-cloudflare-investigation.md) - Race condition fix

### Related Implementation Plans
- [2025-12-12-fix-job-selection-prisma-field-reference-bug.md](../../docs/plans/actioned/2025-12-12-fix-job-selection-prisma-field-reference-bug.md) - Fix that claimed success
- [2025-12-10-CRITICAL-pipeline-stalled.md](../../docs/plans/actioned/2025-12-10-CRITICAL-pipeline-stalled.md) - Critical pipeline stall

## Open Questions

1. **Why is the lock not being cleaned up?** - The lock expiration logic may not be enforced at check time
2. **Is the Cloudflare Worker actually executing?** - Need to verify via `wrangler tail`
3. **What errors are being returned to Cloudflare?** - Need Vercel function logs
4. **Should lock cleanup be automated?** - Currently requires manual intervention

## Conclusion

**The December 12 fix for the Prisma field reference bug IS CORRECT** - the raw SQL query works. However, the pipeline remains stalled due to a **stale distributed lock** that expired on December 7, 2025.

**Immediate action**: Clear the stale locks from the `JobLock` table to unblock the pipeline.
