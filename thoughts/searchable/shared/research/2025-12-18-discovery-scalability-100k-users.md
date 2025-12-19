---
date: 2025-12-18T07:47:42+11:00
researcher: Claude
git_commit: 72acaeb0ea6d2cfd72ae78e2e51e7735a88476b4
branch: main
repository: tldrsec-ai
topic: "Discovery Scalability Analysis: MAX_CONCURRENT_RSS_CHECKS Upper Bound and 100K User Architecture"
tags: [research, scalability, discovery, sec-api, rate-limiting, architecture]
status: complete
last_updated: 2025-12-18
last_updated_by: Claude
---

# Research: Discovery Scalability Analysis - MAX_CONCURRENT_RSS_CHECKS Upper Bound and 100K User Architecture

**Date**: 2025-12-18T07:47:42+11:00
**Researcher**: Claude
**Git Commit**: 72acaeb0ea6d2cfd72ae78e2e51e7735a88476b4
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

What is the upper bound of `MAX_CONCURRENT_RSS_CHECKS`? If we scale to 100,000 users, what is the optimal solution? What components need to be deleted or replaced?

## Summary

### Upper Bound of MAX_CONCURRENT_RSS_CHECKS

**Theoretical Upper Bound: 10 concurrent requests** (limited by SEC EDGAR rate limit of 10 requests/second)

**Practical Upper Bound: 5-7 concurrent requests** (with safety margin to avoid IP blocking)

**Current Value: 3** (conservative, safe approach)

### Key Finding: Tickers Scale Sublinearly with Users

The critical insight is that **unique ticker count does not grow linearly with users**. The S&P 500 has ~500 companies; the total investable universe on NASDAQ/NYSE is ~8,000 companies. At 100K users:
- Expected unique tickers: **500-2,000** (not 100,000)
- This fundamentally changes the scalability equation

### Optimal Solution for 100K Users

**The current architecture is already 70-80% correct.** The main changes needed:

1. **Increase `MAX_CONCURRENT_RSS_CHECKS` to 5** (immediate, safe)
2. **Add RSS response caching with 30-60 second TTL** (medium priority)
3. **Replace sequential job creation with bulk `createMany`** (high impact)
4. **Add database connection pooling** (essential for scale)

### What Should Be Deleted

Nothing needs deletion. The architecture is sound. Changes are additive:
- Keep the 3-phase pipeline structure
- Keep ticker-centric discovery
- Keep the `TickerMonitoring` deduplication model

---

## Detailed Findings

### 1. MAX_CONCURRENT_RSS_CHECKS Constraints

#### SEC EDGAR Rate Limits (External Constraint)

| Limit Type | Value | Source |
|------------|-------|--------|
| **Hard rate limit** | 10 requests/second | SEC.gov official policy |
| **Block trigger** | Exceed 10 req/s | Automatic 403 response |
| **Block duration** | 10+ minutes | Extends if violations continue |
| **Required header** | User-Agent with company + email | Mandatory for all requests |

**Source**: [SEC.gov - New Rate Control Limits](https://www.sec.gov/oit/announcement/new-rate-control-limits)

#### Current Implementation

[lib/cron/types.ts:181](lib/cron/types.ts#L181):
```typescript
export const MAX_CONCURRENT_RSS_CHECKS = 3;
```

[lib/cron/sec-filing-service.ts:182-193](lib/cron/sec-filing-service.ts#L182-L193):
```typescript
const batches = this.createTickerBatches(activeTickers, MAX_CONCURRENT_RSS_CHECKS);
for (const batch of batches) {
  await this.processBatchOfTickers(batch);
  await this.delay(1000); // 1 second between batches
}
```

**Current pattern**: 3 concurrent requests, then 1-second pause, repeat.
**Effective rate**: ~3 requests/second (well under SEC limit)

#### Upper Bound Analysis

| Value | Requests/Second | Risk Level | Notes |
|-------|-----------------|------------|-------|
| 3 | ~3/s | Very safe | Current setting |
| 5 | ~5/s | Safe | 50% headroom |
| 7 | ~7/s | Moderate | 30% headroom |
| 10 | ~10/s | Risky | At limit, no margin |
| >10 | >10/s | **Blocked** | Will trigger 403 |

**Recommendation**: Increase to **5** for production (safe margin + 66% throughput improvement).

---

### 2. Scalability at 100,000 Users

#### User-to-Ticker Relationship (Key Insight)

The system uses **ticker-centric discovery**, meaning:
- RSS feeds are checked per **unique ticker**, not per user
- Multiple users tracking the same ticker share one RSS check

**Database Schema** ([prisma/schema.prisma:45-56](prisma/schema.prisma#L45-L56)):
```prisma
model Ticker {
  @@unique([userId, symbol])  // Users can't duplicate tickers
}

model TickerMonitoring {
  cik String @unique  // One monitoring record per company
  subscriberCount Int  // Tracks how many users track this
}
```

#### Ticker Growth Projections

| Users | Avg Tickers/User | Total Ticker Entries | **Unique Tickers** |
|-------|------------------|---------------------|-------------------|
| 2 | 7 | 14 | 8 |
| 100 | 10 | 1,000 | ~200 |
| 1,000 | 12 | 12,000 | ~400 |
| 10,000 | 15 | 150,000 | ~800 |
| **100,000** | 15 | 1,500,000 | **~1,500** |

**Reality check**: There are only ~8,000 publicly traded companies in the US. At 100K users, you'd expect overlap on popular tickers (AAPL, TSLA, NVDA, etc.).

#### Discovery Phase Timing at Scale

**Current formula** (sequential with batches of 3):
```
Time = (unique_tickers / batch_size) × (batch_time + delay)
     = (unique_tickers / 3) × (3s + 1s)
     = unique_tickers × 1.33s
```

| Unique Tickers | Current (batch=3) | Improved (batch=5) | Parallel (10 workers) |
|----------------|-------------------|--------------------|-----------------------|
| 8 | ~11s | ~6s | ~1s |
| 200 | ~4.4min | ~2.7min | ~27s |
| 800 | ~17.8min | ~10.7min | ~1.8min |
| **1,500** | **~33min** | **~20min** | **~3.4min** |

**Bottleneck at scale**: Sequential discovery becomes the critical path.

---

### 3. Database Query Scalability

#### N+1 Query Patterns Identified

**Location 1**: CIK enrichment ([discovery-handler.ts:98-114](lib/cron/handlers/discovery-handler.ts#L98-L114))
```typescript
// CURRENT: N+1 pattern - 2 queries per ticker
const tickersWithCik = await Promise.all(
  tickerSymbols.map(async (symbol) => {
    await prisma.cikMapping.findFirst({ where: { ticker: symbol } });
    await prisma.ticker.findFirst({ where: { symbol } });
  })
);
```

| Scale | CIK Lookups | Company Name Lookups | Total Queries |
|-------|-------------|---------------------|---------------|
| 8 tickers | 8 | 8 | 16 |
| 200 tickers | 200 | 200 | 400 |
| 1,500 tickers | 1,500 | 1,500 | **3,000** |

**Location 2**: User lookup per filing ([discovery-handler.ts:136-151](lib/cron/handlers/discovery-handler.ts#L136-L151))
```typescript
// CURRENT: 1 query per discovered filing
const usersForTicker = await prisma.user.findMany({
  where: { tickers: { some: { symbol: filing.ticker } } }
});
```

| Filings/Day | Queries |
|-------------|---------|
| 50 | 50 |
| 500 | 500 |

**Location 3**: Sequential job creation ([discovery-handler.ts:177](lib/cron/handlers/discovery-handler.ts#L177))
```typescript
// CURRENT: 2 queries per job (idempotency check + insert)
for (const user of usersForTicker) {
  await JobQueueService.addJob({ ... });  // 2 queries each
}
```

| Jobs Created | Queries |
|--------------|---------|
| 30 | 60 |
| 1,000 | 2,000 |
| 10,000 | **20,000** |

#### Total Query Load at 100K Users

Assuming 1,500 unique tickers, 500 filings/day, average 10 users per filing:

| Operation | Current Queries | Optimized (Bulk) |
|-----------|-----------------|------------------|
| CIK enrichment | 3,000 | 2 (bulk) |
| User lookups | 500 | 500 (or cached) |
| Job creation | 10,000 | 500 (bulk per filing) |
| **Total** | **13,500** | **~1,000** |

---

### 4. Optimal Architecture for 100K Users

#### What Stays (Current Architecture is Correct)

1. **Ticker-centric discovery** - Check RSS per unique ticker, not per user
2. **3-phase pipeline** - Discovery → Fetch → Summarize
3. **TickerMonitoring deduplication** - One record per CIK
4. **Optimistic locking** - `version` field for concurrency
5. **Job queue separation** - ASYNC_FETCH_FILING jobs per user

#### What Changes (Additive Improvements)

**Change 1: Increase MAX_CONCURRENT_RSS_CHECKS**
```typescript
// lib/cron/types.ts
export const MAX_CONCURRENT_RSS_CHECKS = 5; // Was 3
```
Impact: 66% throughput improvement, still safe with SEC limits.

**Change 2: Bulk CIK enrichment**
```typescript
// Replace N+1 pattern with bulk query
const cikMappings = await prisma.cikMapping.findMany({
  where: { ticker: { in: tickerSymbols } }
});
const cikMap = new Map(cikMappings.map(c => [c.ticker, c]));
```
Impact: 3,000 queries → 1 query.

**Change 3: Bulk job creation**
```typescript
// Replace sequential inserts with createMany
const jobs = usersForFiling.map(user => ({
  jobType: 'ASYNC_FETCH_FILING',
  payload: { ... },
  status: 'PENDING'
}));
await prisma.jobQueue.createMany({ data: jobs });
```
Impact: 10,000 queries → 500 queries.

**Change 4: RSS response caching**
```typescript
// Add 30-60 second cache for RSS responses
const cacheKey = `rss:${cik}`;
const cached = await cache.get(cacheKey);
if (cached && Date.now() - cached.timestamp < 60000) {
  return cached.data;
}
const response = await fetchSecRss(cik);
await cache.set(cacheKey, { data: response, timestamp: Date.now() });
```
Impact: If multiple processes run concurrently, avoids duplicate SEC requests.

**Change 5: Connection pooling**
```typescript
// prisma/schema.prisma or DATABASE_URL
// Add ?connection_limit=25&pool_timeout=30
```
Impact: Handles concurrent query load without connection exhaustion.

#### What Could Be Deleted (Optional Cleanup)

These are not blocking scalability but could be cleaned up:

1. **Unused `MAX_CONCURRENT_RSS_CHECKS` in disabled route** ([app/api/cron/monitor-sec-filings/route.ts.disabled:9](app/api/cron/monitor-sec-filings/route.ts.disabled#L9)) - Local redefinition of constant

2. **Legacy sequential patterns** in fallback code paths - Any remaining user-centric (vs ticker-centric) discovery code

3. **Duplicate company name lookup** - The second `findFirst` for company name could merge with CIK lookup using a JOIN or bulk query

---

### 5. Scalability Bottleneck Summary

| Component | Current Limit | At 100K Users | Solution |
|-----------|---------------|---------------|----------|
| SEC API rate | 10 req/s | 10 req/s (fixed) | Accept constraint |
| MAX_CONCURRENT | 3 | 3 | Increase to 5 |
| Discovery time | 26s (8 tickers) | ~33min (1500 tickers) | Parallel workers |
| DB queries | ~150/run | ~13,500/run | Bulk queries |
| Job creation | Sequential | 10K+ inserts | `createMany` bulk |
| DB connections | Default pool | Exhaustion risk | Connection pooling |

---

### 6. Alternative Architecture: Event-Driven Discovery

For massive scale (1M+ users), consider event-driven architecture:

```
[SEC RSS Feeds] → [RSS Aggregator Service] → [Message Queue]
                                                    ↓
[Worker Pool] ← [Filing Events] ← [Event Router]
     ↓
[User Notification Service] ← [User-Ticker Index]
```

**Components**:
1. **RSS Aggregator**: Single service that monitors all SEC RSS feeds
2. **Message Queue**: Kafka/SQS for filing events
3. **User-Ticker Index**: Pre-computed mapping of users to tickers
4. **Worker Pool**: Stateless workers that process filing events

**Benefits**:
- Decoupled discovery from user processing
- Horizontal scaling of workers
- Real-time event streaming
- No N+1 queries (pre-computed index)

**Complexity**: Significantly higher - only justified at very large scale.

---

## Code References

- [lib/cron/types.ts:181](lib/cron/types.ts#L181) - `MAX_CONCURRENT_RSS_CHECKS = 3`
- [lib/cron/sec-filing-service.ts:182-193](lib/cron/sec-filing-service.ts#L182-L193) - Batch processing loop
- [lib/cron/handlers/discovery-handler.ts:70-75](lib/cron/handlers/discovery-handler.ts#L70-L75) - Unique ticker query
- [lib/cron/handlers/discovery-handler.ts:98-114](lib/cron/handlers/discovery-handler.ts#L98-L114) - N+1 CIK enrichment
- [lib/cron/handlers/discovery-handler.ts:136-151](lib/cron/handlers/discovery-handler.ts#L136-L151) - User lookup per filing
- [lib/cron/handlers/discovery-handler.ts:177](lib/cron/handlers/discovery-handler.ts#L177) - Sequential job creation
- [lib/sec-edgar/rss-parser.ts:285](lib/sec-edgar/rss-parser.ts#L285) - User-Agent header
- [lib/sec-edgar/client.ts:71-77](lib/sec-edgar/client.ts#L71-L77) - Bottleneck rate limiter

## Related Research

- [2025-12-18-step-1-5-discovery-timeout-scalability-analysis.md](2025-12-18-step-1-5-discovery-timeout-scalability-analysis.md) - Initial timeout analysis
- [2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md](2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md) - Pipeline architecture documentation
- [2025-12-04-overall-pipeline-flow.md](2025-12-04-overall-pipeline-flow.md) - End-to-end pipeline flow

## External Sources

- [SEC.gov - New Rate Control Limits](https://www.sec.gov/oit/announcement/new-rate-control-limits) - Official rate limit policy
- [SEC.gov - EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) - API documentation
- [SEC.gov - Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) - Fair use policy

## Open Questions

1. **What is the actual user-ticker distribution?** Current data shows 8 unique tickers for 2 users. Need more data points to validate sublinear growth assumption.

2. **Should RSS caching be in-memory or distributed?** For single-instance deployment, in-memory is simpler. For multi-instance, need Redis or similar.

3. **What is the target discovery latency?** Current ~26s is acceptable for 10-minute cron. At 100K users, what latency is acceptable?

4. **Is idempotency check needed for bulk job creation?** Current sequential pattern uses idempotency keys. Bulk creation would need different deduplication strategy.
