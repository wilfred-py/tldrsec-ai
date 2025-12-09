# Neon to Supabase Migration - Implementation Plan

**Date**: 2025-12-09 08:36:18 AEDT
**Git Commit**: 3c336c037671f06cfaaf69e4d959153609e145e2
**Branch**: fix/fetch-job-processing-race-condition
**Repository**: tldrsec-ai

## Critical Safety Notes

### Existing Supabase Tables - DO NOT MODIFY

The Supabase project already contains these tables that **MUST be preserved**:

| Table | Rows | Protection |
|-------|------|------------|
| `newsletter_subscribers` | 85 | RLS enabled, contains active waitlist |
| `newsletter_deliveries` | 0 | RLS enabled, FK to subscribers |
| `page_analytics` | 0 | RLS enabled |

**All migration commands explicitly exclude these tables.**

### Cloudflare Cron Status

The cron pipeline is **not currently functional**, so no need to disable it during migration. The cron worker can remain deployed - it won't interfere with the migration process.

---

## Overview

This plan migrates the tldrsec-ai application from Neon PostgreSQL to Supabase PostgreSQL. Based on the options analysis, we will use:

- **Advisory Lock Strategy**: Hybrid approach (Transaction + Session mode)
- **Downtime**: Scheduled 30-60 minute maintenance window
- **Export Method**: pg_dump with selective table export
- **Schema**: Full migration, cleanup later
- **Rollback**: Keep Neon active 14 days + PITR backup + documented rollback script

## Current State Analysis

### Database Configuration
- **Current Provider**: Neon PostgreSQL
- **ORM**: Prisma with 13 migrations
- **Schema**: 35 tables, 6 enums
- **Connection**: Single `DATABASE_URL` environment variable

### Existing Supabase Project

The Supabase project is **already set up** with the following tables:

| Table | Rows | RLS Enabled | Notes |
|-------|------|-------------|-------|
| `newsletter_subscribers` | 85 | Yes | **DO NOT MODIFY** - Active waitlist subscribers |
| `newsletter_deliveries` | 0 | Yes | FK to newsletter_subscribers |
| `page_analytics` | 0 | Yes | Analytics tracking |

**CRITICAL**: These tables exist outside of Prisma and must be preserved during migration.

### Tables to Migrate (11 essential + 2 maybe)

**Essential (11):**
| Table | Records (Est.) | Purpose |
|-------|----------------|---------|
| `User` | ~100-500 | User accounts |
| `Ticker` | ~500-2000 | User-tracked companies |
| `Summary` | ~1000-5000 | AI-generated summaries |
| `JobQueue` | ~100-500 | Background jobs |
| `JobLock` | ~5-20 | Distributed locks |
| `DailyPipelineVerification` | ~30-90 | Pipeline health |
| `DailyWaitlistCache` | ~30-90 | Waitlist display |
| `RssFilingCheck` | ~500-2000 | RSS filing tracking |
| `TickerMonitoring` | ~50-200 | Active ticker monitoring |

**Maybe (2 - evaluate during migration):**
| Table | Records (Est.) | Purpose |
|-------|----------------|---------|
| `CikMapping` | ~10,000+ | Ticker to CIK mappings |
| `FilingContentCache` | ~1000-5000 | Filing content cache |

### Tables to Skip (23)
All monitoring, audit, and metrics tables (see options analysis for full list).

## Desired End State

After migration completion:
1. Application connects to Supabase PostgreSQL via `DATABASE_URL` (Transaction mode)
2. Advisory lock operations use `DIRECT_URL` (Session mode)
3. All 11 essential tables migrated with data integrity verified
4. Cron jobs resume processing without issues
5. Users can access dashboard and receive email notifications
6. Neon remains accessible for 14-day rollback window

### Verification Criteria
- [ ] `npm run test:pipeline:comprehensive` passes
- [ ] `npm run test:e2e` passes with email delivery
- [ ] `npm run test:cron-comprehensive` passes
- [ ] All user tickers visible in dashboard
- [ ] New SEC filings processed and emailed

## What We're NOT Doing

1. **NOT migrating monitoring/audit tables** - Historical data not essential
2. **NOT implementing zero-downtime** - Overkill for current scale
3. **NOT refactoring advisory locks** - Using hybrid connection approach instead
4. **NOT cleaning schema before migration** - Lower risk to clean up later
5. **NOT using Supabase Auth** - Keeping Clerk for authentication
6. **NOT enabling RLS on application tables** - Only on `newsletter_subscribers`
7. **NOT touching existing Supabase tables** - `newsletter_subscribers`, `newsletter_deliveries`, `page_analytics` must be preserved

---

## Phase 1: Pre-Migration Preparation (Day -7 to Day -1)

### Overview
Prepare codebase for dual-URL support, create backup, and test migration process in staging.

### Changes Required:

#### 1.1 Update Prisma Schema for directUrl

**File**: `prisma/schema.prisma`
**Changes**: Add `directUrl` for session-mode connections

```prisma
generator client {
  provider      = "prisma-client-js"
  output        = "../node_modules/.prisma/client"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

#### 1.2 Update lib/db/prisma.ts for Dual Connection

**File**: `lib/db/prisma.ts`
**Changes**: Add support for `DIRECT_URL` and separate lock client

```typescript
import { PrismaClient } from '@prisma/client'

declare global {
  let prisma: PrismaClient | undefined
  let lockPrisma: PrismaClient | undefined
}

// ... existing isBuildTime logic ...

let prisma: PrismaClient | undefined
let lockPrisma: PrismaClient | undefined

// Main client (Transaction mode - port 6543)
if (process.env.DATABASE_URL && !isBuildTime) {
  // ... existing initialization ...
}

// Lock client (Session mode - port 5432)
// Uses DIRECT_URL for advisory lock operations
if (process.env.DIRECT_URL && !isBuildTime) {
  if (process.env.NODE_ENV === 'production') {
    lockPrisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: process.env.DIRECT_URL
        }
      }
    })
  } else {
    if (!global.lockPrisma) {
      global.lockPrisma = new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
          db: {
            url: process.env.DIRECT_URL || process.env.DATABASE_URL
          }
        }
      })
    }
    lockPrisma = global.lockPrisma
  }
}

export { prisma, lockPrisma }

export function getPrismaClient(): PrismaClient {
  // ... existing logic ...
}

/**
 * Get the Prisma client for advisory lock operations
 * Uses DIRECT_URL (Session mode) for session-persistent connections
 * Falls back to main client if DIRECT_URL not configured
 */
export function getLockPrismaClient(): PrismaClient {
  if (isBuildTime) {
    return new Proxy({} as PrismaClient, {
      get: () => {
        throw new Error('Lock client not available during build time.');
      }
    });
  }

  // Fall back to main client if DIRECT_URL not set
  if (!lockPrisma) {
    console.warn('⚠️  DIRECT_URL not configured, falling back to DATABASE_URL for locks');
    return getPrismaClient();
  }

  return lockPrisma;
}
```

#### 1.3 Update distributed-lock.ts for Session Mode Client

**File**: `lib/db/distributed-lock.ts`
**Changes**: Use `getLockPrismaClient()` for advisory lock operations

Find and replace Prisma client usage in lock functions:

```typescript
import { getLockPrismaClient } from './prisma';

// In tryAcquireLock function (~line 323)
async tryAcquireLock(lockName: string, options: LockOptions): Promise<LockResult> {
  const prisma = getLockPrismaClient(); // Changed from getPrismaClient()
  // ... rest of function
}

// In releaseLock function (~line 202)
async releaseLock(lockId: string): Promise<void> {
  const prisma = getLockPrismaClient(); // Changed from getPrismaClient()
  // ... rest of function
}

// In cleanup functions
static async cleanupExpiredLocks(): Promise<number> {
  const prisma = getLockPrismaClient(); // Changed from getPrismaClient()
  // ... rest of function
}
```

#### 1.4 Update Environment Variable Validation

**File**: `lib/config/env-validation.ts`
**Changes**: Add `DIRECT_URL` as optional but recommended variable

```typescript
// Add to environment schema
export const envSchema = z.object({
  // ... existing variables ...
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(), // Session mode for advisory locks
  // ... rest of schema
});

// Add warning if DIRECT_URL not set in production
if (process.env.NODE_ENV === 'production' && !process.env.DIRECT_URL) {
  console.warn('⚠️  DIRECT_URL not set - advisory locks will use transaction mode (may cause issues)');
}
```

#### 1.5 Create Pre-Migration Backup Script

**File**: `scripts/backup-neon.sh`
**Changes**: Create new script for backup

```bash
#!/bin/bash
# scripts/backup-neon.sh
# Pre-migration backup of Neon database

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_FILE="${BACKUP_DIR}/neon_backup_${TIMESTAMP}.dump"

echo "=== Neon Database Backup ==="
echo "Timestamp: ${TIMESTAMP}"

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Validate DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set"
  exit 1
fi

# Create backup with parallel jobs
echo "Creating backup..."
pg_dump "$DATABASE_URL" \
  -Fc \
  -j4 \
  --verbose \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -f "${BACKUP_FILE}"

# Verify backup
echo "Verifying backup..."
pg_restore --list "${BACKUP_FILE}" > /dev/null

# Calculate size
SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "Backup created: ${BACKUP_FILE} (${SIZE})"

# Create checksum
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"
echo "Checksum: ${BACKUP_FILE}.sha256"

echo "=== Backup Complete ==="
```

#### 1.6 Create Rollback Script

**File**: `scripts/rollback-to-neon.sh`
**Changes**: Create rollback procedure

```bash
#!/bin/bash
# scripts/rollback-to-neon.sh
# Rollback from Supabase to Neon

set -e

echo "=== Rollback to Neon ==="
echo "WARNING: This will switch the application back to Neon database"
echo "All data written to Supabase after migration will be LOST"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Step 1: Verify Neon is accessible
echo "Step 1: Verifying Neon connection..."
if [ -z "$NEON_DATABASE_URL" ]; then
  echo "ERROR: NEON_DATABASE_URL not set"
  exit 1
fi

psql "$NEON_DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: Cannot connect to Neon"
  exit 1
fi
echo "✓ Neon connection verified"

# Step 2: Disable Cloudflare cron
echo "Step 2: Disable Cloudflare cron worker..."
echo "Run: cd cloudflare-cron && npx wrangler deployments rollback"
read -p "Press Enter when cron is disabled..."

# Step 3: Update Vercel environment
echo "Step 3: Update Vercel environment variables..."
echo "Run in Vercel dashboard or CLI:"
echo "  1. Set DATABASE_URL to Neon URL"
echo "  2. Remove or update DIRECT_URL"
echo "  3. Trigger redeploy"
read -p "Press Enter when Vercel is updated..."

# Step 4: Verify application
echo "Step 4: Verify application health..."
curl -s https://tldrsec.app/api/health | jq .

# Step 5: Re-enable cron
echo "Step 5: Re-enable Cloudflare cron..."
echo "Run: cd cloudflare-cron && npx wrangler deploy"
read -p "Press Enter when cron is re-enabled..."

echo "=== Rollback Complete ==="
echo "Monitor application logs for any issues"
```

#### 1.7 Update .env.example

**File**: `.env.example`
**Changes**: Add DIRECT_URL and Supabase documentation

```bash
# Database Configuration
# For Neon:
# DATABASE_URL="postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
# DIRECT_URL="" # Not needed for Neon

# For Supabase:
# DATABASE_URL="postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
# DIRECT_URL="postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

DATABASE_URL="postgresql://..."
DIRECT_URL="" # Session mode for advisory locks (Supabase only)
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run db:generate` succeeds with new schema
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (unit tests)
- [ ] Scripts created and executable

#### Manual Verification:
- [ ] Local development works with current Neon setup
- [ ] Backup script tested successfully
- [ ] Backup file is valid (can list contents with pg_restore)

**Implementation Note**: After completing Phase 1, pause for manual confirmation before proceeding.

---

## Phase 2: Supabase Schema Deployment (Day -1)

### Overview
Deploy Prisma schema to the existing Supabase project while preserving existing tables.

### Pre-Existing State

The Supabase project already contains:
- `newsletter_subscribers` (85 rows) - **MUST PRESERVE**
- `newsletter_deliveries` (0 rows) - **MUST PRESERVE**
- `page_analytics` (0 rows) - **MUST PRESERVE**
- No Prisma migrations applied yet

### Changes Required:

#### 2.1 Retrieve Connection Strings (If Not Already Saved)

**Actions** (Supabase Dashboard → Settings → Database):

1. **Transaction Mode URL** (port 6543):
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

2. **Session Mode URL** (port 5432):
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

3. **Direct Connection URL** (for migrations):
   ```
   postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres
   ```

#### 2.2 Verify Existing Tables Before Schema Deployment

**SQL Query** (Supabase SQL Editor) - Run BEFORE Prisma migration:

```sql
-- Document existing tables and row counts
SELECT
  table_name,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;

-- Record newsletter_subscribers count for verification
SELECT count(*) as subscriber_count FROM newsletter_subscribers;
-- Expected: 85 rows
```

#### 2.3 Deploy Prisma Schema (Preserving Existing Tables)

**CRITICAL**: Prisma will create new tables but NOT touch existing non-Prisma tables.

**Terminal Commands**:

```bash
# Set environment variable temporarily (use DIRECT connection, not pooled)
export DATABASE_URL="postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres"

# Option 1: Use db push (simpler, no migration history)
# This creates tables that don't exist and updates schema without dropping existing tables
npx prisma db push --accept-data-loss

# Option 2: Apply migrations (recommended for tracking)
npx prisma migrate deploy

# Verify schema
npx prisma db pull --print
```

**Why `--accept-data-loss`?**: This flag allows Prisma to make schema changes. Since we're creating NEW tables (not modifying existing ones), no actual data loss occurs. The existing `newsletter_*` and `page_analytics` tables are unaffected because they're not in the Prisma schema.

#### 2.4 Verify Existing Tables Are Preserved

**SQL Query** (Supabase SQL Editor) - Run AFTER Prisma migration:

```sql
-- Verify newsletter_subscribers still has all records
SELECT count(*) as subscriber_count FROM newsletter_subscribers;
-- MUST equal: 85 rows

-- Verify RLS is still enabled on existing tables
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('newsletter_subscribers', 'newsletter_deliveries', 'page_analytics');
-- MUST show rowsecurity = true for all

-- Confirm no data was modified
SELECT email, subscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC LIMIT 5;
```

#### 2.5 Verify Prisma Tables Created

**SQL Query** (Supabase SQL Editor):

```sql
-- Count all tables (should be ~38: 35 Prisma + 3 existing)
SELECT count(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public';

-- List Prisma-managed tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name NOT IN ('newsletter_subscribers', 'newsletter_deliveries', 'page_analytics')
ORDER BY table_name;

-- Verify enums created
SELECT typname, enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
ORDER BY typname, enumlabel;
```

**Expected**: ~38 tables (35 Prisma + 3 existing), 6 enums.

### Success Criteria:

#### Automated Verification:
- [ ] `npx prisma db push` or `npx prisma migrate deploy` succeeds
- [ ] `npx prisma db pull --print` shows Prisma schema tables

#### Manual Verification:
- [ ] `newsletter_subscribers` still has 85 rows
- [ ] RLS still enabled on `newsletter_*` and `page_analytics` tables
- [ ] All Prisma tables created successfully
- [ ] No errors in Supabase logs

**Implementation Note**: After completing Phase 2, verify newsletter_subscribers count before proceeding.

---

## Phase 3: Code Modifications (Day 0 - Pre-Migration)

### Overview
Apply code changes needed for Supabase compatibility, tested locally against Supabase.

### Changes Required:

#### 3.1 Commit Phase 1 Changes

Ensure all Phase 1 changes are committed:

```bash
git add .
git commit -m "feat(db): add DIRECT_URL support for Supabase migration

- Add directUrl to Prisma schema for session-mode connections
- Create getLockPrismaClient() for advisory lock operations
- Update distributed-lock.ts to use session-mode client
- Add DIRECT_URL to environment validation
- Create backup and rollback scripts"
```

#### 3.2 Test Locally Against Supabase

**File**: `.env.local` (temporary, do not commit)

```bash
# Transaction mode for regular queries
DATABASE_URL="postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"

# Session mode for advisory locks
DIRECT_URL="postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

**Test Commands**:

```bash
# Regenerate Prisma client
npm run db:generate

# Run tests against Supabase (empty database)
npm run test:db

# Test lock functionality
npm run test -- --testPathPattern="distributed-lock"
```

#### 3.3 Verify Advisory Lock Compatibility

**Create test script**: `scripts/test-supabase-locks.ts`

```typescript
import { getLockPrismaClient } from '../lib/db/prisma';

async function testAdvisoryLocks() {
  const prisma = getLockPrismaClient();

  console.log('Testing advisory locks against Supabase...');

  try {
    // Test 1: Acquire lock
    const lockHash = BigInt(12345);
    const result = await prisma.$queryRaw<{acquired: boolean}[]>`
      SELECT pg_try_advisory_lock(${lockHash}) as acquired
    `;
    console.log('Lock acquired:', result[0].acquired);

    // Test 2: Release lock
    const released = await prisma.$queryRaw<{released: boolean}[]>`
      SELECT pg_advisory_unlock(${lockHash}) as released
    `;
    console.log('Lock released:', released[0].released);

    // Test 3: Check no locks remain
    const locks = await prisma.$queryRaw<{count: number}[]>`
      SELECT count(*) as count FROM pg_locks WHERE locktype = 'advisory'
    `;
    console.log('Active advisory locks:', locks[0].count);

    console.log('✅ Advisory locks working correctly!');
  } catch (error) {
    console.error('❌ Advisory lock test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testAdvisoryLocks();
```

**Run test**:

```bash
npx tsx scripts/test-supabase-locks.ts
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run db:generate` succeeds
- [ ] `npm run build` succeeds
- [ ] Advisory lock test script passes
- [ ] Local development works with Supabase (empty DB)

#### Manual Verification:
- [ ] Can connect to Supabase from local machine
- [ ] Advisory locks acquire and release correctly
- [ ] No connection errors in console

**Implementation Note**: After completing Phase 3, pause for manual confirmation before proceeding.

---

## Phase 4: Data Migration (Day 0 - Maintenance Window)

### Overview
Execute data migration during scheduled maintenance window (30-60 minutes).

### Why Disable Cloudflare Cron During Migration?

The cron worker runs every 10 minutes and:
1. **Acquires distributed locks** via `JobLock` table - could conflict with migration
2. **Writes to `JobQueue`** - new jobs created during migration would be lost when we truncate/restore
3. **Updates user data** - budget usage, lastProcessedAt, etc. could create inconsistencies
4. **Calls Vercel API** - which still points to Neon until we switch DATABASE_URL

By pausing cron, we ensure:
- No race conditions between migration and active processing
- Clean data snapshot without in-flight transactions
- No orphaned locks that could block post-migration startup

### Pre-Migration Checklist

Before starting:
- [ ] Notify users of maintenance (if applicable)
- [ ] Disable Cloudflare cron worker
- [ ] Take fresh Neon backup
- [ ] Verify Supabase is accessible
- [ ] Verify `newsletter_subscribers` count in Supabase (should be 85)
- [ ] Have rollback script ready

### Changes Required:

#### 4.1 Disable Cloudflare Cron Worker

```bash
cd cloudflare-cron
npx wrangler deployments list
# Note the current deployment ID for potential rollback

# Option 1: Pause the cron trigger (keeps worker deployed)
# Edit wrangler.toml: comment out [triggers] section, then deploy
npx wrangler deploy

# Option 2: Delete the worker temporarily
npx wrangler delete

# Option 3: Change cron to run yearly (effectively disabled)
# Edit wrangler.toml: crons = ["0 0 1 1 *"]
npx wrangler deploy
```

**Verify cron is disabled**:
```bash
# Should show no recent invocations
npx wrangler tail --format=pretty
# Wait 10+ minutes, confirm no new log entries
```

#### 4.2 Put Application in Maintenance Mode (Optional)

If users are active, temporarily disable API:

**File**: `middleware.ts` (temporary change)

```typescript
// Add at top of middleware
if (process.env.MAINTENANCE_MODE === 'true') {
  return new Response(
    JSON.stringify({ error: 'Service under maintenance. Back shortly!' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}
```

#### 4.3 Create Fresh Backup

```bash
# Run backup script
./scripts/backup-neon.sh

# Verify backup
pg_restore --list ./backups/neon_backup_*.dump | head -50
```

#### 4.4 Export Data from Neon

**Create export script**: `scripts/export-neon-data.sh`

```bash
#!/bin/bash
# scripts/export-neon-data.sh
# Export selected tables from Neon

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="./exports"
EXPORT_FILE="${EXPORT_DIR}/neon_export_${TIMESTAMP}"

echo "=== Export Neon Data ==="

mkdir -p ${EXPORT_DIR}

# Essential tables
TABLES=(
  "User"
  "Ticker"
  "Summary"
  "JobQueue"
  "JobLock"
  "DailyPipelineVerification"
  "DailyWaitlistCache"
  "RssFilingCheck"
  "TickerMonitoring"
)

# Build table arguments
TABLE_ARGS=""
for table in "${TABLES[@]}"; do
  TABLE_ARGS="${TABLE_ARGS} --table=\"${table}\""
done

echo "Exporting tables: ${TABLES[*]}"

# Export with directory format for parallel restore
eval pg_dump "$DATABASE_URL" \
  -Fd \
  -j4 \
  --verbose \
  --data-only \
  --no-owner \
  --no-privileges \
  ${TABLE_ARGS} \
  -f "${EXPORT_FILE}"

# Verify export
echo "Verifying export..."
pg_restore --list "${EXPORT_FILE}" | grep "TABLE DATA"

echo "Export complete: ${EXPORT_FILE}"
```

**Run export**:

```bash
chmod +x scripts/export-neon-data.sh
./scripts/export-neon-data.sh
```

#### 4.5 Import Data to Supabase

**CRITICAL**: The import ONLY touches Prisma-managed tables. The `newsletter_subscribers`, `newsletter_deliveries`, and `page_analytics` tables are NOT affected because:
1. They are not in the pg_dump export (we explicitly list tables to export)
2. We use `--data-only` which only inserts data, doesn't modify schema
3. The TRUNCATE command explicitly lists only Prisma tables

```bash
# Set Supabase connection (direct, not pooled)
export SUPABASE_URL="postgresql://postgres.[project]:[password]@db.[project].supabase.co:5432/postgres"

# SAFETY CHECK: Verify newsletter_subscribers before proceeding
psql "$SUPABASE_URL" -c "SELECT count(*) as count FROM newsletter_subscribers;"
# MUST show: 85 rows. If not, STOP and investigate.

# Clear Prisma-managed tables only (NOT newsletter_* or page_analytics)
# Using explicit table list to prevent accidental data loss
psql "$SUPABASE_URL" << 'EOF'
-- Only truncate tables we're about to import
-- NEVER include newsletter_subscribers, newsletter_deliveries, or page_analytics
TRUNCATE "User" CASCADE;
TRUNCATE "JobQueue" CASCADE;
TRUNCATE "JobLock";
TRUNCATE "DailyPipelineVerification";
TRUNCATE "DailyWaitlistCache";
TRUNCATE "RssFilingCheck" CASCADE;
TRUNCATE "TickerMonitoring" CASCADE;
EOF

# Import data (only affects tables in the export)
pg_restore \
  -d "$SUPABASE_URL" \
  -j4 \
  --verbose \
  --data-only \
  --no-owner \
  --disable-triggers \
  ./exports/neon_export_*/

# Re-enable triggers
psql "$SUPABASE_URL" -c "SET session_replication_role = DEFAULT;"

# SAFETY CHECK: Verify newsletter_subscribers still intact
psql "$SUPABASE_URL" -c "SELECT count(*) as count FROM newsletter_subscribers;"
# MUST still show: 85 rows
```

#### 4.6 Verify Data Migration

**Create verification script**: `scripts/verify-migration.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const neon = new PrismaClient({
  datasources: { db: { url: process.env.NEON_DATABASE_URL } }
});

const supabase = new PrismaClient({
  datasources: { db: { url: process.env.SUPABASE_DATABASE_URL } }
});

async function verify() {
  console.log('=== Verifying Migration ===\n');

  const tables = [
    { name: 'User', model: 'user' },
    { name: 'Ticker', model: 'ticker' },
    { name: 'Summary', model: 'summary' },
    { name: 'JobQueue', model: 'jobQueue' },
    { name: 'JobLock', model: 'jobLock' },
    { name: 'DailyPipelineVerification', model: 'dailyPipelineVerification' },
    { name: 'DailyWaitlistCache', model: 'dailyWaitlistCache' },
    { name: 'RssFilingCheck', model: 'rssFilingCheck' },
    { name: 'TickerMonitoring', model: 'tickerMonitoring' },
  ];

  let allMatch = true;

  for (const table of tables) {
    const neonCount = await (neon as any)[table.model].count();
    const supabaseCount = await (supabase as any)[table.model].count();

    const match = neonCount === supabaseCount;
    const status = match ? '✅' : '❌';

    console.log(`${status} ${table.name}: Neon=${neonCount}, Supabase=${supabaseCount}`);

    if (!match) allMatch = false;
  }

  console.log('\n' + (allMatch ? '✅ All tables verified!' : '❌ Verification failed!'));

  await neon.$disconnect();
  await supabase.$disconnect();

  process.exit(allMatch ? 0 : 1);
}

verify();
```

**Run verification**:

```bash
NEON_DATABASE_URL="..." SUPABASE_DATABASE_URL="..." npx tsx scripts/verify-migration.ts
```

#### 4.7 Sync Sequences (Important!)

PostgreSQL sequences don't auto-sync. Update them:

```sql
-- Run against Supabase
-- Update User sequence
SELECT setval(
  pg_get_serial_sequence('"User"', 'id'),
  COALESCE((SELECT MAX(id) FROM "User"), 0) + 1,
  false
);

-- For UUID tables, no sequence update needed
-- But verify auto-generated UUIDs work:
INSERT INTO "JobLock" (id, "lockName", "acquiredBy", "expiresAt")
VALUES (gen_random_uuid(), 'test_lock', 'migration_test', NOW() + INTERVAL '1 hour')
RETURNING id;

-- Clean up test
DELETE FROM "JobLock" WHERE "lockName" = 'test_lock';
```

### Success Criteria:

#### Automated Verification:
- [ ] Verification script shows all tables match
- [ ] No errors in import logs

#### Manual Verification:
- [ ] Spot-check sample records in Supabase dashboard
- [ ] User counts match
- [ ] Summary counts match
- [ ] Ticker relationships intact
- [ ] **CRITICAL**: `newsletter_subscribers` still has exactly 85 rows
- [ ] **CRITICAL**: RLS still enabled on `newsletter_*` tables

**Implementation Note**: After completing Phase 4, proceed immediately to Phase 5 (minimize downtime).

---

## Phase 5: Cutover and Verification (Day 0 - Post-Migration)

### Overview
Switch application to Supabase and verify all functionality.

### Changes Required:

#### 5.1 Update Vercel Environment Variables

**Vercel Dashboard** (Settings → Environment Variables):

1. **Update DATABASE_URL**:
   - Old: `postgresql://...@neon.tech/...`
   - New: `postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

2. **Add DIRECT_URL**:
   - Value: `postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`

3. **Keep NEON_DATABASE_URL** (for rollback):
   - Value: Original Neon URL

#### 5.2 Trigger Vercel Redeploy

```bash
# Via CLI
vercel --prod

# OR via dashboard: Deployments → Latest → Redeploy
```

#### 5.3 Verify Application Health

```bash
# Health check
curl -s https://tldrsec.app/api/health | jq .

# Database connection check
curl -s https://tldrsec.app/api/health/database | jq .
```

#### 5.4 Run Critical Test Suite

```bash
# Set test environment to production
export TEST_EMAIL="your-email@example.com"

# Run comprehensive tests
npm run test:pipeline:comprehensive

# Run E2E test
npm run test:e2e

# Verify cron functionality
npm run test:cron-comprehensive
```

#### 5.5 Re-enable Cloudflare Cron Worker

```bash
cd cloudflare-cron

# Update worker with new CRON_SECRET if changed
npx wrangler secret put CRON_SECRET

# Deploy worker
npx wrangler deploy

# Monitor logs
npx wrangler tail --format=pretty
```

#### 5.6 Verify Cron Execution

Wait for next 10-minute interval and verify:

```bash
# Check cron logs
cd cloudflare-cron
npx wrangler tail --format=pretty

# Verify in Supabase
psql "$SUPABASE_URL" -c "SELECT * FROM \"JobLock\" ORDER BY \"acquiredAt\" DESC LIMIT 5;"
```

#### 5.7 Remove Maintenance Mode

If maintenance mode was enabled, remove or disable:

```bash
# Unset environment variable in Vercel
vercel env rm MAINTENANCE_MODE production
vercel --prod
```

### Success Criteria:

#### Automated Verification:
- [ ] Health endpoints return 200
- [ ] `npm run test:pipeline:comprehensive` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run test:cron-comprehensive` passes
- [ ] Cloudflare cron executes successfully

#### Manual Verification:
- [ ] Login to dashboard works
- [ ] User tickers displayed correctly
- [ ] Can add/remove tickers
- [ ] Summary pages load
- [ ] Email received from E2E test

**Implementation Note**: Monitor closely for 24-48 hours before proceeding to Phase 6.

---

## Phase 6: Post-Migration and Cleanup (Day 1-14)

### Overview
Monitor stability, clean up unused resources, and finalize migration.

### Changes Required:

#### 6.1 Monitor for 48 Hours

**Daily Checks**:
- [ ] Cron jobs executing every 10 minutes
- [ ] No connection errors in Vercel logs
- [ ] No lock timeouts in Supabase logs
- [ ] Emails being delivered
- [ ] User dashboard accessible

**Supabase Dashboard Monitoring**:
- Connection pooler usage
- Database size
- Query performance
- Error logs

#### 6.2 Run Daily Verification

```bash
# Run daily for first week
npm run verify:daily

# Check for any failed pipelines
npm run verify:daily -- --date=$(date -v-1d +%Y-%m-%d)
```

#### 6.3 Update Documentation

**File**: `CLAUDE.md`
**Changes**: Update database provider information

```markdown
### Database Configuration
- **Provider**: Supabase PostgreSQL
- **Connection Pooling**: Supavisor (Transaction mode on port 6543)
- **Session Mode**: Port 5432 for advisory locks (via DIRECT_URL)
```

#### 6.4 Clean Up Local Files

```bash
# Remove temporary exports (after 14-day window)
rm -rf ./exports/
rm -rf ./backups/  # Keep one final backup

# Remove test scripts
rm scripts/test-supabase-locks.ts
rm scripts/verify-migration.ts
```

#### 6.5 Decommission Neon (After 14 Days)

**Only after confirming stability**:

1. Take final backup of Neon (archive)
2. Export connection logs for audit
3. Cancel Neon subscription
4. Delete Neon project
5. Remove `NEON_DATABASE_URL` from Vercel

#### 6.6 Optional: Schema Cleanup

Create migration to remove unused tables:

```bash
# Generate migration
npx prisma migrate dev --name remove_unused_tables --create-only

# Edit migration to drop tables
# BE CAREFUL - verify tables are truly unused
```

**Tables safe to drop** (monitoring/audit not used):
- `CronJobExecution`
- `CronJobMetrics`
- `CronJobAlert`
- `CronJobPerformance`
- `CronJobDailySummary`
- `TierProcessingMetrics`
- `TierProcessingExecution`
- `CronExecutionContext`
- `SecFiling` (if not used)
- `SecFetchAttempt` (if not used)
- `SecCompanyCache` (if not used)
- And others from skip list

### Success Criteria:

#### Automated Verification:
- [ ] 14 consecutive days of successful cron runs
- [ ] No rollback needed
- [ ] All tests continue passing

#### Manual Verification:
- [ ] Users report no issues
- [ ] Performance acceptable
- [ ] Costs within expectations

**Implementation Note**: Only decommission Neon after 14-day stability period.

---

## Testing Strategy

### Pre-Migration Tests
```bash
npm run lint                           # Code quality
npm run test                           # Unit tests
npm run build                          # Build verification
```

### Migration Verification Tests
```bash
npm run test:db                        # Database connection
npm run test:pipeline:comprehensive    # Pipeline validation
npm run test:e2e                       # End-to-end with email
npm run test:cron-comprehensive        # Cron integration
```

### Post-Migration Monitoring
```bash
npm run verify:daily                   # Daily pipeline check
npm run test:e2e:all-tickers           # All ticker E2E validation
```

## Performance Considerations

### Connection Pooling
- **Transaction Mode**: More efficient for serverless
- **Session Mode**: Required only for advisory locks
- **Recommendation**: Start with Pool Size 15, increase if needed

### Latency
- Supabase region matches Neon (us-east-1)
- No expected latency increase
- Monitor first-byte time post-migration

### Cost Optimization
- Pro plan includes higher connection limits
- Monitor usage in dashboard
- Scale down if underutilized

## Rollback Plan

### Quick Rollback (< 5 minutes)
1. Update `DATABASE_URL` in Vercel to Neon URL
2. Remove `DIRECT_URL`
3. Trigger redeploy
4. Verify health endpoint

### Full Rollback (if data written to Supabase)
1. Run `./scripts/rollback-to-neon.sh`
2. Accept data loss for post-migration period
3. Investigate root cause
4. Plan re-migration

## References

- [Options Analysis](./2025-12-09-neon-to-supabase-migration-options-analysis.md)
- [Original Research](../../thoughts/shared/research/2025-12-08-neon-to-supabase-migration-research.md)
- [Supabase Prisma Guide](https://supabase.com/docs/guides/database/prisma)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [lib/db/distributed-lock.ts](../../lib/db/distributed-lock.ts)
- [lib/db/prisma.ts](../../lib/db/prisma.ts)
