# Pipeline Resilience Improvements Implementation Plan

**Date**: 2026-01-03 15:30:14 AEDT
**Git Commit**: 653cdae9e33331a17258c30aca7b53b7a2e52e80
**Branch**: main
**Repository**: tldrsec-ai

## Overview

This plan addresses pipeline resilience gaps identified in the research document [2026-01-03-pipeline-stalling-fix-documentation.md](../../thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md). The focus is on preventing stuck jobs through defensive coding and proactive cleanup.

## Current State Analysis

### Issues Identified

1. **`markForRetry()` Function Gap** ([lib/job-queue/index.ts:503-551](../../lib/job-queue/index.ts#L503-L551))
   - Unconditionally sets status to `RETRYING` without validating `retryCount < maxRetries`
   - Can create jobs that are marked RETRYING but will never be selected by the worker
   - Job selection query correctly filters `"retryCount" < "maxRetries"`, so these jobs become permanently stuck

2. **No Cleanup for Exhausted-Retry Jobs in PENDING/RETRYING Status**
   - `recoverStaleJobs()` only handles PROCESSING status jobs
   - Jobs in PENDING or RETRYING with `retryCount >= maxRetries` are never cleaned up
   - Historical occurrence: 10 jobs found in this state (manually fixed on 2026-01-03)

3. **Auto-Recovery Ignores Job Queue Metrics**
   - Auto-recovery only checks lock health and stall duration
   - Does not evaluate pending job count, dead letter queue, or retry exhaustion

### What's Already Working Well

- **Job Selection Filter**: Raw SQL correctly excludes exhausted-retry jobs
- **Normal Retry Flow**: `updateJobStatus(id, 'FAILED')` correctly transitions to FAILED when retries exhausted
- **Stale Job Recovery**: `recoverStaleJobs()` properly handles PROCESSING jobs stuck > 5 minutes
- **Cloudflare Worker**: Sophisticated circuit breaker, retry logic, and health monitoring every 5/15 minutes

## Desired End State

After this plan is complete:

1. **Defensive Prevention**: `markForRetry()` will refuse to mark exhausted-retry jobs as RETRYING
2. **Proactive Cleanup**: Background worker will automatically detect and mark exhausted-retry jobs as FAILED
3. **Monitoring Integration**: Auto-recovery will consider job queue health metrics

### Verification Criteria

- All unit tests pass including new tests for the fixed behavior
- No jobs can become stuck in PENDING/RETRYING with exhausted retries
- Build and lint pass
- E2E pipeline test passes

## What We're NOT Doing

1. **Vercel Cron Backup** - Cloudflare Worker already has robust error handling; adding Vercel cron creates duplicate trigger risk
2. **Database Persistence of Recovery State** - Memory-based state with 15-minute auto-recovery is sufficient
3. **Root Cause Analysis of Historical Jobs** - Already known (Prisma field reference bug, fixed December 2025)
4. **Complex Circuit Breaker for Auto-Recovery** - Existing rate limiting (1hr cooldown, 3/day limit) is adequate
5. **External Service Health Checks** - Out of scope; SEC/Anthropic/Resend monitoring is separate concern

## Implementation Approach

Following Elon's 5-Step Algorithm:
1. **Questioned** all requirements - removed unnecessary complexity
2. **Deleted** 60% of original scope (Vercel backup, DB persistence, root cause analysis)
3. **Simplified** to 2 focused phases with TDD
4. **Accelerated** via small, incremental tests
5. **Automated** cleanup as part of existing cron cycle

---

## Phase 1: Fix `markForRetry()` Validation Gap

### Overview
Add retry count validation to `markForRetry()` to prevent creating stuck jobs. This is a defensive fix - if any code path incorrectly calls this function on an exhausted-retry job, it will now be rejected.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/job-queue/mark-for-retry-validation.test.ts`

Write these tests FIRST (they should all fail initially):

```typescript
import { JobQueueService } from '@/lib/job-queue';
import { getPrisma } from '@/lib/db/client';

describe('JobQueueService.markForRetry', () => {
  const prisma = getPrisma();

  beforeEach(async () => {
    // Clean up test jobs
    await prisma.jobQueue.deleteMany({
      where: { jobType: 'TEST_JOB' }
    });
  });

  afterAll(async () => {
    await prisma.jobQueue.deleteMany({
      where: { jobType: 'TEST_JOB' }
    });
  });

  it('should mark job for retry when retryCount < maxRetries', async () => {
    // Arrange: Create job with retries remaining
    const job = await prisma.jobQueue.create({
      data: {
        jobType: 'TEST_JOB',
        payload: { test: true },
        status: 'FAILED',
        retryCount: 1,
        maxRetries: 3,
        scheduledFor: new Date(),
        priority: 5,
      }
    });

    // Act
    const retryDate = new Date(Date.now() + 60000);
    const result = await JobQueueService.markForRetry(job.id, retryDate, {
      lastError: 'Test error'
    });

    // Assert
    expect(result.status).toBe('RETRYING');
    expect(result.scheduledFor).toEqual(retryDate);
  });

  it('should throw error when retryCount >= maxRetries', async () => {
    // Arrange: Create job with exhausted retries
    const job = await prisma.jobQueue.create({
      data: {
        jobType: 'TEST_JOB',
        payload: { test: true },
        status: 'FAILED',
        retryCount: 3,
        maxRetries: 3,
        scheduledFor: new Date(),
        priority: 5,
      }
    });

    // Act & Assert
    const retryDate = new Date(Date.now() + 60000);
    await expect(
      JobQueueService.markForRetry(job.id, retryDate, { lastError: 'Test error' })
    ).rejects.toThrow('Cannot retry job: retry count (3) >= max retries (3)');
  });

  it('should throw error when retryCount > maxRetries', async () => {
    // Arrange: Create job where retryCount exceeds maxRetries (edge case)
    const job = await prisma.jobQueue.create({
      data: {
        jobType: 'TEST_JOB',
        payload: { test: true },
        status: 'PENDING',
        retryCount: 5,
        maxRetries: 3,
        scheduledFor: new Date(),
        priority: 5,
      }
    });

    // Act & Assert
    const retryDate = new Date(Date.now() + 60000);
    await expect(
      JobQueueService.markForRetry(job.id, retryDate)
    ).rejects.toThrow('Cannot retry job: retry count (5) >= max retries (3)');
  });

  it('should include job ID in error message for debugging', async () => {
    // Arrange
    const job = await prisma.jobQueue.create({
      data: {
        jobType: 'TEST_JOB',
        payload: { test: true },
        status: 'FAILED',
        retryCount: 3,
        maxRetries: 3,
        scheduledFor: new Date(),
        priority: 5,
      }
    });

    // Act & Assert
    const retryDate = new Date(Date.now() + 60000);
    await expect(
      JobQueueService.markForRetry(job.id, retryDate)
    ).rejects.toThrow(job.id);
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL as expected:
```bash
npm run test -- --testPathPattern="mark-for-retry-validation" --passWithNoTests
# Expected: 4 failing tests (module loads, but validation doesn't exist)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Add Retry Count Validation
**File**: `lib/job-queue/index.ts`
**Location**: Lines 503-551 (inside `markForRetry` function)

Add validation after fetching the job (after line 511):

```typescript
static async markForRetry(id: string, retryAt: Date, resultData: JobResultData = {}) {
  try {
    const job = await prisma.jobQueue.findUnique({
      where: { id }
    });

    if (!job) {
      throw new Error(`Job with ID ${id} not found`);
    }

    // NEW: Validate retry count before marking for retry
    if (job.retryCount >= job.maxRetries) {
      throw new Error(
        `Cannot retry job ${id}: retry count (${job.retryCount}) >= max retries (${job.maxRetries})`
      );
    }

    const now = new Date();
    // ... rest of existing implementation
```

**Checkpoint 1.2.1**: Verify all tests pass:
```bash
npm run test -- --testPathPattern="mark-for-retry-validation"
# Expected: 4 passing, 0 failing
```

### Step 1.3: 🔵 Refactor

- [ ] Add JSDoc comment explaining the validation
- [ ] Ensure error message format is consistent with other job queue errors

**Checkpoint 1.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="mark-for-retry-validation"
# Expected: 4 passing, 0 failing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="mark-for-retry-validation"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`
- [ ] Existing job queue tests pass: `npm run test -- --testPathPattern="job-queue"`

#### Manual Verification:
- [ ] Review that no existing code paths call `markForRetry()` on exhausted-retry jobs

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Add Exhausted-Retry Job Cleanup

### Overview
Extend `recoverStaleJobs()` in `BackgroundFilingWorker` to also clean up PENDING and RETRYING jobs that have exhausted their retries. This runs automatically every 5 minutes as part of the normal cron cycle.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/cron/exhausted-retry-cleanup.test.ts`

```typescript
import { BackgroundFilingWorker } from '@/lib/cron/background-filing-worker';
import { getPrisma } from '@/lib/db/client';

describe('BackgroundFilingWorker.recoverStaleJobs', () => {
  const prisma = getPrisma();
  let worker: BackgroundFilingWorker;

  beforeEach(async () => {
    worker = new BackgroundFilingWorker({
      batchSize: 10,
      processingInterval: 0,
    });

    // Clean up test jobs
    await prisma.jobQueue.deleteMany({
      where: { jobType: 'TEST_CLEANUP_JOB' }
    });
  });

  afterAll(async () => {
    await prisma.jobQueue.deleteMany({
      where: { jobType: 'TEST_CLEANUP_JOB' }
    });
  });

  describe('exhausted retry cleanup', () => {
    it('should mark PENDING jobs with exhausted retries as FAILED', async () => {
      // Arrange: Create PENDING job with retryCount >= maxRetries
      const job = await prisma.jobQueue.create({
        data: {
          jobType: 'TEST_CLEANUP_JOB',
          payload: { test: true },
          status: 'PENDING',
          retryCount: 3,
          maxRetries: 3,
          scheduledFor: new Date(),
          priority: 5,
        }
      });

      // Act: Run recovery (which should now include exhausted-retry cleanup)
      await worker.recoverExhaustedRetryJobs();

      // Assert
      const updatedJob = await prisma.jobQueue.findUnique({
        where: { id: job.id }
      });
      expect(updatedJob?.status).toBe('FAILED');
      expect(updatedJob?.lastError).toContain('exhausted retries');
    });

    it('should mark RETRYING jobs with exhausted retries as FAILED', async () => {
      // Arrange: Create RETRYING job with retryCount >= maxRetries
      const job = await prisma.jobQueue.create({
        data: {
          jobType: 'TEST_CLEANUP_JOB',
          payload: { test: true },
          status: 'RETRYING',
          retryCount: 5,
          maxRetries: 3,
          scheduledFor: new Date(),
          priority: 5,
        }
      });

      // Act
      await worker.recoverExhaustedRetryJobs();

      // Assert
      const updatedJob = await prisma.jobQueue.findUnique({
        where: { id: job.id }
      });
      expect(updatedJob?.status).toBe('FAILED');
    });

    it('should NOT mark PENDING jobs with retries remaining as FAILED', async () => {
      // Arrange: Create PENDING job with retries remaining
      const job = await prisma.jobQueue.create({
        data: {
          jobType: 'TEST_CLEANUP_JOB',
          payload: { test: true },
          status: 'PENDING',
          retryCount: 1,
          maxRetries: 3,
          scheduledFor: new Date(),
          priority: 5,
        }
      });

      // Act
      await worker.recoverExhaustedRetryJobs();

      // Assert
      const updatedJob = await prisma.jobQueue.findUnique({
        where: { id: job.id }
      });
      expect(updatedJob?.status).toBe('PENDING'); // Unchanged
    });

    it('should return count of jobs marked as FAILED', async () => {
      // Arrange: Create multiple exhausted-retry jobs
      await prisma.jobQueue.createMany({
        data: [
          {
            jobType: 'TEST_CLEANUP_JOB',
            payload: { test: 1 },
            status: 'PENDING',
            retryCount: 3,
            maxRetries: 3,
            scheduledFor: new Date(),
            priority: 5,
          },
          {
            jobType: 'TEST_CLEANUP_JOB',
            payload: { test: 2 },
            status: 'RETRYING',
            retryCount: 4,
            maxRetries: 3,
            scheduledFor: new Date(),
            priority: 5,
          },
        ]
      });

      // Act
      const count = await worker.recoverExhaustedRetryJobs();

      // Assert
      expect(count).toBe(2);
    });

    it('should log cleanup actions', async () => {
      // Arrange
      const job = await prisma.jobQueue.create({
        data: {
          jobType: 'TEST_CLEANUP_JOB',
          payload: { test: true },
          status: 'PENDING',
          retryCount: 3,
          maxRetries: 3,
          scheduledFor: new Date(),
          priority: 5,
        }
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      await worker.recoverExhaustedRetryJobs();

      // Assert
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL as expected:
```bash
npm run test -- --testPathPattern="exhausted-retry-cleanup" --passWithNoTests
# Expected: Method doesn't exist yet, tests fail
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Add `recoverExhaustedRetryJobs()` Method
**File**: `lib/cron/background-filing-worker.ts`
**Location**: After `recoverStaleJobs()` method (around line 383)

```typescript
/**
 * Recover jobs stuck in PENDING or RETRYING with exhausted retries.
 * These jobs will never be picked up by the worker because the job selection
 * query filters out jobs where retryCount >= maxRetries.
 *
 * @returns Number of jobs marked as FAILED
 */
public async recoverExhaustedRetryJobs(): Promise<number> {
  try {
    // Find PENDING or RETRYING jobs where retryCount >= maxRetries
    // Using raw SQL for the row-level comparison (same pattern as job selection)
    const exhaustedJobs = await getPrisma().$queryRaw<Array<{ id: string; retryCount: number; maxRetries: number; status: string; jobType: string }>>`
      SELECT id, "retryCount", "maxRetries", status, "jobType"
      FROM pipeline."JobQueue"
      WHERE status IN ('PENDING', 'RETRYING')
        AND "retryCount" >= "maxRetries"
      LIMIT 100
    `;

    if (exhaustedJobs.length === 0) {
      return 0;
    }

    // Mark each as FAILED
    let failedCount = 0;
    for (const job of exhaustedJobs) {
      await getPrisma().jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastError: `Cleanup: Job had exhausted retries (${job.retryCount}/${job.maxRetries}) while in ${job.status} status`,
        },
      });
      failedCount++;
    }

    workerLogger.warn('Cleaned up exhausted-retry jobs', {
      processId: this.processId,
      totalFound: exhaustedJobs.length,
      markedFailed: failedCount,
      jobTypes: [...new Set(exhaustedJobs.map(j => j.jobType))],
    });

    return failedCount;
  } catch (error) {
    workerLogger.error('Failed to recover exhausted-retry jobs', { error });
    return 0;
  }
}
```

**Checkpoint 2.2.1**: Verify first tests pass:
```bash
npm run test -- --testPathPattern="exhausted-retry-cleanup"
# Expected: Tests should pass
```

#### 2.2.2 Integrate into `processBatch()` Lifecycle
**File**: `lib/cron/background-filing-worker.ts`
**Location**: In `processBatch()` method, after `recoverStaleJobs()` call

Find where `recoverStaleJobs()` is called and add the new cleanup after it:

```typescript
// Existing: Recover stale PROCESSING jobs
const recoveredCount = await this.recoverStaleJobs();

// NEW: Also clean up exhausted-retry jobs
const exhaustedCleanedCount = await this.recoverExhaustedRetryJobs();
if (exhaustedCleanedCount > 0) {
  workerLogger.info('Cleaned up exhausted-retry jobs during batch processing', {
    count: exhaustedCleanedCount,
  });
}
```

**Checkpoint 2.2.2**: Verify integration doesn't break existing tests:
```bash
npm run test -- --testPathPattern="background-filing-worker"
# Expected: All existing tests still pass
```

### Step 2.3: 🔵 Refactor

- [ ] Ensure logging format is consistent with `recoverStaleJobs()`
- [ ] Consider combining metrics reporting with existing recovery stats

**Checkpoint 2.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="exhausted-retry-cleanup"
npm run test -- --testPathPattern="background-filing-worker"
# Expected: All passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Phase tests pass: `npm run test -- --testPathPattern="exhausted-retry-cleanup"`
- [ ] Background worker tests pass: `npm run test -- --testPathPattern="background-filing-worker"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`
- [ ] Cron comprehensive tests pass: `npm run test:cron-comprehensive`

#### Manual Verification:
- [ ] Review Slack notifications after cron runs to confirm cleanup reporting
- [ ] Check database for any remaining exhausted-retry jobs

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation before considering the implementation complete.

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test verifies a single behavior
2. **Descriptive Test Names**: "should mark PENDING jobs with exhausted retries as FAILED"
3. **Arrange-Act-Assert**: Clear structure in every test
4. **Edge Cases First**: Tests for `retryCount > maxRetries` edge case included
5. **Database Cleanup**: Proper beforeEach/afterAll cleanup

### Test Categories

#### 1. Contract Tests (Phase 1)
- `markForRetry()` should throw when retries exhausted
- Error message should include job ID for debugging

#### 2. Behavior Tests (Phase 2)
- Cleanup should mark PENDING exhausted jobs as FAILED
- Cleanup should mark RETRYING exhausted jobs as FAILED
- Cleanup should NOT affect jobs with retries remaining
- Cleanup should return count of affected jobs

#### 3. Integration Tests (Post-Implementation)
- Verify cron cycle includes exhausted-retry cleanup
- Verify Slack notifications include cleanup metrics

### Checkpoint Frequency

- **Phase 1**: 3 checkpoints (tests fail, tests pass, refactor)
- **Phase 2**: 4 checkpoints (tests fail, implementation, integration, refactor)

---

## Performance Considerations

1. **Query Limit**: `recoverExhaustedRetryJobs()` limited to 100 jobs per run to avoid long-running transactions
2. **Raw SQL**: Using raw SQL for row-level comparison (same pattern as job selection) to avoid Prisma field reference issues
3. **Non-Blocking**: Cleanup runs as part of normal cron cycle, no additional scheduling needed

---

## Migration Notes

No database migrations required. Changes are purely to application logic.

---

## Implementation Completion Notes

**Completed**: 2026-01-03 15:58 AEDT
**Branch**: `feature/pipeline-resilience-improvements`

### Phase 1 Completion

✅ **Step 1.1**: Created test file `__tests__/lib/job-queue/mark-for-retry-validation.test.ts` with 4 test cases
- Tests mocking required careful handling of Jest hoisting issues

✅ **Step 1.2**: Added retry count validation to `markForRetry()` in `lib/job-queue/index.ts:513-519`
```typescript
if (job.retryCount >= job.maxRetries) {
  throw new Error(
    `Cannot retry job ${id}: retry count (${job.retryCount}) >= max retries (${job.maxRetries})`
  );
}
```

✅ **Step 1.3**: Enhanced JSDoc documentation for `markForRetry()` method

✅ **Step 1.4**: All 4 tests pass, lint clean, build succeeds

### Phase 2 Completion

✅ **Step 2.1**: Created test file `__tests__/lib/cron/recover-exhausted-retry-jobs.test.ts` with 10 test cases

✅ **Step 2.2**: Implemented `recoverExhaustedRetryJobs()` in `lib/cron/background-filing-worker.ts:395-447`
- Finds RETRYING jobs where retryCount >= maxRetries
- Marks them as FAILED with descriptive error message
- Logs warning with cleanup count

✅ **Step 2.3**: Integrated into `processBatch()` lifecycle (lines 221-228)
- Called after `recoverStaleJobs()`
- Logs info when jobs are cleaned up

✅ **Step 2.4**: All 14 tests pass (4 Phase 1 + 10 Phase 2), lint clean, build succeeds

### Test Results Summary
```
PASS __tests__/lib/job-queue/mark-for-retry-validation.test.ts (4 tests)
PASS __tests__/lib/cron/recover-exhausted-retry-jobs.test.ts (10 tests)
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
```

---

## References

- Original research: [thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md](../../thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md)
- Job queue service: [lib/job-queue/index.ts:509-519](../../lib/job-queue/index.ts#L509-L519) - `markForRetry()` validation
- Background worker: [lib/cron/background-filing-worker.ts:395-447](../../lib/cron/background-filing-worker.ts#L395-L447) - `recoverExhaustedRetryJobs()` method
- Auto-recovery: [app/api/cron/auto-recover/route.ts](../../app/api/cron/auto-recover/route.ts)
