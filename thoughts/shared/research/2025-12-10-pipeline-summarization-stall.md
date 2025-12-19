---
date: 2025-12-10T06:56:20+11:00
researcher: Claude
git_commit: 7f68452df31a57750146d6fd8cd0ae84b20a2b8b
branch: main
repository: tldrsec-ai
topic: "E2E Pipeline Not Generating Summaries - Summarization Jobs Stalled"
tags: [research, codebase, pipeline, summarization, job-queue, investigation]
status: complete
last_updated: 2025-12-10
last_updated_by: Claude
---

# Research: E2E Pipeline Not Generating Summaries - Summarization Jobs Stalled

**Date**: 2025-12-10 06:56:20 AEDT
**Researcher**: Claude
**Git Commit**: 7f68452df31a57750146d6fd8cd0ae84b20a2b8b
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Why is the E2E pipeline not generating summaries? No recent OpenRouter API calls are observed and no recent summaries are being written to the Neon database.

## Summary

The summarization pipeline is stalled because **ASYNC_SUMMARIZE_CACHED jobs are not being processed**. While the Cloudflare Worker correctly calls the `/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED` endpoint, the job processing appears to have stopped since 2025-11-28 (12 days ago). There are currently:

- **126 PENDING** `ASYNC_SUMMARIZE_CACHED` jobs (unprocessed since Nov 28)
- **131 PENDING** `ASYNC_SUMMARIZE_FILING` jobs (legacy sync jobs)
- **11,786 PENDING** `ASYNC_FETCH_FILING` jobs (blocked backlog)
- **19 COMPLETED** `ASYNC_SUMMARIZE_CACHED` jobs (all completed on Nov 28)
- **1 DEAD_LETTER** job (orphaned with null userId)

The last summary was written to the database on **2025-12-04 08:50:27 UTC**, suggesting the Vercel endpoint was working until then, but has since stopped processing jobs.

## Detailed Findings

### Pipeline Architecture

The 3-phase asynchronous pipeline operates as follows:

```
Cloudflare Worker (every 10 min)
    │
    ├── Step 1: /api/cron/tier-aware
    │   └── Creates ASYNC_DISCOVER_FILINGS job
    │
    └── Step 2: /api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED
        └── BackgroundFilingWorker.processBatch()
            ├── Attempts to process ASYNC_FETCH_FILING jobs first
            └── Then processes ASYNC_SUMMARIZE_CACHED jobs
```

**Key Files:**
- [cloudflare-cron/index.js:118](cloudflare-cron/index.js#L118) - Worker URL construction with job type filter
- [lib/cron/background-filing-worker.ts:156-188](lib/cron/background-filing-worker.ts#L156-L188) - Job type priority loop
- [app/api/cron/process-filing-queue/route.ts](app/api/cron/process-filing-queue/route.ts) - API endpoint

### Job Queue Status (as of 2025-12-10)

| Job Type | Status | Count |
|----------|--------|-------|
| ASYNC_DISCOVER_FILINGS | COMPLETED | 2,096 |
| ASYNC_FETCH_FILING | COMPLETED | 100 |
| ASYNC_FETCH_FILING | PENDING | 11,786 |
| ASYNC_SUMMARIZE_CACHED | COMPLETED | 19 |
| ASYNC_SUMMARIZE_CACHED | PENDING | 126 |
| ASYNC_SUMMARIZE_CACHED | DEAD_LETTER | 1 |
| ASYNC_SUMMARIZE_FILING | PENDING | 131 |

### Recent Activity Timeline

| Date | Event |
|------|-------|
| 2025-11-28 02:32:54 UTC | Last ASYNC_SUMMARIZE_CACHED job completed |
| 2025-12-04 08:50:27 UTC | Last summary written to database |
| 2025-12-08 21:43:26 UTC | Latest ASYNC_SUMMARIZE_FILING job created |
| 2025-12-08 20:11:18 UTC | Latest ASYNC_SUMMARIZE_CACHED job created |
| 2025-12-09 18:33 AEDT | Cloudflare Worker redeployed with job type filter fix |

### AI Summarization Configuration

**API Provider**: OpenRouter (not Anthropic directly)
**Primary Model**: `x-ai/grok-4.1-fast` (or `grok-4-fast-reasoning` in production)
**Fallback Model**: `x-ai/grok-4-fast`

**Environment Variables:**
- `TLDRSEC_AI_SUMMARIZER` - Primary API key (OpenRouter)
- `OPENROUTER_API_KEY` - Fallback API key
- `DEFAULT_AI_MODEL` - Model selection

**Key Files:**
- [lib/ai/openrouter-client.ts:36](lib/ai/openrouter-client.ts#L36) - API key configuration
- [lib/ai/config.ts:70](lib/ai/config.ts#L70) - Default model configuration
- [services/filing/summaryGenerationService.ts:146-159](services/filing/summaryGenerationService.ts#L146-L159) - API call with 100s timeout

### Processing Flow

The summarization flow is:

1. **ASYNC_SUMMARIZE_CACHED job picked up** by BackgroundFilingWorker
2. **Cache content retrieved** from `FilingContentCache` table
3. **generateAISummary()** called in [services/filing/summaryGenerationService.ts:130](services/filing/summaryGenerationService.ts#L130)
4. **OpenRouter API call** with 100s timeout, $0.50 cost limit
5. **Summary saved** to `Summary` table
6. **Email sent** via Resend API
7. **User budget updated**

### Job Processing Logic

The BackgroundFilingWorker processes jobs in priority order:

```typescript
// lib/cron/background-filing-worker.ts:156-188
const defaultJobTypes: JobType[] = ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'];
const jobTypesToProcess = this.jobTypes ?? defaultJobTypes;

for (const jobType of jobTypesToProcess) {
  if (jobs.length > 0) break; // Already have jobs to process

  const batchSize = getBatchSizeForJobType(jobType);
  const typeJobs = await JobQueueService.getJobsToProcessMultipleTypes(
    batchSize,
    [jobType]
  );
  // ...
}
```

**Batch Sizes by Job Type:**
- ASYNC_DISCOVER_FILINGS: 10 (fast, 5-15s each)
- ASYNC_FETCH_FILING: 2 (medium, 10-30s each)
- ASYNC_SUMMARIZE_CACHED: 3 (slow, 17-90s each)

### Recent Fix (2025-12-09)

A race condition fix was deployed to prevent discovery jobs from blocking fetch/summarize processing:

- **Problem**: Discovery jobs queued in Step 1 immediately blocked fetch job processing in Step 2
- **Solution**: Added `?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED` filter to Step 2 URL
- **Verification**: Confirmed working at 18:35 AEDT with 30.3s processing time

Reference: [docs/plans/2025-12-09-fix-fetch-job-processing-race-condition.md](docs/plans/2025-12-09-fix-fetch-job-processing-race-condition.md)

### Cloudflare Worker Configuration

The Cloudflare Worker runs every 10 minutes and calls two endpoints sequentially:

1. **tier-aware**: Queues discovery jobs
2. **process-filing-queue**: Processes fetch and summarize jobs

The worker has been redeployed and is functioning correctly based on the logs showing Step 2 URL includes the job type filter.

## Database State Evidence

### Recent Summaries (last 10)

```
2025-12-04T08:50:27.755Z - TickerID: 1b0672d9 - 144 - Content: YES
2025-12-04T08:50:17.016Z - TickerID: 6fc12d8a - 4 - Content: YES
2025-12-04T08:49:59.494Z - TickerID: f2a636e2 - 4 - Content: YES
2025-12-04T08:49:45.625Z - TickerID: e552bdac - 4 - Content: YES
2025-12-04T08:49:34.379Z - TickerID: a89162af - 4 - Content: YES
2025-12-03T13:08:11.531Z - TickerID: a89162af - 4 - Content: YES
2025-12-02T21:39:55.444Z - TickerID: a89162af - 4 - Content: YES
2025-12-02T18:28:41.115Z - TickerID: 1b0672d9 - 144 - Content: YES
2025-12-02T18:25:35.570Z - TickerID: a89162af - 4 - Content: YES
2025-12-02T09:29:57.266Z - TickerID: 1b0672d9 - 4 - Content: YES
```

### Oldest PENDING ASYNC_SUMMARIZE_CACHED Jobs

Jobs have been waiting since 2025-11-28 (12 days):

```
2025-11-28T11:07:53.418Z - ASYNC_SUMMARIZE_CACHED - PENDING (16,364 min wait)
2025-11-28T11:10:02.642Z - ASYNC_SUMMARIZE_CACHED - PENDING (16,362 min wait)
...
```

### Dead Letter Job

One orphaned job with null userId:

```
ID: 605cb34d-63cc-4bd2-b319-2fba344aa2c1
Created: 2025-11-28T01:06:33.478Z
Retry Count: 2
Last Error: Manual fix: Cache contained SEC search page HTML. userId/userEmail are null - job was orphaned. Cache deleted.
```

## Potential Causes

1. **API Key Issue**: OpenRouter API key may be invalid or rate-limited
2. **Vercel Timeout**: Process-filing-queue endpoint may be timing out before completing
3. **Job Acquisition Issue**: Jobs may not be successfully acquired by the worker
4. **Circuit Breaker**: The Cloudflare Worker circuit breaker may be open
5. **Database Lock**: Distributed locking may be preventing job acquisition

## Code References

- `lib/cron/background-filing-worker.ts:156-188` - Job type priority and batch processing
- `lib/cron/handlers/summarize-cached-handler.ts` - Summarize job handler
- `services/filing/summaryGenerationService.ts:130-182` - AI summary generation
- `lib/ai/openrouter-client.ts:419-586` - OpenRouter API client
- `lib/ai/config.ts:36-70` - API key and model configuration
- `cloudflare-cron/index.js:118` - Worker URL with job type filter
- `app/api/cron/process-filing-queue/route.ts` - API endpoint for job processing

## Historical Context (from thoughts/)

- [2025-12-09-fetch-job-processing-cloudflare-investigation.md](thoughts/shared/research/2025-12-09-fetch-job-processing-cloudflare-investigation.md) - Discovery of race condition blocking fetch jobs
- [docs/plans/2025-12-09-fix-fetch-job-processing-race-condition.md](docs/plans/2025-12-09-fix-fetch-job-processing-race-condition.md) - Implementation plan for job type filter fix

## Open Questions

1. **Why are ASYNC_SUMMARIZE_CACHED jobs not being picked up by the worker since Nov 28?**
2. **What happened on Dec 4 that allowed summaries to be generated?** (Last summary written Dec 4, suggesting a different code path)
3. **Is the OpenRouter API key still valid and has sufficient credits?**
4. **Are there any errors in the Vercel function logs for process-filing-queue?**
5. **Is the job acquisition query returning jobs correctly?**

## Next Steps for Investigation

1. Check Vercel function logs for `/api/cron/process-filing-queue` errors
2. Verify OpenRouter API key validity and balance
3. Manually trigger a summarization job to test the pipeline
4. Check if `getJobsToProcessMultipleTypes()` is returning jobs
5. Review the job lock acquisition in `JobQueueService`
