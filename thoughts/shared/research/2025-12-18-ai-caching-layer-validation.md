---
date: 2025-12-18T20:43:34+11:00
researcher: Claude
git_commit: 11008ed75493a263e4b5c37dce16a484bffa1e34
branch: main
repository: tldrsec-ai
topic: "AI Caching Layer Validation - Database Write Operations Analysis"
tags: [research, codebase, caching, ai-summaries, database, duplicate-prevention]
status: complete
last_updated: 2025-12-18
last_updated_by: Claude
---

# Research: AI Caching Layer Validation - Database Write Operations Analysis

**Date**: 2025-12-18T20:43:34+11:00
**Researcher**: Claude
**Git Commit**: 11008ed75493a263e4b5c37dce16a484bffa1e34
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Validate the AI caching layer across the user base to ensure there are no redundant write operations to the database.

## Summary

The codebase implements a **multi-tier caching architecture** with three distinct caching systems that serve different purposes. The current implementation has **one known source of redundant writes** related to the per-user summary architecture, but the recent duplicate summary fix has addressed the most critical duplication issue.

### Key Findings

1. **Duplicate Prevention Fix Applied**: The `@@unique([tickerId, filingUrl])` constraint and `upsert` pattern in `filing-processor.ts:1335` prevents true duplicates (same user, same filing).

2. **Per-User Architecture Creates Expected "Duplicates"**: The current data model intentionally creates one Summary per user per filing. If 10 users track TSLA, 10 Summary records exist for the same 10-K filing.

3. **AI Cost Deduplication Works**: The `checkIfFilingProcessed()` function and cache checks prevent redundant AI API calls. Once one user's summary is generated, other users reuse it via cache hit.

4. **9 Distinct CREATE Paths Exist**: Multiple services can create Summary records, all protected by the unique constraint but with varying levels of pre-check logic.

## Detailed Findings

### Cache Architecture Overview

The system uses three caching tiers:

| Cache Layer | Location | Scope | Key | Purpose |
|-------------|----------|-------|-----|---------|
| In-Memory | `lib/ai/cache/summary-cache.ts` | Global | `formType:cik:accessionNumber` | Active request deduplication |
| Enhanced Cache | `services/filings/enhanced/enhancedCache.ts` | Global | `filingUrl` | Database-backed summary lookup |
| Database | `prisma/schema.prisma` Summary table | Per-User | `tickerId + filingUrl` | Persistent storage |

### Cache Check Flow in Filing Processor

The filing processor (`lib/cron/filing-processor.ts`) implements a **defense-in-depth** approach:

```
1. Pre-Transaction Check (lines 433-451)
   └── checkIfFilingProcessed() checks RssFilingCheck.processed + Summary table

2. In-Transaction Cache Lookup (lines 985-996)
   └── tx.summary.findFirst() by ticker.symbol + filingType + filingDate

3. Database Upsert (lines 1335-1427)
   └── tx.summary.upsert() with tickerId_filingUrl unique key
```

### AI Call Deduplication

AI calls ARE deduplicated across users. The cache check at `filing-processor.ts:985-996` queries by:

```typescript
existingSummary = await tx.summary.findFirst({
  where: {
    ticker: { symbol: filingForProcessing.tickerData.symbol },
    filingType: filingForProcessing.formType,
    filingDate: filingForProcessing.filingDate,
    forceRefreshFlag: { not: true }
  }
});
```

This query finds ANY summary for the ticker symbol (regardless of which user's ticker), enabling AI result sharing.

### Summary Write Paths

9 distinct locations create Summary records:

| Location | Pattern | Duplicate Prevention |
|----------|---------|---------------------|
| `filing-processor.ts:1335` | `upsert` | tickerId_filingUrl unique + upsert |
| `summarize-cached-handler.ts:249` | `create` | Relies on unique constraint |
| `summarize-cached-handler.ts:401` | `create` | Relies on unique constraint |
| `filingDatabase.ts:134` | `create` | Relies on unique constraint |
| `enhancedCache.ts:228` | `create` | Pre-check + unique constraint |
| `filing-storage.ts:110` | `create` (loop) | Relies on unique constraint |
| `optimizedFilingService.ts:645` | `create` | Relies on unique constraint |
| `async-filing-processor.ts:184` | `create` | No explicit prevention |
| `lib/db.ts:79` | `create` | Relies on unique constraint |

### Per-User Summary Architecture

The current architecture creates one Summary per user:

```
User A tracks COIN → Ticker(userId=A, symbol=COIN) → Summary(tickerId=A's ticker)
User B tracks COIN → Ticker(userId=B, symbol=COIN) → Summary(tickerId=B's ticker)
```

**Implications for 100 users tracking TSLA:**
- 100 Ticker records (one per user)
- 100 Summary records per filing (one per user's ticker)
- 1 AI API call (cached for subsequent users)
- 100 SummaryCacheAccess records (one per email delivery)

### SummaryCacheAccess Tracking

The `SummaryCacheAccess` table tracks when cached summaries are reused:

```prisma
model SummaryCacheAccess {
  id         String   @id
  summaryId  String   // Which summary was accessed
  userId     String   // Which user accessed it
  accessedAt DateTime // When
  accessType String   // "EMAIL", "database_query", "database_cache_hit"
}
```

Created at `filing-processor.ts:1104-1111` when a cache hit occurs:

```typescript
await tx.summaryCacheAccess.create({
  data: {
    summaryId: existingSummary.id,
    userId: user.id,
    accessedAt: new Date(),
    accessType: 'EMAIL'
  }
});
```

### Redundancy Analysis

| Scenario | Is Redundant? | Current Behavior |
|----------|---------------|------------------|
| Same user, same filing, multiple cron runs | No | Upsert updates existing record |
| Different users, same filing | By Design | Creates per-user Summary, shares AI result |
| Concurrent requests for same filing | No | Database constraint prevents duplicates |
| Cache invalidation + regeneration | No | forceRefreshFlag controls this |

### Cost Tracking

AI costs are tracked per-summary:
- `Summary.cost` - AI processing cost
- `Summary.tokensUsed` - Total tokens
- `Summary.inputTokens` / `outputTokens` - Token breakdown
- Cache hits set `cost: 0`, `tokensUsed: 0`

## Code References

- [prisma/schema.prisma:110](prisma/schema.prisma#L110) - `@@unique([tickerId, filingUrl])` constraint
- [lib/cron/filing-processor.ts:1335](lib/cron/filing-processor.ts#L1335) - Upsert pattern for duplicate prevention
- [lib/cron/filing-processor.ts:985-996](lib/cron/filing-processor.ts#L985-L996) - Cache check query
- [lib/cron/filing-processor.ts:1104-1111](lib/cron/filing-processor.ts#L1104-L1111) - SummaryCacheAccess creation
- [lib/ai/cache/summary-cache.ts:67-81](lib/ai/cache/summary-cache.ts#L67-L81) - Global cache lookup
- [services/filings/utils/filingProcessingStatus.ts:15-93](services/filings/utils/filingProcessingStatus.ts#L15-L93) - checkIfFilingProcessed function
- [services/filings/enhanced/enhancedCache.ts:178-186](services/filings/enhanced/enhancedCache.ts#L178-L186) - Idempotency check

## Architecture Documentation

### Database Constraints

```prisma
model Summary {
  @@unique([tickerId, filingUrl])  // Prevents duplicates per-user
  @@index([filingUrl])             // Fast lookup by filing
}

model Ticker {
  @@unique([userId, symbol])       // One ticker per user per symbol
}
```

### Cache Key Structures

**In-Memory Cache (`SummaryCacheKey`)**:
```typescript
{
  formType: string,      // "10-K", "10-Q", etc.
  cik: string,           // Company CIK
  accessionNumber: string // SEC accession number
}
```

**Enhanced Cache**: Uses `filingUrl` string directly

**Database Cache**: Uses `tickerId + filingUrl` composite key

### Write Operation Patterns

```
CREATE Operations:
- 8 services use prisma.summary.create()
- 1 service uses tx.summary.upsert() (filing-processor.ts)

UPDATE Operations:
- Cache analytics (cacheUsageCount, lastCacheUsed)
- Email delivery tracking (sentToUser, totalEmailsSent)
- Cache invalidation (forceRefreshFlag)

All CREATE operations are protected by @@unique constraint
```

## Historical Context (from thoughts/)

- `thoughts/shared/research/2025-12-18-duplicate-summaries-analysis.md` - Documents the duplicate summary fix applied:
  - Added `@@unique([tickerId, filingUrl])` constraint
  - Changed `create()` to `upsert()` in filing-processor.ts
  - Cleaned up 23 duplicate records (91 → 68 summaries)
  - Identified per-user architecture as an architectural consideration

## Related Research

- [2025-12-18-duplicate-summaries-analysis.md](thoughts/shared/research/2025-12-18-duplicate-summaries-analysis.md) - Duplicate summary analysis and fix

## Open Questions

1. **Enhanced Cache Test User**: The `enhancedCache.ts` creates summaries under `test@tldrsec.com` user. Is this intentional for a global cache layer or a testing artifact?

2. **Async Filing Processor**: The `async-filing-processor.ts:184` create call has no explicit duplicate prevention. Is this path still active?

3. **Cost Aggregation**: With per-user summaries, are costs being correctly attributed to the first AI call or spread across user records?

4. **Schema Migration**: The thoughts document mentions a potential schema refactor to canonical summaries with user delivery tracking. Is this planned?
