# Summary Architecture Optimization Implementation Plan

**Date**: 2025-12-19T05:15:00+11:00
**Git Commit**: 11008ed75493a263e4b5c37dce16a484bffa1e34
**Branch**: main
**Repository**: tldrsec-ai

## Overview

This plan addresses three goals identified from the AI caching layer validation research:
1. **Defensive Hardening**: Fix race conditions and standardize all CREATE paths to use upsert
2. **Schema Optimization**: Migrate from per-user Summaries to canonical Summaries (reduce N records to 1)
3. **Code Cleanup**: Delete unused/disabled code paths and test artifacts

## Current State Analysis

### Summary Architecture Problem

**Current behavior (N users tracking TSLA, new 10-K published):**
```
User A tracks TSLA → Ticker(userId=A) → Summary(tickerId=A's ticker) [AI call: $0.15]
User B tracks TSLA → Ticker(userId=B) → Summary(tickerId=B's ticker) [cache hit: $0]
User C tracks TSLA → Ticker(userId=C) → Summary(tickerId=C's ticker) [cache hit: $0]
```
- 3 Ticker records
- 3 Summary records (one per user)
- 1 AI call (cost correctly attributed)
- Problem: Unnecessary database bloat, complex queries

**Desired behavior:**
```
TSLA 10-K filing → CanonicalSummary(filingUrl=unique, summaryText=...) [AI call: $0.15]
User A, B, C → UserSummaryDelivery records (userId, summaryId, sentAt)
```
- 1 Summary record per filing (canonical)
- N delivery tracking records
- Simpler data model, better scalability

### Files to Delete (Unused/Disabled Code)

| File | Status | Reason for Deletion |
|------|--------|---------------------|
| `app/api/cron/process-jobs/route.ts.disabled` | Disabled | Async job processing disabled |
| `lib/job-queue/async-filing-processor.ts` | Broken | Uses incorrect schema (`filingId`, `userId` instead of `tickerId`) |
| `lib/job-queue/worker.ts` | Unused | Only caller of async-filing-processor |
| `services/filings/enhanced/enhancedCache.ts` | Testing artifact | Creates `test@tldrsec.com` user |
| `app/api/test-subscription-aware-filing/route.ts.disabled` | Disabled | Test endpoint |

### Race Condition Issues

| Location | Pattern | Issue |
|----------|---------|-------|
| `summarize-cached-handler.ts:249` | `findFirst` → `create` | Race between check and create |
| `summarize-cached-handler.ts:401` | `findFirst` → `create` | Race between check and create |

### Key Discoveries

- [lib/cron/filing-processor.ts:1335](lib/cron/filing-processor.ts#L1335) - Only path using `upsert` (correct pattern)
- [lib/cron/filing-processor.ts:985-996](lib/cron/filing-processor.ts#L985-L996) - Cross-user cache check (finds ANY summary for ticker symbol)
- [prisma/schema.prisma:110](prisma/schema.prisma#L110) - `@@unique([tickerId, filingUrl])` constraint (per-user)
- `enhancedCache.ts` uses `test@tldrsec.com` - testing artifact creating pollution

## Desired End State

After implementation:

1. **One Summary per filing** (canonical architecture)
   - Summary table keyed by `filingUrl` (unique)
   - No `tickerId` foreign key on Summary
   - SummaryEmailDelivery tracks per-user delivery

2. **Zero race conditions**
   - All Summary creation uses `upsert` pattern
   - Database constraint as final defense

3. **Clean codebase**
   - No disabled/broken async job infrastructure
   - No test user pollution
   - Fewer code paths to maintain

### Verification

```sql
-- After migration, verify:
-- 1. Each unique filingUrl has exactly 1 Summary
SELECT filingUrl, COUNT(*) as count
FROM "Summary"
GROUP BY filingUrl
HAVING COUNT(*) > 1;  -- Should return 0 rows

-- 2. Delivery records exist for each user
SELECT COUNT(*) FROM "SummaryEmailDelivery";  -- Should match previous delivery count

-- 3. No test user summaries
SELECT COUNT(*) FROM "Summary" s
JOIN "Ticker" t ON s."tickerId" = t.id
JOIN "User" u ON t."userId" = u.id
WHERE u.email = 'test@tldrsec.com';  -- Should return 0
```

## What We're NOT Doing

1. **NOT changing the Ticker model** - Tickers remain per-user (users manage their own watchlists)
2. **NOT removing SummaryCacheAccess** - Keep for analytics (may need adjustment later)
3. **NOT changing AI summarization logic** - Only the storage layer changes
4. **NOT migrating historical cost data** - Original costs stay on canonical summary

## Implementation Approach

This is a significant schema change requiring careful migration. All phases will be executed **sequentially in one implementation session** since the MVP hasn't launched yet - no need for gradual rollout or deprecation periods.

**Execution Strategy**: All phases sequential, direct migration (no dual-write needed)

1. **Phase 1**: Delete unused code (immediate cleanup)
2. **Phase 2**: Fix race conditions in active code (defensive hardening)
3. **Phase 3**: Add new canonical schema alongside existing (additive)
4. **Phase 4**: Migrate data and switch code paths (direct migration)
5. **Phase 5**: Remove old schema (immediate cleanup)

### Key Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Phase timing | All at once, sequentially | MVP not launched - no users to disrupt |
| Migration strategy | Direct migration | No need for dual-write or maintenance window |
| Ticker model | Keep per-user | Users manage their own watchlists independently |

---

## Phase 1: Delete Unused Code

### Overview
Remove disabled/broken code paths to reduce maintenance burden and eliminate confusion.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cleanup/unused-code-removal.test.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Unused Code Removal Verification', () => {
  const rootDir = path.join(__dirname, '../../..');

  it('should NOT have async-filing-processor.ts', () => {
    const filePath = path.join(rootDir, 'lib/job-queue/async-filing-processor.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should NOT have worker.ts in job-queue', () => {
    const filePath = path.join(rootDir, 'lib/job-queue/worker.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should NOT have process-jobs route (disabled or otherwise)', () => {
    const filePath = path.join(rootDir, 'app/api/cron/process-jobs');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should NOT have enhancedCache.ts', () => {
    const filePath = path.join(rootDir, 'services/filings/enhanced/enhancedCache.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should NOT have test-subscription-aware-filing route', () => {
    const filePath = path.join(rootDir, 'app/api/test-subscription-aware-filing');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should NOT have test@tldrsec.com user in database', async () => {
    const { getPrismaClient } = await import('../../../lib/db/prisma');
    const prisma = getPrismaClient();
    const testUser = await prisma.user.findFirst({
      where: { email: 'test@tldrsec.com' }
    });
    expect(testUser).toBeNull();
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="unused-code-removal"
# Expected: 6 failing tests (files still exist)
```

### Step 1.2: 🟢 Delete Files and Clean Up

#### 1.2.1 Delete async job infrastructure
```bash
rm -rf lib/job-queue/async-filing-processor.ts
rm -rf lib/job-queue/worker.ts
rm -rf app/api/cron/process-jobs/
```

**Checkpoint 1.2.1**: Verify files deleted:
```bash
ls lib/job-queue/  # Should NOT contain async-filing-processor.ts or worker.ts
ls app/api/cron/   # Should NOT contain process-jobs/
```

#### 1.2.2 Delete enhancedCache.ts and update exports

**File**: `services/filings/enhanced/enhancedCache.ts`
```bash
rm -rf services/filings/enhanced/enhancedCache.ts
```

**File**: `services/filings/enhanced/index.ts`
Remove exports for enhancedCache:
```typescript
// DELETE these lines:
// export {
//   checkEnhancedCache,
//   saveToEnhancedCache,
//   getEnhancedCacheStats,
//   cleanupEnhancedCache,
//   invalidateEnhancedCache,
//   type CacheEntry,
//   type CacheStats
// } from './enhancedCache';
```

**File**: `services/filings/enhanced/enhancedFilingSummaryService.ts`
Update imports to remove enhancedCache dependency (use direct Prisma queries if needed).

**Checkpoint 1.2.2**: Build passes:
```bash
npm run build
# Expected: No import errors for deleted files
```

#### 1.2.3 Delete disabled test routes
```bash
rm -rf app/api/test-subscription-aware-filing/
```

#### 1.2.4 Clean up test user from database

**Script**: `scripts/cleanup-test-user.ts`
```typescript
import { getPrismaClient } from '../lib/db/prisma';

async function cleanupTestUser() {
  const prisma = getPrismaClient();

  // Delete test user and cascade to tickers/summaries
  const result = await prisma.user.deleteMany({
    where: { email: 'test@tldrsec.com' }
  });

  console.log(`Deleted ${result.count} test user(s)`);
}

cleanupTestUser().catch(console.error);
```

Run: `npx tsx scripts/cleanup-test-user.ts`

**Checkpoint 1.2.4**: All phase 1 tests pass:
```bash
npm run test -- --testPathPattern="unused-code-removal"
# Expected: 6 passing
```

### Step 1.3: 🔵 Refactor

- [ ] Update any remaining imports that reference deleted files
- [ ] Remove any dead code paths that called deleted functions
- [ ] Update documentation/README files if they reference deleted code

**Checkpoint 1.3**: Full test suite passes:
```bash
npm run test
npm run build
npm run lint
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="unused-code-removal"`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Cron job still runs successfully (main pipeline unaffected)
- [ ] No errors in Vercel logs related to missing imports

**Proceed immediately to Phase 2** (MVP not launched - no need for manual pause).

---

## Phase 2: Fix Race Conditions

### Overview
Convert remaining `create()` calls to `upsert()` pattern to prevent race conditions.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/cron/handlers/summarize-cached-handler.test.ts`

```typescript
import { jest } from '@jest/globals';

describe('Summarize Cached Handler - Race Condition Prevention', () => {
  it('should use upsert pattern for shared summary creation', async () => {
    // This test verifies the code uses upsert, not create
    const handlerCode = await import('fs').then(fs =>
      fs.promises.readFile('lib/cron/handlers/summarize-cached-handler.ts', 'utf-8')
    );

    // Count create vs upsert calls for Summary
    const createCalls = (handlerCode.match(/\.summary\.create\(/g) || []).length;
    const upsertCalls = (handlerCode.match(/\.summary\.upsert\(/g) || []).length;

    expect(createCalls).toBe(0); // No raw creates
    expect(upsertCalls).toBeGreaterThan(0); // At least one upsert
  });

  it('should handle concurrent requests without duplicate creation', async () => {
    // Simulate concurrent processing
    const { processSummarizeCached } = await import('../../../../lib/cron/handlers/summarize-cached-handler');

    const testFiling = {
      filingUrl: 'https://sec.gov/test-concurrent',
      formType: '10-K',
      // ... other required fields
    };

    // Run two handlers concurrently
    const results = await Promise.allSettled([
      processSummarizeCached(testFiling, 'user-1'),
      processSummarizeCached(testFiling, 'user-2')
    ]);

    // Both should succeed (one creates, one gets cache hit or upsert succeeds)
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);

    // Verify only one summary exists for this filing
    const { getPrismaClient } = await import('../../../../lib/db/prisma');
    const prisma = getPrismaClient();
    const summaries = await prisma.summary.findMany({
      where: { filingUrl: testFiling.filingUrl }
    });

    // With canonical architecture, should be 1; with per-user, should be 2
    // This test documents current behavior and will need update in Phase 4
    expect(summaries.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Checkpoint 2.1**: Tests fail (current code uses create):
```bash
npm run test -- --testPathPattern="summarize-cached-handler"
# Expected: First test fails (create calls > 0)
```

### Step 2.2: 🟢 Convert create() to upsert()

#### 2.2.1 Update summarize-cached-handler.ts:249

**File**: `lib/cron/handlers/summarize-cached-handler.ts`

Find around line 249:
```typescript
// BEFORE:
const summary = await prisma.summary.create({
  data: {
    tickerId: userTicker.id,
    // ... other fields
  }
});

// AFTER:
const summary = await prisma.summary.upsert({
  where: {
    tickerId_filingUrl: {
      tickerId: userTicker.id,
      filingUrl: filing.filingUrl
    }
  },
  create: {
    tickerId: userTicker.id,
    // ... other fields
  },
  update: {
    // Update fields if already exists (cache refresh scenario)
    summaryText: sharedSummary.summaryText,
    summaryJSON: sharedSummary.summaryJSON,
    cacheUsageCount: { increment: 1 },
    lastCacheUsed: new Date()
  }
});
```

**Checkpoint 2.2.1**: Code compiles:
```bash
npm run build
```

#### 2.2.2 Update summarize-cached-handler.ts:401

Similar conversion for the second create call.

**Checkpoint 2.2.2**: All handler tests pass:
```bash
npm run test -- --testPathPattern="summarize-cached-handler"
# Expected: 2 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Extract common upsert logic into helper function
- [ ] Add logging for upsert vs create distinction
- [ ] Document the race condition prevention pattern

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Handler tests pass: `npm run test -- --testPathPattern="summarize-cached-handler"`
- [ ] Build succeeds: `npm run build`
- [ ] Pipeline tests pass: `npm run test:pipeline:comprehensive`
- [ ] E2E tests pass: `npm run test:e2e`

#### Manual Verification:
- [ ] Cron job processes filings correctly
- [ ] No duplicate summary errors in logs
- [ ] Cache hits working as expected

**Proceed immediately to Phase 3** (MVP not launched - no need for manual pause).

---

## Phase 3: Add Canonical Summary Schema

### Overview
Add new schema tables alongside existing ones to support canonical summaries.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/schema/canonical-summary.test.ts`

```typescript
import { getPrismaClient } from '../../lib/db/prisma';

describe('Canonical Summary Schema', () => {
  const prisma = getPrismaClient();

  it('should have CanonicalSummary table with filingUrl unique constraint', async () => {
    // This will fail until migration is applied
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'CanonicalSummary'
    `;
    expect(tables).toHaveLength(1);
  });

  it('should have SummaryDelivery table for user tracking', async () => {
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'SummaryDelivery'
    `;
    expect(tables).toHaveLength(1);
  });

  it('should enforce unique filingUrl on CanonicalSummary', async () => {
    const testUrl = 'https://sec.gov/test-unique-constraint';

    // Create first summary
    await prisma.canonicalSummary.create({
      data: {
        filingUrl: testUrl,
        filingType: '10-K',
        filingDate: new Date(),
        summaryText: 'Test summary',
        companySymbol: 'TEST',
        companyName: 'Test Company',
        cik: '0001234567'
      }
    });

    // Attempt duplicate should fail
    await expect(prisma.canonicalSummary.create({
      data: {
        filingUrl: testUrl,
        filingType: '10-K',
        filingDate: new Date(),
        summaryText: 'Duplicate summary',
        companySymbol: 'TEST',
        companyName: 'Test Company',
        cik: '0001234567'
      }
    })).rejects.toThrow();

    // Cleanup
    await prisma.canonicalSummary.deleteMany({ where: { filingUrl: testUrl } });
  });
});
```

**Checkpoint 3.1**: Tests fail (tables don't exist):
```bash
npm run test -- --testPathPattern="canonical-summary"
# Expected: 3 failing
```

### Step 3.2: 🟢 Create Migration

#### 3.2.1 Add new models to schema.prisma

**File**: `prisma/schema.prisma`

```prisma
// ============================================
// CANONICAL SUMMARY ARCHITECTURE (New)
// ============================================

/// Canonical summary - one per unique filing across all users
model CanonicalSummary {
  id                    String   @id @default(uuid())

  // Filing identification (unique per filing)
  filingUrl             String   @unique
  filingType            String   // 10-K, 10-Q, 8-K, etc.
  filingDate            DateTime

  // Company info (denormalized for query efficiency)
  companySymbol         String
  companyName           String
  cik                   String

  // Summary content
  summaryText           String
  summaryJSON           Json?

  // AI processing metadata
  model                 String?
  modelVersion          String?
  tokensUsed            Int?
  inputTokens           Int?
  outputTokens          Int?
  cost                  Float?
  totalCost             Float?
  processingTimeMs      Int?
  processingStatus      String   @default("COMPLETED")

  // Cache control
  forceRefreshFlag      Boolean  @default(false)
  invalidationReason    String?
  invalidatedBy         String?

  // Analytics
  cacheUsageCount       Int      @default(0)
  lastCacheUsed         DateTime?

  // Timestamps
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relationships
  deliveries            SummaryDelivery[]
  cacheAccesses         CanonicalSummaryCacheAccess[]

  // Indexes for common queries
  @@index([companySymbol, filingDate])
  @@index([filingType, filingDate])
  @@index([cik])
  @@index([createdAt])
}

/// Tracks which users have received which summaries
model SummaryDelivery {
  id                    String   @id @default(uuid())

  // Links
  canonicalSummaryId    String
  userId                String

  // Delivery tracking
  deliveredAt           DateTime @default(now())
  deliveryMethod        String   @default("EMAIL") // EMAIL, DASHBOARD, API
  emailId               String?  // Resend email ID if applicable

  // User's ticker reference (for their watchlist context)
  tickerId              String?

  // Relationships
  canonicalSummary      CanonicalSummary @relation(fields: [canonicalSummaryId], references: [id], onDelete: Cascade)
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  ticker                Ticker?  @relation(fields: [tickerId], references: [id], onDelete: SetNull)

  // Unique constraint - one delivery per user per summary
  @@unique([userId, canonicalSummaryId])
  @@index([canonicalSummaryId])
  @@index([userId, deliveredAt])
}

/// Cache access tracking for canonical summaries (analytics)
model CanonicalSummaryCacheAccess {
  id                    String   @id @default(uuid())
  canonicalSummaryId    String
  userId                String
  accessedAt            DateTime @default(now())
  accessType            String   // "EMAIL", "DASHBOARD", "API"

  canonicalSummary      CanonicalSummary @relation(fields: [canonicalSummaryId], references: [id], onDelete: Cascade)
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([canonicalSummaryId, accessedAt])
  @@index([userId, accessedAt])
}
```

Also add reverse relations to User and Ticker models:
```prisma
model User {
  // ... existing fields
  summaryDeliveries     SummaryDelivery[]
  canonicalCacheAccesses CanonicalSummaryCacheAccess[]
}

model Ticker {
  // ... existing fields
  summaryDeliveries     SummaryDelivery[]
}
```

**Checkpoint 3.2.1**: Generate Prisma client:
```bash
npm run db:generate
# Expected: Client generated with new models
```

#### 3.2.2 Create and apply migration

```bash
npm run db:migrate -- --name add_canonical_summary_schema
```

**Checkpoint 3.2.2**: Migration applied:
```bash
npm run test -- --testPathPattern="canonical-summary"
# Expected: 3 passing
```

### Step 3.3: 🔵 Refactor

- [ ] Add helper functions for canonical summary operations
- [ ] Create TypeScript types for new models
- [ ] Document schema relationships

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] Schema tests pass: `npm run test -- --testPathPattern="canonical-summary"`
- [ ] Build succeeds: `npm run build`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Prisma Studio shows new tables
- [ ] Tables have correct indexes

**Proceed immediately to Phase 4** (MVP not launched - no need for manual pause).

---

## Phase 4: Migrate Data and Switch Code Paths

### Overview
This is the most complex phase. We will:
1. Create a data migration script
2. Update filing-processor to use canonical summaries
3. Update email delivery to use SummaryDelivery
4. Run migration in production

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/migration/summary-data-migration.test.ts`

```typescript
describe('Summary Data Migration', () => {
  it('should migrate per-user summaries to canonical summaries', async () => {
    const { getPrismaClient } = await import('../../lib/db/prisma');
    const prisma = getPrismaClient();

    // After migration, canonical summaries should exist
    const canonicalCount = await prisma.canonicalSummary.count();
    const oldSummaryCount = await prisma.summary.count();

    // Canonical count should be <= old count (deduplicated)
    expect(canonicalCount).toBeGreaterThan(0);
    expect(canonicalCount).toBeLessThanOrEqual(oldSummaryCount);
  });

  it('should create delivery records for all previous email sends', async () => {
    const { getPrismaClient } = await import('../../lib/db/prisma');
    const prisma = getPrismaClient();

    // Count deliveries
    const deliveryCount = await prisma.summaryDelivery.count();

    // Should have deliveries for users who received emails
    const usersWithDeliveredSummaries = await prisma.summary.count({
      where: { sentToUser: true }
    });

    expect(deliveryCount).toBeGreaterThanOrEqual(usersWithDeliveredSummaries);
  });
});
```

### Step 4.2: 🟢 Create Migration Script

**File**: `scripts/migrate-to-canonical-summaries.ts`

```typescript
import { getPrismaClient } from '../lib/db/prisma';

interface MigrationResult {
  canonicalSummariesCreated: number;
  deliveryRecordsCreated: number;
  duplicatesConsolidated: number;
  errors: string[];
}

async function migrateToCanonicalSummaries(): Promise<MigrationResult> {
  const prisma = getPrismaClient();
  const result: MigrationResult = {
    canonicalSummariesCreated: 0,
    deliveryRecordsCreated: 0,
    duplicatesConsolidated: 0,
    errors: []
  };

  // Group existing summaries by filingUrl
  const summariesByFiling = await prisma.summary.groupBy({
    by: ['filingUrl'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });

  console.log(`Found ${summariesByFiling.length} unique filings to migrate`);

  for (const group of summariesByFiling) {
    try {
      // Get all summaries for this filing (ordered by createdAt to get the "original")
      const summaries = await prisma.summary.findMany({
        where: { filingUrl: group.filingUrl },
        include: {
          ticker: { include: { user: true } }
        },
        orderBy: { createdAt: 'asc' }
      });

      if (summaries.length === 0) continue;

      // First summary is the "original" with AI cost
      const originalSummary = summaries[0];

      // Create canonical summary
      const canonical = await prisma.canonicalSummary.upsert({
        where: { filingUrl: group.filingUrl },
        create: {
          filingUrl: originalSummary.filingUrl,
          filingType: originalSummary.filingType,
          filingDate: originalSummary.filingDate,
          companySymbol: originalSummary.ticker.symbol,
          companyName: originalSummary.ticker.companyName,
          cik: originalSummary.ticker.cik || '',
          summaryText: originalSummary.summaryText,
          summaryJSON: originalSummary.summaryJSON,
          model: originalSummary.model,
          modelVersion: originalSummary.modelVersion,
          tokensUsed: originalSummary.tokensUsed,
          inputTokens: originalSummary.inputTokens,
          outputTokens: originalSummary.outputTokens,
          cost: originalSummary.cost,
          totalCost: originalSummary.totalCost,
          processingTimeMs: originalSummary.processingTimeMs,
          processingStatus: originalSummary.processingStatus || 'COMPLETED',
          cacheUsageCount: summaries.length - 1, // Others were cache hits
          createdAt: originalSummary.createdAt
        },
        update: {} // Don't update if exists
      });

      result.canonicalSummariesCreated++;
      result.duplicatesConsolidated += summaries.length - 1;

      // Create delivery records for each user who was sent the summary
      for (const summary of summaries) {
        if (summary.sentToUser && summary.ticker?.user) {
          await prisma.summaryDelivery.upsert({
            where: {
              userId_canonicalSummaryId: {
                userId: summary.ticker.user.id,
                canonicalSummaryId: canonical.id
              }
            },
            create: {
              canonicalSummaryId: canonical.id,
              userId: summary.ticker.user.id,
              tickerId: summary.tickerId,
              deliveredAt: summary.emailSentAt || summary.updatedAt,
              deliveryMethod: 'EMAIL'
            },
            update: {} // Don't update if exists
          });
          result.deliveryRecordsCreated++;
        }
      }

    } catch (error) {
      result.errors.push(`Failed to migrate ${group.filingUrl}: ${error.message}`);
    }
  }

  return result;
}

// Run migration
migrateToCanonicalSummaries()
  .then(result => {
    console.log('Migration completed:');
    console.log(`  Canonical summaries created: ${result.canonicalSummariesCreated}`);
    console.log(`  Delivery records created: ${result.deliveryRecordsCreated}`);
    console.log(`  Duplicates consolidated: ${result.duplicatesConsolidated}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach(e => console.log(`    - ${e}`));
    }
  })
  .catch(console.error);
```

### Step 4.3: Update Filing Processor

**File**: `lib/cron/filing-processor.ts`

Key changes needed:
1. Replace `tx.summary.upsert()` with `tx.canonicalSummary.upsert()`
2. Create `SummaryDelivery` record for each user
3. Update cache check to use `canonicalSummary` table
4. Update email delivery tracking

This is a significant refactor - detailed code changes to be developed during implementation.

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] Migration tests pass: `npm run test -- --testPathPattern="summary-data-migration"`
- [ ] Pipeline tests pass: `npm run test:pipeline:comprehensive`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Verify canonical summary count matches expected
- [ ] Verify delivery records created correctly
- [ ] Test cron job creates canonical summaries
- [ ] Test email delivery uses new tracking

**Proceed immediately to Phase 5** (MVP not launched - direct cleanup without deprecation period).

---

## Phase 5: Remove Old Schema

### Overview
Since the MVP hasn't launched, we can immediately remove the old per-user Summary tables after migration completes. No deprecation period needed.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/schema/old-schema-removed.test.ts`

```typescript
import { getPrismaClient } from '../../lib/db/prisma';

describe('Old Schema Removal Verification', () => {
  const prisma = getPrismaClient();

  it('should NOT have old Summary table', async () => {
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Summary'
    `;
    expect(tables).toHaveLength(0);
  });

  it('should NOT have old SummaryCacheAccess table', async () => {
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'SummaryCacheAccess'
    `;
    expect(tables).toHaveLength(0);
  });

  it('should NOT have old SummaryEmailDelivery table', async () => {
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'SummaryEmailDelivery'
    `;
    expect(tables).toHaveLength(0);
  });

  it('should have CanonicalSummary table with data', async () => {
    const count = await prisma.canonicalSummary.count();
    expect(count).toBeGreaterThan(0);
  });
});
```

**Checkpoint 5.1**: Tests fail (old tables still exist):
```bash
npm run test -- --testPathPattern="old-schema-removed"
# Expected: 3 failing (old tables exist)
```

### Step 5.2: 🟢 Remove Old Tables and Update Schema

#### 5.2.1 Create migration to drop old tables

```bash
npm run db:migrate -- --name remove_old_summary_schema
```

**Migration SQL**:
```sql
-- Remove old per-user summary architecture
DROP TABLE IF EXISTS "SummaryCacheAccess" CASCADE;
DROP TABLE IF EXISTS "SummaryEmailDelivery" CASCADE;
DROP TABLE IF EXISTS "Summary" CASCADE;
```

#### 5.2.2 Update Prisma Schema

**File**: `prisma/schema.prisma`

Remove the following models:
- `Summary` model (old per-user summaries)
- `SummaryCacheAccess` model (old cache tracking)
- `SummaryEmailDelivery` model (old delivery tracking)

Also remove relations from `Ticker` and `User` models that reference these deleted models.

**Checkpoint 5.2.2**: Generate Prisma client:
```bash
npm run db:generate
# Expected: Client generated without old models
```

### Step 5.3: 🔵 Refactor

- [ ] Update any remaining imports that reference old Summary model
- [ ] Rename `CanonicalSummary` to `Summary` for cleaner API (optional)
- [ ] Update TypeScript types throughout codebase

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] Schema removal tests pass: `npm run test -- --testPathPattern="old-schema-removed"`
- [ ] Build succeeds: `npm run build`
- [ ] Pipeline tests pass: `npm run test:pipeline:comprehensive`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Prisma Studio shows only new tables
- [ ] Cron job creates summaries correctly
- [ ] Email delivery works end-to-end
- [ ] Dashboard displays summaries correctly

---

## Testing Strategy

### TDD Test Design Principles

1. **Schema tests first**: Verify tables exist before writing to them
2. **Migration tests**: Verify data migrated correctly
3. **Behavior tests**: Verify new architecture works as expected
4. **Regression tests**: Verify existing functionality not broken

### Test Categories

#### 1. Unit Tests
- Schema validation
- Helper function tests
- Migration script tests

#### 2. Integration Tests
- Filing processor with canonical summaries
- Email delivery with SummaryDelivery
- Cache hit behavior

#### 3. E2E Tests
- Full pipeline from filing discovery to email delivery
- Verify canonical summaries created
- Verify delivery records tracked

### Manual Testing Steps
1. Run cron job manually and verify canonical summary created
2. Verify email sent and SummaryDelivery record created
3. Check Prisma Studio for data integrity
4. Verify dashboard shows summaries correctly

---

## Performance Considerations

### Query Optimization
- `CanonicalSummary.filingUrl` is unique and indexed - O(1) lookups
- `SummaryDelivery` indexed by userId for user dashboard queries
- Denormalized company info avoids joins for common queries

### Storage Reduction
- N users tracking TSLA: 1 CanonicalSummary + N SummaryDelivery records
- Before: N Summary records (each with full summary text)
- After: 1 canonical + N lightweight delivery records
- Estimated 80%+ storage reduction for popular tickers

### Caching Behavior
- Cache check: `SELECT * FROM CanonicalSummary WHERE filingUrl = ?`
- No need to query by ticker symbol - direct URL lookup
- Simpler, faster cache checks

---

## Migration Notes

### Pre-Launch Context
Since the MVP hasn't launched yet:
- No external users to disrupt
- No need for gradual rollout or feature flags
- Direct migration is safe and efficient
- All phases can be executed in one session

### Data Integrity
- All canonical summaries created with original cost/token data
- Delivery records preserve email sent timestamps
- Migration script uses upsert for idempotency (safe to re-run)

### Rollback Plan (If Needed)
If critical issues arise during implementation:
1. Restore database from backup (Neon provides point-in-time recovery)
2. Revert code changes via git
3. Re-deploy previous working version

---

## References

- Original research: `thoughts/shared/research/2025-12-18-ai-caching-layer-validation.md`
- Duplicate analysis: `thoughts/shared/research/2025-12-18-duplicate-summaries-analysis.md`
- Current filing processor: `lib/cron/filing-processor.ts`
- Current schema: `prisma/schema.prisma`
