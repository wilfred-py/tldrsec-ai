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
