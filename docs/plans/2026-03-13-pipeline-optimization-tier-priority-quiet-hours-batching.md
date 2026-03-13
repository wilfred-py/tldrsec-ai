# Pipeline Optimization: Tier Priority, Quiet Hours, Adaptive Batching

**Date**: 2026-03-13
**Git Commit**: 1642c2f
**Branch**: worktree-pipeline-optimization
**Repository**: tldrsec-ai

## Context

Research (`thoughts/shared/research/2026-03-11-pipeline-throughput-tier-ordering-analysis.md`) measured the pipeline over 7 days and found:

1. **Tier priority is broken**: All jobs get priority 5 regardless of tier. FREE user gets summaries first 70% of the time (21/30 shared filings). The `getPriorityForTier()` function uses tier names (`ENTERPRISE`, `PROFESSIONAL`) that don't match the actual enum (`FREE`, `PRO`, `MAX`).
2. **Discovery runs 24/7**: Burns ~78s per run checking 15 tickers via RSS even during EDGAR dead hours (10 PM - 6 AM ET, weekends, holidays). 48 wasted runs/day.
3. **Summarize batch=1 bottleneck**: Max 1 summarize per cycle, but avg execution is 5s (most are shared-summary cache hits). Only fresh AI calls take 30-270s.
4. **RSS checks could be staggered**: Currently 5 parallel with no stagger, risking SEC rate limit bursts.

**Note**: FREE→TRIAL tier rename is happening in a separate instance. This plan uses current enum values and adds TRIAL awareness where needed.

---

## Task 1: Fix Tier-Based Job Priority

### Problem
`getPriorityForTier()` at `discovery-handler.ts:122-132` maps `ENTERPRISE→8, PROFESSIONAL→7, default→5`. The actual `SubscriptionTier` enum is `FREE | PRO | MAX`. All users fall through to default priority 5.

### Changes

**`lib/cron/handlers/discovery-handler.ts` (lines 122-132)**
Replace `getPriorityForTier()`:
```typescript
function getPriorityForTier(tier: string, isTrialing?: boolean, trialEndsAt?: Date | null): number {
  // Active trial users get MAX priority
  if (isTrialing && trialEndsAt && trialEndsAt > new Date()) return 9;
  switch (tier) {
    case 'MAX': return 9;
    case 'PRO': return 7;
    default: return 5;
  }
}
```

**`lib/cron/handlers/discovery-handler.ts` (~line 355, user query in `createBulkFetchJobs`)**
Add `isTrialing` and `trialEndsAt` to the user select:
```typescript
select: { id: true, email: true, subscriptionTier: true, isTrialing: true, trialEndsAt: true }
```
Pass these to `getPriorityForTier(user.subscriptionTier, user.isTrialing, user.trialEndsAt)`.

**`lib/cron/handlers/fetch-handler.ts` (lines 127-128, 302-303)**
Update inline priority expressions to call a shared function or match the same logic:
- `MAX` → 9, `PRO` → 7, default → 5
- Change `PLUS` → `PRO` if PLUS doesn't exist in the enum
- Pass `userTier` from payload (already available as `payload.userTier`)

### Verification
- After pipeline run, query: jobs with MAX/TRIAL users should have priority 9, PRO should have 7
- Run `npm run test` to verify no regressions

---

## Task 2: Skip Discovery During EDGAR Quiet Hours

### Problem
Discovery runs every 10 min, 24/7. EDGAR is closed 10 PM - 6 AM ET, weekends, and federal holidays. 48 unnecessary runs/day wasting ~62 minutes of compute and 720 SEC API calls.

### SEC EDGAR Hours (from research)
- **Open**: 6:00 AM - 10:00 PM ET, Monday-Friday
- **Form 4/Section 16 filings**: Disseminated until 10:00 PM ET (same-day date)
- **Standard filings after 5:30 PM**: Held until 6:00 AM next business day
- **RSS feeds**: Updated every 10 minutes, 6 AM - 10 PM ET only
- **Weekends/holidays**: Completely closed

### Changes

**New file: `lib/cron/edgar-schedule.ts`**
```typescript
export function isEdgarOpen(): boolean {
  const now = new Date();
  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', hour12: false,
    weekday: 'short',
    month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  // ... parse hour, day of week, date
  // Return false for: weekends, 22:00-05:59 ET, federal holidays
}
```
- 15-min buffer: skip from 10:15 PM to 5:45 AM ET
- Federal holiday list (2026): Jan 1, Jan 19, Feb 16, May 25, Jul 3, Sep 7, Oct 12, Nov 11, Nov 26, Dec 25
- Export for testing

**`cloudflare-cron/index.js` (~line 638, `handlePipelineProcessing`)**
- Before calling tier-aware endpoint, check `isEdgarOpen()`
- If closed: skip pipeline steps 1-3, still run auto-recovery health check
- Log: "Skipping pipeline: EDGAR quiet hours (next open: X)"

**`app/api/cron/tier-aware/route.ts` (~line 169)**
- Defense-in-depth: check `isEdgarOpen()` before queuing discovery job
- Return `{ status: 'skipped', reason: 'EDGAR quiet hours' }` with 200

### Verification
- Test `isEdgarOpen()` with mock dates: weekday 2 PM (true), Saturday noon (false), Tuesday 11 PM (false), holiday (false)
- Deploy CF Worker, check logs during quiet hours for skip messages
- Check logs during business hours for normal execution

---

## Task 3: Adaptive Summarize Batch Sizing

### Problem
`ASYNC_SUMMARIZE_CACHED` batch=1 because AI calls can take 30-270s (Vercel 300s limit). But data shows avg 5s execution — most are shared-summary cache hits. Only 1 summary processed per 10-min cycle.

### Approach: Time-Budget Adaptive Loop
Dequeue up to 5 summarize jobs. After each job completes, check remaining time budget. Stop if last job was slow (AI call) or insufficient time remains.

### Changes

**`lib/cron/types.ts` (line 182)**
```typescript
ASYNC_SUMMARIZE_CACHED: 5,  // was 1; adaptive time-budget limits actual processing
```
Add:
```typescript
export const SUMMARIZE_TIME_BUDGET_MS = 240000; // 240s budget, 60s buffer from 300s limit
```

**`lib/cron/background-filing-worker.ts` (lines 295-299)**
Replace the simple sequential loop:
```typescript
// Current:
for (const job of jobs) {
  const jobResult = await this.processJob(job);
  jobResults.push(jobResult);
}

// New:
const batchStart = Date.now();
for (const job of jobs) {
  // For summarize jobs after the first: check time budget
  if (job.jobType === 'ASYNC_SUMMARIZE_CACHED' && jobResults.length > 0) {
    const lastDuration = jobResults[jobResults.length - 1].duration || 0;
    const remaining = SUMMARIZE_TIME_BUDGET_MS - (Date.now() - batchStart);
    if (lastDuration > 30000 || remaining < 60000) {
      workerLogger.info('Stopping summarize batch - time budget', {
        elapsed: Date.now() - batchStart, remaining, lastDuration,
        processed: jobResults.length, total: jobs.length
      });
      break;
    }
  }
  const jobResult = await this.processJob(job);
  jobResults.push(jobResult);
}
```

### Verification
- Trigger pipeline with a filing tracked by 2+ users
- First user: AI summary (30-270s) → batch stops after 1
- Second user: cache hit (5s) → batch continues to process more
- Check logs for "Stopping summarize batch" when AI call is detected
- Confirm no Vercel 300s timeouts

---

## Task 4: Staggered RSS Check Launch

### Problem
Within each batch of 5 RSS checks, all 5 fire simultaneously. With 15 tickers in 3 batches, this creates 5 simultaneous SEC API requests per second — close to SEC's 10 req/s limit.

### Approach
Stagger launches within each batch by 200ms. 5 requests spread over 800ms = ~6.25 req/s effective rate.

### Changes

**`lib/cron/types.ts`**
Add:
```typescript
export const RSS_STAGGER_DELAY_MS = 200;
```

**`lib/cron/sec-filing-service.ts` (lines 395-435, `processBatchOfTickers`)**
Replace simultaneous `Promise.allSettled(batch.map(...))` with staggered launch:
```typescript
const promises = batch.map((ticker, i) => {
  return new Promise<void>(resolve => setTimeout(resolve, i * RSS_STAGGER_DELAY_MS))
    .then(() => this.checkTickerForNewFilings(ticker, monitor));
});
const results = await Promise.allSettled(promises);
```

### Verification
- Run discovery, check timing in logs: ticker checks should start ~200ms apart
- Monitor for SEC 429 responses (should be zero)
- Total discovery time should be similar to current (~78s)

---

## Implementation Order

1. - [x] **Task 1** (tier priority) — highest user impact, simplest change
2. - [x] **Task 2** (quiet hours) — saves 48 runs/day of wasted compute
3. - [x] **Task 3** (adaptive batch) — increases throughput for cache hits
4. - [x] **Task 4** (staggered RSS) — reduces rate limit risk

## Testing Strategy

1. Unit tests for `getPriorityForTier()`, `isEdgarOpen()`, time-budget loop
2. `npm run lint && npm run test`
3. `npm run test:pipeline:comprehensive`
4. `npm run test:e2e`

## Open Questions

1. Should `isEdgarOpen()` also be used to adjust polling frequency (e.g., every 30 min during low-activity hours 6-8 AM) rather than binary on/off?
2. For the TRIAL priority: should the trial check happen via DB query in the discovery handler, or should `isTrialing`/`trialEndsAt` be passed through the job payload to avoid extra queries in fetch/summarize?
3. The CF Worker has its own copy of time-checking logic (can't import from lib/). Should we duplicate `isEdgarOpen()` or have the CF Worker rely on the Vercel endpoint returning "skipped"?
