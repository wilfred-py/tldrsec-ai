# Pipeline Recovery Runbook

This document provides procedures for detecting, diagnosing, and recovering from SEC filing pipeline issues. It covers all known stuck job conditions and escalation paths.

## Overview

The SEC filing pipeline processes three phases:
1. **Discovery** (`ASYNC_DISCOVER_FILINGS`) - Find new filings from SEC EDGAR
2. **Fetch** (`ASYNC_FETCH_FILING`) - Download and parse filing content
3. **Summarize** (`ASYNC_SUMMARIZE_CACHED`) - Generate AI summaries and send emails

### Cron Schedule

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| `*/5 * * * *` | `/api/cron/tier-aware` | Main pipeline processing |
| `*/10 * * * *` | `/api/slack/interval-summary` | Slack status updates |
| `*/15 * * * *` | `/api/cron/auto-recover` | Auto-recovery health check |
| `0 22 * * *` | `/api/slack/daily-report` | Daily report at 9 AM AEST |

### Architecture

```
Cloudflare Worker (sole cron trigger)
        │
        ▼
Vercel Serverless Functions
        │
        ▼
Neon PostgreSQL (pipeline.JobQueue)
```

**Critical**: Cloudflare Worker is the SOLE cron trigger (Vercel Hobby plan limitation). All recovery mechanisms must work within the 15-minute auto-recovery cycle.

---

## Health Check Interpretation

### Health Endpoint

```bash
curl https://tldrsec.app/api/health/pipeline | jq
```

### Status Levels

| Status | HTTP | Meaning | Action Required |
|--------|------|---------|-----------------|
| `HEALTHY` | 200 | All systems operating normally | None |
| `DEGRADED` | 200 | Issues detected but pipeline functional | Monitor, may self-resolve |
| `CRITICAL` | 503 | Pipeline stalled or severely impacted | Immediate investigation |
| `ERROR` | 500 | Unable to determine status | Check infrastructure |

### Key Metrics in Response

```json
{
  "status": "HEALTHY",
  "jobs": {
    "pending": 0,          // Jobs waiting to process
    "processing": 0,       // Jobs currently processing
    "completedLast1h": 50, // Throughput indicator
    "completedLast24h": 500,
    "deadLetter": 0,       // Failed jobs
    "retrying": 0,         // Jobs scheduled for retry
    "exhaustedRetrying": 0, // CRITICAL: Stuck forever
    "staleProcessing": 0,   // DEGRADED: May be hung
    "invalidJobTypes": 0,   // CRITICAL: Can never complete
    "highRetryCount": 0     // WARNING: Approaching failure
  },
  "locks": {
    "healthStatus": "HEALTHY",
    "staleCount": 0,
    "activeCount": 1
  },
  "minutesSinceLastCompletion": 5,
  "issues": [],
  "warnings": [],
  "recommendations": []
}
```

---

## Stuck Job Conditions

### 1. Exhausted RETRYING Jobs (CRITICAL)

**Description**: Jobs stuck in `RETRYING` status where `retryCount >= maxRetries`. These jobs will NEVER be picked up by the job selector because it filters `retryCount < maxRetries`.

**Root Cause**: This was the root cause of the 41-hour pipeline stall on January 3-5, 2026.

**Detection**:
```bash
curl https://tldrsec.app/api/health/pipeline | jq '.jobs.exhaustedRetrying'
```

**Manual Query**:
```sql
SELECT id, "jobType", "retryCount", "maxRetries", status, "createdAt"
FROM pipeline."JobQueue"
WHERE status = 'RETRYING'
  AND "retryCount" >= "maxRetries";
```

**Resolution**:
```sql
-- Mark as FAILED so they don't block the pipeline
UPDATE pipeline."JobQueue"
SET
  status = 'FAILED',
  "failedAt" = NOW(),
  "lastError" = 'Manual recovery: Exhausted retry jobs cleaned up'
WHERE status = 'RETRYING'
  AND "retryCount" >= "maxRetries";
```

**Prevention**: Auto-recovery should clean these automatically every 15 minutes.

---

### 2. Invalid Job Types (CRITICAL)

**Description**: Jobs with `jobType` values that have no handler (e.g., legacy types like `filing_fetch`).

**Valid Job Types**:
- `ASYNC_DISCOVER_FILINGS`
- `ASYNC_FETCH_FILING`
- `ASYNC_SUMMARIZE_CACHED`

**Detection**:
```bash
curl https://tldrsec.app/api/health/pipeline | jq '.jobs.invalidJobTypes'
```

**Manual Query**:
```sql
SELECT id, "jobType", status, "createdAt"
FROM pipeline."JobQueue"
WHERE status IN ('PENDING', 'RETRYING', 'PROCESSING')
  AND "jobType" NOT IN ('ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED');
```

**Resolution**:
```sql
-- Mark as FAILED since no handler exists
UPDATE pipeline."JobQueue"
SET
  status = 'FAILED',
  "failedAt" = NOW(),
  "lastError" = 'Manual recovery: Invalid job type - no handler exists'
WHERE status IN ('PENDING', 'RETRYING')
  AND "jobType" NOT IN ('ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED');
```

---

### 3. Stale PROCESSING Jobs (DEGRADED)

**Description**: Jobs stuck in `PROCESSING` status for >15 minutes. This typically indicates a crashed worker or hung process.

**Detection**:
```bash
curl https://tldrsec.app/api/health/pipeline | jq '.jobs.staleProcessing'
```

**Manual Query**:
```sql
SELECT id, "jobType", "startedAt",
       EXTRACT(EPOCH FROM (NOW() - "startedAt"))/60 as minutes_processing
FROM pipeline."JobQueue"
WHERE status = 'PROCESSING'
  AND "startedAt" < NOW() - INTERVAL '15 minutes';
```

**Resolution**:
```sql
-- Reset back to PENDING for retry
UPDATE pipeline."JobQueue"
SET
  status = 'PENDING',
  "startedAt" = NULL,
  "lastError" = 'Manual recovery: Reset stale PROCESSING job'
WHERE status = 'PROCESSING'
  AND "startedAt" < NOW() - INTERVAL '15 minutes';
```

---

### 4. Stale Locks (DEGRADED)

**Description**: Distributed locks that have expired but weren't properly released. Can block job processing if workers assume the lock is held.

**Detection**:
```bash
curl https://tldrsec.app/api/health/pipeline | jq '.locks.staleCount'
```

**Manual Query**:
```sql
SELECT id, "lockName", "acquiredBy", "expiresAt"
FROM pipeline."JobLock"
WHERE "expiresAt" < NOW()
  AND released = false;
```

**Resolution**:
```sql
-- Clear expired locks
DELETE FROM pipeline."JobLock"
WHERE "expiresAt" < NOW()
  AND released = false;
```

**Or via admin endpoint**:
```bash
curl -X POST https://tldrsec.app/api/admin/force-cleanup \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

---

### 5. Lock Maximum Hold Time (30 minutes)

**Description**: Locks are automatically capped at 30 minutes absolute hold time to prevent hung processes from blocking the pipeline indefinitely.

**Detection**: Check lock metrics for locks approaching max hold time.

**Behavior**:
- Lock TTL requests >30 minutes are automatically capped
- Auto-renewal stops when absolute max is reached
- Warning logged when locks reach 80% of max hold time

---

## Auto-Recovery Behavior

The `/api/cron/auto-recover` endpoint runs every 15 minutes and performs:

### Immediate Actions (Every Run)

1. **Stale Lock Cleanup**: Clears any expired locks
2. **Health Check**: Gets current pipeline health status

### Conditional Actions

| Condition | Action |
|-----------|--------|
| `status: HEALTHY` | No action, reset counters |
| `locks.staleCount > 0` | Trigger force cleanup |
| `status: CRITICAL` + stall >120 min | Wait 10 min post-cleanup, then redeploy |
| `status: DEGRADED` | Monitor, log warning |

### Cooldown Periods

- **Cleanup to Redeploy**: 10 minutes wait after cleanup before considering redeploy
- **Redeploy Cooldown**: 1 hour between automatic redeploys

---

## Manual Recovery Procedures

### Procedure 1: Quick Health Check

```bash
# 1. Check pipeline health
curl https://tldrsec.app/api/health/pipeline | jq

# 2. Check Cloudflare Worker health
curl https://cloudflare-cron.wilfred-chen-python.workers.dev/health | jq

# 3. Check recent completions
curl 'https://tldrsec.app/api/health/pipeline' | jq '.minutesSinceLastCompletion'
```

### Procedure 2: Full Pipeline Investigation

```bash
# 1. Check all job counts
curl https://tldrsec.app/api/health/pipeline | jq '.jobs'

# 2. Verify Cloudflare Worker is running
cd cloudflare-cron && npx wrangler tail --format=pretty

# 3. Check for stuck conditions
curl https://tldrsec.app/api/health/pipeline | jq '{
  exhaustedRetrying: .jobs.exhaustedRetrying,
  invalidJobTypes: .jobs.invalidJobTypes,
  staleProcessing: .jobs.staleProcessing,
  staleLocks: .locks.staleCount
}'

# 4. Review issues and recommendations
curl https://tldrsec.app/api/health/pipeline | jq '{
  issues: .issues,
  recommendations: .recommendations
}'
```

### Procedure 3: Force Cleanup

```bash
# Trigger admin cleanup
curl -X POST https://tldrsec.app/api/admin/force-cleanup \
  -H "Authorization: Bearer $ADMIN_API_SECRET"

# Verify cleanup
curl https://tldrsec.app/api/health/pipeline | jq '.locks'
```

### Procedure 4: Cloudflare Worker Recovery

```bash
# 1. Check worker health
curl https://cloudflare-cron.wilfred-chen-python.workers.dev/health

# 2. If STALE or NO_HEARTBEAT, redeploy
cd cloudflare-cron && npx wrangler deploy

# 3. Monitor logs
cd cloudflare-cron && npx wrangler tail --format=pretty

# 4. Verify recovery
curl https://cloudflare-cron.wilfred-chen-python.workers.dev/health
```

---

## Escalation Paths

### Level 1: Automated (0-15 minutes)
- Auto-recovery runs every 15 minutes
- Cleans stale locks automatically
- Logs all actions to console

### Level 2: Monitoring Alert (15-30 minutes)
- Slack notifications for CRITICAL status
- Review health endpoint recommendations
- Run quick health check procedure

### Level 3: Manual Intervention (30+ minutes)
- Full pipeline investigation
- Manual SQL cleanup if needed
- Cloudflare Worker redeploy

### Level 4: Incident Response (2+ hours stall)
- Page on-call engineer
- Full incident documentation
- Root cause analysis required

---

## Verification Commands

### Daily Health Check
```bash
npm run verify:daily
```

### Comprehensive Pipeline Validation
```bash
npm run test:pipeline:comprehensive
```

### E2E Pipeline Recovery Tests
```bash
RUN_E2E_PIPELINE_TESTS=true npm run test:e2e:pipeline-recovery
```

---

## Common Failure Patterns

### Pattern: Jobs Complete But No Emails Sent

**Symptom**: `completedLast24h` is high but users report no emails.

**Investigation**:
1. Check Summary records have `summaryJSON` populated
2. Verify email queue is processing
3. Check Resend API rate limits

### Pattern: Discovery Works But Fetch Fails

**Symptom**: `ASYNC_DISCOVER_FILINGS` jobs complete, but `ASYNC_FETCH_FILING` jobs fail.

**Investigation**:
1. Check SEC EDGAR availability
2. Review rate limiting status
3. Check for specific filing types failing

### Pattern: Pipeline Healthy But Backlog Growing

**Symptom**: Health shows `HEALTHY` but `pending` count keeps increasing.

**Investigation**:
1. Check throughput: `completedLast1h` should be >0
2. Verify processing rate matches creation rate
3. Consider scaling (more frequent runs or batch sizes)

---

## Related Documents

- [Cloudflare Worker Monitoring](./cloudflare-worker-monitoring.md)
- [100% Pipeline Uptime Plan](../plans/2026-01-05-100-percent-pipeline-uptime.md)
- [Pipeline Health API](../../app/api/health/pipeline/route.ts)
- [Auto-Recovery Implementation](../../app/api/cron/auto-recover/route.ts)

---

## Revision History

| Date | Change |
|------|--------|
| 2026-01-06 | Initial creation - Phase 5 of 100% Pipeline Uptime |
