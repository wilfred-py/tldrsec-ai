# Neon to Supabase Migration: Options Analysis

**Date**: 2025-12-09 08:36:18 AEDT
**Git Commit**: 3c336c037671f06cfaaf69e4d959153609e145e2
**Branch**: fix/fetch-job-processing-race-condition
**Repository**: tldrsec-ai

## Overview

This document analyzes the remaining open questions from the Neon-to-Supabase migration research, providing detailed pros/cons for each option to enable informed decision-making.

## Open Question 1: Advisory Lock Strategy

**Question**: Keep session pooler OR refactor to row-level locks?

### Current State

The codebase uses PostgreSQL advisory locks extensively in [lib/db/distributed-lock.ts](../../lib/db/distributed-lock.ts) for:
- **User processing locks** (~5-100 per 10-minute cron cycle)
- **Filing retrieval locks** (~10-50 per hour)
- **Cache update locks** (~10-50 per hour)

Advisory locks are session-based and **require Session Mode pooling** to work correctly.

---

### Option 1A: Use Session Mode Pooler (Port 5432)

**Description**: Configure Supabase to use Session Mode pooling, which maintains persistent connections and preserves session state.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Zero code changes** | No refactoring of distributed-lock.ts required |
| **Proven reliability** | Advisory locks have worked reliably in production |
| **Atomic acquisition** | `pg_try_advisory_lock()` is a single atomic operation |
| **Session-scoped lifecycle** | Locks automatically released on disconnect |
| **Cross-table coordination** | Same lock can coordinate operations across multiple tables |
| **Auto-renewal works** | Current renewal logic remains compatible |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Fewer pooled connections** | Session mode creates direct connection per client (up to Pool Size) |
| **Resource usage** | Each serverless function holds connection longer |
| **Connection queuing** | May queue clients for up to 1 minute when pool exhausted |
| **Potential cost increase** | May need larger database instance for connection capacity |
| **Port 5432 required** | Must use different port than standard transaction mode |

#### Configuration

```bash
# Environment variables for Session Mode
DATABASE_URL="postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?connection_limit=10"
```

#### Risk Assessment: LOW
- Advisory locks continue working as-is
- Main risk is connection pool exhaustion under high load

---

### Option 1B: Refactor to Transaction-Level Advisory Locks

**Description**: Replace session-level `pg_advisory_lock()` with transaction-level `pg_advisory_xact_lock()` which auto-releases at transaction end.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Works with Transaction Mode** | Compatible with port 6543 for better connection efficiency |
| **Auto-release guarantee** | Locks automatically released when transaction commits/rolls back |
| **No orphaned locks** | Cannot leave stale locks even if process crashes |
| **Better for serverless** | Transaction mode is recommended for Vercel |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Significant refactoring** | Requires rewriting distributed-lock.ts (2-3 days) |
| **Operation boundaries change** | Locks only held during single transaction |
| **Auto-renewal not possible** | Cannot extend lock beyond transaction |
| **Testing complexity** | All lock-dependent code paths need retesting |
| **Breaking change risk** | Could introduce race conditions if not done carefully |

#### Code Change Example

```typescript
// Current: Session-level lock (persists across transactions)
await tx.$queryRaw`SELECT pg_try_advisory_lock(${lockHash})`;
// ... multiple queries ...
await tx.$queryRaw`SELECT pg_advisory_unlock(${lockHash})`;

// Refactored: Transaction-level lock (auto-releases)
await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockHash})`;
// ... all operations must be in same transaction ...
// Lock automatically released on commit/rollback
```

#### Risk Assessment: MEDIUM-HIGH
- Requires careful analysis of all lock boundaries
- Long-running operations may fail if they exceed transaction timeout

---

### Option 1C: Refactor to Row-Level Locks (Database Table Locking)

**Description**: Replace advisory locks entirely with row-level locking using `SELECT FOR UPDATE` on the existing `JobLock` table.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Database portability** | Works on any SQL database (MySQL, SQLite, etc.) |
| **Simpler pooling** | No session-state dependencies |
| **Visible monitoring** | All locks visible in standard `pg_stat_activity` |
| **Works with Transaction Mode** | Compatible with port 6543 |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Requires existing row** | Must upsert lock record before acquiring |
| **Slower acquisition** | Multiple queries vs single atomic advisory lock |
| **Deadlock potential** | Multiple row locks can create circular dependencies |
| **More complex cleanup** | Need to handle orphaned rows explicitly |
| **Prisma limitation** | `findFirst` doesn't support `FOR UPDATE` natively |
| **Significant refactoring** | 2-3 days of development + testing |

#### Code Change Example

```typescript
// Current: Advisory lock (atomic, session-scoped)
SELECT pg_try_advisory_lock(${lockHash})

// Refactored: Row-level lock with upsert
// Step 1: Ensure row exists
await tx.jobLock.upsert({
  where: { lockName },
  create: { lockName, acquiredBy: null, released: true, ... },
  update: {}
});

// Step 2: Try to acquire with SELECT FOR UPDATE
const result = await tx.$queryRaw`
  SELECT * FROM "JobLock"
  WHERE "lockName" = ${lockName}
  AND ("released" = true OR "expiresAt" < NOW())
  FOR UPDATE SKIP LOCKED
`;

// Step 3: Update if acquired
if (result.length > 0) {
  await tx.jobLock.update({
    where: { id: result[0].id },
    data: { acquiredBy: instanceId, released: false, ... }
  });
}
```

#### Risk Assessment: HIGH
- Major refactoring effort
- Requires careful deadlock prevention
- More failure modes to handle

---

### Option 1D: Hybrid Approach (Dual Connection Strategy)

**Description**: Use Transaction Mode (port 6543) for regular API queries and Session Mode (port 5432) for operations requiring advisory locks.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Best of both worlds** | Efficient pooling for most queries, session state when needed |
| **Minimal code changes** | Only need to route lock operations to different connection |
| **Gradual migration** | Can refactor locks later if needed |
| **Prisma native support** | Uses `directUrl` feature for secondary connection |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Two connection pools** | More complex connection management |
| **Environment complexity** | Two database URLs to manage |
| **Connection leaks risk** | Must ensure lock connections are properly released |
| **Higher resource usage** | Maintaining two pools uses more connections |

#### Configuration

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Transaction mode (port 6543)
  directUrl = env("DIRECT_URL")        // Session mode for locks (port 5432)
}
```

```typescript
// lib/db/distributed-lock.ts modification
const lockPrisma = new PrismaClient({
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL
  }
});

// Use lockPrisma for all advisory lock operations
```

#### Risk Assessment: LOW-MEDIUM
- Moderate code changes required
- Need to carefully manage two connection pools

---

### Recommendation

| Criteria | 1A: Session Mode | 1B: Transaction Locks | 1C: Row Locks | 1D: Hybrid |
|----------|------------------|----------------------|---------------|------------|
| **Effort** | None | High | High | Low |
| **Risk** | Low | Medium-High | High | Low-Medium |
| **Performance** | Good | Better | Worse | Best |
| **Maintainability** | Best | Good | Good | Good |
| **Serverless Optimized** | No | Yes | Yes | Partial |

**Recommended: Option 1D (Hybrid Approach)** for immediate migration, with potential future refactor to 1B if connection pooling becomes a bottleneck.

---

## Open Question 2: Downtime Window

**Question**: Is zero-downtime migration required?

### Current State Assessment

Based on the research, the codebase serves:
- **User dashboard**: Authentication and ticker management
- **Cron jobs**: SEC filing monitoring every 10 minutes
- **Email notifications**: Filing summary delivery

---

### Option 2A: Scheduled Downtime Window

**Description**: Plan a maintenance window (e.g., 30-60 minutes) during low-traffic period for migration.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Simplest approach** | Standard pg_dump/pg_restore workflow |
| **Lowest risk** | No dual-write complexity or sync issues |
| **Full data consistency** | Complete point-in-time snapshot |
| **Fastest execution** | No overhead from continuous sync |
| **Easiest rollback** | Simply switch back to Neon if issues |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **User impact** | Users cannot access dashboard during migration |
| **Missed filings** | 1-6 missed cron cycles (10-60 minutes) |
| **Email delays** | Filing summaries delayed until migration complete |
| **Coordination needed** | Requires announcement to users |

#### Recommended Window

```
Best time: Sunday 2-4 AM local time (lowest traffic)
Duration: 30-60 minutes
Process:
1. Disable Cloudflare cron worker
2. Put app in maintenance mode
3. Run pg_dump from Neon
4. Restore to Supabase
5. Update Vercel environment variables
6. Test critical paths
7. Re-enable cron worker
8. Remove maintenance mode
```

#### Risk Assessment: LOW

---

### Option 2B: Zero-Downtime with Logical Replication

**Description**: Set up PostgreSQL logical replication from Neon to Supabase, then perform a quick cutover.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Near-zero downtime** | Only seconds of read-only mode during cutover |
| **Continuous sync** | Real-time data replication during migration |
| **Validation time** | Can verify Supabase data before cutover |
| **Gradual rollout** | Can route percentage of traffic to new DB |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Higher complexity** | Requires publication/subscription setup |
| **Sequence sync required** | Must manually sync sequence values |
| **No DDL replication** | Schema changes must be applied manually |
| **Network configuration** | Neon NAT Gateway IPs must be allowed |
| **Cost during sync** | Running both databases simultaneously |
| **Longer preparation** | Days to weeks of sync before cutover |

#### Process

```sql
-- On Neon (source)
CREATE PUBLICATION migration_pub FOR TABLE
  "User", "Ticker", "Summary", "JobQueue", "JobLock",
  "DailyPipelineVerification", "DailyWaitlistCache",
  "RssFilingCheck", "TickerMonitoring";

-- On Supabase (destination)
CREATE SUBSCRIPTION migration_sub
CONNECTION 'postgresql://...'
PUBLICATION migration_pub;
```

#### Risk Assessment: MEDIUM

---

### Option 2C: Blue-Green with Feature Flag

**Description**: Write to both databases simultaneously, gradually shift reads using feature flags.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Instant rollback** | Simply flip flag back to Neon |
| **Gradual validation** | Test with subset of users first |
| **Zero downtime** | No service interruption at all |
| **A/B comparison** | Can compare query performance |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Dual-write complexity** | All write paths need modification |
| **Consistency challenges** | Potential for drift between databases |
| **Significant development** | 3-5 days of implementation |
| **Transaction boundaries** | Complex to maintain ACID across both |

#### Risk Assessment: HIGH (complexity not warranted for this migration)

---

### Recommendation

| Criteria | 2A: Scheduled | 2B: Logical Replication | 2C: Blue-Green |
|----------|---------------|------------------------|----------------|
| **Effort** | Low | Medium | High |
| **Risk** | Low | Medium | High |
| **Downtime** | 30-60 min | ~0 | None |
| **Complexity** | Low | Medium | Very High |
| **Best for** | Small-Medium DB | Large DB | Critical systems |

**Recommended: Option 2A (Scheduled Downtime)** for this migration given:
- Database is relatively small (~11 tables to migrate)
- User base is still in early stages
- Cron jobs can tolerate 30-60 min gap
- Simplicity reduces migration risk

**Alternative**: Option 2B if database grows significantly before migration.

---

## Open Question 3: Data Export Method

**Question**: pg_dump vs Prisma-based migration script?

### Current State

- **11 essential tables** to migrate (+ 2 maybe)
- **17+ tables** to skip (monitoring, audit, etc.)
- Tables have relationships (foreign keys)
- JSONB columns in multiple tables

---

### Option 3A: pg_dump with Table Selection

**Description**: Use PostgreSQL's native pg_dump with selective table export.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Native reliability** | Bundled with PostgreSQL, guaranteed compatibility |
| **Selective export** | `--table` and `--exclude-table` flags |
| **Handles foreign keys** | Correct ordering for referential integrity |
| **Fast execution** | Optimized for bulk data transfer |
| **Parallel support** | `-j` flag for multi-threaded dump/restore |
| **Data + schema** | Complete table structure with constraints |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **All-or-nothing** | No record-level filtering within tables |
| **Connection string format** | Must use direct connection, not pooled |
| **Binary format learning curve** | Custom format requires pg_restore |

#### Command

```bash
# Export selected tables
pg_dump $NEON_DB_URL \
  -Fd -j4 \
  --clean --if-exists \
  --no-owner --no-privileges \
  --table="User" \
  --table="Ticker" \
  --table="Summary" \
  --table="JobQueue" \
  --table="JobLock" \
  --table="DailyPipelineVerification" \
  --table="DailyWaitlistCache" \
  --table="RssFilingCheck" \
  --table="TickerMonitoring" \
  -f ./dump_dir

# Restore to Supabase
pg_restore -d $SUPABASE_DB_URL \
  -j4 --clean --if-exists --no-owner \
  ./dump_dir
```

#### Risk Assessment: LOW

---

### Option 3B: Prisma-Based Migration Script

**Description**: Write a TypeScript script using Prisma to read from Neon and write to Supabase.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Fine-grained control** | Filter specific records (e.g., only active users) |
| **Data transformation** | Can modify data during migration |
| **Type safety** | TypeScript catches errors at compile time |
| **Custom logic** | Handle edge cases programmatically |
| **Progress tracking** | Easy to add logging and resume capability |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Development time** | 1-2 days to write and test script |
| **Slower execution** | Row-by-row operations vs bulk transfer |
| **Memory constraints** | Large tables may cause OOM issues |
| **FK ordering** | Must manually handle dependency order |
| **Two Prisma clients** | Need separate clients for source/dest |

#### Example Script

```typescript
// scripts/migrate-to-supabase.ts
import { PrismaClient as NeonPrisma } from '@prisma/client';

const neon = new NeonPrisma({
  datasource: { url: process.env.NEON_DATABASE_URL }
});

const supabase = new NeonPrisma({
  datasource: { url: process.env.SUPABASE_DATABASE_URL }
});

async function migrateTable<T>(
  tableName: string,
  source: () => Promise<T[]>,
  dest: (data: T[]) => Promise<void>,
  batchSize = 1000
) {
  console.log(`Migrating ${tableName}...`);
  const data = await source();

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await dest(batch);
    console.log(`  ${i + batch.length}/${data.length}`);
  }
}

async function main() {
  // Order matters for foreign keys
  await migrateTable('User',
    () => neon.user.findMany(),
    (data) => supabase.user.createMany({ data, skipDuplicates: true })
  );

  await migrateTable('Ticker',
    () => neon.ticker.findMany(),
    (data) => supabase.ticker.createMany({ data, skipDuplicates: true })
  );

  // ... continue for other tables
}
```

#### Risk Assessment: MEDIUM

---

### Option 3C: Hybrid (pg_dump + Prisma Cleanup)

**Description**: Use pg_dump for bulk data, then Prisma script for cleanup/transformation.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Speed of pg_dump** | Fast bulk transfer |
| **Flexibility of Prisma** | Post-migration data cleanup |
| **Best of both** | Efficient + programmable |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Two-step process** | More complex workflow |
| **Cleanup may fail** | Need rollback plan for each step |

#### Risk Assessment: LOW-MEDIUM

---

### Recommendation

| Criteria | 3A: pg_dump | 3B: Prisma Script | 3C: Hybrid |
|----------|-------------|-------------------|------------|
| **Speed** | Fast | Slow | Fast |
| **Flexibility** | Low | High | High |
| **Reliability** | High | Medium | High |
| **Development time** | None | 1-2 days | 0.5 days |
| **Best for** | Simple migration | Data transformation | Mixed needs |

**Recommended: Option 3A (pg_dump)** because:
- No data transformation needed
- Tables are straightforward structures
- FK relationships handled automatically
- Fastest and most reliable option

---

## Open Question 4: Schema Cleanup

**Question**: Remove unused tables from schema before migration?

### Current State

The Prisma schema contains 30+ tables, but only 11-13 need migration. Options:
1. Migrate full schema, then clean up
2. Clean up schema first, then migrate
3. Create Supabase with minimal schema

---

### Option 4A: Migrate Full Schema, Clean Up Later

**Description**: Deploy existing Prisma schema to Supabase, migrate only selected data, delete unused tables later.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Fastest to start** | No schema modifications before migration |
| **Lower risk** | Known working schema |
| **Gradual cleanup** | Can evaluate tables during normal operation |
| **Rollback easier** | Tables exist if needed unexpectedly |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Technical debt** | Unused tables cluttering database |
| **Confusion** | Developers may use deprecated tables |
| **Storage cost** | Empty tables still have overhead |
| **Cleanup effort** | Future migration to remove tables |

#### Process

```bash
# 1. Apply full schema to Supabase
npx prisma migrate deploy

# 2. Migrate only selected tables' data
pg_dump ... --table="User" ... | pg_restore ...

# 3. Later: Create migration to drop unused tables
npx prisma migrate dev --name drop_unused_tables
```

#### Risk Assessment: LOW

---

### Option 4B: Clean Schema First, Then Migrate

**Description**: Remove unused models from Prisma schema, generate migration, then deploy to Supabase.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Clean start** | No technical debt in new database |
| **Clear ownership** | Only relevant tables exist |
| **Better documentation** | Schema reflects reality |
| **Smaller schema** | Faster migrations, cleaner DB |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Coordination required** | Must update Neon schema too (or diverge) |
| **Risk of mistakes** | May remove something still needed |
| **Development delay** | 0.5-1 day to clean and test |
| **Breaking changes** | Application code may reference removed tables |

#### Process

```bash
# 1. Remove unused models from schema.prisma
# (CronJobExecution, CronJobMetrics, etc.)

# 2. Generate cleanup migration
npx prisma migrate dev --name remove_unused_tables

# 3. Test thoroughly
npm run test

# 4. Deploy to Supabase
npx prisma migrate deploy
```

#### Risk Assessment: MEDIUM

---

### Option 4C: Create Fresh Supabase Schema

**Description**: Start with empty Supabase, apply only migrations needed for essential tables.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Cleanest possible** | Only exactly what's needed |
| **Optimal schema** | Can redesign if improvements identified |
| **Fresh migration history** | No legacy migration cruft |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Most risky** | Schema may drift from Prisma expectations |
| **Significant work** | Must recreate migrations carefully |
| **Testing burden** | All functionality needs retesting |
| **Prisma sync issues** | May cause schema drift warnings |

#### Risk Assessment: HIGH

---

### Recommendation

| Criteria | 4A: Full → Clean | 4B: Clean → Migrate | 4C: Fresh |
|----------|------------------|---------------------|-----------|
| **Risk** | Low | Medium | High |
| **Effort** | Low | Medium | High |
| **Cleanliness** | Low | High | Highest |
| **Recommended** | Yes | Maybe | No |

**Recommended: Option 4A (Migrate Full Schema, Clean Up Later)** because:
- Lowest risk approach
- Unused tables have minimal impact
- Can clean up after migration is stable
- Maintains Prisma schema compatibility

---

## Open Question 5: Rollback Strategy

**Question**: How to handle migration failure and rollback to Neon?

---

### Option 5A: Keep Neon Active During Migration

**Description**: Don't delete or pause Neon until Supabase is verified stable (7-14 days).

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Instant rollback** | Simply revert environment variables |
| **No data loss** | Neon has pre-migration snapshot |
| **Low pressure** | Can take time to verify Supabase |
| **Safety net** | Handles unexpected issues |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Dual database cost** | Paying for both services |
| **Data divergence** | New data only in Supabase after cutover |
| **Rollback loses data** | Would lose post-migration changes |

#### Process

```
Day 0: Migration
  - Take Neon snapshot
  - Migrate to Supabase
  - Update Vercel env vars

Days 1-14: Monitoring
  - Monitor Supabase performance
  - Verify all functionality
  - Keep Neon unchanged

Day 14: Decommission (if stable)
  - Cancel Neon subscription
  - Delete Neon project
```

#### Risk Assessment: LOWEST

---

### Option 5B: Point-in-Time Recovery (PITR) Backup

**Description**: Take comprehensive backup before migration for disaster recovery.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Complete backup** | Full database state preserved |
| **Long retention** | Can restore weeks/months later |
| **Regulatory compliance** | Meets data retention requirements |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Longer restore time** | Hours to restore large backups |
| **Data loss on rollback** | All post-migration data lost |
| **Storage costs** | Backup storage fees |

#### Process

```bash
# Pre-migration backup
pg_dump $NEON_DB_URL -Fc -f neon_backup_$(date +%Y%m%d).dump

# Store in multiple locations
aws s3 cp neon_backup_*.dump s3://backups/
```

#### Risk Assessment: LOW

---

### Option 5C: Automated Rollback Procedure

**Description**: Create documented, tested rollback script for quick recovery.

#### Pros

| Advantage | Impact |
|-----------|--------|
| **Faster recovery** | Scripted steps reduce human error |
| **Tested procedure** | Verified to work before needed |
| **Repeatable** | Can be run multiple times |

#### Cons

| Disadvantage | Impact |
|--------------|--------|
| **Development time** | 0.5-1 day to create and test |
| **Maintenance** | Script needs updates if process changes |

#### Example Script

```bash
#!/bin/bash
# scripts/rollback-to-neon.sh

set -e

echo "Starting rollback to Neon..."

# 1. Verify Neon is still accessible
pg_isready -h $NEON_HOST -U $NEON_USER

# 2. Update Vercel environment
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production < neon_url.txt

# 3. Redeploy
vercel --prod

# 4. Disable Supabase
# (Don't delete - may need for debugging)

# 5. Verify rollback
curl https://tldrsec.app/api/health
```

#### Risk Assessment: LOW

---

### Recommendation

| Criteria | 5A: Keep Neon | 5B: PITR | 5C: Script |
|----------|---------------|----------|------------|
| **Recovery speed** | Instant | Hours | Minutes |
| **Data preserved** | Pre-migration only | Pre-migration only | Pre-migration only |
| **Cost** | 2x during overlap | Storage | None |
| **Recommended** | Yes | Yes | Yes |

**Recommended: All Three Options Combined**:

1. **5A**: Keep Neon active for 14 days post-migration (primary rollback)
2. **5B**: Take PITR backup before migration (disaster recovery)
3. **5C**: Document rollback procedure (operational clarity)

---

## Decision Matrix Summary

| Question | Recommended Option | Rationale |
|----------|-------------------|-----------|
| **1. Advisory Locks** | 1D: Hybrid (Transaction + Session) | Balance efficiency and compatibility |
| **2. Downtime** | 2A: Scheduled 30-60 min | Simple, low-risk for current scale |
| **3. Export Method** | 3A: pg_dump | Fast, reliable, handles FK ordering |
| **4. Schema Cleanup** | 4A: Full → Clean Later | Lowest risk, defer cleanup |
| **5. Rollback** | All Three | Defense in depth |

---

## Next Steps

1. **Confirm decisions** on each open question with stakeholder
2. **Create implementation plan** based on chosen options
3. **Test migration in staging** before production
4. **Schedule maintenance window** for production migration
5. **Document rollback procedure** and test it

---

## References

- [Original Research Document](../../thoughts/shared/research/2025-12-08-neon-to-supabase-migration-research.md)
- [Supabase Connection Pooling Documentation](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Migrate from Neon Guide](https://supabase.com/docs/guides/platform/migrating-to-supabase/neon)
- [lib/db/distributed-lock.ts](../../lib/db/distributed-lock.ts) - Advisory lock implementation
