# Fix Pipeline Stall and Implement Summary Sharing Across Users

**Date**: 2025-12-16T18:35:55+11:00 (AEDT)
**Git Commit**: f9dbfeea6191e3119788fc8a989cb6ea7f127623
**Branch**: main
**Repository**: tldrsec-ai

## Overview

This plan addresses **three critical issues** discovered during post-mortem analysis of the pipeline fix:

1. **Pipeline Stalled Again** - No jobs have completed since 2025-12-15T11:51:36 UTC (over 24 hours)
2. **Second User Not Receiving Emails** - Only one of two users tracking the same ticker receives summaries
3. **Summary Duplication** - Each user gets a separate AI API call for the same filing (wasting costs)

## Current State Analysis

### Issue 1: Pipeline Stalled - 575 Discovery Jobs Never Processed

**Root Cause**: The Cloudflare Worker 4-step pipeline does NOT trigger the `ASYNC_DISCOVER_FILINGS` processing step.

**Evidence**:
- 575 `ASYNC_DISCOVER_FILINGS` jobs are stuck in `PENDING` status
- New jobs are created every 10 minutes via `/api/cron/tier-aware` (Step 1)
- But these jobs are NEVER processed because...

**Analysis of Cloudflare Worker** ([cloudflare-cron/index.js](cloudflare-cron/index.js)):
```
Step 0: cleanup-locks → /api/cron/cleanup-locks
Step 1: tier-aware → /api/cron/tier-aware (QUEUES ASYNC_DISCOVER_FILINGS jobs)
Step 2: fetch jobs → /api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING
Step 3: summarize jobs → /api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED
```

**Missing Step**: There is NO step to process `ASYNC_DISCOVER_FILINGS` jobs!

The worker directly calls fetch and summarize endpoints, but the discovery jobs that get queued in Step 1 are never processed. They accumulate indefinitely.

**BackgroundFilingWorker behavior** ([lib/cron/background-filing-worker.ts:156](lib/cron/background-filing-worker.ts#L156)):
```typescript
const defaultJobTypes: JobType[] = ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'];
```

The worker CAN process discovery jobs if called without a `jobTypes` filter, but the Cloudflare Worker ALWAYS passes a filter.

### Issue 2: Only One User Gets Summaries

**Root Cause**: The `/api/cron/tier-aware` endpoint queues discovery jobs for only one user per cron cycle.

**Evidence**:
- NVDA 144 filing (accession 0001958244-25-004541) has only 2 jobs:
  - `ASYNC_FETCH_FILING` for `user_2yAsw...` (wilfred.chen.python@gmail.com)
  - `ASYNC_SUMMARIZE_CACHED` for `user_2yAsw...` (wilfred.chen.python@gmail.com)
- No jobs exist for `wilfredchen1@gmail.com` despite tracking NVDA

**Analysis of Discovery Handler** ([lib/cron/handlers/discovery-handler.ts:85-190](lib/cron/handlers/discovery-handler.ts#L85-L190)):
- Discovery runs per-user sequentially
- Only `eligibleUsers` are processed (budget-constrained)
- If User A is processed first and User B isn't eligible (or discovery already ran), User B never gets jobs

**Analysis of Tier-Aware Endpoint** ([app/api/cron/tier-aware/route.ts:474-512](app/api/cron/tier-aware/route.ts#L474-L512)):
- In backlog mode, the endpoint DOES find all users for a ticker:
  ```typescript
  const usersForTicker = await prisma.user.findMany({
    where: { tickers: { some: { symbol: filing.ticker.symbol } } }
  });
  ```
- But this backlog mode is only triggered when there are unprocessed filings in `RssFilingCheck`
- The 3-phase pipeline mode (USE_3_PHASE_PIPELINE=true) bypasses this logic

### Issue 3: Duplicate AI Calls for Same Filing

**Current Architecture**:
```
Filing (NVDA 10-K)
  ↓
User A's Ticker → ASYNC_FETCH_FILING → ASYNC_SUMMARIZE_CACHED → AI Call #1 → Summary A
User B's Ticker → ASYNC_FETCH_FILING → ASYNC_SUMMARIZE_CACHED → AI Call #2 → Summary B
```

**Both summaries contain identical content** but cost 2x the AI API credits.

**Schema Design** ([prisma/schema.prisma:45-107](prisma/schema.prisma#L45-L107)):
```prisma
model Ticker {
  id      String   @id @default(uuid())
  userId  String   // User-specific
  symbol  String
  @@unique([userId, symbol])  // Each user has their own ticker record
}

model Summary {
  id        String  @id @default(uuid())
  tickerId  String  // Links to user's Ticker, not filing
  // ... summary content duplicated per user
}
```

## Desired End State

After this plan is complete:

1. **Pipeline processes all job types** - Discovery, Fetch, and Summarize jobs all get processed
2. **All users tracking a ticker receive emails** - When NVDA files a 10-K, both users get notified
3. **AI summaries are shared** - One AI call per filing, results cached and shared across all users
4. **Email tracking is accurate** - `Summary.sentToUser` and `SummaryEmailDelivery` are updated correctly

### Verification Criteria

**Automated**:
- [ ] `npm run test:pipeline:comprehensive` passes
- [ ] `npm run test:e2e` passes with TEST_EMAIL receiving summary
- [ ] `npm run test:cron-comprehensive` passes
- [ ] No PENDING discovery jobs older than 20 minutes

**Manual**:
- [ ] Both test users receive email for a new NVDA filing
- [ ] Only one AI API call is made per filing (check cost in job results)
- [ ] `Summary.sentToUser` is `true` for all emailed summaries

## What We're NOT Doing

1. **Not migrating existing Summary records** - They will remain user-specific; only new summaries will be shared
2. **Not changing the Ticker model** - Users still have individual ticker subscriptions
3. **Not adding new database models** - We'll use `FilingContentCache` for shared summary caching
4. **Not changing email templates** - Same email content, just fixing delivery tracking

## Implementation Approach

**Strategy**: Fix the pipeline in order of severity:
1. **Phase 1**: Fix discovery job processing (unblocks the entire pipeline)
2. **Phase 2**: Fix multi-user job creation (ensures all users get jobs)
3. **Phase 3**: Fix email tracking (database accuracy)
4. **Phase 4**: Implement summary sharing (cost optimization)

---

## Phase 1: Fix Discovery Job Processing

### Overview
Add a discovery job processing step to the Cloudflare Worker pipeline so `ASYNC_DISCOVER_FILINGS` jobs are actually processed.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/cloudflare-worker-pipeline.test.ts`

```typescript
describe('Cloudflare Worker Pipeline', () => {
  it('should call discovery job processing endpoint', async () => {
    // Mock the 4-step pipeline execution
    // Verify that ASYNC_DISCOVER_FILINGS jobs are processed
    // This test will fail because discovery step doesn't exist
  });

  it('should process discovery jobs before fetch jobs', async () => {
    // Verify correct ordering: discovery → fetch → summarize
  });
});
```

**Checkpoint 1.1**: Tests fail because discovery step is missing

### Step 1.2: 🟢 Implement Discovery Step in Cloudflare Worker

#### 1.2.1 Add Discovery Step to cloudflare-cron/index.js

**File**: `cloudflare-cron/index.js`
**Location**: After Step 1 (tier-aware), before Step 2 (fetch)

Add new step between lines 280-281:

```javascript
// ========================================
// STEP 1.5: Process Discovery Jobs
// ========================================
// This step processes the ASYNC_DISCOVER_FILINGS jobs queued in Step 1.
// Discovery jobs check RSS feeds for each user's tickers and queue fetch jobs.
console.log(`[${executionId}] ====== STEP 1.5: DISCOVERY JOBS ======`);
console.log(`[${executionId}] Step 1.5: Processing discovery jobs...`);
let discoveryResult;
try {
  const discoveryUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS`;
  const { signatureHex, timestamp } = await generateSignature(discoveryUrl);
  const discoveryHeaders = createHeaders(signatureHex, timestamp);

  discoveryResult = await executeWithAdvancedRateLimiting({
    executionId,
    url: discoveryUrl,
    headers: discoveryHeaders,
    workerTimeoutMs: WORKER_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxAttempts: MAX_ATTEMPTS,
    initialBackoffMs: INITIAL_BACKOFF_MS,
    maxBackoffMs: MAX_BACKOFF_MS,
    jitterPercentage: JITTER_PERCENTAGE,
    rateLimiter,
    circuitBreaker,
    monitor,
    rateLimitConfig: {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: MAX_REQUESTS_PER_WINDOW,
      burstLimit: MAX_BURST_REQUESTS,
      globalLimit: GLOBAL_SUBREQUEST_LIMIT,
      burstWindowMs: BURST_PROTECTION_WINDOW_MS,
      breakerThreshold: CIRCUIT_BREAKER_THRESHOLD
    }
  });

  console.log(`[${executionId}] Step 1.5 completed: discovery jobs processed`);
} catch (discoveryError) {
  console.error(`[${executionId}] Step 1.5 failed: discovery jobs error`, {
    error: discoveryError.message
  });
  // Continue to fetch step even if discovery fails
  console.warn(`[${executionId}] Discovery processing failed, continuing to fetch step`);
}
```

**Checkpoint 1.2.1**: Cloudflare Worker now has 5 steps (cleanup → tier-aware → discovery → fetch → summarize)

#### 1.2.2 Update Result Aggregation

**File**: `cloudflare-cron/index.js`
**Location**: Line 367-396 (result object)

Add discovery metrics to the combined result object.

**Checkpoint 1.2.2**: Result object includes discovery metrics

### Step 1.3: 🔵 Refactor

- [ ] Rename steps for clarity (0, 1, 1.5, 2, 3 → 0, 1, 2, 3, 4)
- [ ] Update logging to reflect new step numbering
- [ ] Update documentation comments

**Checkpoint 1.3**: All tests pass after refactoring

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Deploy Cloudflare Worker: `npm run cloudflare:deploy`
- [ ] Verify worker logs show 5 steps: `npm run cloudflare:logs`
- [ ] Check discovery jobs are being processed: `npx tsx scripts/check-pending-jobs.ts`

#### Manual Verification:
- [ ] Wait for one cron cycle (10 minutes)
- [ ] Verify PENDING discovery jobs count is decreasing
- [ ] Check Cloudflare Worker logs for Step 1.5 execution

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Fix Multi-User Job Creation

### Overview
Ensure that when a filing is discovered for a ticker, jobs are created for ALL users tracking that ticker, not just the first user processed.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/discovery-multi-user.test.ts`

```typescript
describe('Discovery Handler Multi-User', () => {
  it('should create fetch jobs for all users tracking a ticker', async () => {
    // Given: 2 users both track NVDA
    // When: NVDA files a 10-K
    // Then: 2 ASYNC_FETCH_FILING jobs are created (one per user)
    // This test will fail because current logic only processes one user
  });

  it('should deduplicate filings across users', async () => {
    // Given: User A and User B both track NVDA
    // When: Discovery runs for User A, then User B
    // Then: Only 1 ASYNC_FETCH_FILING job per user (not duplicated)
  });
});
```

**Checkpoint 2.1**: Tests fail because discovery creates jobs only for first eligible user

### Step 2.2: 🟢 Implement Multi-User Discovery

#### 2.2.1 Modify Discovery Handler to Batch by Ticker

**File**: `lib/cron/handlers/discovery-handler.ts`
**Changes**: Instead of per-user discovery, batch by unique tickers across all users

Current flow:
```
For each user:
  For each user's ticker:
    Check RSS feed → Create job for THIS user only
```

New flow:
```
Step 1: Get unique tickers across ALL users
Step 2: For each unique ticker:
  Check RSS feed once → Get new filings
  For each new filing:
    Find ALL users tracking this ticker
    Create job for EACH user
```

**Checkpoint 2.2.1**: Discovery creates jobs for all users

#### 2.2.2 Add User Lookup for Filing Jobs

**File**: `lib/cron/handlers/discovery-handler.ts`

Add function to find all users tracking a ticker:
```typescript
async function getUsersForTicker(symbol: string): Promise<User[]> {
  return prisma.user.findMany({
    where: {
      tickers: { some: { symbol } }
    },
    select: {
      id: true,
      email: true,
      subscriptionTier: true
    }
  });
}
```

**Checkpoint 2.2.2**: User lookup function works correctly

### Step 2.3: 🔵 Refactor

- [ ] Extract common job creation logic
- [ ] Add logging for multi-user job creation
- [ ] Ensure idempotency keys prevent duplicate jobs

**Checkpoint 2.3**: All tests pass after refactoring

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm run test:cron-comprehensive` passes
- [ ] Both users have jobs for the same NVDA filing

#### Manual Verification:
- [ ] Trigger new filing discovery
- [ ] Verify both users receive jobs in JobQueue

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Fix Email Tracking

### Overview
Update `Summary.sentToUser` and create `SummaryEmailDelivery` records after successful email send.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/email-tracking.test.ts`

```typescript
describe('Email Tracking', () => {
  it('should update Summary.sentToUser after successful email', async () => {
    // Given: Summary exists with sentToUser: false
    // When: Email is sent successfully
    // Then: Summary.sentToUser is true
  });

  it('should create SummaryEmailDelivery record', async () => {
    // Given: Summary exists, no delivery record
    // When: Email is sent successfully
    // Then: SummaryEmailDelivery record is created
  });
});
```

**Checkpoint 3.1**: Tests fail because summarize-cached-handler doesn't update Summary

### Step 3.2: 🟢 Implement Email Tracking Update

#### 3.2.1 Update Summary After Email Send

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Location**: After line 318 (successful email send)

Add database update:
```typescript
// Update Summary record to reflect email sent
await prisma.summary.update({
  where: { id: summary.id },
  data: {
    sentToUser: true,
    totalEmailsSent: { increment: 1 }
  }
});

// Create SummaryEmailDelivery record
await prisma.summaryEmailDelivery.create({
  data: {
    summaryId: summary.id,
    userId: userId,
    emailAddress: userEmail,
    deliveryStatus: 'sent'
  }
});
```

**Checkpoint 3.2.1**: Summary is updated after email send

### Step 3.3: 🔵 Refactor

- [ ] Add error handling for database updates
- [ ] Ensure email send doesn't fail if tracking fails

**Checkpoint 3.3**: All tests pass after refactoring

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm run test:e2e` passes
- [ ] Summary.sentToUser is true for recent summaries

#### Manual Verification:
- [ ] Check database for SummaryEmailDelivery records
- [ ] Verify sentToUser is true for emailed summaries

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Implement Summary Sharing

### Overview
Share AI-generated summaries across users to reduce API costs. Use `FilingContentCache` to store shared summaries.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/summary-sharing.test.ts`

```typescript
describe('Summary Sharing', () => {
  it('should reuse cached summary for second user', async () => {
    // Given: User A already has summary for NVDA 10-K
    // When: User B requests summary for same filing
    // Then: Cached summary is used, no AI API call
  });

  it('should create user-specific Summary records from shared cache', async () => {
    // Given: Shared summary exists in cache
    // When: User B's job runs
    // Then: User B gets Summary record linked to their ticker
  });
});
```

**Checkpoint 4.1**: Tests fail because summarize-cached-handler doesn't check for shared summaries

### Step 4.2: 🟢 Implement Summary Sharing

#### 4.2.1 Add Shared Summary Check

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Location**: Before AI API call (around line 223)

Add check for existing shared summary:
```typescript
// Check if summary already exists for this filing (any user)
const existingSharedSummary = await prisma.summary.findFirst({
  where: {
    filingUrl: filing.filingUrl,
    filingType: filing.formType
  },
  select: {
    summaryText: true,
    summaryJSON: true,
    modelVersion: true,
    inputTokens: true,
    outputTokens: true,
    totalCost: true
  }
});

if (existingSharedSummary) {
  // Reuse existing summary content
  summaryResult = {
    summary: existingSharedSummary.summaryText,
    data: existingSharedSummary.summaryJSON,
    metadata: {
      shared: true,
      originalModelVersion: existingSharedSummary.modelVersion
    }
  };
  cost = 0; // No additional AI cost
  wasShared = true;
} else {
  // Generate new summary via AI
  // ... existing AI call code ...
}
```

**Checkpoint 4.2.1**: Second user gets cached summary without AI call

#### 4.2.2 Track Shared Summary Metadata

Update Summary creation to indicate if it was shared:
```typescript
const summary = await prisma.summary.create({
  data: {
    // ... existing fields ...
    metadata: {
      ...existingMetadata,
      sharedFromSummaryId: wasShared ? existingSharedSummary?.id : null,
      generatedAt: wasShared ? null : new Date().toISOString()
    }
  }
});
```

**Checkpoint 4.2.2**: Summary metadata indicates if it was shared

### Step 4.3: 🔵 Refactor

- [ ] Add logging for shared summary hits
- [ ] Track cost savings in job results
- [ ] Consider cache invalidation strategy

**Checkpoint 4.3**: All tests pass after refactoring

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm run test:pipeline:comprehensive` passes
- [ ] Cost is $0 for second user's summary job

#### Manual Verification:
- [ ] Verify both users have Summary records
- [ ] Check that only one AI API call was made
- [ ] Confirm cost savings in job results

**STOP**: Plan complete.

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test verifies one behavior
2. **Descriptive Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior**: Focus on inputs/outputs

### Test Categories

1. **Contract Tests**: Define API interfaces
2. **Edge Case Tests**: Boundary conditions
3. **Integration Tests**: Component interaction
4. **Regression Tests**: Prevent bug recurrence

### Manual Testing Steps

1. Wait for cron cycle (10 minutes)
2. Check both user inboxes for emails
3. Verify database state (Summary, SummaryEmailDelivery)
4. Check Cloudflare Worker logs for all 5 steps

## Performance Considerations

- **Shared Summaries**: Reduce AI API costs by 50%+ for multi-user filings
- **Discovery Batching**: One RSS check per ticker instead of per user
- **Database Queries**: Use batch operations for multi-user job creation

## Migration Notes

- No data migration required
- Existing summaries remain user-specific
- New summaries will be shared automatically

## References

- Post-mortem research: [thoughts/shared/research/2025-12-16-pipeline-fix-validation-post-mortem.md](thoughts/shared/research/2025-12-16-pipeline-fix-validation-post-mortem.md)
- Cloudflare Worker: [cloudflare-cron/index.js](cloudflare-cron/index.js)
- Discovery Handler: [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts)
- Summarize Handler: [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts)
- Job Queue Service: [lib/job-queue/index.ts](lib/job-queue/index.ts)
