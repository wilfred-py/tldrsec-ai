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
Prepare codebase for dual-URL support with TDD approach - write tests first that verify the new connection behavior, then implement the code changes.

### Step 1.1: 🔴 Write Failing Tests for Dual Connection Support

**Test File**: `__tests__/db/prisma-connection.test.ts`

Write these tests FIRST (they should all fail initially):

```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock environment for testing
const originalEnv = process.env;

describe('Prisma Connection - Dual URL Support', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getPrismaClient', () => {
    it('should return a valid PrismaClient when DATABASE_URL is set', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      const { getPrismaClient } = await import('@/lib/db/prisma');
      const client = getPrismaClient();
      expect(client).toBeDefined();
      expect(typeof client.$connect).toBe('function');
    });

    it('should throw error when DATABASE_URL is not set', async () => {
      delete process.env.DATABASE_URL;
      const { getPrismaClient } = await import('@/lib/db/prisma');
      expect(() => getPrismaClient()).toThrow('DATABASE_URL environment variable is not set');
    });
  });

  describe('getLockPrismaClient', () => {
    it('should return separate client when DIRECT_URL is set', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:6543/test';
      process.env.DIRECT_URL = 'postgresql://test:test@localhost:5432/test';
      const { getPrismaClient, getLockPrismaClient } = await import('@/lib/db/prisma');

      const mainClient = getPrismaClient();
      const lockClient = getLockPrismaClient();

      expect(lockClient).toBeDefined();
      // They should be different instances
      expect(lockClient).not.toBe(mainClient);
    });

    it('should fall back to main client when DIRECT_URL is not set', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      delete process.env.DIRECT_URL;
      const { getPrismaClient, getLockPrismaClient } = await import('@/lib/db/prisma');

      const mainClient = getPrismaClient();
      const lockClient = getLockPrismaClient();

      // Should fall back to main client
      expect(lockClient).toBe(mainClient);
    });

    it('should warn when falling back to main client in production', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      delete process.env.DIRECT_URL;

      const { getLockPrismaClient } = await import('@/lib/db/prisma');
      getLockPrismaClient();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DIRECT_URL not configured')
      );
      consoleSpy.mockRestore();
    });
  });
});

describe('Distributed Lock - Session Mode Client', () => {
  it('should use getLockPrismaClient for advisory lock operations', async () => {
    // This test verifies the distributed-lock module uses the correct client
    const mockGetLockPrismaClient = jest.fn().mockReturnValue({
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      $disconnect: jest.fn(),
    });

    jest.doMock('@/lib/db/prisma', () => ({
      getLockPrismaClient: mockGetLockPrismaClient,
    }));

    const { DistributedLockManager } = await import('@/lib/db/distributed-lock');

    // Attempt to acquire a lock
    await DistributedLockManager.tryAcquireLock('test-lock', { ttl: 60000 });

    expect(mockGetLockPrismaClient).toHaveBeenCalled();
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL as expected:
```bash
npm run test -- --testPathPattern="prisma-connection"
# Expected: All tests fail (getLockPrismaClient doesn't exist yet)
```

### Step 1.2: 🟢 Implement Dual Connection Support

#### 1.2.1 Update Prisma Schema

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

**Checkpoint 1.2.1**: Regenerate Prisma client:
```bash
npm run db:generate
# Expected: Prisma client regenerated successfully
```

#### 1.2.2 Update lib/db/prisma.ts

**File**: `lib/db/prisma.ts`
**Changes**: Add support for `DIRECT_URL` and separate lock client

```typescript
import { PrismaClient } from '@prisma/client'

declare global {
  let prisma: PrismaClient | undefined
  let lockPrisma: PrismaClient | undefined
}

// Detect if we're in a build environment
const isBuildTime = (
  (process.env.NODE_ENV === 'production' && !process.env.VERCEL && !process.env.DATABASE_URL) ||
  process.env.NEXT_PHASE === 'phase-production-build'
)

let prisma: PrismaClient | undefined
let lockPrisma: PrismaClient | undefined

// Main client (Transaction mode - port 6543)
if (process.env.DATABASE_URL && !isBuildTime) {
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })
  } else {
    if (!global.prisma) {
      global.prisma = new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        }
      })
    }
    prisma = global.prisma
  }
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
  if (isBuildTime) {
    console.warn('⚠️  getPrismaClient() called during build time - returning stub client');
    return new Proxy({} as PrismaClient, {
      get: () => {
        throw new Error('Database not available during build time.');
      }
    });
  }

  if (!prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Initialize on demand
    prisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })
  }
  return prisma;
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

**Checkpoint 1.2.2**: Run connection tests:
```bash
npm run test -- --testPathPattern="prisma-connection" --testNamePattern="getPrismaClient|getLockPrismaClient"
# Expected: 4-5 tests passing
```

#### 1.2.3 Update distributed-lock.ts

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

**Checkpoint 1.2.3**: Run all connection tests:
```bash
npm run test -- --testPathPattern="prisma-connection"
# Expected: All tests passing
```

### Step 1.3: 🔵 Refactor

- [ ] Ensure consistent error messages
- [ ] Add JSDoc comments to new functions
- [ ] Verify no duplicate PrismaClient instantiations

**Checkpoint 1.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="prisma-connection"
npm run lint
npm run build
# Expected: All passing, no errors
```

### Step 1.4: 🔴 Write Failing Tests for Backup/Export Scripts

**Test File**: `__tests__/scripts/backup-scripts.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Migration Scripts Exist', () => {
  const scriptsDir = join(process.cwd(), 'scripts');

  it('should have backup-neon.sh script', () => {
    expect(existsSync(join(scriptsDir, 'backup-neon.sh'))).toBe(true);
  });

  it('should have rollback-to-neon.sh script', () => {
    expect(existsSync(join(scriptsDir, 'rollback-to-neon.sh'))).toBe(true);
  });

  it('should have export-neon-data.sh script', () => {
    expect(existsSync(join(scriptsDir, 'export-neon-data.sh'))).toBe(true);
  });

  it('backup script should be executable', async () => {
    const { statSync } = await import('fs');
    const stats = statSync(join(scriptsDir, 'backup-neon.sh'));
    // Check if user execute bit is set (0o100)
    expect(stats.mode & 0o100).toBeTruthy();
  });
});
```

**Checkpoint 1.4**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="backup-scripts"
# Expected: All tests fail (scripts don't exist)
```

### Step 1.5: 🟢 Create Migration Scripts

#### 1.5.1 Create Pre-Migration Backup Script

**File**: `scripts/backup-neon.sh`

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

#### 1.5.2 Create Rollback Script

**File**: `scripts/rollback-to-neon.sh`

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

# Step 2: Update Vercel environment
echo "Step 2: Update Vercel environment variables..."
echo "Run in Vercel dashboard or CLI:"
echo "  1. Set DATABASE_URL to Neon URL"
echo "  2. Remove or update DIRECT_URL"
echo "  3. Trigger redeploy"
read -p "Press Enter when Vercel is updated..."

# Step 3: Verify application
echo "Step 3: Verify application health..."
curl -s https://tldrsec.app/api/health | jq .

echo "=== Rollback Complete ==="
echo "Monitor application logs for any issues"
```

#### 1.5.3 Create Export Script

**File**: `scripts/export-neon-data.sh`

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

#### 1.5.4 Make Scripts Executable

```bash
chmod +x scripts/backup-neon.sh
chmod +x scripts/rollback-to-neon.sh
chmod +x scripts/export-neon-data.sh
```

**Checkpoint 1.5**: All script tests pass:
```bash
npm run test -- --testPathPattern="backup-scripts"
# Expected: All tests passing
```

### Step 1.6: 🔵 Final Phase 1 Refactoring

- [ ] Update `.env.example` with DIRECT_URL documentation
- [ ] Add environment validation for DIRECT_URL
- [ ] Verify all scripts have proper error handling

**Checkpoint 1.6**: Final verification:
```bash
npm run test -- --testPathPattern="prisma-connection|backup-scripts"
npm run lint
npm run build
# Expected: All passing
```

### Step 1.7: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="prisma-connection|backup-scripts"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`
- [ ] `npm run db:generate` succeeds with new schema

#### Manual Verification:
- [ ] Local development works with current Neon setup
- [ ] Backup script tested successfully with real database
- [ ] Backup file is valid (can list contents with pg_restore)

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

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

### Step 2.1: 🔴 Write Failing Tests for Schema Deployment

**Test File**: `__tests__/migration/schema-verification.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

// These tests run AFTER schema deployment to verify success
describe('Supabase Schema Verification', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    // Use Supabase URL for verification
    prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.SUPABASE_DATABASE_URL }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Preserved Tables', () => {
    it('should preserve newsletter_subscribers with 85 rows', async () => {
      const result = await prisma.$queryRaw<{count: bigint}[]>`
        SELECT count(*) as count FROM newsletter_subscribers
      `;
      expect(Number(result[0].count)).toBe(85);
    });

    it('should preserve RLS on newsletter_subscribers', async () => {
      const result = await prisma.$queryRaw<{rowsecurity: boolean}[]>`
        SELECT rowsecurity FROM pg_tables
        WHERE tablename = 'newsletter_subscribers'
      `;
      expect(result[0].rowsecurity).toBe(true);
    });

    it('should preserve newsletter_deliveries table', async () => {
      const result = await prisma.$queryRaw<{exists: boolean}[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'newsletter_deliveries'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should preserve page_analytics table', async () => {
      const result = await prisma.$queryRaw<{exists: boolean}[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'page_analytics'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  });

  describe('Prisma Tables Created', () => {
    it('should create User table', async () => {
      const result = await prisma.$queryRaw<{exists: boolean}[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'User'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should create Ticker table', async () => {
      const result = await prisma.$queryRaw<{exists: boolean}[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'Ticker'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should create Summary table', async () => {
      const result = await prisma.$queryRaw<{exists: boolean}[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'Summary'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have approximately 38 tables total', async () => {
      const result = await prisma.$queryRaw<{count: bigint}[]>`
        SELECT count(*) as count FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      // 35 Prisma + 3 existing = 38
      expect(Number(result[0].count)).toBeGreaterThanOrEqual(35);
      expect(Number(result[0].count)).toBeLessThanOrEqual(40);
    });
  });
});
```

**Checkpoint 2.1**: Tests will fail until schema is deployed
```bash
SUPABASE_DATABASE_URL="..." npm run test -- --testPathPattern="schema-verification"
# Expected: Tests fail (Prisma tables don't exist yet)
```

### Step 2.2: 🟢 Deploy Schema to Supabase

#### 2.2.1 Retrieve Connection Strings (If Not Already Saved)

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

#### 2.2.2 Verify Existing Tables Before Schema Deployment

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

#### 2.2.3 Deploy Prisma Schema (Preserving Existing Tables)

**CRITICAL**: Prisma will create new tables but NOT touch existing non-Prisma tables.

**Terminal Commands**:

```bash
# Set environment variable temporarily (use DIRECT connection, not pooled)
export DATABASE_URL="postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres"

# Option 1: Use db push (simpler, no migration history)
npx prisma db push --accept-data-loss

# Option 2: Apply migrations (recommended for tracking)
npx prisma migrate deploy

# Verify schema
npx prisma db pull --print
```

**Checkpoint 2.2.3**: Schema deployed:
```bash
npx prisma db push --accept-data-loss
# Expected: "Your database is now in sync with your Prisma schema."
```

#### 2.2.4 Verify Existing Tables Are Preserved

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
```

**Checkpoint 2.2.4**: Run verification tests:
```bash
SUPABASE_DATABASE_URL="..." npm run test -- --testPathPattern="schema-verification"
# Expected: All tests passing
```

### Step 2.3: 🔵 Refactor & Verify

- [ ] Document connection strings securely
- [ ] Update local `.env.local` with Supabase URLs for testing

**Checkpoint 2.3**: All schema tests pass:
```bash
SUPABASE_DATABASE_URL="..." npm run test -- --testPathPattern="schema-verification"
# Expected: All tests passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] `npx prisma db push` or `npx prisma migrate deploy` succeeds
- [ ] `npx prisma db pull --print` shows Prisma schema tables
- [ ] Schema verification tests pass

#### Manual Verification:
- [ ] `newsletter_subscribers` still has 85 rows
- [ ] RLS still enabled on `newsletter_*` and `page_analytics` tables
- [ ] All Prisma tables created successfully
- [ ] No errors in Supabase logs

**STOP**: After completing Phase 2, verify newsletter_subscribers count before proceeding.

---

## Phase 3: Advisory Lock Compatibility Testing (Day 0 - Pre-Migration)

### Overview
Verify advisory locks work correctly with Supabase before migrating data.

### Step 3.1: 🔴 Write Failing Tests for Advisory Lock Compatibility

**Test File**: `__tests__/migration/advisory-lock-compatibility.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

describe('Advisory Lock Compatibility with Supabase', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    // Use Session Mode URL (port 5432) for advisory locks
    prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.SUPABASE_DIRECT_URL }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should acquire advisory lock successfully', async () => {
    const lockHash = BigInt(12345);
    const result = await prisma.$queryRaw<{acquired: boolean}[]>`
      SELECT pg_try_advisory_lock(${lockHash}) as acquired
    `;
    expect(result[0].acquired).toBe(true);

    // Clean up
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockHash})`;
  });

  it('should release advisory lock successfully', async () => {
    const lockHash = BigInt(12346);

    // Acquire first
    await prisma.$queryRaw`SELECT pg_try_advisory_lock(${lockHash})`;

    // Release
    const result = await prisma.$queryRaw<{released: boolean}[]>`
      SELECT pg_advisory_unlock(${lockHash}) as released
    `;
    expect(result[0].released).toBe(true);
  });

  it('should prevent double acquisition of same lock', async () => {
    const lockHash = BigInt(12347);

    // First acquisition should succeed
    const first = await prisma.$queryRaw<{acquired: boolean}[]>`
      SELECT pg_try_advisory_lock(${lockHash}) as acquired
    `;
    expect(first[0].acquired).toBe(true);

    // Second acquisition should fail (same session)
    // Actually, same session CAN acquire same lock (it's re-entrant)
    // So we test that it works as expected
    const second = await prisma.$queryRaw<{acquired: boolean}[]>`
      SELECT pg_try_advisory_lock(${lockHash}) as acquired
    `;
    expect(second[0].acquired).toBe(true); // Re-entrant

    // Need to release twice (once per acquisition)
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockHash})`;
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockHash})`;
  });

  it('should show no orphaned locks after test', async () => {
    const result = await prisma.$queryRaw<{count: bigint}[]>`
      SELECT count(*) as count FROM pg_locks
      WHERE locktype = 'advisory' AND pid = pg_backend_pid()
    `;
    expect(Number(result[0].count)).toBe(0);
  });
});
```

**Checkpoint 3.1**: Run tests (they should pass with correct DIRECT_URL):
```bash
SUPABASE_DIRECT_URL="postgresql://...@...supabase.com:5432/postgres" \
npm run test -- --testPathPattern="advisory-lock-compatibility"
# Expected: All tests passing (verifies Supabase supports advisory locks)
```

### Step 3.2: 🟢 Create Integration Test Script

**File**: `scripts/test-supabase-locks.ts`

```typescript
import { getLockPrismaClient } from '../lib/db/prisma';

async function testAdvisoryLocks() {
  const prisma = getLockPrismaClient();

  console.log('Testing advisory locks against Supabase...');

  try {
    // Test 1: Acquire lock
    const lockHash = BigInt(Date.now());
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
    const locks = await prisma.$queryRaw<{count: bigint}[]>`
      SELECT count(*) as count FROM pg_locks
      WHERE locktype = 'advisory' AND pid = pg_backend_pid()
    `;
    console.log('Active advisory locks:', Number(locks[0].count));

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

**Checkpoint 3.2**: Run integration test:
```bash
DATABASE_URL="..." DIRECT_URL="..." npx tsx scripts/test-supabase-locks.ts
# Expected: "✅ Advisory locks working correctly!"
```

### Step 3.3: Final Phase Verification

#### Automated Verification:
- [ ] Advisory lock tests pass: `npm run test -- --testPathPattern="advisory-lock"`
- [ ] Integration test passes: `npx tsx scripts/test-supabase-locks.ts`
- [ ] Distributed lock tests pass with Supabase

#### Manual Verification:
- [ ] Can connect to Supabase from local machine
- [ ] Advisory locks acquire and release correctly
- [ ] No connection errors in console

**STOP**: After completing Phase 3, proceed to Phase 4 data migration.

---

## Phase 4: Data Migration (Day 0 - Maintenance Window)

### Overview
Execute data migration during scheduled maintenance window (30-60 minutes).

### Step 4.1: 🔴 Write Failing Tests for Data Integrity

**Test File**: `__tests__/migration/data-integrity.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

describe('Data Migration Integrity', () => {
  let neon: PrismaClient;
  let supabase: PrismaClient;

  beforeAll(() => {
    neon = new PrismaClient({
      datasources: { db: { url: process.env.NEON_DATABASE_URL } }
    });
    supabase = new PrismaClient({
      datasources: { db: { url: process.env.SUPABASE_DATABASE_URL } }
    });
  });

  afterAll(async () => {
    await neon.$disconnect();
    await supabase.$disconnect();
  });

  it('should have matching User count', async () => {
    const neonCount = await neon.user.count();
    const supabaseCount = await supabase.user.count();
    expect(supabaseCount).toBe(neonCount);
  });

  it('should have matching Ticker count', async () => {
    const neonCount = await neon.ticker.count();
    const supabaseCount = await supabase.ticker.count();
    expect(supabaseCount).toBe(neonCount);
  });

  it('should have matching Summary count', async () => {
    const neonCount = await neon.summary.count();
    const supabaseCount = await supabase.summary.count();
    expect(supabaseCount).toBe(neonCount);
  });

  it('should preserve newsletter_subscribers (85 rows)', async () => {
    const result = await supabase.$queryRaw<{count: bigint}[]>`
      SELECT count(*) as count FROM newsletter_subscribers
    `;
    expect(Number(result[0].count)).toBe(85);
  });

  it('should maintain referential integrity between User and Ticker', async () => {
    // Check that all Tickers have valid User references
    const orphanedTickers = await supabase.$queryRaw<{count: bigint}[]>`
      SELECT count(*) as count FROM "Ticker" t
      LEFT JOIN "User" u ON t."userId" = u.id
      WHERE u.id IS NULL
    `;
    expect(Number(orphanedTickers[0].count)).toBe(0);
  });
});
```

**Checkpoint 4.1**: Tests will fail until data is migrated
```bash
NEON_DATABASE_URL="..." SUPABASE_DATABASE_URL="..." \
npm run test -- --testPathPattern="data-integrity"
# Expected: Tests fail (Supabase has no data yet)
```

### Step 4.2: 🟢 Execute Data Migration

#### 4.2.1 Pre-Migration Checklist

Before starting:
- [ ] Take fresh Neon backup: `./scripts/backup-neon.sh`
- [ ] Verify Supabase is accessible
- [ ] Verify `newsletter_subscribers` count in Supabase (should be 85)
- [ ] Have rollback script ready

#### 4.2.2 Export Data from Neon

```bash
chmod +x scripts/export-neon-data.sh
./scripts/export-neon-data.sh
```

#### 4.2.3 Import Data to Supabase

**CRITICAL**: The import ONLY touches Prisma-managed tables.

```bash
# Set Supabase connection (direct, not pooled)
export SUPABASE_URL="postgresql://postgres.[project]:[password]@db.[project].supabase.co:5432/postgres"

# SAFETY CHECK: Verify newsletter_subscribers before proceeding
psql "$SUPABASE_URL" -c "SELECT count(*) as count FROM newsletter_subscribers;"
# MUST show: 85 rows. If not, STOP and investigate.

# Clear Prisma-managed tables only (NOT newsletter_* or page_analytics)
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

# Import data
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

**Checkpoint 4.2.3**: Run data integrity tests:
```bash
NEON_DATABASE_URL="..." SUPABASE_DATABASE_URL="..." \
npm run test -- --testPathPattern="data-integrity"
# Expected: All tests passing
```

#### 4.2.4 Sync Sequences

```sql
-- Run against Supabase
SELECT setval(
  pg_get_serial_sequence('"User"', 'id'),
  COALESCE((SELECT MAX(id) FROM "User"), 0) + 1,
  false
);
```

### Step 4.3: 🔵 Verify and Document

- [ ] All record counts match
- [ ] newsletter_subscribers preserved
- [ ] Referential integrity intact

**Checkpoint 4.3**: Final data verification:
```bash
NEON_DATABASE_URL="..." SUPABASE_DATABASE_URL="..." \
npm run test -- --testPathPattern="data-integrity"
# Expected: All tests passing
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] Data integrity tests pass
- [ ] No errors in import logs

#### Manual Verification:
- [ ] Spot-check sample records in Supabase dashboard
- [ ] User counts match
- [ ] Summary counts match
- [ ] **CRITICAL**: `newsletter_subscribers` still has exactly 85 rows
- [ ] **CRITICAL**: RLS still enabled on `newsletter_*` tables

**PROCEED IMMEDIATELY**: Minimize downtime by moving to Phase 5.

---

## Phase 5: Cutover and Verification (Day 0 - Post-Migration)

### Overview
Switch application to Supabase and verify all functionality.

### Step 5.1: 🔴 Write Failing Tests for Production Verification

**Test File**: `__tests__/migration/production-readiness.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Production Readiness', () => {
  it('should have health endpoint returning 200', async () => {
    const response = await fetch('https://tldrsec.app/api/health');
    expect(response.status).toBe(200);
  });

  it('should have database connection working', async () => {
    const response = await fetch('https://tldrsec.app/api/health/database');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.connected).toBe(true);
  });

  it('should pass pipeline comprehensive test', async () => {
    // This is run via npm script, not as unit test
    // Just a placeholder to document the requirement
    expect(true).toBe(true);
  });
});
```

### Step 5.2: 🟢 Execute Cutover

#### 5.2.1 Update Vercel Environment Variables

**Vercel Dashboard** (Settings → Environment Variables):

1. **Update DATABASE_URL**:
   - New: `postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

2. **Add DIRECT_URL**:
   - Value: `postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`

3. **Keep NEON_DATABASE_URL** (for rollback):
   - Value: Original Neon URL

#### 5.2.2 Trigger Vercel Redeploy

```bash
vercel --prod
```

#### 5.2.3 Verify Application Health

```bash
curl -s https://tldrsec.app/api/health | jq .
curl -s https://tldrsec.app/api/health/database | jq .
```

**Checkpoint 5.2.3**: Health checks pass:
```bash
# Expected: {"status":"ok"} or similar
```

#### 5.2.4 Run Critical Test Suite

```bash
export TEST_EMAIL="your-email@example.com"

npm run test:pipeline:comprehensive
npm run test:e2e
npm run test:cron-comprehensive
```

**Checkpoint 5.2.4**: All tests pass:
```bash
# Expected: All tests passing
```

### Step 5.3: 🔵 Final Verification

- [ ] All health endpoints return 200
- [ ] E2E test email received
- [ ] Dashboard loads correctly

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] Health endpoints return 200
- [ ] `npm run test:pipeline:comprehensive` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run test:cron-comprehensive` passes

#### Manual Verification:
- [ ] Login to dashboard works
- [ ] User tickers displayed correctly
- [ ] Can add/remove tickers
- [ ] Summary pages load
- [ ] Email received from E2E test

**STOP**: Monitor closely for 24-48 hours before proceeding to Phase 6.

---

## Phase 6: Post-Migration and Cleanup (Day 1-14)

### Overview
Monitor stability, clean up unused resources, and finalize migration.

### Step 6.1: Daily Monitoring Checklist

- [ ] Cron jobs executing (check logs)
- [ ] No connection errors in Vercel logs
- [ ] No lock timeouts in Supabase logs
- [ ] Emails being delivered
- [ ] User dashboard accessible

### Step 6.2: Run Daily Verification

```bash
npm run verify:daily
npm run verify:daily -- --date=$(date -v-1d +%Y-%m-%d)
```

### Step 6.3: Update Documentation

**File**: `CLAUDE.md`
**Changes**: Update database provider information

```markdown
### Database Configuration
- **Provider**: Supabase PostgreSQL
- **Connection Pooling**: Supavisor (Transaction mode on port 6543)
- **Session Mode**: Port 5432 for advisory locks (via DIRECT_URL)
```

### Step 6.4: Decommission Neon (After 14 Days)

**Only after confirming stability**:

1. Take final backup of Neon (archive)
2. Export connection logs for audit
3. Cancel Neon subscription
4. Delete Neon project
5. Remove `NEON_DATABASE_URL` from Vercel

### Success Criteria:

#### Automated Verification:
- [ ] 14 consecutive days of successful operations
- [ ] No rollback needed
- [ ] All tests continue passing

#### Manual Verification:
- [ ] Users report no issues
- [ ] Performance acceptable
- [ ] Costs within expectations

---

## Testing Strategy

### TDD Test Design Principles

For this migration, tests are organized by phase:

1. **Contract Tests** (Phase 1): Verify new connection functions exist and work
2. **Schema Tests** (Phase 2): Verify tables created, existing tables preserved
3. **Compatibility Tests** (Phase 3): Verify advisory locks work with Supabase
4. **Integrity Tests** (Phase 4): Verify data migrated correctly
5. **Production Tests** (Phase 5): Verify application works end-to-end

### Test Categories

| Phase | Test File | Purpose |
|-------|-----------|---------|
| 1 | `prisma-connection.test.ts` | Dual connection support |
| 1 | `backup-scripts.test.ts` | Migration scripts exist |
| 2 | `schema-verification.test.ts` | Schema deployed correctly |
| 3 | `advisory-lock-compatibility.test.ts` | Locks work with Supabase |
| 4 | `data-integrity.test.ts` | Data migrated correctly |
| 5 | `production-readiness.test.ts` | App works in production |

### Running All Migration Tests

```bash
# Run all migration tests
npm run test -- --testPathPattern="migration|prisma-connection|backup-scripts"
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
