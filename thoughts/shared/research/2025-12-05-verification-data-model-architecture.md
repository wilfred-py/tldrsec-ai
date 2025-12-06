---
date: 2025-12-05T09:20:08+11:00
researcher: Claude
git_commit: 8b6666a462dfd4020e77a2d76a5d7974c1697662
branch: main
repository: tldrsec-ai
topic: "SEC Filing Pipeline Verification Data Model Architecture"
tags: [research, codebase, sec-filing, pipeline, verification, data-model, FilingContentCache, SecFetchAttempt, SecFiling]
status: complete
last_updated: 2025-12-05
last_updated_by: Claude
---

# Research: SEC Filing Pipeline Verification Data Model Architecture

**Date**: 2025-12-05T09:20:08+11:00
**Researcher**: Claude
**Git Commit**: 8b6666a462dfd4020e77a2d76a5d7974c1697662
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Document the current architecture of the SEC filing pipeline verification system, specifically the data models used for tracking fetch status and how the verification script interacts with them.

## Summary

The SEC filing pipeline uses a 4-phase architecture (Discovery → Fetch → Summarize → Email) with two different data model patterns for tracking fetch status:

1. **Verification Script Pattern**: The daily verification script at [scripts/verify-daily-pipeline.ts](scripts/verify-daily-pipeline.ts) queries `SecFiling` and `SecFetchAttempt` tables to determine fetch success/failure.

2. **Fetch Handler Pattern**: The actual fetch handler at [lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts) stores fetch results in the `FilingContentCache` table.

These two patterns check different tables, creating a data model mismatch where the verification script cannot see the actual fetch results.

## Detailed Findings

### Verification Script Architecture

**Location**: [scripts/verify-daily-pipeline.ts](scripts/verify-daily-pipeline.ts)

The verification script executes a 4-phase validation for each discovered filing:

#### Phase 1: Discovery Verification (Lines 117-151)
- Queries `RssFilingCheck` table for filings discovered in date range
- Uses `createdAt` field to filter by date
- Includes `tickerMonitoring` relation for company details

#### Phase 2: Fetch Verification (Lines 154-190)
The `checkFetchStatus` function queries:

**Database Tables Queried**:
- `SecFiling` - Primary query via `prisma.secFiling.findFirst()`
- `SecFetchAttempt` - Included via `fetchAttempts` relation

**Query Pattern**:
```typescript
const secFiling = await prisma.secFiling.findFirst({
  where: { accessionNumber: accessionNumber },
  include: {
    fetchAttempts: {
      orderBy: { attemptedAt: 'desc' },
      take: 1,
    },
  },
});
```

**Success Determination Logic**:
- No `SecFiling` record → `{ fetched: false, error: 'SecFiling record not found' }`
- No `fetchAttempts` → `{ fetched: false, error: 'No fetch attempts recorded' }`
- `latestAttempt.status === 'success'` → `{ fetched: true }`
- Other status → `{ fetched: false, error: errorMessage || status }`

#### Phase 3: Summarization Verification (Lines 192-252)
- Queries `Summary` table by `secFiling.accessionNumber` relation
- Fallback search by `filingUrl` containing accession number
- Validates `processingStatus !== 'failed'` and `summaryText` is non-empty

#### Phase 4: Email Verification (Lines 254-281)
- Queries `SummaryEmailDelivery` table by `summaryId`
- Checks for `deliveryStatus === 'sent' OR 'delivered'`

### Fetch Handler Architecture

**Location**: [lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts)

The fetch handler uses an entirely different data model for storing results:

#### Database Table Used: FilingContentCache
**Schema**: [prisma/schema.prisma:226-243](prisma/schema.prisma#L226-L243)

```prisma
model FilingContentCache {
  id              String   @id @default(cuid())
  accessionNumber String   @unique
  cik             String
  formType        String
  content         String   @db.Text
  contentLength   Int
  contentHash     String
  fetchedAt       DateTime @default(now())
  expiresAt       DateTime
  fetchDuration   Int
  fetchError      String?
  status          String   @default("CACHED")
}
```

#### Success Case Storage (Lines 250-273)
```typescript
await prisma.filingContentCache.upsert({
  where: { accessionNumber: filing.accessionNumber },
  create: {
    accessionNumber: filing.accessionNumber,
    cik: ticker.cik || '',
    formType: filing.formType,
    content,
    contentLength: content.length,
    contentHash,
    expiresAt,           // 24 hours TTL
    fetchDuration,
    status: 'CACHED'     // SUCCESS STATUS
  },
  update: { ... }
});
```

#### Error Case Storage (Lines 212-232)
```typescript
await prisma.filingContentCache.upsert({
  where: { accessionNumber: filing.accessionNumber },
  create: {
    accessionNumber: filing.accessionNumber,
    content: '',
    contentLength: 0,
    contentHash: '',
    expiresAt,           // 1 hour TTL for errors
    fetchDuration,
    fetchError,          // ERROR MESSAGE
    status: 'ERROR'      // ERROR STATUS
  },
  update: { ... }
});
```

### Data Model Comparison

| Aspect | Verification Script | Fetch Handler |
|--------|---------------------|---------------|
| **Table Queried** | `SecFiling` + `SecFetchAttempt` | `FilingContentCache` |
| **Primary Key** | UUID in `SecFiling.id` | CUID in `FilingContentCache.id` |
| **Lookup Field** | `SecFiling.accessionNumber` | `FilingContentCache.accessionNumber` (unique) |
| **Success Status** | `SecFetchAttempt.status === 'success'` | `FilingContentCache.status === 'CACHED'` |
| **Error Status** | `SecFetchAttempt.status !== 'success'` | `FilingContentCache.status === 'ERROR'` |
| **Error Storage** | `SecFetchAttempt.errorMessage` | `FilingContentCache.fetchError` |
| **Timing Data** | `SecFetchAttempt.attemptedAt` | `FilingContentCache.fetchedAt` + `fetchDuration` |

### SecFiling and SecFetchAttempt Models

**SecFiling Schema**: [prisma/schema.prisma:200-217](prisma/schema.prisma#L200-L217)
```prisma
model SecFiling {
  id              String            @id @default(uuid())
  tickerId        String
  formType        String
  filingDate      DateTime
  secUrl          String
  accessionNumber String
  companyName     String?
  cik             String
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  fetchAttempts   SecFetchAttempt[]
  ticker          Ticker            @relation(...)
  summaries       Summary[]
}
```

**SecFetchAttempt Schema**: [prisma/schema.prisma:245-254](prisma/schema.prisma#L245-L254)
```prisma
model SecFetchAttempt {
  id           String    @id @default(uuid())
  filingId     String
  attemptedAt  DateTime
  errorMessage String?
  status       String
  filing       SecFiling @relation(...)
}
```

### Data Flow Diagram

```
Discovery Phase (RssFilingCheck)
        │
        ▼
    ASYNC_FETCH job queued
        │
        ▼
Fetch Handler (fetch-handler.ts)
        │
        ├─── Cache Check ──► FilingContentCache.findUnique()
        │                          │
        │                    ┌─────┴─────┐
        │                    │           │
        │                 Cache Hit   Cache Miss
        │                    │           │
        │                    │           ▼
        │                    │    Fetch from SEC
        │                    │           │
        │                    ▼           ▼
        │              FilingContentCache.upsert()
        │              (status: 'CACHED' or 'ERROR')
        │
        ▼
    ASYNC_SUMMARIZE_CACHED job queued
```

**Verification Script Query Path (DOES NOT FOLLOW FETCH HANDLER)**:
```
Verification Script (verify-daily-pipeline.ts)
        │
        ▼
    checkFetchStatus(accessionNumber)
        │
        ▼
    SecFiling.findFirst() with fetchAttempts include
        │
        ├─── No SecFiling found → "SecFiling record not found"
        │
        ├─── No fetchAttempts → "No fetch attempts recorded"
        │
        └─── Check latestAttempt.status
                    │
             ┌──────┴──────┐
             │             │
         'success'    Other status
             │             │
             ▼             ▼
        fetched: true   fetched: false
```

### Cache TTL Strategy

| Scenario | TTL Duration | Code Location |
|----------|--------------|---------------|
| Successful fetch | 24 hours | [fetch-handler.ts:248](lib/cron/handlers/fetch-handler.ts#L248) |
| Failed fetch | 1 hour | [fetch-handler.ts:221](lib/cron/handlers/fetch-handler.ts#L221) |

### Relationship Mapping

**No Direct Prisma Relations Between**:
- `FilingContentCache` ↔ `SecFiling` (associated via `accessionNumber` string)
- `FilingContentCache` ↔ `SecFetchAttempt` (no association)

**Existing Relations**:
- `SecFiling` → `SecFetchAttempt` (one-to-many via `fetchAttempts`)
- `SecFiling` → `Summary` (one-to-many via `summaries`)
- `SecFiling` → `Ticker` (many-to-one via `ticker`)

## Code References

- [scripts/verify-daily-pipeline.ts:154-190](scripts/verify-daily-pipeline.ts#L154-L190) - `checkFetchStatus` function querying SecFiling/SecFetchAttempt
- [lib/cron/handlers/fetch-handler.ts:95-140](lib/cron/handlers/fetch-handler.ts#L95-L140) - Cache hit check in FilingContentCache
- [lib/cron/handlers/fetch-handler.ts:250-273](lib/cron/handlers/fetch-handler.ts#L250-L273) - Successful fetch storage in FilingContentCache
- [lib/cron/handlers/fetch-handler.ts:212-232](lib/cron/handlers/fetch-handler.ts#L212-L232) - Error storage in FilingContentCache
- [prisma/schema.prisma:200-217](prisma/schema.prisma#L200-L217) - SecFiling model definition
- [prisma/schema.prisma:226-243](prisma/schema.prisma#L226-L243) - FilingContentCache model definition
- [prisma/schema.prisma:245-254](prisma/schema.prisma#L245-L254) - SecFetchAttempt model definition

## Architecture Documentation

### Current Pipeline Data Flow

1. **Discovery Phase**: RSS monitoring creates `RssFilingCheck` records
2. **Fetch Phase**: Content stored in `FilingContentCache` with status `'CACHED'` or `'ERROR'`
3. **Summarize Phase**: AI summary stored in `Summary` table
4. **Email Phase**: Delivery tracked in `SummaryEmailDelivery` table

### Verification Script Data Flow

1. **Discovery**: Queries `RssFilingCheck` for date range
2. **Fetch**: Queries `SecFiling` → `SecFetchAttempt` (mismatch with actual storage)
3. **Summarize**: Queries `Summary` table
4. **Email**: Queries `SummaryEmailDelivery` table

### Key Design Patterns

**FilingContentCache Pattern**:
- Upsert operations for idempotency
- Natural key via `accessionNumber` (unique constraint)
- TTL-based expiration via `expiresAt` field
- Status-based state machine (`CACHED`/`ERROR`)

**SecFiling/SecFetchAttempt Pattern**:
- One-to-many relationship for multiple attempts
- Cascade delete for cleanup
- Status string field for attempt tracking

## Historical Context (from thoughts/)

- [thoughts/shared/research/2025-12-04-overall-pipeline-flow.md](thoughts/shared/research/2025-12-04-overall-pipeline-flow.md) - Documents the complete pipeline architecture and identifies the data model mismatch as root cause of false failure reports
- [docs/plans/2025-12-04-fix-verification-data-model-mismatch.md](docs/plans/2025-12-04-fix-verification-data-model-mismatch.md) - Implementation plan to fix the verification script

## Related Research

- [thoughts/shared/research/2025-12-04-overall-pipeline-flow.md](thoughts/shared/research/2025-12-04-overall-pipeline-flow.md) - Overall SEC filing pipeline flow documentation
- [thoughts/shared/research/2025-12-03-morning-pipeline-verification.md](thoughts/shared/research/2025-12-03-morning-pipeline-verification.md) - Morning pipeline verification results
- [thoughts/shared/research/2025-11-21-e2e-summarization-pipeline-deep-dive.md](thoughts/shared/research/2025-11-21-e2e-summarization-pipeline-deep-dive.md) - E2E pipeline architecture deep dive

## Open Questions

None - the architecture is fully documented. The data model mismatch is clearly identified and an implementation plan exists at [docs/plans/2025-12-04-fix-verification-data-model-mismatch.md](docs/plans/2025-12-04-fix-verification-data-model-mismatch.md).
