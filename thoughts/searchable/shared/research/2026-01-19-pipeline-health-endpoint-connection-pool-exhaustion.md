---
date: 2026-01-19T09:01:28+11:00
researcher: Wilfred Chen
git_commit: 68b66c7afc3b832f987b040e9495f08359af9ec6
branch: main
repository: tldrsec-ai
topic: "/api/health/pipeline Connection Pool Exhaustion"
tags: [research, codebase, database, prisma, connection-pool, pipeline-health, monitoring]
status: complete
last_updated: 2026-01-19
last_updated_by: Wilfred Chen
---

# Research: /api/health/pipeline Connection Pool Exhaustion

**Date**: 2026-01-19T09:01:28+11:00
**Researcher**: Wilfred Chen
**Git Commit**: 68b66c7afc3b832f987b040e9495f08359af9ec6
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

The `/api/health/pipeline` endpoint is experiencing Prisma connection pool exhaustion. The endpoint makes multiple parallel database queries (via Promise.all) but the connection pool only has 5 connections with a 10-second timeout, causing the queries to timeout. Document the current implementation to understand how the endpoint executes queries and how the connection pool is configured.

## Summary

The `/api/health/pipeline` endpoint executes 14 database queries in parallel using `Promise.all`, plus potentially one additional follow-up query for orphaned filing detection. The Prisma connection pool is configured with a **default of 5 connections** and a **10-second timeout** via Supabase's pgbouncer pooler. When Supabase pooler is detected, the code intentionally **skips** adding custom connection pool parameters to avoid authentication errors. For non-Supabase databases, the code auto-adds parameters (`connection_limit=30`, `pool_timeout=30`, etc.) to increase pool capacity.

The parallel query execution pattern combined with the constrained connection pool (5 connections, 10s timeout) creates a bottleneck where queries compete for limited connections. The current configuration prioritizes Supabase compatibility over connection pool sizing.

## Detailed Findings

### /api/health/pipeline Endpoint Implementation

**Location**: [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts)

#### Endpoint Purpose

The endpoint provides comprehensive health monitoring for the SEC filing pipeline by checking:
- Lock health (stale/expired locks)
- Job queue status (pending, processing, completed, dead letter, retrying)
- Processing latency (time since last completion)
- Pipeline throughput (jobs completed per hour)
- Stuck job detection (exhausted retrying, stale processing, invalid types)
- Cron execution gaps (Cloudflare Worker failures)
- Orphaned filings (unprocessed with no jobs)

#### Parallel Query Execution Pattern

**Location**: [app/api/health/pipeline/route.ts:214-294](app/api/health/pipeline/route.ts#L214-L294)

The endpoint executes 14 queries concurrently in a single `Promise.all` block:

```typescript
const [
  pendingCount,
  processingCount,
  completedLast1h,
  completedLast24h,
  deadLetterCount,
  retryingCount,
  lastCompletedJob,
  staleProcessingCount,
  invalidJobTypeCount,
  highRetryCount,
  exhaustedRetryingResult,
  recentCronExecutions,
  unprocessedFilingsOlderThanThreshold,
  unprocessedFilingsTotal
] = await Promise.all([
  // 14 database queries executed in parallel
]);
```

#### Query Inventory

1. **Pending Jobs Count** (line 215-217)
   - Query: `prisma.jobQueue.count({ where: { status: 'PENDING' } })`
   - Table: `pipeline.JobQueue`
   - Purpose: Count jobs waiting to be processed

2. **Processing Jobs Count** (line 218-220)
   - Query: `prisma.jobQueue.count({ where: { status: 'PROCESSING' } })`
   - Table: `pipeline.JobQueue`
   - Purpose: Count jobs currently being processed

3. **Completed Jobs Last Hour** (line 221-226)
   - Query: Count jobs completed since `oneHourAgo` (now - 60 minutes)
   - Table: `pipeline.JobQueue`
   - Purpose: Measure recent throughput

4. **Completed Jobs Last 24 Hours** (line 227-232)
   - Query: Count jobs completed since `oneDayAgo` (now - 24 hours)
   - Table: `pipeline.JobQueue`
   - Purpose: Measure daily throughput

5. **Dead Letter Queue Count** (line 233-235)
   - Query: `prisma.jobQueue.count({ where: { status: 'DEAD_LETTER' } })`
   - Table: `pipeline.JobQueue`
   - Purpose: Count permanently failed jobs

6. **Retrying Jobs Count** (line 236-238)
   - Query: `prisma.jobQueue.count({ where: { status: 'RETRYING' } })`
   - Table: `pipeline.JobQueue`
   - Purpose: Count jobs waiting to retry

7. **Last Completed Job** (line 239-243)
   - Query: `prisma.jobQueue.findFirst()` with `orderBy: { completedAt: 'desc' }`
   - Table: `pipeline.JobQueue`
   - Purpose: Get timestamp of most recent completion

8. **Stale Processing Jobs** (line 245-250)
   - Query: Count `PROCESSING` jobs with `startedAt < (now - 15 minutes)`
   - Table: `pipeline.JobQueue`
   - Purpose: Detect stuck jobs

9. **Invalid Job Types** (line 252-257)
   - Query: Count active jobs with job types not in `VALID_JOB_TYPES` array
   - Table: `pipeline.JobQueue`
   - Purpose: Detect jobs with no handler

10. **High Retry Count Jobs** (line 259-264)
    - Query: Count jobs with `retryCount >= 2`
    - Table: `pipeline.JobQueue`
    - Purpose: Early warning for jobs approaching max retries

11. **Exhausted Retrying Jobs (Raw SQL)** (line 267-272)
    - Query: Raw SQL comparing `retryCount >= maxRetries` (column-to-column comparison)
    - Table: `pipeline.JobQueue`
    - Purpose: Detect RETRYING jobs stuck forever (CRITICAL condition)
    - **Why Raw SQL**: Prisma cannot compare two columns in WHERE clause

12. **Recent Cron Executions** (line 274-280)
    - Query: `prisma.cronJobExecution.findMany()` for last hour
    - Table: `pipeline.CronJobExecution`
    - Purpose: Detect cron execution gaps (Cloudflare Worker failures)

13. **Unprocessed Filings Older Than Threshold** (line 282-289)
    - Query: `prisma.rssFilingCheck.findMany()` where `processed=false` and `createdAt < (now - 10 minutes)`
    - Table: `app.RssFilingCheck`
    - Limit: 100 records (`take: 100`)
    - Purpose: Find potential orphaned filings
    - **Note**: Fixed 2026-01-19 - was incorrectly querying `SecFiling` which has no `processed` field

14. **Total Unprocessed Filings** (line 291-293)
    - Query: `prisma.rssFilingCheck.count({ where: { processed: false } })`
    - Table: `app.RssFilingCheck`
    - Purpose: Count all unprocessed filings
    - **Note**: Fixed 2026-01-19 - was incorrectly querying `SecFiling` which has no `processed` field

#### Additional Follow-Up Query

**Location**: [app/api/health/pipeline/route.ts:337-345](app/api/health/pipeline/route.ts#L337-L345)

After the main Promise.all completes, if potential orphaned filings are found, the endpoint executes a 15th query:

```typescript
const jobsForFilings = await prisma.jobQueue.findMany({
  where: {
    status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] },
    OR: potentialOrphanIds.map(id => ({
      payload: { path: ['filingId'], equals: id },
    })),
  },
  select: { payload: true },
});
```

- **Purpose**: Identify which old unprocessed filings have active jobs queued
- **Pattern**: Uses Prisma JSON path syntax to check `payload.filingId`
- **Execution**: Only runs if `unprocessedFilingsOlderThanThreshold.length > 0` (line 333)

### Connection Pool Configuration

#### Prisma Client Initialization

**Location**: [lib/db/prisma.ts:98-162](lib/db/prisma.ts#L98-L162)

The `getPrismaClient()` function handles Prisma client initialization with connection pool auto-configuration:

```typescript
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    if (process.env.NODE_ENV === 'production') {
      // Check if using Supabase pooler (pgbouncer)
      const isSupabasePooler = process.env.DATABASE_URL?.includes('pooler.supabase.com') &&
                                process.env.DATABASE_URL?.includes('pgbouncer=true');

      // Only add connection pool params for non-Supabase connections
      const connectionUrl = isSupabasePooler
        ? process.env.DATABASE_URL  // Use as-is for Supabase
        : (process.env.DATABASE_URL?.includes('connection_limit')
            ? process.env.DATABASE_URL
            : `${process.env.DATABASE_URL}...connection_limit=30&pool_timeout=30&connect_timeout=60&idle_timeout=600&max_uses=7500`);

      prisma = new PrismaClient({
        log: ['error', 'warn'],
        datasources: { db: { url: connectionUrl } }
      })
    }
  }
  return prisma;
}
```

#### Supabase Pooler Detection

**Location**: [lib/db/prisma.ts:124-125](lib/db/prisma.ts#L124-L125)

The code detects Supabase pooler URLs by checking for two conditions:
1. URL contains `pooler.supabase.com`
2. URL contains `pgbouncer=true` parameter

When Supabase pooler is detected, the code **intentionally skips** adding custom connection pool parameters because:
- Supabase's pgbouncer handles connection pooling
- Extra parameters can cause authentication errors: `"FATAL: Tenant or user not found"`

#### Supabase Connection Configuration

**Reference**: [.env.example:17-24](.env.example#L17-L24)

```bash
# Database Configuration (Supabase)
# Transaction mode (port 6543) - Use for all Prisma queries
# Format: postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DATABASE_URL=postgres://postgres.your-project-ref:your-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Session mode (port 5432) - Used for Prisma migrations only
# Format: postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
DIRECT_URL=postgres://postgres.your-project-ref:your-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

**Key Characteristics**:
- Uses port **6543** for transaction mode (pooled queries)
- Uses port **5432** for session mode (direct migrations)
- Includes `pgbouncer=true` parameter
- No additional connection pool parameters (pgbouncer manages the pool)

#### Default Prisma Connection Pool Settings

**Source**: [lib/db/connection-manager.ts:97-99](lib/db/connection-manager.ts#L97-L99)

When no custom parameters are provided, Prisma uses these defaults:

```typescript
// Connection pool parameters
poolSize: params.connection_limit || '21', // Default is 21
poolTimeout: params.pool_timeout || '10',  // Default is 10 seconds
connectionTimeout: params.connection_timeout || '10000' // Default is 10000ms
```

#### Supabase pgbouncer Pool Settings

**Note**: Supabase's pgbouncer pooler has its own connection limits that are NOT controlled by the `DATABASE_URL` parameters. The actual pool size is determined by:
1. **Supabase Plan Tier**: Different plans have different connection limits
2. **pgbouncer Configuration**: Managed by Supabase (not exposed to users)
3. **Transaction vs Session Mode**: Port 6543 (transaction mode) has stricter pooling

**Observed Behavior**: The error message indicates the pool has only **5 connections** with a **10-second timeout**:

```
PrismaClientKnownRequestError:
Timed out fetching a new connection from the connection pool.
Current connection pool timeout: 10, connection limit: 5
```

This suggests:
- `connection_limit=5` (likely Supabase free/starter tier)
- `pool_timeout=10` (default timeout)

#### Non-Supabase Connection Pool Parameters

**Location**: [lib/db/prisma.ts:133](lib/db/prisma.ts#L133)

For non-Supabase databases (Neon, direct PostgreSQL), the code auto-adds these parameters:

```typescript
connection_limit=30      // 30 concurrent connections (vs default 21)
pool_timeout=30          // 30 second timeout (vs default 10s)
connect_timeout=60       // 60 second connection establishment timeout
idle_timeout=600         // Close idle connections after 10 minutes
max_uses=7500           // Recycle connections after 7500 uses
```

### Connection Pool Exhaustion Analysis

#### Current Bottleneck

**Queries**: 14 parallel queries + 1 conditional follow-up query
**Connection Pool**: 5 connections maximum
**Timeout**: 10 seconds

**Problem**:
1. Endpoint fires 14 queries simultaneously via `Promise.all`
2. Only 5 connections available in pool
3. First 5 queries acquire connections immediately
4. Remaining 9 queries wait in pool queue
5. If first 5 queries take >10 seconds total, waiting queries timeout
6. Error: `"Timed out fetching a new connection from the connection pool"`

#### Query Competition Pattern

```
Time 0s:  Queries 1-5  → Acquire 5 connections (pool full)
          Queries 6-14 → Wait in pool queue
Time 3s:  Query 1      → Completes, releases connection
          Query 6      → Acquires released connection
Time 5s:  Query 2      → Completes, releases connection
          Query 7      → Acquires released connection
Time 10s: Queries 8-14 → TIMEOUT (waited 10 seconds)
```

#### Tables Affected by Parallel Queries

- `pipeline.JobQueue` - 11 queries (most contention)
- `pipeline.CronJobExecution` - 1 query
- `pipeline.SecFiling` - 2 queries + 1 conditional follow-up

### Connection Pool Configuration Patterns

#### Pattern 1: Supabase Detection and Skip

**Location**: [lib/db/prisma.ts:124-133](lib/db/prisma.ts#L124-L133)

```typescript
const isSupabasePooler = process.env.DATABASE_URL?.includes('pooler.supabase.com') &&
                          process.env.DATABASE_URL?.includes('pgbouncer=true');

const connectionUrl = isSupabasePooler
  ? process.env.DATABASE_URL  // Use as-is, don't add parameters
  : `${process.env.DATABASE_URL}...`; // Add parameters for non-Supabase
```

**Reason**: Supabase pgbouncer handles pooling; extra parameters cause auth errors

#### Pattern 2: Connection URL Builder

**Location**: [lib/db/connection-manager.ts:113-127](lib/db/connection-manager.ts#L113-L127)

```typescript
export function buildOptimizedConnectionUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('connection_limit', '30');
  url.searchParams.set('pool_timeout', '30');
  url.searchParams.set('connection_timeout', '20000');
  return url.toString();
}
```

**Purpose**: Programmatically build optimized connection URLs

#### Pattern 3: Connection Pool Monitoring

**Location**: [lib/db/connection-manager.ts:32-50](lib/db/connection-manager.ts#L32-L50)

```typescript
export async function getConnectionPoolStats(): Promise<Record<string, unknown>> {
  const stats = await prisma.$queryRaw`
    SELECT
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active_connections,
      count(*) FILTER (WHERE state = 'idle') as idle_connections,
      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
    FROM pg_stat_activity
    WHERE datname = current_database()
  `;
  return stats[0];
}
```

**Purpose**: Query PostgreSQL's `pg_stat_activity` to monitor connection pool usage

#### Pattern 4: Connection Recommendation

**Location**: [lib/db/connection-manager.ts:134-147](lib/db/connection-manager.ts#L134-L147)

```typescript
export function getConnectionRecommendation(): string {
  return `
To fix database connection pool timeout errors, update your DATABASE_URL in .env with these parameters:

1. Add ?connection_limit=30 to increase max connections (default is 21)
2. Add &pool_timeout=30 to increase timeout (default is 10 seconds)
3. Add &connection_timeout=20000 to increase connection timeout (default is 10000ms)

Example:
DATABASE_URL=postgresql://user:password@host:port/database?connection_limit=30&pool_timeout=30&connection_timeout=20000
`;
}
```

**Purpose**: User-friendly error message with configuration instructions

### Prisma Schema Configuration

**Location**: [prisma/schema.prisma:8-13](prisma/schema.prisma#L8-L13)

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["app", "pipeline"]
}
```

**Key Aspects**:
- `url` - Pooled connection (port 6543 for Supabase)
- `directUrl` - Direct connection for migrations (port 5432 for Supabase)
- `schemas` - Multi-schema setup (`app` and `pipeline`)

### Health Status Determination

**Location**: [app/api/health/pipeline/route.ts:439-464](app/api/health/pipeline/route.ts#L439-L464)

The endpoint determines overall health status based on query results:

#### CRITICAL Status Triggers
- Lock health is CRITICAL
- No completions for >180 minutes
- Exhausted retrying jobs > 0 (jobs stuck forever)
- Invalid job types > 0 (jobs that can never complete)
- Cron gap >20 minutes (Cloudflare Worker likely failed)

#### DEGRADED Status Triggers
- Lock health is WARNING
- Any issues detected
- No completions for >60 minutes
- Stale processing jobs > 0 (jobs might be hung)
- Orphaned filings > 0
- Cron gap >15 minutes

#### HEALTHY Status
- All systems operating normally
- No issues detected

### Rate Limiting

**Location**: [app/api/health/pipeline/route.ts:124-154](app/api/health/pipeline/route.ts#L124-L154)

The endpoint implements rate limiting to prevent abuse:

```typescript
const { rateLimiter } = await import('../../../../lib/security/rate-limiter');
const rateLimitResult = await rateLimiter.checkLimit('health-endpoint', clientIP);

if (!rateLimitResult || !rateLimitResult.allowed) {
  return NextResponse.json({
    status: 'ERROR',
    error: 'Rate limit exceeded. Please try again later.',
    timestamp: new Date().toISOString()
  }, {
    status: 429,
    headers: {
      'Retry-After': '60',
      'X-RateLimit-Remaining': '0'
    }
  });
}
```

**Purpose**: Prevent expensive parallel database queries from being triggered too frequently

## Code References

### Primary Files

- [app/api/health/pipeline/route.ts](app/api/health/pipeline/route.ts) - Health monitoring endpoint
- [lib/db/prisma.ts](lib/db/prisma.ts) - Prisma client initialization
- [lib/db/connection-manager.ts](lib/db/connection-manager.ts) - Connection pool utilities
- [prisma/schema.prisma](prisma/schema.prisma) - Database schema definition

### Supporting Files

- [lib/db/connection.ts](lib/db/connection.ts) - Compatibility layer
- [lib/db/connection-warmer.ts](lib/db/connection-warmer.ts) - Periodic connection warming
- [lib/db/retry-wrapper.ts](lib/db/retry-wrapper.ts) - Database retry logic
- [.env.example](.env.example) - Environment configuration reference
- [database-optimization.env](database-optimization.env) - Connection parameter reference
- [PRODUCTION-OPTIMIZATION.md](PRODUCTION-OPTIMIZATION.md) - Production deployment guide

### Key Line References

- `app/api/health/pipeline/route.ts:214-294` - Promise.all with 14 parallel queries
- `app/api/health/pipeline/route.ts:337-345` - Conditional orphaned filing follow-up query
- `lib/db/prisma.ts:124-125` - Supabase pooler detection logic
- `lib/db/prisma.ts:133` - Auto-added connection pool parameters for non-Supabase
- `prisma/schema.prisma:8-13` - Datasource configuration with dual URLs

## Architecture Documentation

### Database Schema Architecture

The application uses a **dual-schema PostgreSQL database** hosted on Supabase:

1. **app schema** - Core application data (users, tickers, summaries, SEC filings)
2. **pipeline schema** - Pipeline infrastructure (job queues, locks, cron executions)

This separation allows different retention policies and access patterns for application data vs operational infrastructure.

### Connection Pool Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Application                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Prisma Client (Singleton Pattern)             │  │
│  │  - Development: global.prisma (hot reload safe)      │  │
│  │  - Production: Single instance per function          │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      getPrismaClient() Auto-Configuration            │  │
│  │  - Detects Supabase pooler (pooler.supabase.com)    │  │
│  │  - Skips parameters if Supabase detected            │  │
│  │  - Adds parameters for non-Supabase databases       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase pgbouncer Pooler                       │
│  - Transaction Mode (port 6543): Pooled queries             │
│  - Session Mode (port 5432): Direct migrations              │
│  - Pool Size: ~5 connections (free/starter tier)            │
│  - Pool Timeout: 10 seconds (default)                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                         │
│  - Dual schema: app + pipeline                              │
│  - Connection limit managed by Supabase tier                │
└─────────────────────────────────────────────────────────────┘
```

### Query Execution Flow

```
/api/health/pipeline GET request
    │
    ├─> Rate limiter check (prevent abuse)
    │
    ├─> getPrismaClient() (singleton)
    │
    ├─> Promise.all([
    │       Query 1:  JobQueue.count (PENDING)
    │       Query 2:  JobQueue.count (PROCESSING)
    │       Query 3:  JobQueue.count (COMPLETED, last 1h)
    │       Query 4:  JobQueue.count (COMPLETED, last 24h)
    │       Query 5:  JobQueue.count (DEAD_LETTER)
    │       Query 6:  JobQueue.count (RETRYING)
    │       Query 7:  JobQueue.findFirst (last completed)
    │       Query 8:  JobQueue.count (stale processing)
    │       Query 9:  JobQueue.count (invalid types)
    │       Query 10: JobQueue.count (high retry count)
    │       Query 11: JobQueue.$queryRaw (exhausted retrying)
    │       Query 12: CronJobExecution.findMany (recent)
    │       Query 13: SecFiling.findMany (unprocessed old)
    │       Query 14: SecFiling.count (unprocessed total)
    │   ]) → All 14 queries compete for 5 connections
    │
    ├─> IF unprocessed filings found:
    │       Query 15: JobQueue.findMany (check for orphans)
    │
    ├─> Calculate health metrics
    │       - Cron execution gaps
    │       - Orphaned filing count
    │       - Time since last completion
    │
    ├─> Determine health status (HEALTHY/DEGRADED/CRITICAL)
    │
    └─> Return JSON response with status + metrics
```

### Connection Pool Exhaustion Flow

```
Time 0s:
┌──────────────────────────────────────────────────────┐
│ Connection Pool (5 connections available)            │
├──────────────────────────────────────────────────────┤
│ [1] Query 1  - Executes immediately                  │
│ [2] Query 2  - Executes immediately                  │
│ [3] Query 3  - Executes immediately                  │
│ [4] Query 4  - Executes immediately                  │
│ [5] Query 5  - Executes immediately                  │
├──────────────────────────────────────────────────────┤
│ Queue: Query 6, 7, 8, 9, 10, 11, 12, 13, 14         │
│        ↓ Waiting for connection                      │
└──────────────────────────────────────────────────────┘

Time 3s (Query 1 completes):
┌──────────────────────────────────────────────────────┐
│ [1] Query 6  - Acquires freed connection             │
│ [2] Query 2  - Still executing                       │
│ [3] Query 3  - Still executing                       │
│ [4] Query 4  - Still executing                       │
│ [5] Query 5  - Still executing                       │
├──────────────────────────────────────────────────────┤
│ Queue: Query 7, 8, 9, 10, 11, 12, 13, 14            │
│        ↓ 7 seconds elapsed                           │
└──────────────────────────────────────────────────────┘

Time 10s (Timeout reached):
┌──────────────────────────────────────────────────────┐
│ [X] Queries 8-14: TIMEOUT                            │
│     Error: "Timed out fetching a new connection"     │
│     Reason: Waited 10 seconds in pool queue          │
└──────────────────────────────────────────────────────┘
```

## Historical Context (from thoughts/)

### Related Research Documents

- [thoughts/shared/research/2026-01-09-cron-pipeline-stalls-auto-recovery.md](thoughts/shared/research/2026-01-09-cron-pipeline-stalls-auto-recovery.md) - Comprehensive documentation of cron pipeline stalls and auto-recovery infrastructure
- [thoughts/shared/research/2026-01-05-database-connection-pipeline-uptime.md](thoughts/shared/research/2026-01-05-database-connection-pipeline-uptime.md) - Database connection handling, connection pool optimization, and timeout handling
- [thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md](thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md) - Infrastructure documentation for >99.99% uptime including health check endpoints
- [thoughts/shared/research/2025-12-22-cron-job-database-schema-mismatch.md](thoughts/shared/research/2025-12-22-cron-job-database-schema-mismatch.md) - Database schema mismatch issues after Supabase migration
- [thoughts/shared/research/2025-12-08-neon-to-supabase-migration-research.md](thoughts/shared/research/2025-12-08-neon-to-supabase-migration-research.md) - Neon to Supabase migration with connection pool considerations

### Key Historical Insights

1. **Supabase Migration**: The codebase migrated from Neon to Supabase, introducing pgbouncer pooler
2. **Connection Pool Auto-Configuration**: Code was updated to detect Supabase and skip adding custom parameters to avoid auth errors
3. **Pipeline Health Monitoring**: The `/api/health/pipeline` endpoint was enhanced with Phase 5 monitoring (cron gaps, orphaned filings)
4. **Auto-Recovery Infrastructure**: Three-layer recovery system with Cloudflare Worker, auto-recovery endpoint, and background recovery

## Related Research

- [2026-01-09: Cron Pipeline Stalls and Auto-Recovery](thoughts/shared/research/2026-01-09-cron-pipeline-stalls-auto-recovery.md)
- [2026-01-05: Database Connection and Pipeline Uptime](thoughts/shared/research/2026-01-05-database-connection-pipeline-uptime.md)
- [2026-01-01: Infrastructure Uptime and Resilience](thoughts/shared/research/2026-01-01-infrastructure-uptime-resilience.md)
- [2025-12-17: Slack Pipeline Monitoring Bot Data Sources](thoughts/shared/research/2025-12-17-slack-pipeline-monitoring-bot-data-sources.md)

## Incident: 2026-01-19 Zombie Connection Pool Exhaustion

### Timeline

- **07:05 UTC**: First zombie connection stuck in "idle in transaction" state
- **08:46 UTC**: Investigation started - pipeline health endpoint returning 500 errors
- **08:47 UTC**: Identified 16 zombie connections (oldest: 1h41m idle)
- **08:47 UTC**: Terminated all 16 stale connections via `pg_terminate_backend()`
- **08:53 UTC**: Fixed bug in health endpoint (SecFiling → RssFilingCheck)
- **08:57 UTC**: Jobs started completing again
- **09:01 UTC**: Pipeline status restored to HEALTHY

### Root Cause

**16 database connections** stuck in "idle in transaction" state completely exhausted the 5-connection pool, preventing ALL database operations including the health check endpoint.

```sql
SELECT state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;
-- Result at 08:46 UTC:
-- idle_in_transaction: 16 (stale >5 minutes: 16)
-- idle: 7
-- active: 1
-- total: 26 (exceeding 5-connection pool)
```

### Additional Bug Discovered

The health endpoint queries 13 and 14 were querying `SecFiling.processed` field, but the `processed` field exists on `RssFilingCheck`, not `SecFiling`. This caused a `PrismaClientValidationError`:

```
Unknown argument `processed`. Available options are marked with ?.
```

**Fix Applied**: Changed `prisma.secFiling.findMany()` to `prisma.rssFilingCheck.findMany()` in `app/api/health/pipeline/route.ts:282-293`.

### Recovery Actions

1. **Terminate zombie connections**:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
     AND now() - state_change > interval '5 minutes';
   ```

2. **Clean up invalid job types** (18 legacy `ASYNC_SUMMARIZE_FILING` jobs → DEAD_LETTER)

3. **Reset stuck processing job** (1 job stuck for 25+ hours → PENDING)

4. **Deploy health endpoint fix** (`vercel --prod`)

### Prevention Recommendations

1. **Idle Transaction Timeout**: Configure PostgreSQL `idle_in_transaction_session_timeout` to auto-terminate stuck transactions
2. **Connection Monitoring**: Add periodic check for zombie connections in auto-recovery endpoint
3. **Alert on High Idle Transactions**: Slack alert when idle_in_transaction count exceeds threshold

## Open Questions

None. The current implementation is fully documented. The connection pool exhaustion is a design constraint from Supabase's pooler configuration (5 connections, 10s timeout) combined with the parallel query pattern (14 queries in Promise.all).
