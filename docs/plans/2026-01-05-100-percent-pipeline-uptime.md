# 100% Pipeline Uptime Implementation Plan

**Date**: 2026-01-05 12:46:03 AEDT
**Git Commit**: eb9ba11cf5848aa674f14bf55d13c1cf9f296a18
**Branch**: feature/dashboard-redesign-inline-ticker
**Repository**: tldrsec-ai

## Overview

This plan addresses all identified vulnerabilities preventing 100% pipeline uptime with zero job backlog accumulation. The analysis revealed **14 critical gaps** across 6 system components that allowed a 41-hour pipeline stall (Jan 3-5, 2026) to go undetected.

## Current State Analysis

### The 41-Hour Stall Root Causes

1. **RETRYING jobs with exhausted retries** - Jobs stuck in `RETRYING` status with `retryCount >= maxRetries` were invisible to both job selection queries AND health monitoring
2. **Auto-recovery blind spots** - Only detected stale locks and completion time gaps, not invalid job states
3. **No Cloudflare Worker backup** - `/api/cron/process-filing-queue` is NOT in vercel.json, so if Cloudflare fails, NO jobs process
4. **Worker-only recovery** - `recoverExhaustedRetryJobs()` only runs when worker processes batches, not via health checks

### Key Discoveries

| Component | Current State | Gap |
|-----------|--------------|-----|
| **Vercel Cron** | Only `/api/cron/tier-aware` at Mon-Fri 9 AM UTC | No 24/7 redundancy for queue processing |
| **Cloudflare Worker** | Sole trigger for ALL queue processing | Single point of failure |
| **Health Check** | Counts RETRYING jobs but doesn't validate retry counts | Exhausted jobs invisible |
| **Auto-Recovery** | Only acts on stale locks + CRITICAL (180+ min stall) | DEGRADED state ignored for hours |
| **Job Queue** | Selection query filters `retryCount < maxRetries` | Jobs with exhausted retries stuck forever |
| **Distributed Locks** | Auto-renewal with no absolute max hold time | Hung process can hold lock indefinitely |

## Desired End State

After implementation, the pipeline will:

1. **Detect within 5 minutes** any condition that could stall the pipeline
2. **Auto-remediate within 15 minutes** without human intervention
3. **Never accumulate backlog** - jobs either complete or fail, never stuck indefinitely
4. **Have redundant triggers** - Vercel cron backs up Cloudflare Worker
5. **Alert immediately** on any anomaly via Slack

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pipeline uptime | 100% | No gaps > 5 minutes in job completions |
| Max stall detection time | 5 minutes | Time from stall to alert |
| Max auto-recovery time | 15 minutes | Time from stall to automatic resolution |
| Job backlog | 0 growth | PENDING count stable or decreasing |
| Stuck job count | 0 | No jobs in invalid states |

### Verification Commands

```bash
# Daily verification that pipeline is healthy
npm run verify:daily

# Check for stuck jobs (should return 0)
npm run test:pipeline:comprehensive

# Verify health endpoint detects all issues
curl https://tldrsec.app/api/health/pipeline | jq '.status'
# Expected: "HEALTHY" or immediate alert if not
```

## What We're NOT Doing

1. **Multi-region deployment** - Overkill for current scale, adds complexity
2. **Redis for distributed state** - In-memory fallback is sufficient
3. **Custom monitoring service** - Existing health endpoints + Cloudflare sufficient
4. **Database sharding** - Single Neon/Supabase instance is adequate
5. **Kubernetes/container orchestration** - Vercel serverless is appropriate

## Implementation Approach

Applying Elon's 5-Step Engineering Algorithm:

1. **Question requirements** - Do we need 100% uptime? Yes - 41-hour stall lost user trust
2. **Delete unnecessary complexity** - Remove unused legacy job types, simplify health checks
3. **Simplify** - Single source of truth for job validity, one health endpoint that checks everything
4. **Accelerate** - Add Vercel cron backup first (immediate protection)
5. **Automate** - Proactive cleanup runs automatically, not just on request

---

## Phase 1: Add Vercel Cron Redundancy (Immediate Protection)

### Overview
Add Vercel-native cron triggers for critical queue processing endpoints to eliminate Cloudflare Worker as single point of failure.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/api/cron/vercel-cron-redundancy.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Vercel Cron Redundancy', () => {
  describe('vercel.json configuration', () => {
    it('should have process-filing-queue cron for queue processing', async () => {
      const vercelConfig = await import('../../../vercel.json');
      const cronPaths = vercelConfig.crons.map((c: any) => c.path);
      expect(cronPaths).toContain('/api/cron/process-filing-queue');
    });

    it('should have auto-recover cron as backup', async () => {
      const vercelConfig = await import('../../../vercel.json');
      const cronPaths = vercelConfig.crons.map((c: any) => c.path);
      expect(cronPaths).toContain('/api/cron/auto-recover');
    });

    it('should run process-filing-queue every 10 minutes', async () => {
      const vercelConfig = await import('../../../vercel.json');
      const queueCron = vercelConfig.crons.find((c: any) =>
        c.path === '/api/cron/process-filing-queue'
      );
      expect(queueCron.schedule).toBe('*/10 * * * *');
    });
  });

  describe('process-filing-queue endpoint', () => {
    it('should accept Vercel cron header as valid auth', async () => {
      // Test that x-vercel-cron-signature header is accepted
    });

    it('should process all job types when no jobTypes param', async () => {
      // Test default behavior processes discovery, fetch, summarize
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="vercel-cron-redundancy"
# Expected: 4 failing tests (config not updated, auth not implemented)
```

### Step 1.2: Implement Vercel Cron Configuration

#### 1.2.1 Update vercel.json
**File**: `vercel.json`
**Changes**: Add redundant cron entries

```json
{
  "crons": [
    {
      "path": "/api/cron/tier-aware",
      "schedule": "0 9 * * 1,2,3,4,5"
    },
    {
      "path": "/api/cron/process-filing-queue",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/cron/auto-recover",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Checkpoint 1.2.1**: Verify config is valid JSON:
```bash
cat vercel.json | jq .crons
# Expected: Array with 3 cron entries
```

#### 1.2.2 Update Auth Service for Vercel Cron
**File**: `lib/cron/auth-service.ts`
**Changes**: Accept Vercel-native cron header

```typescript
// Add to validateCronRequest():
// Check for Vercel's internal cron header (set automatically by Vercel)
const vercelCronHeader = request.headers.get('x-vercel-cron');
if (vercelCronHeader === '1') {
  // Vercel cron trigger - trusted source
  return { isValid: true, source: 'vercel-cron' };
}
```

**Checkpoint 1.2.2**: Auth service accepts Vercel header:
```bash
npm run test -- --testPathPattern="auth-service" --testNamePattern="vercel"
# Expected: 1 passing
```

#### 1.2.3 Update process-filing-queue for Default Job Types
**File**: `app/api/cron/process-filing-queue/route.ts`
**Changes**: Process all job types when called without parameters

```typescript
// At line ~170, change validation to:
const jobTypesParam = searchParams.get('jobTypes');
const jobTypes = jobTypesParam
  ? jobTypesParam.split(',').map(t => t.trim().toUpperCase())
  : ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'];
```

**Checkpoint 1.2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="vercel-cron-redundancy"
# Expected: 4 passing
```

### Step 1.3: Refactor

- [ ] Add JSDoc explaining Vercel cron backup purpose
- [ ] Add logging to distinguish Vercel vs Cloudflare triggers
- [ ] Update CLAUDE.md with new cron configuration

**Checkpoint 1.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="vercel-cron-redundancy"
# Expected: 4 passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="vercel-cron-redundancy"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] vercel.json is valid: `cat vercel.json | jq .`

#### Manual Verification:
- [ ] Deploy to Vercel preview
- [ ] Check Vercel dashboard shows new cron schedules
- [ ] Verify first Vercel cron execution in logs
- [ ] Confirm Cloudflare Worker still works alongside Vercel crons

**STOP**: After completing this phase and all verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Enhanced Health Check - Detect All Stuck Job States

### Overview
Upgrade `/api/health/pipeline` to detect ALL conditions that can stall the pipeline, including the RETRYING jobs with exhausted retries that caused the 41-hour stall.

### Step 2.1: Write Failing Tests

**Test File**: `__tests__/api/health/pipeline-exhaustive-detection.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';

describe('Pipeline Health - Exhaustive Detection', () => {
  describe('RETRYING jobs with exhausted retries', () => {
    beforeEach(async () => {
      // Create stuck RETRYING job
      await prisma.jobQueue.create({
        data: {
          jobType: 'ASYNC_FETCH_FILING',
          status: 'RETRYING',
          retryCount: 3,
          maxRetries: 3,
          scheduledFor: new Date(),
          payload: {},
        },
      });
    });

    afterEach(async () => {
      await prisma.jobQueue.deleteMany({ where: { status: 'RETRYING' } });
    });

    it('should detect RETRYING jobs with exhausted retries as CRITICAL', async () => {
      const response = await fetch('/api/health/pipeline');
      const data = await response.json();

      expect(data.status).toBe('CRITICAL');
      expect(data.issues).toContain('RETRYING jobs with exhausted retries detected');
    });

    it('should include exhausted retry count in metrics', async () => {
      const response = await fetch('/api/health/pipeline');
      const data = await response.json();

      expect(data.jobs.exhaustedRetrying).toBeGreaterThan(0);
    });
  });

  describe('PROCESSING jobs older than timeout', () => {
    beforeEach(async () => {
      await prisma.jobQueue.create({
        data: {
          jobType: 'ASYNC_SUMMARIZE_CACHED',
          status: 'PROCESSING',
          startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
          scheduledFor: new Date(Date.now() - 35 * 60 * 1000),
          payload: {},
        },
      });
    });

    it('should detect PROCESSING jobs older than 15 minutes as WARNING', async () => {
      const response = await fetch('/api/health/pipeline');
      const data = await response.json();

      expect(data.status).toMatch(/WARNING|CRITICAL/);
      expect(data.issues).toContain('PROCESSING jobs stuck for >15 minutes');
    });
  });

  describe('Invalid job types', () => {
    beforeEach(async () => {
      await prisma.jobQueue.create({
        data: {
          jobType: 'filing_fetch', // Legacy invalid type
          status: 'PENDING',
          scheduledFor: new Date(),
          payload: {},
        },
      });
    });

    it('should detect jobs with invalid job types as CRITICAL', async () => {
      const response = await fetch('/api/health/pipeline');
      const data = await response.json();

      expect(data.status).toBe('CRITICAL');
      expect(data.issues).toContain('Jobs with invalid/unknown job types detected');
    });
  });

  describe('PENDING jobs approaching max retries', () => {
    beforeEach(async () => {
      await prisma.jobQueue.create({
        data: {
          jobType: 'ASYNC_FETCH_FILING',
          status: 'PENDING',
          retryCount: 2, // 1 away from max
          maxRetries: 3,
          scheduledFor: new Date(),
          payload: {},
        },
      });
    });

    it('should warn about PENDING jobs with high retry counts', async () => {
      const response = await fetch('/api/health/pipeline');
      const data = await response.json();

      expect(data.warnings).toContain('Jobs approaching max retry limit');
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="pipeline-exhaustive-detection"
# Expected: 5 failing tests (health check doesn't detect these conditions)
```

### Step 2.2: Implement Enhanced Health Detection

#### 2.2.1 Add Exhausted Retry Detection
**File**: `app/api/health/pipeline/route.ts`
**Changes**: Add query for exhausted RETRYING jobs after line ~160

```typescript
// After existing RETRYING count query, add:
const exhaustedRetryingCount = await prisma.$queryRaw<{count: bigint}[]>`
  SELECT COUNT(*) as count
  FROM pipeline."JobQueue"
  WHERE "status" = 'RETRYING'
    AND "retryCount" >= "maxRetries"
`;
const exhaustedRetrying = Number(exhaustedRetryingCount[0]?.count || 0);

if (exhaustedRetrying > 0) {
  issues.push(`RETRYING jobs with exhausted retries detected: ${exhaustedRetrying}`);
  recommendations.push('Run: npm run verify:daily -- --force-cleanup');
}
```

**Checkpoint 2.2.1**: First test passes:
```bash
npm run test -- --testPathPattern="pipeline-exhaustive-detection" --testNamePattern="exhausted"
# Expected: 2 passing
```

#### 2.2.2 Add Stale PROCESSING Detection
**File**: `app/api/health/pipeline/route.ts`
**Changes**: Add query for old PROCESSING jobs

```typescript
const STALE_PROCESSING_MINUTES = 15;
const staleProcessingCount = await prisma.jobQueue.count({
  where: {
    status: 'PROCESSING',
    startedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000) }
  }
});

if (staleProcessingCount > 0) {
  issues.push(`PROCESSING jobs stuck for >${STALE_PROCESSING_MINUTES} minutes: ${staleProcessingCount}`);
  recommendations.push('Check for crashed workers or hung processes');
}
```

**Checkpoint 2.2.2**: Third test passes:
```bash
npm run test -- --testPathPattern="pipeline-exhaustive-detection" --testNamePattern="PROCESSING"
# Expected: 1 passing
```

#### 2.2.3 Add Invalid Job Type Detection
**File**: `app/api/health/pipeline/route.ts`
**Changes**: Add query for invalid job types

```typescript
const VALID_JOB_TYPES = [
  'ASYNC_DISCOVER_FILINGS',
  'ASYNC_FETCH_FILING',
  'ASYNC_SUMMARIZE_CACHED'
];

const invalidTypeCount = await prisma.jobQueue.count({
  where: {
    status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] },
    jobType: { notIn: VALID_JOB_TYPES }
  }
});

if (invalidTypeCount > 0) {
  issues.push(`Jobs with invalid/unknown job types detected: ${invalidTypeCount}`);
  recommendations.push('Clean up legacy job types with invalid type names');
}
```

**Checkpoint 2.2.3**: Fourth test passes:
```bash
npm run test -- --testPathPattern="pipeline-exhaustive-detection" --testNamePattern="invalid"
# Expected: 1 passing
```

#### 2.2.4 Update Status Determination Logic
**File**: `app/api/health/pipeline/route.ts`
**Changes**: Update status logic to include new conditions

```typescript
// Replace existing status logic (~line 209-218):
let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR' = 'HEALTHY';

// CRITICAL conditions
if (
  lockMetrics.healthStatus === 'CRITICAL' ||
  (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 180) ||
  exhaustedRetrying > 0 ||  // NEW
  invalidTypeCount > 0      // NEW
) {
  status = 'CRITICAL';
}
// DEGRADED conditions
else if (
  lockMetrics.healthStatus === 'WARNING' ||
  issues.length > 0 ||
  (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 60) ||
  staleProcessingCount > 0  // NEW
) {
  status = 'DEGRADED';
}
```

**Checkpoint 2.2.4**: All tests pass:
```bash
npm run test -- --testPathPattern="pipeline-exhaustive-detection"
# Expected: 5 passing
```

### Step 2.3: Refactor

- [ ] Extract magic numbers to named constants at top of file
- [ ] Add JSDoc for each new detection type
- [ ] Add metrics to response for dashboard visualization

**Checkpoint 2.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="pipeline-exhaustive-detection"
# Expected: 5 passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="pipeline-exhaustive-detection"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Create test job in RETRYING with exhausted retries via Prisma Studio
- [ ] Hit `/api/health/pipeline` and verify CRITICAL status
- [ ] Delete test job and verify HEALTHY status returns

**STOP**: After completing this phase and all verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Proactive Auto-Recovery - Act on DEGRADED, Not Just CRITICAL

### Overview
Upgrade `/api/cron/auto-recover` to take action on DEGRADED status (not just CRITICAL) and add proactive cleanup of stuck jobs.

### Step 3.1: Write Failing Tests

**Test File**: `__tests__/api/cron/auto-recover-proactive.test.ts`

```typescript
describe('Proactive Auto-Recovery', () => {
  describe('DEGRADED status handling', () => {
    it('should trigger cleanup on DEGRADED after 30 minutes', async () => {
      // Mock health returning DEGRADED for 30+ minutes
      // Expect cleanup action
    });

    it('should NOT trigger cleanup on first DEGRADED detection', async () => {
      // First detection should be monitoring only
    });

    it('should track consecutive DEGRADED count', async () => {
      // State should persist degraded counter
    });
  });

  describe('Exhausted retry job cleanup', () => {
    it('should clean exhausted RETRYING jobs as part of recovery', async () => {
      // Create exhausted jobs, trigger recovery, verify cleanup
    });

    it('should log count of cleaned exhausted jobs', async () => {
      // Verify logging for visibility
    });
  });

  describe('Invalid job type cleanup', () => {
    it('should mark invalid job type jobs as FAILED', async () => {
      // Create invalid type job, trigger recovery, verify FAILED
    });
  });
});
```

**Checkpoint 3.1**: Tests fail as expected:
```bash
npm run test -- --testPathPattern="auto-recover-proactive"
# Expected: 6 failing tests
```

### Step 3.2: Implement Proactive Recovery

#### 3.2.1 Add DEGRADED Counter and Threshold
**File**: `app/api/cron/auto-recover/route.ts`
**Changes**: Track consecutive DEGRADED states

```typescript
// Add to recoveryState interface:
interface RecoveryState {
  // ... existing fields
  consecutiveDegraded: number;
  lastDegradedTime: number | null;
}

// Add constant:
const DEGRADED_ACTION_THRESHOLD = 6; // 6 checks * 5 min = 30 min of degraded

// In decision logic, add handling for DEGRADED:
else if (health.status === 'DEGRADED') {
  recoveryState.consecutiveDegraded++;

  if (recoveryState.consecutiveDegraded >= DEGRADED_ACTION_THRESHOLD) {
    // Trigger proactive cleanup after 30 min of degraded
    action = 'proactive-cleanup';
    reason = `Pipeline degraded for ${recoveryState.consecutiveDegraded * 5} minutes`;
    await triggerProactiveCleanup();
    recoveryState.consecutiveDegraded = 0;
  } else {
    action = 'monitoring';
    reason = `Pipeline degraded (${recoveryState.consecutiveDegraded}/${DEGRADED_ACTION_THRESHOLD} checks)`;
  }
}
```

**Checkpoint 3.2.1**: First 3 tests pass:
```bash
npm run test -- --testPathPattern="auto-recover-proactive" --testNamePattern="DEGRADED"
# Expected: 3 passing
```

#### 3.2.2 Add Exhausted Job Cleanup Function
**File**: `app/api/cron/auto-recover/route.ts`
**Changes**: Add cleanup function

```typescript
async function cleanupExhaustedRetryJobs(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE pipeline."JobQueue"
    SET
      status = 'FAILED',
      "failedAt" = NOW(),
      "lastError" = 'Auto-recovery: Exhausted retry jobs cleaned up'
    WHERE status = 'RETRYING'
      AND "retryCount" >= "maxRetries"
  `;
  return result;
}
```

**Checkpoint 3.2.2**: Next 2 tests pass:
```bash
npm run test -- --testPathPattern="auto-recover-proactive" --testNamePattern="exhausted"
# Expected: 2 passing
```

#### 3.2.3 Add Invalid Job Type Cleanup
**File**: `app/api/cron/auto-recover/route.ts`
**Changes**: Add invalid type cleanup

```typescript
const VALID_JOB_TYPES = [
  'ASYNC_DISCOVER_FILINGS',
  'ASYNC_FETCH_FILING',
  'ASYNC_SUMMARIZE_CACHED'
];

async function cleanupInvalidJobTypes(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE pipeline."JobQueue"
    SET
      status = 'FAILED',
      "failedAt" = NOW(),
      "lastError" = 'Auto-recovery: Invalid job type - no handler exists'
    WHERE status IN ('PENDING', 'RETRYING')
      AND "jobType" NOT IN (${Prisma.join(VALID_JOB_TYPES)})
  `;
  return result;
}
```

**Checkpoint 3.2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="auto-recover-proactive"
# Expected: 6 passing
```

### Step 3.3: Refactor

- [ ] Extract cleanup functions to shared utility
- [ ] Add Slack notification for proactive cleanup actions
- [ ] Add metrics for cleanup counts

**Checkpoint 3.3**: Tests still pass after refactoring.

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] No regressions

#### Manual Verification:
- [ ] Create degraded condition (e.g., old pending jobs)
- [ ] Wait for 6 auto-recovery cycles (30 min simulated or real)
- [ ] Verify proactive cleanup triggers
- [ ] Check Slack notification received

**STOP**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Maximum Lock Hold Time Enforcement

### Overview
Add absolute maximum lock hold time to prevent hung processes from blocking the pipeline indefinitely.

### Step 4.1: Write Failing Tests

**Test File**: `__tests__/lib/db/distributed-lock-max-hold.test.ts`

```typescript
describe('Distributed Lock Maximum Hold Time', () => {
  it('should enforce absolute max hold time of 30 minutes', async () => {
    const lock = await DistributedLockManager.acquireLock('test', 'test-1', {
      ttl: 60 * 60 * 1000, // Request 1 hour TTL
    });

    // TTL should be capped at 30 minutes
    expect(lock.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 30 * 60 * 1000
    );
  });

  it('should stop renewal after max hold time reached', async () => {
    // Create lock, advance time past max hold
    // Verify renewal stops and lock expires
  });

  it('should include absoluteExpiresAt in lock context', async () => {
    const lock = await DistributedLockManager.acquireLock('test', 'test-1');
    expect(lock.context.absoluteExpiresAt).toBeDefined();
  });
});
```

**Checkpoint 4.1**: Tests fail (max hold time not implemented):
```bash
npm run test -- --testPathPattern="distributed-lock-max-hold"
# Expected: 3 failing tests
```

### Step 4.2: Implement Maximum Hold Time

#### 4.2.1 Add Max Hold Time Constant
**File**: `lib/db/distributed-lock.ts`
**Changes**: Add constant and validation

```typescript
const MAX_ABSOLUTE_HOLD_TIME_MS = 30 * 60 * 1000; // 30 minutes absolute max

// In acquireLock(), cap TTL:
const effectiveTtl = Math.min(options.ttl || this.defaultTtl, MAX_ABSOLUTE_HOLD_TIME_MS);
const absoluteExpiresAt = new Date(Date.now() + MAX_ABSOLUTE_HOLD_TIME_MS);
```

#### 4.2.2 Stop Renewal at Absolute Expiry
**File**: `lib/db/distributed-lock.ts`
**Changes**: Check absolute expiry in renewal

```typescript
// In setupAutoRenewal(), add check:
if (Date.now() >= lockContext.absoluteExpiresAt.getTime()) {
  workerLogger.warn('Lock reached absolute max hold time, not renewing');
  clearTimeout(lockContext.renewalTimer);
  return;
}
```

**Checkpoint 4.2.2**: All tests pass:
```bash
npm run test -- --testPathPattern="distributed-lock-max-hold"
# Expected: 3 passing
```

### Step 4.3: Refactor

- [ ] Add logging when lock TTL is capped
- [ ] Add metric for locks approaching max hold time

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Type checking passes
- [ ] Lock service integration tests pass

#### Manual Verification:
- [ ] Create long-running lock via test script
- [ ] Verify renewal stops at 30 minutes
- [ ] Verify lock released automatically

**STOP**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Comprehensive E2E Pipeline Health Test

### Overview
Create an E2E test that validates the entire pipeline can recover from any stuck state automatically.

### Step 5.1: Write E2E Test Suite

**Test File**: `__tests__/e2e/pipeline-auto-recovery.test.ts`

```typescript
describe('E2E Pipeline Auto-Recovery', () => {
  beforeAll(async () => {
    // Clean slate - no stuck jobs
    await cleanupAllStuckJobs();
  });

  describe('Scenario: RETRYING jobs with exhausted retries', () => {
    it('should detect and clean up within 15 minutes', async () => {
      // 1. Create stuck jobs
      await createExhaustedRetryingJobs(5);

      // 2. Verify health is CRITICAL
      const healthBefore = await getHealthStatus();
      expect(healthBefore.status).toBe('CRITICAL');

      // 3. Trigger auto-recovery
      await triggerAutoRecovery();

      // 4. Verify jobs cleaned up
      const stuckJobs = await getExhaustedRetryingJobs();
      expect(stuckJobs.length).toBe(0);

      // 5. Verify health is HEALTHY
      const healthAfter = await getHealthStatus();
      expect(healthAfter.status).toBe('HEALTHY');
    });
  });

  describe('Scenario: Invalid job types', () => {
    it('should detect and mark as FAILED within 15 minutes', async () => {
      // Similar pattern
    });
  });

  describe('Scenario: Stuck PROCESSING jobs', () => {
    it('should detect and recover within 15 minutes', async () => {
      // Similar pattern
    });
  });

  describe('Scenario: Stale locks', () => {
    it('should clean up stale locks automatically', async () => {
      // Similar pattern
    });
  });
});
```

**Checkpoint 5.1**: Create test file and verify structure.

### Step 5.2: Implement Test Utilities

**File**: `__tests__/e2e/utils/pipeline-test-helpers.ts`

```typescript
export async function createExhaustedRetryingJobs(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await prisma.jobQueue.create({
      data: {
        jobType: 'ASYNC_FETCH_FILING',
        status: 'RETRYING',
        retryCount: 3,
        maxRetries: 3,
        scheduledFor: new Date(),
        payload: { test: true },
      },
    });
  }
}

export async function getHealthStatus(): Promise<{ status: string }> {
  const response = await fetch(`${process.env.PUBLIC_URL}/api/health/pipeline`);
  return response.json();
}

export async function triggerAutoRecovery(): Promise<void> {
  await fetch(`${process.env.PUBLIC_URL}/api/cron/auto-recover`, {
    method: 'GET',
    headers: { 'x-vercel-cron': '1' },
  });
}
```

### Step 5.3: Final Phase Verification

#### Automated Verification:
- [ ] E2E tests pass: `npm run test:e2e:pipeline-recovery`

#### Manual Verification:
- [ ] Run E2E test against staging environment
- [ ] Verify all scenarios complete successfully
- [ ] Check Slack alerts were sent for detected issues

**STOP**: Pause for manual confirmation before Phase 6.

---

## Phase 6: Documentation and Runbook

### Overview
Document all recovery procedures and update monitoring dashboards.

### Step 6.1: Create Operations Runbook

**File**: `docs/operations/pipeline-recovery-runbook.md`

Contents:
1. Health check interpretation guide
2. Manual recovery procedures
3. Escalation paths
4. Common failure patterns and solutions

### Step 6.2: Update Monitoring Dashboard

**File**: `components/dashboard/pipeline-health-panel.tsx`

Add visualization for:
- Exhausted retry job count
- Invalid job type count
- Stale PROCESSING job count
- Time since last successful completion

### Step 6.3: Final Phase Verification

#### Automated Verification:
- [ ] Documentation renders correctly
- [ ] Dashboard component has no TypeScript errors

#### Manual Verification:
- [ ] Runbook reviewed by team member
- [ ] Dashboard shows correct metrics in staging

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **Contract Tests First**: Each phase starts with tests defining expected behavior
2. **Edge Cases**: Exhausted retries, invalid types, stale processing all tested
3. **Integration Tests**: E2E test validates full recovery flow
4. **Regression Prevention**: All scenarios from 41-hour stall are now tested

### Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `__tests__/lib/` | Individual function behavior |
| API | `__tests__/api/` | Endpoint response validation |
| Integration | `__tests__/integration/` | Component interaction |
| E2E | `__tests__/e2e/` | Full pipeline recovery |

### Checkpoint Frequency

- **Minimum 3 checkpoints per phase**: Red, Green, Refactor
- **Each database query change**: Verify query works
- **Each status change**: Verify correct status returned

### Manual Testing Steps

1. Create stuck jobs via Prisma Studio
2. Verify health endpoint detects issue
3. Trigger auto-recovery
4. Verify cleanup occurred
5. Check Slack notification

---

## Performance Considerations

### Query Optimization

All new queries use raw SQL with proper indexes:
- `JobQueue.status` - Already indexed
- `JobQueue.retryCount` - Add index if missing
- `JobQueue.jobType` - Already indexed

### Rate Limiting

Vercel crons run every 10-15 minutes, well within rate limits:
- Vercel: No cron rate limits for Pro plan
- Cloudflare: 30 requests/minute limit respected

### Resource Usage

New queries add minimal overhead:
- ~5ms per health check (3 additional COUNT queries)
- ~10ms per auto-recovery (UPDATE queries)

---

## Migration Notes

### Database Changes

None required - all changes are application-level.

### Environment Variables

No new environment variables required.

### Rollback Plan

If issues arise:
1. Revert vercel.json to remove new crons
2. Revert health check changes
3. Previous behavior restored immediately

---

## References

- **Incident Analysis**: `thoughts/shared/research/2026-01-05-database-connection-pipeline-uptime.md`
- **Pipeline Stall Fix**: `thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md`
- **Job Failure Strategy**: `thoughts/shared/research/2026-01-03-job-failure-analysis-sub-001-percent-strategy.md`
- **Infrastructure Uptime**: `thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md`

---

## Summary of Changes

| Phase | Change | Files Modified |
|-------|--------|----------------|
| 1 | Vercel cron redundancy | `vercel.json`, `lib/cron/auth-service.ts`, `app/api/cron/process-filing-queue/route.ts` |
| 2 | Enhanced health detection | `app/api/health/pipeline/route.ts` |
| 3 | Proactive auto-recovery | `app/api/cron/auto-recover/route.ts` |
| 4 | Max lock hold time | `lib/db/distributed-lock.ts` |
| 5 | E2E recovery test | `__tests__/e2e/pipeline-auto-recovery.test.ts` |
| 6 | Documentation | `docs/operations/pipeline-recovery-runbook.md` |
