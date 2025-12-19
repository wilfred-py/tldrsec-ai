---
date: 2025-12-08T00:00:00-08:00
researcher: Claude
git_commit: 58fb9f69985fdb4b042f6fc8d8432ebef4221868
branch: main
repository: tldrsec-ai
topic: "Neon PostgreSQL to Supabase Migration Research"
tags: [research, database, migration, neon, supabase, prisma, postgresql]
status: complete
last_updated: 2025-12-09
last_updated_by: Claude
last_updated_note: "Added user clarifications on tables to migrate, pooler decision, and Supabase features"
---

# Research: Neon PostgreSQL to Supabase Migration

**Date**: 2025-12-08
**Researcher**: Claude
**Git Commit**: 58fb9f69985fdb4b042f6fc8d8432ebef4221868
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

What needs to be understood about the current Neon PostgreSQL database configuration to migrate to Supabase?

## Summary

The codebase uses **Neon PostgreSQL** as the database provider with **Prisma ORM** for database access. The database connection is managed through a `DATABASE_URL` environment variable. The schema contains **30+ tables** with comprehensive indexes, enums, and relationships. The codebase has extensive database utilities including connection pooling, retry logic, distributed locking, circuit breakers, and transaction management.

### Key Migration Considerations

1. **Connection String Format**: Currently uses standard PostgreSQL URL format compatible with Supabase
2. **Prisma ORM**: Fully compatible with Supabase PostgreSQL
3. **PostgreSQL-specific Features**: Uses `pg_advisory_lock`, `pg_stat_activity`, and `JSONB` types
4. **17 Migrations**: Schema has evolved through 17 Prisma migrations
5. **Connection Pooling**: Custom connection pool optimization may need adjustment for Supabase's pooler

## Detailed Findings

### Current Database Configuration

#### Prisma Schema ([prisma/schema.prisma](prisma/schema.prisma))

```prisma
generator client {
  provider      = "prisma-client-js"
  output        = "../node_modules/.prisma/client"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- **Provider**: PostgreSQL
- **Binary Targets**: `native` and `rhel-openssl-3.0.x` (for Vercel deployment)
- **URL Source**: `DATABASE_URL` environment variable

#### Connection URL Parameters (Currently Optimized for Neon)

The codebase appends these parameters to DATABASE_URL in production ([lib/db/prisma.ts:96-98](lib/db/prisma.ts#L96-L98)):

```
connection_limit=30
pool_timeout=30
connect_timeout=60
idle_timeout=600
max_uses=7500
```

### Database Schema Overview

#### Tables (30+ Total)

**Core Business Tables:**
- `User` - User accounts with subscription/budget tracking
- `Ticker` - Companies tracked by users
- `Summary` - AI-generated SEC filing summaries
- `SecFiling` - SEC filing records
- `CikMapping` - Ticker to CIK mappings

**Job & Queue Tables:**
- `JobQueue` - Background job processing
- `JobProgress` - Job progress tracking
- `JobLock` - Distributed locking

**Monitoring Tables:**
- `CronJobExecution` - Cron execution tracking
- `CronJobMetrics` - Execution metrics
- `CronJobAlert` - Alert management
- `CronJobPerformance` - Performance time-series
- `PipelineHealthHistory` - Pipeline health
- `ErrorAlert` - Error alerting
- `MonitoringThreshold` - Alert thresholds

**Subscription & Usage Tables:**
- `UserSubscription` - Stripe subscription data
- `FilingUsage` - Processing usage tracking
- `UsagePeriod` - Usage period management
- `TierProcessingMetrics` - Tier-level metrics

**Cache & Audit Tables:**
- `SecCompanyCache` - SEC company data cache
- `FilingContentCache` - Filing content cache
- `AuditLog` - Security audit logs
- `CacheInvalidation` - Cache invalidation records

#### Enums Defined in Schema

```prisma
enum SubscriptionTier { FREE, PROFESSIONAL, ENTERPRISE, INSTITUTION, HOBBY, PRO }
enum PlanType { BASIC, PROFESSIONAL, PREMIUM }
enum CronJobStatus { STARTED, SUCCESS, FAILED, TIMEOUT, CANCELLED }
enum CronAlertType { EXECUTION_FAILED, HIGH_ERROR_RATE, COST_THRESHOLD_EXCEEDED, ... }
enum AlertSeverity { LOW, MEDIUM, HIGH, CRITICAL }
enum ExecutionStatus { RUNNING, COMPLETED, FAILED, SKIPPED }
```

### PostgreSQL-Specific Features Used

#### Advisory Locks ([lib/db/distributed-lock.ts](lib/db/distributed-lock.ts))

Uses PostgreSQL advisory locks for distributed locking:

```sql
SELECT pg_try_advisory_lock(lockHash)
SELECT pg_advisory_unlock(lockHash)
SELECT pg_advisory_unlock_all()
```

These are PostgreSQL-specific but **Supabase fully supports advisory locks**.

#### Connection Statistics ([lib/db/connection-manager.ts:35-43](lib/db/connection-manager.ts#L35-L43))

Queries `pg_stat_activity` for monitoring:

```sql
SELECT
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active_connections,
  count(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity
WHERE datname = current_database()
```

**Supabase supports this** as it runs standard PostgreSQL.

#### JSONB Fields

Multiple tables use `JSONB` columns:
- `User.preferences`
- `Summary.summaryJSON`, `Summary.metadata`
- `JobQueue.payload`, `JobQueue.result`, `JobQueue.tokenUsage`
- `CronJobExecution.*` various metrics fields
- `AuditLog.details`

**Supabase fully supports JSONB**.

### Database Utility Files

| File | Purpose |
|------|---------|
| [lib/db/prisma.ts](lib/db/prisma.ts) | Singleton Prisma client with connection pooling |
| [lib/db/connection-manager.ts](lib/db/connection-manager.ts) | Connection health & optimization |
| [lib/db/retry-wrapper.ts](lib/db/retry-wrapper.ts) | Exponential backoff retry logic |
| [lib/db/circuit-breaker.ts](lib/db/circuit-breaker.ts) | Circuit breaker for cascading failures |
| [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts) | PostgreSQL advisory lock management |
| [lib/db/transaction-manager.ts](lib/db/transaction-manager.ts) | Transaction handling with retry |
| [lib/db/concurrency.ts](lib/db/concurrency.ts) | Optimistic locking patterns |
| [lib/db/budget-operations.ts](lib/db/budget-operations.ts) | Atomic budget updates |
| [lib/db/async-audit.ts](lib/db/async-audit.ts) | Async audit logging queue |
| [lib/db/monitoring.ts](lib/db/monitoring.ts) | Database health monitoring |
| [lib/db/secure-prisma.ts](lib/db/secure-prisma.ts) | Security wrappers for queries |

### Environment Variable Configuration

Files that reference DATABASE_URL:

| File | Purpose |
|------|---------|
| `.env.example` | Template with placeholder |
| `.env.enhanced.example` | Enhanced test config |
| `.env.tier-aware-example` | Tier-aware cron config |
| `.env.test` | Test environment mock |
| `prisma/schema.prisma` | Prisma datasource |
| `lib/db/prisma.ts` | Runtime connection |
| `lib/config/env-validation.ts` | Environment validation |
| `.github/workflows/*.yml` | CI/CD workflows |

### Migration History (17 Migrations)

1. `20250515100608_init` - Initial schema (User, Ticker, Summary)
2. `20250516030012_add_cik_mapping` - CIK mapping system
3. `20250529015759_add_onboarding_tracking` - Onboarding & job queue
4. `20250601092559_add_sec_company_cache` - SEC company cache
5. `20250602091658_add_url_to_summary` - Summary URL field
6. `20250602093318_add_sec_filing_model` - SecFiling model
7. `20240601000000_add_sec_fetch_monitoring` - Fetch monitoring
8. `20240602000000_add_xml_monitoring_fields` - XML monitoring
9. `20250627223833_add_xml_monitoring_fields` - Schema refactor
10. `20250720013210_update_sec_models` - SEC models cleanup
11. `20241021000000_add_monitoring_infrastructure` - Monitoring system
12. `20250530000000_add_subscription_models` - Subscriptions
13. `20250813_admin_monitoring_fixes` - Status enum fixes
14. `20250719_create_tables.sql` - Table recreation
15. `add-cron-monitoring.sql` - Cron monitoring
16. `add_monitoring_optimization_indices.sql` - Performance indexes
17. `security_audit_logs.sql` - Audit integrity

### Files Importing Database Client

**API Routes**: 18 active, 13 disabled, 4 monitoring routes

**Core Services**:
- 17 files in `/lib/db/`
- 13 files in `/lib/cron/`
- 5 files in `/lib/email/`
- 6 files in `/lib/job-queue/`
- 10 files in `/lib/monitoring/`
- 12 files in `/lib/sec-edgar/`

**Service Layer**: 15+ files in `/services/`

**Tests**: 80+ test files with database mocks

## Code References

- [prisma/schema.prisma](prisma/schema.prisma) - Full database schema definition
- [lib/db/prisma.ts](lib/db/prisma.ts) - Main Prisma client initialization
- [lib/db/connection-manager.ts](lib/db/connection-manager.ts) - Connection utilities
- [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts) - Advisory lock implementation
- [lib/db/retry-wrapper.ts](lib/db/retry-wrapper.ts) - Retry logic with backoff
- [lib/config/env-validation.ts](lib/config/env-validation.ts) - DATABASE_URL validation
- [prisma/migrations/](prisma/migrations/) - All migration files

## Architecture Documentation

### Current Database Access Pattern

```
┌─────────────────┐
│   API Routes    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  lib/db/index   │──── Re-exports prisma & getPrismaClient
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ lib/db/prisma   │──── Singleton with connection optimization
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Prisma Client   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Neon PostgreSQL │
└─────────────────┘
```

### Connection Pool Architecture

- **Development**: Global singleton to prevent hot-reload exhaustion
- **Production**: Optimized with 30 connections, 30s pool timeout
- **Build Time**: Proxy stub to allow static generation without DB

### Resilience Patterns

1. **Retry Wrapper**: 3 attempts for queries, 2 for mutations
2. **Circuit Breaker**: Per-resource breakers (budget, ticker, subscription)
3. **Distributed Locking**: PostgreSQL advisory locks with auto-renewal
4. **Transaction Manager**: Isolation levels with conflict retry

## Migration Path to Supabase

### What Stays the Same

1. **Prisma ORM** - Works identically with Supabase PostgreSQL
2. **Schema** - 100% compatible, no changes needed
3. **PostgreSQL features** - Advisory locks, JSONB, pg_stat_activity all work
4. **Application code** - No changes required to database utilities

### What Changes

1. **Connection String** - Replace Neon URL with Supabase URL
2. **Connection Pooling** - May use Supabase's built-in PgBouncer
3. **Connection Parameters** - May need adjustment for Supabase pooler

### Supabase Connection Options

Supabase provides three connection methods:
- **Direct connection**: `postgresql://...@db.xxx.supabase.co:5432/postgres`
- **Connection pooler (Transaction)**: `postgresql://...@xxx.supabase.co:6543/postgres`
- **Connection pooler (Session)**: `postgresql://...@xxx.supabase.co:5432/postgres`

For serverless (Vercel), transaction pooling is recommended.

### Migration Steps Overview

1. Create Supabase project
2. Get connection string from Supabase dashboard
3. Run `npx prisma migrate deploy` against Supabase
4. Update `DATABASE_URL` in Vercel environment
5. Verify connection pool settings work with Supabase
6. Test all database operations
7. Migrate existing data from Neon (if needed)

## Open Questions (Resolved)

### 1. Data Migration - RESOLVED

**Question**: Is there existing data in Neon that needs to be migrated, or is this a fresh start?

**Answer**: Yes, migrate 11 essential tables (+ 2 maybe):

**Definitely Migrate (11 tables):**
| Table | Purpose |
|-------|---------|
| `User` | Core user accounts |
| `Ticker` | User-tracked companies |
| `Summary` | AI-generated filing summaries |
| `DailyPipelineVerification` | Pipeline health for Slack bot ([docs/plans/2025-11-30-slack-monitoring-bot.md](docs/plans/2025-11-30-slack-monitoring-bot.md)) |
| `DailyWaitlistCache` | Waitlist counter display |
| `JobQueue` | Background job processing |
| `JobLock` | Distributed locking |
| `RssFilingCheck` | RSS filing tracking |
| `TickerMonitoring` | Active ticker monitoring |

**Maybe Migrate (2 tables - evaluate usefulness):**
| Table | Concern |
|-------|---------|
| `CikMapping` | Evaluate if still actively used |
| `FilingContentCache` | Evaluate usage patterns |

**Skip (17+ tables):**
- `CronJobExecution`, `CronJobMetrics`, `CronJobAlert`, `CronJobPerformance`, `CronJobDailySummary` - Not actively used for debugging (wrangler CLI and test scripts used instead)
- `TierProcessingMetrics`, `TierProcessingExecution`, `CronExecutionContext` - Tier tracking not essential
- `SecFiling`, `SecFetchAttempt`, `SecCompanyCache` - SEC-specific, may be redundant
- `UserSubscription`, `FilingUsage`, `UsagePeriod` - Subscription/Stripe tracking
- `NotificationSent`, `SummaryCacheAccess`, `SummaryEmailDelivery` - Notification tracking
- `AuditLog`, `CacheInvalidation`, `ErrorAlert`, `MonitoringThreshold`, `PipelineHealthHistory` - Monitoring/audit
- `TickerChange`, `JobProgress` - Historical tracking

### 2. Connection Pooling - RESOLVED

**Question**: Which Supabase connection method is preferred for this workload?

**Answer**: Need to evaluate based on advisory lock usage.

**Critical Consideration**: The codebase uses PostgreSQL advisory locks in [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts):
```sql
SELECT pg_try_advisory_lock(lockHash)
SELECT pg_advisory_unlock(lockHash)
```

**Supabase Pooler Options:**

| Mode | Port | Advisory Locks? | Best For |
|------|------|-----------------|----------|
| **Transaction** | 6543 | NO - each query may use different backend | General API routes |
| **Session** | 5432 | YES - persistent connection | Routes needing advisory locks |
| **Direct** | 5432 | YES - no pooler | Migrations, admin tasks |

**Recommendation**: Use **Session pooler** (port 5432) to maintain advisory lock compatibility, OR refactor distributed locking to use row-level locks instead.

### 3. Supabase Features - RESOLVED

**Question**: Will you use any Supabase-specific features?

**Answer**:
| Feature | Usage |
|---------|-------|
| **Auth** | NO - Keep Clerk for authentication |
| **RLS** | YES - Already used for `newsletter_subscribers` table |
| **Storage** | FUTURE - Will be used post-MVP launch |
| **Edge Functions** | Not planned |

## Remaining Open Questions (For Implementation Plan)

1. **Advisory Lock Strategy**: Keep session pooler OR refactor to row-level locks?
2. **Downtime Window**: Is zero-downtime migration required?
3. **Data Export Method**: pg_dump vs Prisma-based migration script?
4. **Schema Cleanup**: Remove unused tables from schema before migration?
5. **Rollback Strategy**: How to handle migration failure and rollback to Neon?
