---
date: 2025-12-04T20:48:06+11:00
researcher: Claude
git_commit: 38af121f17d63635ccc8ab05d6db6ef906243ed6
branch: fix/development-environment-api-issues
repository: tldrsec-ai
topic: "Cloudflare Cron Worker Errors at 3:48 PM AEST and Email Queue Blocking"
tags: [research, codebase, cloudflare, cron, pipeline, email-queue, market-hours, bug, investigation]
status: complete
last_updated: 2025-12-04
last_updated_by: Claude
---

# Research: Cloudflare Cron Worker Errors at 3:48 PM AEST and Email Queue Blocking

**Date**: 2025-12-04T20:48:06+11:00
**Researcher**: Claude
**Git Commit**: 38af121f17d63635ccc8ab05d6db6ef906243ed6
**Branch**: fix/development-environment-api-issues
**Repository**: tldrsec-ai

## Research Question

The user reports:
1. Errors in the Cloudflare cron worker logs at approximately 3:48 PM AEST every day over the last 3 days
2. No new summarization emails being sent - suspected queue blocking

## Summary

**Root Cause Identified**: The cron job failures are caused by a JavaScript date parsing error ("Invalid time value") in the `market-hours.ts` file, specifically in the `calculateNextMarketOpen()` function at line 341. This error occurs consistently during the 5:00-5:50 AM UTC hour (4:00-4:50 PM AEDT).

**Queue Status**: The job queue is severely backed up with **11,838 PENDING fetch jobs** and **66 PENDING summarize jobs** dating back to November 28, 2025. This massive backlog explains why no new summarization emails are being sent - the pipeline is stuck.

**Key Findings**:
1. **70 FAILED cron executions** in the last 4 days, ALL with "Invalid time value" error
2. **Failures occur ONLY during 5:XX AM UTC (4:XX PM AEDT)** - close to 3:48 PM AEST the user mentioned
3. **The failures happen approximately 3 times per 10-minute window** during this hour
4. **Massive job queue backlog** preventing email delivery

## Detailed Findings

### 1. Cron Execution Error Pattern

**Error Data from `CronJobExecution` table (last 4 days)**:

| Time Window (AEDT) | Failures | Error Message |
|-------------------|----------|---------------|
| 4:00 PM - 4:10 PM | ~3 per day | Invalid time value |
| 4:10 PM - 4:20 PM | ~3 per day | Invalid time value |
| 4:20 PM - 4:30 PM | ~3 per day | Invalid time value |
| 4:30 PM - 4:40 PM | ~3 per day | Invalid time value |
| 4:40 PM - 4:50 PM | ~3 per day | Invalid time value |
| 4:50 PM - 5:00 PM | ~3 per day | Invalid time value |

**Total: 70 failed executions over 4 days, exclusively in this 1-hour window**

Sample failures from Dec 4, 2025:
```
2025-12-04T05:50:26.074Z (AEDT: 16:50:26) | FAILED | Invalid time value
2025-12-04T05:50:21.762Z (AEDT: 16:50:21) | FAILED | Invalid time value
2025-12-04T05:40:25.712Z (AEDT: 16:40:25) | FAILED | Invalid time value
2025-12-04T05:30:26.801Z (AEDT: 16:30:26) | FAILED | Invalid time value
```

### 2. Root Cause: Date Parsing in market-hours.ts

**Location**: [lib/cron/market-hours.ts:341](lib/cron/market-hours.ts#L341)

**Problematic Code**:
```typescript
function calculateNextMarketOpen(now: Date): Date | null {
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // ...
}
```

**The Issue**: `toLocaleString('en-US', { timeZone: 'America/New_York' })` returns a locale-formatted string like "12/4/2025, 11:50:26 AM" which may fail to parse correctly in certain edge cases, particularly:
- During daylight saving time transitions
- At specific times when the formatted output doesn't match expected Date constructor input
- In certain JavaScript runtime environments

**Why 5:XX AM UTC?**:
- 5:00 AM UTC = 12:00 AM Eastern Time (midnight)
- 5:48 AM UTC = 12:48 AM Eastern Time
- This is around midnight Eastern time, potentially causing edge case issues with date parsing during the early morning hour

### 3. Job Queue Backlog Status

**Current Queue State**:

| Job Type | Status | Count |
|----------|--------|-------|
| ASYNC_DISCOVER_FILINGS | COMPLETED | 1,297 |
| ASYNC_FETCH_FILING | PENDING | **11,838** |
| ASYNC_FETCH_FILING | COMPLETED | 40 |
| ASYNC_SUMMARIZE_CACHED | PENDING | **66** |
| ASYNC_SUMMARIZE_CACHED | COMPLETED | 19 |
| ASYNC_SUMMARIZE_CACHED | DEAD_LETTER | 1 |
| ASYNC_SUMMARIZE_FILING | PENDING | 85 |
| filing_fetch | PENDING | 73 |

**Oldest Pending Jobs**: Dating back to **November 28, 2025** (8,561 minutes ago = ~6 days)

### 4. Why Emails Are Not Being Sent

The email queue (`ASYNC_EMAIL_DIGEST`) appears empty because:

1. **No summaries are being completed** - 66 summarize jobs are stuck in PENDING
2. **Fetch phase is blocked** - 11,838 fetch jobs are pending
3. **Discovery works fine** - 1,297 discovery jobs completed, but downstream is stuck
4. **The 3-phase pipeline is broken** at the fetch phase

**Pipeline Flow (blocked at Phase 2)**:
```
Phase 1: Discovery → COMPLETED (1,297 jobs) ✓
Phase 2: Fetch → BLOCKED (11,838 jobs pending) ✗
Phase 3: Summarize → BLOCKED (66 jobs pending) ✗
Phase 4: Email → EMPTY (no jobs to process) ✗
```

### 5. Cloudflare Worker Configuration

**Current Configuration** ([cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml)):
- Cron schedule: `*/5 * * * *` (every 5 minutes)
- PUBLIC_URL: `https://tldrsec.app`
- Last deployment: November 28, 2025

**Dual Endpoint Pattern** ([cloudflare-cron/index.js:112-114](cloudflare-cron/index.js#L112)):
```javascript
const tierAwareUrl = `${env.PUBLIC_URL}/api/cron/tier-aware`; // Primary: queues new filings
const workerUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue`; // Secondary: processes queued jobs
```

### 6. Time Zone Correlation

**User's Observation**: "3:48 PM AEST"
- AEST (Australian Eastern Standard Time) = UTC+10
- AEDT (Australian Eastern Daylight Time) = UTC+11 (current, December)

**Actual Error Time**:
- Errors occur during 5:00-5:50 AM UTC
- In AEDT (current): 4:00-4:50 PM (close to user's 3:48 PM observation)
- In AEST: 3:00-3:50 PM

The user is likely observing errors at **4:48 PM AEDT** which they rounded to "3:48 PM AEST" - the times are close but reflect the daylight saving time difference.

## Code References

**Error Source**:
- [lib/cron/market-hours.ts:341](lib/cron/market-hours.ts#L341) - `calculateNextMarketOpen()` function with problematic date parsing

**Cron Endpoint**:
- [app/api/cron/tier-aware/route.ts:41](app/api/cron/tier-aware/route.ts#L41) - Main cron handler
- [app/api/cron/process-filing-queue/route.ts:27](app/api/cron/process-filing-queue/route.ts#L27) - Job processor

**Cloudflare Worker**:
- [cloudflare-cron/index.js:5](cloudflare-cron/index.js#L5) - Worker implementation
- [cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml) - Configuration

**Job Queue**:
- [lib/job-queue/index.ts:74](lib/job-queue/index.ts#L74) - JobQueueService
- [lib/cron/background-filing-worker.ts:71](lib/cron/background-filing-worker.ts#L71) - BackgroundFilingWorker

**Email Queue**:
- [lib/email/async-email-queue.ts:72](lib/email/async-email-queue.ts#L72) - `queueEmail()` function
- [lib/email/async-email-queue.ts:296](lib/email/async-email-queue.ts#L296) - `processQueuedEmails()` function

## Architecture Documentation

### Pipeline Architecture

```
Cloudflare Worker (*/5 min)
    │
    ├── GET /api/cron/tier-aware (queues discovery jobs)
    │       │
    │       └── JobQueue: ASYNC_DISCOVER_FILINGS
    │               │
    │               └── Creates: ASYNC_FETCH_FILING jobs ← BLOCKED HERE
    │                       │
    │                       └── Creates: ASYNC_SUMMARIZE_CACHED jobs
    │                               │
    │                               └── Creates: ASYNC_EMAIL_DIGEST jobs
    │
    └── GET /api/cron/process-filing-queue (processes queued jobs)
            │
            └── BackgroundFilingWorker.processBatch()
```

### Error Propagation

The "Invalid time value" error in `calculateNextMarketOpen()` propagates through:
1. `getMarketHoursContext()` calls `calculateNextMarketOpen()` at line 172
2. `/api/cron/tier-aware` route calls `getMarketHoursContext()` at line 401
3. Error causes the entire cron execution to fail
4. No new fetch/summarize jobs get created
5. Email queue remains empty

## Historical Context (from thoughts/)

Related research documents:
- [2025-12-04-overall-pipeline-flow.md](thoughts/shared/research/2025-12-04-overall-pipeline-flow.md) - Full pipeline documentation
- [2025-12-03-morning-pipeline-verification.md](thoughts/shared/research/2025-12-03-morning-pipeline-verification.md) - Email delivery gap investigation
- [2025-11-21-cloudflare-worker-network-error-analysis.md](thoughts/shared/research/2025-11-21-cloudflare-worker-network-error-analysis.md) - Previous Cloudflare worker issues

## Open Questions

1. **Why does the date parsing fail specifically during the 5:XX AM UTC hour?**
   - Is it related to midnight Eastern time edge cases?
   - Is it a daylight saving time parsing issue?
   - Is it specific to the Vercel runtime environment?

2. **Why are 11,838 fetch jobs stuck in PENDING?**
   - Is the BackgroundFilingWorker not running?
   - Are jobs timing out before completion?
   - Is there a database lock issue?

3. **When did the backlog start accumulating?**
   - Oldest pending jobs date to Nov 28, 2025
   - This coincides with the last Cloudflare Worker deployment

## Related Research

- [2025-12-04-overall-pipeline-flow.md](thoughts/shared/research/2025-12-04-overall-pipeline-flow.md)
- [2025-12-03-morning-pipeline-verification.md](thoughts/shared/research/2025-12-03-morning-pipeline-verification.md)
- [2025-11-24-async-pipeline-failure-root-cause-analysis.md](thoughts/shared/research/2025-11-24-async-pipeline-failure-root-cause-analysis.md)
- [2025-11-21-cloudflare-worker-network-error-analysis.md](thoughts/shared/research/2025-11-21-cloudflare-worker-network-error-analysis.md)
