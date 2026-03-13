---
date: 2026-03-11T08:30:00-05:00
researcher: Claude
git_commit: 1642c2f
branch: worktree-pipeline-optimization
repository: tldrsec-ai
topic: "Pipeline Throughput, Tier Ordering, and Efficiency Analysis"
tags: [research, pipeline, throughput, tier-ordering, optimization, job-queue]
status: complete
last_updated: 2026-03-11
last_updated_by: Claude
---

# Research: Pipeline Throughput, Tier Ordering, and Efficiency Analysis

**Date**: 2026-03-11
**Git Commit**: 1642c2f
**Branch**: worktree-pipeline-optimization

## Research Question

How many tickers are fetched, parsed, summarized, and emailed per run? Is there tier-based prioritization? Are there inefficiencies? Goal: maximize summaries per run and deliver MAX tier before PRO tier.

## Summary

The 3-phase async pipeline (Discovery → Fetch → Summarize) runs every 10 minutes via Cloudflare Worker. Over the last 7 days it produced **209 summaries** (~30/day) across **75 active windows** for **2 active users** tracking **15 unique tickers**. The current architecture has **no effective tier-based prioritization** — all fetch and summarize jobs are enqueued at identical priority 5 regardless of subscription tier. Data shows the FREE user received summaries first **70% of the time** (21/30 shared filings). The biggest throughput bottleneck is that only **1 summarize job is processed per 10-minute cycle**, and discovery runs consume ~78 seconds even when no filings are found.

## Concrete Numbers (Last 7 Days: 2026-03-04 to 2026-03-11)

### Per-Run Throughput

| Metric | Value |
|---|---|
| Cron trigger frequency | Every 10 min (CF Worker) |
| Active 10-min windows with summaries | 75 |
| Total summaries created | 209 |
| Avg summaries per active window | 2.8 |
| Best window (2026-03-10 21:30) | 10 (5 fresh + 5 cached) |
| Filing types | 95%+ Form 4, occasional 8-K |

### Job Queue (7 Days)

| Job Type | Count | Completed | Failed | Avg Queue Wait | Avg Execution |
|---|---|---|---|---|---|
| ASYNC_DISCOVER_FILINGS | 2,041 | — | 12 | 181s | 140s |
| ASYNC_FETCH_FILING | 2,012 | — | 0 | **1,231s (20 min)** | 6s |
| ASYNC_SUMMARIZE_CACHED | 2,380 | — | 5 | 39s | 5s |
| **Total** | **6,433** | **6,413** | **17** | — | — |

### Users & Tickers

| User | Tier | Tickers | Last Processed |
|---|---|---|---|
| wilfredchen1@gmail.com | FREE | 14 (COIN,CMG,BAC,TSLA,VRT,NVDA,MSFT,JNJ,KO,AAPL,GOOGL,META,AMZN,BRK-B) | 2026-03-10 22:25 |
| wilfred.chen.python@gmail.com | PRO | 10 (TSLA,JPM,VRT,CMG,AAPL,COIN,KO,GOOGL,NVDA,META) | 2026-03-10 22:29 |
| wilfred.python.test@gmail.com | FREE | 0 | 2026-03-04 21:13 |

### Ticker Monitoring

All 15 tickers active. Last checked: 2026-03-11 02:37-02:43 UTC. Subscriber counts: 1-5 per ticker.

### Email Delivery

- Avg summary-to-email delay: **2 seconds**
- Max delay: 4 seconds
- All 30 recent deliveries: status "sent" (100% delivery rate)

### Costs

- Avg cost per fresh summary: ~$0.0023
- Cache hit summaries: $0.00
- Content cache: 855 entries, avg fetch 1,208ms, avg content 326K chars

### All-Time Totals

- Summaries: 1,975
- Email deliveries: 1,969
- SecFilings discovered: 1

## Tier Ordering Analysis

### Current State: No Effective Tier Prioritization

**All fetch and summarize jobs are enqueued at priority 5 regardless of user tier.** The dequeue query orders by `priority DESC, scheduledFor ASC, createdAt ASC` — but since all jobs share the same priority, order is purely FIFO by creation time.

The discovery handler (`discovery-handler.ts:122-132`) has priority mapping code:
- ENTERPRISE: priority 8
- PROFESSIONAL/INSTITUTION: priority 7
- Others: priority 5

But in practice, the actual `subscriptionTier` enum values are `FREE`, `PRO`, `MAX` — none of which match `ENTERPRISE`, `PROFESSIONAL`, or `INSTITUTION`. So **all users fall through to the default priority 5**.

### Data Evidence

Of 30 shared filings where both users got the same filing:
- **FREE user got summary first: 21 times (70%)**
- **PRO user got summary first: 9 times (30%)**
- Typical delay between first/second user: 16-17 seconds
- Occasional larger delays: 164-193 seconds

The FREE user consistently wins because:
1. They have 14 tickers vs PRO's 10 (more overlap = more filings discovered for them)
2. Jobs are created in user-iteration order from `prisma.user.findMany`, not sorted by tier
3. All jobs share priority 5, so FIFO order (creation time) determines processing order

## Pipeline Architecture (How It Works)

### 10-Minute Cycle (Cloudflare Worker)

```
Step 0: GET /api/cron/cleanup-locks
Step 1: GET /api/cron/tier-aware
        → Queues 1 ASYNC_DISCOVER_FILINGS job (priority 10)
Step 2: GET /api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS
        → Dequeues up to 10 discovery jobs, processes sequentially
Step 3: GET /api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING
        → Dequeues up to 5 fetch jobs, processes sequentially
Step 4: GET /api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED
        → Dequeues 1 summarize job, processes it
```

### Phase Breakdown

**Phase 1 - Discovery** (~78s baseline, up to 256s):
- Upserts TickerMonitoring records for all active tickers
- Bulk enriches all tickers with CIK (2 DB queries)
- Checks RSS feeds for each ticker sequentially (15 HTTP calls to SEC)
- Recovers unprocessed backlog filings (up to 50)
- For each new filing: queries all subscriber users, creates bulk fetch jobs
- Even when no filings found: still takes ~78 seconds (RSS checks dominate)

**Phase 2 - Fetch** (~6s per job):
- Checks FilingContentCache (24h TTL). Cache hit → skip HTTP fetch
- Fetches EDGAR index page → extracts primary document URL → fetches content
- Verifies content against expected metadata (warn-only on low confidence)
- Caches content in FilingContentCache
- Queues ASYNC_SUMMARIZE_CACHED job

**Phase 3 - Summarize** (~5s avg, up to 270s for AI):
- Checks trial status (email gate)
- Retrieves cached content
- Checks user filing type preferences
- Checks for duplicate summary (skip if already sent)
- **Shared summary reuse**: Looks for any user's summary of same filing → copies it (no AI call, $0 cost)
- AI summarization via OpenRouter (30-270s, ~$0.0023) — only if no shared summary exists
- Sends email synchronously (not via AsyncEmailQueue)
- Updates user lastProcessedAt

### Batch Sizes (per processor invocation)

| Job Type | Batch Size | Effective per 10-min cycle |
|---|---|---|
| ASYNC_DISCOVER_FILINGS | 10 | 10 |
| ASYNC_FETCH_FILING | 5 | 5 |
| ASYNC_SUMMARIZE_CACHED | **1** | **1** |

## Irregularities Observed

### 1. Discovery Timeouts (Critical)
12 discovery jobs failed in the last 7 days with "Application timeout after 270001ms". These all hit the 270s per-job timeout. Discovery checking 15 tickers via individual RSS calls is the root cause. Some runs take >250s when SEC is slow.

### 2. CronJobExecution Shows 0 Everywhere
All 50 CronJobExecution records show `tickersChecked: 0, newFilingsFound: 0, filingsProcessed: 0, emailsSent: 0`. This is because the 3-phase path returns HTTP 202 immediately after queuing one discovery job. The CronJobExecution metrics aren't populated in the 3-phase path — they're only relevant in the legacy sync path.

### 3. TierProcessingExecution Table Schema Mismatch
The `TierProcessingExecution` table is missing the `status` column that the Prisma schema defines (`ExecutionStatus`). Raw queries against it fail. This table may be vestigial from the legacy path.

### 4. CronExecutionContext Query Fails
Same schema mismatch — the Prisma client expects columns that don't exist in the actual database table.

### 5. DailyPipelineVerification Empty
No verification records in the last 7 days. The `verify:daily` cron may not be configured.

### 6. SecFiling Table Has Only 1 Record (All-Time)
Despite discovering 209+ filings in 7 days, the `SecFiling` table has only 1 record. Filings are tracked via `RssFilingCheck` and `FilingContentCache` instead. The `SecFiling` table appears underutilized.

### 7. Fetch Queue Wait: 20+ Minutes Average
Fetch jobs wait an average of 1,231 seconds (20 min) in the queue despite only taking 6 seconds to execute. This is because only 5 are processed per 10-min cycle — if a burst of filings is discovered, the backlog grows.

### 8. JPM Ticker Error
5 failed ASYNC_SUMMARIZE_CACHED jobs on 2026-03-04: "Ticker JPM not found for user 4b23f7fe...". User had JPM in their ticker list but the Ticker record was likely deleted or the user-ticker association changed between job creation and processing.

### 9. 100% retryCount=1 on Fetch/Summarize
All completed fetch and summarize jobs have retryCount=1 (documented as expected cold-start behavior — initial attempt fails during Vercel cold start, retry succeeds after 1-min backoff).

### 10. Summary Count (722) vs Content Cache (855) Mismatch
855 content cache entries but only 209 summaries in 7 days (722 in 30 days). Many cached contents don't produce summaries — likely filtered by user filing type preferences or duplicate detection.

## Open Questions

1. **Why don't fetch/summarize job priorities reflect user tier?** The priority mapping in `discovery-handler.ts:122-132` uses tier names (ENTERPRISE, PROFESSIONAL) that don't match the actual enum values (FREE, PRO, MAX). Is this a bug or intentional?

2. **Why only 1 summarize job per cycle?** The batch size is 1 because "AI calls can take 30-270s", but most summarize jobs are cache hits (5s). Could the batch size be dynamic — larger for cache hits, 1 for fresh AI calls?

3. **Should discovery run when no market activity?** Discovery takes ~78s every 10 min, 24/7. SEC filings are only published during business hours (typically 6am-10pm ET). Off-hours discovery is pure overhead.

4. **Why is the CronJobExecution table not updated in 3-phase mode?** The metrics infrastructure exists but isn't connected to the async pipeline. This makes operational monitoring blind.

5. **Is the 20-minute fetch queue wait acceptable?** If a filing is discovered and a MAX tier user is tracking it, they won't get the email for 20+ minutes due to queue backlog. Is this meeting SLA expectations?

6. **What drives the burst pattern?** Data shows some windows with 9-10 summaries and many with 1-2. Is this correlated with SEC filing publication times?

7. **Should the Cloudflare Worker call process-filing-queue more than once per job type?** Currently it calls each type once. Calling summarize 3-5 times per cycle would clear backlogs faster.

8. **Why does the FREE user (14 tickers) have more tickers than the PRO user (10)?** There's no tier-based ticker limit enforced, and the FREE user actually has the most comprehensive coverage.

## Code References

- `app/api/cron/tier-aware/route.ts:162-248` — 3-phase pipeline entry
- `app/api/cron/process-filing-queue/route.ts:163` — Job processor entry
- `lib/cron/handlers/discovery-handler.ts:122-132` — Priority mapping (broken for actual tiers)
- `lib/cron/handlers/discovery-handler.ts:347-436` — Bulk job creation
- `lib/cron/handlers/fetch-handler.ts:95-140` — Cache check before fetch
- `lib/cron/handlers/summarize-cached-handler.ts:297-445` — Shared summary reuse
- `lib/cron/handlers/summarize-cached-handler.ts:539-594` — Synchronous email send
- `lib/cron/background-filing-worker.ts:254-272` — Job type iteration (stops at first with work)
- `lib/job-queue/index.ts:372-381` — Dequeue SQL: `ORDER BY priority DESC, scheduledFor ASC, createdAt ASC`
- `lib/cron/types.ts:179-185` — Batch sizes: discover=10, fetch=5, summarize=1
- `cloudflare-cron/index.js:721-727` — 3 sequential process-filing-queue calls per cycle
