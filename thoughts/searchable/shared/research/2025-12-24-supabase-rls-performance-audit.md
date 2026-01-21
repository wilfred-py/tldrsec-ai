---
date: 2025-12-24T10:45:20+11:00
researcher: Claude
git_commit: c8678b4efa783f1e77ad6abccc7957a0334f42fd
branch: main
repository: tldrsec-ai
topic: "Supabase RLS Policy and Performance Audit"
tags: [research, supabase, rls, security, performance, database]
status: complete
last_updated: 2025-12-24
last_updated_by: Claude
---

# Research: Supabase RLS Policy and Performance Audit

**Date**: 2025-12-24T10:45:20+11:00
**Researcher**: Claude
**Git Commit**: c8678b4efa783f1e77ad6abccc7957a0334f42fd
**Branch**: main
**Repository**: tldrsec-ai

## Research Question
Assess all Supabase tables for RLS policy requirements and identify performance opportunities related to unindexed foreign keys and unused indexes.

## Summary

This audit identified **significant security gaps** in the database schema. Most application tables in the `app` and `pipeline` schemas have **RLS disabled**, while system-managed tables in `auth` and `storage` schemas are properly configured by Supabase. The `app.Summary` table has RLS enabled but lacks policies. Additionally, there are **11 unindexed foreign keys** causing potential performance issues and **26 unused indexes** that could be candidates for removal.

---

## Detailed Findings

### 1. RLS Status by Schema

#### `public` Schema (3 tables) - RLS ENABLED with policies

| Table | RLS Enabled | Policies | Notes |
|-------|-------------|----------|-------|
| `newsletter_subscribers` | ✅ Yes | Service role full access | Adequate for service-only access |
| `newsletter_deliveries` | ✅ Yes | Service role full access | Adequate for service-only access |
| `page_analytics` | ✅ Yes | Allow anonymous inserts, Service role full access | Has performance issue with multiple permissive policies |

#### `app` Schema (12 tables) - MOSTLY RLS DISABLED

| Table | RLS Enabled | Row Count | Assessment |
|-------|-------------|-----------|------------|
| `User` | ❌ No | 2 | **NEEDS RLS** - Contains PII (email, preferences) |
| `Ticker` | ❌ No | 14 | **NEEDS RLS** - User-specific data |
| `SecFiling` | ❌ No | 1 | **NEEDS RLS** - Linked to user tickers |
| `Summary` | ✅ Yes | 68 | **NEEDS POLICIES** - RLS enabled but no policies exist |
| `CikMapping` | ❌ No | 20 | Low risk - Public SEC data |
| `TickerMonitoring` | ❌ No | 13 | Low risk - System-level monitoring |
| `RssFilingCheck` | ❌ No | 383 | Low risk - System-level data |
| `UserSubscription` | ❌ No | 0 | **NEEDS RLS** - Sensitive billing data |
| `AuditLog` | ❌ No | 151 | **NEEDS RLS** - Contains user actions |
| `NotificationSent` | ❌ No | 0 | **NEEDS RLS** - User notification history |
| `SecCompanyCache` | ❌ No | 0 | Low risk - Cache data |

#### `pipeline` Schema (20 tables) - ALL RLS DISABLED

| Table | RLS Enabled | Row Count | Assessment |
|-------|-------------|-----------|------------|
| `JobLock` | ❌ No | 0 | Low risk - Internal system locks |
| `MonitoringThreshold` | ❌ No | 10 | Low risk - System configuration |
| `CacheInvalidation` | ❌ No | 0 | Low risk - Internal cache ops |
| `ErrorAlert` | ❌ No | 0 | Low risk - System alerts |
| `DailyWaitlistCache` | ❌ No | 15 | Low risk - Aggregate cache |
| `DailyPipelineVerification` | ❌ No | 20 | Low risk - System verification |
| `FilingContentCache` | ❌ No | 0 | Low risk - Content cache |
| `FilingUsage` | ❌ No | 0 | **NEEDS RLS** - User usage data |
| `UsagePeriod` | ❌ No | 0 | **NEEDS RLS** - User billing periods |
| `CronJobExecution` | ❌ No | 51 | Low risk - System execution logs |
| `TierProcessingExecution` | ❌ No | 0 | Low risk - System processing |
| `CronExecutionContext` | ❌ No | 0 | Low risk - System context |
| `JobQueue` | ❌ No | 79 | Low risk - System job queue |
| `JobProgress` | ❌ No | 0 | Low risk - System progress tracking |
| `SecFetchAttempt` | ❌ No | 0 | Low risk - System fetch logs |
| `SummaryCacheAccess` | ❌ No | 0 | **NEEDS RLS** - User access tracking |
| `SummaryEmailDelivery` | ❌ No | 20 | **NEEDS RLS** - User email records |
| `CronJobAlert` | ❌ No | 0 | Low risk - System alerts |
| `CronJobMetrics` | ❌ No | 0 | Low risk - System metrics |

#### `auth` and `storage` Schemas - SUPABASE MANAGED

All tables in these schemas have RLS enabled and are managed by Supabase. Notable exceptions:
- `auth.oauth_clients` - RLS disabled (OAuth client definitions)
- `auth.oauth_authorizations` - RLS disabled (OAuth flow state)
- `auth.oauth_consents` - RLS disabled (User consent records)
- `auth.oauth_client_states` - RLS disabled (OAuth state tracking)

These are internal Supabase auth tables and should remain as configured.

---

### 2. Security Advisory: RLS Enabled Without Policies

**CRITICAL**: `app.Summary` table has RLS enabled but **no policies defined**.

```
Table `app.Summary` has RLS enabled, but no policies exist
```

This means all queries to this table will return **no rows** unless using service_role key. This could cause application failures if queried with anon or authenticated roles.

---

### 3. Performance Issues

#### 3.1 Unindexed Foreign Keys (11 issues)

These foreign keys lack covering indexes, which can cause slow JOIN and DELETE operations:

| Schema | Table | Foreign Key | Target |
|--------|-------|-------------|--------|
| `app` | `Summary` | `Summary_secFilingId_fkey` | `app.SecFiling.id` |
| `pipeline` | `CronExecutionContext` | `CronExecutionContext_executionId_fkey` | `pipeline.CronJobExecution.id` |
| `pipeline` | `JobProgress` | `JobProgress_jobId_fkey` | `pipeline.JobQueue.id` |
| `pipeline` | `SecFetchAttempt` | `SecFetchAttempt_secFilingId_fkey` | `app.SecFiling.id` |
| `pipeline` | `SummaryCacheAccess` | `SummaryCacheAccess_summaryId_fkey` | `app.Summary.id` |
| `pipeline` | `SummaryCacheAccess` | `SummaryCacheAccess_userId_fkey` | `app.User.id` |
| `pipeline` | `SummaryEmailDelivery` | `SummaryEmailDelivery_summaryId_fkey` | `app.Summary.id` |
| `pipeline` | `SummaryEmailDelivery` | `SummaryEmailDelivery_userId_fkey` | `app.User.id` |
| `pipeline` | `TierProcessingExecution` | `TierProcessingExecution_executionId_fkey` | `pipeline.CronJobExecution.id` |
| `pipeline` | `UsagePeriod` | `UsagePeriod_userId_fkey` | `app.User.id` |
| `public` | `newsletter_deliveries` | `newsletter_deliveries_subscriber_id_fkey` | `public.newsletter_subscribers.id` |

#### 3.2 RLS Policy Performance Issues (3 WARN level)

The following policies re-evaluate `auth.role()` for each row, causing performance degradation:

| Table | Policy | Issue |
|-------|--------|-------|
| `public.newsletter_subscribers` | Service role full access | Replace `auth.role()` with `(select auth.role())` |
| `public.newsletter_deliveries` | Service role full access | Replace `auth.role()` with `(select auth.role())` |
| `public.page_analytics` | Service role full access | Replace `auth.role()` with `(select auth.role())` |

#### 3.3 Multiple Permissive Policies (4 WARN level)

`public.page_analytics` has overlapping policies that both execute:
- "Allow anonymous inserts" + "Service role full access" both apply to INSERT for:
  - `anon` role
  - `authenticated` role
  - `authenticator` role
  - `dashboard_user` role

#### 3.4 Unused Indexes (26 INFO level)

These indexes have never been used and are candidates for removal:

**`public.newsletter_subscribers` (4 indexes):**
- `idx_newsletter_subscribers_email_domain`
- `idx_newsletter_subscribers_confidence_score`
- `idx_newsletter_subscribers_is_trusted_domain`
- `idx_newsletter_subscribers_security_analysis`

**`pipeline` schema (11 indexes):**
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

**`app` schema (11 indexes):**
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

---

### 4. Existing RLS Policies Review

| Schema.Table | Policy Name | Type | Roles | Command | Condition |
|--------------|-------------|------|-------|---------|-----------|
| `public.newsletter_deliveries` | Service role full access | PERMISSIVE | public | ALL | `auth.role() = 'service_role'` |
| `public.newsletter_subscribers` | Service role full access | PERMISSIVE | public | ALL | `auth.role() = 'service_role'` |
| `public.page_analytics` | Allow anonymous inserts | PERMISSIVE | public | INSERT | `true` (unrestricted) |
| `public.page_analytics` | Service role full access | PERMISSIVE | public | ALL | `auth.role() = 'service_role'` |

---

## Tables Requiring RLS Action

### High Priority (User PII/Sensitive Data)

1. **`app.User`** - Contains email, preferences, subscription tier
2. **`app.Summary`** - Already has RLS but needs policies
3. **`app.UserSubscription`** - Contains Stripe billing IDs
4. **`app.AuditLog`** - Contains user action history

### Medium Priority (User-Associated Data)

5. **`app.Ticker`** - User watchlist data
6. **`app.SecFiling`** - Linked to user tickers
7. **`app.NotificationSent`** - User notification records
8. **`pipeline.FilingUsage`** - User usage tracking
9. **`pipeline.UsagePeriod`** - User billing periods
10. **`pipeline.SummaryCacheAccess`** - User access patterns
11. **`pipeline.SummaryEmailDelivery`** - User email delivery records

### Low Priority (System/Public Data)

- CikMapping, TickerMonitoring, RssFilingCheck, SecCompanyCache
- All pipeline tables for system operations (JobLock, CronJobExecution, etc.)
- These contain no user-specific data and are accessed server-side only

---

## Remediation Links

- [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Unindexed Foreign Keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Auth RLS Init Plan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
- [Unused Index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
- [Multiple Permissive Policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)

---

## Open Questions

1. Is client-side access to `app` or `pipeline` tables required, or is all access via service_role through Next.js API routes?
2. If service-role only, RLS may not be strictly necessary but is still recommended as defense-in-depth
3. Should unused indexes be dropped to reduce storage and write overhead, or kept for potential future use?
4. What is the expected query pattern for the `app.Summary` table that led to RLS being enabled?
