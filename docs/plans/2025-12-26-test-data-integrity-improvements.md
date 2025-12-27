# Test Data Integrity Improvements Implementation Plan

**Date**: 2025-12-26 19:23:19 AEDT
**Git Commit**: d4cc8c41202fe99d59174c61cec4fd284fb0a0f8
**Branch**: feature/fix-email-summary-discrepancies
**Repository**: tldrsec-ai

## Overview

Based on the research findings in [thoughts/shared/research/2025-12-26-cron-summary-verification.md](../../thoughts/shared/research/2025-12-26-cron-summary-verification.md), we discovered that test-generated summaries (from `test-e2e-email.ts` and similar scripts) are indistinguishable from production data. This creates data integrity issues:

1. **No SummaryEmailDelivery records**: Test scripts fail to create delivery tracking records
2. **No test data markers**: No way to identify summaries as test vs production
3. **`sentToUser=true` without delivery records**: Gap in audit trail

**Note on secFilingId**: Both test AND production summaries have `secFilingId=NULL`. This is **intentional by design** - the 3-phase pipeline uses `FilingContentCache` for content sharing and `Ticker` for user linkage. The `SecFiling` model is legacy/unused. See "Architecture Decision" section below.

This plan addresses the data integrity issues through metadata markers and proper email delivery tracking.

## Current State Analysis

### Summary Creation Paths

| Path | Creates Summary | Sets secFilingId | Creates EmailDelivery | Has Test Marker |
|------|----------------|------------------|----------------------|-----------------|
| 3-Phase Cron Pipeline | ✅ | ❌ NULL | ✅ | ❌ |
| test-e2e-email.ts | ✅ | ❌ NULL | ❌ | ❌ |
| test-filing-summary.mjs | ✅ | ✅ Set | ❌ | ❌ |
| Legacy API routes | ✅ | ❌ NULL | ❌ | ❌ |

### Key Discoveries

1. **Production pipeline (`summarize-cached-handler.ts`)**: Sets `metadata.sourceContext='cron-tier-aware'` but does NOT set `secFilingId`
2. **Test script (`filingDatabase.ts:storeSummaryForTicker`)**: Does NOT set any metadata identifying as test data
3. **Email tracking gap**: `trackEmailDelivery()` fails silently when summary ID is missing from `FilingSummaryResult`
4. **Multiple update locations**: 5 code paths set `sentToUser=true` without creating `SummaryEmailDelivery` records

## Desired End State

After implementing this plan:

1. **Test data is clearly marked**: All test-generated summaries have `metadata.source='e2e-test'` or similar
2. **Email delivery is tracked atomically**: Setting `sentToUser=true` always creates corresponding `SummaryEmailDelivery` record
3. **Audit trail is complete**: `sentToUser=true` implies at least one `SummaryEmailDelivery` record exists
4. **Query capability exists**: Dashboard can filter test vs production data
5. **Test cleanup is automated**: Test data can be identified and cleaned up automatically

### Verification

```sql
-- All summaries with sentToUser=true should have delivery records
SELECT COUNT(*) FROM "Summary" s
WHERE s."sentToUser" = true
AND NOT EXISTS (
  SELECT 1 FROM "SummaryEmailDelivery" sed
  WHERE sed."summaryId" = s.id
);
-- Expected: 0

-- All test summaries should have source marker
SELECT COUNT(*) FROM "Summary" s
WHERE s.metadata->>'source' = 'e2e-test';
-- Expected: Non-zero only if tests have run
```

## Architecture Decision: Why secFilingId is NULL

The `secFilingId` field exists in the schema but is **intentionally unused**. This is correct by design:

### Current Architecture (Ticker-Centric)
```
FilingContentCache (one per filing URL - shared across users)
    ↓
Summary (one per user's Ticker record, deduped by [tickerId, filingUrl])
```

### Why This Design is Correct

1. **User-centric model**: Each user has their own `Ticker` records. The primary query is "show me MY summaries for MY tickers" - not "show all summaries for filing X"

2. **Content sharing already works**: `FilingContentCache` + shared summary lookup in `summarize-cached-handler.ts:218-292` prevents redundant AI calls

3. **Unique constraint prevents duplicates**: `@@unique([tickerId, filingUrl])` on Summary ensures one summary per user per filing

4. **SecFiling is legacy**: The `SecFiling` model appears to be from an older architecture superseded by the 3-phase pipeline

### Recommendation

Consider deprecating `SecFiling` and `SecFetchAttempt` models in a future cleanup, as they add confusion without providing value.

---

## What We're NOT Doing

1. **NOT adding secFilingId linkage**: The current architecture is intentional and correct
2. **NOT migrating existing data**: Historical test data will remain unmarked (only new test data gets markers)
3. **NOT adding database columns**: Using existing `metadata` JSON field instead
4. **NOT breaking existing email flows**: Changes are additive, not replacing
5. **NOT deprecating SecFiling now**: That's a separate cleanup task for the future

## Implementation Approach

We'll use the existing `metadata` JSON field on Summary to add test markers without schema migration. The approach has three phases:

1. **Phase 1**: Add test data markers to test script path
2. **Phase 2**: Fix email delivery tracking gap in test flow
3. **Phase 3**: Add audit helper to detect inconsistencies

---

## Phase 1: Add Test Data Markers to Summary Creation

### Overview

Add `metadata.source` field to identify test-generated summaries. This uses the existing `metadata` JSON column, requiring no schema changes.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/services/filings/database/filingDatabase.test.ts`

```typescript
import { storeSummary } from '@/services/filings/database/filingDatabase';
import { prisma } from '@/lib/prisma';

describe('storeSummary', () => {
  describe('test data markers', () => {
    it('should include source marker when isTestData option is true', async () => {
      // Arrange
      const ticker = 'TEST_MARKER';

      // Create a test ticker record first
      const user = await prisma.user.create({
        data: { id: 'test-user-marker', email: 'marker@test.com' }
      });
      const tickerRecord = await prisma.ticker.create({
        data: { id: 'test-ticker-marker', symbol: ticker, userId: user.id }
      });

      // Act
      const result = await storeSummary(
        ticker,
        '10-K',
        '2025-01-01',
        'https://sec.gov/test-filing',
        'Test summary text',
        ['Key point 1'],
        { accessionNumber: '0001234567-25-000001' },
        { isTestData: true, testSource: 'e2e-test' }
      );

      // Assert
      expect(result.stored).toBe(1);

      const summary = await prisma.summary.findFirst({
        where: { tickerId: tickerRecord.id }
      });

      expect(summary).not.toBeNull();
      expect(summary?.metadata).toHaveProperty('source', 'e2e-test');
      expect(summary?.metadata).toHaveProperty('isTestData', true);

      // Cleanup
      await prisma.summary.deleteMany({ where: { tickerId: tickerRecord.id } });
      await prisma.ticker.delete({ where: { id: tickerRecord.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should NOT include test marker when isTestData option is false or omitted', async () => {
      // Arrange
      const ticker = 'TEST_NO_MARKER';
      const user = await prisma.user.create({
        data: { id: 'test-user-nomarker', email: 'nomarker@test.com' }
      });
      const tickerRecord = await prisma.ticker.create({
        data: { id: 'test-ticker-nomarker', symbol: ticker, userId: user.id }
      });

      // Act
      const result = await storeSummary(
        ticker,
        '10-K',
        '2025-01-01',
        'https://sec.gov/test-filing-2',
        'Production summary text',
        ['Key point 1'],
        { accessionNumber: '0001234567-25-000002' }
        // No options parameter - should default to production
      );

      // Assert
      const summary = await prisma.summary.findFirst({
        where: { tickerId: tickerRecord.id }
      });

      expect(summary?.metadata).not.toHaveProperty('isTestData');
      expect(summary?.metadata).not.toHaveProperty('source');

      // Cleanup
      await prisma.summary.deleteMany({ where: { tickerId: tickerRecord.id } });
      await prisma.ticker.delete({ where: { id: tickerRecord.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL as expected:
```bash
npm run test -- --testPathPattern="filingDatabase.test"
# Expected: 2 failing tests (function signature doesn't accept options)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Update storeSummary Function Signature

**File**: `services/filings/database/filingDatabase.ts`

**Changes**: Add optional `options` parameter to `storeSummary()` function

```typescript
// Add new interface at top of file (after line ~20)
export interface StoreSummaryOptions {
  isTestData?: boolean;
  testSource?: string;
}

// Update function signature (line ~120)
export async function storeSummary(
  ticker: string,
  formType: string,
  filingDate: string,
  filingUrl: string,
  summaryText: string,
  keyPoints: string[],
  metadata: Record<string, any>,
  options?: StoreSummaryOptions  // NEW PARAMETER
): Promise<StoreSummaryResult> {
```

**Checkpoint 1.2.1**: Verify function compiles:
```bash
npm run build
# Expected: Successful build
```

#### 1.2.2 Update storeSummaryForTicker to Include Test Markers

**File**: `services/filings/database/filingDatabase.ts`

**Changes**: Pass options to helper and include in metadata

```typescript
// Update storeSummaryForTicker signature (around line ~173)
async function storeSummaryForTicker(
  tickerRecord: { id: string; companyName: string | null },
  formType: string,
  filingDate: string,
  filingUrl: string,
  summaryText: string,
  keyPoints: string[],
  metadata: Record<string, any>,
  options?: StoreSummaryOptions  // NEW PARAMETER
): Promise<void> {
  // ... existing code ...

  // In prisma.summary.create data object, update summaryJSON to include test markers
  const summaryRecord = await prisma.summary.create({
    data: {
      // ... existing fields ...
      summaryJSON: {
        accessionNumber: metadata.accessionNumber || '',
        keyPoints: keyPoints,
        // ... existing fields ...
      },
      // Add metadata field with test markers if applicable
      metadata: options?.isTestData ? {
        source: options.testSource || 'test',
        isTestData: true,
        createdAt: new Date().toISOString()
      } : undefined,
      // ... rest of existing fields ...
    }
  });
}

// Update the call in storeSummary loop (around line ~151)
await storeSummaryForTicker(
  tickerRecord,
  formType,
  filingDate,
  filingUrl,
  summaryText,
  keyPoints,
  metadata,
  options  // Pass options through
);
```

**Checkpoint 1.2.2**: First test passes:
```bash
npm run test -- --testPathPattern="filingDatabase.test" --testNamePattern="include source marker"
# Expected: 1 passing
```

**Checkpoint 1.2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="filingDatabase.test"
# Expected: 2 passing, 0 failing
```

### Step 1.3: 🔵 Refactor

- [ ] Extract test marker constants to shared location
- [ ] Add JSDoc for new options parameter
- [ ] Ensure metadata field is typed properly

**Checkpoint 1.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="filingDatabase.test"
# Expected: 2 passing
```

### Step 1.4: Update Test Scripts to Pass Options

#### 1.4.1 Update test-e2e-email.ts Flow

**File**: `services/filings/summaries/filingSummaryService.ts`

The `getFilingSummary()` function calls `storeSummary()`. We need to pass test options through the chain.

**Changes**: Add options parameter to `getFilingSummary()` and pass to `storeSummary()`

```typescript
// Update function signature (around line ~207)
export async function getFilingSummary(
  ticker: string,
  formType: FilingType,
  options: {
    bypassCache?: boolean;
    fromCron?: boolean;
    isTestData?: boolean;      // NEW
    testSource?: string;       // NEW
  } = {}
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
  // ... existing code ...

  // Update storeSummary call (around line ~550)
  await storeSummary(
    ticker,
    normalizedFormType,
    filing.filingDate || new Date().toISOString(),
    htmlViewerUrl,
    summaryJSON.summary,
    summaryJSON.keyPoints || [],
    {
      accessionNumber: filing.accessionNumber,
      // ... existing metadata ...
    },
    options.isTestData ? {
      isTestData: true,
      testSource: options.testSource || 'filing-summary-service'
    } : undefined
  );
}
```

#### 1.4.2 Update sendEmailSummary.ts to Pass Test Options

**File**: `services/filings/email/sendEmailSummary.ts`

**Changes**: Accept and pass test options

```typescript
// Update function signature (around line ~103)
export async function sendEmailSummary(
  email: string,
  tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
  debug: boolean = false,
  options?: { isTestData?: boolean; testSource?: string }  // NEW
): Promise<{ success: boolean, message?: string, error?: string }> {
  // ... existing code ...

  // Update getFilingSummary call (around line ~169)
  const result = await getFilingSummary(ticker, formType, {
    bypassCache: shouldBypassCache,
    fromCron: false,
    isTestData: options?.isTestData,
    testSource: options?.testSource
  });
}
```

#### 1.4.3 Update test-e2e-email.ts to Pass Test Options

**File**: `scripts/test-e2e-email.ts`

**Changes**: Pass test data markers when calling sendEmailSummary

```typescript
// Update the call (around line ~136)
const result = await filingService.sendEmailSummary(
  testEmail,
  tickers,
  false,  // debug
  { isTestData: true, testSource: 'e2e-test' }  // NEW
);
```

**Checkpoint 1.4**: Run E2E test and verify markers are set:
```bash
npm run test:e2e
# Then verify in database:
# SELECT metadata FROM "Summary" WHERE metadata->>'source' = 'e2e-test' ORDER BY "createdAt" DESC LIMIT 5;
```

### Step 1.5: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="filingDatabase.test"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Run `npm run test:e2e` and verify summaries have `metadata.source='e2e-test'`
- [ ] Query database to confirm test markers present
- [ ] Verify production cron still works without markers (run `npm run test:cron-comprehensive`)

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Fix Email Delivery Tracking Gap

### Overview

Fix the gap where `FilingSummaryResult` doesn't include the database `id`, preventing email delivery tracking. This ensures `SummaryEmailDelivery` records are always created when emails are sent.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/services/filings/email/sendEmailSummary.test.ts`

```typescript
import { sendEmailSummary } from '@/services/filings/email/sendEmailSummary';
import { prisma } from '@/lib/prisma';

describe('sendEmailSummary', () => {
  describe('email delivery tracking', () => {
    it('should create SummaryEmailDelivery records for each summary sent', async () => {
      // This test requires a real database setup
      // Arrange: Create test user and ticker
      const testEmail = 'delivery-test@example.com';
      const user = await prisma.user.create({
        data: {
          id: 'test-delivery-user',
          email: testEmail,
          clerkId: 'test_clerk_delivery'
        }
      });
      const ticker = await prisma.ticker.create({
        data: {
          id: 'test-delivery-ticker',
          symbol: 'AAPL',
          userId: user.id
        }
      });

      // Act: Send email summary
      const result = await sendEmailSummary(
        testEmail,
        ['AAPL'],
        false,
        { isTestData: true, testSource: 'delivery-test' }
      );

      // Assert: SummaryEmailDelivery records should exist
      const deliveryRecords = await prisma.summaryEmailDelivery.findMany({
        where: { userId: user.id }
      });

      // Should have at least one delivery record
      expect(deliveryRecords.length).toBeGreaterThan(0);

      // Each delivery should reference a valid summary
      for (const delivery of deliveryRecords) {
        const summary = await prisma.summary.findUnique({
          where: { id: delivery.summaryId }
        });
        expect(summary).not.toBeNull();
        expect(summary?.sentToUser).toBe(true);
      }

      // Cleanup
      await prisma.summaryEmailDelivery.deleteMany({ where: { userId: user.id } });
      await prisma.summary.deleteMany({ where: { tickerId: ticker.id } });
      await prisma.ticker.delete({ where: { id: ticker.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="sendEmailSummary.test"
# Expected: Failing (delivery records not created)
```

### Step 2.2: 🟢 Implement Email Delivery Tracking Fix

#### 2.2.1 Return Summary ID from storeSummary

**File**: `services/filings/database/filingDatabase.ts`

**Changes**: Return created summary IDs from `storeSummary()`

```typescript
// Update StoreSummaryResult interface (around line ~30)
export interface StoreSummaryResult {
  stored: number;
  total: number;
  errors: string[];
  summaryIds: string[];  // NEW: Array of created summary IDs
}

// Update return value in storeSummary (around line ~165)
const result: StoreSummaryResult = {
  stored: 0,
  total: 0,
  errors: [],
  summaryIds: []  // NEW
};

// In the loop, capture summary ID (around line ~155)
const summaryId = await storeSummaryForTicker(...);
if (summaryId) {
  result.summaryIds.push(summaryId);
}
result.stored++;

// Update storeSummaryForTicker to return ID (around line ~250)
return summaryRecord.id;  // Return the created summary ID
```

**Checkpoint 2.2.1**: Type checking passes:
```bash
npm run build
# Expected: Successful build
```

#### 2.2.2 Update getFilingSummary to Return Database ID

**File**: `services/filings/summaries/filingSummaryService.ts`

**Changes**: Include database ID in `FilingSummaryResult`

```typescript
// Update FilingSummaryResult interface (around line ~30)
export interface FilingSummaryResult {
  // ... existing fields ...
  databaseId?: string;  // NEW: Database ID for tracking
}

// After storeSummary call, add ID to result (around line ~560)
const storageResult = await storeSummary(...);

const summaryResult: FilingSummaryResult = {
  // ... existing fields ...
  databaseId: storageResult.summaryIds[0],  // NEW
};
```

**Checkpoint 2.2.2**: Build still passes:
```bash
npm run build
```

#### 2.2.3 Update sendEmailSummary to Use databaseId

**File**: `services/filings/email/sendEmailSummary.ts`

**Changes**: Use `databaseId` for email delivery tracking

```typescript
// Update tracking code (around line ~319)
for (const summary of summaries) {
  try {
    // Use databaseId instead of casting to any
    if (summary.databaseId) {
      await trackEmailDelivery(summary.databaseId, email, 'summary_digest');
    } else {
      emailSummaryLogger.warn('Could not track email delivery - summary databaseId missing', {
        ticker: summary.ticker,
        filingType: summary.filingType,
        email
      });
    }
  } catch (trackingError) {
    emailSummaryLogger.warn('Failed to track email delivery analytics', {
      error: trackingError instanceof Error ? trackingError.message : String(trackingError)
    });
  }
}
```

**Checkpoint 2.2.3**: Tests pass:
```bash
npm run test -- --testPathPattern="sendEmailSummary.test"
# Expected: 1 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Add proper type for databaseId field
- [ ] Ensure consistent error handling in tracking
- [ ] Add logging for successful delivery tracking

**Checkpoint 2.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="sendEmailSummary.test"
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`
- [ ] E2E test creates delivery records: `npm run test:e2e`

#### Manual Verification:
- [ ] Run E2E test and query `SummaryEmailDelivery` table
- [ ] Verify delivery records link to correct summaries
- [ ] Verify `sentToUser=true` summaries have corresponding delivery records

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Add Audit Helper for Detecting Inconsistencies

### Overview

Create a utility to detect and optionally fix data inconsistencies (summaries with `sentToUser=true` but no delivery records).

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/audit/summary-audit.test.ts`

```typescript
import { auditSummaryDeliveryConsistency } from '@/lib/audit/summary-audit';
import { prisma } from '@/lib/prisma';

describe('auditSummaryDeliveryConsistency', () => {
  it('should detect summaries with sentToUser=true but no delivery records', async () => {
    // Arrange: Create summary with sentToUser=true but no delivery record
    const user = await prisma.user.create({
      data: { id: 'audit-user', email: 'audit@test.com' }
    });
    const ticker = await prisma.ticker.create({
      data: { id: 'audit-ticker', symbol: 'AUDIT', userId: user.id }
    });
    const summary = await prisma.summary.create({
      data: {
        id: 'audit-summary',
        tickerId: ticker.id,
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'https://sec.gov/audit',
        summaryText: 'Audit test',
        sentToUser: true  // Inconsistent: no delivery record
      }
    });

    // Act
    const result = await auditSummaryDeliveryConsistency();

    // Assert
    expect(result.inconsistentCount).toBeGreaterThan(0);
    expect(result.inconsistentIds).toContain(summary.id);

    // Cleanup
    await prisma.summary.delete({ where: { id: summary.id } });
    await prisma.ticker.delete({ where: { id: ticker.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('should return empty array when all summaries are consistent', async () => {
    // Arrange: Create consistent summary with delivery record
    const user = await prisma.user.create({
      data: { id: 'consistent-user', email: 'consistent@test.com' }
    });
    const ticker = await prisma.ticker.create({
      data: { id: 'consistent-ticker', symbol: 'CONS', userId: user.id }
    });
    const summary = await prisma.summary.create({
      data: {
        id: 'consistent-summary',
        tickerId: ticker.id,
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'https://sec.gov/consistent',
        summaryText: 'Consistent test',
        sentToUser: true
      }
    });
    await prisma.summaryEmailDelivery.create({
      data: {
        summaryId: summary.id,
        userId: user.id,
        emailAddress: user.email
      }
    });

    // Act
    const result = await auditSummaryDeliveryConsistency();

    // Assert - this specific summary should not be in inconsistent list
    expect(result.inconsistentIds).not.toContain(summary.id);

    // Cleanup
    await prisma.summaryEmailDelivery.deleteMany({ where: { summaryId: summary.id } });
    await prisma.summary.delete({ where: { id: summary.id } });
    await prisma.ticker.delete({ where: { id: ticker.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

**Checkpoint 3.1**: Tests fail (module not found):
```bash
npm run test -- --testPathPattern="summary-audit.test"
# Expected: Failing (module doesn't exist)
```

### Step 3.2: 🟢 Implement Audit Helper

**File**: `lib/audit/summary-audit.ts` (NEW FILE)

```typescript
import { prisma } from '@/lib/prisma';

export interface AuditResult {
  totalSummariesWithSentFlag: number;
  inconsistentCount: number;
  inconsistentIds: string[];
  testDataCount: number;
  testDataIds: string[];
}

/**
 * Audit summaries for delivery consistency.
 * Finds summaries where sentToUser=true but no SummaryEmailDelivery record exists.
 */
export async function auditSummaryDeliveryConsistency(): Promise<AuditResult> {
  // Find all summaries with sentToUser=true
  const sentSummaries = await prisma.summary.findMany({
    where: { sentToUser: true },
    select: {
      id: true,
      metadata: true
    }
  });

  // Find which ones have no delivery records
  const inconsistentSummaries: string[] = [];
  const testDataSummaries: string[] = [];

  for (const summary of sentSummaries) {
    // Check for test data marker
    const metadata = summary.metadata as Record<string, any> | null;
    if (metadata?.isTestData || metadata?.source) {
      testDataSummaries.push(summary.id);
    }

    // Check for delivery records
    const deliveryCount = await prisma.summaryEmailDelivery.count({
      where: { summaryId: summary.id }
    });

    if (deliveryCount === 0) {
      inconsistentSummaries.push(summary.id);
    }
  }

  return {
    totalSummariesWithSentFlag: sentSummaries.length,
    inconsistentCount: inconsistentSummaries.length,
    inconsistentIds: inconsistentSummaries,
    testDataCount: testDataSummaries.length,
    testDataIds: testDataSummaries
  };
}

/**
 * Fix inconsistent summaries by resetting sentToUser flag.
 * Only call this after careful review of audit results.
 */
export async function fixInconsistentSummaries(
  summaryIds: string[],
  dryRun: boolean = true
): Promise<{ fixed: number; dryRun: boolean }> {
  if (dryRun) {
    console.log(`[DRY RUN] Would reset sentToUser=false for ${summaryIds.length} summaries`);
    return { fixed: 0, dryRun: true };
  }

  const result = await prisma.summary.updateMany({
    where: { id: { in: summaryIds } },
    data: { sentToUser: false }
  });

  console.log(`Reset sentToUser=false for ${result.count} summaries`);
  return { fixed: result.count, dryRun: false };
}

/**
 * Find test data summaries by metadata markers.
 */
export async function findTestDataSummaries(): Promise<{
  count: number;
  summaries: Array<{ id: string; source: string; createdAt: Date }>;
}> {
  // Query using raw SQL for JSON field access
  const testSummaries = await prisma.$queryRaw<Array<{
    id: string;
    source: string;
    createdAt: Date;
  }>>`
    SELECT id, metadata->>'source' as source, "createdAt"
    FROM "Summary"
    WHERE metadata->>'isTestData' = 'true'
       OR metadata->>'source' IS NOT NULL
    ORDER BY "createdAt" DESC
  `;

  return {
    count: testSummaries.length,
    summaries: testSummaries
  };
}
```

**Checkpoint 3.2**: Tests pass:
```bash
npm run test -- --testPathPattern="summary-audit.test"
# Expected: 2 passing
```

### Step 3.3: 🔵 Refactor

- [ ] Add proper error handling
- [ ] Add logging for audit operations
- [ ] Consider batch processing for large datasets

**Checkpoint 3.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="summary-audit.test"
```

### Step 3.4: Create Audit Script

**File**: `scripts/audit-summary-delivery.ts` (NEW FILE)

```typescript
#!/usr/bin/env npx tsx

import {
  auditSummaryDeliveryConsistency,
  findTestDataSummaries,
  fixInconsistentSummaries
} from '@/lib/audit/summary-audit';

async function main() {
  console.log('=== Summary Delivery Audit ===\n');

  // Run audit
  const auditResult = await auditSummaryDeliveryConsistency();

  console.log(`Total summaries with sentToUser=true: ${auditResult.totalSummariesWithSentFlag}`);
  console.log(`Inconsistent (no delivery record): ${auditResult.inconsistentCount}`);
  console.log(`Test data summaries: ${auditResult.testDataCount}`);

  if (auditResult.inconsistentCount > 0) {
    console.log('\nInconsistent summary IDs:');
    auditResult.inconsistentIds.slice(0, 10).forEach(id => console.log(`  - ${id}`));
    if (auditResult.inconsistentIds.length > 10) {
      console.log(`  ... and ${auditResult.inconsistentIds.length - 10} more`);
    }
  }

  // Show test data
  const testData = await findTestDataSummaries();
  if (testData.count > 0) {
    console.log(`\nTest data summaries found: ${testData.count}`);
    testData.summaries.slice(0, 5).forEach(s => {
      console.log(`  - ${s.id} (source: ${s.source}, created: ${s.createdAt.toISOString()})`);
    });
  }

  // Dry run fix
  if (auditResult.inconsistentCount > 0 && process.argv.includes('--fix')) {
    const dryRun = !process.argv.includes('--no-dry-run');
    console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Fixing inconsistent summaries...`);
    const fixResult = await fixInconsistentSummaries(auditResult.inconsistentIds, dryRun);
    console.log(`Fixed: ${fixResult.fixed} summaries`);
  }

  console.log('\nAudit complete.');
}

main().catch(console.error);
```

**Add to package.json scripts**:
```json
{
  "scripts": {
    "audit:summary-delivery": "npx tsx scripts/audit-summary-delivery.ts"
  }
}
```

### Step 3.5: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Type checking passes: `npm run build`
- [ ] Audit script runs: `npm run audit:summary-delivery`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Run audit script and review output
- [ ] Verify test data can be identified
- [ ] Verify dry run mode works correctly

**STOP**: Await manual confirmation that all phases are complete.

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test** (when practical): Each test verifies one behavior
2. **Descriptive Test Names**: Use "should [behavior] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure in every test
4. **Edge Cases First**: Test marker presence/absence, consistency checks

### Test Categories

#### Contract Tests (Phase 1)
- `storeSummary` accepts options parameter
- Options are propagated through call chain
- Metadata field contains expected markers

#### Edge Case Tests (Phase 2)
- Missing databaseId handling
- Existing delivery records (no duplicate)
- Failed email send (no delivery record created)

#### Integration Tests (Phase 3)
- Audit detects real inconsistencies
- Fix operation updates correct records
- Test data identification works

### Manual Testing Steps

1. **Run E2E test**: `npm run test:e2e`
2. **Query test markers**:
   ```sql
   SELECT id, metadata->>'source' as source, "sentToUser"
   FROM "Summary"
   WHERE metadata->>'isTestData' = 'true'
   ORDER BY "createdAt" DESC LIMIT 10;
   ```
3. **Run audit**: `npm run audit:summary-delivery`
4. **Verify delivery records**:
   ```sql
   SELECT s.id, s."sentToUser", COUNT(sed.id) as delivery_count
   FROM "Summary" s
   LEFT JOIN "SummaryEmailDelivery" sed ON sed."summaryId" = s.id
   WHERE s."sentToUser" = true
   GROUP BY s.id
   HAVING COUNT(sed.id) = 0;
   ```

---

## Performance Considerations

1. **Metadata field is indexed**: No additional indexes needed for JSON queries
2. **Audit queries use COUNT**: Efficient for large datasets
3. **Batch operations**: Fix uses `updateMany` for efficiency

---

## Migration Notes

1. **No schema changes required**: Uses existing `metadata` JSON field
2. **Backward compatible**: Production code unaffected (no test markers by default)
3. **Historical data**: Existing test data remains unmarked (future runs will be marked)

---

## References

- Original research: `thoughts/shared/research/2025-12-26-cron-summary-verification.md`
- Summary model schema: `prisma/schema.prisma:68-123`
- Production pipeline: `lib/cron/handlers/summarize-cached-handler.ts`
- Test script: `scripts/test-e2e-email.ts`
- Email service: `services/filings/email/sendEmailSummary.ts`
- Database service: `services/filings/database/filingDatabase.ts`

---

## Implementation Summary (2025-12-27)

All three phases have been implemented and verified:

### Phase 1: Test Data Markers ✅

**Files Modified:**
- `services/filings/database/filingDatabase.ts`:
  - Added `StoreSummaryOptions` interface with `isTestData` and `testSource` fields
  - Updated `storeSummary()` to accept options parameter
  - Updated `storeSummaryForTicker()` to include test markers in metadata
  - Test markers are added to `metadata` JSON field when `isTestData: true`

- `services/filings/summaries/filingSummaryService.ts`:
  - Renamed parameter from `options` to `fetchOptions` (to avoid shadowing)
  - Added `storageOptions?: StoreSummaryOptions` to fetch options
  - All 5 `storeSummary` calls pass through `fetchOptions.storageOptions`

- `services/filings/email/sendEmailSummary.ts`:
  - Added `storageOptions?: StoreSummaryOptions` parameter
  - Passes `storageOptions` to `getFilingSummary`

- `services/filingService.ts`:
  - Updated interface and implementation to pass `storageOptions`

- `scripts/test-e2e-email.ts`:
  - Passes `{ isTestData: true, testSource: 'e2e-test' }` to mark test data

### Phase 2: Email Delivery Tracking ✅

**Files Modified:**
- `services/filing/types.ts` (FilingSummaryResult interface):
  - Added `databaseId?: string` for email delivery tracking
  - Added `isCacheHit?: boolean` for cache analytics
  - Added `cacheUsageCount?: number` for cache usage tracking
  - Added `qualityScore?: number` for quality metrics

- `services/filings/database/filingDatabase.ts`:
  - Updated `StoreSummaryResult` to include `summaryIds: string[]`
  - Updated `storeSummaryForTicker()` to return created summary ID
  - Updated `storeSummary()` to collect and return summary IDs
  - Updated `findExistingSummary()` to include `databaseId` in cache results

- `services/filings/summaries/filingSummaryService.ts`:
  - Reordered to call `storeSummary` first to get database ID
  - Added `databaseId` and `isCacheHit` to result object

- `services/filings/email/sendEmailSummary.ts`:
  - Updated to use `summary.databaseId` instead of `(summary as any).id`
  - Added proper logging for successful tracking and skipped tracking

### Phase 3: Audit Helper ✅

**Files Created:**
- `lib/audit/summary-audit.ts`:
  - `auditSummaryDeliveryConsistency()` - Finds inconsistent summaries
  - `findTestData()` - Finds test-generated summaries
  - `cleanupTestData()` - Removes test data (dry-run by default)
  - `fixInconsistentDeliveryTracking()` - Fixes inconsistent records
  - `generateAuditReport()` - Comprehensive audit report

- `scripts/audit-test-data.ts`:
  - CLI tool for running audits
  - Commands: `report`, `find-test`, `cleanup`, `fix-tracking`
  - Options: `--dry-run`, `--execute`, `--source`, `--limit`, `--json`

**npm Scripts Added:**
- `npm run audit:test-data` - Run audit (default: report)
- `npm run audit:test-data:report` - Generate audit report
- `npm run audit:test-data:find` - List test-generated summaries
- `npm run audit:test-data:cleanup` - Preview test data cleanup
- `npm run audit:test-data:cleanup:execute` - Actually cleanup test data
- `npm run audit:test-data:fix` - Preview inconsistency fixes
- `npm run audit:test-data:fix:execute` - Actually fix inconsistencies

### Verification Status

- ✅ Build passes: `npm run build`
- ✅ All phases implemented without schema changes
- ✅ Backward compatible (production code unaffected)
- ✅ Test markers use existing `metadata` JSON field
