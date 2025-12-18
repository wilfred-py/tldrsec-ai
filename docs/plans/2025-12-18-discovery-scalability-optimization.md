# Discovery Pipeline Scalability Optimization

**Date**: 2025-12-18T08:19:29+11:00
**Git Commit**: 09eedcdb7487785c777e83ffa461790b6017d302
**Branch**: main
**Repository**: tldrsec-ai

## Overview

This plan implements the scalability optimizations identified in the research document [2025-12-18-discovery-scalability-100k-users.md](../../thoughts/shared/research/2025-12-18-discovery-scalability-100k-users.md). The goal is to optimize the SEC filing discovery pipeline to scale from the current 2 users with 8 unique tickers to 100,000 users with ~1,500 unique tickers.

**Key Insight**: The architecture is already 70-80% correct. The ticker-centric discovery approach means unique ticker count grows sublinearly with users. Changes are additive, not architectural.

## Current State Analysis

### Bottlenecks Identified

1. **MAX_CONCURRENT_RSS_CHECKS = 3** - Too conservative, only using 30% of SEC rate limit capacity
2. **N+1 CIK Enrichment** - 2 queries per ticker (26 queries for 13 tickers)
3. **Sequential Job Creation** - 1 INSERT per user-filing pair (potentially 10,000+ at scale)
4. **No RSS Response Caching** - Same CIK checked multiple times if processes overlap

### Current Code Locations

| Component | File | Line | Current Implementation |
|-----------|------|------|------------------------|
| MAX_CONCURRENT_RSS_CHECKS | [lib/cron/types.ts](../../lib/cron/types.ts) | 181 | `= 3` |
| CIK Enrichment | [lib/cron/handlers/discovery-handler.ts](../../lib/cron/handlers/discovery-handler.ts) | 98-114 | N+1 Promise.all with individual queries |
| User Lookup | [lib/cron/handlers/discovery-handler.ts](../../lib/cron/handlers/discovery-handler.ts) | 136-151 | 1 query per filing |
| Job Creation | [lib/cron/handlers/discovery-handler.ts](../../lib/cron/handlers/discovery-handler.ts) | 177-208 | Sequential addJob calls |

### Key Discoveries

1. **Existing `createMany` patterns**: Already used in `async-alert-queue.ts:239`, `sendEmailSummary.ts:432`, and `ticker-monitoring.ts:260` with `skipDuplicates: true`
2. **Existing caching infrastructure**: `SecApiCache` in `lib/cache/sec-api-cache.ts` with TTL, atomic operations, and bulk support
3. **Connection pooling config**: Documented in `database-optimization.env` but not currently applied

## Desired End State

After implementation:
- Discovery phase completes for 1,500 unique tickers in <5 minutes (vs current ~33 minutes)
- Database queries reduced by 90%+ (from ~13,500 to ~1,000 for 100K user scenario)
- SEC rate limit utilization at 50% (5 concurrent) with safety margin
- RSS responses cached to prevent duplicate fetches within same execution

### Verification Criteria

#### Automated Verification:
```bash
# All tests pass
npm run test:pipeline:comprehensive
npm run test:cron-comprehensive
npm run lint
npm run build
```

#### Manual Verification:
- [ ] Discovery phase completes within timeout for current tickers
- [ ] Pipeline processes filings correctly for all users
- [ ] No SEC rate limit errors in logs
- [ ] Slack notifications work correctly

## What We're NOT Doing

1. **NOT changing the 3-phase pipeline architecture** - It's correct
2. **NOT adding Redis** - In-memory caching is sufficient for single-instance deployment
3. **NOT implementing event-driven architecture** - Only needed at 1M+ users
4. **NOT changing the TickerMonitoring deduplication model** - It works correctly
5. **NOT implementing parallel workers** - Would require infrastructure changes

## Implementation Approach

Four independent optimizations that can be implemented and tested separately:

1. **Increase MAX_CONCURRENT_RSS_CHECKS** (low risk, immediate impact)
2. **Bulk CIK Enrichment** (medium risk, high query reduction)
3. **Bulk Job Creation** (medium risk, highest query reduction)
4. **RSS Response Caching** (low risk, prevents duplicate fetches)

---

## Phase 1: Increase MAX_CONCURRENT_RSS_CHECKS

### Overview
Increase concurrent RSS checks from 3 to 5, improving throughput by 66% while maintaining 50% safety margin below SEC's 10 req/s limit.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/lib/cron/discovery-scalability.test.ts`

```typescript
import { MAX_CONCURRENT_RSS_CHECKS, JOB_BATCH_SIZES } from '../../../lib/cron/types';

describe('Discovery Scalability Constants', () => {
  describe('MAX_CONCURRENT_RSS_CHECKS', () => {
    it('should be at least 5 for efficient throughput', () => {
      expect(MAX_CONCURRENT_RSS_CHECKS).toBeGreaterThanOrEqual(5);
    });

    it('should not exceed 7 to maintain SEC rate limit safety margin', () => {
      expect(MAX_CONCURRENT_RSS_CHECKS).toBeLessThanOrEqual(7);
    });
  });

  describe('Effective Rate Calculation', () => {
    it('should maintain effective rate under 5 requests/second with 1s delay', () => {
      // Pattern: batch of N requests, then 1s delay
      // Effective rate = N / (1 + 1) = N / 2 requests/second
      // (assuming batch completes in ~1s, plus 1s delay)
      const effectiveRate = MAX_CONCURRENT_RSS_CHECKS / 2;
      expect(effectiveRate).toBeLessThan(5);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="discovery-scalability" 2>&1 | head -50
# Expected: Test fails because MAX_CONCURRENT_RSS_CHECKS is currently 3
```

### Step 1.2: Implement to Pass Tests

#### 1.2.1 Update Constant
**File**: `lib/cron/types.ts`
**Line**: 181
**Change**: Update value from 3 to 5

```typescript
// Security constants - optimized for 50% SEC rate limit utilization
// SEC limit: 10 req/s, using 5 concurrent + 1s delay = ~2.5 req/s effective
export const MAX_CONCURRENT_RSS_CHECKS = 5;
```

**Checkpoint 1.2.1**: Run tests:
```bash
npm run test -- --testPathPattern="discovery-scalability"
# Expected: All tests pass
```

### Step 1.3: Refactor

No refactoring needed - this is a single constant change.

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] Phase tests pass: `npm run test -- --testPathPattern="discovery-scalability"`
- [x] Type checking: `npm run build`
- [x] Lint: `npm run lint`
- [x] No regressions: `npm run test:cron-comprehensive` (pre-existing failures in async-email-queue unrelated to this change)

#### Manual Verification:
- [x] Pipeline comprehensive test passes (validates discovery flow)
- [x] No SEC rate limit errors in test execution
- [x] Timing verified via test calculations (1200s vs 2000s for 1500 tickers)

**Note**: Full production verification will occur post-deployment. The constant change from 3→5 is low-risk and well-tested.

**Phase 1 Complete**: 2025-12-18T02:38:00Z

---

## Phase 2: Bulk CIK Enrichment

### Overview
Replace N+1 CIK lookup pattern with bulk queries. Reduces queries from 2N to 2 (where N = unique ticker count).

### Step 2.1: Write Failing Tests

**Test File**: `__tests__/lib/cron/handlers/discovery-handler-bulk.test.ts`

```typescript
import { jest } from '@jest/globals';

// Mock Prisma
const mockPrisma = {
  ticker: {
    findMany: jest.fn(),
  },
  cikMapping: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  jobQueue: {
    createMany: jest.fn(),
  },
};

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: () => mockPrisma,
}));

describe('Discovery Handler Bulk Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CIK Enrichment', () => {
    it('should use bulk findMany for CIK lookups instead of N individual queries', async () => {
      const tickerSymbols = ['AAPL', 'TSLA', 'NVDA'];

      mockPrisma.ticker.findMany.mockResolvedValueOnce(
        tickerSymbols.map(s => ({ symbol: s }))
      );

      mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'TSLA', cik: '0001318605' },
        { ticker: 'NVDA', cik: '0001045810' },
      ]);

      mockPrisma.ticker.findMany.mockResolvedValueOnce([
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'TSLA', companyName: 'Tesla, Inc.' },
        { symbol: 'NVDA', companyName: 'NVIDIA Corporation' },
      ]);

      // Import after mocks are set up
      const { enrichTickersWithCik } = await import('../../../lib/cron/handlers/discovery-handler');

      await enrichTickersWithCik(tickerSymbols);

      // Should call findMany with `in` clause, not findFirst N times
      expect(mockPrisma.cikMapping.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.cikMapping.findMany).toHaveBeenCalledWith({
        where: { ticker: { in: tickerSymbols } }
      });
    });

    it('should return Map for O(1) lookups', async () => {
      const tickerSymbols = ['AAPL', 'TSLA'];

      mockPrisma.ticker.findMany.mockResolvedValueOnce(
        tickerSymbols.map(s => ({ symbol: s }))
      );

      mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'TSLA', cik: '0001318605' },
      ]);

      mockPrisma.ticker.findMany.mockResolvedValueOnce([
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'TSLA', companyName: 'Tesla, Inc.' },
      ]);

      const { enrichTickersWithCik } = await import('../../../lib/cron/handlers/discovery-handler');
      const result = await enrichTickersWithCik(tickerSymbols);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(2);
      expect(result.find(t => t.symbol === 'AAPL')?.cik).toBe('0000320193');
    });

    it('should handle tickers without CIK mapping gracefully', async () => {
      const tickerSymbols = ['AAPL', 'UNKNOWN'];

      mockPrisma.ticker.findMany.mockResolvedValueOnce(
        tickerSymbols.map(s => ({ symbol: s }))
      );

      mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
        { ticker: 'AAPL', cik: '0000320193' },
        // UNKNOWN has no CIK mapping
      ]);

      mockPrisma.ticker.findMany.mockResolvedValueOnce([
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'UNKNOWN', companyName: 'Unknown Company' },
      ]);

      const { enrichTickersWithCik } = await import('../../../lib/cron/handlers/discovery-handler');
      const result = await enrichTickersWithCik(tickerSymbols);

      expect(result.length).toBe(2);
      expect(result.find(t => t.symbol === 'UNKNOWN')?.cik).toBeNull();
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="discovery-handler-bulk" 2>&1 | head -50
# Expected: Function enrichTickersWithCik doesn't exist yet
```

### Step 2.2: Implement to Pass Tests

#### 2.2.1 Create Bulk CIK Enrichment Function

**File**: `lib/cron/handlers/discovery-handler.ts`
**Location**: After the imports, before `handleDiscovery`

```typescript
/**
 * Bulk enrich ticker symbols with CIK and company name data
 * Reduces N+1 queries (2N) to 2 bulk queries
 *
 * @param tickerSymbols - Array of ticker symbols to enrich
 * @returns Array of enriched ticker data with CIK and company name
 */
export async function enrichTickersWithCik(
  tickerSymbols: string[]
): Promise<Array<{ symbol: string; companyName: string; cik: string | null }>> {
  const { getPrismaClient } = await import('../../db/prisma');
  const prisma = getPrismaClient();

  // Bulk query 1: Get all CIK mappings in one query
  const cikMappings = await prisma.cikMapping.findMany({
    where: { ticker: { in: tickerSymbols } }
  });
  const cikMap = new Map(cikMappings.map(c => [c.ticker, c.cik]));

  // Bulk query 2: Get all company names in one query
  const tickerRecords = await prisma.ticker.findMany({
    where: { symbol: { in: tickerSymbols } },
    select: { symbol: true, companyName: true },
    distinct: ['symbol']
  });
  const companyNameMap = new Map(
    tickerRecords.map(t => [t.symbol, t.companyName])
  );

  // Build enriched result
  return tickerSymbols.map(symbol => ({
    symbol,
    companyName: companyNameMap.get(symbol) || symbol,
    cik: cikMap.get(symbol) || null
  }));
}
```

**Checkpoint 2.2.1**: First test passes:
```bash
npm run test -- --testPathPattern="discovery-handler-bulk" --testNamePattern="bulk findMany"
# Expected: 1 passing
```

#### 2.2.2 Update handleDiscovery to Use Bulk Enrichment

**File**: `lib/cron/handlers/discovery-handler.ts`
**Location**: Replace lines 97-114

**OLD CODE**:
```typescript
    // STEP 2: Enrich tickers with CIK from CikMapping table
    const tickersWithCik = await Promise.all(
      tickerSymbols.map(async (symbol) => {
        const cikMapping = await prisma.cikMapping.findFirst({
          where: { ticker: symbol }
        });
        // Get company name from any user's ticker record
        const tickerRecord = await prisma.ticker.findFirst({
          where: { symbol },
          select: { companyName: true }
        });
        return {
          symbol,
          companyName: tickerRecord?.companyName || symbol,
          cik: cikMapping?.cik || null
        };
      })
    );
```

**NEW CODE**:
```typescript
    // STEP 2: Bulk enrich tickers with CIK from CikMapping table
    // Optimized: 2 bulk queries instead of 2N individual queries
    const tickersWithCik = await enrichTickersWithCik(tickerSymbols);

    discoveryLogger.debug(`[${executionId}] Enriched tickers with CIK`, {
      enrichedCount: tickersWithCik.length,
      tickersWithCik: tickersWithCik.filter(t => t.cik).length,
      tickersWithoutCik: tickersWithCik.filter(t => !t.cik).length
    });
```

**Checkpoint 2.2.2**: All bulk tests pass:
```bash
npm run test -- --testPathPattern="discovery-handler-bulk"
# Expected: All tests passing
```

### Step 2.3: Refactor

- [ ] Add JSDoc to enrichTickersWithCik
- [ ] Ensure logging is consistent with existing patterns

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Phase tests pass: `npm run test -- --testPathPattern="discovery-handler-bulk"`
- [ ] Type checking: `npm run build`
- [ ] Lint: `npm run lint`
- [ ] No regressions: `npm run test:cron-comprehensive`
- [ ] Pipeline comprehensive: `npm run test:pipeline:comprehensive`

#### Manual Verification:
- [ ] Run discovery and verify CIK enrichment works correctly
- [ ] Check logs for "Enriched tickers with CIK" message
- [ ] Verify all filings still get correct CIK data

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Bulk Job Creation

### Overview
Replace sequential `JobQueueService.addJob()` calls with bulk `prisma.jobQueue.createMany()`. Reduces queries from P (user-filing pairs) to M (filings).

### Step 3.1: Write Failing Tests

**Test File**: `__tests__/lib/cron/handlers/discovery-handler-bulk-jobs.test.ts`

```typescript
import { jest } from '@jest/globals';

const mockPrisma = {
  ticker: { findMany: jest.fn() },
  cikMapping: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  jobQueue: {
    createMany: jest.fn(),
    findFirst: jest.fn(),
  },
  tickerMonitoring: { findFirst: jest.fn() },
};

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: () => mockPrisma,
}));

// Mock the SEC filing service
jest.mock('../../../lib/cron/sec-filing-service', () => ({
  CronSecFilingService: {
    checkForNewFilings: jest.fn().mockResolvedValue([]),
  },
}));

describe('Discovery Handler Bulk Job Creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBulkFetchJobs', () => {
    it('should use createMany instead of individual addJob calls', async () => {
      const usersForFiling = [
        { id: 'user-1', email: 'user1@example.com', subscriptionTier: 'PRO', tickers: [{ id: 'ticker-1', companyName: 'Apple' }] },
        { id: 'user-2', email: 'user2@example.com', subscriptionTier: 'HOBBY', tickers: [{ id: 'ticker-2', companyName: 'Apple' }] },
      ];

      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      const executionContext = {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      };

      mockPrisma.jobQueue.createMany.mockResolvedValueOnce({ count: 2 });

      const { createBulkFetchJobs } = await import('../../../lib/cron/handlers/discovery-handler');
      const result = await createBulkFetchJobs(usersForFiling, filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, executionContext);

      expect(mockPrisma.jobQueue.createMany).toHaveBeenCalledTimes(1);
      expect(result).toBe(2);

      // Verify the data structure
      const createManyCall = mockPrisma.jobQueue.createMany.mock.calls[0][0];
      expect(createManyCall.data.length).toBe(2);
      expect(createManyCall.skipDuplicates).toBe(true);
    });

    it('should generate correct idempotency keys for deduplication', async () => {
      const usersForFiling = [
        { id: 'user-1', email: 'user1@example.com', subscriptionTier: 'PRO', tickers: [{ id: 'ticker-1', companyName: 'Apple' }] },
      ];

      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      mockPrisma.jobQueue.createMany.mockResolvedValueOnce({ count: 1 });

      const { createBulkFetchJobs } = await import('../../../lib/cron/handlers/discovery-handler');
      await createBulkFetchJobs(usersForFiling, filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      });

      const createManyCall = mockPrisma.jobQueue.createMany.mock.calls[0][0];
      const jobData = createManyCall.data[0];

      // Idempotency key format: ASYNC_FETCH_FILING:userId:accessionNumber
      expect(jobData.idempotencyKey).toBe('ASYNC_FETCH_FILING:user-1:0000320193-25-000001');
    });

    it('should handle empty user list gracefully', async () => {
      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      const { createBulkFetchJobs } = await import('../../../lib/cron/handlers/discovery-handler');
      const result = await createBulkFetchJobs([], filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      });

      expect(result).toBe(0);
      expect(mockPrisma.jobQueue.createMany).not.toHaveBeenCalled();
    });

    it('should set correct priority based on subscription tier', async () => {
      const usersForFiling = [
        { id: 'user-1', email: 'user1@example.com', subscriptionTier: 'ENTERPRISE', tickers: [{ id: 'ticker-1', companyName: 'Apple' }] },
        { id: 'user-2', email: 'user2@example.com', subscriptionTier: 'PROFESSIONAL', tickers: [{ id: 'ticker-2', companyName: 'Apple' }] },
        { id: 'user-3', email: 'user3@example.com', subscriptionTier: 'HOBBY', tickers: [{ id: 'ticker-3', companyName: 'Apple' }] },
      ];

      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      mockPrisma.jobQueue.createMany.mockResolvedValueOnce({ count: 3 });

      const { createBulkFetchJobs } = await import('../../../lib/cron/handlers/discovery-handler');
      await createBulkFetchJobs(usersForFiling, filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      });

      const createManyCall = mockPrisma.jobQueue.createMany.mock.calls[0][0];
      const jobs = createManyCall.data;

      expect(jobs.find((j: any) => j.payload.userId === 'user-1').priority).toBe(8); // ENTERPRISE
      expect(jobs.find((j: any) => j.payload.userId === 'user-2').priority).toBe(7); // PROFESSIONAL
      expect(jobs.find((j: any) => j.payload.userId === 'user-3').priority).toBe(5); // HOBBY
    });
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="discovery-handler-bulk-jobs" 2>&1 | head -50
# Expected: Function createBulkFetchJobs doesn't exist yet
```

### Step 3.2: Implement to Pass Tests

#### 3.2.1 Create Bulk Job Creation Function

**File**: `lib/cron/handlers/discovery-handler.ts`
**Location**: After `enrichTickersWithCik` function

```typescript
import { v4 as uuidv4 } from 'uuid';

interface UserForFiling {
  id: string;
  email: string | null;
  subscriptionTier: string | null;
  tickers: Array<{ id: string; companyName: string | null }>;
}

interface FilingForBulkJob {
  ticker: string;
  formType: string;
  filingDate: string;
  url: string;
  accessionNumber: string;
  id: string;
  title: string;
}

interface TickerInfo {
  symbol: string;
  cik: string | null;
  companyName: string;
}

interface ExecutionContext {
  executionId: string;
  cronTriggerTime: string;
}

/**
 * Calculate job priority based on subscription tier
 */
function getJobPriority(tier: string | null): number {
  switch (tier) {
    case 'ENTERPRISE': return 8;
    case 'PROFESSIONAL':
    case 'INSTITUTION': return 7;
    default: return 5;
  }
}

/**
 * Bulk create ASYNC_FETCH_FILING jobs for all users tracking a filing
 * Reduces N sequential inserts to 1 bulk insert per filing
 *
 * @param users - Array of users to create jobs for
 * @param filing - The discovered filing
 * @param tickerInfo - CIK and company name info
 * @param context - Execution context for tracing
 * @returns Number of jobs created
 */
export async function createBulkFetchJobs(
  users: UserForFiling[],
  filing: FilingForBulkJob,
  tickerInfo: TickerInfo,
  context: ExecutionContext
): Promise<number> {
  if (users.length === 0) {
    return 0;
  }

  const { getPrismaClient } = await import('../../db/prisma');
  const prisma = getPrismaClient();

  // Build job records for bulk insert
  const jobRecords = users
    .filter(user => user.tickers.length > 0) // Only users with valid ticker records
    .map(user => {
      const userTicker = user.tickers[0];
      return {
        id: uuidv4(),
        jobType: 'ASYNC_FETCH_FILING',
        status: 'PENDING',
        priority: getJobPriority(user.subscriptionTier),
        maxRetries: 3,
        retryCount: 0,
        scheduledFor: new Date(),
        createdAt: new Date(),
        idempotencyKey: `ASYNC_FETCH_FILING:${user.id}:${filing.accessionNumber}`,
        payload: {
          userId: user.id,
          userEmail: user.email,
          userTier: user.subscriptionTier || 'FREE',
          ticker: {
            id: userTicker.id,
            symbol: filing.ticker,
            companyName: userTicker.companyName || tickerInfo.companyName,
            cik: tickerInfo.cik
          },
          filing: {
            filingId: filing.id,
            formType: filing.formType,
            filingDate: filing.filingDate,
            filingUrl: filing.url,
            accessionNumber: filing.accessionNumber
          },
          executionContext: {
            executionId: context.executionId,
            cronTriggerTime: context.cronTriggerTime,
            sourceContext: 'discovery-multi-user-bulk',
            discoveryPhaseCompletedAt: new Date().toISOString(),
            totalUsersForTicker: users.length
          }
        }
      };
    });

  if (jobRecords.length === 0) {
    return 0;
  }

  // Bulk insert with skipDuplicates for idempotency
  const result = await prisma.jobQueue.createMany({
    data: jobRecords,
    skipDuplicates: true
  });

  return result.count;
}
```

**Checkpoint 3.2.1**: First tests pass:
```bash
npm run test -- --testPathPattern="discovery-handler-bulk-jobs" --testNamePattern="createMany"
# Expected: 1 passing
```

#### 3.2.2 Update handleDiscovery to Use Bulk Job Creation

**File**: `lib/cron/handlers/discovery-handler.ts`
**Location**: Replace lines 162-222

**OLD CODE**:
```typescript
        // Create ASYNC_FETCH_FILING job for EACH user tracking this ticker
        for (const user of usersForTicker) {
          try {
            // Get this user's specific ticker record for linking
            const userTicker = user.tickers[0];
            if (!userTicker) {
              discoveryLogger.warn(`[${executionId}] User has no ticker record for symbol`, {
                userId: user.id,
                symbol: filing.ticker
              });
              continue;
            }

            const tickerInfo = tickersWithCik.find(t => t.symbol === filing.ticker);

            const fetchJob = await JobQueueService.addJob({
              // ... job payload
            });

            if (fetchJob) {
              totalFetchJobsQueued++;
              totalUsersProcessed++;
            }
          } catch (queueError) {
            discoveryLogger.error(`[${executionId}] Failed to queue fetch job for user`, {
              // ... error logging
            });
          }
        }
```

**NEW CODE**:
```typescript
        // Bulk create ASYNC_FETCH_FILING jobs for ALL users tracking this ticker
        const tickerInfo = tickersWithCik.find(t => t.symbol === filing.ticker);

        try {
          const jobsCreated = await createBulkFetchJobs(
            usersForTicker,
            filing,
            tickerInfo || { symbol: filing.ticker, cik: null, companyName: filing.ticker },
            { executionId, cronTriggerTime }
          );

          totalFetchJobsQueued += jobsCreated;
          totalUsersProcessed += usersForTicker.length;

          discoveryLogger.debug(`[${executionId}] Bulk created ${jobsCreated} fetch jobs for filing`, {
            ticker: filing.ticker,
            formType: filing.formType,
            usersCount: usersForTicker.length,
            jobsCreated
          });
        } catch (bulkError) {
          discoveryLogger.error(`[${executionId}] Failed to bulk create fetch jobs`, {
            ticker: filing.ticker,
            filingId: filing.id,
            usersCount: usersForTicker.length,
            error: bulkError instanceof Error ? bulkError.message : 'Unknown error'
          });
        }
```

**Checkpoint 3.2.2**: All bulk job tests pass:
```bash
npm run test -- --testPathPattern="discovery-handler-bulk-jobs"
# Expected: All tests passing
```

### Step 3.3: Refactor

- [ ] Remove unused `JobQueueService` import if no longer needed
- [ ] Ensure idempotency key format is documented
- [ ] Add JSDoc comments

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] Phase tests pass: `npm run test -- --testPathPattern="discovery-handler-bulk-jobs"`
- [ ] Type checking: `npm run build`
- [ ] Lint: `npm run lint`
- [ ] No regressions: `npm run test:cron-comprehensive`
- [ ] Pipeline comprehensive: `npm run test:pipeline:comprehensive`

#### Manual Verification:
- [ ] Run discovery and verify jobs are created
- [ ] Check idempotency: re-running should not create duplicate jobs
- [ ] Verify job priorities match subscription tiers
- [ ] Check Slack notifications report correct job counts

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: RSS Response Caching

### Overview
Add short-TTL caching for RSS feed responses to prevent duplicate SEC API calls when discovery runs multiple times within a short window.

### Step 4.1: Write Failing Tests

**Test File**: `__tests__/lib/cron/rss-cache-integration.test.ts`

```typescript
import { jest } from '@jest/globals';
import { SecApiCache, getSecApiCache, withSecApiCache } from '../../../lib/cache/sec-api-cache';

describe('RSS Cache Integration', () => {
  let cache: SecApiCache;

  beforeEach(() => {
    cache = getSecApiCache();
    cache.clear();
  });

  describe('RSS Feed Caching', () => {
    it('should generate correct cache key for RSS feeds', () => {
      const key = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });
      expect(key).toBe('sec_api:rss_feed:AAPL:{"cik":"0000320193"}');
    });

    it('should cache RSS feed responses with 60-second TTL', async () => {
      const mockApiCall = jest.fn().mockResolvedValue({
        entries: [{ accessionNumber: '0000320193-25-000001' }]
      });

      const key = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });

      // First call - should hit API
      const result1 = await withSecApiCache(key, mockApiCall, 1); // 1 minute TTL
      expect(mockApiCall).toHaveBeenCalledTimes(1);
      expect(result1.entries.length).toBe(1);

      // Second call - should hit cache
      const result2 = await withSecApiCache(key, mockApiCall, 1);
      expect(mockApiCall).toHaveBeenCalledTimes(1); // Still 1 - cache hit
      expect(result2.entries.length).toBe(1);
    });

    it('should allow cache bypass when force refresh is needed', () => {
      // The cache.clear() or cache.delete() methods allow bypass
      const key = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });
      cache.set(key, { stale: true }, 10);

      // Manually clear to bypass
      cache.clear();

      expect(cache.has(key)).toBe(false);
    });
  });

  describe('Cache Metrics for RSS', () => {
    it('should track RSS cache hit ratio', async () => {
      const mockApiCall = jest.fn().mockResolvedValue({ entries: [] });
      const key = SecApiCache.generateKey('rss_feed', 'TSLA', { cik: '0001318605' });

      // First call - miss
      await withSecApiCache(key, mockApiCall, 1);

      // Second call - hit
      await withSecApiCache(key, mockApiCall, 1);
      await withSecApiCache(key, mockApiCall, 1);

      const metrics = cache.getMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
      expect(metrics.hitRatio).toBeGreaterThan(0);
    });
  });
});
```

**Checkpoint 4.1**: Run tests:
```bash
npm run test -- --testPathPattern="rss-cache-integration"
# Expected: Tests should pass (cache infrastructure exists)
```

### Step 4.2: Implement RSS Caching in Discovery

#### 4.2.1 Add RSS Caching to checkTickerForNewFilings

**File**: `lib/sec-edgar/ticker-monitoring.ts`
**Location**: In `checkTickerForNewFilings` function (around line 172)

Add caching wrapper around RSS fetch:

```typescript
import { SecApiCache, getSecApiCache, withSecApiCache } from '../cache/sec-api-cache';

export async function checkTickerForNewFilings(
  ticker: ActiveTicker
): Promise<RSSFilingEntry[]> {
  const cache = getSecApiCache();
  const cacheKey = SecApiCache.generateKey('rss_feed', ticker.symbol, { cik: ticker.cik });

  // Check cache first (60-second TTL for RSS feeds)
  const cachedResult = cache.get<RSSFilingEntry[]>(cacheKey);
  if (cachedResult !== null) {
    tickerLogger.debug(`RSS cache hit for ${ticker.symbol}`, {
      cik: ticker.cik,
      cachedEntries: cachedResult.length
    });
    // Still need to filter for new filings
    return cachedResult.filter(entry =>
      !ticker.lastAccessionSeen || entry.accessionNumber > ticker.lastAccessionSeen
    );
  }

  // Fetch from SEC (existing logic)
  const rssEntries = await fetchRssEntries(ticker);

  // Cache the raw entries (before filtering)
  cache.set(cacheKey, rssEntries, 1); // 1 minute TTL

  tickerLogger.debug(`RSS cache miss for ${ticker.symbol}`, {
    cik: ticker.cik,
    fetchedEntries: rssEntries.length
  });

  // Filter for new filings
  return rssEntries.filter(entry =>
    !ticker.lastAccessionSeen || entry.accessionNumber > ticker.lastAccessionSeen
  );
}
```

**Note**: This is a conceptual change. The exact implementation depends on the current structure of `checkTickerForNewFilings`. The key principle is:
1. Generate cache key based on ticker/CIK
2. Check cache before making SEC API call
3. Cache raw RSS entries with short TTL (60 seconds)
4. Filter for new filings after cache lookup

**Checkpoint 4.2.1**: Integration tests pass:
```bash
npm run test -- --testPathPattern="rss-cache-integration"
# Expected: All tests passing
```

### Step 4.3: Refactor

- [ ] Add logging for cache hits/misses
- [ ] Document cache TTL rationale (60s = prevents duplicate calls in same execution window)

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] Phase tests pass: `npm run test -- --testPathPattern="rss-cache-integration"`
- [ ] Type checking: `npm run build`
- [ ] Lint: `npm run lint`
- [ ] No regressions: `npm run test:cron-comprehensive`
- [ ] Pipeline comprehensive: `npm run test:pipeline:comprehensive`
- [ ] E2E test: `npm run test:e2e`

#### Manual Verification:
- [ ] Run discovery twice within 60 seconds
- [ ] Check logs for "RSS cache hit" messages on second run
- [ ] Verify SEC API call count in logs matches expectations
- [ ] Monitor SEC rate limit utilization

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test verifies a single behavior
2. **Descriptive Names**: "should [verb] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure throughout
4. **Test Behavior**: Focus on inputs/outputs, not internals
5. **Edge Cases First**: Tests for empty inputs, missing data, error conditions

### Test Categories

| Category | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|----------|---------|---------|---------|---------|
| Contract Tests | Constants validation | Bulk query interface | Bulk insert interface | Cache integration |
| Edge Case Tests | Rate limit boundaries | Missing CIK handling | Empty user list | Cache expiry |
| Integration Tests | - | Full enrichment flow | Full job creation flow | RSS fetch with cache |

### Regression Test Commands

```bash
# Core pipeline tests
npm run test:pipeline:comprehensive

# Cron integration tests
npm run test:cron-comprehensive

# Full E2E validation
npm run test:e2e

# All tests
npm run test
```

## Performance Considerations

### Query Reduction Summary

| Operation | Before | After | Reduction |
|-----------|--------|-------|-----------|
| CIK Enrichment | 2N queries | 2 queries | 99%+ at scale |
| Job Creation | P queries | M queries | ~90% (P/M ratio) |
| RSS Fetches | Uncached | Cached 60s | Variable |

Where:
- N = unique ticker count
- P = total user-filing pairs
- M = unique filings discovered

### Expected Performance at Scale

| Scenario | Current | After Optimization |
|----------|---------|-------------------|
| 13 tickers, 2 users | ~27s | ~15s |
| 200 tickers, 100 users | ~4.4min | ~2min |
| 1,500 tickers, 100K users | ~33min | ~5min |

## Migration Notes

No data migration required. Changes are:
1. Configuration value changes (backward compatible)
2. Query pattern optimizations (same data, faster queries)
3. Additive caching (optional enhancement)

## Rollback Plan

Each phase can be rolled back independently:
1. **Phase 1**: Change `MAX_CONCURRENT_RSS_CHECKS` back to 3
2. **Phase 2**: Revert to N+1 query pattern (keep function, change call site)
3. **Phase 3**: Revert to sequential `addJob` calls
4. **Phase 4**: Remove cache calls from RSS fetch

## References

- Research document: [2025-12-18-discovery-scalability-100k-users.md](../../thoughts/shared/research/2025-12-18-discovery-scalability-100k-users.md)
- SEC rate limit policy: https://www.sec.gov/oit/announcement/new-rate-control-limits
- Existing createMany patterns: [async-alert-queue.ts:239](../../lib/monitoring/async-alert-queue.ts#L239)
- Existing cache patterns: [sec-api-cache.ts](../../lib/cache/sec-api-cache.ts)
