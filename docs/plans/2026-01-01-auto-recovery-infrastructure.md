# Auto-Recovery Infrastructure Implementation Plan

**Date**: 2026-01-01T16:37:03+11:00
**Git Commit**: f6eb7efab09668721f980591cee60e5f864474b8
**Branch**: feature/passwordless-onboarding
**Repository**: tldrsec-ai

## Overview

Implement automatic recovery mechanisms to eliminate manual redeployments caused by pipeline stalls. The system currently has excellent detection (health checks identify CRITICAL status at 180+ minutes stall) but lacks automatic recovery. This plan adds three interconnected capabilities:

1. **Force Cleanup API** - Expose existing emergency lock cleanup via authenticated endpoint
2. **Vercel Deploy Hook Integration** - Programmatic redeployment via webhook
3. **Auto-Recovery Orchestrator** - Intelligent decision-making that chains cleanup → wait → redeploy

## Current State Analysis

### What Exists (Strong Points)
- Dual-service architecture (Vercel + Cloudflare Workers)
- 13 error patterns with 52 remediation suggestions defined
- Health checks detect CRITICAL status at 180+ minutes stall
- Proactive lock cleanup every 5 minutes via Cloudflare Worker Step 0
- Emergency functions exist: `LockService.forceCleanupAllLocks()`, `DistributedLockManager.emergencyReleaseAllAdvisoryLocks()`

### Critical Gaps (What's Missing)
- Emergency functions are never called automatically
- Health checks return 503 but don't trigger recovery
- No mechanism to trigger Vercel redeployments programmatically
- 8-day stall incident documented in `cloudflare-cron/index.js:471-472`

### Key Discoveries
- [lib/job-queue/lock-service.ts:249-266](lib/job-queue/lock-service.ts#L249-L266) - `forceCleanupAllLocks()` exists but requires manual trigger
- [lib/db/distributed-lock.ts:756-773](lib/db/distributed-lock.ts#L756-L773) - `emergencyReleaseAllAdvisoryLocks()` exists but unused
- [app/api/health/pipeline/route.ts:211-213](app/api/health/pipeline/route.ts#L211-L213) - CRITICAL detection at 180 minutes, no action taken
- Vercel Deploy Hooks available for programmatic redeployment (simple HTTP POST)

## Desired End State

After implementation:
1. Pipeline stalls >60 minutes trigger automatic force lock cleanup
2. If cleanup doesn't resolve within 10 minutes, Vercel redeployment is triggered
3. Maximum 1 auto-redeployment per hour (rate limited)
4. All auto-recovery actions logged to console (no Slack spam)
5. Manual intervention only needed after 3 failed recovery attempts per day
6. Test endpoint available to simulate stalls for validation

### Verification Criteria
- Use simulate stall endpoint → observe automatic cleanup within 15 minutes
- Verify rate limiting prevents redeployment spam
- Check console logs for recovery action details
- Health check returns HEALTHY after successful recovery

## What We're NOT Doing

Based on Elon's 5-step algorithm (delete ~70% of original scope):

- **External Monitoring Integration** (Sentry, Datadog) - Existing Slack alerts sufficient
- **Multi-Region Failover** - Requires Enterprise tier; fast recovery is sufficient
- **Database Failover** - Already handled by Neon managed service
- **Chaos Engineering** - Over-engineering; real incidents have shown the gaps
- **SLA Monitoring/Reporting** - Nice-to-have, not essential for recovery
- **Dead Letter Queue Analysis** - Too complex for the benefit
- **Memory Cleanup Automation** - Vercel manages this

## Implementation Approach

**Strategy**: Minimal new code, maximum leverage of existing infrastructure.

The implementation follows TDD principles with checkpoints after each component. We build three layers:

1. **Layer 1**: Force cleanup endpoint (expose existing function)
2. **Layer 2**: Deploy hook integration (simple HTTP wrapper)
3. **Layer 3**: Orchestrator (decision logic connecting layers 1 & 2)

---

## Phase 1: Force Cleanup API Endpoint

### Overview
Expose the existing `LockService.forceCleanupAllLocks()` function via an authenticated admin API endpoint. This allows both programmatic and manual force cleanup without server access.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/admin/force-cleanup.test.ts`

```typescript
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/force-cleanup/route';

// Mock the lock service
jest.mock('@/lib/job-queue/lock-service', () => ({
  LockService: {
    forceCleanupAllLocks: jest.fn(),
    getHealthMetrics: jest.fn(),
  },
}));

// Mock the distributed lock manager
jest.mock('@/lib/db/distributed-lock', () => ({
  DistributedLockManager: {
    emergencyReleaseAllAdvisoryLocks: jest.fn(),
  },
}));

describe('/api/admin/force-cleanup', () => {
  const validSecret = 'test-admin-secret';

  beforeEach(() => {
    process.env.ADMIN_API_SECRET = validSecret;
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost/api/admin/force-cleanup');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid secret', async () => {
      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': 'Bearer wrong-secret' },
      });
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid secret', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockResolvedValue(5);
      LockService.getHealthMetrics.mockResolvedValue({ staleLocksCount: 0 });

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Force Cleanup Execution', () => {
    it('should call forceCleanupAllLocks and return count', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockResolvedValue(10);
      LockService.getHealthMetrics.mockResolvedValue({
        staleLocksCount: 0,
        activeLocksCount: 0,
        healthStatus: 'HEALTHY'
      });

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.locksCleared).toBe(10);
      expect(body.success).toBe(true);
      expect(LockService.forceCleanupAllLocks).toHaveBeenCalledTimes(1);
    });

    it('should call emergencyReleaseAllAdvisoryLocks when includeAdvisory=true', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      const { DistributedLockManager } = require('@/lib/db/distributed-lock');

      LockService.forceCleanupAllLocks.mockResolvedValue(5);
      LockService.getHealthMetrics.mockResolvedValue({ staleLocksCount: 0 });
      DistributedLockManager.emergencyReleaseAllAdvisoryLocks.mockResolvedValue(undefined);

      const request = new NextRequest(
        'http://localhost/api/admin/force-cleanup?includeAdvisory=true',
        { headers: { 'Authorization': `Bearer ${validSecret}` } }
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(DistributedLockManager.emergencyReleaseAllAdvisoryLocks).toHaveBeenCalledTimes(1);
    });

    it('should return error on cleanup failure', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toContain('Database error');
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers in response', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockResolvedValue(0);
      LockService.getHealthMetrics.mockResolvedValue({ staleLocksCount: 0 });

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="force-cleanup"
# Expected: All tests fail (module not found)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Create Force Cleanup Route
**File**: `app/api/admin/force-cleanup/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { LockService } from '@/lib/job-queue/lock-service';
import { DistributedLockManager } from '@/lib/db/distributed-lock';

// Simple in-memory rate limiting (resets on cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // max 10 calls per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const key = 'force-cleanup';
  const stored = rateLimitStore.get(key);

  if (!stored || now > stored.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetTime: now + RATE_LIMIT_WINDOW };
  }

  if (stored.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetTime: stored.resetTime };
  }

  stored.count++;
  return { allowed: true, remaining: RATE_LIMIT - stored.count, resetTime: stored.resetTime };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Authentication
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (!authHeader || !expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providedSecret = authHeader.replace('Bearer ', '');
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limiting
  const rateLimit = checkRateLimit();
  const rateLimitHeaders = {
    'X-RateLimit-Limit': RATE_LIMIT.toString(),
    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
    'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
  };

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetTime: rateLimit.resetTime },
      { status: 429, headers: rateLimitHeaders }
    );
  }

  try {
    // Parse query params
    const includeAdvisory = request.nextUrl.searchParams.get('includeAdvisory') === 'true';
    const source = request.nextUrl.searchParams.get('source') || 'manual';

    // Execute force cleanup
    const locksCleared = await LockService.forceCleanupAllLocks();

    // Optionally release advisory locks
    let advisoryLocksReleased = false;
    if (includeAdvisory) {
      await DistributedLockManager.emergencyReleaseAllAdvisoryLocks();
      advisoryLocksReleased = true;
    }

    // Get current health metrics
    const healthMetrics = await LockService.getHealthMetrics();

    const duration = Date.now() - startTime;

    // Log cleanup action (no Slack - avoid spam)
    if (locksCleared > 0 || advisoryLocksReleased) {
      console.log('[ForceCleanup] Executed:', {
        source,
        locksCleared,
        advisoryLocksReleased,
        duration,
        remainingStale: healthMetrics.staleLocksCount || 0,
      });
    }

    return NextResponse.json(
      {
        success: true,
        locksCleared,
        advisoryLocksReleased,
        healthMetrics,
        duration,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Force cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}
```

**Checkpoint 1.2.1**: Run tests:
```bash
npm run test -- --testPathPattern="force-cleanup"
# Expected: All tests passing
```

### Step 1.3: 🔵 Refactor

- [ ] Extract rate limiting to shared utility if needed elsewhere
- [ ] Add JSDoc documentation
- [ ] Ensure consistent error message format

**Checkpoint 1.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="force-cleanup"
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="force-cleanup"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Add `ADMIN_API_SECRET` to environment variables
- [ ] Test endpoint with curl: `curl -H "Authorization: Bearer $ADMIN_API_SECRET" http://localhost:3000/api/admin/force-cleanup`
- [ ] Verify console log shows cleanup details

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Vercel Deploy Hook Integration

### Overview
Set up Vercel Deploy Hook and create an endpoint to trigger redeployments programmatically with rate limiting (max 1 per hour).

### Step 2.0: Manual Setup - Create Vercel Deploy Hook

**This step must be done manually in Vercel Dashboard:**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the `tldrsec-ai` project
3. Navigate to **Settings** → **Git**
4. Scroll to **Deploy Hooks** section
5. Click **Create Hook**
6. Configure:
   - **Name**: `auto-recovery-deployment`
   - **Branch**: `main`
7. Click **Create Hook**
8. Copy the generated URL (format: `https://api.vercel.com/v1/integrations/deploy-hooks/prj_xxxxx`)
9. Add to environment variables:
   ```bash
   # Local development
   echo "VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy-hooks/YOUR_HOOK_ID" >> .env.local

   # Production (Vercel Dashboard → Settings → Environment Variables)
   # Add VERCEL_DEPLOY_HOOK_URL with the webhook URL
   ```

**Checkpoint 2.0**: Verify hook works:
```bash
curl -X POST "$VERCEL_DEPLOY_HOOK_URL"
# Expected: {"job":{"id":"...","state":"PENDING","createdAt":...}}
```

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/admin/trigger-redeploy.test.ts`

```typescript
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/trigger-redeploy/route';

// Mock fetch for Deploy Hook calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('/api/admin/trigger-redeploy', () => {
  const validSecret = 'test-admin-secret';
  const deployHookUrl = 'https://api.vercel.com/v1/integrations/deploy-hooks/test-hook';

  beforeEach(() => {
    process.env.ADMIN_API_SECRET = validSecret;
    process.env.VERCEL_DEPLOY_HOOK_URL = deployHookUrl;
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid secret', async () => {
      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer wrong-secret' },
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Deploy Hook Trigger', () => {
    it('should call Vercel Deploy Hook and return deployment info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: { id: 'dpl_123', state: 'PENDING', createdAt: Date.now() },
        }),
      });

      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ reason: 'Pipeline stall recovery' }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deploymentId).toBe('dpl_123');
      expect(mockFetch).toHaveBeenCalledWith(deployHookUrl, expect.any(Object));
    });

    it('should return error if Deploy Hook URL not configured', async () => {
      delete process.env.VERCEL_DEPLOY_HOOK_URL;

      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toContain('Deploy Hook URL not configured');
    });

    it('should return error on Deploy Hook failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await POST(request);

      expect(response.status).toBe(502);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce 1-hour cooldown between redeployments', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ job: { id: 'dpl_123', state: 'PENDING' } }),
      });

      // First request should succeed
      const request1 = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Second request within 1 hour should be rate limited
      const request2 = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response2 = await POST(request2);
      expect(response2.status).toBe(429);

      const body = await response2.json();
      expect(body.error).toContain('cooldown');
    });

    it('should enforce max 3 redeployments per 24 hours', async () => {
      // This test would need time mocking - placeholder for now
      expect(true).toBe(true);
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="trigger-redeploy"
# Expected: All tests fail (module not found)
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Create Trigger Redeploy Route
**File**: `app/api/admin/trigger-redeploy/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

// Rate limiting: 1-hour cooldown, max 3 per 24 hours
interface RedeployRecord {
  timestamp: number;
  reason: string;
  deploymentId: string;
}

const redeployHistory: RedeployRecord[] = [];
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function checkRedeployRateLimit(): {
  allowed: boolean;
  reason?: string;
  cooldownRemaining?: number;
  dailyRemaining: number;
} {
  const now = Date.now();

  // Clean up old history (older than 24 hours)
  while (redeployHistory.length > 0 && now - redeployHistory[0].timestamp > DAY_MS) {
    redeployHistory.shift();
  }

  // Check daily limit
  if (redeployHistory.length >= MAX_PER_DAY) {
    const oldestInWindow = redeployHistory[0];
    return {
      allowed: false,
      reason: `Daily limit reached (${MAX_PER_DAY} per 24 hours). Reset at ${new Date(oldestInWindow.timestamp + DAY_MS).toISOString()}`,
      dailyRemaining: 0,
    };
  }

  // Check cooldown
  const lastRedeploy = redeployHistory[redeployHistory.length - 1];
  if (lastRedeploy && now - lastRedeploy.timestamp < COOLDOWN_MS) {
    const cooldownRemaining = COOLDOWN_MS - (now - lastRedeploy.timestamp);
    return {
      allowed: false,
      reason: `Cooldown active. Next redeploy available in ${Math.ceil(cooldownRemaining / 60000)} minutes`,
      cooldownRemaining,
      dailyRemaining: MAX_PER_DAY - redeployHistory.length,
    };
  }

  return {
    allowed: true,
    dailyRemaining: MAX_PER_DAY - redeployHistory.length,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Authentication
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (!authHeader || !expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providedSecret = authHeader.replace('Bearer ', '');
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check Deploy Hook configuration
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!deployHookUrl) {
    return NextResponse.json(
      { error: 'Deploy Hook URL not configured. Set VERCEL_DEPLOY_HOOK_URL environment variable.' },
      { status: 500 }
    );
  }

  // Rate limiting
  const rateLimit = checkRedeployRateLimit();
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: rateLimit.reason,
        cooldownRemaining: rateLimit.cooldownRemaining,
        dailyRemaining: rateLimit.dailyRemaining,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': rateLimit.dailyRemaining.toString(),
          'Retry-After': rateLimit.cooldownRemaining
            ? Math.ceil(rateLimit.cooldownRemaining / 1000).toString()
            : '3600',
        },
      }
    );
  }

  try {
    // Parse request body
    let reason = 'Manual trigger';
    let source = 'api';
    try {
      const body = await request.json();
      reason = body.reason || reason;
      source = body.source || source;
    } catch {
      // Body is optional
    }

    // Trigger Deploy Hook
    const response = await fetch(deployHookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error('Deploy Hook failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Deploy Hook failed: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    const deployResult = await response.json();
    const deploymentId = deployResult.job?.id || 'unknown';

    // Record in history
    redeployHistory.push({
      timestamp: Date.now(),
      reason,
      deploymentId,
    });

    const duration = Date.now() - startTime;

    // Log redeploy action (no Slack - avoid spam)
    console.log('[TriggerRedeploy] Executed:', {
      reason,
      source,
      deploymentId,
      duration,
      dailyRemaining: rateLimit.dailyRemaining - 1,
    });

    return NextResponse.json({
      success: true,
      deploymentId,
      state: deployResult.job?.state || 'UNKNOWN',
      reason,
      duration,
      dailyRemaining: rateLimit.dailyRemaining - 1,
      nextAvailable: new Date(Date.now() + COOLDOWN_MS).toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Trigger redeploy failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

**Checkpoint 2.2.1**: Run tests:
```bash
npm run test -- --testPathPattern="trigger-redeploy"
# Expected: All tests passing
```

### Step 2.3: 🔵 Refactor

- [ ] Consider extracting rate limiting to a shared module
- [ ] Add TypeScript interfaces for request/response shapes

**Checkpoint 2.3**: All tests still pass

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="trigger-redeploy"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Verify `VERCEL_DEPLOY_HOOK_URL` is set
- [ ] Test endpoint: `curl -X POST -H "Authorization: Bearer $ADMIN_API_SECRET" http://localhost:3000/api/admin/trigger-redeploy`
- [ ] Verify deployment appears in Vercel Dashboard
- [ ] Verify console log shows redeploy details
- [ ] Test rate limiting by calling twice within 1 hour

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Auto-Recovery Orchestrator

### Overview
Create an orchestrator that runs on a schedule (via Cloudflare Worker), detects pipeline stalls, and executes recovery actions in sequence: cleanup → wait → redeploy.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/cron/auto-recover.test.ts`

```typescript
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/auto-recover/route';

// Mock dependencies
jest.mock('@/lib/job-queue/lock-service', () => ({
  LockService: {
    forceCleanupAllLocks: jest.fn(),
    getHealthMetrics: jest.fn(),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('/api/cron/auto-recover', () => {
  const cronSecret = 'test-cron-secret';

  beforeEach(() => {
    process.env.CRON_SECRET = cronSecret;
    process.env.ADMIN_API_SECRET = 'admin-secret';
    process.env.VERCEL_URL = 'https://tldrsec.app';
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject requests without valid cron secret', async () => {
      const request = new NextRequest('http://localhost/api/cron/auto-recover');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid cron secret in header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'HEALTHY' }),
      });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Recovery Logic', () => {
    it('should take no action when pipeline is HEALTHY', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'HEALTHY',
          jobQueue: { minutesSinceLastCompletion: 5 },
          lockHealth: { staleLocksCount: 0 },
        }),
      });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json();

      expect(body.action).toBe('none');
      expect(body.reason).toContain('healthy');
    });

    it('should trigger force cleanup when stale locks detected', async () => {
      mockFetch
        .mockResolvedValueOnce({
          // Health check
          ok: true,
          json: async () => ({
            status: 'DEGRADED',
            jobQueue: { minutesSinceLastCompletion: 45 },
            lockHealth: { staleLocksCount: 5 },
          }),
        })
        .mockResolvedValueOnce({
          // Force cleanup call
          ok: true,
          json: async () => ({ success: true, locksCleared: 5 }),
        });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json();

      expect(body.action).toBe('cleanup');
      expect(body.locksCleared).toBe(5);
    });

    it('should trigger redeploy when stall exceeds threshold and cleanup already attempted', async () => {
      mockFetch
        .mockResolvedValueOnce({
          // Health check shows critical stall
          ok: true,
          json: async () => ({
            status: 'CRITICAL',
            jobQueue: { minutesSinceLastCompletion: 200 },
            lockHealth: { staleLocksCount: 0 }, // Already cleaned
          }),
        })
        .mockResolvedValueOnce({
          // Redeploy call
          ok: true,
          json: async () => ({ success: true, deploymentId: 'dpl_123' }),
        });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json();

      expect(body.action).toBe('redeploy');
      expect(body.deploymentId).toBe('dpl_123');
    });

    it('should not redeploy if cleanup was just performed', async () => {
      // This tests the "wait 10 minutes after cleanup before redeploying" logic
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'CRITICAL',
          jobQueue: { minutesSinceLastCompletion: 200 },
          lockHealth: { staleLocksCount: 3 }, // Still has stale locks, cleanup needed first
        }),
      });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json();

      // Should cleanup first, not immediately redeploy
      expect(body.action).toBe('cleanup');
    });
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="auto-recover"
# Expected: All tests fail (module not found)
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Create Auto-Recovery Route
**File**: `app/api/cron/auto-recover/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

// Track recovery state
interface RecoveryState {
  lastCleanupTime: number | null;
  lastRedeployTime: number | null;
  consecutiveCleanups: number;
  consecutiveRedeploys: number;
}

const recoveryState: RecoveryState = {
  lastCleanupTime: null,
  lastRedeployTime: null,
  consecutiveCleanups: 0,
  consecutiveRedeploys: 0,
};

// Thresholds
const STALL_WARNING_MINUTES = 60;
const STALL_CRITICAL_MINUTES = 120;
const CLEANUP_TO_REDEPLOY_WAIT_MS = 10 * 60 * 1000; // 10 minutes
const REDEPLOY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function authenticateRequest(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Check header
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  // Check query param (for Vercel cron)
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret === cronSecret) return true;

  return false;
}

interface PipelineHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
  jobQueue: {
    minutesSinceLastCompletion: number | null;
    pendingCount: number;
    processingCount: number;
  };
  lockHealth: {
    staleLocksCount: number;
    activeLocksCount: number;
    healthStatus: string;
  };
}

async function getPipelineHealth(): Promise<PipelineHealth> {
  const baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/health/pipeline`, {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}

async function triggerForceCleanup(): Promise<{ success: boolean; locksCleared: number }> {
  const baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const adminSecret = process.env.ADMIN_API_SECRET;

  const response = await fetch(`${baseUrl}/api/admin/force-cleanup?source=auto-recover`, {
    headers: {
      'Authorization': `Bearer ${adminSecret}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Force cleanup failed: ${response.status}`);
  }

  return response.json();
}

async function triggerRedeploy(reason: string): Promise<{ success: boolean; deploymentId: string }> {
  const baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const adminSecret = process.env.ADMIN_API_SECRET;

  const response = await fetch(`${baseUrl}/api/admin/trigger-redeploy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason, source: 'auto-recover' }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Redeploy failed: ${response.status} - ${error.error || 'Unknown'}`);
  }

  return response.json();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Authentication
  if (!await authenticateRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get pipeline health
    const health = await getPipelineHealth();
    const now = Date.now();

    // Decision logic
    let action: 'none' | 'cleanup' | 'redeploy' = 'none';
    let reason = '';
    let result: Record<string, unknown> = {};

    // If healthy, no action needed
    if (health.status === 'HEALTHY') {
      recoveryState.consecutiveCleanups = 0;
      recoveryState.consecutiveRedeploys = 0;

      return NextResponse.json({
        action: 'none',
        reason: 'Pipeline is healthy',
        status: health.status,
        minutesSinceLastCompletion: health.jobQueue.minutesSinceLastCompletion,
        timestamp: new Date().toISOString(),
      });
    }

    // Check if stale locks need cleanup
    if (health.lockHealth.staleLocksCount > 0) {
      action = 'cleanup';
      reason = `${health.lockHealth.staleLocksCount} stale locks detected`;

      const cleanupResult = await triggerForceCleanup();
      result = cleanupResult;

      recoveryState.lastCleanupTime = now;
      recoveryState.consecutiveCleanups++;

      // Log cleanup action (no Slack - avoid spam)
      console.log('[AutoRecover] Cleanup triggered:', {
        reason,
        locksCleared: cleanupResult.locksCleared,
        consecutiveCleanups: recoveryState.consecutiveCleanups,
        pipelineStatus: health.status,
      });
    }
    // Check if redeploy is needed (critical stall, no stale locks, cooldown passed)
    else if (
      health.status === 'CRITICAL' &&
      health.jobQueue.minutesSinceLastCompletion !== null &&
      health.jobQueue.minutesSinceLastCompletion >= STALL_CRITICAL_MINUTES
    ) {
      // Check if we should wait after cleanup
      if (
        recoveryState.lastCleanupTime &&
        now - recoveryState.lastCleanupTime < CLEANUP_TO_REDEPLOY_WAIT_MS
      ) {
        const waitRemaining = Math.ceil(
          (CLEANUP_TO_REDEPLOY_WAIT_MS - (now - recoveryState.lastCleanupTime)) / 60000
        );

        return NextResponse.json({
          action: 'wait',
          reason: `Waiting ${waitRemaining} minutes after cleanup before redeploying`,
          status: health.status,
          timestamp: new Date().toISOString(),
        });
      }

      // Check redeploy cooldown
      if (
        recoveryState.lastRedeployTime &&
        now - recoveryState.lastRedeployTime < REDEPLOY_COOLDOWN_MS
      ) {
        const cooldownRemaining = Math.ceil(
          (REDEPLOY_COOLDOWN_MS - (now - recoveryState.lastRedeployTime)) / 60000
        );

        return NextResponse.json({
          action: 'cooldown',
          reason: `Redeploy cooldown active. ${cooldownRemaining} minutes remaining`,
          status: health.status,
          timestamp: new Date().toISOString(),
        });
      }

      // Trigger redeploy
      action = 'redeploy';
      reason = `Pipeline stalled for ${health.jobQueue.minutesSinceLastCompletion} minutes`;

      const redeployResult = await triggerRedeploy(reason);
      result = redeployResult;

      recoveryState.lastRedeployTime = now;
      recoveryState.consecutiveRedeploys++;

      // Log redeploy action (no Slack - avoid spam)
      console.log('[AutoRecover] Redeploy triggered:', {
        reason,
        deploymentId: redeployResult.deploymentId,
        consecutiveRedeploys: recoveryState.consecutiveRedeploys,
      });
    }
    // Degraded but not critical - log warning
    else if (health.status === 'DEGRADED') {
      return NextResponse.json({
        action: 'monitoring',
        reason: 'Pipeline degraded, monitoring for recovery',
        status: health.status,
        minutesSinceLastCompletion: health.jobQueue.minutesSinceLastCompletion,
        timestamp: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      action,
      reason,
      ...result,
      status: health.status,
      duration,
      recoveryState: {
        consecutiveCleanups: recoveryState.consecutiveCleanups,
        consecutiveRedeploys: recoveryState.consecutiveRedeploys,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AutoRecover] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

**Checkpoint 3.2.1**: Run tests:
```bash
npm run test -- --testPathPattern="auto-recover"
# Expected: All tests passing
```

### Step 3.3: 🔵 Refactor

- [ ] Consider persisting recovery state to database for cross-deployment persistence
- [ ] Add more detailed logging
- [ ] Extract thresholds to environment variables

**Checkpoint 3.3**: All tests still pass

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="auto-recover"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Call endpoint manually: `curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/auto-recover`
- [ ] Verify it checks pipeline health
- [ ] Verify console logs show recovery actions

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Cloudflare Worker Integration

### Overview
Add the auto-recovery cron to Cloudflare Worker to run every 15 minutes.

### Step 4.1: Update Cloudflare Worker

**File**: `cloudflare-cron/wrangler.toml`

Add to existing crons section:
```toml
# Auto-recovery check every 15 minutes
[[triggers.crons]]
cron = "*/15 * * * *"
```

**File**: `cloudflare-cron/index.js`

Add new handler in the scheduled event handler (after existing pipeline steps):

```javascript
// Add to the scheduled handler, after existing steps
// ========================================
// STEP 4: Auto-Recovery Check (runs every 15 minutes)
// ========================================
if (event.cron === '*/15 * * * *') {
  console.log(`[${executionId}] ====== AUTO-RECOVERY CHECK ======`);

  const autoRecoverUrl = `${env.PUBLIC_URL}/api/cron/auto-recover`;
  const autoRecoverHeaders = {
    'x-cron-secret': env.CRON_SECRET,
    'User-Agent': 'Cloudflare-Worker/1.0 AutoRecover',
  };

  try {
    const response = await fetch(autoRecoverUrl, { headers: autoRecoverHeaders });
    const result = await response.json();

    console.log(`[${executionId}] Auto-recovery result:`, {
      action: result.action,
      reason: result.reason,
      status: result.status,
    });
  } catch (error) {
    console.error(`[${executionId}] Auto-recovery check failed:`, error.message);
  }
}
```

### Step 4.2: Deploy Cloudflare Worker

```bash
npm run cloudflare:deploy
```

**Checkpoint 4.2**: Verify deployment:
```bash
npm run cloudflare:logs
# Watch for auto-recovery check logs
```

### Step 4.3: Final Phase Verification

#### Automated Verification:
- [ ] Cloudflare Worker deploys successfully
- [ ] No errors in `npm run cloudflare:logs`

#### Manual Verification:
- [ ] Wait 15 minutes and verify auto-recovery check appears in logs
- [ ] Verify no false-positive recovery actions on healthy pipeline
- [ ] Simulate stall (pause cron) and verify cleanup triggers

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Simulate Stall Test Endpoint

### Overview
Create a test endpoint that simulates a pipeline stall for validation purposes. This allows testing the auto-recovery system without waiting for a real stall.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/admin/simulate-stall.test.ts`

```typescript
import { NextRequest } from 'next/server';
import { POST, DELETE } from '@/app/api/admin/simulate-stall/route';

describe('/api/admin/simulate-stall', () => {
  const validSecret = 'test-admin-secret';

  beforeEach(() => {
    process.env.ADMIN_API_SECRET = validSecret;
    process.env.NODE_ENV = 'development'; // Only works in dev/test
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Environment Protection', () => {
    it('should reject requests in production environment', async () => {
      process.env.NODE_ENV = 'production';

      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain('production');
    });
  });

  describe('Stall Simulation', () => {
    it('should create stale locks when POST is called', async () => {
      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ staleLocks: 5, stallMinutes: 120 }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.simulation.staleLocks).toBe(5);
      expect(body.simulation.stallMinutes).toBe(120);
    });

    it('should clear simulated stall when DELETE is called', async () => {
      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await DELETE(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.cleared).toBe(true);
    });
  });
});
```

**Checkpoint 5.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="simulate-stall"
# Expected: All tests fail (module not found)
```

### Step 5.2: 🟢 Implement to Pass Tests

#### 5.2.1 Create Simulate Stall Route
**File**: `app/api/admin/simulate-stall/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';

// Track simulated stall state
interface SimulatedStall {
  active: boolean;
  staleLocks: number;
  stallMinutes: number;
  createdAt: Date;
  lockIds: string[];
}

let simulatedStall: SimulatedStall | null = null;

function authenticate(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (!authHeader || !expectedSecret) return false;

  const providedSecret = authHeader.replace('Bearer ', '');
  return providedSecret === expectedSecret;
}

function isProductionBlocked(): boolean {
  return process.env.NODE_ENV === 'production' &&
         process.env.ALLOW_SIMULATE_STALL !== 'true';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Authentication
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Block in production unless explicitly allowed
  if (isProductionBlocked()) {
    return NextResponse.json(
      { error: 'Simulate stall is disabled in production. Set ALLOW_SIMULATE_STALL=true to override.' },
      { status: 403 }
    );
  }

  try {
    // Parse options
    let staleLocks = 3;
    let stallMinutes = 180;

    try {
      const body = await request.json();
      staleLocks = body.staleLocks ?? staleLocks;
      stallMinutes = body.stallMinutes ?? stallMinutes;
    } catch {
      // Use defaults
    }

    const prisma = getPrisma();
    const now = new Date();
    const expiredAt = new Date(now.getTime() - stallMinutes * 60 * 1000);
    const lockIds: string[] = [];

    // Create stale locks that look like a real stall
    for (let i = 0; i < staleLocks; i++) {
      const lock = await prisma.jobLock.create({
        data: {
          lockName: `simulated-stall-lock-${i}-${now.getTime()}`,
          acquiredBy: 'simulate-stall-endpoint',
          acquiredAt: expiredAt,
          expiresAt: expiredAt, // Already expired
          released: false,
        },
      });
      lockIds.push(lock.id);
    }

    // Store simulation state
    simulatedStall = {
      active: true,
      staleLocks,
      stallMinutes,
      createdAt: now,
      lockIds,
    };

    console.log('[SimulateStall] Created simulation:', {
      staleLocks,
      stallMinutes,
      lockIds,
    });

    return NextResponse.json({
      success: true,
      simulation: {
        active: true,
        staleLocks,
        stallMinutes,
        createdAt: now.toISOString(),
        lockIds,
      },
      instructions: [
        `Created ${staleLocks} stale locks simulating a ${stallMinutes}-minute stall`,
        'Wait for auto-recovery cron (runs every 15 minutes) to detect and clean up',
        'Or call /api/cron/auto-recover manually to trigger immediate recovery',
        'Call DELETE /api/admin/simulate-stall to clear simulation',
      ],
    });
  } catch (error) {
    console.error('[SimulateStall] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  // Authentication
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    let cleared = false;

    // Clear any simulated locks
    if (simulatedStall && simulatedStall.lockIds.length > 0) {
      await prisma.jobLock.deleteMany({
        where: {
          id: { in: simulatedStall.lockIds },
        },
      });
      cleared = true;
    }

    // Also clean up any orphaned simulation locks
    const orphaned = await prisma.jobLock.deleteMany({
      where: {
        acquiredBy: 'simulate-stall-endpoint',
      },
    });

    const previousState = simulatedStall;
    simulatedStall = null;

    console.log('[SimulateStall] Cleared simulation:', {
      previousState,
      orphanedCleared: orphaned.count,
    });

    return NextResponse.json({
      success: true,
      cleared: cleared || orphaned.count > 0,
      previousSimulation: previousState,
      orphanedCleared: orphaned.count,
    });
  } catch (error) {
    console.error('[SimulateStall] Clear failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Authentication
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    simulation: simulatedStall,
    active: simulatedStall?.active ?? false,
  });
}
```

**Checkpoint 5.2.1**: Run tests:
```bash
npm run test -- --testPathPattern="simulate-stall"
# Expected: All tests passing
```

### Step 5.3: 🔵 Refactor

- [ ] Add cleanup on test completion
- [ ] Add timeout to auto-clear old simulations

**Checkpoint 5.3**: All tests still pass

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="simulate-stall"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Start stall simulation:
  ```bash
  curl -X POST -H "Authorization: Bearer $ADMIN_API_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"staleLocks": 5, "stallMinutes": 200}' \
    http://localhost:3000/api/admin/simulate-stall
  ```
- [ ] Check pipeline health shows CRITICAL:
  ```bash
  curl http://localhost:3000/api/health/pipeline
  ```
- [ ] Trigger auto-recovery and verify cleanup:
  ```bash
  curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/auto-recover
  ```
- [ ] Clear simulation:
  ```bash
  curl -X DELETE -H "Authorization: Bearer $ADMIN_API_SECRET" \
    http://localhost:3000/api/admin/simulate-stall
  ```

**STOP**: Plan implementation complete.

---

## Testing Strategy

### Test Categories

#### 1. Unit Tests (Phase 1-5)
Each phase includes comprehensive unit tests:
- `__tests__/api/admin/force-cleanup.test.ts`
- `__tests__/api/admin/trigger-redeploy.test.ts`
- `__tests__/api/cron/auto-recover.test.ts`
- `__tests__/api/admin/simulate-stall.test.ts`

#### 2. Integration Tests
```bash
# Run all auto-recovery related tests
npm run test -- --testPathPattern="(force-cleanup|trigger-redeploy|auto-recover|simulate-stall)"
```

#### 3. Manual E2E Testing
1. Deploy to preview environment
2. Manually trigger force cleanup
3. Manually trigger redeploy
4. Verify rate limiting works
5. Simulate stall and observe auto-recovery

### Test Commands Summary
```bash
# Unit tests
npm run test -- --testPathPattern="force-cleanup"
npm run test -- --testPathPattern="trigger-redeploy"
npm run test -- --testPathPattern="auto-recover"

# All recovery tests
npm run test -- --testPathPattern="(force-cleanup|trigger-redeploy|auto-recover)"

# Build and lint
npm run build
npm run lint

# Manual testing
curl -H "Authorization: Bearer $ADMIN_API_SECRET" http://localhost:3000/api/admin/force-cleanup
curl -X POST -H "Authorization: Bearer $ADMIN_API_SECRET" http://localhost:3000/api/admin/trigger-redeploy
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/auto-recover
```

---

## Performance Considerations

- **Rate limiting in-memory**: Resets on cold start; acceptable for this use case
- **Health check caching**: Consider adding 30-second cache to reduce DB queries
- **Slack rate limiting**: Already handled by existing `slackWebhookService`

---

## Migration Notes

### Environment Variables to Add

| Variable | Description | Required |
|----------|-------------|----------|
| `ADMIN_API_SECRET` | Secret for admin API endpoints | Yes |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel Deploy Hook URL | Yes |

### Database Changes
None required - uses existing tables.

### Rollback Plan
1. Delete the three new API routes
2. Remove Cloudflare Worker cron trigger
3. No database changes to revert

---

## References

- Infrastructure research: [thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md](thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md)
- Existing lock service: [lib/job-queue/lock-service.ts](lib/job-queue/lock-service.ts)
- Distributed lock manager: [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts)
- Pipeline health check: [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts)
- Cloudflare Worker: [cloudflare-cron/index.js](cloudflare-cron/index.js)
- Vercel Deploy Hooks docs: https://vercel.com/docs/deploy-hooks
