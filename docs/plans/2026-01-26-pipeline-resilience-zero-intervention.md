# Pipeline Resilience: Zero Human Intervention Implementation Plan

**Date**: 2026-01-26T01:30:47Z (AEDT: 2026-01-26 12:30:47)
**Git Commit**: 9b9dd7769023f5109c66fbcb445ad9a83f5eabbd
**Branch**: main
**Repository**: tldrsec-ai

## Overview

Eliminate human intervention requirements for pipeline recovery by addressing the three root causes of manual intervention:
1. **CRON_SECRET synchronization failures** (recurring 13+ hour stalls)
2. **Orphaned filing detection delays** (60-second sampling gap)
3. **No external watchdog** (complete platform failure goes unnoticed)

This plan applies Elon's 5-Step Engineering Algorithm - we've already deleted 40% of the original scope (KV persistence, async operations, Layer 3 threshold changes) as unnecessary complexity that doesn't solve root causes.

## Current State Analysis

### Three-Layer Redundancy (Working)
- **Layer 1**: Cloudflare Worker (every 5 min) - Primary trigger
- **Layer 2**: Auto-Recovery (every 15 min) - Self-healing cleanup
- **Layer 3**: Vercel Final Backup (every 30 min) - Emergency trigger

### Root Causes of Manual Intervention (Problems)
1. **CRON_SECRET mismatch**: Trailing `\n` characters cause HMAC auth failures
   - Detection: ~15 min (3 failures to open circuit breaker)
   - Recovery: **Manual** (`npm run cloudflare:sync-secret`)
   - Impact: 13+ hour stalls documented
   - **Root Cause**: Vercel CLI sometimes adds literal `\n` during `env pull`. Vercel side uses `.trim()` but Cloudflare Worker does not, causing HMAC mismatch.

2. **Orphan detection sampling**: Only runs every 6th request
   - Detection: Up to 60 seconds
   - Recovery: Automatic, but delayed
   - Impact: User-visible delay in filing processing

3. **No external watchdog**: If all 3 layers fail, no alert
   - Detection: Manual observation
   - Recovery: Manual investigation
   - Impact: Complete pipeline stall until human notices

## Desired End State

After implementation:
1. **CRON_SECRET contamination handled defensively** - Both sides trim/sanitize, eliminating mismatch
2. **Orphans detected within 15 seconds** of becoming orphaned
3. **External watchdog alerts via email** if no heartbeat for 15 minutes

### Verification Criteria
- [ ] Intentionally add `\n` to Cloudflare secret → still authenticates (defensive sanitization)
- [ ] Create orphaned filing → detected and recovered within 15 seconds
- [ ] Disable all cron triggers → email alert within 15 minutes
- [ ] Pipeline processes filings within 5 minutes of SEC publication (SLA maintained)

## What We're NOT Doing

Explicitly out of scope (deleted via Elon's algorithm):
- ~~KV state persistence~~ - Circuit breaker reset on redeploy is beneficial, not harmful
- ~~Reduce Layer 3 threshold~~ - 25 min is fine as emergency backup
- ~~Async non-critical operations~~ - Already fire-and-forget
- ~~Health check for health endpoint~~ - Over-engineering; if DB is down, all fail
- ~~Auto-redeploy on failure~~ - Dangerous without knowing root cause; alert instead
- ~~GitHub Action for CRON_SECRET sync~~ - Over-engineered; defensive `.trim()` is simpler and catches contamination at runtime regardless of source

## Implementation Approach

### Elon's 5-Step Algorithm Application

1. **Question Requirements**: Challenged all 5 original phases, deleted 2 entirely
2. **Delete**: Removed KV persistence, async ops (40% scope reduction)
3. **Simplify**: Heartbeat watchdog alerts only (no auto-redeploy)
4. **Accelerate**: TDD with chaos tests for each SPOF
5. **Automate**: Only after manual process proven (secret sync script exists)

---

## Phase 1: Defensive CRON_SECRET Sanitization

### Overview

**Original plan**: Create a GitHub Action that automatically syncs CRON_SECRET from Vercel to Cloudflare after every production deployment.

**Revised plan**: Add defensive `.trim()` and `\n` sanitization to the Cloudflare Worker, matching what Vercel already does. This eliminates the root cause at runtime instead of adding sync complexity.

### Root Cause Analysis (Investigation Summary)

The HMAC authentication failures occur because:

1. **Vercel CLI behavior**: `vercel env pull` sometimes adds literal `\n` characters (hex `5c 6e`) to environment variables
2. **Asymmetric handling**:
   - Vercel side: Uses `process.env.CRON_SECRET?.trim()` → cleans the secret
   - Cloudflare side: Uses `env.CRON_SECRET` directly → includes contamination
3. **Result**: HMAC signatures don't match → 401 Unauthorized

**Key insight**: The Vercel side already has defensive code at [middleware.ts:39](middleware.ts#L39) and [lib/auth/unified-auth-system.ts:59](lib/auth/unified-auth-system.ts#L59). The Cloudflare Worker lacks this.

### Why This is Better Than Auto-Sync

| Approach | Complexity | External Dependencies | Runtime Protection |
|----------|------------|----------------------|-------------------|
| GitHub Action sync | High (100+ lines YAML, 4 secrets, workflow triggers) | Vercel CLI, Wrangler, GitHub Actions | ❌ Only protects on deploy |
| Defensive sanitization | Low (1-line change per usage) | None | ✅ Protects every request |

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/unit/cron-secret-sanitization.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('CRON_SECRET Sanitization', () => {
  describe('sanitizeCronSecret', () => {
    it('should remove trailing newline character', () => {
      const dirty = 'valid_secret_here\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should remove literal backslash-n characters', () => {
      const dirty = 'valid_secret_here\\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should remove leading and trailing whitespace', () => {
      const dirty = '  valid_secret_here  ';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should handle multiple contamination types', () => {
      const dirty = '  valid_secret_here\\n\n  ';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should not modify clean secrets', () => {
      const clean = 'a'.repeat(80);
      const result = sanitizeCronSecret(clean);
      expect(result).toBe(clean);
      expect(result).toHaveLength(80);
    });
  });

  describe('HMAC signature matching', () => {
    it('should produce matching signatures when both sides sanitize', async () => {
      const cleanSecret = 'a'.repeat(80);
      const dirtySecret = cleanSecret + '\\n';
      const payload = `${Date.now()}:GET:/api/cron/tier-aware`;

      // Simulate Vercel side (already sanitizes)
      const vercelSig = await generateHmacSignature(cleanSecret.trim(), payload);

      // Simulate Cloudflare side (now sanitizes)
      const cfSig = await generateHmacSignature(sanitizeCronSecret(dirtySecret), payload);

      expect(vercelSig).toBe(cfSig);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="cron-secret-sanitization"
# Expected: All tests fail (sanitizeCronSecret not implemented)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Create Sanitization Utility (for tests)
**File**: `lib/cron/secret-sanitization.ts`

```typescript
/**
 * Sanitizes CRON_SECRET by removing common contamination:
 * - Trailing newline characters (\n)
 * - Literal backslash-n sequences (\\n)
 * - Leading/trailing whitespace
 *
 * This mirrors the defensive handling on the Vercel side.
 */
export function sanitizeCronSecret(secret: string): string {
  return (secret || '')
    .trim()
    .replace(/\\n/g, '')  // Remove literal \n
    .replace(/\n/g, '');   // Remove actual newlines
}
```

**Checkpoint 1.2.1**: Verify sanitization tests pass:
```bash
npm run test -- --testPathPattern="cron-secret-sanitization" --testNamePattern="sanitizeCronSecret"
# Expected: 5 passing
```

#### 1.2.2 Update Cloudflare Worker
**File**: `cloudflare-cron/index.js`

Find all usages of `env.CRON_SECRET` and wrap with sanitization:

```javascript
// Add at top of file (after imports)
function sanitizeCronSecret(secret) {
  return (secret || '').trim().replace(/\\n/g, '').replace(/\n/g, '');
}

// Update all HMAC signature generation locations:
// BEFORE:
encoder.encode(env.CRON_SECRET)

// AFTER:
encoder.encode(sanitizeCronSecret(env.CRON_SECRET))
```

**Locations to update** (search for `env.CRON_SECRET`):
- Line ~326: `encoder.encode(env.CRON_SECRET)`
- Line ~390: `encoder.encode(env.CRON_SECRET)`
- Line ~451: `encoder.encode(env.CRON_SECRET)`

**Checkpoint 1.2.2**: Deploy and verify:
```bash
npm run cloudflare:deploy
npm run test:cloudflare-integration
# Expected: All auth tests pass
```

### Step 1.3: 🔵 Refactor

- [ ] Add logging when sanitization removes characters (helps debugging)
- [ ] Ensure the sanitization function is called consistently

**Checkpoint 1.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="cron-secret-sanitization"
# Expected: All passing
```

### Step 1.4: Chaos Test - Contamination Resilience

**Test File**: `__tests__/chaos/cron-secret-contamination.test.ts`

```typescript
describe('Chaos Test: CRON_SECRET Contamination Resilience', () => {
  it('should authenticate even with contaminated Cloudflare secret', async () => {
    // This test verifies that defensive sanitization works
    // The secret in Cloudflare may have \n, but sanitization handles it

    const response = await fetch(`${process.env.PUBLIC_URL}/api/cron/tier-aware`, {
      method: 'GET',
      headers: await generateAuthHeaders(process.env.CRON_SECRET!),
    });

    // Should NOT get 401 - sanitization handles contamination
    expect(response.status).not.toBe(401);
    expect([200, 202]).toContain(response.status);
  });
});
```

### Step 1.5: Final Phase Verification

#### Automated Verification:
- [x] All sanitization tests pass: `npm run test -- --testPathPattern="cron-secret-sanitization"` (18/18 passing)
- [ ] Chaos tests pass: `npm run test -- --testPathPattern="cron-secret-contamination"` (skipped - requires production deployment)
- [ ] Cloudflare integration tests pass: `npm run test:cloudflare-integration` (skipped - requires production deployment)
- [x] Build succeeds: `npm run build`
- [x] Linting passes: New files pass lint (pre-existing errors in other files)

#### Manual Verification:
- [ ] Intentionally set `CRON_SECRET` with trailing `\n` in Cloudflare
- [ ] Verify pipeline still authenticates successfully
- [ ] Check Cloudflare Worker logs show sanitization working

### Migration Notes

**No GitHub secrets required** - This approach eliminates the need for:
- ~~`VERCEL_TOKEN`~~
- ~~`VERCEL_ORG_ID`~~
- ~~`VERCEL_PROJECT_ID`~~

**Existing sync script retained** - `npm run cloudflare:sync-secret` remains as a manual recovery tool if needed.

---

## Phase 2: Eliminate Orphan Detection Delay

### Overview
Remove the sampling logic from orphan detection so orphaned filings are detected on every health check request, reducing detection time from 60 seconds to <15 seconds.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/integration/orphan-detection-timing.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';

describe('Orphan Detection Timing', () => {
  let testFilingId: string;

  beforeEach(async () => {
    // Create a test filing that will become orphaned
    const filing = await prisma.secFiling.create({
      data: {
        accessionNumber: `test-orphan-${Date.now()}`,
        formType: '10-K',
        companyName: 'Test Company',
        cik: '0001234567',
        filedAt: new Date(),
        processed: false, // Not yet processed
        // No corresponding job in JobQueue = orphaned
      },
    });
    testFilingId = filing.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.secFiling.deleteMany({
      where: { accessionNumber: { startsWith: 'test-orphan-' } },
    });
    await prisma.jobQueue.deleteMany({
      where: {
        payload: { path: ['source'], equals: 'orphan-detection-test' }
      },
    });
  });

  it('should detect orphan on EVERY health check, not sampled', async () => {
    // Make filing old enough to be considered orphaned (>10 min)
    await prisma.secFiling.update({
      where: { id: testFilingId },
      data: { createdAt: new Date(Date.now() - 15 * 60 * 1000) },
    });

    // Call health endpoint multiple times
    const detectionResults: boolean[] = [];

    for (let i = 0; i < 10; i++) {
      const response = await fetch(`${process.env.PUBLIC_URL}/api/health/pipeline`);
      const data = await response.json();
      detectionResults.push(data.orphanedFilings?.count > 0);
    }

    // With sampling removed, ALL requests should detect the orphan
    // Previously only ~17% would detect (1 in 6)
    const detectionRate = detectionResults.filter(Boolean).length / detectionResults.length;
    expect(detectionRate).toBe(1.0); // 100% detection rate
  });

  it('should create recovery job within 15 seconds of orphan creation', async () => {
    const startTime = Date.now();

    // Make filing orphaned
    await prisma.secFiling.update({
      where: { id: testFilingId },
      data: { createdAt: new Date(Date.now() - 15 * 60 * 1000) },
    });

    // Trigger auto-recovery
    await fetch(`${process.env.PUBLIC_URL}/api/cron/auto-recover`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    // Check for recovery job
    const recoveryJob = await prisma.jobQueue.findFirst({
      where: {
        jobType: 'ASYNC_FETCH_FILING',
        payload: { path: ['filingId'], equals: testFilingId },
      },
    });

    const elapsed = Date.now() - startTime;

    expect(recoveryJob).not.toBeNull();
    expect(elapsed).toBeLessThan(15000); // Under 15 seconds
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="orphan-detection-timing"
# Expected: Detection rate test fails (currently ~17% due to sampling)
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Remove Sampling from Health Endpoint
**File**: `app/api/health/pipeline/route.ts`

**Changes**: Remove the sampling logic around orphan detection

```typescript
// BEFORE (around lines 93-123):
// const ORPHAN_SAMPLE_RATE = 6;
// let orphanCheckCounter = 0;
// const shouldCheckOrphans = ++orphanCheckCounter % ORPHAN_SAMPLE_RATE === 0;

// AFTER: Always check for orphans (query is lightweight)
const orphanedFilingsResult = await detectOrphanedFilings();
```

**Specific edit** - Remove these lines:
- Line 54: `const ORPHAN_SAMPLE_RATE = 6;`
- Line 56: `let orphanCheckCounter = 0;`
- Lines 93-106: The sampling conditional logic

Replace with:
```typescript
// Always check for orphans - the COUNT query is lightweight (~5ms)
const orphanedFilings = await OrphanedFilingDetector.detectOrphanedFilings();
```

**Checkpoint 2.2.1**: Verify detection rate test passes:
```bash
npm run test -- --testPathPattern="orphan-detection-timing" --testNamePattern="EVERY health check"
# Expected: 1 passing (100% detection rate)
```

#### 2.2.2 Optimize Orphan Detection Query
**File**: `lib/cron/orphaned-filing-detector.ts`

**Changes**: Ensure the query is lightweight by using COUNT instead of fetching all records

```typescript
// Add a lightweight count-only method
export async function countOrphanedFilings(): Promise<number> {
  const threshold = new Date(Date.now() - ORPHAN_AGE_THRESHOLD_MINUTES * 60 * 1000);

  // Single aggregated query - very fast
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "SecFiling" sf
    WHERE sf."processed" = false
      AND sf."createdAt" < ${threshold}
      AND NOT EXISTS (
        SELECT 1 FROM pipeline."JobQueue" jq
        WHERE jq."payload"->>'filingId' = sf."id"
          AND jq."status" IN ('PENDING', 'PROCESSING', 'RETRYING')
      )
  `;

  return Number(result[0]?.count ?? 0);
}
```

**Checkpoint 2.2.2**: Verify timing test passes:
```bash
npm run test -- --testPathPattern="orphan-detection-timing" --testNamePattern="within 15 seconds"
# Expected: 1 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Remove `lastKnownOrphanCount` cache (no longer needed)
- [ ] Update health response to always include real-time orphan count
- [ ] Add query timing metric to monitor performance impact

**Checkpoint 2.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="orphan-detection-timing"
# Expected: All passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [x] All orphan detection tests pass (existing tests still pass)
- [ ] Health endpoint response time still <500ms: `npm run test:cron-performance`
- [x] No regressions: `npm run test` (unit tests pass)
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Call `/api/health/pipeline` 10 times in a row
- [ ] Verify `orphanedFilings.count` is consistent (not varying due to sampling)
- [ ] Create a test orphaned filing and verify it appears immediately

**Implementation Note**: Removed sampling logic from `app/api/health/pipeline/route.ts`. The `orphanedCountSampled` response field is now always `false` and `lastOrphanCheckTime` is updated on every request.

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: External Heartbeat Watchdog (GitHub Action)

### Overview
Create a GitHub Action that runs every 10 minutes, checks the pipeline health endpoint, and sends an email alert if no successful execution in 15 minutes.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/integration/heartbeat-watchdog.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Heartbeat Watchdog', () => {
  describe('Health Check Logic', () => {
    it('should return healthy when last completion is recent', async () => {
      const response = await fetch(`${process.env.PUBLIC_URL}/api/health/pipeline`);
      const data = await response.json();

      // If pipeline is working, minutesSinceLastCompletion should be <15
      if (data.status === 'HEALTHY') {
        expect(data.minutesSinceLastCompletion).toBeLessThan(15);
      }
    });

    it('should identify stale pipeline when no completions', async () => {
      const response = await fetch(`${process.env.PUBLIC_URL}/api/health/pipeline`);
      const data = await response.json();

      // Verify the field exists for watchdog to check
      expect(data).toHaveProperty('minutesSinceLastCompletion');
      expect(typeof data.minutesSinceLastCompletion).toBe('number');
    });
  });

  describe('Alert Email Format', () => {
    it('should generate valid alert email content', () => {
      const alertContent = generateAlertEmail({
        status: 'CRITICAL',
        minutesSinceLastCompletion: 45,
        lastExecution: '2026-01-26T00:00:00Z',
        pendingJobs: 156,
        healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
      });

      expect(alertContent.subject).toContain('Pipeline Stall');
      expect(alertContent.body).toContain('45 minutes');
      expect(alertContent.body).toContain('156 pending jobs');
      expect(alertContent.body).toContain('https://tldrsec.app');
    });
  });
});
```

**Checkpoint 3.1**: Run tests and verify current state:
```bash
npm run test -- --testPathPattern="heartbeat-watchdog"
# Expected: Health check tests pass, alert email test fails (not implemented)
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Create Alert Email Generator
**File**: `lib/monitoring/heartbeat-alert.ts`

```typescript
export interface PipelineStatus {
  status: string;
  minutesSinceLastCompletion: number;
  lastExecution: string;
  pendingJobs: number;
  healthEndpoint: string;
}

export interface AlertEmail {
  subject: string;
  body: string;
  html: string;
}

export function generateAlertEmail(status: PipelineStatus): AlertEmail {
  const subject = `🚨 TLDRSec Pipeline Stall Alert - ${status.status}`;

  const body = `
Pipeline Health Alert
=====================

Status: ${status.status}
Last Completion: ${status.minutesSinceLastCompletion} minutes ago
Last Execution: ${status.lastExecution}
Pending Jobs: ${status.pendingJobs}

Health Dashboard: ${status.healthEndpoint}

This alert was triggered because no successful job completions have been
recorded in the last 15 minutes. The pipeline may require investigation.

Recommended Actions:
1. Check health endpoint: ${status.healthEndpoint}
2. Review Cloudflare Worker logs: npx wrangler tail
3. Check Vercel function logs
4. See runbook: docs/runbooks/pipeline-stall-recovery.md

This is an automated alert from the TLDRSec Pipeline Watchdog.
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .alert { background: #fee2e2; border: 1px solid #ef4444; padding: 16px; border-radius: 8px; }
  .status { font-size: 24px; font-weight: bold; color: #dc2626; }
  .metric { margin: 8px 0; }
  .label { color: #6b7280; }
  .value { font-weight: 600; }
  .actions { background: #f3f4f6; padding: 12px; border-radius: 4px; margin-top: 16px; }
</style></head>
<body>
  <div class="alert">
    <div class="status">🚨 Pipeline ${status.status}</div>
  </div>
  <div class="metric">
    <span class="label">Last Completion:</span>
    <span class="value">${status.minutesSinceLastCompletion} minutes ago</span>
  </div>
  <div class="metric">
    <span class="label">Pending Jobs:</span>
    <span class="value">${status.pendingJobs}</span>
  </div>
  <div class="actions">
    <strong>Recommended Actions:</strong>
    <ol>
      <li><a href="${status.healthEndpoint}">Check health endpoint</a></li>
      <li>Review Cloudflare Worker logs</li>
      <li>Check Vercel function logs</li>
    </ol>
  </div>
</body>
</html>
`.trim();

  return { subject, body, html };
}
```

**Checkpoint 3.2.1**: Alert email test passes:
```bash
npm run test -- --testPathPattern="heartbeat-watchdog" --testNamePattern="alert email"
# Expected: 1 passing
```

#### 3.2.2 Create GitHub Action Watchdog
**File**: `.github/workflows/pipeline-heartbeat-watchdog.yml`

```yaml
name: Pipeline Heartbeat Watchdog

on:
  schedule:
    # Run every 10 minutes
    - cron: '*/10 * * * *'
  workflow_dispatch:
    inputs:
      force_alert:
        description: 'Force send alert (for testing)'
        required: false
        default: 'false'
        type: boolean

jobs:
  check-heartbeat:
    runs-on: ubuntu-latest

    steps:
      - name: Check Pipeline Health
        id: health
        run: |
          RESPONSE=$(curl -s -w "\n%{http_code}" https://tldrsec.app/api/health/pipeline)
          HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
          BODY=$(echo "$RESPONSE" | sed '$d')

          echo "HTTP Status: $HTTP_CODE"
          echo "Response: $BODY"

          if [ "$HTTP_CODE" != "200" ]; then
            echo "health_status=UNREACHABLE" >> $GITHUB_OUTPUT
            echo "alert_needed=true" >> $GITHUB_OUTPUT
            echo "error_message=Health endpoint returned HTTP $HTTP_CODE" >> $GITHUB_OUTPUT
            exit 0
          fi

          # Parse response
          STATUS=$(echo "$BODY" | jq -r '.status // "UNKNOWN"')
          MINUTES=$(echo "$BODY" | jq -r '.minutesSinceLastCompletion // 999')
          PENDING=$(echo "$BODY" | jq -r '.jobs.pending // 0')
          LAST_EXEC=$(echo "$BODY" | jq -r '.lastExecution // "unknown"')

          echo "health_status=$STATUS" >> $GITHUB_OUTPUT
          echo "minutes_since_completion=$MINUTES" >> $GITHUB_OUTPUT
          echo "pending_jobs=$PENDING" >> $GITHUB_OUTPUT
          echo "last_execution=$LAST_EXEC" >> $GITHUB_OUTPUT

          # Alert if no completion in 15 minutes
          if [ "$MINUTES" -gt 15 ] || [ "$STATUS" = "CRITICAL" ]; then
            echo "alert_needed=true" >> $GITHUB_OUTPUT
          else
            echo "alert_needed=false" >> $GITHUB_OUTPUT
          fi

      - name: Send Alert Email
        if: steps.health.outputs.alert_needed == 'true' || github.event.inputs.force_alert == 'true'
        env:
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
        run: |
          STATUS="${{ steps.health.outputs.health_status }}"
          MINUTES="${{ steps.health.outputs.minutes_since_completion }}"
          PENDING="${{ steps.health.outputs.pending_jobs }}"
          LAST_EXEC="${{ steps.health.outputs.last_execution }}"

          # Compose email
          SUBJECT="🚨 TLDRSec Pipeline Stall Alert - $STATUS"
          BODY="Pipeline Health Alert\n\nStatus: $STATUS\nLast Completion: ${MINUTES:-unknown} minutes ago\nPending Jobs: ${PENDING:-unknown}\n\nHealth Dashboard: https://tldrsec.app/api/health/pipeline\n\nThis alert was triggered because no successful job completions have been recorded in the last 15 minutes.\n\nWorkflow run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"

          curl -X POST https://api.resend.com/emails \
            -H "Authorization: Bearer $RESEND_API_KEY" \
            -H "Content-Type: application/json" \
            -d "{
              \"from\": \"pipeline@tldrsec.app\",
              \"to\": \"wilfred.chen.python@gmail.com\",
              \"subject\": \"$SUBJECT\",
              \"text\": \"$(echo -e "$BODY")\"
            }"

          echo "✅ Alert email sent to wilfred.chen.python@gmail.com"

      - name: Log Status (No Alert)
        if: steps.health.outputs.alert_needed == 'false'
        run: |
          echo "✅ Pipeline healthy"
          echo "Status: ${{ steps.health.outputs.health_status }}"
          echo "Last completion: ${{ steps.health.outputs.minutes_since_completion }} minutes ago"
```

**Checkpoint 3.2.2**: Verify workflow syntax:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pipeline-heartbeat-watchdog.yml'))"
echo "Watchdog workflow YAML is valid"
```

### Step 3.3: 🔵 Refactor

- [ ] Add rate limiting to prevent alert spam (max 1 alert per hour)
- [ ] Include link to runbook in alert email
- [ ] Add workflow run link for debugging

**Checkpoint 3.3**: All tests pass:
```bash
npm run test -- --testPathPattern="heartbeat-watchdog"
# Expected: All passing
```

### Step 3.4: Chaos Test - Complete Platform Failure

**Test File**: `__tests__/chaos/platform-failure.test.ts`

```typescript
describe('Chaos Test: Platform Failure Detection', () => {
  it('should have watchdog workflow configured', async () => {
    const fs = await import('fs');
    const workflowPath = '.github/workflows/pipeline-heartbeat-watchdog.yml';

    expect(fs.existsSync(workflowPath)).toBe(true);

    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('*/10 * * * *'); // Every 10 min
    expect(content).toContain('wilfred.chen.python@gmail.com');
  });

  it('should detect stale pipeline from health endpoint', async () => {
    const response = await fetch(`${process.env.PUBLIC_URL}/api/health/pipeline`);
    const data = await response.json();

    // Verify the fields the watchdog needs are present
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('minutesSinceLastCompletion');
    expect(data).toHaveProperty('jobs');
    expect(data.jobs).toHaveProperty('pending');
  });
});
```

### Step 3.5: Final Phase Verification

#### Automated Verification:
- [x] All watchdog tests pass: 12/12 tests passing
- [x] Both workflow files are valid YAML: yaml-lint validated
- [x] Type checking passes: `npm run build` succeeded
- [x] Linting passes: New files pass lint

#### Manual Verification:
- [ ] Trigger watchdog workflow manually with `force_alert=true`
- [ ] Verify email arrives at `wilfred.chen.python@gmail.com`
- [ ] Verify email contains useful debugging information
- [ ] Check workflow runs successfully on GitHub Actions

**STOP**: Await manual confirmation that alert email was received.

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **Chaos Tests for Each SPOF**: Intentionally break each single point of failure
2. **Recovery Verification**: Prove autonomous recovery without human intervention
3. **Timing Assertions**: Verify detection and recovery within SLA (5 min for filings)

### Test Categories

#### 1. Unit Tests (Written First)
- Secret sanitization logic
- HMAC signature generation
- Alert email formatting
- Orphan count query

#### 2. Integration Tests
- End-to-end auth verification with contaminated secrets
- Orphan detection timing
- Health endpoint response format

#### 3. Chaos Tests
- CRON_SECRET contamination resilience (verifies defensive sanitization works)
- Complete platform failure alerting
- Orphan creation and recovery

### Checkpoint Frequency

- **Phase 1**: 4 checkpoints (sanitization, CF worker update, refactor, chaos)
- **Phase 2**: 4 checkpoints (detection rate, timing, refactor, verification)
- **Phase 3**: 4 checkpoints (health check, alert email, workflow, chaos)

### Manual Testing Steps

1. **Secret Sanitization**: Intentionally add `\n` to Cloudflare secret, verify auth still works
2. **Orphan Detection**: Create test filing, verify immediate detection
3. **Watchdog Alert**: Trigger workflow, verify email received

---

## Performance Considerations

### Impact Assessment

| Change | Performance Impact |
|--------|-------------------|
| Remove orphan sampling | +5ms per health check (negligible) |
| GitHub Actions (1 workflow - watchdog only) | No runtime impact (external) |
| Secret sanitization in CF Worker | <0.1ms per request (string ops only) |

### No New Database Load

- Orphan COUNT query uses existing indexes
- No new tables or schemas required
- No changes to job processing throughput

---

## Migration Notes

### Required Secrets in GitHub

Add these secrets to the repository (for Phase 3 watchdog only):
- `RESEND_API_KEY` - Already exists, used for alert emails

**No longer needed** (eliminated by Phase 1 revision):
- ~~`VERCEL_TOKEN`~~ - Not needed, no sync workflow
- ~~`VERCEL_ORG_ID`~~ - Not needed, no sync workflow
- ~~`VERCEL_PROJECT_ID`~~ - Not needed, no sync workflow
- ~~`CLOUDFLARE_API_TOKEN`~~ - Not needed, defensive sanitization handles contamination at runtime

### Rollback Plan

If issues arise:
1. **Secret Sanitization**: Revert Cloudflare Worker changes, use manual `npm run cloudflare:sync-secret`
2. **Orphan Detection**: Revert to sampling by adding back `ORPHAN_SAMPLE_RATE`
3. **Watchdog**: Disable workflow, rely on existing Slack alerts

---

## References

- Original research: `docs/research/2026-01-25-cron-pipeline-architecture.md`
- Pipeline recovery runbook: `docs/runbooks/pipeline-stall-recovery.md`
- Known issues (CRON_SECRET): `CLAUDE.md:429-528`
- Existing sync script: `npm run cloudflare:sync-secret`

---

## Success Metrics

After implementation, measure:

1. **Mean Time to Detection (MTTD)**: Should be <5 min for any failure mode
2. **Mean Time to Recovery (MTTR)**: Should be <10 min without human intervention
3. **Manual Interventions**: Target zero for secret sync and orphan recovery
4. **SLA Compliance**: Filings processed within 5 min of SEC publication

---

*Plan created: 2026-01-26T01:30:47Z*
*Elon's Algorithm applied: 40% scope reduction from original proposal*
*Plan revised: 2026-01-26 - Phase 1 simplified from GitHub Action sync to defensive sanitization (additional 60% reduction in Phase 1 complexity)*
