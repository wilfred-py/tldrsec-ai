# Project Progress

**Date**: 2025-12-24
**Branch**: main
**Status**: All cron endpoints operational

---

## Current Session: Cron Endpoint Fixes

### Context
Slack bot was showing errors for both hourly and tier-aware cron endpoints.

### Completed Work

#### 1. Lazy Singleton Import Fix (commit `741148b`)

**Issue**: Module-level singleton instantiation was causing build-time database connection attempts.

**Root Cause**: Files like `performance-monitor.ts` and `cron-monitor.ts` directly imported singletons (`asyncAlertQueue`, `boundedContextManager`, `performanceMonitor`) at module load time, triggering their constructors during Vercel build.

**Fix**: Converted direct imports to lazy accessors using dynamic `require()`:

**Files Modified**:
- `lib/monitoring/performance-monitor.ts`
- `lib/monitoring/cron-monitor.ts`

**Code Pattern**:
```typescript
// BEFORE (problematic):
import { asyncAlertQueue } from './async-alert-queue';

// AFTER (lazy):
import type { AsyncAlertQueue } from './async-alert-queue';
const getAsyncAlertQueue = (): AsyncAlertQueue => {
  const { asyncAlertQueue } = require('./async-alert-queue');
  return asyncAlertQueue;
};
```

#### 2. JobQueue Schema Fix (migration `fix_jobqueue_type_nullable`)

**Issue**: Every job insert was failing with:
```
null value in column "type" of relation "JobQueue" violates not-null constraint
```

**Root Cause**: Database `pipeline.JobQueue` table had two job type columns:
- `type` - NOT NULL enum with values: `FETCH_FILING`, `SUMMARIZE_FILING`, `SEND_EMAIL`, `DISCOVERY`, `CLEANUP`
- `jobType` - nullable text field

The application code only writes to `jobType`, but database required `type` to be non-null.

**Fix**: Applied Supabase migration to make `type` column nullable:
```sql
ALTER TABLE pipeline."JobQueue" ALTER COLUMN "type" DROP NOT NULL;
```

**Verification**:
- Tier-aware endpoint: HTTP 202 - Discovery job queued successfully
- Hourly endpoint: HTTP 200 - Summary sent to Slack

---

## Recently Completed (Last 30 Days)

### Supabase Region Migration Fix (2025-12-24)

Fixed DATABASE_URL region mismatch after Supabase project recreation.
- Changed from `aws-0-ap-southeast-1` to `aws-1-ap-southeast-2`
- Updated both transaction pooler (6543) and session mode (5432) URLs

### Slack Hourly Schema Fix (2025-12-22)

Fixed `relation "pipeline.JobQueue" does not exist` error.
- Added `searchPath` to Prisma client initialization
- Set `search_path = "app", "pipeline", "public"` for multiSchema support

### Vercel DATABASE_URL Fix (2025-12-22)

Fixed Vercel deployment using wrong database URL.
- Discovered environment variable caching issue
- Re-synced all database URLs in Vercel dashboard

### Supabase Migration (2025-12-19 - 2025-12-22)

Completed full migration from Neon to Supabase.
- Phase 1: Schema creation with multiSchema support
- Phase 2: Data migration and verification
- Multiple schema alignment migrations applied

---

## Active Systems

### Cron Endpoints
| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/cron/tier-aware` | GET | Working (HTTP 202) |
| `/api/cron/slack-hourly-summary` | GET | Working (HTTP 200) |

### Database
- **Provider**: Supabase
- **Region**: aws-1-ap-southeast-2
- **Schemas**: `app`, `pipeline`
- **Connection**: PgBouncer transaction mode (port 6543)

### Monitoring
- Slack pipeline notifications active
- Performance monitoring via lazy singletons
- Alert queue processing asynchronously

---

*Last Updated: 2025-12-24*
*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*
