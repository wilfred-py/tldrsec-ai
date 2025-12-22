---
date: 2025-12-22T13:46:24+11:00
researcher: Claude
git_commit: 99250a6d7d5fc732c792ae5ef8c7e6609ce2c40c
branch: fix/slack-hourly-database-connection
repository: tldrsec-ai
topic: "Cron Job Failures - Database Schema Mismatch After Supabase Migration"
tags: [research, codebase, cron, database, supabase, neon, migration, schema]
status: complete
last_updated: 2025-12-22
last_updated_by: Claude
---

# Research: Cron Job Failures - Database Schema Mismatch After Supabase Migration

**Date**: 2025-12-22T13:46:24+11:00
**Researcher**: Claude
**Git Commit**: 99250a6d7d5fc732c792ae5ef8c7e6609ce2c40c
**Branch**: fix/slack-hourly-database-connection
**Repository**: tldrsec-ai

## Research Question

Investigate recent cron job failures related to the Supabase database migration, identify schema mismatches, and document the current state of the system.

## Summary

The cron job failures are caused by **Vercel's production `DATABASE_URL` still pointing to the old Neon database**, while the codebase has been updated to use Supabase's dual-schema architecture (`app` and `pipeline` schemas). The error `relation "pipeline.JobQueue" does not exist` confirms this mismatch.

**Key Findings:**
1. **Local `.env` is correctly configured** - Points to Supabase (port 6543 pooler)
2. **Supabase schemas are fully populated** - Both `app` (11 tables) and `pipeline` (19 tables) schemas exist with all expected data
3. **Vercel production is still pointing to Neon** - Set 32 days ago, never updated after migration
4. **Cloudflare Worker last deployed 2025-12-18** - Worker itself is up-to-date
5. **Code changes in PR #274 are correct** - Schema references properly updated to `app.*` and `pipeline.*`

## Detailed Findings

### 1. Current Database Configuration

**Local `.env` file** ([.env:57](.env#L57)):
```
DATABASE_URL=postgres://postgres.ipwlykhekrjfvejduotm:...@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Legacy Neon URL** (kept for reference, [.env:53](.env#L53)):
```
NEON_DATABASE_URL_LEGACY=postgresql://wilfred-py:...@ep-rapid-wildflower-291580-pooler.ap-southeast-1.aws.neon.tech/tldrsec-prod
```

**Direct URL for migrations** ([.env:107](.env#L107)):
```
DIRECT_URL=postgres://postgres.ipwlykhekrjfvejduotm:...@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

### 2. Prisma Schema Configuration

**File**: [prisma/schema.prisma](prisma/schema.prisma)

The Prisma schema is correctly configured for dual-schema architecture:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["app", "pipeline"]
}
```

All 30 models have correct `@@schema()` annotations:
- **app schema**: User, Ticker, SecFiling, Summary, CikMapping, TickerMonitoring, RssFilingCheck, UserSubscription, AuditLog, NotificationSent, SecCompanyCache
- **pipeline schema**: JobQueue, JobProgress, JobLock, SecFetchAttempt, FilingContentCache, FilingUsage, UsagePeriod, CronJobExecution, CronJobMetrics, CronJobAlert, TierProcessingExecution, CronExecutionContext, SummaryCacheAccess, SummaryEmailDelivery, CacheInvalidation, ErrorAlert, MonitoringThreshold, DailyWaitlistCache, DailyPipelineVerification

### 3. Supabase Schema Verification (via MCP)

Verified via `mcp__supabase__list_tables`:

| Schema | Table Count | Sample Tables |
|--------|-------------|---------------|
| `app` | 11 tables | User (2 rows), Ticker (14 rows), Summary (68 rows), CikMapping (20 rows), TickerMonitoring (13 rows), RssFilingCheck (340 rows) |
| `pipeline` | 19 tables | JobQueue (0 rows), CronJobExecution (10 rows), SummaryEmailDelivery (20 rows), DailyPipelineVerification (20 rows) |
| `public` | 3 tables | newsletter_subscribers (121 rows), newsletter_deliveries, page_analytics |

All expected tables exist with proper foreign key constraints between schemas.

### 4. Cloudflare Worker Status

**Last Deployment**: 2025-12-18T18:23:34Z
**Current Version**: 3f82d902-c721-43a5-8d14-86e37e1ad7f8

The worker calls Vercel endpoints:
- Step 0: `/api/cron/cleanup-locks`
- Step 1: `/api/cron/tier-aware?step=discover`
- Step 1.5: `/api/cron/tier-aware?step=discover-jobs`
- Step 2: `/api/cron/tier-aware?step=fetch`
- Step 3: `/api/cron/tier-aware?step=summarize`

### 5. Root Cause Analysis

The error `relation "pipeline.JobQueue" does not exist` occurs because:

1. **Vercel's `DATABASE_URL`** (set 32 days ago) points to Neon: `ep-rapid-wildflower-291580-pooler.ap-southeast-1.aws.neon.tech`
2. **Neon database** only has `public` schema - no `app` or `pipeline` schemas
3. **Prisma client** in production generates queries like `SELECT * FROM "pipeline"."JobQueue"` which fail on Neon

### 6. Diagnostic Enhancement Added

**Files Modified in Current Branch**:
- [lib/db/supabase-config.ts](lib/db/supabase-config.ts) - Added `checkDatabaseSchemas()` function
- [lib/db/index.ts](lib/db/index.ts) - Exported new diagnostic utilities
- [lib/slack/daily-report-handler.ts](lib/slack/daily-report-handler.ts) - Enhanced error handling with schema diagnostics

The diagnostic function:
- Detects if connected to Neon vs Supabase
- Queries `information_schema.schemata` to find available schemas
- Returns actionable error messages to Slack

## Code References

- `prisma/schema.prisma:1-14` - Dual-schema configuration
- `.env:57` - Active DATABASE_URL (Supabase)
- `.env:53` - Legacy Neon URL
- `lib/db/supabase-config.ts` - Schema diagnostic function
- `lib/slack/daily-report-handler.ts` - Enhanced error handling

## Architecture Documentation

### Database Architecture (Post-Migration)

```
Supabase PostgreSQL
├── app schema (Core application data)
│   ├── User
│   ├── Ticker
│   ├── SecFiling
│   ├── Summary
│   ├── CikMapping
│   ├── TickerMonitoring
│   ├── RssFilingCheck
│   └── ... (11 tables total)
│
├── pipeline schema (Processing infrastructure)
│   ├── JobQueue
│   ├── CronJobExecution
│   ├── JobLock
│   ├── FilingContentCache
│   └── ... (19 tables total)
│
└── public schema (Newsletter/analytics)
    ├── newsletter_subscribers (121 records)
    ├── newsletter_deliveries
    └── page_analytics
```

### Connection Architecture

```
Cloudflare Worker (every 10 min)
    ↓
Vercel (Next.js API Routes)
    ↓
Prisma Client (multiSchema)
    ↓
Supavisor Pooler (port 6543)
    ↓
Supabase PostgreSQL
```

## Required Fix (Not Implemented - Documentation Only)

The fix requires updating Vercel environment variables:

```bash
# 1. Update DATABASE_URL to Supabase Transaction Mode (port 6543)
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# Value: postgres://postgres.ipwlykhekrjfvejduotm:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# 2. Update DIRECT_URL to Supabase Session Mode (port 5432)
vercel env rm DIRECT_URL production
vercel env add DIRECT_URL production
# Value: postgres://postgres.ipwlykhekrjfvejduotm:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres

# 3. Redeploy
vercel --prod
```

## Historical Context (from PROGRESS.md)

- **2025-12-19**: Supabase Migration Phase 1 completed (Schema & Config)
- **2025-12-22**: Slack Hourly Diagnostic Enhancement added to improve error visibility
- **2025-12-22**: PR #274 merged with correct schema reference updates

The migration was completed on the codebase and Supabase database, but Vercel production environment variables were never updated.

## Related Research

- See [PROGRESS.md](../../PROGRESS.md) for full migration history
- See [.claude/history/TIMELINE.md](../../../.claude/history/TIMELINE.md) for project timeline

## Open Questions

1. Why wasn't Vercel's DATABASE_URL updated as part of the Supabase migration on 2025-12-19?
2. Should there be a CI/CD check to verify environment variable consistency between local and production?
3. Are there any other environment variables that need updating (e.g., preview/development environments)?
