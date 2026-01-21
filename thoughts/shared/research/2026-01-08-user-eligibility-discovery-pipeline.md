---
date: 2026-01-08T18:36:44+11:00
researcher: Claude
git_commit: 01a8851c51efc50af3cede439616814a8beb6d76
branch: main
repository: tldrsec-ai
topic: "User Eligibility Logic in Discovery Jobs - Why eligibleUsers Shows 0"
tags: [research, codebase, cron, discovery, eligibility, pipeline]
status: complete
last_updated: 2026-01-08
last_updated_by: Claude
---

# Research: User Eligibility Logic in Discovery Jobs

**Date**: 2026-01-08T18:36:44+11:00
**Researcher**: Claude
**Git Commit**: 01a8851c51efc50af3cede439616814a8beb6d76
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Why do Discovery jobs report `eligibleUsers: 0` and `fetchJobsQueued: 0`?

The user observed:
1. Cloudflare worker cron triggers discovery jobs
2. Discovery jobs complete successfully
3. Discovery finds 0 eligible users, so no fetch jobs are queued
4. No fetch/summarize jobs means no API calls to OpenRouter
5. No email summaries are sent (e.g., for NVDA Form 144)

## Summary

**There are TWO different "eligibility" concepts in this codebase that are being conflated:**

1. **User Processing Eligibility** ([tier-eligibility.ts](lib/cron/tier-eligibility.ts)) - Determines which users can be processed in a cron cycle based on tier frequency limits
2. **Discovery Phase Eligibility** ([discovery-handler.ts](lib/cron/handlers/discovery-handler.ts)) - The `eligibleUsers` count in discovery results represents users who track discovered filings

**The `eligibleUsers: 0` in discovery results does NOT mean users failed eligibility checks. It means no users were found tracking tickers that had new filings discovered.**

## Detailed Findings

### 1. The 3-Phase Async Pipeline Architecture

When `USE_3_PHASE_PIPELINE` is not set to `'false'` (default is enabled), the tier-aware cron endpoint at [route.ts:162-225](app/api/cron/tier-aware/route.ts#L162-L225) queues a single `ASYNC_DISCOVER_FILINGS` job and returns immediately with a 202 status.

The pipeline has three phases:
- **Phase 1 (Discovery)**: Find new SEC filings across all tickers
- **Phase 2 (Fetch)**: Retrieve filing content for each user-ticker combination
- **Phase 3 (Summarize)**: Generate AI summaries and send emails

### 2. Discovery Handler Implementation

The discovery handler at [discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) performs ticker-centric discovery:

**Step 1**: Get all unique ticker symbols from the database (lines 241-248)
```typescript
const uniqueTickerSymbols = await prisma.ticker.findMany({
  select: { symbol: true },
  distinct: ['symbol']
});
```

**Step 2**: Enrich tickers with CIK mappings (line 270)

**Step 3**: Check SEC RSS feeds for new filings via `CronSecFilingService.checkForNewFilings()` (lines 280-283)

**Step 4**: For each discovered filing, find ALL users tracking that ticker (lines 295-313)
```typescript
const usersForTicker = await prisma.user.findMany({
  where: {
    tickers: {
      some: { symbol: filing.ticker }
    }
  },
  // ...
});
```

**Step 5**: Bulk create `ASYNC_FETCH_FILING` jobs for each user-filing combination (lines 332-349)

### 3. The `eligibleUsers` Field in Discovery Results

The `eligibleUsers` count returned by discovery (line 388) represents:
```typescript
eligibleUsers: totalUsersProcessed
```

Where `totalUsersProcessed` is incremented when users are found for a discovered filing (line 352):
```typescript
totalUsersProcessed += usersForTicker.filter(u => u.tickers.length > 0).length;
```

**If `eligibleUsers: 0`, it means one of these conditions:**
1. No tickers exist in the database (`tickerSymbols.length === 0`)
2. No new filings were discovered by SEC RSS feed check (`allNewFilings.length === 0`)
3. Users tracking discovered filings have empty ticker arrays

### 4. SEC Filing Service - The Key to Finding New Filings

The `CronSecFilingService.checkForNewFilings()` method determines if a filing is "new". This is the critical component - if it returns empty results, no fetch jobs can be queued.

### 5. User Processing Eligibility (Separate System)

The user processing eligibility system at [tier-eligibility.ts](lib/cron/tier-eligibility.ts) is a **separate concept** used in the legacy processing path (when 3-phase pipeline is disabled):

- PRO tier: Eligible every 5 minutes (configurable via `PRO_MARKET_FREQUENCY`)
- HOBBY tier: Eligible every 120 minutes (configurable via `HOBBY_MARKET_FREQUENCY`)
- Users never processed (`lastCronProcessed` is null) are eligible immediately

This eligibility is checked via:
```typescript
const { allUsers, eligibleUsers } = await CronUserProcessingService.getEligibleUsersForProcessing({
  maxUsersPerCycle: maxUsersForTimeRemaining
});
```

But in the 3-phase pipeline, this code path is NOT reached because the function returns early at line 215 after queuing the discovery job.

### 6. Data Flow Summary

```
Cloudflare Cron (every 10 min)
    ↓
tier-aware/route.ts GET handler
    ↓
[3-phase pipeline enabled?]
    ↓ YES
Queue ASYNC_DISCOVER_FILINGS job → Return 202
    ↓
Job Queue Worker picks up discovery job
    ↓
discovery-handler.ts handleDiscovery()
    ↓
1. Query all unique tickers from database
2. Enrich with CIK mappings
3. Check SEC RSS feeds for NEW filings (CronSecFilingService.checkForNewFilings)
4. For each new filing found:
   - Find all users tracking that ticker
   - Bulk create ASYNC_FETCH_FILING jobs
    ↓
Return DiscoveryResult with:
- filingsDiscovered: number of new SEC filings found
- fetchJobsQueued: number of fetch jobs created
- eligibleUsers: number of users who track discovered filings (accumulated)
- uniqueTickers: total tickers in system
```

## Code References

- [lib/cron/tier-eligibility.ts](lib/cron/tier-eligibility.ts) - User tier-based processing eligibility
- [lib/cron/user-processing-service.ts](lib/cron/user-processing-service.ts) - User processing service with `getEligibleUsersForProcessing()`
- [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) - Discovery phase handler
- [app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts) - Main cron endpoint
- [lib/cron/sec-filing-service.ts](lib/cron/sec-filing-service.ts) - SEC filing service with `checkForNewFilings()`

## Architecture Documentation

### Environment Variables Affecting Eligibility

**Tier Frequencies** (used in legacy path only):
- `PRO_MARKET_FREQUENCY` - Minutes between PRO tier processing (default: 5)
- `HOBBY_MARKET_FREQUENCY` - Minutes between HOBBY tier processing (default: 120)

**Pipeline Mode**:
- `USE_3_PHASE_PIPELINE` - Set to `'false'` to use legacy sync processing (default: enabled/true)

### Key Interfaces

**DiscoveryResult** (discovery-handler.ts:27-36):
```typescript
interface DiscoveryResult {
  success: boolean;
  filingsDiscovered: number;  // New filings from SEC RSS
  fetchJobsQueued: number;    // Jobs created for users
  eligibleUsers: number;      // Users tracking discovered filings
  uniqueTickers: number;      // Total tickers in system
  usersPerFiling: number;     // Average users per filing
  duration: number;
  error?: string;
}
```

**ProcessingEligibility** (tier-eligibility.ts:27-33):
```typescript
interface ProcessingEligibility {
  isEligible: boolean;
  tier: NormalizedTier;
  frequencyMs: number;
  timeSinceLastProcess: number | null;
  nextEligibleTime: Date | null;
}
```

## Root Cause Analysis

When `eligibleUsers: 0` and `fetchJobsQueued: 0`:

**Most likely cause**: `CronSecFilingService.checkForNewFilings()` returned no new filings.

This could happen because:
1. No new SEC filings were published since last check
2. SEC RSS feed returned empty/error
3. CIK mappings are missing for tracked tickers (filings can't be matched)
4. All discovered filings already exist in the database (not "new")

**To investigate further**, check:
1. The `CronSecFilingService.checkForNewFilings()` implementation
2. SEC RSS feed connectivity and response parsing
3. CIK mapping completeness for tracked tickers
4. SecFiling table to see what filings already exist

## Related Research

None found in thoughts/shared/research/ directory.

## Open Questions

1. What does `CronSecFilingService.checkForNewFilings()` consider a "new" filing vs an already-processed one?
2. Are CIK mappings complete for all user-tracked tickers?
3. What is the SEC RSS feed polling frequency and are there connectivity issues?
4. Is there a separate backlog processing system that should be catching missed filings?
