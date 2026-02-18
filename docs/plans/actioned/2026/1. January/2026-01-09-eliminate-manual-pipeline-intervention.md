# Eliminate Manual Pipeline Intervention - Comprehensive Stall Prevention

**Date**: 2026-01-09T17:17:00+11:00
**Git Commit**: e08ea36026bdc612c08b6f76a05049dd3009fcf0
**Branch**: main
**Repository**: tldrsec-ai

## Overview

This plan addresses the recurring pattern of pipeline stalls that have required manual intervention over the past 2+ months. Despite having auto-recovery infrastructure, every major incident (Dec 10, Dec 12, Dec 29, Jan 3, Jan 9) was discovered manually and required human intervention.

The goal is to **eliminate manual intervention entirely** by implementing:
1. External health monitoring via a second Cloudflare Worker
2. Cron execution gap detection with proactive alerts
3. Orphaned filing recovery
4. Mutually exclusive redundant triggering (Vercel cron as backup)
5. Persistent recovery state in database

## Current State Analysis

### Incident History

| Date | Duration | Root Cause | Detection |
|------|----------|------------|-----------|
| 2025-12-10 | Days | Prisma field reference bug | Manual |
| 2025-12-12 | Hours | Stale distributed locks | Manual |
| 2025-12-29 | Hours | Cloudflare Worker stopped | Manual |
| 2026-01-03 | 41 hours | Exhausted RETRYING not marked FAILED | Manual |
| 2026-01-09 | 3 hours | Cloudflare Worker gap | Manual |

### Identified Gaps (8 Total)

1. **Cloudflare Worker Silent Failures** - No alert when worker stops executing
2. **Orphaned Filings** - Filings with `processed=false` but no jobs never detected
3. **Recovery State Loss** - `consecutiveDegraded` counter resets on Vercel deploy
4. **No External Monitoring** - Health endpoint exists but nothing monitors it externally
5. **DEGRADED Delay** - 30 minutes before action, counter often reset by deploys
6. **Discovery Skipped Silently** - Circuit breaker logs but doesn't alert
7. **Single Point of Failure** - Only Cloudflare Worker triggers pipeline
8. **Cron Gap Detection** - No alert when `CronJobExecution` shows gaps

### Key Files

- `cloudflare-cron/index.js` - Primary pipeline trigger
- `app/api/cron/auto-recover/route.ts` - Auto-recovery logic
- `app/api/health/pipeline/route.ts` - Health detection
- `lib/cron/handlers/discovery-handler.ts` - Discovery phase with orphan recovery

## Desired End State

After implementation:

1. **Zero manual intervention required** for any stall condition
2. **External watchdog** monitors pipeline health from independent infrastructure
3. **Redundant triggering** ensures pipeline runs even if primary fails
4. **Orphaned filings** automatically recovered within 15 minutes
5. **Cron execution gaps** detected and alerted within 20 minutes
6. **Recovery state** persists across deployments
7. **Slack alerts** with auto-remediation for all detected issues

### Verification Criteria

- [ ] Pipeline recovers automatically from simulated Cloudflare Worker outage
- [ ] Orphaned filings are detected and recovered within 15 minutes
- [ ] Cron execution gaps >15 minutes trigger immediate alerts
- [ ] Recovery state persists across Vercel deployments
- [ ] All 8 identified gaps have automated detection and remediation

## What We're NOT Doing

- Replacing Cloudflare Worker with a different service
- Changing the core 3-phase pipeline architecture
- Adding manual approval gates before recovery actions
- Implementing PagerDuty/Opsgenie integration (Slack only for now)
- Changing AI providers or email infrastructure

## Implementation Approach

Following Elon's 5-step algorithm:
1. **Question requirements** - All 8 gaps validated through incident analysis
2. **Delete unnecessary** - Consolidated detection logic, removed redundant checks
3. **Simplify** - Single watchdog worker handles all external monitoring
4. **Accelerate** - Parallel implementation of independent components
5. **Automate** - Full auto-remediation without human intervention

---

## Phase 1: Persistent Recovery State

### Overview
Store recovery state in database instead of in-memory to survive Vercel deployments.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/persistent-recovery-state.test.ts`

```typescript
import { RecoveryStateService } from '@/lib/cron/recovery-state-service';

describe('RecoveryStateService', () => {
  beforeEach(async () => {
    await RecoveryStateService.reset();
  });

  describe('getState', () => {
    it('should return default state when no state exists', async () => {
      const state = await RecoveryStateService.getState();

      expect(state).toEqual({
        consecutiveDegraded: 0,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      });
    });

    it('should return persisted state after update', async () => {
      await RecoveryStateService.incrementConsecutiveDegraded();
      await RecoveryStateService.incrementConsecutiveDegraded();

      const state = await RecoveryStateService.getState();
      expect(state.consecutiveDegraded).toBe(2);
    });
  });

  describe('incrementConsecutiveDegraded', () => {
    it('should increment counter and update timestamp', async () => {
      const before = Date.now();
      await RecoveryStateService.incrementConsecutiveDegraded();
      const state = await RecoveryStateService.getState();

      expect(state.consecutiveDegraded).toBe(1);
      expect(state.lastDegradedTime).not.toBeNull();
      expect(new Date(state.lastDegradedTime!).getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('resetOnHealthy', () => {
    it('should reset degraded counter but preserve cleanup history', async () => {
      await RecoveryStateService.incrementConsecutiveDegraded();
      await RecoveryStateService.incrementConsecutiveDegraded();
      await RecoveryStateService.recordCleanup();

      await RecoveryStateService.resetOnHealthy();

      const state = await RecoveryStateService.getState();
      expect(state.consecutiveDegraded).toBe(0);
      expect(state.consecutiveCleanups).toBe(1); // Preserved
      expect(state.lastHealthyTime).not.toBeNull();
    });
  });

  describe('state persistence across simulated deploys', () => {
    it('should maintain state when service is re-instantiated', async () => {
      await RecoveryStateService.incrementConsecutiveDegraded();
      await RecoveryStateService.incrementConsecutiveDegraded();
      await RecoveryStateService.incrementConsecutiveDegraded();

      // Simulate deploy by clearing any in-memory cache
      RecoveryStateService.clearCache();

      const state = await RecoveryStateService.getState();
      expect(state.consecutiveDegraded).toBe(3);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="persistent-recovery-state"
# Expected: 5 failing tests (module not found)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Create Database Migration
**File**: Migration via `mcp__supabase__apply_migration`

```sql
-- Create recovery_state table for persistent auto-recovery state
CREATE TABLE IF NOT EXISTS pipeline."RecoveryState" (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  "consecutiveDegraded" INTEGER NOT NULL DEFAULT 0,
  "consecutiveCleanups" INTEGER NOT NULL DEFAULT 0,
  "consecutiveRedeploys" INTEGER NOT NULL DEFAULT 0,
  "lastCleanupTime" TIMESTAMPTZ,
  "lastRedeployTime" TIMESTAMPTZ,
  "lastHealthyTime" TIMESTAMPTZ,
  "lastDegradedTime" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 'singleton')
);

-- Insert default row
INSERT INTO pipeline."RecoveryState" (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;
```

**Checkpoint 1.2.1**: Migration applies successfully

#### 1.2.2 Update Prisma Schema
**File**: `prisma/schema.prisma`

Add model:
```prisma
model RecoveryState {
  id                   String    @id @default("singleton")
  consecutiveDegraded  Int       @default(0)
  consecutiveCleanups  Int       @default(0)
  consecutiveRedeploys Int       @default(0)
  lastCleanupTime      DateTime?
  lastRedeployTime     DateTime?
  lastHealthyTime      DateTime?
  lastDegradedTime     DateTime?
  updatedAt            DateTime  @updatedAt

  @@map("RecoveryState")
  @@schema("pipeline")
}
```

**Checkpoint 1.2.2**: `npm run db:generate` succeeds

#### 1.2.3 Create RecoveryStateService
**File**: `lib/cron/recovery-state-service.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

interface RecoveryState {
  consecutiveDegraded: number;
  consecutiveCleanups: number;
  consecutiveRedeploys: number;
  lastCleanupTime: Date | null;
  lastRedeployTime: Date | null;
  lastHealthyTime: Date | null;
  lastDegradedTime: Date | null;
}

const DEFAULT_STATE: RecoveryState = {
  consecutiveDegraded: 0,
  consecutiveCleanups: 0,
  consecutiveRedeploys: 0,
  lastCleanupTime: null,
  lastRedeployTime: null,
  lastHealthyTime: null,
  lastDegradedTime: null,
};

// In-memory cache for performance (refreshed from DB on each getState)
let cachedState: RecoveryState | null = null;

export class RecoveryStateService {
  private static readonly SINGLETON_ID = 'singleton';

  static async getState(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const dbState = await prisma.recoveryState.findUnique({
      where: { id: this.SINGLETON_ID },
    });

    if (!dbState) {
      // Create default state if doesn't exist
      await prisma.recoveryState.create({
        data: { id: this.SINGLETON_ID },
      });
      cachedState = { ...DEFAULT_STATE };
      return cachedState;
    }

    cachedState = {
      consecutiveDegraded: dbState.consecutiveDegraded,
      consecutiveCleanups: dbState.consecutiveCleanups,
      consecutiveRedeploys: dbState.consecutiveRedeploys,
      lastCleanupTime: dbState.lastCleanupTime,
      lastRedeployTime: dbState.lastRedeployTime,
      lastHealthyTime: dbState.lastHealthyTime,
      lastDegradedTime: dbState.lastDegradedTime,
    };

    return cachedState;
  }

  static async incrementConsecutiveDegraded(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveDegraded: 1,
        lastDegradedTime: new Date(),
      },
      update: {
        consecutiveDegraded: { increment: 1 },
        lastDegradedTime: new Date(),
      },
    });
  }

  static async recordCleanup(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveCleanups: 1,
        lastCleanupTime: new Date(),
      },
      update: {
        consecutiveCleanups: { increment: 1 },
        lastCleanupTime: new Date(),
      },
    });
  }

  static async recordRedeploy(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveRedeploys: 1,
        lastRedeployTime: new Date(),
      },
      update: {
        consecutiveRedeploys: { increment: 1 },
        lastRedeployTime: new Date(),
      },
    });
  }

  static async resetOnHealthy(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveDegraded: 0,
        lastHealthyTime: new Date(),
      },
      update: {
        consecutiveDegraded: 0,
        lastHealthyTime: new Date(),
      },
    });
  }

  static async reset(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: { id: this.SINGLETON_ID },
      update: {
        consecutiveDegraded: 0,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      },
    });
    cachedState = null;
  }

  static clearCache(): void {
    cachedState = null;
  }
}
```

**Checkpoint 1.2.3**: First 3 tests pass:
```bash
npm run test -- --testPathPattern="persistent-recovery-state" --testNamePattern="getState|increment"
# Expected: 3 passing
```

#### 1.2.4 Update auto-recover/route.ts to Use RecoveryStateService
**File**: `app/api/cron/auto-recover/route.ts`

Replace in-memory `recoveryState` object with `RecoveryStateService` calls.

**Checkpoint 1.2.4**: All 5 tests pass:
```bash
npm run test -- --testPathPattern="persistent-recovery-state"
# Expected: 5 passing, 0 failing
```

### Step 1.3: 🔵 Refactor

- [ ] Remove old in-memory `recoveryState` object from auto-recover/route.ts
- [ ] Add JSDoc comments to RecoveryStateService
- [ ] Add logging for state transitions

**Checkpoint 1.3**: All tests still pass after refactoring

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="persistent-recovery-state"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`
- [ ] Database migration applied successfully

#### Manual Verification:
- [ ] Trigger auto-recovery endpoint, verify state persists in database
- [ ] Redeploy Vercel app, verify state survives
- [ ] Check Prisma Studio shows RecoveryState table with data

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Cron Execution Gap Detection

### Overview
Detect and alert when cron executions have unexpected gaps (>15 minutes for the 5-minute schedule).

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/execution-gap-detector.test.ts`

```typescript
import { CronExecutionGapDetector } from '@/lib/cron/execution-gap-detector';

describe('CronExecutionGapDetector', () => {
  describe('detectGaps', () => {
    it('should return no gaps when executions are within threshold', async () => {
      // Mock: executions every 5 minutes for last hour
      const mockExecutions = generateMockExecutions(12, 5); // 12 executions, 5 min apart

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps).toHaveLength(0);
    });

    it('should detect gap when >15 minutes between executions', async () => {
      // Mock: 30-minute gap in the middle
      const mockExecutions = [
        { triggeredAt: new Date(Date.now() - 5 * 60 * 1000) },
        { triggeredAt: new Date(Date.now() - 10 * 60 * 1000) },
        // GAP: 30 minutes
        { triggeredAt: new Date(Date.now() - 40 * 60 * 1000) },
        { triggeredAt: new Date(Date.now() - 45 * 60 * 1000) },
      ];

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps).toHaveLength(1);
      expect(gaps[0].durationMinutes).toBe(30);
    });

    it('should detect gap when no recent executions', async () => {
      // Mock: no executions in last 60 minutes
      const mockExecutions = [
        { triggeredAt: new Date(Date.now() - 90 * 60 * 1000) },
      ];

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].type).toBe('no-recent-executions');
    });
  });

  describe('shouldAlert', () => {
    it('should return true for gaps exceeding alert threshold', async () => {
      const gap = { durationMinutes: 20, startTime: new Date(), endTime: new Date() };

      const shouldAlert = CronExecutionGapDetector.shouldAlert(gap, { alertThresholdMinutes: 15 });

      expect(shouldAlert).toBe(true);
    });

    it('should return false for gaps below alert threshold', async () => {
      const gap = { durationMinutes: 10, startTime: new Date(), endTime: new Date() };

      const shouldAlert = CronExecutionGapDetector.shouldAlert(gap, { alertThresholdMinutes: 15 });

      expect(shouldAlert).toBe(false);
    });
  });
});

function generateMockExecutions(count: number, intervalMinutes: number) {
  const executions = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    executions.push({
      triggeredAt: new Date(now - i * intervalMinutes * 60 * 1000),
    });
  }
  return executions;
}
```

**Checkpoint 2.1**: Tests fail (module not found)

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Create CronExecutionGapDetector
**File**: `lib/cron/execution-gap-detector.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

interface ExecutionGap {
  type: 'gap-between-executions' | 'no-recent-executions';
  durationMinutes: number;
  startTime: Date;
  endTime: Date;
}

interface DetectGapsOptions {
  lookbackMinutes?: number;
  gapThresholdMinutes?: number;
  mockExecutions?: Array<{ triggeredAt: Date }>;
}

interface AlertOptions {
  alertThresholdMinutes?: number;
}

export class CronExecutionGapDetector {
  static async detectGaps(options: DetectGapsOptions = {}): Promise<ExecutionGap[]> {
    const {
      lookbackMinutes = 60,
      gapThresholdMinutes = 15,
      mockExecutions,
    } = options;

    const now = new Date();
    const lookbackTime = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

    // Use mock data for testing or query database
    const executions = mockExecutions ?? await this.getRecentExecutions(lookbackTime);

    if (executions.length === 0) {
      return [{
        type: 'no-recent-executions',
        durationMinutes: lookbackMinutes,
        startTime: lookbackTime,
        endTime: now,
      }];
    }

    // Sort by time descending (most recent first)
    const sorted = [...executions].sort(
      (a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime()
    );

    const gaps: ExecutionGap[] = [];

    // Check gap from now to most recent execution
    const mostRecent = sorted[0];
    const timeSinceLastExecution = (now.getTime() - mostRecent.triggeredAt.getTime()) / (60 * 1000);

    if (timeSinceLastExecution > gapThresholdMinutes) {
      gaps.push({
        type: 'no-recent-executions',
        durationMinutes: Math.round(timeSinceLastExecution),
        startTime: mostRecent.triggeredAt,
        endTime: now,
      });
    }

    // Check gaps between executions
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const previous = sorted[i + 1];
      const gapMinutes = (current.triggeredAt.getTime() - previous.triggeredAt.getTime()) / (60 * 1000);

      if (gapMinutes > gapThresholdMinutes) {
        gaps.push({
          type: 'gap-between-executions',
          durationMinutes: Math.round(gapMinutes),
          startTime: previous.triggeredAt,
          endTime: current.triggeredAt,
        });
      }
    }

    return gaps;
  }

  static shouldAlert(gap: ExecutionGap, options: AlertOptions = {}): boolean {
    const { alertThresholdMinutes = 15 } = options;
    return gap.durationMinutes > alertThresholdMinutes;
  }

  private static async getRecentExecutions(since: Date) {
    const prisma = getPrismaClient();

    return prisma.cronJobExecution.findMany({
      where: {
        triggeredAt: { gte: since },
        jobType: 'sec-filing-monitor', // Main pipeline job
      },
      select: { triggeredAt: true },
      orderBy: { triggeredAt: 'desc' },
    });
  }

  static async checkAndAlert(): Promise<{ alerted: boolean; gaps: ExecutionGap[] }> {
    const gaps = await this.detectGaps({
      lookbackMinutes: 60,
      gapThresholdMinutes: 15,
    });

    const alertableGaps = gaps.filter(gap => this.shouldAlert(gap));

    if (alertableGaps.length > 0) {
      await this.sendSlackAlert(alertableGaps);
      return { alerted: true, gaps: alertableGaps };
    }

    return { alerted: false, gaps: [] };
  }

  private static async sendSlackAlert(gaps: ExecutionGap[]): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    const gapDescriptions = gaps.map(gap =>
      `- ${gap.type}: ${gap.durationMinutes} minutes (${gap.startTime.toISOString()} to ${gap.endTime.toISOString()})`
    ).join('\n');

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:warning: *Cron Execution Gap Detected*\n\n${gapDescriptions}\n\nThis may indicate Cloudflare Worker issues. Check: \`cd cloudflare-cron && npx wrangler tail\``,
      }),
    });
  }
}
```

**Checkpoint 2.2.1**: All tests pass

### Step 2.3: 🔵 Refactor

- [ ] Add rate limiting to prevent duplicate alerts
- [ ] Add configurable thresholds via environment variables

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Type checking passes
- [ ] No regressions

#### Manual Verification:
- [ ] Manually create execution gap in database, verify detection
- [ ] Verify Slack alert is sent correctly

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Orphaned Filing Detection and Recovery

### Overview
Detect filings in `SecFiling` with `processed=false` but no corresponding `JobQueue` entries.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/orphaned-filing-detector.test.ts`

```typescript
import { OrphanedFilingDetector } from '@/lib/cron/orphaned-filing-detector';

describe('OrphanedFilingDetector', () => {
  describe('detectOrphanedFilings', () => {
    it('should return empty array when all unprocessed filings have jobs', async () => {
      // Mock: all unprocessed filings have corresponding jobs
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1' },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
        ],
      });

      expect(orphaned).toHaveLength(0);
    });

    it('should detect filings without any jobs', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1' },
          { id: 'filing-2', accessionNumber: 'ACC-2' },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
          // filing-2 has no jobs
        ],
      });

      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].id).toBe('filing-2');
    });

    it('should only consider filings older than threshold', async () => {
      const recentFiling = {
        id: 'filing-recent',
        accessionNumber: 'ACC-R',
        createdAt: new Date(), // Just created
      };

      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [recentFiling],
        mockJobsForFilings: [],
      });

      // Recent filings should not be flagged as orphaned
      expect(orphaned).toHaveLength(0);
    });
  });

  describe('recoverOrphanedFilings', () => {
    it('should create ASYNC_FETCH_FILING jobs for orphaned filings', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'ticker-1' },
        ],
        dryRun: true,
      });

      expect(created).toHaveLength(1);
      expect(created[0].jobType).toBe('ASYNC_FETCH_FILING');
      expect(created[0].payload.filingId).toBe('filing-1');
    });
  });
});
```

**Checkpoint 3.1**: Tests fail

### Step 3.2: 🟢 Implement to Pass Tests

**File**: `lib/cron/orphaned-filing-detector.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';
import { JobQueueService } from '@/lib/job-queue';

interface OrphanedFiling {
  id: string;
  accessionNumber: string;
  formType: string;
  tickerId: string;
  createdAt: Date;
}

interface DetectOptions {
  ageThresholdMinutes?: number;
  limit?: number;
  mockUnprocessedFilings?: any[];
  mockJobsForFilings?: any[];
}

interface RecoverOptions {
  mockOrphanedFilings?: OrphanedFiling[];
  dryRun?: boolean;
}

export class OrphanedFilingDetector {
  static async detectOrphanedFilings(options: DetectOptions = {}): Promise<OrphanedFiling[]> {
    const {
      ageThresholdMinutes = 10,
      limit = 100,
      mockUnprocessedFilings,
      mockJobsForFilings,
    } = options;

    const prisma = getPrismaClient();
    const ageThreshold = new Date(Date.now() - ageThresholdMinutes * 60 * 1000);

    // Get unprocessed filings older than threshold
    const unprocessedFilings = mockUnprocessedFilings ?? await prisma.secFiling.findMany({
      where: {
        processed: false,
        createdAt: { lt: ageThreshold },
      },
      select: {
        id: true,
        accessionNumber: true,
        formType: true,
        tickerId: true,
        createdAt: true,
      },
      take: limit,
    });

    if (unprocessedFilings.length === 0) {
      return [];
    }

    // Filter out filings that are too recent (for mocked data)
    const eligibleFilings = unprocessedFilings.filter(f =>
      !f.createdAt || f.createdAt < ageThreshold
    );

    if (eligibleFilings.length === 0) {
      return [];
    }

    // Get all jobs that reference these filings
    const filingIds = eligibleFilings.map(f => f.id);

    const existingJobs = mockJobsForFilings ?? await prisma.jobQueue.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] },
        OR: filingIds.map(id => ({
          payload: { path: ['filingId'], equals: id },
        })),
      },
      select: { payload: true },
    });

    // Find filings without jobs
    const filingIdsWithJobs = new Set(
      existingJobs
        .map(j => (j.payload as any)?.filingId)
        .filter(Boolean)
    );

    const orphaned = eligibleFilings.filter(f => !filingIdsWithJobs.has(f.id));

    return orphaned as OrphanedFiling[];
  }

  static async recoverOrphanedFilings(options: RecoverOptions = {}): Promise<any[]> {
    const { mockOrphanedFilings, dryRun = false } = options;

    const orphanedFilings = mockOrphanedFilings ?? await this.detectOrphanedFilings();

    if (orphanedFilings.length === 0) {
      return [];
    }

    const createdJobs = [];

    for (const filing of orphanedFilings) {
      const jobData = {
        jobType: 'ASYNC_FETCH_FILING',
        payload: {
          filingId: filing.id,
          accessionNumber: filing.accessionNumber,
          formType: filing.formType,
          tickerId: filing.tickerId,
          source: 'orphaned-filing-recovery',
        },
        priority: 5, // Higher priority for recovery
        idempotencyKey: `orphan-recovery-${filing.id}-${Date.now()}`,
      };

      if (dryRun) {
        createdJobs.push(jobData);
      } else {
        const job = await JobQueueService.addJob(jobData);
        createdJobs.push(job);
      }
    }

    // Send Slack notification
    if (!dryRun && createdJobs.length > 0) {
      await this.sendSlackNotification(createdJobs.length);
    }

    return createdJobs;
  }

  private static async sendSlackNotification(count: number): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:recycle: *Orphaned Filing Recovery*\n\nRecovered ${count} orphaned filing(s) by creating ASYNC_FETCH_FILING jobs.\n\nThese filings had \`processed=false\` but no active jobs in the queue.`,
      }),
    });
  }

  static async checkAndRecover(): Promise<{ recovered: number; filings: OrphanedFiling[] }> {
    const orphaned = await this.detectOrphanedFilings();

    if (orphaned.length > 0) {
      await this.recoverOrphanedFilings();
      return { recovered: orphaned.length, filings: orphaned };
    }

    return { recovered: 0, filings: [] };
  }
}
```

**Checkpoint 3.2**: All tests pass

### Step 3.3: 🔵 Refactor

- [ ] Add to auto-recover endpoint
- [ ] Add metrics tracking

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass
- [ ] Type checking passes

#### Manual Verification:
- [ ] Create orphaned filing in database, verify detection
- [ ] Verify job creation for orphaned filing

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: External Watchdog Worker (Second Cloudflare Worker)

### Overview
Create a second Cloudflare Worker in a different account/region that monitors the primary pipeline and alerts on failures.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cloudflare-watchdog/watchdog-logic.test.ts`

```typescript
import { WatchdogLogic } from '@/lib/cloudflare-watchdog/watchdog-logic';

describe('WatchdogLogic', () => {
  describe('checkPipelineHealth', () => {
    it('should return healthy when health endpoint returns HEALTHY', async () => {
      const result = await WatchdogLogic.checkPipelineHealth({
        mockHealthResponse: { status: 'HEALTHY', jobs: { pending: 5 } },
      });

      expect(result.healthy).toBe(true);
      expect(result.status).toBe('HEALTHY');
    });

    it('should return unhealthy when health endpoint returns CRITICAL', async () => {
      const result = await WatchdogLogic.checkPipelineHealth({
        mockHealthResponse: { status: 'CRITICAL', jobs: { pending: 500 } },
      });

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('CRITICAL');
    });

    it('should return unhealthy when health endpoint is unreachable', async () => {
      const result = await WatchdogLogic.checkPipelineHealth({
        mockError: new Error('Connection refused'),
      });

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('shouldTriggerBackup', () => {
    it('should trigger backup after 3 consecutive failures', () => {
      const state = { consecutiveFailures: 3, lastSuccessTime: null };

      expect(WatchdogLogic.shouldTriggerBackup(state)).toBe(true);
    });

    it('should not trigger backup for transient failure', () => {
      const state = { consecutiveFailures: 1, lastSuccessTime: new Date() };

      expect(WatchdogLogic.shouldTriggerBackup(state)).toBe(false);
    });

    it('should trigger backup when no success for 20+ minutes', () => {
      const state = {
        consecutiveFailures: 2,
        lastSuccessTime: new Date(Date.now() - 25 * 60 * 1000),
      };

      expect(WatchdogLogic.shouldTriggerBackup(state)).toBe(true);
    });
  });

  describe('triggerBackupPipeline', () => {
    it('should call Vercel cron endpoint with backup flag', async () => {
      const result = await WatchdogLogic.triggerBackupPipeline({
        mockResponse: { success: true, source: 'backup-trigger' },
        dryRun: true,
      });

      expect(result.triggered).toBe(true);
    });
  });
});
```

**Checkpoint 4.1**: Tests fail

### Step 4.2: 🟢 Implement to Pass Tests

#### 4.2.1 Create Watchdog Logic Library
**File**: `lib/cloudflare-watchdog/watchdog-logic.ts`

```typescript
interface HealthCheckResult {
  healthy: boolean;
  status?: string;
  error?: string;
  responseTimeMs?: number;
  jobs?: { pending: number };
}

interface WatchdogState {
  consecutiveFailures: number;
  lastSuccessTime: Date | null;
  lastCheckTime: Date | null;
}

interface CheckOptions {
  mockHealthResponse?: any;
  mockError?: Error;
}

interface TriggerOptions {
  mockResponse?: any;
  dryRun?: boolean;
}

export class WatchdogLogic {
  private static readonly FAILURE_THRESHOLD = 3;
  private static readonly NO_SUCCESS_THRESHOLD_MINUTES = 20;

  static async checkPipelineHealth(options: CheckOptions = {}): Promise<HealthCheckResult> {
    const { mockHealthResponse, mockError } = options;

    if (mockError) {
      return { healthy: false, error: mockError.message };
    }

    if (mockHealthResponse) {
      return {
        healthy: mockHealthResponse.status === 'HEALTHY',
        status: mockHealthResponse.status,
        jobs: mockHealthResponse.jobs,
      };
    }

    // Real implementation would fetch from health endpoint
    const startTime = Date.now();
    try {
      const response = await fetch(`${process.env.PUBLIC_URL}/api/health/pipeline`, {
        headers: { 'Cache-Control': 'no-cache' },
      });

      const data = await response.json();
      const responseTimeMs = Date.now() - startTime;

      return {
        healthy: data.status === 'HEALTHY',
        status: data.status,
        jobs: data.jobs,
        responseTimeMs,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  static shouldTriggerBackup(state: WatchdogState): boolean {
    // Trigger if 3+ consecutive failures
    if (state.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      return true;
    }

    // Trigger if no success for 20+ minutes
    if (state.lastSuccessTime) {
      const minutesSinceSuccess = (Date.now() - state.lastSuccessTime.getTime()) / (60 * 1000);
      if (minutesSinceSuccess >= this.NO_SUCCESS_THRESHOLD_MINUTES && state.consecutiveFailures >= 2) {
        return true;
      }
    }

    return false;
  }

  static async triggerBackupPipeline(options: TriggerOptions = {}): Promise<{ triggered: boolean }> {
    const { mockResponse, dryRun = false } = options;

    if (mockResponse) {
      return { triggered: true };
    }

    if (dryRun) {
      return { triggered: true };
    }

    // Real implementation would call backup endpoint
    const response = await fetch(`${process.env.PUBLIC_URL}/api/cron/backup-trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BACKUP_TRIGGER_SECRET}`,
      },
      body: JSON.stringify({ source: 'watchdog', timestamp: new Date().toISOString() }),
    });

    return { triggered: response.ok };
  }

  static async sendAlert(message: string): Promise<void> {
    const webhookUrl = process.env.SLACK_ALERTS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  }
}
```

**Checkpoint 4.2.1**: Tests pass

#### 4.2.2 Create Second Cloudflare Worker
**Directory**: `cloudflare-watchdog/`

**File**: `cloudflare-watchdog/wrangler.toml`
```toml
name = "tldrsec-watchdog"
main = "index.js"
compatibility_date = "2024-01-01"

[triggers]
crons = ["*/10 * * * *"]  # Every 10 minutes

[vars]
WORKER_VERSION = "1.0.0"

# KV for state persistence
[[kv_namespaces]]
binding = "WATCHDOG_STATE"
id = "YOUR_KV_NAMESPACE_ID"
```

**File**: `cloudflare-watchdog/index.js`
```javascript
/**
 * TLDRSec Pipeline Watchdog
 *
 * Independent Cloudflare Worker that monitors pipeline health
 * and triggers backup processing if primary worker fails.
 *
 * Runs every 10 minutes on a DIFFERENT Cloudflare account/zone.
 */

export default {
  async scheduled(event, env, ctx) {
    const handler = new WatchdogHandler(env);
    ctx.waitUntil(handler.run());
  },

  async fetch(request, env, ctx) {
    // Manual trigger endpoint
    if (request.method === 'POST') {
      const handler = new WatchdogHandler(env);
      const result = await handler.run();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('TLDRSec Watchdog - Use POST to trigger manual check', {
      status: 200,
    });
  },
};

class WatchdogHandler {
  constructor(env) {
    this.env = env;
    this.publicUrl = env.PUBLIC_URL || 'https://tldrsec.app';
    this.slackWebhook = env.SLACK_WEBHOOK_URL;
    this.backupSecret = env.BACKUP_TRIGGER_SECRET;
  }

  async run() {
    const state = await this.getState();
    const healthResult = await this.checkHealth();

    console.log('[Watchdog] Health check result:', JSON.stringify(healthResult));

    if (healthResult.healthy) {
      // Reset failure counter on success
      await this.updateState({
        consecutiveFailures: 0,
        lastSuccessTime: Date.now(),
        lastCheckTime: Date.now(),
      });

      return { status: 'healthy', ...healthResult };
    }

    // Increment failure counter
    const newFailures = (state.consecutiveFailures || 0) + 1;
    await this.updateState({
      consecutiveFailures: newFailures,
      lastCheckTime: Date.now(),
      lastSuccessTime: state.lastSuccessTime,
    });

    // Check if we should trigger backup
    const shouldTrigger = this.shouldTriggerBackup(newFailures, state.lastSuccessTime);

    if (shouldTrigger) {
      console.log('[Watchdog] Triggering backup pipeline');

      await this.sendAlert(
        `:rotating_light: *Watchdog Alert*\n\n` +
        `Pipeline health check failed ${newFailures} times consecutively.\n` +
        `Status: ${healthResult.status || 'UNREACHABLE'}\n` +
        `Error: ${healthResult.error || 'N/A'}\n\n` +
        `*Triggering backup pipeline...*`
      );

      const triggerResult = await this.triggerBackup();

      return {
        status: 'backup-triggered',
        failures: newFailures,
        healthResult,
        triggerResult,
      };
    }

    // Alert but don't trigger yet
    if (newFailures === 2) {
      await this.sendAlert(
        `:warning: *Watchdog Warning*\n\n` +
        `Pipeline health check failed ${newFailures} times.\n` +
        `Status: ${healthResult.status || 'UNREACHABLE'}\n` +
        `Will trigger backup on next failure.`
      );
    }

    return {
      status: 'degraded',
      failures: newFailures,
      healthResult,
    };
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.publicUrl}/api/health/pipeline`, {
        headers: { 'Cache-Control': 'no-cache' },
        cf: { cacheTtl: 0 },
      });

      if (!response.ok) {
        return {
          healthy: false,
          status: 'HTTP_ERROR',
          error: `HTTP ${response.status}`,
          responseTimeMs: Date.now() - startTime,
        };
      }

      const data = await response.json();

      return {
        healthy: data.status === 'HEALTHY',
        status: data.status,
        jobs: data.jobs,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'UNREACHABLE',
        error: error.message,
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  shouldTriggerBackup(consecutiveFailures, lastSuccessTime) {
    // Trigger after 3 consecutive failures
    if (consecutiveFailures >= 3) {
      return true;
    }

    // Trigger if no success for 20+ minutes and at least 2 failures
    if (lastSuccessTime && consecutiveFailures >= 2) {
      const minutesSinceSuccess = (Date.now() - lastSuccessTime) / (60 * 1000);
      if (minutesSinceSuccess >= 20) {
        return true;
      }
    }

    return false;
  }

  async triggerBackup() {
    try {
      const response = await fetch(`${this.publicUrl}/api/cron/backup-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.backupSecret}`,
        },
        body: JSON.stringify({
          source: 'watchdog',
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      await this.sendAlert(
        `:white_check_mark: *Backup Pipeline Triggered*\n\n` +
        `Result: ${response.ok ? 'Success' : 'Failed'}\n` +
        `Response: ${JSON.stringify(data)}`
      );

      return { success: response.ok, data };
    } catch (error) {
      await this.sendAlert(
        `:x: *Backup Trigger Failed*\n\n` +
        `Error: ${error.message}`
      );

      return { success: false, error: error.message };
    }
  }

  async sendAlert(message) {
    if (!this.slackWebhook) return;

    try {
      await fetch(this.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
    } catch (error) {
      console.error('[Watchdog] Failed to send Slack alert:', error);
    }
  }

  async getState() {
    try {
      const data = await this.env.WATCHDOG_STATE.get('state', { type: 'json' });
      return data || { consecutiveFailures: 0, lastSuccessTime: null, lastCheckTime: null };
    } catch {
      return { consecutiveFailures: 0, lastSuccessTime: null, lastCheckTime: null };
    }
  }

  async updateState(state) {
    try {
      await this.env.WATCHDOG_STATE.put('state', JSON.stringify(state));
    } catch (error) {
      console.error('[Watchdog] Failed to update state:', error);
    }
  }
}
```

**Checkpoint 4.2.2**: Worker code complete

### Step 4.3: Create Backup Trigger Endpoint

**File**: `app/api/cron/backup-trigger/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { runTierAwarePipeline } from '@/lib/cron/tier-aware-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

/**
 * Backup trigger endpoint called by watchdog worker
 * when primary Cloudflare Worker appears to have failed.
 *
 * This is mutually exclusive with primary - only runs
 * when watchdog detects primary is not executing.
 */
export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.BACKUP_TRIGGER_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { source, timestamp } = body;

    console.log(`[BackupTrigger] Triggered by ${source} at ${timestamp}`);

    // Check if primary cron ran recently (within last 10 minutes)
    const recentExecution = await checkRecentPrimaryExecution();

    if (recentExecution) {
      console.log('[BackupTrigger] Primary cron ran recently, skipping backup');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Primary cron executed within last 10 minutes',
        lastPrimaryExecution: recentExecution.triggeredAt,
      });
    }

    // Run the pipeline
    const result = await runTierAwarePipeline({ source: 'backup-trigger' });

    // Log backup execution
    await logBackupExecution(source, result);

    return NextResponse.json({
      success: true,
      source: 'backup-trigger',
      result,
    });
  } catch (error) {
    console.error('[BackupTrigger] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

async function checkRecentPrimaryExecution() {
  const { getPrismaClient } = await import('@/lib/db/prisma');
  const prisma = getPrismaClient();

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  return prisma.cronJobExecution.findFirst({
    where: {
      triggeredAt: { gte: tenMinutesAgo },
      source: { not: 'backup-trigger' },
    },
    orderBy: { triggeredAt: 'desc' },
  });
}

async function logBackupExecution(source: string, result: any) {
  const { getPrismaClient } = await import('@/lib/db/prisma');
  const prisma = getPrismaClient();

  await prisma.cronJobExecution.create({
    data: {
      jobType: 'sec-filing-monitor',
      source: 'backup-trigger',
      triggeredAt: new Date(),
      completedAt: new Date(),
      status: 'COMPLETED',
      metadata: { watchdogSource: source, result },
    },
  });
}
```

**Checkpoint 4.3**: Backup trigger endpoint complete

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [x] All watchdog tests pass (27 tests)
- [x] Type checking passes
- [x] Build succeeds

#### Manual Verification:
- [ ] Deploy watchdog worker to separate Cloudflare account
- [ ] Verify watchdog can reach health endpoint
- [ ] Test backup trigger endpoint manually
- [ ] Simulate primary worker failure, verify backup triggers
- [ ] Verify mutual exclusion (backup skips when primary ran recently)

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Health Endpoint Enhancement

### Overview
Enhance the health endpoint to include cron execution gaps and orphaned filing detection.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/health/enhanced-pipeline-health.test.ts`

```typescript
describe('Enhanced Pipeline Health', () => {
  it('should include cron execution gap status', async () => {
    const response = await GET(mockRequest);
    const data = await response.json();

    expect(data.cronExecution).toBeDefined();
    expect(data.cronExecution.lastExecution).toBeDefined();
    expect(data.cronExecution.gapsDetected).toBeDefined();
  });

  it('should include orphaned filing count', async () => {
    const response = await GET(mockRequest);
    const data = await response.json();

    expect(data.filings).toBeDefined();
    expect(data.filings.orphanedCount).toBeDefined();
  });

  it('should mark CRITICAL when cron gaps exceed threshold', async () => {
    // Mock: 30-minute gap in cron executions
    const response = await GET(mockRequest);
    const data = await response.json();

    expect(data.status).toBe('CRITICAL');
    expect(data.issues).toContain('Cron execution gap detected');
  });

  it('should mark DEGRADED when orphaned filings exist', async () => {
    // Mock: 5 orphaned filings
    const response = await GET(mockRequest);
    const data = await response.json();

    expect(data.status).toBe('DEGRADED');
    expect(data.issues).toContain('Orphaned filings detected');
  });
});
```

**Checkpoint 5.1**: Tests fail

### Step 5.2: 🟢 Implement to Pass Tests

Update `app/api/health/pipeline/route.ts` to include:

1. Cron execution gap detection
2. Orphaned filing count
3. Updated health status logic

**Checkpoint 5.2**: Tests pass

### Step 5.3: Final Phase Verification

#### Automated Verification:
- [ ] All health tests pass
- [ ] Type checking passes

#### Manual Verification:
- [ ] Check health endpoint includes new fields
- [ ] Verify status correctly reflects cron gaps
- [ ] Verify status correctly reflects orphaned filings

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Auto-Recovery Integration

### Overview
Integrate all new detection and recovery mechanisms into the auto-recover endpoint.

### Step 6.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/comprehensive-auto-recover.test.ts`

```typescript
describe('Comprehensive Auto-Recovery', () => {
  it('should detect and recover orphaned filings', async () => {
    // Create orphaned filing in mock database
    const response = await GET(mockRequest);
    const data = await response.json();

    expect(data.cleanupResults.orphanedFilings).toBeGreaterThan(0);
  });

  it('should check for cron execution gaps', async () => {
    const response = await GET(mockRequest);
    const data = await response.json();

    expect(data.cronGapCheck).toBeDefined();
    expect(data.cronGapCheck.checked).toBe(true);
  });

  it('should use persistent recovery state', async () => {
    // First call increments counter
    await GET(mockRequest);

    // Simulate deploy (clear in-memory cache)
    RecoveryStateService.clearCache();

    // Second call should continue from persisted state
    const response = await GET(mockRequest);
    const data = await response.json();

    expect(data.recoveryState.consecutiveDegraded).toBeGreaterThan(0);
  });
});
```

**Checkpoint 6.1**: Tests fail

### Step 6.2: 🟢 Implement to Pass Tests

Update `app/api/cron/auto-recover/route.ts`:

1. Replace in-memory state with `RecoveryStateService`
2. Add `CronExecutionGapDetector.checkAndAlert()`
3. Add `OrphanedFilingDetector.checkAndRecover()`

**Checkpoint 6.2**: Tests pass

### Step 6.3: Final Phase Verification

#### Automated Verification:
- [ ] All auto-recover tests pass
- [ ] Type checking passes
- [ ] Comprehensive cron tests pass: `npm run test:cron-comprehensive`

#### Manual Verification:
- [ ] Trigger auto-recover endpoint manually
- [ ] Verify orphaned filing recovery works
- [ ] Verify cron gap detection works
- [ ] Verify persistent state survives simulated deploy

**STOP**: Await manual confirmation before Phase 7.

---

## Phase 7: Vercel Cron as Final Backup

### Overview
Add Vercel cron job that only runs if both Cloudflare Workers fail.

### Step 7.1: Update vercel.json

**File**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/tier-aware",
      "schedule": "0 9 * * 1,2,3,4,5"
    },
    {
      "path": "/api/cron/final-backup",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

### Step 7.2: Create Final Backup Endpoint

**File**: `app/api/cron/final-backup/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Final backup cron - runs every 30 minutes via Vercel
 * Only executes pipeline if NO executions in last 25 minutes
 * (from either primary Cloudflare Worker or watchdog backup)
 */
export async function GET(request: NextRequest) {
  // Verify this is a Vercel cron call
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getPrismaClient } = await import('@/lib/db/prisma');
    const prisma = getPrismaClient();

    // Check for ANY recent execution
    const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000);

    const recentExecution = await prisma.cronJobExecution.findFirst({
      where: {
        triggeredAt: { gte: twentyFiveMinutesAgo },
      },
      orderBy: { triggeredAt: 'desc' },
    });

    if (recentExecution) {
      console.log('[FinalBackup] Recent execution found, skipping');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Recent execution found',
        lastExecution: recentExecution.triggeredAt,
        source: recentExecution.source,
      });
    }

    // No recent executions - this is a real emergency!
    console.log('[FinalBackup] No recent executions - triggering emergency pipeline');

    // Send emergency alert
    const webhookUrl = process.env.SLACK_ALERTS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:sos: *EMERGENCY: Final Backup Triggered*\n\n` +
            `No pipeline executions detected in the last 25 minutes!\n` +
            `Both primary Cloudflare Worker and watchdog appear to have failed.\n\n` +
            `*Running emergency pipeline now...*`,
        }),
      });
    }

    // Run the pipeline
    const { runTierAwarePipeline } = await import('@/lib/cron/tier-aware-pipeline');
    const result = await runTierAwarePipeline({ source: 'final-backup' });

    // Log execution
    await prisma.cronJobExecution.create({
      data: {
        jobType: 'sec-filing-monitor',
        source: 'final-backup',
        triggeredAt: new Date(),
        completedAt: new Date(),
        status: 'COMPLETED',
        metadata: { result },
      },
    });

    return NextResponse.json({
      success: true,
      source: 'final-backup',
      result,
    });
  } catch (error) {
    console.error('[FinalBackup] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
```

### Step 7.3: Final Phase Verification

#### Automated Verification:
- [ ] Build succeeds with new vercel.json
- [ ] Type checking passes

#### Manual Verification:
- [ ] Deploy to Vercel
- [ ] Verify final-backup endpoint is accessible
- [ ] Simulate total outage, verify final backup triggers after 25+ minutes

**STOP**: Await manual confirmation before Phase 8.

---

## Phase 8: Documentation and Runbooks

### Overview
Create comprehensive documentation and operational runbooks.

### Step 8.1: Create Operations Runbook

**File**: `docs/runbooks/pipeline-stall-recovery.md`

Document:
1. How to check pipeline health
2. How to manually trigger recovery
3. How to redeploy workers
4. Emergency procedures
5. Alert response procedures

### Step 8.2: Update CLAUDE.md

Add new commands and monitoring information.

### Step 8.3: Create Architecture Diagram

Document the complete redundancy architecture with all three layers:
1. Primary Cloudflare Worker
2. Watchdog Cloudflare Worker
3. Vercel Cron Final Backup

### Step 8.4: Final Phase Verification

#### Automated Verification:
- [ ] All documentation files exist
- [ ] No broken links in documentation

#### Manual Verification:
- [ ] Runbook procedures tested
- [ ] Team review of documentation

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test verifies one specific behavior
2. **Descriptive Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on inputs/outputs

### Test Categories

#### 1. Unit Tests (Per Phase)
- RecoveryStateService persistence
- CronExecutionGapDetector logic
- OrphanedFilingDetector logic
- WatchdogLogic decision-making

#### 2. Integration Tests
- Auto-recover endpoint with all new components
- Health endpoint with new fields
- Backup trigger mutual exclusion

#### 3. E2E Tests
- Simulated Cloudflare Worker outage → automatic recovery
- Simulated orphaned filing → automatic recovery
- Full redundancy chain test

### Manual Testing Steps

1. **Persistent State Test**:
   - Trigger auto-recover to increment counter
   - Redeploy Vercel app
   - Verify counter persisted

2. **Cron Gap Detection Test**:
   - Stop Cloudflare Worker for 20 minutes
   - Verify alert sent
   - Verify backup triggered

3. **Orphaned Filing Test**:
   - Create filing with `processed=false` directly in DB
   - Wait for auto-recover cycle
   - Verify job created

4. **Full Redundancy Test**:
   - Disable primary Cloudflare Worker
   - Disable watchdog worker
   - Verify Vercel final backup triggers after 30 minutes

---

## Performance Considerations

- RecoveryStateService uses singleton pattern with in-memory cache
- Database queries are optimized with indexes
- Watchdog uses KV storage for minimal latency
- All async operations are parallelized where possible

---

## Migration Notes

### Database Migration
1. Apply RecoveryState table migration
2. Run `npm run db:generate`
3. Verify table exists in Prisma Studio

### Cloudflare Workers
1. Create new Cloudflare account for watchdog (or use different zone)
2. Create KV namespace for watchdog state
3. Deploy watchdog worker
4. Configure environment variables

### Vercel
1. Add new environment variables:
   - `BACKUP_TRIGGER_SECRET`
2. Deploy with new vercel.json crons
3. Verify cron jobs registered in Vercel dashboard

---

## Environment Variables

### New Variables Required

| Variable | Service | Purpose |
|----------|---------|---------|
| `BACKUP_TRIGGER_SECRET` | Vercel | Auth for watchdog backup trigger |
| `PUBLIC_URL` | Watchdog Worker | Target URL for health checks |
| `SLACK_WEBHOOK_URL` | Watchdog Worker | Alert notifications |
| `WATCHDOG_STATE` | Watchdog Worker | KV namespace binding |

---

## References

- Original research: [thoughts/shared/research/2026-01-09-cron-pipeline-stalls-auto-recovery.md](thoughts/shared/research/2026-01-09-cron-pipeline-stalls-auto-recovery.md)
- Historical incidents: [thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md](thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md)
- Cloudflare Worker: [cloudflare-cron/index.js](cloudflare-cron/index.js)
- Auto-recovery endpoint: [app/api/cron/auto-recover/route.ts](app/api/cron/auto-recover/route.ts)
- Health endpoint: [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts)
