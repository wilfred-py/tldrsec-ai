---
date: 2025-12-18T07:30:00+11:00
researcher: Claude
git_commit: 6914d35fce82c2f1d52b76a474047d0725876dee
branch: main
repository: tldrsec-ai
topic: "Step 1.5 Discovery Timeout Error - Root Cause & Scalability Analysis"
tags: [research, pipeline, cloudflare, discovery, timeout, scalability, performance]
status: complete
last_updated: 2025-12-18
last_updated_by: Claude
---

# Research: Step 1.5 Discovery Timeout Error - Root Cause & Scalability Analysis

**Date**: 2025-12-18T07:30:00+11:00
**Researcher**: Claude
**Git Commit**: 6914d35fce82c2f1d52b76a474047d0725876dee
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Investigate the error `[cron-1765973422584-58a65e49cb7524d4] Step 1.5 failed: discovery jobs error` appearing in Cloudflare Worker logs on December 16th onwards, after the Step 1.5 implementation was deployed.

## Summary

**Root Cause**: Timeout mismatch between Cloudflare Worker (90s) and actual discovery job execution time (109s).

**Key Finding**: The discovery job **completed successfully** on Vercel, but the Cloudflare Worker timed out waiting for the response. The pipeline continued correctly due to the circuit breaker reset logic.

**Critical Scalability Issue**: The current sequential discovery architecture won't scale. At 10 users, discovery would take ~228 seconds; at 50+ users, over 5 minutes.

## Detailed Findings

### 1. Timeline of Events

| Date/Time | Event |
|-----------|-------|
| Dec 16, 19:37 AEDT | Commit `25e3ad7` added Step 1.5 (5-step pipeline) |
| Dec 17, 08:20 AEDT | Commit `6914d35` reduced discovery timeout to 90s |
| Dec 17, 23:10 AEDT | Error occurred: `Step 1.5 failed: discovery jobs error` |

### 2. Root Cause Analysis

The execution ID `cron-1765973422584-58a65e49cb7524d4` corresponds to **Dec 17, 2025 at 23:10:22 AEDT**.

**Database Query Results:**

```
Job ID: faebf12e-ba45-4eb9-9f9e-81d2d57d4698
Status: COMPLETED
Created: Dec 17, 2025 23:10:35 AEDT
Completed: Dec 17, 2025 23:12:26 AEDT
Execution Time: 108,776ms (~109 seconds)
```

**Timeout Configuration (cloudflare-cron/index.js):**

```javascript
const DISCOVERY_TIMEOUT_MS = 90 * 1000; // 90 seconds
const DISCOVERY_MAX_ATTEMPTS = 1; // No retries
```

**Result**: Cloudflare Worker timed out at 90s, but the job actually completed successfully at 109s on Vercel.

### 3. Why Discovery Takes >90 Seconds

The discovery handler performs these sequential operations:

1. Query all unique tickers across users
2. Fetch CIK mappings for each ticker (sequential)
3. Check SEC RSS feeds for new filings (sequential - **bottleneck**)
4. For each filing, query ALL users tracking that ticker
5. Create fetch jobs for each user-filing combination

**Code Location**: [lib/cron/sec-filing-service.ts:78](lib/cron/sec-filing-service.ts#L78)

```typescript
// PROBLEM: Sequential loop, not parallel
for (const tickerItem of tickers) {
  // Each iteration takes ~3.26 seconds
  const newFilings = await checkTickerForNewFilings(activeTicker);
}
```

### 4. Performance Metrics (Last 7 Days)

```
=== Current Scale ===
Users: 2
Total Tickers (with duplicates): 14
Unique Tickers: 8
Avg tickers per user: 7.0

=== Discovery Job Performance ===
Sample size: 100 jobs
Min: 15.4s
Avg: 26.1s
P95: 59.2s
Max: 108.8s

=== Per-Ticker Analysis ===
Time per unique ticker: 3.26s
```

### 5. Scalability Projections (Current Sequential Architecture)

| Users | Unique Tickers | Estimated Discovery Time |
|-------|----------------|-------------------------|
| 2 | 8 | ~26s (current avg) |
| 10 | ~70 | **~228s (3.8 min)** |
| 50 | ~100 | **~326s (5.4 min)** |
| 100 | ~100+ | **5+ minutes** |

**Conclusion**: Current architecture won't scale beyond 10 users without significant timeout increases or architectural changes.

### 6. Existing Infrastructure (Unused)

The codebase already defines `MAX_CONCURRENT_RSS_CHECKS = 3` in [lib/cron/types.ts:181](lib/cron/types.ts#L181), but it's **not used** in the discovery handler.

```typescript
// Defined but unused in discovery
export const MAX_CONCURRENT_RSS_CHECKS = 3;
```

## Conclusions

### Current State: Functional but Not Scalable

1. **Errors are non-fatal**: Pipeline continues correctly due to circuit breaker reset
2. **Jobs complete successfully**: Despite timeout errors, Vercel processes jobs to completion
3. **Architecture bottleneck**: Sequential ticker processing limits scalability

### Scalability Options

| Option | Approach | Scalability | Effort |
|--------|----------|-------------|--------|
| 1. Increase timeout | 90s → 120s → 180s | Poor (band-aid) | Low |
| 2. Accept errors as non-fatal | Current behavior | Poor | None |
| **3. Parallelize discovery** | Batch tickers with `Promise.all` | **Excellent** | Medium |

### Recommended Solution: Parallel Discovery

Modify `checkForNewFilings()` to process tickers in parallel batches:

**Expected Performance Improvement:**

| Users | Sequential (Current) | Parallel (3 concurrent) | Parallel (5 concurrent) |
|-------|---------------------|------------------------|------------------------|
| 2 | 26s | ~9s | ~5s |
| 10 | 228s | **76s** | **46s** |
| 50 | 326s | **109s** | **65s** |
| 100 | 326s | **109s** | **65s** |

**Implementation approach:**
1. Use existing `MAX_CONCURRENT_RSS_CHECKS` constant
2. Create batches of 3 tickers
3. Process each batch with `Promise.all`
4. Add delay between batches to respect SEC rate limits

## Code References

- [cloudflare-cron/index.js:295-355](cloudflare-cron/index.js#L295-L355) - Step 1.5 implementation with timeout
- [lib/cron/sec-filing-service.ts:71-150](lib/cron/sec-filing-service.ts#L71-L150) - Sequential `checkForNewFilings`
- [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) - Discovery handler
- [lib/cron/types.ts:181](lib/cron/types.ts#L181) - Unused `MAX_CONCURRENT_RSS_CHECKS = 3`

## Related Commits

- `25e3ad7` - feat: upgrade Cloudflare Worker to 5-step pipeline with discovery processing
- `6914d35` - fix: improve Cloudflare Worker discovery reliability and circuit breaker handling
- `4549c23` - Fix: Pipeline discovery, email tracking, and enhanced waitlist counter (#265)

## Related Research

- [2025-12-16-pipeline-e2e-validation-cloudflare-deployment.md](2025-12-16-pipeline-e2e-validation-cloudflare-deployment.md)
- [2025-12-16-pipeline-fix-validation-post-mortem.md](2025-12-16-pipeline-fix-validation-post-mortem.md)
- [2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md](2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md)

## Action Items

1. **Short-term**: Accept current behavior (non-fatal errors) - pipeline is functional
2. **Medium-term**: Implement parallel discovery with batching for scalability
3. **Long-term**: Consider caching SEC RSS responses to reduce API calls
