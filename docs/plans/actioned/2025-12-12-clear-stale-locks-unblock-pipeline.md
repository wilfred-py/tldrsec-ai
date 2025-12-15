# Clear Stale Locks and Unblock Pipeline Implementation Plan

**Date**: 2025-12-12T12:43:53+11:00 (AEDT)
**Git Commit**: f4d486f0f706dd613d3b9115dc22becabd42fd47
**Branch**: main
**Repository**: tldrsec-ai

## Overview

The SEC filing pipeline has been stalled since December 10, 2025, with 12,135+ jobs stuck in the backlog and no OpenRouter API calls for investor filings. Despite the December 12 Prisma field reference fix being correct (the raw SQL query works), the pipeline is blocked by **stale distributed locks** that expired on December 7, 2025 but were never cleaned up.

## Critical Discovery

**Root Cause**: The research document at [thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md](../../thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md) identified stale locks in the database:

```
Active Locks: 5
- tier-aware-cron-execution-production (expires: 2025-12-07T06:02:53.864Z) <-- EXPIRED 5 DAYS AGO
```

**However**, my code analysis reveals the `LockService.acquireLock()` method at [lib/job-queue/lock-service.ts:28-34](../../lib/job-queue/lock-service.ts#L28-L34) **DOES correctly check expiration**:

```typescript
const existingLock = await prisma.jobLock.findFirst({
  where: {
    lockName,
    released: false,
    expiresAt: { gt: new Date() }  // ✅ This checks expiration!
  }
});
```

This means an expired lock **should NOT block** new lock acquisition. The `cleanupExpiredLocks()` method is also called proactively at [tier-aware/route.ts:292](../../app/api/cron/tier-aware/route.ts#L292) before every lock acquisition attempt.

## Revised Hypothesis

If the lock check is correct, then the stall must be caused by one of:

1. **Cloudflare Worker not calling the endpoint** - The cron may have stopped executing
2. **Authentication/authorization failures** - The CRON_SECRET may be invalid or mismatched
3. **Runtime errors in the cron endpoint** - An error may occur before lock acquisition
4. **Lock acquisition timing race condition** - The upsert at line 45-62 has a race window between check and acquire

## CRON_SECRET Verification (Completed)

Both Cloudflare and Vercel have `CRON_SECRET` configured:
- **Cloudflare Worker**: ✅ CRON_SECRET is in secret list
- **Vercel Production**: ✅ CRON_SECRET is configured (no trailing newline issues)

The values cannot be directly compared since they're encrypted, but both are set.

## Current State Analysis

Based on the research document:
- **1,753** PENDING `ASYNC_SUMMARIZE_CACHED` jobs
- **9,912** PENDING `ASYNC_FETCH_FILING` jobs
- **253** PENDING `ASYNC_DISCOVER_FILINGS` jobs
- **241** RETRYING `ASYNC_SUMMARIZE_CACHED` jobs
- **0** jobs currently PROCESSING
- Last summarization completed: December 10, 2025 at 18:11:06 UTC

## Desired End State

After this plan is complete:
1. All stale locks are cleared from the `JobLock` table
2. The Cloudflare Worker cron is confirmed executing every 10 minutes
3. The tier-aware endpoint is confirmed responding to cron calls
4. Jobs are actively transitioning from PENDING → PROCESSING → COMPLETED
5. OpenRouter API calls are being made for summarization
6. Backlog is actively clearing (not necessarily fully cleared, but progress visible)

### Verification Steps

1. **Automated**: `npx tsx scripts/check-pending-jobs.ts` shows PROCESSING jobs > 0
2. **Automated**: Database query shows no stale locks (all locks either released=true OR expiresAt > now())
3. **Manual**: Cloudflare Worker logs show successful cron executions via `cd cloudflare-cron && npx wrangler tail --format=pretty`
4. **Manual**: Vercel function logs show tier-aware endpoint responding with 200 status
5. **Automated**: Repeated runs of `check-pending-jobs.ts` show COMPLETED count increasing

## What We're NOT Doing

- NOT redesigning the lock system (the current implementation is correct)
- NOT implementing PostgreSQL advisory locks (the simple lock service is adequate)
- NOT adding lock auto-renewal (locks already have appropriate TTL)
- NOT changing the job processing logic (the fix from December 12 is correct)
- NOT rewriting the Cloudflare Worker (just verifying it works)

## Implementation Approach

This is primarily a **diagnosis and fix** task, not a new feature. We will:

1. **Phase 0**: Diagnose first - determine if locks are actually the issue
2. **Phase 1**: Nuclear cleanup - delete ALL locks to eliminate lock-related issues
3. **Phase 2**: Diagnose cron execution - verify Cloudflare Worker is reaching Vercel
4. **Phase 3**: Validate pipeline flow and add monitoring

---

## Phase 0: Diagnose Before Fixing (NEW)

### Overview
Before applying any fixes, we need to determine the actual failure mode. This phase manually triggers the cron endpoint and checks responses to identify the real issue.

### Step 0.1: Check Current Lock State

Run a quick diagnostic to see the current lock situation:

```bash
npx tsx -e "
import { getPrismaClient } from './lib/db/prisma';
async function checkLocks() {
  const prisma = getPrismaClient();
  const locks = await prisma.jobLock.findMany({
    orderBy: { acquiredAt: 'desc' }
  });
  console.log('=== ALL LOCKS ===');
  locks.forEach(l => {
    const expired = new Date(l.expiresAt) < new Date();
    console.log(\`\${l.lockName}:\`);
    console.log(\`  acquired: \${l.acquiredAt}\`);
    console.log(\`  expires: \${l.expiresAt} \${expired ? '❌ EXPIRED' : '✅ ACTIVE'}\`);
    console.log(\`  released: \${l.released}\`);
    console.log('');
  });
  await prisma.\$disconnect();
}
checkLocks();
"
```

**Checkpoint 0.1**: Record the lock state before any changes.

### Step 0.2: Create Cloudflare-to-Vercel Connectivity Test Script

**File**: `scripts/test-cron-connectivity.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Test script to verify Cloudflare Worker can reach Vercel endpoint
 * This simulates what the Cloudflare Worker does without actually being the worker
 */

import crypto from 'crypto';

const VERCEL_URL = 'https://tldrsec.app';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET environment variable is not set');
  process.exit(1);
}

async function generateHmacSignature(url: string, method: string = 'GET'): Promise<{signature: string, timestamp: number}> {
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const timestamp = Date.now();
  const payload = `${timestamp}:${method.toUpperCase()}:${path}`;

  const hmac = crypto.createHmac('sha256', CRON_SECRET);
  hmac.update(payload);
  const signature = hmac.digest('hex');

  return { signature, timestamp };
}

async function testEndpoint(name: string, url: string, method: string = 'GET') {
  console.log(`\n🔍 Testing ${name}...`);
  console.log(`   URL: ${url}`);

  try {
    const { signature, timestamp } = await generateHmacSignature(url, method);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TLDRSEC-Connectivity-Test/1.0',
      'X-Cloudflare-Worker': 'tldrsec-cron-test',
      'X-Cron-Source': 'connectivity-test',
      'x-hmac-signature': signature,
      'x-hmac-timestamp': timestamp.toString(),
    };

    // Also try with Bearer token for backwards compatibility
    headers['Authorization'] = `Bearer ${CRON_SECRET}`;

    console.log(`   Timestamp: ${timestamp}`);
    console.log(`   Signature: ${signature.substring(0, 16)}...`);

    const startTime = Date.now();
    const response = await fetch(url, {
      method,
      headers,
    });
    const duration = Date.now() - startTime;

    const responseText = await response.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Duration: ${duration}ms`);

    if (response.status === 200) {
      console.log(`   ✅ SUCCESS`);
      if (responseJson) {
        console.log(`   Response:`, JSON.stringify(responseJson, null, 2).split('\n').slice(0, 10).join('\n'));
      }
      return { success: true, status: response.status, duration };
    } else if (response.status === 401) {
      console.log(`   ❌ AUTHENTICATION FAILED`);
      console.log(`   Response: ${responseText.substring(0, 200)}`);
      return { success: false, status: response.status, error: 'auth_failed', duration };
    } else if (response.status === 429) {
      console.log(`   ⚠️ RATE LIMITED OR LOCK CONTENTION`);
      console.log(`   Response: ${responseText.substring(0, 200)}`);
      return { success: false, status: response.status, error: 'rate_limited', duration };
    } else if (response.status === 500) {
      console.log(`   ❌ INTERNAL SERVER ERROR`);
      console.log(`   Response: ${responseText.substring(0, 500)}`);
      return { success: false, status: response.status, error: 'server_error', duration };
    } else {
      console.log(`   ⚠️ UNEXPECTED STATUS`);
      console.log(`   Response: ${responseText.substring(0, 200)}`);
      return { success: false, status: response.status, error: 'unexpected', duration };
    }
  } catch (error) {
    console.log(`   ❌ CONNECTION ERROR: ${error instanceof Error ? error.message : 'Unknown'}`);
    return { success: false, status: 0, error: 'connection_failed' };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CLOUDFLARE → VERCEL CONNECTIVITY TEST');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Target: ${VERCEL_URL}`);
  console.log(`CRON_SECRET: ${CRON_SECRET.substring(0, 8)}... (${CRON_SECRET.length} chars)`);

  const results: Record<string, any> = {};

  // Test 1: Health endpoint (no auth required)
  results.health = await testEndpoint(
    'Health Check (no auth)',
    `${VERCEL_URL}/api/health`
  );

  // Test 2: Tier-aware endpoint (auth required)
  results.tierAware = await testEndpoint(
    'Tier-Aware Cron (POST with auth)',
    `${VERCEL_URL}/api/cron/tier-aware`,
    'POST'
  );

  // Test 3: Process filing queue - fetch jobs
  results.fetchQueue = await testEndpoint(
    'Process Filing Queue - Fetch (GET with auth)',
    `${VERCEL_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING`,
    'GET'
  );

  // Test 4: Process filing queue - summarize jobs
  results.summarizeQueue = await testEndpoint(
    'Process Filing Queue - Summarize (GET with auth)',
    `${VERCEL_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED`,
    'GET'
  );

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  const allPassed = Object.values(results).every(r => r.success);
  const authFailed = Object.values(results).some(r => r.error === 'auth_failed');
  const serverErrors = Object.values(results).filter(r => r.error === 'server_error').length;

  if (allPassed) {
    console.log('✅ ALL ENDPOINTS REACHABLE AND AUTHENTICATED');
    console.log('   The Cloudflare Worker should be able to trigger the pipeline.');
    console.log('   If pipeline is still stalled, issue is likely:');
    console.log('   - Lock contention (run nuclear cleanup)');
    console.log('   - Job processing logic error');
    console.log('   - OpenRouter API issues');
  } else if (authFailed) {
    console.log('❌ AUTHENTICATION FAILURE DETECTED');
    console.log('   The CRON_SECRET in Cloudflare does not match Vercel.');
    console.log('   Action: Update CRON_SECRET in Cloudflare Worker secrets');
    console.log('   Command: cd cloudflare-cron && npx wrangler secret put CRON_SECRET');
  } else if (serverErrors > 0) {
    console.log('❌ SERVER ERRORS DETECTED');
    console.log('   The Vercel endpoint is throwing errors.');
    console.log('   Action: Check Vercel function logs for details');
    console.log('   Command: vercel logs --follow');
  } else {
    console.log('⚠️ MIXED RESULTS - INVESTIGATION NEEDED');
    Object.entries(results).forEach(([name, result]) => {
      const icon = result.success ? '✅' : '❌';
      console.log(`   ${icon} ${name}: ${result.status} ${result.error || ''}`);
    });
  }

  console.log('\n');
}

main().catch(console.error);
```

**Checkpoint 0.2**: Create and run the connectivity test:
```bash
npx tsx scripts/test-cron-connectivity.ts
```

### Step 0.3: Analyze Results and Determine Fix Path

Based on the connectivity test results:

| Result | Meaning | Next Step |
|--------|---------|-----------|
| ✅ All pass | Endpoints reachable, auth works | Proceed to Phase 1 (nuclear cleanup) |
| ❌ Auth failed | CRON_SECRET mismatch | Fix CRON_SECRET before cleanup |
| ❌ Server error | Endpoint crashes | Check Vercel logs, may need code fix |
| ⚠️ Rate limited | Lock contention | Proceed directly to Phase 1 |

**Checkpoint 0.3**: Document which fix path to take.

### Step 0.4: Final Phase 0 Verification

#### Automated Verification:
- [ ] Lock state documented
- [ ] Connectivity test script created and executed
- [ ] Fix path determined based on results

#### Manual Verification:
- [ ] Reviewed test output
- [ ] Identified actual failure mode
- [ ] Ready to proceed to appropriate fix phase

**STOP**: After completing Phase 0, proceed to the appropriate fix phase based on diagnosis.

---

## Phase 1: Nuclear Lock Cleanup

### Overview
Delete ALL locks from the database to eliminate any lock-related blocking. This is the recommended approach since:
- Pipeline is fully stalled (0 PROCESSING jobs)
- Nothing to interrupt
- Eliminates all lock-related possibilities
- Fastest path to recovery

### Lock Cleanup Options Analysis

| Option | Command | Pros | Cons |
|--------|---------|------|------|
| **Nuclear (Recommended)** | `deleteMany({})` | Guaranteed fix, fast, simple | Loses history |
| Targeted | `updateMany({released: true})` | Preserves history | May not fix all issues |
| Hybrid | `deleteMany({expiresAt: {lt: now}})` | Cleans up, preserves active | Requires new script |
| Specific | `forceReleaseLock(name)` | Most surgical | Need to know exact lock |

### Step 1.1: Execute Nuclear Cleanup

Run the existing cleanup script to delete ALL locks:

```bash
npx tsx scripts/cleanup-locks.ts
```

Expected output:
```
🧹 Cleaning up database locks...
✅ Cleared X database locks
🎉 Lock cleanup completed
```

**Checkpoint 1.1**: Verify cleanup succeeded.

### Step 1.2: Verify Clean State

```bash
npx tsx -e "
import { LockService } from './lib/job-queue/lock-service';
async function check() {
  const metrics = await LockService.getLockHealthMetrics();
  console.log('Lock Metrics:', JSON.stringify(metrics, null, 2));
  process.exit(0);
}
check();
"
```

Expected output:
- `activeLocks: 0`
- `staleLocksCount: 0`
- `healthStatus: "HEALTHY"`

**Checkpoint 1.2**: Confirm all locks are cleared.

### Step 1.3: Re-run Connectivity Test

After clearing locks, run the connectivity test again:

```bash
npx tsx scripts/test-cron-connectivity.ts
```

If the tier-aware endpoint now returns 200, the locks were indeed the issue.

**Checkpoint 1.3**: Verify endpoints are responding.

### Step 1.4: Final Phase 1 Verification

#### Automated Verification:
- [ ] `scripts/cleanup-locks.ts` completed successfully
- [ ] `LockService.getLockHealthMetrics()` shows `healthStatus: "HEALTHY"`
- [ ] Connectivity test shows 200 responses

#### Manual Verification:
- [ ] Lock cleanup script ran without errors
- [ ] No locks remain in database

**STOP**: After completing Phase 1, proceed to Phase 2 to verify the pipeline is processing.

---

## Phase 2: Verify Cloudflare Worker Execution

### Overview
Confirm the Cloudflare Worker is executing and successfully triggering Vercel endpoints.

### Step 2.1: Create Worker Execution Check Script

**File**: `scripts/check-cloudflare-worker-status.sh`

```bash
#!/bin/bash
# Check Cloudflare Worker deployment and recent executions

echo "═══════════════════════════════════════════════════════════"
echo "  CLOUDFLARE WORKER STATUS CHECK"
echo "═══════════════════════════════════════════════════════════"

cd "$(dirname "$0")/../cloudflare-cron" || exit 1

echo ""
echo "📋 Worker Configuration:"
echo "─────────────────────────────────────────────────────────"
grep -E "^name|crons|routes" wrangler.toml 2>/dev/null || echo "Could not read wrangler.toml"

echo ""
echo "🚀 Recent Deployments:"
echo "─────────────────────────────────────────────────────────"
npx wrangler deployments list 2>/dev/null | head -20 || echo "Could not list deployments"

echo ""
echo "🔐 Configured Secrets:"
echo "─────────────────────────────────────────────────────────"
npx wrangler secret list 2>/dev/null | grep -E "name|type" || echo "Could not list secrets"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  To monitor live executions, run:"
echo "  cd cloudflare-cron && npx wrangler tail --format=pretty"
echo "═══════════════════════════════════════════════════════════"
```

**Checkpoint 2.1**: Create and run the status check:
```bash
chmod +x scripts/check-cloudflare-worker-status.sh
./scripts/check-cloudflare-worker-status.sh
```

### Step 2.2: Monitor Live Worker Execution

Start monitoring Cloudflare Worker logs:

```bash
cd cloudflare-cron && npx wrangler tail --format=pretty
```

Wait for the next cron trigger (every 10 minutes at :00, :10, :20, :30, :40, :50).

**Expected output during cron execution:**
```
[cron-xxx-xxx] Starting TLDRSEC scheduled cron job execution
[cron-xxx-xxx] Step 1: Calling tier-aware endpoint...
[cron-xxx-xxx] Step 1 completed: tier-aware endpoint success
[cron-xxx-xxx] Step 2: Calling process-filing-queue endpoint (fetch)...
[cron-xxx-xxx] Step 2 completed: fetch jobs endpoint success
[cron-xxx-xxx] Step 3: Calling process-filing-queue endpoint (summarize)...
[cron-xxx-xxx] Step 3 completed: summarize jobs endpoint success
```

**Checkpoint 2.2**: Observe at least one cron execution.

### Step 2.3: Check Job Processing After Cron

After observing a cron execution, check if jobs are processing:

```bash
npx tsx scripts/check-pending-jobs.ts
```

Look for:
- `IN_PROGRESS` count > 0 (jobs are being processed)
- `COMPLETED` count increasing from previous runs

**Checkpoint 2.3**: Jobs are transitioning states.

### Step 2.4: Final Phase 2 Verification

#### Automated Verification:
- [ ] Cloudflare Worker status shows recent deployment
- [ ] Worker secrets include CRON_SECRET
- [ ] `check-pending-jobs.ts` shows jobs processing

#### Manual Verification:
- [ ] `wrangler tail` shows cron executions
- [ ] Cron logs show 200 responses from Vercel
- [ ] No authentication errors in logs

**STOP**: After completing Phase 2, proceed to Phase 3 for ongoing monitoring.

---

## Phase 3: Validate Pipeline Flow and Add Monitoring

### Overview
Confirm jobs are processing correctly and establish ongoing monitoring.

### Step 3.1: Create Comprehensive Diagnostic Script

**File**: `scripts/diagnose-pipeline.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Comprehensive pipeline diagnostic script
 * Checks locks, jobs, connectivity, and provides actionable recommendations
 */

import { getPrismaClient } from '../lib/db/prisma';
import { LockService } from '../lib/job-queue/lock-service';

interface DiagnosticResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
  action?: string;
}

async function runDiagnostics(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const prisma = getPrismaClient();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TLDRSEC PIPELINE DIAGNOSTIC REPORT');
  console.log('  Generated: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  // === LOCK DIAGNOSTICS ===
  console.log('🔒 LOCK DIAGNOSTICS');
  console.log('─────────────────────────────────────────────────────────');

  const lockMetrics = await LockService.getLockHealthMetrics();

  results.push({
    category: 'Locks',
    check: 'Active Locks',
    status: lockMetrics.activeLocks === 0 ? 'PASS' : 'WARN',
    details: `${lockMetrics.activeLocks} active locks`,
    action: lockMetrics.activeLocks > 0 ? 'Check if legitimate processing is occurring' : undefined
  });

  results.push({
    category: 'Locks',
    check: 'Stale Locks',
    status: lockMetrics.staleLocksCount === 0 ? 'PASS' : 'FAIL',
    details: `${lockMetrics.staleLocksCount} stale locks`,
    action: lockMetrics.staleLocksCount > 0 ? 'Run: npx tsx scripts/cleanup-locks.ts' : undefined
  });

  results.push({
    category: 'Locks',
    check: 'Health Status',
    status: lockMetrics.healthStatus === 'HEALTHY' ? 'PASS' : 'FAIL',
    details: `Status: ${lockMetrics.healthStatus}`,
  });

  // === JOB QUEUE DIAGNOSTICS ===
  console.log('\n📋 JOB QUEUE DIAGNOSTICS');
  console.log('─────────────────────────────────────────────────────────');

  const jobCounts = await prisma.$queryRaw<{status: string, count: bigint}[]>`
    SELECT status, COUNT(*) as count
    FROM "JobQueue"
    GROUP BY status
  `;

  const statusMap = new Map(jobCounts.map(j => [j.status, Number(j.count)]));
  const pending = statusMap.get('PENDING') || 0;
  const processing = statusMap.get('PROCESSING') || 0;
  const completed = statusMap.get('COMPLETED') || 0;
  const failed = statusMap.get('FAILED') || 0;
  const retrying = statusMap.get('RETRYING') || 0;

  results.push({
    category: 'Jobs',
    check: 'Jobs Processing',
    status: processing > 0 ? 'PASS' : 'FAIL',
    details: `${processing} jobs currently processing`,
    action: processing === 0 ? 'Pipeline may be stalled - check locks and cron' : undefined
  });

  results.push({
    category: 'Jobs',
    check: 'Backlog Size',
    status: pending < 1000 ? 'PASS' : pending < 5000 ? 'WARN' : 'FAIL',
    details: `${pending} PENDING + ${retrying} RETRYING = ${pending + retrying} total backlog`,
    action: pending > 5000 ? 'Large backlog - ensure pipeline is processing' : undefined
  });

  // Recent completions
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCompletions = await prisma.jobQueue.count({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: oneHourAgo }
    }
  });

  results.push({
    category: 'Jobs',
    check: 'Recent Completions (1hr)',
    status: recentCompletions > 0 ? 'PASS' : 'FAIL',
    details: `${recentCompletions} jobs completed in last hour`,
    action: recentCompletions === 0 ? 'No recent progress - investigate cron execution' : undefined
  });

  // === ENVIRONMENT DIAGNOSTICS ===
  console.log('\n🔧 ENVIRONMENT DIAGNOSTICS');
  console.log('─────────────────────────────────────────────────────────');

  const cronSecret = process.env.CRON_SECRET;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  results.push({
    category: 'Environment',
    check: 'CRON_SECRET',
    status: cronSecret && cronSecret.length >= 32 ? 'PASS' : 'FAIL',
    details: cronSecret ? `Set (${cronSecret.length} chars)` : 'NOT SET',
    action: !cronSecret ? 'Set CRON_SECRET environment variable' : undefined
  });

  results.push({
    category: 'Environment',
    check: 'OPENROUTER_API_KEY',
    status: openRouterKey ? 'PASS' : 'FAIL',
    details: openRouterKey ? 'Set' : 'NOT SET',
    action: !openRouterKey ? 'Set OPENROUTER_API_KEY for AI summarization' : undefined
  });

  // === PRINT RESULTS ===
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  DIAGNOSTIC RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const categories = [...new Set(results.map(r => r.category))];

  for (const category of categories) {
    console.log(`\n${category}:`);
    const categoryResults = results.filter(r => r.category === category);
    for (const r of categoryResults) {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`  ${icon} ${r.check}: ${r.details}`);
      if (r.action) {
        console.log(`     → Action: ${r.action}`);
      }
    }
  }

  // === SUMMARY ===
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;

  console.log('\n═══════════════════════════════════════════════════════════');
  if (failCount > 0) {
    console.log(`❌ ${failCount} CRITICAL ISSUES FOUND - Action required`);
  } else if (warnCount > 0) {
    console.log(`⚠️ ${warnCount} WARNINGS - Pipeline may need attention`);
  } else {
    console.log('✅ ALL CHECKS PASSED - Pipeline is healthy');
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
  return results;
}

runDiagnostics().catch(console.error);
```

**Checkpoint 3.1**: Create and run the diagnostic script:
```bash
npx tsx scripts/diagnose-pipeline.ts
```

### Step 3.2: Monitor Backlog Progress

Capture initial state and compare after 30 minutes:

```bash
# Initial capture
npx tsx scripts/check-pending-jobs.ts | tee /tmp/pipeline-t0.txt

# After 30 minutes
npx tsx scripts/check-pending-jobs.ts | tee /tmp/pipeline-t30.txt

# Compare
echo "=== PROGRESS ===" && diff /tmp/pipeline-t0.txt /tmp/pipeline-t30.txt | head -30
```

**Checkpoint 3.2**: COMPLETED count should increase over time.

### Step 3.3: Create Runbook Documentation

**File**: `docs/runbooks/pipeline-health-check.md`

```markdown
# Pipeline Health Check Runbook

## Quick Diagnostic (30 seconds)

```bash
npx tsx scripts/diagnose-pipeline.ts
```

## If Pipeline is Stalled (0 PROCESSING jobs)

### Step 1: Clear All Locks
```bash
npx tsx scripts/cleanup-locks.ts
```

### Step 2: Test Connectivity
```bash
npx tsx scripts/test-cron-connectivity.ts
```

### Step 3: Check Cloudflare Worker
```bash
cd cloudflare-cron && npx wrangler tail --format=pretty
# Wait for next cron trigger (every 10 minutes)
```

### Step 4: Manual Cron Trigger
```bash
curl -X POST 'https://tldrsec.app/api/cron/tier-aware' \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Step 5: Check Vercel Logs
```bash
vercel logs --follow
```

## Common Issues and Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| Stale locks | 429 responses, PROCESSING=0 | `npx tsx scripts/cleanup-locks.ts` |
| Auth mismatch | 401 responses | Update CRON_SECRET in Cloudflare |
| Worker not running | No cron logs | Check Cloudflare dashboard |
| Endpoint error | 500 responses | Check Vercel function logs |

## Daily Monitoring

Run this daily to track backlog:
```bash
npx tsx scripts/check-pending-jobs.ts
```

Expected healthy state:
- PROCESSING > 0 during cron windows
- COMPLETED increasing daily
- PENDING decreasing over time
```

**Checkpoint 3.3**: Runbook created.

### Step 3.4: Final Phase 3 Verification

#### Automated Verification:
- [ ] `diagnose-pipeline.ts` created and runs successfully
- [ ] All diagnostic checks pass
- [ ] Runbook documentation created

#### Manual Verification:
- [ ] COMPLETED count increased over observation period
- [ ] Runbook is clear and actionable
- [ ] Team knows how to run diagnostics

**STOP**: Pipeline should now be actively processing. Continue monitoring daily.

---

## Testing Strategy

### Diagnostic Scripts Created

| Script | Purpose | Usage |
|--------|---------|-------|
| `test-cron-connectivity.ts` | Test Cloudflare→Vercel connectivity | Run before any fixes |
| `check-cloudflare-worker-status.sh` | Check worker deployment status | Verify worker is deployed |
| `diagnose-pipeline.ts` | Comprehensive health check | Daily monitoring |
| `cleanup-locks.ts` | Nuclear lock cleanup | When pipeline is stalled |
| `check-pending-jobs.ts` | Job queue status | Track backlog progress |

### Manual Testing Steps

1. **Phase 0**: Run connectivity test, determine failure mode
2. **Phase 1**: Run cleanup, verify locks cleared
3. **Phase 2**: Monitor wrangler tail, verify cron executes
4. **Phase 3**: Run diagnostics, verify ongoing health

## Performance Considerations

- Lock cleanup: O(1) - single DELETE statement
- Connectivity test: ~5-10 seconds per endpoint
- Diagnostic script: ~2-3 seconds (indexed queries)
- Wrangler tail: Continuous monitoring (no performance impact)

## Migration Notes

No database migrations required. This plan only:
- Clears existing lock records (DELETE)
- Creates diagnostic scripts
- Adds monitoring documentation

## References

- Research document: [thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md](../../thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md)
- Lock service implementation: [lib/job-queue/lock-service.ts](../../lib/job-queue/lock-service.ts)
- Tier-aware cron endpoint: [app/api/cron/tier-aware/route.ts](../../app/api/cron/tier-aware/route.ts)
- Cloudflare Worker: [cloudflare-cron/index.js](../../cloudflare-cron/index.js)
- Cleanup script: [scripts/cleanup-locks.ts](../../scripts/cleanup-locks.ts)
- Job check script: [scripts/check-pending-jobs.ts](../../scripts/check-pending-jobs.ts)
