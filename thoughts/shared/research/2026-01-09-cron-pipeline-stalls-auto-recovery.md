---
date: 2026-01-09T16:15:19+11:00
researcher: Claude
git_commit: e08ea36026bdc612c08b6f76a05049dd3009fcf0
branch: main
repository: tldrsec-ai
topic: "Cron Pipeline Stalls and Auto-Recovery Infrastructure"
tags: [research, codebase, cron, pipeline, auto-recovery, cloudflare-worker, stall-detection, distributed-locks]
status: complete
last_updated: 2026-01-09
last_updated_by: Claude
---

# Research: Cron Pipeline Stalls and Auto-Recovery Infrastructure

**Date**: 2026-01-09T16:15:19 AEDT
**Researcher**: Claude
**Git Commit**: e08ea36026bdc612c08b6f76a05049dd3009fcf0
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

How does the cron pipeline stall detection and auto-recovery system work in tldrsec-ai?

## Summary

The codebase implements a comprehensive multi-layered system for detecting pipeline stalls and automatically recovering from them. The architecture consists of:

1. **Cloudflare Worker** (`cloudflare-cron/index.js`) - Triggers the pipeline every 5-15 minutes with HMAC authentication
2. **Stall Detection** - Multiple health check endpoints and monitoring services that detect stuck jobs, stale locks, and processing gaps
3. **Auto-Recovery** - Automated cleanup of exhausted jobs, stale locks, and invalid job types that run on every cron execution
4. **Circuit Breakers** - Time-based and failure-based circuit breakers to prevent cascading failures

The system detects stalls through:
- Jobs stuck in PROCESSING status for >15 minutes
- RETRYING jobs that have exhausted their retry count
- Jobs with invalid types (no handler exists)
- Stale distributed locks (expired but not released)
- Time since last job completion (60 min = DEGRADED, 180 min = CRITICAL)

Auto-recovery actions include:
- Marking exhausted RETRYING jobs as FAILED
- Resetting stale PROCESSING jobs to PENDING
- Cleaning up stale locks via `forceCleanupAllLocks()`
- Re-queuing failed filings through daily verification scripts

---

## Detailed Findings

### 1. Cloudflare Worker Cron System

The Cloudflare Worker serves as the external scheduler that triggers the Vercel backend. It runs on Cloudflare's global edge network with zero cold starts.

**Entry Point**: [cloudflare-cron/index.js](cloudflare-cron/index.js)

**Cron Schedules** (wrangler.toml:13-14):
- `*/5 * * * *` - Main pipeline processing (5-step sequence)
- `*/10 * * * *` - Slack interval summary
- `*/15 * * * *` - Auto-recovery health check
- `0 22 * * *` - Daily Slack report (9 AM AEST)

**5-Step Pipeline Execution** (index.js:508-1085):

| Step | Endpoint | Purpose | Timeout | Retries |
|------|----------|---------|---------|---------|
| 0 | `/api/cron/cleanup-locks` | Clear stale locks | 30s | 2 |
| 1 | `/api/cron/tier-aware` | Queue discovery jobs | 4.5min | 5 |
| 1.5 | `/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS` | Process discovery | 90s | 1 |
| 2 | `/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING` | Fetch SEC content | 4.5min | 5 |
| 3 | `/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED` | Generate summaries | 4.5min | 5 |

**HMAC Authentication** (index.js:652-677):
- Payload: `${timestamp}:${method}:${path}`
- Algorithm: HMAC-SHA256
- Headers: `x-hmac-signature`, `x-hmac-timestamp`
- Max time skew: 5 minutes

**Advanced Features**:
- Circuit breaker pattern (opens after 3 consecutive failures)
- Rate limiting (30 requests/minute, burst protection)
- Handler health tracking with Slack alerts
- KV storage persistence for state

---

### 2. Stall Detection Mechanisms

The system implements multiple detection layers:

#### 2.1 Pipeline Health Endpoint

**File**: [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts)

**Detection Metrics** (lines 77-88):
```typescript
const STALE_PROCESSING_MINUTES = 15;  // Jobs stuck in PROCESSING
const HIGH_RETRY_THRESHOLD = 2;       // Jobs approaching max retries
const VALID_JOB_TYPES = [
  'ASYNC_DISCOVER_FILINGS',
  'ASYNC_FETCH_FILING',
  'ASYNC_SUMMARIZE_CACHED'
];
```

**Stall Indicators**:

| Indicator | Detection Query | Threshold |
|-----------|-----------------|-----------|
| Exhausted RETRYING | `status='RETRYING' AND retryCount >= maxRetries` | Any count > 0 |
| Stale PROCESSING | `status='PROCESSING' AND startedAt < NOW() - 15 min` | Any count > 0 |
| Invalid Job Types | `jobType NOT IN (VALID_JOB_TYPES)` | Any count > 0 |
| No completions | Time since last `completedAt` | 60 min = DEGRADED, 180 min = CRITICAL |

**Health Status Determination** (lines 308-327):
- **CRITICAL**: Lock health critical, >180 min since completion, exhausted jobs, or invalid job types
- **DEGRADED**: Lock warnings, >60 min since completion, or stale processing jobs
- **HEALTHY**: All metrics normal

#### 2.2 Lock Health Monitoring

**File**: [lib/job-queue/lock-service.ts](lib/job-queue/lock-service.ts)

**Lock Health Metrics** (lines 321-402):
- `activeLocks` - Count of non-released, non-expired locks
- `staleLocksCount` - **CRITICAL** - Expired but not released locks
- `healthStatus`: CRITICAL (>5 stale), WARNING (>2 stale), HEALTHY (<=2 stale)

#### 2.3 Queue Monitoring Service

**File**: [lib/cron/queue-monitoring.ts](lib/cron/queue-monitoring.ts)

**Issue Detection** (lines 114-159):
- Queue overload: `queueDepth > 100`
- Old pending jobs: Oldest pending >30 minutes
- High failure rate: `failedLast24h / total > 20%`
- Slow processing: Average processing time >120 seconds

#### 2.4 Timeout Protection

**File**: [app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts):96-119

**Configuration**:
- Worker timeout: 5 minutes (Vercel limit)
- Effective timeout: 4.5 minutes
- Timeout buffer: 30 seconds for cleanup

**Circuit Breaker** (lines 516-521):
- Skips backlog processing if <30 seconds remaining
- Logs circuit breaker activation
- Will retry on next cron execution

---

### 3. Auto-Recovery Infrastructure

The system implements automatic recovery that runs on every cron execution.

#### 3.1 Immediate Cleanup (Phase 2)

**File**: [app/api/cron/auto-recover/route.ts](app/api/cron/auto-recover/route.ts):186-278

Runs EVERY execution before decision logic:

| Cleanup Action | Target | New Status |
|----------------|--------|------------|
| Exhausted RETRYING | `retryCount >= maxRetries` | FAILED |
| Invalid Job Types | `jobType NOT IN (VALID_TYPES)` | FAILED |
| Stale PROCESSING | `startedAt < NOW() - 15 min` | PENDING (reset) |
| Stale Locks | `released=false AND expiresAt < NOW()` | released=true |

**SQL Examples**:
```sql
-- Exhausted RETRYING jobs
UPDATE "JobQueue"
SET status = 'FAILED', "failedAt" = NOW(),
    "lastError" = 'Auto-recovery: Exhausted retry jobs cleaned up'
WHERE status = 'RETRYING' AND "retryCount" >= "maxRetries"

-- Stale PROCESSING jobs
UPDATE "JobQueue"
SET status = 'PENDING', "startedAt" = NULL,
    "lastError" = 'Auto-recovery: Reset stale PROCESSING job'
WHERE status = 'PROCESSING'
AND "startedAt" < NOW() - INTERVAL '15 minutes'
```

#### 3.2 Lock Cleanup Methods

**File**: [lib/job-queue/lock-service.ts](lib/job-queue/lock-service.ts)

| Method | Purpose | Scope |
|--------|---------|-------|
| `cleanupExpiredLocks()` | Standard cleanup via Prisma | Expired locks only |
| `cleanupExpiredLocksAtomic()` | Atomic cleanup via raw SQL | Expired locks only |
| `forceCleanupAllLocks()` | Emergency cleanup | ALL locks (emergency use) |

**Lock Cleanup API** (lines 249-266):
```sql
-- Force cleanup (emergency)
UPDATE "JobLock" SET released = true WHERE released = false
```

#### 3.3 Background Worker Recovery

**File**: [lib/cron/background-filing-worker.ts](lib/cron/background-filing-worker.ts)

Runs before processing new jobs (lines 208-315):
1. `recoverStaleJobs()` - Reset PROCESSING jobs stuck >5 minutes
2. `recoverExhaustedRetryJobs()` - Mark exhausted RETRYING as FAILED
3. Process batch of pending jobs

#### 3.4 Recovery Decision Logic

**File**: [app/api/cron/auto-recover/route.ts](app/api/cron/auto-recover/route.ts):400-630

**Recovery State Tracking**:
```typescript
interface RecoveryState {
  lastCleanupTime: number | null;
  lastRedeployTime: number | null;
  consecutiveCleanups: number;
  consecutiveRedeploys: number;
  consecutiveDegraded: number;
}
```

**Decision Flow**:
1. **HEALTHY** → Reset counters, no action
2. **DEGRADED** → Monitor, trigger investigation after 6 consecutive checks (30 min)
3. **CRITICAL** → Wait 10 min after cleanup, consider redeploy (1-hour cooldown)

**Thresholds** (lines 50-64):
- `STALL_CRITICAL_MINUTES`: 120 (2 hours)
- `CLEANUP_TO_REDEPLOY_WAIT_MS`: 600000 (10 minutes)
- `REDEPLOY_COOLDOWN_MS`: 3600000 (1 hour)
- `DEGRADED_ACTION_THRESHOLD`: 6 checks (30 minutes)

---

### 4. Orchestration Flow

#### Main Cron Orchestration (Cloudflare Worker)

```
scheduled() trigger (every 5-15 minutes)
    ↓
1. Record heartbeat, validate environment
    ↓
2. Check circuit breaker and rate limits
    ↓
3. Step 0: POST /api/cron/cleanup-locks
   → cleanupExpiredLocks()
    ↓
4. Step 1: GET /api/cron/tier-aware
   → Queue ASYNC_DISCOVER_FILINGS jobs
    ↓
5. Step 1.5: GET /api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS
   → Process discovery, create fetch jobs
    ↓
6. Step 2: GET /api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING
   → Fetch SEC content, cache filings
    ↓
7. Step 3: GET /api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED
   → Generate AI summaries, send emails
    ↓
8. Aggregate results, update metrics
```

#### Auto-Recovery Flow (every 15 minutes)

```
GET /api/cron/auto-recover
    ↓
1. Authenticate request
    ↓
2. Get pipeline health metrics
    ↓
3. Run immediate cleanup (ALWAYS)
   • Clean exhausted RETRYING jobs
   • Clean invalid job types
   • Reset stale PROCESSING jobs
   • Clean stale locks
    ↓
4. Send Slack notification if cleanup performed
    ↓
5. Evaluate health status:
   • HEALTHY → Reset counters, return
   • DEGRADED → Monitor, investigate after 30 min
   • CRITICAL → Consider cleanup/redeploy
```

---

## Code References

### Stall Detection Files
- [app/api/health/pipeline/route.ts:164-236](app/api/health/pipeline/route.ts#L164-L236) - Stall indicator queries
- [lib/job-queue/lock-service.ts:321-402](lib/job-queue/lock-service.ts#L321-L402) - Lock health metrics
- [lib/cron/queue-monitoring.ts:114-159](lib/cron/queue-monitoring.ts#L114-L159) - Queue health checks
- [lib/monitoring/timeout-monitor.ts:80-153](lib/monitoring/timeout-monitor.ts#L80-L153) - Timeout detection

### Auto-Recovery Files
- [app/api/cron/auto-recover/route.ts:186-278](app/api/cron/auto-recover/route.ts#L186-L278) - Immediate cleanup logic
- [app/api/cron/cleanup-locks/route.ts](app/api/cron/cleanup-locks/route.ts) - Proactive lock cleanup
- [app/api/admin/force-cleanup/route.ts](app/api/admin/force-cleanup/route.ts) - Emergency force cleanup
- [lib/cron/background-filing-worker.ts:321-456](lib/cron/background-filing-worker.ts#L321-L456) - Worker recovery methods

### Cloudflare Worker Files
- [cloudflare-cron/index.js:508-1085](cloudflare-cron/index.js#L508-L1085) - Main pipeline handler
- [cloudflare-cron/index.js:652-677](cloudflare-cron/index.js#L652-L677) - HMAC signature generation
- [cloudflare-cron/wrangler.toml:13-14](cloudflare-cron/wrangler.toml#L13-L14) - Cron schedules

### Lock Management Files
- [lib/job-queue/lock-service.ts:184-266](lib/job-queue/lock-service.ts#L184-L266) - Lock cleanup methods
- [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts) - Distributed lock implementation

### Pipeline Handlers
- [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) - Phase 1: Discovery
- [lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts) - Phase 2: Fetch
- [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts) - Phase 3: Summarize

---

## Architecture Documentation

### Three-Phase Pipeline Architecture

The SEC filing pipeline operates in three distinct phases:

1. **Discovery Phase** (`ASYNC_DISCOVER_FILINGS`)
   - Checks SEC EDGAR RSS feeds for new filings
   - Matches filings against user-tracked tickers
   - Creates `ASYNC_FETCH_FILING` jobs for matched filings

2. **Fetch Phase** (`ASYNC_FETCH_FILING`)
   - Retrieves filing content from SEC.gov
   - Parses and caches content in `FilingContentCache`
   - Creates `ASYNC_SUMMARIZE_CACHED` jobs

3. **Summarize Phase** (`ASYNC_SUMMARIZE_CACHED`)
   - Generates AI summaries via OpenRouter/Claude
   - Stores summaries in `Summary` table
   - Triggers email notifications to users

### Distributed Lock Architecture

Locks prevent concurrent cron execution and job processing:

| Lock Name | Purpose | TTL |
|-----------|---------|-----|
| `sec-filing-monitor` | Main cron execution | 12 minutes |
| `job-processing` | Background worker | 5 minutes |
| `discovery-processing` | Discovery phase | 10 minutes |

Lock acquisition flow:
1. `cleanupExpiredLocks()` - Clear stale locks first
2. `acquireLock(name, ttl)` - Try to acquire
3. If held by another process, return 429 status
4. Execute with lock protection
5. `releaseLock()` on completion or error

### Job Queue State Machine

```
PENDING → PROCESSING → COMPLETED
    ↓         ↓
RETRYING → FAILED → DEAD_LETTER
```

**State Transitions**:
- PENDING → PROCESSING: Job picked up by worker
- PROCESSING → COMPLETED: Successful execution
- PROCESSING → RETRYING: Recoverable error, increment retryCount
- RETRYING → PENDING: Reset for next attempt
- RETRYING → FAILED: `retryCount >= maxRetries`
- FAILED → DEAD_LETTER: Manual investigation required

---

## Historical Context (from thoughts/)

### Pipeline Stalls & Outages
- [2026-01-03-pipeline-stalling-fix-documentation.md](thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md) - Job type mismatch in auto-remediation
- [2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md](thoughts/shared/research/2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md) - Comprehensive stall analysis
- [2025-12-12-pipeline-still-stalled-backlog-not-clearing.md](thoughts/shared/research/2025-12-12-pipeline-still-stalled-backlog-not-clearing.md) - Backlog not clearing, no API calls

### Auto-Recovery Implementation
- [2026-01-08-cron-event-drop-auto-recovery-analysis.md](thoughts/shared/research/2026-01-08-cron-event-drop-auto-recovery-analysis.md) - Cron event drop with auto-recovery
- [2026-01-01-infrastructure-uptime-resilience.md](thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md) - Infrastructure for >99.99% uptime

### Cloudflare Worker Issues
- [2025-12-30-e2e-pipeline-cloudflare-event-drop.md](thoughts/shared/research/2025-12-30-e2e-pipeline-cloudflare-event-drop.md) - E2E pipeline with event flow
- [2025-12-29-cloudflare-cron-investigation.md](thoughts/shared/research/2025-12-29-cloudflare-cron-investigation.md) - Cron execution investigation

---

## Related Research

- [2026-01-08-cron-event-drop-auto-recovery-analysis.md](thoughts/shared/research/2026-01-08-cron-event-drop-auto-recovery-analysis.md)
- [2026-01-03-pipeline-stalling-fix-documentation.md](thoughts/shared/research/2026-01-03-pipeline-stalling-fix-documentation.md)
- [2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md](thoughts/shared/research/2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md)

---

## Open Questions

None at this time. The cron pipeline stall detection and auto-recovery system is well-documented and the recent incident on 2026-01-09 (3-hour Cloudflare Worker gap) was resolved by redeploying the worker.
