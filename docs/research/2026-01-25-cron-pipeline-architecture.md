# Research: Cron Pipeline Architecture - Cloudflare Workers and Vercel Deployments

**Date**: 2026-01-25T05:55:44Z
**Researcher**: Claude
**Git Commit**: 66dd76d81c8f618748c0a8ca841ffc2615339e02
**Branch**: main
**Repository**: tldrsec-ai

---

## Research Question

How does the cron pipeline currently work with Cloudflare Workers and Vercel deployments? Document all working components, historical failure patterns, and identify synchronous/asynchronous operations that might cause bottlenecks.

---

## Executive Summary

The pipeline implements a **three-layer redundancy architecture** for SEC filing monitoring:

1. **Layer 1**: Primary Cloudflare Worker (every 5-10 minutes) - Main pipeline trigger  
2. **Layer 2**: Auto-Recovery Endpoint (every 15 minutes via CF Worker) - Self-healing cleanup
3. **Layer 3**: Vercel Final Backup (every 30 minutes) - Emergency trigger

The system processes SEC filings through a **3-phase async pipeline**: Discovery → Fetch → Summarize, with distributed locking, connection pooling, and sophisticated timeout management.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Cloudflare Worker Infrastructure](#2-cloudflare-worker-infrastructure)
3. [Vercel Endpoints](#3-vercel-endpoints)
4. [Job Queue System](#4-job-queue-system)
5. [Distributed Lock Management](#5-distributed-lock-management)
6. [Health Monitoring](#6-health-monitoring)
7. [Auto-Recovery Mechanisms](#7-auto-recovery-mechanisms)
8. [Historical Failure Analysis](#8-historical-failure-analysis)
9. [Sync vs Async Operations](#9-sync-vs-async-operations)
10. [Known Bottlenecks and Gaps](#10-known-bottlenecks-and-gaps)

---

## 1. Architecture Overview

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE WORKERS (Edge)                            │
│                                                                              │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐               │
│  │ */5 min cron   │   │ */10 min cron  │   │ */15 min cron  │               │
│  │ Pipeline       │   │ Slack Summary  │   │ Auto-Recovery  │               │
│  └───────┬────────┘   └───────┬────────┘   └───────┬────────┘               │
│          │                    │                    │                         │
│          │ HMAC Auth          │ HMAC Auth          │ HMAC Auth               │
│          ▼                    ▼                    ▼                         │
└──────────────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
                    ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          VERCEL (Application)                                │
│                                                                              │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐               │
│  │ /api/cron/     │   │ /api/cron/     │   │ /api/cron/     │               │
│  │ tier-aware     │   │ slack-interval │   │ auto-recover   │               │
│  └───────┬────────┘   └────────────────┘   └───────┬────────┘               │
│          │                                         │                         │
│          │ Queues Discovery Jobs                   │ Cleanup + Health Check  │
│          ▼                                         ▼                         │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                    JOB QUEUE (PostgreSQL)                        │       │
│  │  ASYNC_DISCOVER_FILINGS → ASYNC_FETCH_FILING → SUMMARIZE_CACHED  │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│          │                                                                   │
│          │ process-filing-queue endpoint                                     │
│          ▼                                                                   │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐               │
│  │ SEC EDGAR API  │   │ OpenRouter AI  │   │ Resend Email   │               │
│  │ (Rate Limited) │   │ (5 concurrent) │   │ (Per-filing)   │               │
│  └────────────────┘   └────────────────┘   └────────────────┘               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Three-Phase Async Pipeline

| Phase | Job Type | Duration | Batch Size | Description |
|-------|----------|----------|------------|-------------|
| 1 | ASYNC_DISCOVER_FILINGS | <5s | 10 | Fast RSS feed check, queue fetch jobs |
| 2 | ASYNC_FETCH_FILING | 10-30s | 5 | Fetch SEC document, cache content |
| 3 | ASYNC_SUMMARIZE_CACHED | 17-90s | 1 | AI summarization, send email |

---

## 2. Cloudflare Worker Infrastructure

### File Structure
```
cloudflare-cron/
├── index.js           # Main worker script (2,604 lines)
├── wrangler.toml      # Configuration and cron schedules
├── package.json       # Dependencies (wrangler ^4.43.0)
└── setup-secrets.sh   # Interactive secrets configuration
```

### Cron Schedules (wrangler.toml:13-14)

| Schedule | Handler | Purpose |
|----------|---------|---------|
| `*/5 * * * *` | `handlePipelineProcessing()` | Main pipeline trigger |
| `*/10 * * * *` | `handleIntervalSummary()` | Slack verification report |
| `*/15 * * * *` | `handleAutoRecovery()` | Self-healing health check |
| `0 22 * * *` | `handleDailyReport()` | Daily pipeline report (9 AM AEST) |

### HMAC Authentication Flow

**Signature Generation** ([index.js:652-677](cloudflare-cron/index.js#L652)):
```javascript
const payload = `${timestamp}:${method.toUpperCase()}:${path}`;
const hmac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
```

**Headers Sent**:
- `x-hmac-signature`: Hex-encoded HMAC-SHA256
- `x-hmac-timestamp`: Unix timestamp (ms)
- `X-Execution-Id`: Unique execution identifier
- `X-Cloudflare-Worker`: "tldrsec-cron"

### Pipeline Processing Steps ([index.js:626-648](cloudflare-cron/index.js#L626))

| Step | Endpoint | Purpose | Timeout |
|------|----------|---------|---------|
| 0 | `/api/cron/cleanup-locks` | Proactive lock cleanup | 30s |
| 1 | `/api/cron/tier-aware` | Queue discovery jobs | 270s |
| 1.5 | `/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS` | Process discovery | 270s |
| 2 | `/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING` | Process fetch jobs | 270s |
| 3 | `/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED` | Process summarize | 270s |

### Rate Limiting & Circuit Breaker

**Rate Limiting Configuration** ([index.js:554-565](cloudflare-cron/index.js#L554)):
- Max requests per window: 30 (1-minute window)
- Global subrequest limit: 1,800/minute
- Burst limit: 5 requests in 10 seconds

**Circuit Breaker** ([index.js:2245-2370](cloudflare-cron/index.js#L2245)):
- Threshold: 3 consecutive failures
- Recovery time: 3 minutes
- States: CLOSED → OPEN → HALF_OPEN → CLOSED

### Error Handling Patterns

**Retry Configuration** ([index.js:554-565](cloudflare-cron/index.js#L554)):
- Max retry attempts: 5
- Initial backoff: 500ms
- Max backoff: 3 minutes
- Jitter: 30%

**Non-Retryable Errors**:
- 401/403 authentication errors
- 400/422 validation errors
- 404 not found

---

## 3. Vercel Endpoints

### Directory Structure
```
app/api/cron/
├── tier-aware/route.ts           # Primary pipeline trigger
├── process-filing-queue/route.ts # Job processor
├── auto-recover/route.ts         # Self-healing cleanup
├── cleanup-locks/route.ts        # Lock cleanup (Step 0)
├── final-backup/route.ts         # Emergency backup (Layer 3)
├── slack-interval-summary/route.ts
├── slack-daily-report/route.ts
└── queue-status/route.ts         # Public queue health
```

### Tier-Aware Endpoint ([app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts))

**Authentication Flow** (lines 262-306):
1. Check Vercel internal cron header (`x-vercel-cron`)
2. Validate HMAC signature (`x-hmac-signature`, `x-hmac-timestamp`)
3. Optional IP allowlist check
4. Rate limiting per client IP

**3-Phase Pipeline Mode** (lines 157-248):
```typescript
const use3PhasePipeline = process.env.USE_3_PHASE_PIPELINE !== 'false';
```

When enabled (default):
1. Queues single `ASYNC_DISCOVER_FILINGS` job
2. Returns `202 Accepted` immediately
3. No inline processing (prevents timeout)

**Response** (lines 215-239):
```json
{
  "success": true,
  "processingMode": "3-phase-async",
  "discoveryJob": { "id": "...", "status": "PENDING" },
  "backlog": { "discovery": 0, "fetch": 0, "summarize": 0 }
}
```

### Process Filing Queue Endpoint

**Dynamic Batch Sizing** ([app/api/cron/process-filing-queue/route.ts](app/api/cron/process-filing-queue/route.ts#L225)):
- Discovery jobs: 10 per batch (2-5s each)
- Fetch jobs: 5 per batch (10-30s each)
- Summarize jobs: 1 per batch (17-90s each)

**Job Type Filtering**:
- Query param: `?jobTypes=ASYNC_DISCOVER_FILINGS,ASYNC_FETCH_FILING`
- Validates against allowed types

### Vercel Function Configuration (vercel.json)

```json
{
  "functions": {
    "app/api/cron/tier-aware/route.ts": { "maxDuration": 300, "memory": 1024 },
    "app/api/cron/process-filing-queue/route.ts": { "maxDuration": 300, "memory": 1024 },
    "app/api/cron/final-backup/route.ts": { "maxDuration": 300, "memory": 512 }
  }
}
```

---

## 4. Job Queue System

### Database Schema (prisma/schema.prisma:298-331)

```prisma
model JobQueue {
  id             String    @id @default(uuid())
  jobType        String
  status         String    // PENDING, PROCESSING, COMPLETED, FAILED, RETRYING
  priority       Int       @default(5)
  payload        Json
  retryCount     Int       @default(0)
  maxRetries     Int       @default(3)
  scheduledFor   DateTime  @default(now())
  startedAt      DateTime?
  completedAt    DateTime?
  failedAt       DateTime?
  lastError      String?
  executionTime  Int?

  @@index([status, scheduledFor])
  @@index([jobType, status])
  @@schema("pipeline")
}
```

### Job State Transitions

```
PENDING ─────────────────────────────────────────────────────→ PROCESSING
                                                                     │
    ┌───────────────────────── success ──────────────────────────────┤
    │                                                                │
    ▼                                                                ▼
COMPLETED                                                         FAILED
                                                                     │
                     ┌─── retryCount < maxRetries ───┐               │
                     │                               │               │
                     ▼                               ▼               │
                  RETRYING ──────────────────────→ PROCESSING       │
                     │                                               │
                     └──── retryCount >= maxRetries ─────────────────┘
                                     │
                                     ▼
                              (Dead Letter Queue)
```

### Critical Implementation Details

**Raw SQL for Job Selection** ([lib/job-queue/index.ts:297-319](lib/job-queue/index.ts#L297)):
```sql
SELECT * FROM pipeline."JobQueue"
WHERE "status" IN ('PENDING', 'RETRYING')
  AND "scheduledFor" <= $1
  AND "retryCount" < "maxRetries"  -- Row-level comparison!
ORDER BY "priority" DESC, "scheduledFor" ASC
LIMIT $2
```

> **Critical Bug Fixed**: Original Prisma query used field references that silently failed, blocking 756 jobs for 12+ days.

**Exponential Backoff** ([lib/job-queue/index.ts:474-482](lib/job-queue/index.ts#L474)):
- Retry 1: 1 minute delay
- Retry 2: 2 minutes delay
- Retry 3: 4 minutes delay

### Job Types and Handlers

| Job Type | Handler File | Duration | Description |
|----------|--------------|----------|-------------|
| ASYNC_DISCOVER_FILINGS | [discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) | <5s | RSS check, bulk job creation |
| ASYNC_FETCH_FILING | [fetch-handler.ts](lib/cron/handlers/fetch-handler.ts) | 10-30s | SEC content fetch, caching |
| ASYNC_SUMMARIZE_CACHED | [summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts) | 17-90s | AI summarization, email |

---

## 5. Distributed Lock Management

### Lock Table Schema (prisma/schema.prisma:348-359)

```prisma
model JobLock {
  id          String    @id @default(uuid())
  lockName    String    @unique
  acquiredBy  String
  acquiredAt  DateTime  @default(now())
  expiresAt   DateTime
  released    Boolean   @default(false)

  @@index([lockName, released, expiresAt])
  @@schema("pipeline")
}
```

### Two-Layer Lock Architecture

**1. PostgreSQL Advisory Locks** ([lib/db/distributed-lock.ts:350-363](lib/db/distributed-lock.ts#L350)):
```typescript
SELECT pg_try_advisory_lock($lockHash)
```
- Atomic lock acquisition
- Hash function converts lock name to bigint
- Released via `pg_advisory_unlock()`

**2. JobLock Table**:
- Stores lock metadata for visibility
- Enables cleanup of orphaned locks
- Tracks acquisition and expiration times

### Lock Configuration

| Lock Type | TTL | Acquire Timeout | Auto-Renewal |
|-----------|-----|-----------------|--------------|
| Cron Lock | 45 min | 45s | 50% of TTL |
| Filing Lock | 10 min | 10s | 60% of TTL |
| User Lock | 30 min | 30s | 60% of TTL |
| Cache Lock | 30s | 5s | Disabled |

**Absolute Maximum Hold Time**: 30 minutes ([lib/db/distributed-lock.ts:30](lib/db/distributed-lock.ts#L30))

### Lock Cleanup Methods

1. **Regular Cleanup**: `cleanupExpiredLocks()` - Prisma ORM-based
2. **Atomic Cleanup**: `cleanupExpiredLocksAtomic()` - Raw SQL
3. **Force Cleanup**: `forceCleanupAllLocks()` - Releases ALL locks
4. **Advisory Cleanup**: `emergencyReleaseAllAdvisoryLocks()` - `pg_advisory_unlock_all()`

---

## 6. Health Monitoring

### Pipeline Health Endpoint ([app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts))

**Response Caching** (lines 54-86):
- TTL: 30 seconds
- In-memory storage
- Headers: `X-Cache: HIT/MISS`, `X-Cache-Age`

**Aggregated SQL Query** (lines 329-364):

Replaced 10 individual Prisma queries with single PostgreSQL `FILTER` clause:
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
  COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
  COUNT(*) FILTER (WHERE status = 'COMPLETED' AND completedAt > NOW() - INTERVAL '1 hour') as completedLast1h,
  -- ... etc
FROM pipeline."JobQueue"
```

**Orphan Detection Sampling** (lines 93-123):
- Runs every 6th request (~60 seconds at 10 req/min)
- Expensive query only when sampled
- Uses cached `lastKnownOrphanCount` otherwise

### Health Status Determination (lines 559-584)

**CRITICAL Conditions**:
- Lock health is CRITICAL
- No completions in >180 minutes
- Exhausted retrying jobs (retryCount >= maxRetries)
- Invalid job types (no handler)
- Cron execution gap >20 minutes

**DEGRADED Conditions**:
- Lock health is WARNING
- No completions in >60 minutes
- Stale processing jobs (stuck >15 min)
- Orphaned filings exist
- Cron execution gap 15-20 minutes

### Cron Execution Gap Detection ([lib/cron/execution-gap-detector.ts](lib/cron/execution-gap-detector.ts))

**Configuration**:
- Lookback period: 60 minutes
- Gap threshold: 15 minutes
- Alert cooldown: 30 minutes

**Detection Logic**:
1. Query last 60 minutes of `CronJobExecution` records
2. Detect gaps between consecutive executions >15 min
3. Alert via Slack if gaps found

---

## 7. Auto-Recovery Mechanisms

### Auto-Recover Endpoint ([app/api/cron/auto-recover/route.ts](app/api/cron/auto-recover/route.ts))

**Execution Flow**:

```
Every 15 minutes via Cloudflare Worker
         │
         ▼
┌────────────────────────────┐
│  Phase 1: Authentication   │
│  (HMAC or CRON_SECRET)     │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│  Phase 2: Health Check     │
│  (/api/health/pipeline)    │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│  Phase 3: Immediate Cleanup (runs EVERY execution)        │
│                                                            │
│  1. Mark exhausted RETRYING jobs as FAILED                │
│  2. Mark invalid job types as FAILED                      │
│  3. Reset stale PROCESSING jobs to PENDING (>15 min)      │
│  4. Force cleanup stale locks                              │
│  5. Recover orphaned filings                               │
└────────────┬───────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────┐
│  Phase 4: Cron Gap Check   │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│  Phase 5: Decision Logic                                   │
│                                                            │
│  HEALTHY → Reset state, return                             │
│  Stale locks → Force cleanup, record in state              │
│  CRITICAL (>120min stall) → Wait 10min, then redeploy     │
│  DEGRADED (6 consecutive) → Proactive investigation        │
└────────────────────────────────────────────────────────────┘
```

### Recovery State Persistence

**Database Model** ([lib/cron/recovery-state-service.ts](lib/cron/recovery-state-service.ts)):
```typescript
{
  id: "singleton",
  consecutiveDegraded: number,
  consecutiveCleanups: number,
  consecutiveRedeploys: number,
  lastCleanupTime: DateTime?,
  lastRedeployTime: DateTime?,
  lastHealthyTime: DateTime?
}
```

**Purpose**: Survives Vercel deployments (database-backed, not in-memory)

### Orphaned Filing Recovery ([lib/cron/orphaned-filing-detector.ts](lib/cron/orphaned-filing-detector.ts))

**Detection**: Filings with `processed=false` and no active jobs in queue
**Recovery**: Creates `ASYNC_FETCH_FILING` jobs with priority 5

**Configuration**:
- Age threshold: 10 minutes
- Recovery limit: 50 filings
- Alert cooldown: 30 minutes

---

## 8. Historical Failure Analysis

### Documented Incidents Summary

| Date | Duration | Root Cause | Impact |
|------|----------|------------|--------|
| 2025-12-05 | 6+ days | Silent Step 2 failures | 11,840 PENDING jobs |
| 2025-12-10 | 12+ days | Job selection bug (Prisma) | 756 stuck jobs |
| 2025-12-12 | 5 days | Stale locks blocking | 1,753+ jobs stuck |
| 2025-12-15 | 3 days | Reactive cleanup only | 456 PENDING jobs |
| 2025-12-30 | 4 hours | Cron schedule corruption | Pipeline stall |
| 2026-01-16 | 13 hours | Auth mismatch + DB issues | 926 jobs stuck |
| 2026-01-20 | Ongoing | Connection pool exhaustion | Pipeline stall |
| 2026-01-21 | Recurring | CRON_SECRET trailing `\n` | HMAC failures |

### Failure Pattern Categories

#### 1. Connection Pool Issues (2 incidents)
- **Symptom**: Database queries timeout, health checks fail
- **Root Cause**: Too many parallel queries against pgbouncer's 5-connection limit
- **Fix**: Aggregated SQL queries, response caching, query batching

#### 2. Stale Lock Issues (3 incidents)
- **Symptom**: Locks expired but never cleaned, blocking new acquisitions
- **Root Cause**: Reactive cleanup only runs during acquisition attempts
- **Fix**: Proactive cleanup as Step 0 in pipeline

#### 3. HMAC/Authentication Issues (3+ incidents)
- **Symptom**: 401 errors on cron endpoints
- **Root Cause**: Secret sync issues, trailing `\n` characters
- **Fix**: `printf '%s'` instead of `echo` when piping secrets

#### 4. Job Processing Stalls (4 incidents)
- **Symptom**: Jobs accumulate without processing
- **Root Cause**: Various (Prisma bug, silent failures, exhausted retries)
- **Fix**: Raw SQL queries, error throwing, retry validation

#### 5. Cloudflare Worker Issues (2 incidents)
- **Symptom**: Cron doesn't trigger, errors swallowed
- **Root Cause**: Platform issues, error handling as warnings
- **Fix**: Redeployment, error throwing instead of warning

### Key Lessons Learned

1. **Use raw SQL for row-level comparisons** - Prisma field references silently fail
2. **Proactive cleanup, not reactive** - Scheduled cleanup prevents accumulation
3. **Throw errors, don't swallow them** - Silent failures cause long stalls
4. **Monitor the monitor** - Health endpoints must be reliable
5. **Secret sync is fragile** - Use `printf` not `echo` for secrets

---

## 9. Sync vs Async Operations

### Timeout Budget Management

```
Vercel Function Limit: 300,000ms (5 minutes)
└── Application Timeout: 270,000ms (4.5 minutes)
    ├── SEC EDGAR: 15s per request × ~8 requests = ~120s worst case
    ├── AI Summarization: 270s primary, 120s fallback
    └── Email: Fire-and-forget (isolated errors)
```

### Database Operations

| Operation | Pattern | Pooling | Timeout |
|-----------|---------|---------|---------|
| Job creation | Async | Prisma pool (30) | 30s pool wait |
| Job selection | Raw SQL | Prisma pool | 30s pool wait |
| Lock operations | Transaction | Serializable | 10s transaction |
| Summary storage | Async upsert | Prisma pool | 30s pool wait |

### External Service Operations

| Service | Pattern | Concurrency | Rate Limit |
|---------|---------|-------------|------------|
| SEC EDGAR | Bottleneck limiter | 5 parallel | 10 req/s |
| OpenRouter AI | Bottleneck limiter | 5 parallel | 5 req/s |
| Resend Email | Sequential | 1 | N/A |

### Parallel vs Sequential Processing

**Parallel**:
- RSS feed batching: 5 tickers per batch via `Promise.allSettled()`
- Database queries in health endpoint: `Promise.all()` for independent queries

**Sequential**:
- Batch processing loop: 1s delay between batches
- Job processing: One job at a time within a batch
- AI model fallback: Sequential attempts through fallback chain

---

## 10. Known Bottlenecks and Gaps

### Current Bottlenecks

#### 1. AI Summarization Timeout
- **Location**: [lib/ai/openrouter-client.ts:39](lib/ai/openrouter-client.ts#L39)
- **Description**: 270s primary timeout consumes most of the Vercel function limit
- **Impact**: Only 1 summarize job per batch to avoid timeout

#### 2. Sequential Job Processing
- **Location**: [lib/cron/background-filing-worker.ts:296-299](lib/cron/background-filing-worker.ts#L296)
- **Description**: Jobs processed one at a time within each batch
- **Impact**: Throughput limited by sequential execution

#### 3. SEC Rate Limiting
- **Location**: [lib/sec-edgar/client.ts:72-77](lib/sec-edgar/client.ts#L72)
- **Description**: SEC enforces 10 req/s, worker uses 5 concurrent with 100ms minTime
- **Impact**: Discovery phase limited by SEC API rate

#### 4. Connection Pool Exhaustion Risk
- **Location**: [lib/db/prisma.ts:123-133](lib/db/prisma.ts#L123)
- **Description**: 30 connections, but many parallel queries possible
- **Impact**: Pool exhaustion causes timeout errors

### Infrastructure Gaps Identified

#### 1. Single Point of Failure: Cloudflare Worker
- **Issue**: If CF Worker stops triggering, pipeline stalls
- **Mitigation**: Final backup (Layer 3) every 30 minutes
- **Gap**: 25-minute detection delay before backup kicks in

#### 2. In-Memory State Loss
- **Issue**: Rate limit counters reset on CF Worker redeploy
- **Location**: [cloudflare-cron/index.js:1725](cloudflare-cron/index.js#L1725)
- **Gap**: KV namespaces commented out in wrangler.toml

#### 3. Secret Synchronization
- **Issue**: CRON_SECRET must match exactly between Vercel and CF
- **Location**: Manual sync via `npm run cloudflare:sync-secret`
- **Gap**: No automated sync after Vercel deploys

#### 4. Health Endpoint Reliability
- **Issue**: If health endpoint fails, auto-recovery can't detect problems
- **Location**: [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts)
- **Gap**: No separate health endpoint for the health endpoint

#### 5. Orphan Detection Sampling
- **Issue**: Orphan check only runs every 6th request
- **Location**: [app/api/health/pipeline/route.ts:93-106](app/api/health/pipeline/route.ts#L93)
- **Gap**: Up to 60 seconds before orphans detected

---

## Code References

### Key Files

| Component | File | Lines |
|-----------|------|-------|
| CF Worker Main | [cloudflare-cron/index.js](cloudflare-cron/index.js) | 2,604 |
| CF Worker Config | [cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml) | 57 |
| Tier-Aware Endpoint | [app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts) | ~900 |
| Auto-Recover | [app/api/cron/auto-recover/route.ts](app/api/cron/auto-recover/route.ts) | ~740 |
| Job Queue Service | [lib/job-queue/index.ts](lib/job-queue/index.ts) | ~600 |
| Distributed Lock | [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts) | ~960 |
| Pipeline Health | [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts) | ~740 |
| Discovery Handler | [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) | ~500 |
| Fetch Handler | [lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts) | ~630 |
| Summarize Handler | [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts) | ~560 |

### Historical Documentation

| Document | Path |
|----------|------|
| Pipeline Recovery Runbook | [docs/runbooks/pipeline-stall-recovery.md](docs/runbooks/pipeline-stall-recovery.md) |
| 2025-12-30 Cron Failure | [docs/incidents/2025-12-30-cloudflare-cron-schedule-failure.md](docs/incidents/2025-12-30-cloudflare-cron-schedule-failure.md) |
| 2026-01-16 Pipeline Stall | [docs/incidents/2026-01-16-pipeline-stall-incident.md](docs/incidents/2026-01-16-pipeline-stall-incident.md) |
| Connection Pool Fix | [docs/plans/2026-01-20-fix-pipeline-health-connection-pool-exhaustion.md](docs/plans/2026-01-20-fix-pipeline-health-connection-pool-exhaustion.md) |
| CRON_SECRET Issue | [CLAUDE.md (Known Issues)](CLAUDE.md) |

---

## Appendix: Timeout Configuration Reference

| Component | Timeout | Purpose |
|-----------|---------|---------|
| Vercel Function | 300s | Hard limit |
| Application | 270s | Buffer for cleanup |
| Cleanup buffer | 30s | Grace period |
| SEC request | 15s | Per-document fetch |
| AI primary | 270s | Summarization |
| AI fallback | 120s | Fallback model |
| Lock TTL | 12min | Cron lock |
| Lock acquire | 10s | Acquisition wait |
| Pool timeout | 30s | DB connection |
| Connect timeout | 60s | New connection |
| Idle timeout | 600s | Connection cleanup |

---

*Research completed: 2026-01-25T05:55:44Z*
