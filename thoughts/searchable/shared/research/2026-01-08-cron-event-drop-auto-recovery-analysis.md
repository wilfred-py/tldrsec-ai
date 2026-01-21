---
date: 2026-01-08T09:58:51+11:00
researcher: Claude
git_commit: fa3a29c7485d6d90057d45c08bf6d8e7b30925b1
branch: fix/dashboard-table-height
repository: tldrsec-ai
topic: "Cron Event Drop Analysis - Auto-Recovery Infrastructure Documentation"
tags: [research, codebase, auto-recovery, cloudflare-worker, pipeline-health, cron]
status: complete
last_updated: 2026-01-08
last_updated_by: Claude
---

# Research: Cron Event Drop Analysis - Auto-Recovery Infrastructure

**Date**: 2026-01-08T09:58:51+11:00
**Researcher**: Claude
**Git Commit**: fa3a29c7485d6d90057d45c08bf6d8e7b30925b1
**Branch**: fix/dashboard-table-height
**Repository**: tldrsec-ai

## Research Question

Cron events dropped significantly around 7-8PM AEST yesterday. There should be auto-recovery/auto-remediation of the pipeline that prevents this from happening from recent merges. Perhaps this isn't reflected in the cron deployment?

## Summary

The codebase contains a comprehensive auto-recovery infrastructure that was implemented in Phases 1-5 (completed 2026-01-07). The system includes:

1. **Cloudflare Worker** (`cloudflare-cron/index.js`) - Triggers auto-recovery every 15 minutes via `*/15 * * * *` cron schedule
2. **Auto-Recovery Endpoint** (`app/api/cron/auto-recover/route.ts`) - Performs immediate cleanup of ALL stuck job conditions
3. **Pipeline Health Monitoring** (`app/api/health/pipeline/route.ts`) - Detects exhausted RETRYING jobs, invalid job types, stale PROCESSING jobs
4. **Force Cleanup Mechanisms** (`app/api/admin/force-cleanup/route.ts`) - Emergency lock cleanup

### Key Finding: All Components Are Deployed

The auto-recovery infrastructure is fully implemented in the codebase and the Cloudflare Worker configuration (`wrangler.toml`) includes the `*/15 * * * *` schedule for auto-recovery. The question is whether the **Cloudflare Worker has been redeployed** after the recent Phase 2 changes (2026-01-07).

## Detailed Findings

### 1. Cloudflare Worker Configuration

**File**: [wrangler.toml](cloudflare-cron/wrangler.toml)

```toml
[triggers]
crons = ["*/5 * * * *", "*/10 * * * *", "*/15 * * * *", "0 22 * * *"]
```

**Cron Schedules**:
- `*/5 * * * *` - Main pipeline processing (every 5 minutes)
- `*/10 * * * *` - Interval Slack summary (every 10 minutes)
- `*/15 * * * *` - **Auto-recovery health check and remediation** (every 15 minutes)
- `0 22 * * *` - Daily Slack report (9 AM AEST)

**Worker Version**: `2.6.0` (in-code), `2.5.0-stable` (in wrangler.toml vars)

### 2. Auto-Recovery Handler in Cloudflare Worker

**File**: [cloudflare-cron/index.js:278-344](cloudflare-cron/index.js#L278-L344)

The `handleAutoRecovery()` function:
1. Generates HMAC signature for authentication
2. Calls `${PUBLIC_URL}/api/cron/auto-recover` (i.e., `https://tldrsec.app/api/cron/auto-recover`)
3. Logs cleanup and redeploy actions

```javascript
// Handle auto-recovery health check and remediation (every 15 minutes)
async handleAutoRecovery(event, env, ctx) {
  const url = `${env.PUBLIC_URL}/api/cron/auto-recover`;
  // ... HMAC signature generation ...
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-hmac-signature': signatureHex,
      'x-hmac-timestamp': timestamp.toString(),
    },
  });
  // ... logging ...
}
```

### 3. Auto-Recovery Endpoint on Vercel

**File**: [app/api/cron/auto-recover/route.ts](app/api/cron/auto-recover/route.ts)

**Design Principle** (from file header):
> Every auto-recovery execution should:
> 1. Check for ALL stuck job conditions (not just locks)
> 2. Immediately clean up ANY stuck jobs found
> 3. Report all actions taken via Slack

**Cleanup Operations** (lines 185-268):

1. **Exhausted RETRYING Jobs** (lines 199-214):
   - Condition: `status = 'RETRYING' AND retryCount >= maxRetries`
   - Action: Mark as FAILED
   - **Root cause of 41-hour pipeline stall in early January 2026**

2. **Invalid Job Types** (lines 217-233):
   - Condition: Job type not in `['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED']`
   - Action: Mark as FAILED

3. **Stale PROCESSING Jobs** (lines 237-252):
   - Condition: `status = 'PROCESSING' AND startedAt < NOW() - 15 minutes`
   - Action: Reset to PENDING for retry

4. **Stale Locks** (lines 255-262):
   - Detected via health check
   - Action: Trigger force-cleanup endpoint

**Thresholds** (lines 49-54):
- `STALL_CRITICAL_MINUTES = 120` - Critical stall threshold (2 hours)
- `CLEANUP_TO_REDEPLOY_WAIT_MS = 10 * 60 * 1000` - Wait 10 min after cleanup before redeploy
- `REDEPLOY_COOLDOWN_MS = 60 * 60 * 1000` - 1 hour cooldown between redeployments
- `STALE_PROCESSING_MINUTES = 15`

### 4. Pipeline Health Detection

**File**: [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts)

**Stuck Job Detection** (lines 162-236):

1. **Stale PROCESSING** (threshold: 15 minutes)
2. **Invalid Job Types** (any detected = CRITICAL)
3. **Exhausted RETRYING** (any detected = CRITICAL) - uses raw SQL:
   ```sql
   SELECT COUNT(*) as count
   FROM pipeline."JobQueue"
   WHERE "status" = 'RETRYING'
     AND "retryCount" >= "maxRetries"
   ```
4. **High Retry Count** (retryCount >= 2 = WARNING)

**Health Status Logic** (lines 310-327):
- **CRITICAL**: Lock health CRITICAL, no completions >180 min, exhausted RETRYING, invalid types
- **DEGRADED**: Lock health WARNING, general issues, no completions >60 min, stale PROCESSING
- **HEALTHY**: None of the above

### 5. Background Worker Recovery

**File**: [lib/cron/background-filing-worker.ts](lib/cron/background-filing-worker.ts)

**Stale Job Recovery** (lines 321-392):
- Runs at start of each batch
- Threshold: 5 minutes stuck in PROCESSING
- Action: Mark FAILED if retries exhausted, else reset to RETRYING

**Exhausted Retry Jobs Recovery** (lines 404-456):
- Finds: `status = 'RETRYING' AND retryCount >= maxRetries`
- Action: Mark as FAILED with detailed error message

### 6. Maximum Lock Hold Time Enforcement

**File**: [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts)

**Max Absolute Hold Time**: 30 minutes (lines 28-30)

The system enforces an absolute maximum lock hold time that cannot be extended via renewal. This was implemented in Phase 3 (2026-01-06).

### 7. Implementation Timeline

From PROGRESS.md and TIMELINE.md:

| Date | Phase | Description | Status |
|------|-------|-------------|--------|
| 2026-01-07 | Phase 1 | Enhanced health detection (all stuck job states) | COMPLETE |
| 2026-01-07 | Phase 2 | **Comprehensive Self-Healing Auto-Recovery** | COMPLETE |
| 2026-01-06 | Phase 3 | Maximum lock hold time enforcement (30 minutes) | COMPLETE |
| 2026-01-06 | Phase 4 | E2E pipeline health tests | COMPLETE |
| 2026-01-06 | Phase 5 | Documentation and runbooks | COMPLETE |

## Architecture Documentation

### Dual-Service Deployment Model

```
┌──────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (cloudflare-cron/index.js)                     │
│ Version: 2.6.0                                                   │
├──────────────────────────────────────────────────────────────────┤
│ Cron Schedules:                                                  │
│   */5  * * * * → handlePipelineProcessing() → /api/cron/tier-aware│
│   */10 * * * * → handleIntervalSummary() → /api/cron/slack-interval│
│   */15 * * * * → handleAutoRecovery() → /api/cron/auto-recover   │
│   0 22 * * *   → handleDailyReport() → /api/cron/slack-daily     │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HMAC-authenticated HTTP calls
┌──────────────────────────────────────────────────────────────────┐
│ Vercel Application (https://tldrsec.app)                         │
├──────────────────────────────────────────────────────────────────┤
│ /api/cron/tier-aware       - Main pipeline orchestration         │
│ /api/cron/auto-recover     - Self-healing cleanup                │
│ /api/health/pipeline       - Health status + stuck job detection │
│ /api/admin/force-cleanup   - Emergency lock cleanup              │
│ /api/admin/trigger-redeploy - Vercel deployment trigger          │
└──────────────────────────────────────────────────────────────────┘
```

### Auto-Recovery Flow

```
Every 15 minutes (*/15 * * * *)
        │
        ▼
Cloudflare Worker: handleAutoRecovery()
        │
        ▼ GET /api/cron/auto-recover (HMAC auth)
        │
Vercel: Auto-Recover Endpoint
        │
        ├─→ Step 1: runImmediateCleanup()
        │   ├─→ Clean exhausted RETRYING → FAILED
        │   ├─→ Clean invalid job types → FAILED
        │   ├─→ Reset stale PROCESSING → PENDING
        │   └─→ Clean stale locks → force-cleanup
        │
        ├─→ Step 2: If cleanup occurred → Send Slack notification
        │
        ├─→ Step 3: Get pipeline health status
        │
        └─→ Step 4: Determine further action
            ├─→ HEALTHY: Reset counters, no action
            ├─→ DEGRADED: Track consecutive count
            │   └─→ After 6 checks (30 min): Proactive investigation
            └─→ CRITICAL (>120 min stall):
                ├─→ Wait 10 min after cleanup
                ├─→ Check 1-hour cooldown
                └─→ Trigger Vercel redeploy
```

## Code References

### Auto-Recovery Infrastructure
- `app/api/cron/auto-recover/route.ts:1-541` - Comprehensive self-healing endpoint
- `app/api/cron/auto-recover/route.ts:185-268` - `runImmediateCleanup()` function
- `app/api/cron/auto-recover/route.ts:376-516` - Recovery decision logic

### Cloudflare Worker
- `cloudflare-cron/index.js:278-344` - `handleAutoRecovery()` handler
- `cloudflare-cron/index.js:114-165` - Cron routing based on expression
- `cloudflare-cron/wrangler.toml:14` - Cron schedule configuration

### Health Monitoring
- `app/api/health/pipeline/route.ts:162-236` - Stuck job detection
- `app/api/health/pipeline/route.ts:229-236` - Exhausted RETRYING detection (raw SQL)
- `app/api/health/pipeline/route.ts:310-327` - Health status determination

### Lock Management
- `lib/db/distributed-lock.ts:28-30` - Max absolute hold time (30 min)
- `lib/job-queue/lock-service.ts:249-266` - `forceCleanupAllLocks()`
- `app/api/admin/force-cleanup/route.ts` - Emergency cleanup endpoint

### Background Worker Recovery
- `lib/cron/background-filing-worker.ts:321-392` - `recoverStaleJobs()`
- `lib/cron/background-filing-worker.ts:404-456` - `recoverExhaustedRetryJobs()`

## Historical Context (from thoughts/)

Relevant research documents found:

1. **[2026-01-05-database-connection-pipeline-uptime.md](thoughts/shared/research/2026-01-05-database-connection-pipeline-uptime.md)** - Database connection handling and pipeline uptime infrastructure
2. **[2026-01-01-infrastructure-uptime-resilience.md](thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md)** - Infrastructure for >99.99% uptime
3. **[2026-01-03-job-failure-analysis-sub-001-percent-strategy.md](thoughts/shared/research/2026-01-03-job-failure-analysis-sub-001-percent-strategy.md)** - Strategy for <0.01% failure rate
4. **[2026-01-03-pipeline-stalling-fix-documentation.md](thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md)** - Pipeline stalling fix documentation
5. **[2025-12-30-e2e-pipeline-cloudflare-event-drop.md](thoughts/shared/research/2025-12-30-e2e-pipeline-cloudflare-event-drop.md)** - Previous Cloudflare event drop investigation

## Key Files to Check for Deployment Status

To verify if the Cloudflare Worker has been redeployed with the latest auto-recovery code:

1. **Cloudflare Dashboard** - Check worker deployment history
2. **GitHub Actions** - `.github/workflows/cloudflare-worker-deploy.yml` - Verify if worker was auto-deployed
3. **Local Deployment** - Run `cd cloudflare-cron && npx wrangler deployments list`

## Open Questions

1. **Cloudflare Worker Deployment Status**: Has the Cloudflare Worker been redeployed after the Phase 2 auto-recovery changes on 2026-01-07?

2. **Event Drop Root Cause**: Was the event drop at 7-8PM AEST caused by:
   - Cloudflare Worker not triggering (infrastructure issue)?
   - Auto-recovery endpoint failing to respond?
   - Stuck jobs that weren't cleaned up?
   - Network/authentication failure between Cloudflare and Vercel?

3. **KV Namespace Configuration**: The wrangler.toml has KV namespaces commented out. This means circuit breaker state is not persisted across worker instances, which could affect recovery behavior.

## Verification Commands

```bash
# Check Cloudflare Worker deployment status
cd cloudflare-cron && npx wrangler deployments list

# Check Cloudflare Worker logs
cd cloudflare-cron && npx wrangler tail --format=pretty

# Test auto-recovery endpoint directly
curl -H "x-cron-secret: $CRON_SECRET" https://tldrsec.app/api/cron/auto-recover

# Check pipeline health
curl https://tldrsec.app/api/health/pipeline
```
