# Investigation Plan: Cloudflare Observable Event Drop (2025-12-30)

**Date**: 2025-12-30 18:41:57 AEDT
**Git Commit**: 0e31a36f7acc726b56e34f51f37ddda48a798ac4
**Branch**: feature/landing-page-stripe-redesign
**Repository**: tldrsec-ai

## Executive Summary

This investigation analyzes a significant drop in observable events on the Cloudflare dashboard between ~1:12PM and ~3:12PM AEST on 2025-12-30. Based on comprehensive codebase analysis and git history correlation, **the most likely root cause is a Vercel deployment at 15:07 AEST** that may have caused temporary endpoint unavailability or authentication configuration drift.

## Timeline Analysis

### Critical Git Commits on 2025-12-30 (AEST)

| Time (AEST) | Commit | Description | Risk Level |
|-------------|--------|-------------|------------|
| 12:11:03 | `787eae6` | Fix Cloudflare cron trigger restoration | **LOW** |
| 14:24:07 - 14:33:32 | Multiple | Form 144 emails, Form 4 fixes | **MEDIUM** |
| 15:00:28 - 15:07:53 | Multiple | Form 144 enhancements, merges | **HIGH** |
| 15:32:58 - 15:33:07 | `069f472`, `91e9cd0` | Form 144 PRs merged | **HIGH** |
| 18:24:11 - 18:25:27 | Multiple | Landing page redesign, subscription | **LOW** (after incident) |

### Correlation with Event Drop Window

**Pipeline Working**: 1:12PM - 3:12PM AEST
**Event Drop**: After ~3:12PM AEST

**Key Finding**: The commits at **15:00 - 15:33 AEST** (3:00 PM - 3:33 PM) directly correlate with the event drop window. These include:
- PR merges that trigger Vercel deployments
- Database migration potential (Form 144 changes)
- Multiple rapid consecutive commits

## Root Cause Analysis

### Primary Hypothesis: Vercel Deployment Disruption

**Evidence:**
1. PR merges at 15:07 and 15:32 trigger automatic Vercel deployments
2. Vercel deployment causes temporary function cold start
3. In-flight requests may timeout during deployment
4. HMAC authentication could fail if timestamp skew increases during deployment lag

**Mechanism:**
```
Cloudflare Worker (*/5 cron)
    │
    └─► POST /api/cron/tier-aware
            │
            ├─► Vercel deployment in progress
            │       └─► Cold start delay (10-30s)
            │
            └─► HMAC timestamp validation
                    └─► Timestamp skew exceeds 5-minute window
                            └─► 401 Unauthorized
```

### Secondary Hypothesis: Circuit Breaker Activation

**Evidence:**
1. Circuit breaker opens after 3 consecutive failures
2. If Vercel deployment caused 3 consecutive timeouts, circuit would open
3. Circuit breaker blocks pipeline for 3-minute recovery period

**Code Reference**: [cloudflare-cron/index.js:300-320](cloudflare-cron/index.js#L300-L320)

```javascript
const CIRCUIT_BREAKER_THRESHOLD = 3;
const recoveryTimeMs = 180000; // 3 minutes

if (this.memoryState.failureCount >= threshold) {
  this.memoryState.state = 'OPEN';
  this.memoryState.nextRetryTime = Date.now() + recoveryTimeMs;
}
```

### Tertiary Hypothesis: 90-Second Timeout Cascade

**Evidence:**
1. Cloudflare Worker sets 90-second timeout for Step 1.5 (Discovery)
2. Vercel job processing timeout is 270 seconds
3. If discovery jobs take >90s due to database load, Cloudflare sees timeout
4. Worker continues to Steps 2-3 with empty job queues

**Code Reference**: [cloudflare-cron/index.js:521-588](cloudflare-cron/index.js#L521-L588)

## What We're NOT Investigating

- **Cloudflare platform issues**: Cron triggers continued firing (heartbeat events visible)
- **Worker script errors**: Heartbeat updates before any circuit breaker check
- **Rate limiter activation**: Would show specific log messages
- **Database connection failures**: Would affect all endpoints, not just observable events

## Investigation Phases

### Phase 1: Evidence Collection (No Code Changes)

**Objective**: Gather definitive evidence of what happened during 3:00PM - 3:30PM AEST.

#### Step 1.1: Check Vercel Deployment Logs

```bash
vercel ls --limit 20
```

**Expected**: Find deployment timestamps between 15:00 - 15:30 AEST.

#### Step 1.2: Query Pipeline Database for Job Status

```sql
-- Check for failed jobs during the incident window
SELECT
  id,
  "jobType",
  status,
  "createdAt",
  "startedAt",
  "failedAt",
  "lastError",
  "retryCount"
FROM pipeline."JobQueue"
WHERE "createdAt" >= '2025-12-30T04:00:00Z'  -- 3:00 PM AEST = 04:00 UTC
  AND "createdAt" <= '2025-12-30T04:30:00Z'  -- 3:30 PM AEST = 04:30 UTC
ORDER BY "createdAt" DESC;
```

**Expected**: Find jobs with timeout errors or authentication failures.

#### Step 1.3: Check Cloudflare Worker Logs

```bash
cd cloudflare-cron && npx wrangler tail --format=pretty --since 2h
```

**Look for**:
- `[CIRCUIT_BREAKER] State changed to OPEN`
- `Rate limit exceeded`
- `Authentication failed`
- HTTP 401/500 responses

#### Step 1.4: Check Vercel Function Logs

Navigate to Vercel Dashboard → Project → Logs → Filter by `/api/cron/tier-aware`

**Look for**:
- 401 Unauthorized responses
- 500 Internal Server Error
- Timeout errors
- Lock acquisition failures

### Phase 2: Root Cause Confirmation

**Objective**: Confirm which hypothesis is correct based on Phase 1 evidence.

#### Step 2.1: Analyze Evidence Patterns

| Evidence Pattern | Indicates |
|-----------------|-----------|
| Multiple 401s at 15:07-15:10 | HMAC timestamp skew during deployment |
| Circuit breaker OPEN logs | 3+ consecutive failures |
| 90-second timeouts on discovery | Timeout cascade |
| Lock held by previous execution | Concurrent execution conflict |
| No errors, just no jobs | Job queue empty (upstream issue) |

#### Step 2.2: Correlate with Deployment Timeline

```bash
# Get exact deployment times from Vercel
vercel deployments --limit 10 --json | jq '.[] | {created: .created, state: .state}'
```

### Phase 3: Preventive Measures

**Objective**: Implement safeguards to prevent future event drops.

#### Step 3.1: Add Deployment Health Check

**File**: [app/api/health/deployment/route.ts](app/api/health/deployment/route.ts) (NEW)

Create endpoint that Cloudflare Worker checks before full pipeline execution:

```typescript
// Returns 200 only if deployment is stable and warmed up
export async function GET() {
  const warmupCheck = await checkDatabaseConnection();
  const authCheck = await verifyAuthConfiguration();

  if (!warmupCheck || !authCheck) {
    return NextResponse.json({ ready: false }, { status: 503 });
  }

  return NextResponse.json({
    ready: true,
    deploymentAge: process.env.VERCEL_DEPLOYMENT_ID,
    timestamp: Date.now()
  });
}
```

#### Step 3.2: ~~Increase HMAC Timestamp Tolerance During Deployments~~ (SKIPPED)

**File**: [lib/security/hmac-auth.ts](lib/security/hmac-auth.ts)

**Decision**: NOT IMPLEMENTED

**Rationale**: The root cause analysis confirmed that HMAC authentication was NOT the cause of this incident. The `*/5` cron schedule stopped firing entirely - no requests were made, so HMAC was never evaluated. Increasing the tolerance would:
1. Reduce security without addressing the actual issue
2. Potentially increase vulnerability to replay attacks
3. Not prevent future cron schedule failures

The current 5-minute tolerance is already generous and appropriate for the Cloudflare-Vercel handshake.

#### Step 3.3: Add Circuit Breaker Status to Health Endpoint

**File**: [cloudflare-cron/index.js](cloudflare-cron/index.js) - `/health` endpoint

Add circuit breaker state to health response:

```javascript
status.circuitBreaker = {
  state: circuitBreaker.memoryState.state,
  failureCount: circuitBreaker.memoryState.failureCount,
  nextRetryTime: circuitBreaker.memoryState.nextRetryTime
};
```

### Phase 4: Monitoring Enhancements

**Objective**: Detect similar issues proactively.

#### Step 4.1: Add Deployment Event Logging to Slack

When a Vercel deployment completes, post to Slack:

```json
{
  "text": "Deployment completed",
  "blocks": [
    {
      "type": "section",
      "text": "Vercel deployment ${VERCEL_DEPLOYMENT_ID} is now live"
    }
  ]
}
```

#### Step 4.2: Create Observable Events Dashboard Query

For Cloudflare Analytics:

```sql
SELECT
  toStartOfFiveMinute(timestamp) as bucket,
  count(*) as event_count,
  countIf(status = 'success') as success_count,
  countIf(status = 'circuit_breaker_blocked') as blocked_count,
  countIf(status = 'rate_limited') as rate_limited_count
FROM worker_events
WHERE timestamp >= now() - interval '24 hours'
GROUP BY bucket
ORDER BY bucket DESC
```

## Phase 1 Investigation Results (2025-12-30 19:48 AEST)

### Step 1.1 Results: Vercel Deployment Logs ✅

**Confirmed production deployments during the incident window:**

| Time (AEST) | Deployment ID | Status | Duration |
|-------------|---------------|--------|----------|
| 12:11:06 | `dpl_7EfSpT5vCrACziwWAx1oJWaLD86w` | Ready | 5m |
| **15:07:27** | `dpl_EknfGyKiRh7XkgaypZs7YU68Hi92` | Ready | 5m |
| **15:33:00** | `dpl_DtdF2LuSyszTcKsNhgSUJaZJEo3x` | Ready | 5m |

**Finding**: Two production deployments occurred at exactly **15:07 AEST** and **15:33 AEST**, directly correlating with the event drop window.

### Step 1.2 Results: JobQueue Database Analysis ✅

**Discovery Jobs Timeline:**
- Jobs were created regularly every 5 minutes from 03:00 UTC onwards
- **Last discovery job created**: `2025-12-30 04:10:25 UTC` (15:10:25 AEST)
- **Gap detected**: No discovery jobs created after 04:10 UTC (15:10 AEST)
- **Current status**: Pipeline has been DOWN for 4+ hours

**CronJobExecution Timeline:**
- Last recorded execution: `2025-12-30 04:10:24 UTC` (15:10:24 AEST)
- All executions showed `SUCCESS` status with ~2-3 second durations
- **No executions recorded after 04:10 UTC**

**Failed Jobs Check**: No failed jobs found in the incident window (all completed successfully before pipeline stopped)

### Step 1.3 Results: Cloudflare Worker Status ✅

- Worker last deployed: 2025-12-29T02:03:48 UTC (not during incident)
- Current health endpoint: Connection refused (workers.dev domain not responding)
- No real-time logs captured (15-second tail showed no activity)

### Step 1.4: Live Cloudflare Worker Log Analysis ✅

**Real-time log capture (19:09-19:12 AEST):**

```
"*/10 * * * *" @ 12/30/2025, 7:10:13 PM - Ok
  (log) [scheduled-1767082215165-m2k964h] Scheduled event triggered with cron expression: */10 * * * *
  (log) [interval-summary-1767082215165] Starting 10-minute interval Slack summary
  (log) [interval-summary-1767082215165] Interval summary completed successfully in 7257ms { skipped: true }
```

**Critical observations:**
- ✅ `*/10 * * * *` cron (interval summary) is firing correctly
- ❌ `*/5 * * * *` cron (pipeline processing) is **NOT firing at all**
- No `[HEARTBEAT]` messages appearing
- No pipeline processing logs appearing

---

## ROOT CAUSE IDENTIFIED: Cloudflare Cron Schedule Failure

**The pipeline stopped at 15:10:25 AEST because the `*/5 * * * *` cron schedule stopped triggering.**

### Evidence:
1. `*/10 * * * *` cron triggers successfully (interval summary works)
2. `*/5 * * * *` cron does NOT trigger (pipeline processing missing)
3. No heartbeat messages since 15:10 AEST
4. Worker script itself is healthy (responds to other cron schedules)

### Root Cause:
The Cloudflare cron scheduler lost the `*/5 * * * *` trigger registration. This is likely due to:
- A transient Cloudflare platform issue
- Partial deployment state after a Vercel deployment triggered rebuild
- Cron schedule registration drift

### NOT the cause:
- ~~Circuit breaker activation~~ - Worker isn't even being called
- ~~HMAC authentication failure~~ - No requests being made
- ~~Vercel endpoint issues~~ - Endpoint responds correctly when called

**Immediate fix required**: Redeploy the Cloudflare Worker to re-register all cron triggers:
```bash
cd cloudflare-cron && npx wrangler deploy
```

---

## RESOLUTION: Pipeline Restored (2025-12-30 19:15 AEST)

### Fix Applied
Redeployed Cloudflare Worker at 19:15 AEST to re-register all cron triggers.

**Deployment output:**
```
Deployed cloudflare-cron triggers (2.12 sec)
  https://cloudflare-cron.wilfred-chen-python.workers.dev
  schedule: */5 * * * *
  schedule: */10 * * * *
  schedule: 0 22 * * *
Current Version ID: 166080d5-6a5c-432f-aa66-1d6475fd5dc7
```

### Verification
First `*/5` cron executed successfully at 19:15:14 AEST:
- ✅ Step 0: Lock cleanup - 6.5s
- ✅ Step 1: Tier-aware endpoint - 3.5s (202 Accepted)
- ✅ Step 1.5: Discovery jobs - 36s (1 job processed)
- ✅ Step 2: Fetch jobs - 39s (5 jobs processed)
- ✅ Step 3: Summarize jobs - 14s (1 job processed)
- ✅ **Total pipeline: 110s**

Second `*/5` cron executed at 19:20 AEST confirming sustained recovery.

### Downtime Summary
- **Start**: 15:10:25 AEST (after Vercel deployment)
- **End**: 19:15:14 AEST (after Cloudflare Worker redeploy)
- **Total downtime**: ~4 hours 5 minutes
- **Impact**: No SEC filing discovery/processing during this window

### Database Confirmation
```sql
-- Gap closed: New jobs created after redeploy
08:15:30 UTC (19:15 AEST) - COMPLETED
08:20:21 UTC (19:20 AEST) - COMPLETED
```

---

## Success Criteria

### Phase 1 Success Criteria

- [x] Retrieved Vercel deployment logs for 15:00-15:30 AEST window
- [x] Queried JobQueue for jobs created during incident
- [x] Reviewed Cloudflare Worker logs for circuit breaker state
- [x] Documented specific error messages found - **Root cause: Cron schedule failure**

### Phase 2 Success Criteria

- [x] Identified which hypothesis is correct - **NEW HYPOTHESIS: Cloudflare cron schedule dropped**
- [x] Documented root cause with evidence - **`*/5` cron not triggering, `*/10` works**
- [x] Created incident report - **[2025-12-30-cloudflare-cron-schedule-failure.md](../incidents/2025-12-30-cloudflare-cron-schedule-failure.md)**

### Phase 3 Success Criteria

- [x] Health check endpoint implemented and deployed - **[app/api/health/deployment/route.ts](../../app/api/health/deployment/route.ts)**
- [x] HMAC tolerance adjustment evaluated - **SKIPPED: Not the root cause**
- [x] Circuit breaker visibility added to health endpoint - **[cloudflare-cron/index.js](../../cloudflare-cron/index.js) v2.6.0**

### Phase 4 Success Criteria

- [ ] ~~Slack deployment notifications configured~~ - **SKIPPED: Vercel webhooks require Pro plan**
  - Webhook endpoint created at [app/api/webhooks/vercel-deployment/route.ts](../../app/api/webhooks/vercel-deployment/route.ts) but cannot be used on Hobby plan
- [x] Monitoring dashboard created or documented - **[docs/runbooks/cloudflare-worker-monitoring.md](../runbooks/cloudflare-worker-monitoring.md)**
- [x] Alert thresholds defined for event drop detection - **See runbook**

## Immediate Next Steps

1. **Run Phase 1.1**: Execute `vercel ls --limit 20` to get deployment timestamps
2. **Run Phase 1.2**: Query JobQueue database for incident window
3. **Run Phase 1.3**: Check Cloudflare Worker logs with `wrangler tail`
4. **Correlate findings**: Match evidence to hypotheses

## References

- Research document: [thoughts/shared/research/2025-12-30-e2e-pipeline-cloudflare-event-drop.md](thoughts/shared/research/2025-12-30-e2e-pipeline-cloudflare-event-drop.md)
- Cloudflare Worker: [cloudflare-cron/index.js](cloudflare-cron/index.js)
- Tier-aware endpoint: [app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts)
- HMAC authentication: [lib/security/hmac-auth.ts](lib/security/hmac-auth.ts)
- Circuit breaker: [cloudflare-cron/index.js:300-320](cloudflare-cron/index.js#L300-L320)

## Appendix: Architecture Recap

### Event Flow

```
Cloudflare Worker (*/5 * * * *)
        │
        ├─ Step 0: POST /api/cron/cleanup-locks
        │
        ├─ Step 1: GET /api/cron/tier-aware
        │         └─ Queues ASYNC_DISCOVER_FILINGS job
        │
        ├─ Step 1.5: GET /api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS
        │         └─ Checks RSS feeds, queues ASYNC_FETCH_FILING jobs
        │
        ├─ Step 2: GET /api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING
        │         └─ Fetches SEC content, queues ASYNC_SUMMARIZE_CACHED jobs
        │
        └─ Step 3: GET /api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED
                  └─ AI summarization, sends emails
```

### Observable Events Generated Per Cycle

| Event Type | Source | Expected Per 5-min Cycle |
|------------|--------|-------------------------|
| Scheduled trigger | Cloudflare | 1 |
| Heartbeat log | Worker | 1 |
| Step completion logs | Worker | 4-5 |
| HTTP request logs | Worker | 4-5 |
| Vercel function logs | Vercel | 4-5 |

**Total expected**: 14-17 observable events per 5-minute cycle

### Circuit Breaker Impact

When circuit breaker is OPEN:
- Heartbeat **continues** (1 event)
- Pipeline execution **blocked** (remaining events lost)
- Recovery in 3 minutes

**Impact**: ~85% event reduction during OPEN state
