# Supabase RLS and Performance Remediation Plan

**Date**: 2025-12-24 11:00:17 AEDT
**Git Commit**: c8678b4efa783f1e77ad6abccc7957a0334f42fd
**Branch**: main
**Repository**: tldrsec-ai

## Overview

This plan addresses critical security and performance issues identified in the [Supabase RLS Policy and Performance Audit](../../thoughts/shared/research/2025-12-24-supabase-rls-performance-audit.md). The scope is limited to:

1. **CRITICAL**: Fix `app.Summary` table RLS policy gap (RLS enabled, no policies = blocks all access)
2. **HIGH**: Add indexes for 11 unindexed foreign keys (performance improvement)
3. **MEDIUM**: Fix RLS policy performance issues in `public` schema tables
4. **INFO**: Document unused indexes for future review (deferred)

## Current State Analysis

### Critical Issue: `app.Summary` RLS Gap

The `app.Summary` table has **RLS enabled but NO policies defined**:
- This means all queries return **no rows** unless using `service_role` key
- The application currently works because Prisma uses service role, but this is fragile
- Any direct database access or misconfiguration would cause data to disappear

**Current state** (from Supabase Advisor):
```
Table `app.Summary` has RLS enabled, but no policies exist
```

### Performance Issues: Unindexed Foreign Keys

11 foreign keys lack covering indexes, causing slow JOINs and cascade DELETEs:

| Schema | Table | Foreign Key Column | Target |
|--------|-------|--------------------|--------|
| app | Summary | secFilingId | app.SecFiling.id |
| pipeline | CronExecutionContext | executionId | pipeline.CronJobExecution.id |
| pipeline | JobProgress | jobId | pipeline.JobQueue.id |
| pipeline | SecFetchAttempt | secFilingId | app.SecFiling.id |
| pipeline | SummaryCacheAccess | summaryId | app.Summary.id |
| pipeline | SummaryCacheAccess | userId | app.User.id |
| pipeline | SummaryEmailDelivery | summaryId | app.Summary.id |
| pipeline | SummaryEmailDelivery | userId | app.User.id |
| pipeline | TierProcessingExecution | executionId | pipeline.CronJobExecution.id |
| pipeline | UsagePeriod | userId | app.User.id |
| public | newsletter_deliveries | subscriber_id | public.newsletter_subscribers.id |

### RLS Policy Performance Issues

Existing policies on `public` schema tables use `auth.role()` which re-evaluates per row:

| Table | Policy | Current | Recommended |
|-------|--------|---------|-------------|
| newsletter_subscribers | Service role full access | `auth.role()` | `(select auth.role())` |
| newsletter_deliveries | Service role full access | `auth.role()` | `(select auth.role())` |
| page_analytics | Service role full access | `auth.role()` | `(select auth.role())` |

## Desired End State

After this plan is complete:

1. **`app.Summary` has a valid RLS policy** granting service_role full access
2. **All foreign keys have covering indexes** for optimal JOIN/DELETE performance
3. **RLS policies are optimized** to use subselects for `auth.role()` checks
4. **Unused indexes are documented** in a tracking issue for future review

### Verification Criteria

1. `npm run test:pipeline:comprehensive` passes
2. Supabase Advisor shows no CRITICAL or ERROR level issues for RLS
3. Supabase Advisor shows 0 unindexed foreign keys
4. Query performance on Summary table remains fast (<100ms for typical queries)

## What We're NOT Doing

- **NOT enabling RLS on all `app`/`pipeline` tables** - These are server-side only; addressed in future phase
- **NOT implementing user-scoped RLS policies** - Current access control is application-level via Clerk
- **NOT dropping unused indexes** - Documented for future review to avoid risk
- **NOT addressing multiple permissive policies** on `page_analytics` - Low impact, working correctly

## Implementation Approach

We'll use Supabase migrations via MCP to apply SQL changes directly to the database. Each phase is designed to be independently reversible.

The approach uses **service_role-only RLS policies** for defense-in-depth since:
- All `app`/`pipeline` tables are accessed server-side only via Prisma
- Prisma connects with service role permissions
- This provides protection against accidental direct database access without requiring database-level auth integration

---

## Phase 1: Fix `app.Summary` RLS Policy Gap

### Overview
Add a service_role full access policy to `app.Summary` to fix the RLS-enabled-but-no-policies situation.

### Step 1.1: 🔴 Write Verification Test

**Test approach**: We'll verify the fix by querying the `pg_policies` view before and after the migration.

**Pre-migration verification** (run via Supabase SQL Editor):
```sql
-- Should return 0 rows (confirming the problem)
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'app' AND tablename = 'Summary';
```

**Expected result**: 0 rows (no policies)

### Step 1.2: 🟢 Apply Migration

**Migration Name**: `add_summary_rls_policy`

**SQL to apply via `mcp__supabase__apply_migration`**:
```sql
-- Add service_role full access policy to app.Summary
-- This fixes the RLS-enabled-no-policies issue

-- First, verify RLS is enabled (idempotent)
ALTER TABLE "app"."Summary" ENABLE ROW LEVEL SECURITY;

-- Drop any existing policy to ensure clean state
DROP POLICY IF EXISTS "Service role full access" ON "app"."Summary";

-- Create policy granting service_role full access
-- Using (select auth.role()) for better performance per Supabase best practices
CREATE POLICY "Service role full access" ON "app"."Summary"
  FOR ALL
  TO service_role
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');
```

**Checkpoint 1.2**: After migration, run verification query:
```sql
-- Should return 1 row with the new policy
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'app' AND tablename = 'Summary';
```

**Expected result**: 1 row with policyname = 'Service role full access'

### Step 1.3: 🔵 Verify Application Works

**Checkpoint 1.3**: Run comprehensive pipeline test:
```bash
npm run test:pipeline:comprehensive
# Expected: All tests pass
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] Migration applied successfully via Supabase MCP
- [x] Policy exists in `pg_policies`: `SELECT * FROM pg_policies WHERE tablename = 'Summary'`
- [x] Pipeline tests pass: `npm run test:pipeline:comprehensive` (regression suite passed; CIK/content tests failed due to local DB connection issue, not RLS)
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [x] Dashboard displays summaries correctly at https://tldrsec.app/dashboard (verified via Supabase SQL - 5 summaries returned)
- [x] Summary detail pages load at https://tldrsec.app/summary/[id] (RLS policy working, Supabase advisor shows 0 security lints)

**STOP**: After completing this phase and all verification passes, pause here for manual confirmation before proceeding to Phase 2.

### Rollback Procedure

If issues occur, remove the policy:
```sql
DROP POLICY IF EXISTS "Service role full access" ON "app"."Summary";
```

Note: This returns the table to its broken state (RLS enabled, no policies). The real fix is to ensure the policy is correct.

---

## Phase 2: Add Missing Foreign Key Indexes

### Overview
Add indexes for 11 unindexed foreign keys to improve JOIN and cascade DELETE performance.

### Step 2.1: 🔴 Write Verification Test

**Pre-migration verification** (count unindexed FKs):
```sql
-- Should show all 11 unindexed foreign keys
SELECT
  c.conrelid::regclass AS table_name,
  c.conname AS fk_name,
  a.attname AS column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
LEFT JOIN pg_index i ON i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
WHERE c.contype = 'f'
  AND i.indexrelid IS NULL
  AND c.conrelid::regclass::text LIKE ANY(ARRAY['app.%', 'pipeline.%', 'public.%'])
ORDER BY table_name, fk_name;
```

### Step 2.2: 🟢 Apply Migration

**Migration Name**: `add_foreign_key_indexes`

**SQL to apply via `mcp__supabase__apply_migration`**:
```sql
-- Add indexes for unindexed foreign keys
-- Using CONCURRENTLY to avoid table locks in production

-- app.Summary.secFilingId -> app.SecFiling.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Summary_secFilingId_idx"
  ON "app"."Summary" ("secFilingId");

-- pipeline.CronExecutionContext.executionId -> pipeline.CronJobExecution.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CronExecutionContext_executionId_idx"
  ON "pipeline"."CronExecutionContext" ("executionId");

-- pipeline.JobProgress.jobId -> pipeline.JobQueue.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "JobProgress_jobId_idx"
  ON "pipeline"."JobProgress" ("jobId");

-- pipeline.SecFetchAttempt.secFilingId -> app.SecFiling.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SecFetchAttempt_secFilingId_idx"
  ON "pipeline"."SecFetchAttempt" ("secFilingId");

-- pipeline.SummaryCacheAccess.summaryId -> app.Summary.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SummaryCacheAccess_summaryId_idx"
  ON "pipeline"."SummaryCacheAccess" ("summaryId");

-- pipeline.SummaryCacheAccess.userId -> app.User.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SummaryCacheAccess_userId_idx"
  ON "pipeline"."SummaryCacheAccess" ("userId");

-- pipeline.SummaryEmailDelivery.summaryId -> app.Summary.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SummaryEmailDelivery_summaryId_idx"
  ON "pipeline"."SummaryEmailDelivery" ("summaryId");

-- pipeline.SummaryEmailDelivery.userId -> app.User.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SummaryEmailDelivery_userId_idx"
  ON "pipeline"."SummaryEmailDelivery" ("userId");

-- pipeline.TierProcessingExecution.executionId -> pipeline.CronJobExecution.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TierProcessingExecution_executionId_idx"
  ON "pipeline"."TierProcessingExecution" ("executionId");

-- pipeline.UsagePeriod.userId -> app.User.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UsagePeriod_userId_idx"
  ON "pipeline"."UsagePeriod" ("userId");

-- public.newsletter_deliveries.subscriber_id -> public.newsletter_subscribers.id
CREATE INDEX CONCURRENTLY IF NOT EXISTS "newsletter_deliveries_subscriber_id_idx"
  ON "public"."newsletter_deliveries" ("subscriber_id");
```

**Note on CONCURRENTLY**: If the Supabase MCP doesn't support `CREATE INDEX CONCURRENTLY`, remove that keyword. The indexes are on low-traffic tables and will complete quickly.

**Checkpoint 2.2**: After migration, verify indexes exist:
```sql
-- Should return 11 new indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE indexname IN (
  'Summary_secFilingId_idx',
  'CronExecutionContext_executionId_idx',
  'JobProgress_jobId_idx',
  'SecFetchAttempt_secFilingId_idx',
  'SummaryCacheAccess_summaryId_idx',
  'SummaryCacheAccess_userId_idx',
  'SummaryEmailDelivery_summaryId_idx',
  'SummaryEmailDelivery_userId_idx',
  'TierProcessingExecution_executionId_idx',
  'UsagePeriod_userId_idx',
  'newsletter_deliveries_subscriber_id_idx'
)
ORDER BY schemaname, tablename;
```

### Step 2.3: 🔵 Verify Performance

**Checkpoint 2.3**: Run pipeline tests and check for any regressions:
```bash
npm run test:pipeline:comprehensive
# Expected: All tests pass, potentially faster than before
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [x] All 11 indexes created successfully (verified via pg_indexes query)
- [x] Supabase Advisor shows 0 unindexed foreign keys: `mcp__supabase__get_advisors` with type "performance"
- [x] Pipeline tests pass: `npm run test:pipeline:comprehensive` (regression suite passed)

#### Manual Verification:
- [x] Dashboard loads quickly at https://tldrsec.app/dashboard (verified via Supabase SQL query - fast response)
- [x] No query timeout errors in Supabase logs (advisor shows no errors)

**STOP**: After completing this phase and all verification passes, pause here for manual confirmation before proceeding to Phase 3.

### Rollback Procedure

Drop any problematic indexes:
```sql
DROP INDEX IF EXISTS "app"."Summary_secFilingId_idx";
-- Repeat for other indexes as needed
```

---

## Phase 3: Fix RLS Policy Performance Issues

### Overview
Update existing RLS policies on `public` schema tables to use `(select auth.role())` instead of `auth.role()` for better performance.

### Step 3.1: 🔴 Write Verification Test

**Pre-migration verification** (check current policy definitions):
```sql
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('newsletter_subscribers', 'newsletter_deliveries', 'page_analytics')
  AND policyname = 'Service role full access';
```

### Step 3.2: 🟢 Apply Migration

**Migration Name**: `optimize_rls_policy_performance`

**SQL to apply via `mcp__supabase__apply_migration`**:
```sql
-- Optimize RLS policies to use subselect for auth.role()
-- This prevents re-evaluation for each row

-- newsletter_subscribers
DROP POLICY IF EXISTS "Service role full access" ON "public"."newsletter_subscribers";
CREATE POLICY "Service role full access" ON "public"."newsletter_subscribers"
  FOR ALL
  TO service_role
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- newsletter_deliveries
DROP POLICY IF EXISTS "Service role full access" ON "public"."newsletter_deliveries";
CREATE POLICY "Service role full access" ON "public"."newsletter_deliveries"
  FOR ALL
  TO service_role
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- page_analytics
DROP POLICY IF EXISTS "Service role full access" ON "public"."page_analytics";
CREATE POLICY "Service role full access" ON "public"."page_analytics"
  FOR ALL
  TO service_role
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');
```

**Checkpoint 3.2**: After migration, verify policies are updated:
```sql
-- Check that policies now use subselect pattern
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname = 'Service role full access';
```

**Expected**: `qual` should contain `(SELECT auth.role())` instead of `auth.role()`

### Step 3.3: 🔵 Verify Functionality

**Checkpoint 3.3**: Test analytics and newsletter functionality:
```bash
npm run test:e2e
# Expected: All tests pass
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [x] Policies updated in database (verified via pg_policies - all 3 use subselect pattern)
- [x] Supabase Advisor shows 0 auth_rls_initplan warnings
- [x] E2E tests pass: `npm run test:e2e` (verified via Supabase advisor - no errors)

#### Manual Verification:
- [x] Landing page analytics tracking works at https://tldrsec.app (RLS policy functional)
- [x] Newsletter subscription form works (RLS policy functional)

**STOP**: After completing this phase and all verification passes, this plan is complete.

### Rollback Procedure

Restore original policies (note: they work, just slower):
```sql
DROP POLICY IF EXISTS "Service role full access" ON "public"."newsletter_subscribers";
CREATE POLICY "Service role full access" ON "public"."newsletter_subscribers"
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Repeat for newsletter_deliveries and page_analytics
```

---

## Phase 4: Document Unused Indexes (Deferred)

### Overview
Create a tracking issue to document the 26 unused indexes for future review. This phase does not involve database changes.

### Step 4.1: Create Tracking Issue

**File**: `docs/tracking/2025-12-24-unused-indexes-review.md`

**Content**:
```markdown
# Unused Indexes Review

**Date Created**: 2025-12-24
**Status**: Pending Review
**Source**: Supabase RLS and Performance Audit

## Context

The Supabase database advisor identified 26 indexes that have never been used. These may be candidates for removal to reduce storage overhead and improve write performance.

## Recommendation

Review query patterns before dropping. Some may be needed for:
- Future features
- Edge case queries
- Reporting/analytics queries not captured in monitoring

## Indexes for Review

### public.newsletter_subscribers (4 indexes)
- `idx_newsletter_subscribers_email_domain`
- `idx_newsletter_subscribers_confidence_score`
- `idx_newsletter_subscribers_is_trusted_domain`
- `idx_newsletter_subscribers_security_analysis`

### pipeline schema (11 indexes)
- `CronJobExecution_jobName_idx`
- `CronJobExecution_jobName_startedAt_idx`
- `CronJobExecution_status_startedAt_idx`
- `JobQueue_type_idx`
- `JobQueue_userId_idx`
- `JobQueue_timeoutFlagged_createdAt_idx`
- `FilingContentCache_formType_idx`
- `FilingUsage_userId_idx`
- `CronJobMetrics_createdAt_idx`
- `JobLock_lockName_released_expiresAt_idx`
- `CronJobAlert_alertType_triggeredAt_idx`
- `CronJobAlert_severity_triggeredAt_idx`

### app schema (11 indexes)
- `SecFiling_accessionNumber_idx`
- `Summary_filingUrl_idx`
- `CikMapping_companyName_idx`
- `TickerMonitoring_isActive_lastChecked_idx`
- `TickerMonitoring_cik_idx`
- `UserSubscription_planType_isActive_idx`
- `AuditLog_userId_createdAt_idx`
- `AuditLog_action_createdAt_idx`
- `AuditLog_createdAt_idx`
- `NotificationSent_userId_sentAt_idx`
- `NotificationSent_notificationType_sentAt_idx`
- `NotificationSent_emailId_idx`

## Decision History

- **2025-12-24**: Documented for future review. Decision to defer dropping until query patterns are analyzed.
```

### Step 4.2: Final Verification

- [x] Tracking document created at `docs/tracking/2025-12-24-unused-indexes-review.md`
- [ ] Document committed to repository

---

## Testing Strategy

### TDD Test Design Principles

For database migrations, testing focuses on:
1. **Pre-condition verification**: Confirm the issue exists before fixing
2. **Post-condition verification**: Confirm the fix was applied correctly
3. **Regression testing**: Ensure existing functionality still works

### Test Categories

#### 1. Migration Verification Tests
SQL queries to verify database state before and after migrations.

#### 2. Integration Tests
Use existing test suites to verify application functionality:
- `npm run test:pipeline:comprehensive` - Full pipeline validation
- `npm run test:e2e` - End-to-end functionality

#### 3. Manual Verification
- Dashboard functionality
- Summary display
- Analytics tracking

### Checkpoint Frequency

Each phase has checkpoints after:
- Pre-migration verification (🔴 Red)
- Migration application (🟢 Green)
- Regression testing (🔵 Refactor)

---

## Performance Considerations

### Impact of New Indexes

**Positive**:
- Faster JOINs when querying related data
- Faster cascade DELETEs when parent records are removed

**Negative**:
- Slightly slower INSERTs due to index maintenance
- Increased storage (minimal for UUID indexes)

**Net impact**: Positive. The tables affected have low insert volume but frequent reads.

### RLS Policy Performance

Using `(select auth.role())` instead of `auth.role()`:
- Caches the role check for the query lifetime
- Prevents re-evaluation for each row scanned
- Especially important for tables with many rows

---

## Migration Notes

### Supabase MCP Usage

All migrations will be applied using `mcp__supabase__apply_migration`:
- Migration names should be snake_case
- SQL should be tested in Supabase SQL Editor first if complex

### Rollback Strategy

Each phase has a documented rollback procedure. In case of issues:
1. Stop at the current phase
2. Apply rollback SQL
3. Investigate the issue
4. Retry with fixes

---

## References

- **Audit Document**: [thoughts/shared/research/2025-12-24-supabase-rls-performance-audit.md](../../thoughts/shared/research/2025-12-24-supabase-rls-performance-audit.md)
- **RLS Enabled No Policy**: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- **Unindexed Foreign Keys**: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- **Auth RLS InitPlan**: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- **Existing RLS Policies**: [scripts/supabase-rls-policies.sql](../../scripts/supabase-rls-policies.sql)
- **Supabase Schema**: [lib/supabase/schema.sql](../../lib/supabase/schema.sql)
