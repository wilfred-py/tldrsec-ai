# Neon → Supabase Database Migration Plan

**Date**: 2025-12-19
**Status**: Draft - Awaiting Approval
**Scope**: Migrate database tables from Neon to Supabase (Auth & Cron unchanged)

## Overview

This plan migrates the application's PostgreSQL database from Neon to Supabase while keeping:
- **Clerk** for authentication (unchanged)
- **Cloudflare Workers** for cron jobs (unchanged)

## Current State Analysis

- **Neon PostgreSQL**: 35 tables in single `public` schema
- **Supabase PostgreSQL**: 3 existing tables (newsletter_subscribers, newsletter_deliveries, page_analytics)
- **Summary Model**: Per-user summaries (N summaries per filing)

### Key Discoveries:
- 5 tables have zero codebase usage and can be deleted
- Existing Supabase tables have RLS enabled and must not be overwritten
- Advisory locks require `DIRECT_URL` (session mode) not transaction mode

## Desired End State

After this plan completes:
1. All 30 application tables migrated to Supabase in `app` and `pipeline` schemas
2. Existing `public` schema tables (newsletter_*) preserved with data intact
3. Canonical summary model reducing AI costs by 90%+
4. All E2E tests passing against Supabase
5. Neon decommissioned after 1-week verification period

## What We're NOT Doing

- Migrating auth from Clerk to Supabase Auth
- Migrating cron from Cloudflare Workers to Supabase Edge Functions
- Adding RLS policies to application tables (future enhancement)
- Changing the application's data access patterns (Prisma ORM stays)

---

## Schema Organization

### Multi-Schema Architecture

| Schema | Purpose | Tables |
|--------|---------|--------|
| `public` | Existing Supabase tables (DO NOT TOUCH) | newsletter_subscribers, newsletter_deliveries, page_analytics |
| `app` | Core application data (Prisma-managed) | User, Ticker, Summary, SecFiling, etc. (11 tables) |
| `pipeline` | Pipeline infrastructure | JobQueue, JobLock, CronJobExecution, etc. (19 tables) |

### Tables to DELETE (5 unused - zero codebase references)

| Table | Reason |
|-------|--------|
| `TickerChange` | Never implemented |
| `CronJobPerformance` | Monitoring incomplete |
| `CronJobDailySummary` | Feature incomplete |
| `TierProcessingMetrics` | Not used |
| `PipelineHealthHistory` | Only mocked in tests |

---

## Resolved Questions

1. **Migration Window**: Execute **now** (immediate)
2. **Data Retention**: Keep Neon as fallback for **1 week** after observing freshly generated summaries in Supabase
3. **Supabase Project**: Already exists (confirmed via MCP) with 3 tables that must be preserved

---

## Phase 1: Database Schema & Connection Migration

**Duration**: 1 week
**Risk Level**: Medium

### Overview
Prepare Prisma schema for multi-schema Supabase, create schemas, and verify connection without data migration.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/db/supabase-connection.test.ts`

```typescript
import { PrismaClient } from '@prisma/client';

describe('Supabase Connection', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.SUPABASE_DATABASE_URL }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should connect to Supabase database', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    expect(result).toEqual([{ connected: 1 }]);
  });

  it('should have app schema created', async () => {
    const schemas = await prisma.$queryRaw`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name = 'app'
    `;
    expect(schemas).toHaveLength(1);
  });

  it('should have pipeline schema created', async () => {
    const schemas = await prisma.$queryRaw`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name = 'pipeline'
    `;
    expect(schemas).toHaveLength(1);
  });

  it('should preserve existing public.newsletter_subscribers table', async () => {
    const count = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM public.newsletter_subscribers
    `;
    expect(count[0].count).toBeGreaterThanOrEqual(121);
  });

  it('should support advisory locks via DIRECT_URL', async () => {
    const directPrisma = new PrismaClient({
      datasources: { db: { url: process.env.SUPABASE_DIRECT_URL } }
    });

    const lockResult = await directPrisma.$queryRaw`SELECT pg_try_advisory_lock(12345)`;
    const unlockResult = await directPrisma.$queryRaw`SELECT pg_advisory_unlock(12345)`;

    expect(lockResult[0].pg_try_advisory_lock).toBe(true);
    expect(unlockResult[0].pg_advisory_unlock).toBe(true);

    await directPrisma.$disconnect();
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="supabase-connection"
# Expected: 5 failing tests (connection refused or schema not found)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Create Schemas in Supabase
**Action**: Run in Supabase SQL Editor

```sql
-- Create application schemas
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS pipeline;

-- Grant access to postgres user
GRANT ALL ON SCHEMA app TO postgres;
GRANT ALL ON SCHEMA pipeline TO postgres;
GRANT USAGE ON SCHEMA app TO anon, authenticated;
GRANT USAGE ON SCHEMA pipeline TO anon, authenticated;
```

**Checkpoint 1.2.1**: Verify schemas exist:
```bash
npm run test -- --testPathPattern="supabase-connection" --testNamePattern="schema"
# Expected: 2 passing (app and pipeline schema tests)
```

#### 1.2.2 Update Prisma Schema for Multi-Schema
**File**: `prisma/schema.prisma`

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["app", "pipeline"]
}

generator client {
  provider        = "prisma-client-js"
  output          = "../node_modules/.prisma/client"
  binaryTargets   = ["native", "rhel-openssl-3.0.x"]
  previewFeatures = ["multiSchema"]
}
```

#### 1.2.3 Delete Unused Models from Schema
**File**: `prisma/schema.prisma`
Remove these 5 models:
- `TickerChange`
- `CronJobPerformance`
- `CronJobDailySummary`
- `TierProcessingMetrics`
- `PipelineHealthHistory`

#### 1.2.4 Add @@schema Directives to All Models
**File**: `prisma/schema.prisma`

Add to each model in `app` schema:
```prisma
model User {
  // ... existing fields
  @@schema("app")
}

model Ticker {
  // ... existing fields
  @@schema("app")
}
// ... repeat for: Summary, SecFiling, CikMapping, TickerMonitoring,
// RssFilingCheck, UserSubscription, AuditLog, NotificationSent, SecCompanyCache
```

Add to each model in `pipeline` schema:
```prisma
model JobQueue {
  // ... existing fields
  @@schema("pipeline")
}
// ... repeat for all 19 pipeline tables
```

**Checkpoint 1.2.4**: Prisma schema validates:
```bash
npx prisma validate
# Expected: Schema is valid
```

#### 1.2.5 Set Environment Variables
**File**: `.env.local` (and Vercel dashboard)

```bash
SUPABASE_DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&schema=app,pipeline"
SUPABASE_DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

#### 1.2.6 Push Schema to Supabase (Empty Tables)
```bash
# Generate Prisma client with multi-schema support
npx prisma generate

# Push schema to Supabase (creates empty tables in app/pipeline schemas)
DATABASE_URL=$SUPABASE_DATABASE_URL DIRECT_URL=$SUPABASE_DIRECT_URL npx prisma db push
```

**Checkpoint 1.2.6**: All connection tests pass:
```bash
npm run test -- --testPathPattern="supabase-connection"
# Expected: 5 passing
```

### Step 1.3: 🔵 Refactor

- [ ] Extract Supabase URLs into typed config
- [ ] Add connection retry logic
- [ ] Add connection health check endpoint

**Checkpoint 1.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="supabase-connection"
# Expected: 5 passing
```

### Step 1.4: Final Phase 1 Verification

#### Automated Verification:
- [ ] Schema validation passes: `npx prisma validate`
- [ ] Connection tests pass: `npm run test -- --testPathPattern="supabase-connection"`
- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:
- [ ] Supabase dashboard shows `app` and `pipeline` schemas with empty tables
- [ ] `public` schema tables unchanged (newsletter_subscribers has 121+ rows)
- [ ] No errors in Supabase logs

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Data Migration

**Duration**: 3-5 days
**Dependency**: Phase 1 complete

### Overview
Export data from Neon, transform for multi-schema, import to Supabase, verify integrity.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/db/data-migration.test.ts`

```typescript
describe('Data Migration Integrity', () => {
  it('should have matching User count between Neon and Supabase', async () => {
    const neonCount = await neonPrisma.user.count();
    const supabaseCount = await supabasePrisma.user.count();
    expect(supabaseCount).toBe(neonCount);
  });

  it('should have matching Ticker count', async () => {
    const neonCount = await neonPrisma.ticker.count();
    const supabaseCount = await supabasePrisma.ticker.count();
    expect(supabaseCount).toBe(neonCount);
  });

  it('should have matching Summary count', async () => {
    const neonCount = await neonPrisma.summary.count();
    const supabaseCount = await supabasePrisma.summary.count();
    expect(supabaseCount).toBe(neonCount);
  });

  it('should preserve user-ticker relationships', async () => {
    const neonUser = await neonPrisma.user.findFirst({
      include: { tickers: true }
    });
    const supabaseUser = await supabasePrisma.user.findUnique({
      where: { id: neonUser.id },
      include: { tickers: true }
    });
    expect(supabaseUser.tickers.length).toBe(neonUser.tickers.length);
  });

  it('should preserve JobQueue data in pipeline schema', async () => {
    const neonCount = await neonPrisma.jobQueue.count();
    const supabaseCount = await supabasePrisma.jobQueue.count();
    expect(supabaseCount).toBe(neonCount);
  });
});
```

**Checkpoint 2.1**: Tests fail (no data in Supabase yet):
```bash
npm run test -- --testPathPattern="data-migration"
# Expected: 5 failing (counts don't match)
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Create Neon Backup
```bash
# Full backup with schema
pg_dump $NEON_DATABASE_URL --format=custom --file=neon_backup_$(date +%Y%m%d).dump

# Data-only export for migration
pg_dump $NEON_DATABASE_URL \
  --data-only \
  --exclude-table='"TickerChange"' \
  --exclude-table='"CronJobPerformance"' \
  --exclude-table='"CronJobDailySummary"' \
  --exclude-table='"TierProcessingMetrics"' \
  --exclude-table='"PipelineHealthHistory"' \
  --file=neon_data_export.sql
```

**Checkpoint 2.2.1**: Backup file exists and has content:
```bash
ls -lh neon_backup_*.dump neon_data_export.sql
# Expected: Both files exist, data export > 1MB
```

#### 2.2.2 Create Schema Transform Script
**File**: `scripts/transform-for-supabase.sh`

```bash
#!/bin/bash
# Transform Neon export for Supabase multi-schema

INPUT_FILE="neon_data_export.sql"
OUTPUT_FILE="supabase_import.sql"

cp $INPUT_FILE $OUTPUT_FILE

# App schema tables
for table in User Ticker Summary SecFiling CikMapping TickerMonitoring RssFilingCheck UserSubscription AuditLog NotificationSent SecCompanyCache; do
  sed -i "s/INSERT INTO \"$table\"/INSERT INTO app.\"$table\"/g" $OUTPUT_FILE
  sed -i "s/COPY public.\"$table\"/COPY app.\"$table\"/g" $OUTPUT_FILE
done

# Pipeline schema tables
for table in JobQueue JobProgress JobLock SecFetchAttempt FilingContentCache CronJobExecution CronJobMetrics CronJobAlert TierProcessingExecution CronExecutionContext SummaryCacheAccess SummaryEmailDelivery CacheInvalidation ErrorAlert MonitoringThreshold DailyWaitlistCache DailyPipelineVerification FilingUsage UsagePeriod; do
  sed -i "s/INSERT INTO \"$table\"/INSERT INTO pipeline.\"$table\"/g" $OUTPUT_FILE
  sed -i "s/COPY public.\"$table\"/COPY pipeline.\"$table\"/g" $OUTPUT_FILE
done

echo "Transformed $INPUT_FILE -> $OUTPUT_FILE"
```

#### 2.2.3 Import Data to Supabase
```bash
# Run transform
chmod +x scripts/transform-for-supabase.sh
./scripts/transform-for-supabase.sh

# Import to Supabase
psql $SUPABASE_DIRECT_URL < supabase_import.sql
```

**Checkpoint 2.2.3**: Data migration tests pass:
```bash
npm run test -- --testPathPattern="data-migration"
# Expected: 5 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Create automated migration script with rollback
- [ ] Add row count comparison report
- [ ] Log migration duration and stats

**Checkpoint 2.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="data-migration"
# Expected: 5 passing
```

### Step 2.4: Final Phase 2 Verification

#### Automated Verification:
- [ ] Data migration tests pass: `npm run test -- --testPathPattern="data-migration"`
- [ ] All row counts match between Neon and Supabase
- [ ] Foreign key relationships preserved

#### Manual Verification:
- [ ] Spot-check 5 random users in Supabase dashboard
- [ ] Verify summary content matches for 3 random filings
- [ ] Confirm `public.newsletter_subscribers` still has 121+ rows

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Application Cutover

**Duration**: 1-2 days
**Dependency**: Phase 2 complete

### Overview
Switch application to use Supabase, verify all functionality, keep Neon as fallback.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/integration/supabase-cutover.test.ts`

```typescript
describe('Supabase Cutover', () => {
  it('should use Supabase for new user creation', async () => {
    const user = await createTestUser();

    // Verify in Supabase
    const supabaseUser = await supabasePrisma.user.findUnique({
      where: { id: user.id }
    });
    expect(supabaseUser).toBeTruthy();

    // Should NOT be in Neon (we're writing to Supabase now)
    const neonUser = await neonPrisma.user.findUnique({
      where: { id: user.id }
    });
    expect(neonUser).toBeNull();
  });

  it('should process new filings in Supabase', async () => {
    // Trigger filing discovery
    const result = await triggerFilingDiscovery();

    // Verify new SecFiling in Supabase
    const filing = await supabasePrisma.secFiling.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    expect(filing.createdAt).toBeAfter(cutoverTime);
  });

  it('should generate summaries in Supabase', async () => {
    const summary = await supabasePrisma.summary.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    expect(summary.createdAt).toBeAfter(cutoverTime);
  });
});
```

**Checkpoint 3.1**: Tests fail (still using Neon):
```bash
npm run test -- --testPathPattern="supabase-cutover"
# Expected: 3 failing
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Update Vercel Environment Variables
```bash
# In Vercel Dashboard > Settings > Environment Variables
DATABASE_URL=$SUPABASE_DATABASE_URL
DIRECT_URL=$SUPABASE_DIRECT_URL

# Keep Neon for rollback
NEON_DATABASE_URL=<existing-neon-url>
```

#### 3.2.2 Deploy to Vercel
```bash
vercel --prod
```

**Checkpoint 3.2.2**: Application running on Supabase:
```bash
curl https://tldrsec.app/api/health
# Expected: { "status": "ok", "database": "connected" }
```

#### 3.2.3 Trigger Cron Job
Wait for Cloudflare Worker to trigger or manually invoke:
```bash
curl -X POST https://tldrsec.app/api/cron/tier-aware \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Checkpoint 3.2.3**: Cutover tests pass:
```bash
npm run test -- --testPathPattern="supabase-cutover"
# Expected: 3 passing
```

### Step 3.3: 🔵 Refactor

- [ ] Add database source indicator to health endpoint
- [ ] Add monitoring for Supabase connection pool
- [ ] Document rollback procedure

**Checkpoint 3.3**: All tests pass:
```bash
npm run test
# Expected: All tests passing
```

### Step 3.4: Final Phase 3 Verification

#### Automated Verification:
- [ ] All unit tests pass: `npm run test`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] Pipeline tests pass: `npm run test:pipeline:comprehensive`
- [ ] Cron tests pass: `npm run test:cron-comprehensive`

#### Manual Verification:
- [ ] Dashboard loads and displays user data
- [ ] New summary email received for test filing
- [ ] Cron job executes successfully every 10 minutes
- [ ] No errors in Vercel logs
- [ ] No errors in Supabase logs

**STOP**: Await manual confirmation. Begin 1-week observation period before Phase 4.

---

## Phase 4: Summary Architecture Optimization (Canonical Model)

**Duration**: 2-3 weeks
**Dependency**: Phase 3 complete + 1 week of successful operation

### Overview
Replace per-user Summary model with canonical CanonicalSummary model to reduce AI costs by 90%+.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/services/canonical-summary.test.ts`

```typescript
describe('CanonicalSummary', () => {
  describe('getOrCreateSummary', () => {
    it('should create new canonical summary for unseen filing', async () => {
      const filing = createMockFiling({ url: 'https://sec.gov/new-filing' });

      const summary = await getOrCreateSummary(filing);

      expect(summary.filingUrl).toBe(filing.url);
      expect(summary.content).toBeTruthy();
    });

    it('should return existing summary for same filing URL', async () => {
      const filing = createMockFiling({ url: 'https://sec.gov/existing-filing' });

      // Create first
      const first = await getOrCreateSummary(filing);
      // Request again
      const second = await getOrCreateSummary(filing);

      expect(second.id).toBe(first.id);
      expect(second.content).toBe(first.content);
    });

    it('should NOT call AI API for cached summary', async () => {
      const filing = createMockFiling({ url: 'https://sec.gov/cached-filing' });

      // Create first (calls AI)
      await getOrCreateSummary(filing);

      // Reset mock
      mockOpenRouter.mockClear();

      // Request again (should NOT call AI)
      await getOrCreateSummary(filing);

      expect(mockOpenRouter).not.toHaveBeenCalled();
    });
  });

  describe('SummaryDelivery', () => {
    it('should create delivery record for each user', async () => {
      const summary = await prisma.canonicalSummary.create({
        data: { filingUrl: 'test', formType: '10-K', companyName: 'Test', content: 'test', tokenCount: 100, modelUsed: 'test' }
      });

      await deliverSummary(summary, 'user-1', 'ticker-1');
      await deliverSummary(summary, 'user-2', 'ticker-2');

      const deliveries = await prisma.summaryDelivery.findMany({
        where: { canonicalSummaryId: summary.id }
      });

      expect(deliveries).toHaveLength(2);
    });

    it('should track delivery method correctly', async () => {
      const delivery = await prisma.summaryDelivery.create({
        data: {
          canonicalSummaryId: 'test',
          userId: 'test',
          tickerId: 'test',
          deliveryMethod: 'EMAIL'
        }
      });

      expect(delivery.deliveryMethod).toBe('EMAIL');
    });
  });
});
```

**Checkpoint 4.1**: Tests fail (models don't exist):
```bash
npm run test -- --testPathPattern="canonical-summary"
# Expected: 5 failing (CanonicalSummary not found)
```

### Step 4.2: 🟢 Implement to Pass Tests

#### 4.2.1 Add CanonicalSummary Model
**File**: `prisma/schema.prisma`

```prisma
model CanonicalSummary {
  id          String   @id @default(cuid())
  filingUrl   String   @unique
  formType    String
  companyName String
  content     String   @db.Text
  tokenCount  Int
  modelUsed   String
  generatedAt DateTime @default(now())

  deliveries  SummaryDelivery[]

  @@schema("app")
  @@index([filingUrl])
}

model SummaryDelivery {
  id                  String   @id @default(cuid())
  canonicalSummaryId  String
  userId              String
  tickerId            String
  deliveredAt         DateTime @default(now())
  deliveryMethod      DeliveryMethod

  canonicalSummary    CanonicalSummary @relation(fields: [canonicalSummaryId], references: [id])
  user                User @relation(fields: [userId], references: [id])
  ticker              Ticker @relation(fields: [tickerId], references: [id])

  @@schema("app")
  @@index([userId])
  @@index([canonicalSummaryId])
}

enum DeliveryMethod {
  EMAIL
  DASHBOARD
}
```

**Checkpoint 4.2.1**: Schema validates:
```bash
npx prisma validate
npx prisma generate
# Expected: Success
```

#### 4.2.2 Run Migration
```bash
npx prisma migrate dev --name add_canonical_summary
```

#### 4.2.3 Implement getOrCreateSummary
**File**: `lib/ai/canonical-summary-service.ts`

```typescript
export async function getOrCreateSummary(filing: SecFiling): Promise<CanonicalSummary> {
  // Check cache first
  const existing = await prisma.canonicalSummary.findUnique({
    where: { filingUrl: filing.secUrl }
  });

  if (existing) {
    return existing;
  }

  // Generate new summary (only once per filing)
  const content = await generateWithOpenRouter(filing);

  return prisma.canonicalSummary.create({
    data: {
      filingUrl: filing.secUrl,
      formType: filing.formType,
      companyName: filing.companyName || 'Unknown',
      content,
      tokenCount: countTokens(content),
      modelUsed: 'x-ai/grok-4.1-fast'
    }
  });
}

export async function deliverSummary(
  summary: CanonicalSummary,
  userId: string,
  tickerId: string,
  method: DeliveryMethod = 'EMAIL'
): Promise<SummaryDelivery> {
  return prisma.summaryDelivery.create({
    data: {
      canonicalSummaryId: summary.id,
      userId,
      tickerId,
      deliveryMethod: method
    }
  });
}
```

**Checkpoint 4.2.3**: Tests pass:
```bash
npm run test -- --testPathPattern="canonical-summary"
# Expected: 5 passing
```

#### 4.2.4 Migrate Existing Summaries
```sql
-- Deduplicate existing summaries into canonical format
INSERT INTO app."CanonicalSummary" (id, "filingUrl", "formType", "companyName", content, "tokenCount", "modelUsed", "generatedAt")
SELECT DISTINCT ON ("filingUrl")
  gen_random_uuid()::text,
  "filingUrl",
  "filingType",
  COALESCE((SELECT t."companyName" FROM app."Ticker" t WHERE t.id = s."tickerId"), 'Unknown'),
  "summaryText",
  COALESCE("tokensUsed", 0),
  COALESCE(model, 'x-ai/grok-4.1-fast'),
  "createdAt"
FROM app."Summary" s
WHERE "filingUrl" IS NOT NULL
ORDER BY "filingUrl", "createdAt" DESC;

-- Create delivery records
INSERT INTO app."SummaryDelivery" (id, "canonicalSummaryId", "userId", "tickerId", "deliveredAt", "deliveryMethod")
SELECT
  gen_random_uuid()::text,
  cs.id,
  t."userId",
  s."tickerId",
  s."createdAt",
  'EMAIL'
FROM app."Summary" s
JOIN app."CanonicalSummary" cs ON s."filingUrl" = cs."filingUrl"
JOIN app."Ticker" t ON s."tickerId" = t.id;
```

**Checkpoint 4.2.4**: Migration complete:
```sql
SELECT COUNT(*) FROM app."CanonicalSummary";
SELECT COUNT(*) FROM app."SummaryDelivery";
-- Expected: CanonicalSummary count < Summary count (deduplicated)
```

#### 4.2.5 Update Pipeline to Use Canonical Model
**File**: `lib/cron/handlers/summarize-handler.ts`

Update to use `getOrCreateSummary` instead of creating per-user summaries.

**Checkpoint 4.2.5**: Pipeline E2E test passes:
```bash
npm run test:pipeline:comprehensive
# Expected: All passing
```

### Step 4.3: 🔵 Refactor

- [ ] Add cache hit metrics tracking
- [ ] Add cost comparison logging
- [ ] Remove old Summary creation code paths

**Checkpoint 4.3**: All tests pass:
```bash
npm run test
npm run test:e2e
# Expected: All passing
```

### Step 4.4: Final Phase 4 Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] Pipeline tests pass: `npm run test:pipeline:comprehensive`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] New filing generates only ONE CanonicalSummary
- [ ] Multiple users receive same summary content
- [ ] OpenRouter dashboard shows reduced API calls
- [ ] Dashboard displays summaries correctly

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Cleanup & Decommission

**Duration**: 1 week
**Dependency**: Phase 4 complete + 1 week successful operation

### Overview
Remove deprecated code, drop old Summary table, decommission Neon.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cleanup/deprecated-code.test.ts`

```typescript
describe('Deprecated Code Removal', () => {
  it('should not have old Summary model in schema', () => {
    expect(() => prisma.summary).toThrow();
  });

  it('should not have enhancedCache module', async () => {
    await expect(import('@/lib/ai/enhancedCache')).rejects.toThrow();
  });

  it('should not have async-filing-processor', async () => {
    await expect(import('@/lib/workers/async-filing-processor')).rejects.toThrow();
  });
});
```

### Step 5.2: 🟢 Implement to Pass Tests

#### 5.2.1 Remove Old Summary Model
**File**: `prisma/schema.prisma`

Delete the `Summary` model (keep `CanonicalSummary`).

#### 5.2.2 Drop Old Summary Table
```sql
-- Only after 2 weeks of successful CanonicalSummary operation
DROP TABLE IF EXISTS app."Summary" CASCADE;
```

#### 5.2.3 Delete Deprecated Files
```bash
rm lib/workers/async-filing-processor.ts
rm lib/workers/worker.ts
rm lib/ai/enhancedCache.ts
rm services/filing/enhancedFilingService.ts
```

#### 5.2.4 Decommission Neon
1. Export final backup from Neon
2. Remove `NEON_DATABASE_URL` from Vercel
3. Cancel Neon subscription

### Step 5.3: Final Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Application fully functional on Supabase
- [ ] No references to Neon in codebase
- [ ] Neon subscription cancelled

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Makes failures easier to diagnose
2. **Descriptive Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on inputs/outputs

### Test Categories

1. **Connection Tests**: Verify database connectivity and schema
2. **Migration Tests**: Verify data integrity after migration
3. **Cutover Tests**: Verify application writes to correct database
4. **Canonical Summary Tests**: Verify deduplication logic
5. **Cleanup Tests**: Verify deprecated code removed

### Checkpoint Frequency

- **Minimum 3 checkpoints per phase**: Red, Green, Refactor
- **Maximum gap**: 30 minutes of implementation work

---

## Rollback Plan

### Phase 1-3 Rollback (Database)
```bash
# Switch back to Neon
vercel env rm DATABASE_URL
vercel env rm DIRECT_URL
vercel env add DATABASE_URL $NEON_DATABASE_URL
vercel env add DIRECT_URL $NEON_DIRECT_URL
vercel --prod
```

### Phase 4 Rollback (Canonical Summary)
```bash
# Revert to old Summary model
git revert <canonical-summary-commits>
npx prisma migrate deploy
vercel --prod
```

---

## Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1: Schema & Connection | 1 week | Supabase schemas ready |
| Phase 2: Data Migration | 3-5 days | All data in Supabase |
| Phase 3: Application Cutover | 1-2 days | App running on Supabase |
| *Observation Period* | 1 week | Verify stability |
| Phase 4: Canonical Summary | 2-3 weeks | 90% AI cost reduction |
| *Observation Period* | 1 week | Verify stability |
| Phase 5: Cleanup | 1 week | Neon decommissioned |
| **Total** | **7-9 weeks** | |

---

## Cost Impact

| Service | Current | After Migration |
|---------|---------|-----------------|
| Neon PostgreSQL | ~$25/mo | $0 |
| Supabase PostgreSQL | $0 | ~$25/mo |
| OpenRouter (AI) | ~$50-100/mo | ~$5-10/mo |
| **Total** | **~$75-125/mo** | **~$30-35/mo** |

**Savings**: ~$45-90/month (60-70% reduction)

---

## Approval Checklist

Before proceeding:

- [x] Supabase project ready (confirmed via MCP - 3 existing tables)
- [x] Migration window agreed (now)
- [x] Neon retention period agreed (1 week after fresh summaries verified)
- [ ] Neon backup strategy confirmed
- [ ] Rollback procedure understood
- [ ] TDD approach agreed
- [ ] Phase gates understood (manual verification required between phases)
