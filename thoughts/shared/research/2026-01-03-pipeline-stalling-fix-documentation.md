---
date: 2026-01-03T15:19:06+11:00
researcher: Claude
git_commit: 848674a9f9fa528a47b10a92a6e4fb7bcaecca4e
branch: fix/pipeline-stalling-stripe-cleanup
repository: tldrsec-ai
topic: "Pipeline Stalling Fix - Job Type Mismatch and Scheduling Gap Documentation"
tags: [research, codebase, pipeline, job-queue, cron, remediation]
status: complete
last_updated: 2026-01-03
last_updated_by: Claude
---

# Research: Pipeline Stalling Fix Documentation

**Date**: 2026-01-03 15:19:06 AEDT
**Researcher**: Claude
**Git Commit**: 848674a9f9fa528a47b10a92a6e4fb7bcaecca4e
**Branch**: fix/pipeline-stalling-stripe-cleanup
**Repository**: tldrsec-ai

## Research Question

Document the pipeline stalling fix that was applied, including:
1. Job type mismatch issues in auto-remediation
2. Exhausted retry jobs stuck in PENDING
3. Current scheduling configuration for `/api/cron/process-filing-queue`

## Summary

Three issues were identified and fixed that caused pipeline stalling:

1. **Job Type Mismatch**: The `verify-daily-pipeline.ts` auto-remediation script was creating jobs with legacy type names (`filing_fetch`, `filing_summarize`) that have no handlers in the current 3-phase pipeline
2. **Exhausted Retry Jobs**: 10 jobs had reached max retries but remained in PENDING status instead of being marked FAILED
3. **Scheduling Gap**: The `/api/cron/process-filing-queue` endpoint is NOT in vercel.json crons - it relies entirely on Cloudflare Worker triggering

## Detailed Findings

### Issue 1: Job Type Mismatch in Auto-Remediation

**Location**: [scripts/verify-daily-pipeline.ts:560-569](scripts/verify-daily-pipeline.ts#L560-L569)

The `attemptRemediation()` function was fixed to use correct async job types:

```typescript
// Current implementation (FIXED)
let jobType: string;
if (!filing.fetched) {
  jobType = 'ASYNC_FETCH_FILING';
} else if (!filing.summarized) {
  jobType = 'ASYNC_SUMMARIZE_CACHED';
} else {
  // Skip email jobs - handled by summarization step
  return { success: true };
}
```

**Previous Bug**: The script was creating jobs with types like:
- `filing_fetch` (should be `ASYNC_FETCH_FILING`)
- `filing_summarize` (should be `ASYNC_SUMMARIZE_CACHED`)
- `filing_email` (no handler exists - email is handled within summarization)

**Active Job Types** (defined in `lib/job-queue/index.ts:23-42`):
- `ASYNC_DISCOVER_FILINGS` - Phase 1: RSS feed checking
- `ASYNC_FETCH_FILING` - Phase 2: SEC content fetch
- `ASYNC_SUMMARIZE_CACHED` - Phase 3: AI summarization + email

### Issue 2: Exhausted Retry Jobs

10 jobs were stuck in PENDING status despite having `retryCount >= maxRetries`. These were manually marked as FAILED.

The job selection query in `lib/job-queue/index.ts:294-319` correctly filters:
```sql
WHERE status IN ('PENDING', 'RETRYING')
AND "scheduledFor" <= NOW()
AND "retryCount" < "maxRetries"
```

Jobs exceeding max retries should transition to FAILED, but this wasn't happening for some jobs due to a previous Prisma field reference bug that was already fixed with raw SQL queries.

### Issue 3: Scheduling Configuration

**Current State of `/api/cron/process-filing-queue`**:

| Configuration | Status |
|--------------|--------|
| vercel.json crons | **NOT SCHEDULED** |
| Cloudflare Worker | Scheduled every 5 minutes |
| Manual trigger | Requires Bearer token auth |

**vercel.json** (lines 2-7):
```json
"crons": [
  {
    "path": "/api/cron/tier-aware",
    "schedule": "0 9 * * 1,2,3,4,5"
  }
]
```

The `process-filing-queue` endpoint is configured for function limits but NOT in the crons array.

**Cloudflare Worker** (`cloudflare-cron/wrangler.toml:14`):
```toml
crons = ["*/5 * * * *", "*/10 * * * *", "*/15 * * * *", "0 22 * * *"]
```

The worker triggers `process-filing-queue` in steps 1.5, 2, and 3 of its 5-minute pipeline execution (`cloudflare-cron/index.js:467-473`):
- Step 1.5: `?jobTypes=ASYNC_DISCOVER_FILINGS`
- Step 2: `?jobTypes=ASYNC_FETCH_FILING`
- Step 3: `?jobTypes=ASYNC_SUMMARIZE_CACHED`

### Pipeline Architecture

**Three-Phase Async Pipeline**:

```
Cloudflare Worker (every 5 min)
       │
       ├── Step 0: /api/cron/cleanup-locks
       │
       ├── Step 1: /api/cron/tier-aware
       │       └── Queues ASYNC_DISCOVER_FILINGS jobs
       │
       ├── Step 1.5: /api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS
       │       └── Processes discovery, queues ASYNC_FETCH_FILING
       │
       ├── Step 2: /api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING
       │       └── Fetches SEC content, queues ASYNC_SUMMARIZE_CACHED
       │
       └── Step 3: /api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED
               └── AI summarization + email delivery
```

**BackgroundFilingWorker** (`lib/cron/background-filing-worker.ts`):
- Routes jobs to handlers based on `jobType`
- Dynamic batch sizing per job type:
  - Discovery: 10 jobs/batch (2-5s each)
  - Fetch: 5 jobs/batch (4-10s each)
  - Summarize: 1 job/batch (30-270s each)

### Job Queue Service

**Location**: [lib/job-queue/index.ts](lib/job-queue/index.ts)

Key functions:
- `addJob()` - Creates jobs with idempotency checks (line 128)
- `getJobsToProcessMultipleTypes()` - Retrieves jobs using raw SQL (line 340)
- `updateJobStatus()` - Handles status transitions and retry logic (line 439)

**Row-level comparison fix** (lines 4-14):
```typescript
// CRITICAL BUG FIX: Use raw SQL for row-level column comparisons
// Prisma field references silently returned 0 results, blocking 756 jobs
```

### Remediation Results

After fixing the auto-remediation script:
- 3/3 remediation attempts succeeded
- New `ASYNC_FETCH_FILING` jobs created for AMZN filings from January 2nd
- Jobs will be processed when Cloudflare Worker triggers next

## Code References

- `scripts/verify-daily-pipeline.ts:560-569` - Fixed job type mapping
- `lib/job-queue/index.ts:23-42` - JobType definitions
- `lib/job-queue/index.ts:294-319` - Job selection query
- `lib/cron/background-filing-worker.ts:571-593` - Job type routing
- `cloudflare-cron/index.js:467-473` - Cloudflare Worker pipeline steps
- `cloudflare-cron/wrangler.toml:14` - Cron schedule configuration
- `vercel.json:2-7` - Vercel cron configuration (tier-aware only)
- `app/api/cron/process-filing-queue/route.ts` - Queue processor endpoint

## Architecture Documentation

### Job Processing Flow

1. **Job Creation**: Via `JobQueueService.addJob()` with idempotency key
2. **Job Selection**: Raw SQL query with `retryCount < maxRetries` filter
3. **Job Execution**: `BackgroundFilingWorker.processJob()` with timeout handling
4. **Status Transition**:
   - Success → COMPLETED
   - Failure → RETRYING (with exponential backoff) or FAILED (max retries exceeded)

### Retry Logic

Exponential backoff at `lib/job-queue/index.ts:476-478`:
```typescript
const backoffMinutes = Math.pow(2, job.retryCount);
// Retry 1: 2 min, Retry 2: 4 min, Retry 3: 8 min
```

### Stale Job Recovery

`BackgroundFilingWorker.recoverStaleJobs()` (line 312):
- Detects jobs stuck in PROCESSING > 5 minutes
- Resets to RETRYING or marks FAILED based on retry count

## Open Questions

1. **Should `/api/cron/process-filing-queue` be added to vercel.json crons as a backup?**
   - Currently relies entirely on Cloudflare Worker
   - If Cloudflare Worker fails, jobs accumulate without processing

2. **What is the SLA for Cloudflare Workers scheduled triggers?**
   - Need to verify Cloudflare Worker uptime guarantees
   - Consider adding Vercel cron as fallback

3. **How are the 10 exhausted-retry jobs being handled going forward?**
   - They were marked FAILED
   - May need manual investigation for root cause
