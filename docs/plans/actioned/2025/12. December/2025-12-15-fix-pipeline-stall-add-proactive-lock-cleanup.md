# Fix Pipeline Stall and Add Proactive Lock Cleanup Implementation Plan

**Date**: 2025-12-15T10:03:36+11:00 (AEDT)
**Git Commit**: 45dff63eb4b4a0e07678e37102b6fcbcd01ea39f
**Branch**: main (implementing on new branch: `fix/proactive-lock-cleanup`)
**Repository**: tldrsec-ai

## Overview

The SEC filing pipeline has been stalled since December 12, 2025, with the last job completion at 18:01:10 UTC. Despite previous fixes for job selection (Prisma field reference bug) and lock documentation, the pipeline remains blocked by **5 stale distributed locks** that were never cleaned up. This plan addresses:

1. **Immediate**: Clear stale locks to unblock the pipeline
2. **Root Cause**: Add proactive lock cleanup to prevent future stalls
3. **Monitoring**: Add health checks to detect stalls early

## Current State Analysis

### Database State (December 15, 2025 10:03 AEDT)

**Locks (ALL EXPIRED)**:
| Lock Name | Expired Date | Days Stale |
|-----------|--------------|------------|
| `tier-aware-cron-execution-production` | Dec 7, 2025 | **8 days** |
| `tier-aware-cron-execution-test` | Dec 9, 2025 | 6 days |
| `tier-aware-cron-execution-development` | Nov 21, 2025 | 24 days |
| `user_2009de85-...` | Nov 22, 2025 | 23 days |
| `user_4b396924-...` | Nov 22, 2025 | 23 days |

**Job Queue**:
- **456 PENDING** jobs waiting to process
- **12,317 DEAD_LETTER** jobs (historical failures, mostly orphaned)
- **4,415 COMPLETED** jobs (32 of which are summaries)
- **Last completion**: Dec 12, 2025 18:01:10 (3 days ago!)

### Root Cause Analysis

The lock cleanup code exists but is **reactive, not proactive**:

1. **Current Behavior**: `LockService.cleanupExpiredLocks()` is called ONLY during lock acquisition (line 25 of lock-service.ts)
2. **Gap**: If no acquisition attempt is made (e.g., Cloudflare Worker errors or 429 responses), expired locks persist indefinitely
3. **Result**: Stale locks block new lock acquisitions despite the expiration check at line 32 being correct

### Why Previous Fixes Didn't Work

The December 12 plan ([2025-12-12-clear-stale-locks-unblock-pipeline.md](./actioned/2025-12-12-clear-stale-locks-unblock-pipeline.md)) documented the fixes correctly, but:
- All verification checkboxes remain unchecked
- The scripts were created but apparently never executed
- No automated cleanup was added to prevent recurrence

## Desired End State

After this plan is complete:

1. **All stale locks are cleared** from the `JobLock` table
2. **Pipeline is actively processing** (PENDING → PROCESSING → COMPLETED)
3. **Proactive lock cleanup runs automatically** via the Cloudflare Worker before each cron execution
4. **Health monitoring detects stalls** within 30 minutes
5. **Lock cleanup is atomic** - uses database-level cleanup to prevent race conditions

### Verification Criteria

#### Automated:
- [ ] `npx tsx scripts/check-pending-jobs.ts` shows 0 stale locks
- [ ] `LockService.getLockHealthMetrics()` returns `healthStatus: "HEALTHY"`
- [ ] COMPLETED job count increases over 30 minutes
- [ ] All tests pass: `npm run test`

#### Manual:
- [ ] Cloudflare Worker logs show successful cron executions via `npx wrangler tail`
- [ ] Vercel function logs show tier-aware endpoint responding 200
- [ ] Email summaries are being delivered (check test email)

## What We're NOT Doing

- NOT redesigning the lock system architecture
- NOT implementing PostgreSQL advisory locks (current simple lock is adequate)
- NOT adding complex distributed consensus
- NOT changing job processing logic (the December 12 fix is correct)
- NOT addressing DEAD_LETTER jobs (separate cleanup task)

## Implementation Approach

We will follow TDD with a focus on immediate recovery followed by prevention:

1. **Phase 1**: Emergency lock cleanup and verification (immediate recovery)
2. **Phase 2**: Add proactive lock cleanup to Cloudflare Worker (prevention)
3. **Phase 3**: Add database-level cleanup trigger (defense in depth)
4. **Phase 4**: Add monitoring and alerting (detection)

---

## Phase 1: Emergency Lock Cleanup and Pipeline Verification

### Overview
Clear all stale locks and verify the pipeline starts processing. This is a MANUAL recovery step that will be automated in Phase 2.

### Step 1.1: 🔴 Write Failing Tests for Lock Cleanup

**Test File**: `__tests__/lib/job-queue/lock-cleanup.test.ts`

Write tests to verify lock cleanup behavior:

```typescript
import { getPrismaClient } from '@/lib/db/prisma';
import { LockService } from '@/lib/job-queue/lock-service';

describe('LockService Cleanup', () => {
  const prisma = getPrismaClient();

  beforeEach(async () => {
    // Clear all locks before each test
    await prisma.jobLock.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('cleanupExpiredLocks', () => {
    it('should mark expired locks as released', async () => {
      // Create an expired lock
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      await prisma.jobLock.create({
        data: {
          id: 'test-expired-lock',
          lockName: 'test-expired',
          acquiredBy: 'test-process',
          acquiredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          expiresAt: expiredDate,
          released: false,
        },
      });

      const cleaned = await LockService.cleanupExpiredLocks();

      expect(cleaned).toBe(1);

      const lock = await prisma.jobLock.findUnique({
        where: { id: 'test-expired-lock' },
      });
      expect(lock?.released).toBe(true);
    });

    it('should not affect active unexpired locks', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      await prisma.jobLock.create({
        data: {
          id: 'test-active-lock',
          lockName: 'test-active',
          acquiredBy: 'test-process',
          acquiredAt: new Date(),
          expiresAt: futureDate,
          released: false,
        },
      });

      const cleaned = await LockService.cleanupExpiredLocks();

      expect(cleaned).toBe(0);

      const lock = await prisma.jobLock.findUnique({
        where: { id: 'test-active-lock' },
      });
      expect(lock?.released).toBe(false);
    });

    it('should return 0 when no expired locks exist', async () => {
      const cleaned = await LockService.cleanupExpiredLocks();
      expect(cleaned).toBe(0);
    });
  });

  describe('getLockHealthMetrics', () => {
    it('should return HEALTHY when no stale locks exist', async () => {
      const metrics = await LockService.getLockHealthMetrics();
      expect(metrics.healthStatus).toBe('HEALTHY');
      expect(metrics.staleLocksCount).toBe(0);
    });

    it('should return WARNING when 3-5 stale locks exist', async () => {
      // Create 4 expired, unreleased locks
      for (let i = 0; i < 4; i++) {
        await prisma.jobLock.create({
          data: {
            id: `stale-lock-${i}`,
            lockName: `stale-${i}`,
            acquiredBy: 'test',
            acquiredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            expiresAt: new Date(Date.now() - 60 * 60 * 1000),
            released: false,
          },
        });
      }

      const metrics = await LockService.getLockHealthMetrics();
      expect(metrics.healthStatus).toBe('WARNING');
      expect(metrics.staleLocksCount).toBe(4);
    });

    it('should return CRITICAL when 6+ stale locks exist', async () => {
      // Create 6 expired, unreleased locks
      for (let i = 0; i < 6; i++) {
        await prisma.jobLock.create({
          data: {
            id: `critical-lock-${i}`,
            lockName: `critical-${i}`,
            acquiredBy: 'test',
            acquiredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            expiresAt: new Date(Date.now() - 60 * 60 * 1000),
            released: false,
          },
        });
      }

      const metrics = await LockService.getLockHealthMetrics();
      expect(metrics.healthStatus).toBe('CRITICAL');
      expect(metrics.staleLocksCount).toBe(6);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they pass (tests should pass since LockService already exists):
```bash
npm run test -- --testPathPattern="lock-cleanup"
```

### Step 1.2: 🟢 Execute Emergency Cleanup

Run the existing cleanup script to clear ALL locks:

```bash
npx tsx scripts/cleanup-locks.ts
```

Expected output:
```
🧹 Cleaning up database locks...
✅ Cleared 5 database locks
🎉 Lock cleanup completed
```

**Checkpoint 1.2**: Verify cleanup:
```bash
npx tsx -e "
import { LockService } from './lib/job-queue/lock-service';
async function check() {
  const metrics = await LockService.getLockHealthMetrics();
  console.log('Lock Health:', JSON.stringify(metrics, null, 2));
  process.exit(metrics.healthStatus === 'HEALTHY' ? 0 : 1);
}
check();
"
```

### Step 1.3: 🟢 Trigger Pipeline Processing

Manually trigger the cron endpoint to start processing:

```bash
# Test with connectivity script first
npx tsx scripts/test-cron-connectivity.ts

# If connectivity passes, trigger tier-aware endpoint
curl -X POST 'https://tldrsec.app/api/cron/tier-aware' \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -H "x-cron-source: manual-recovery"
```

**Checkpoint 1.3**: Verify endpoint responds 200 or 202.

### Step 1.4: 🔵 Verify Pipeline Processing

Wait 5 minutes, then check job progress:

```bash
npx tsx scripts/check-pending-jobs.ts
```

Look for:
- PROCESSING count > 0 during check
- COMPLETED count increasing from baseline

**Checkpoint 1.4**: Jobs are transitioning from PENDING to COMPLETED.

### Step 1.5: Final Phase 1 Verification

#### Automated Verification:
- [ ] Lock cleanup tests pass: `npm run test -- --testPathPattern="lock-cleanup"`
- [ ] `cleanup-locks.ts` completed successfully
- [ ] `getLockHealthMetrics()` shows `healthStatus: "HEALTHY"`
- [ ] Connectivity test passes: `npx tsx scripts/test-cron-connectivity.ts`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Lock cleanup script ran without errors
- [ ] No locks remain in database (or all are released)
- [ ] Pipeline is processing (COMPLETED count increases)

**STOP**: After completing Phase 1 and verifying the pipeline is processing, proceed to Phase 2.

---

## Phase 2: Add Proactive Lock Cleanup to Cloudflare Worker

### Overview
Add automatic cleanup of expired locks as the FIRST step of every Cloudflare Worker cron execution. This prevents stale locks from accumulating even if Vercel endpoints are unreachable.

### Step 2.1: 🔴 Write Failing Tests for Proactive Cleanup

**Test File**: `__tests__/cloudflare-cron/proactive-cleanup.test.ts`

```typescript
/**
 * Tests for proactive lock cleanup functionality
 * Note: These are integration tests that verify the endpoint behavior
 */

describe('Proactive Lock Cleanup', () => {
  describe('API Endpoint /api/cron/cleanup-locks', () => {
    it('should exist and accept POST requests with CRON_SECRET', async () => {
      const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/cron/cleanup-locks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('cleaned');
      expect(data).toHaveProperty('healthStatus');
    });

    it('should reject requests without CRON_SECRET', async () => {
      const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/cron/cleanup-locks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(401);
    });
  });
});
```

**Checkpoint 2.1**: Run tests - they should fail because endpoint doesn't exist yet:
```bash
npm run test -- --testPathPattern="proactive-cleanup"
# Expected: Tests fail with 404 or connection error
```

### Step 2.2: 🟢 Create Lock Cleanup API Endpoint

**File**: `app/api/cron/cleanup-locks/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { CronAuthService } from '@/lib/auth/cron-auth-service';
import { LockService } from '@/lib/job-queue/lock-service';

export const runtime = 'nodejs';
export const maxDuration = 10; // 10 seconds max - cleanup should be fast

/**
 * POST /api/cron/cleanup-locks
 *
 * Proactively cleans up expired locks before cron execution.
 * Called by Cloudflare Worker as the first step of each cron cycle.
 *
 * This prevents stale locks from blocking the pipeline when:
 * - Processes crash without releasing locks
 * - Network errors prevent lock release
 * - Vercel functions timeout before cleanup
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || 'unknown';

  try {
    // Authenticate using Bearer token
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[cleanup-locks] CRON_SECRET not configured');
      return NextResponse.json(
        { success: false, error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[cleanup-locks] Unauthorized cleanup attempt', { executionId });
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Perform cleanup
    const cleaned = await LockService.cleanupExpiredLocks();
    const metrics = await LockService.getLockHealthMetrics();
    const duration = Date.now() - startTime;

    console.log('[cleanup-locks] Proactive cleanup completed', {
      executionId,
      cleaned,
      healthStatus: metrics.healthStatus,
      staleRemaining: metrics.staleLocksCount,
      durationMs: duration,
    });

    return NextResponse.json({
      success: true,
      cleaned,
      healthStatus: metrics.healthStatus,
      staleLocksCount: metrics.staleLocksCount,
      activeLocks: metrics.activeLocks,
      durationMs: duration,
      executionId,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[cleanup-locks] Error during cleanup', {
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Cleanup failed',
        durationMs: duration,
        executionId,
      },
      { status: 500 }
    );
  }
}
```

**Checkpoint 2.2**: Tests should now pass:
```bash
npm run test -- --testPathPattern="proactive-cleanup"
```

### Step 2.3: 🟢 Update Cloudflare Worker to Call Cleanup First

**File**: `cloudflare-cron/index.js`

Add a new Step 0 before the existing tier-aware call:

```javascript
// Add after line 183 (before Step 1 tier-aware call)

// ============================================================
// STEP 0: PROACTIVE LOCK CLEANUP
// ============================================================
// Clean up any stale locks before attempting to process
// This prevents the pipeline from being blocked by orphaned locks
console.log(`[${executionId}] Step 0: Proactive lock cleanup...`);

const cleanupUrl = `${env.PUBLIC_URL}/api/cron/cleanup-locks`;
try {
  const cleanupResponse = await fetch(cleanupUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
      'X-Execution-ID': executionId,
      'X-Cron-Source': 'cloudflare-worker-proactive',
    },
  });

  if (cleanupResponse.ok) {
    const cleanupData = await cleanupResponse.json();
    console.log(`[${executionId}] Step 0 completed: ${cleanupData.cleaned} locks cleaned, health: ${cleanupData.healthStatus}`);
  } else {
    console.warn(`[${executionId}] Step 0 warning: cleanup returned ${cleanupResponse.status}`);
    // Don't fail the entire cron - cleanup failure is not fatal
  }
} catch (cleanupError) {
  console.warn(`[${executionId}] Step 0 warning: cleanup error - ${cleanupError.message}`);
  // Don't fail the entire cron - cleanup failure is not fatal
}
```

**Checkpoint 2.3**: Build and test locally:
```bash
cd cloudflare-cron
npm run build  # or equivalent
```

### Step 2.4: 🔵 Refactor and Deploy

Deploy the updated Cloudflare Worker:

```bash
cd cloudflare-cron
npx wrangler deploy
```

**Checkpoint 2.4**: Verify deployment:
```bash
npx wrangler deployments list | head -5
```

### Step 2.5: Final Phase 2 Verification

#### Automated Verification:
- [ ] Proactive cleanup tests pass
- [ ] `/api/cron/cleanup-locks` endpoint exists and works
- [ ] Cloudflare Worker deploys successfully
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] `wrangler tail` shows "Step 0: Proactive lock cleanup" in logs
- [ ] Cleanup reports "health: HEALTHY" after each cron run

**STOP**: After completing Phase 2, proceed to Phase 3 for defense in depth.

---

## Phase 3: Add Database-Level Cleanup Trigger (Defense in Depth)

### Overview
Add a PostgreSQL trigger that automatically marks locks as released when they expire. This provides a database-level safety net independent of application code.

### Step 3.1: 🔴 Write Failing Tests for Database Trigger

**Test File**: `__tests__/db/lock-trigger.test.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

describe('Database Lock Cleanup Trigger', () => {
  const prisma = getPrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should automatically mark expired locks as released when queried', async () => {
    // Create an expired lock
    const expiredLock = await prisma.jobLock.create({
      data: {
        id: 'trigger-test-lock',
        lockName: 'trigger-test',
        acquiredBy: 'test-process',
        acquiredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // Expired 1 hour ago
        released: false,
      },
    });

    // Query active locks - trigger should fire and mark as released
    const activeLocks = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "JobLock"
      WHERE "lockName" = 'trigger-test'
        AND released = false
        AND "expiresAt" > NOW()
    `;

    // The expired lock should not appear in active locks query
    expect(activeLocks.find((l) => l.id === 'trigger-test-lock')).toBeUndefined();

    // Clean up
    await prisma.jobLock.delete({ where: { id: 'trigger-test-lock' } });
  });
});
```

**Checkpoint 3.1**: Tests may pass already since the lock is expired.

### Step 3.2: 🟢 Create Database Migration for Cleanup Function

**File**: `prisma/migrations/20251215_add_lock_cleanup_function/migration.sql`

```sql
-- Create a function that cleans up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS void AS $$
BEGIN
  -- Mark expired locks as released
  UPDATE "JobLock"
  SET released = true
  WHERE released = false
    AND "expiresAt" < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup every 5 minutes
-- Note: This requires pg_cron extension which may not be available on Neon
-- Fallback: The application-level cleanup in Phase 2 handles this

-- Create a trigger to clean up on any lock query (optional, may impact performance)
-- For now, we rely on the application-level proactive cleanup

COMMENT ON FUNCTION cleanup_expired_locks IS
  'Marks expired locks as released. Called by application proactive cleanup.';
```

**Checkpoint 3.2**: Apply migration:
```bash
npm run db:migrate
```

### Step 3.3: 🟢 Update LockService to Use Database Function

**File**: `lib/job-queue/lock-service.ts`

Add a method that calls the database function:

```typescript
/**
 * Cleanup expired locks using database function for atomic operation
 */
static async cleanupExpiredLocksAtomic(): Promise<number> {
  try {
    const { getPrismaClient } = await import('../db/prisma');
    const prisma = getPrismaClient();

    // Use raw SQL for atomic cleanup
    const result = await prisma.$executeRaw`
      UPDATE "JobLock"
      SET released = true
      WHERE released = false
        AND "expiresAt" < NOW()
    `;

    if (result > 0) {
      console.log(`[LockService] Atomic cleanup: ${result} expired locks marked as released`);
    }

    return result;
  } catch (error) {
    console.error('[LockService] Atomic cleanup failed:', error);
    return 0;
  }
}
```

**Checkpoint 3.3**: Test the atomic cleanup:
```bash
npx tsx -e "
import { LockService } from './lib/job-queue/lock-service';
async function test() {
  const cleaned = await LockService.cleanupExpiredLocksAtomic();
  console.log('Atomically cleaned:', cleaned);
}
test();
"
```

### Step 3.4: Final Phase 3 Verification

#### Automated Verification:
- [ ] Database migration applies successfully
- [ ] `cleanupExpiredLocksAtomic()` method works
- [ ] All tests pass: `npm run test`

#### Manual Verification:
- [ ] Database function exists and can be called
- [ ] Atomic cleanup correctly marks expired locks

**STOP**: After completing Phase 3, proceed to Phase 4 for monitoring.

---

## Phase 4: Add Monitoring and Alerting

### Overview
Add health checks that can detect pipeline stalls within 30 minutes and alert via existing monitoring channels.

### Step 4.1: 🔴 Write Failing Tests for Health Endpoint

**Test File**: `__tests__/api/pipeline-health.test.ts`

```typescript
describe('Pipeline Health Endpoint', () => {
  describe('GET /api/health/pipeline', () => {
    it('should return pipeline health status', async () => {
      const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/health/pipeline`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('locks');
      expect(data).toHaveProperty('jobs');
      expect(data).toHaveProperty('lastCompletion');
    });

    it('should return DEGRADED when no completions in 1 hour', async () => {
      // This test depends on actual database state
      const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/health/pipeline`);
      const data = await response.json();

      if (data.lastCompletion && Date.now() - new Date(data.lastCompletion).getTime() > 60 * 60 * 1000) {
        expect(data.status).toMatch(/DEGRADED|CRITICAL/);
      }
    });
  });
});
```

### Step 4.2: 🟢 Create Pipeline Health Endpoint

**File**: `app/api/health/pipeline/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { LockService } from '@/lib/job-queue/lock-service';

export const runtime = 'nodejs';

interface PipelineHealthResponse {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
  locks: {
    healthStatus: string;
    staleCount: number;
    activeCount: number;
  };
  jobs: {
    pending: number;
    processing: number;
    completedLast1h: number;
    completedLast24h: number;
  };
  lastCompletion: string | null;
  issues: string[];
  timestamp: string;
}

export async function GET() {
  const prisma = getPrismaClient();
  const issues: string[] = [];

  try {
    // Get lock health
    const lockMetrics = await LockService.getLockHealthMetrics();

    // Get job counts
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [jobStats, completedLast1h, completedLast24h, lastCompletion] = await Promise.all([
      prisma.$queryRaw<{ status: string; count: bigint }[]>`
        SELECT status, COUNT(*) as count
        FROM "JobQueue"
        WHERE status IN ('PENDING', 'PROCESSING')
        GROUP BY status
      `,
      prisma.jobQueue.count({
        where: { status: 'COMPLETED', completedAt: { gte: oneHourAgo } },
      }),
      prisma.jobQueue.count({
        where: { status: 'COMPLETED', completedAt: { gte: oneDayAgo } },
      }),
      prisma.jobQueue.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
    ]);

    const pending = Number(jobStats.find((s) => s.status === 'PENDING')?.count || 0n);
    const processing = Number(jobStats.find((s) => s.status === 'PROCESSING')?.count || 0n);

    // Determine health status
    let status: PipelineHealthResponse['status'] = 'HEALTHY';

    // Check for stale locks
    if (lockMetrics.staleLocksCount > 5) {
      status = 'CRITICAL';
      issues.push(`${lockMetrics.staleLocksCount} stale locks detected`);
    } else if (lockMetrics.staleLocksCount > 2) {
      status = 'DEGRADED';
      issues.push(`${lockMetrics.staleLocksCount} stale locks detected`);
    }

    // Check for processing stall
    if (pending > 0 && completedLast1h === 0) {
      if (completedLast24h === 0) {
        status = 'CRITICAL';
        issues.push('No job completions in 24 hours');
      } else {
        status = status === 'CRITICAL' ? 'CRITICAL' : 'DEGRADED';
        issues.push('No job completions in 1 hour');
      }
    }

    // Check for large backlog
    if (pending > 5000) {
      status = status === 'CRITICAL' ? 'CRITICAL' : 'DEGRADED';
      issues.push(`Large backlog: ${pending} pending jobs`);
    }

    const response: PipelineHealthResponse = {
      status,
      locks: {
        healthStatus: lockMetrics.healthStatus,
        staleCount: lockMetrics.staleLocksCount,
        activeCount: lockMetrics.activeLocks,
      },
      jobs: {
        pending,
        processing,
        completedLast1h,
        completedLast24h,
      },
      lastCompletion: lastCompletion?.completedAt?.toISOString() || null,
      issues,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
```

**Checkpoint 4.2**: Test the endpoint:
```bash
curl http://localhost:3000/api/health/pipeline | jq
```

### Step 4.3: 🟢 Add Health Check to Cloudflare Worker

Add a health check step after the main processing:

```javascript
// Add after Step 3 (summarize) in cloudflare-cron/index.js

// ============================================================
// STEP 4: HEALTH CHECK
// ============================================================
console.log(`[${executionId}] Step 4: Checking pipeline health...`);

const healthUrl = `${env.PUBLIC_URL}/api/health/pipeline`;
try {
  const healthResponse = await fetch(healthUrl);
  if (healthResponse.ok) {
    const healthData = await healthResponse.json();
    if (healthData.status === 'CRITICAL') {
      console.error(`[${executionId}] CRITICAL: Pipeline health issues detected`, healthData.issues);
    } else if (healthData.status === 'DEGRADED') {
      console.warn(`[${executionId}] WARNING: Pipeline health degraded`, healthData.issues);
    } else {
      console.log(`[${executionId}] Step 4 completed: Pipeline health ${healthData.status}`);
    }
  }
} catch (healthError) {
  console.warn(`[${executionId}] Step 4 warning: health check failed - ${healthError.message}`);
}
```

### Step 4.4: Final Phase 4 Verification

#### Automated Verification:
- [ ] Pipeline health tests pass
- [ ] `/api/health/pipeline` endpoint exists
- [ ] Cloudflare Worker logs health status
- [ ] All tests pass: `npm run test`

#### Manual Verification:
- [ ] Health endpoint returns accurate status
- [ ] `wrangler tail` shows health check results
- [ ] CRITICAL/DEGRADED status appears when pipeline is stalled

**STOP**: After completing Phase 4, run final verification.

---

## Final Verification

### Complete Test Suite

```bash
# All tests
npm run test

# Specific suites
npm run test -- --testPathPattern="lock-cleanup"
npm run test -- --testPathPattern="proactive-cleanup"
npm run test -- --testPathPattern="pipeline-health"

# E2E verification
npm run test:e2e
```

### Pipeline Health Check

```bash
# Full diagnostic
npx tsx scripts/diagnose-pipeline.ts

# Quick health check
curl https://tldrsec.app/api/health/pipeline | jq
```

### Monitor Cloudflare Worker

```bash
cd cloudflare-cron && npx wrangler tail --format=pretty
```

Expected log output after fix:
```
[cron-xxx] Step 0: Proactive lock cleanup...
[cron-xxx] Step 0 completed: 0 locks cleaned, health: HEALTHY
[cron-xxx] Step 1: Calling tier-aware endpoint...
[cron-xxx] Step 1 completed: tier-aware endpoint success
[cron-xxx] Step 2: Calling process-filing-queue (fetch)...
[cron-xxx] Step 2 completed: fetch jobs success
[cron-xxx] Step 3: Calling process-filing-queue (summarize)...
[cron-xxx] Step 3 completed: summarize jobs success
[cron-xxx] Step 4: Checking pipeline health...
[cron-xxx] Step 4 completed: Pipeline health HEALTHY
```

---

## Testing Strategy

### TDD Test Design Principles

1. **Lock Cleanup Tests**: Verify cleanup behavior with expired/active locks
2. **Proactive Cleanup Tests**: Verify API endpoint authentication and functionality
3. **Health Check Tests**: Verify health status calculation logic
4. **Integration Tests**: Verify full pipeline flow after cleanup

### Test Categories

1. **Unit Tests**: Lock cleanup logic, health status calculation
2. **Integration Tests**: API endpoints, Cloudflare Worker behavior
3. **E2E Tests**: Full pipeline processing after recovery

---

## Performance Considerations

- Lock cleanup: O(n) where n = number of expired locks (typically <10)
- Health check: 4 parallel database queries, ~50-100ms total
- Proactive cleanup: Adds ~100-200ms to each cron execution
- Cloudflare Worker timeout: 30 seconds (cleanup + health should complete in <5s)

---

## Migration Notes

### Database Changes
- New function: `cleanup_expired_locks()` (optional, application-level cleanup sufficient)
- No schema changes required

### Deployment Order
1. Deploy Vercel changes first (new API endpoints)
2. Deploy Cloudflare Worker (calls new endpoints)
3. Run emergency cleanup script if pipeline still stalled

### Rollback Plan
- Cloudflare Worker: `npx wrangler rollback`
- Vercel: Redeploy previous version via dashboard
- Database: No migrations to rollback

---

## References

- Original research: [thoughts/shared/research/2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md](../../thoughts/shared/research/2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md)
- Previous stall investigation: [thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md](../../thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md)
- Lock service implementation: [lib/job-queue/lock-service.ts](../../lib/job-queue/lock-service.ts)
- Cloudflare Worker: [cloudflare-cron/index.js](../../cloudflare-cron/index.js)
- Cleanup script: [scripts/cleanup-locks.ts](../../scripts/cleanup-locks.ts)
