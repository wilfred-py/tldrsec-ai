---
date: 2025-12-24T11:16:32+11:00
researcher: Claude
git_commit: c8678b4efa783f1e77ad6abccc7957a0334f42fd
branch: main
repository: tldrsec-ai
topic: "Slack Reporting Implementation - Current State Documentation"
tags: [research, codebase, slack, notifications, cron, monitoring]
status: complete
last_updated: 2025-12-24
last_updated_by: Claude
last_updated_note: "Added reference image analysis showing desired Daily Pipeline Verification Report format"
---

# Research: Slack Reporting Implementation

**Date**: 2025-12-24 11:16:32 AEDT
**Researcher**: Claude
**Git Commit**: c8678b4efa783f1e77ad6abccc7957a0334f42fd
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Document the current Slack reporting implementation including the hourly reports, their trigger mechanisms, message formats, and how they relate to the cron jobs that run every 10 minutes.

## Summary

The codebase implements a comprehensive Slack notification system with three types of scheduled reports:

1. **Pipeline Cron Notifications** - Triggered every 5 minutes via Cloudflare Worker calling `/api/cron/tier-aware`, with batching for quiet runs
2. **Hourly Summary Reports** - Triggered hourly at `:00` via Cloudflare Worker calling `/api/cron/slack-hourly-summary`
3. **Daily Reports** - Triggered at 22:00 UTC (9:00 AM AEDT) via Cloudflare Worker calling `/api/cron/slack-daily-report`

The current hourly Slack reports run **once per hour**, not every 10 minutes in sync with the pipeline cron. The pipeline cron runs every 5 minutes and uses a **batching system** where quiet runs are accumulated and summarized hourly, while runs with meaningful activity (new filings or errors) post immediately.

## Detailed Findings

### Current Cron Schedule Configuration

**File**: [cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml#L12-L13)

```toml
[triggers]
crons = ["*/5 * * * *", "0 * * * *", "0 22 * * *"]
```

Three distinct schedules:
| Schedule | Frequency | Handler | Target Endpoint |
|----------|-----------|---------|-----------------|
| `*/5 * * * *` | Every 5 minutes | `handlePipelineProcessing()` | `/api/cron/tier-aware` |
| `0 * * * *` | Every hour on the hour | `handleHourlySummary()` | `/api/cron/slack-hourly-summary` |
| `0 22 * * *` | Daily at 22:00 UTC | `handleDailyReport()` | `/api/cron/slack-daily-report` |

### Slack Notification Types

#### 1. Pipeline Cron Notifications (Every 5 Minutes)

**Entry Point**: [app/api/cron/tier-aware/route.ts:802-814](app/api/cron/tier-aware/route.ts#L802-L814)

After each cron execution, the endpoint:
1. Builds a `CronExecutionResult` object with queue metrics
2. Evaluates alert rules against the results
3. Posts to Slack via `slackWebhookService.postCronResults()`
4. Posts alerts if triggered via `slackWebhookService.postAlerts()`

```typescript
// Fire-and-forget pattern - non-blocking
slackWebhookService.postCronResults(cronResult, queueHealth).catch(err => {
  cronLogger.warn(`[${executionId}] Failed to post to Slack`, { error: err.message });
});
```

**Batching Logic**: [lib/slack/webhook-service.ts:426-473](lib/slack/webhook-service.ts#L426-L473)

The webhook service implements hourly batching for quiet runs:
- **Meaningful activity** (new filings found OR errors occurred): Posts immediately
- **Quiet runs** (no new filings, no errors): Accumulated into hourly batch
- After 60-minute window elapses: Posts hourly summary with accumulated metrics

```typescript
private hasMeaningfulActivity(result: CronExecutionResult): boolean {
  return result.results.filingMonitoring.newFilingsFound > 0 ||
         result.results.filingMonitoring.errors > 0 ||
         !result.success;
}
```

#### 2. Hourly Summary Reports (Every Hour)

**Entry Point**: [app/api/cron/slack-hourly-summary/route.ts:48-127](app/api/cron/slack-hourly-summary/route.ts#L48-L127)

**Metrics Collection**: [lib/slack/daily-report-handler.ts:545-700](lib/slack/daily-report-handler.ts#L545-L700)

The hourly summary collects data from the past hour using raw SQL queries:

| Query | Table | Metrics |
|-------|-------|---------|
| Queue Status | `pipeline."JobQueue"` | Pending, Processing, Completed, Failed |
| Discovery | `app."RssFilingCheck"` | Filings discovered, unique tickers |
| Summarization | `app."Summary"` | Summaries generated, cost, tokens |
| Email | `pipeline."SummaryEmailDelivery"` | Emails sent, unique recipients |
| Health | `pipeline."JobQueue"` | Stale jobs, oldest pending |

**Message Format**: [lib/slack/daily-report-handler.ts:782-908](lib/slack/daily-report-handler.ts#L782-L908)

```
[Health Emoji] Hourly Pipeline Summary
────────────────────────────────────────
:clock1: Period: 10:00 AM - 11:00 AM AEDT

:package: Queue Status
• Pending: 74
• Processing: 2
• Completed: 8
• Failed: 0

:inbox_tray: Discovery
• Filings discovered: 64 (VRT, NVDA, AAPL)

:brain: Summarization
• Summaries generated: 5
• Cost: $0.0123
• Tokens: 12.3k in / 2.1k out

:email: Email Delivery
• Emails sent: 8
• Unique recipients: 3

:warning: Issues Detected (if any)
• High queue depth: 100 pending jobs
```

#### 3. Daily Reports (Daily at 9 AM AEDT)

**Entry Point**: [app/api/cron/slack-daily-report/route.ts:49-134](app/api/cron/slack-daily-report/route.ts#L49-L134)

**Report Generation**: [lib/slack/daily-report-handler.ts:406-450](lib/slack/daily-report-handler.ts#L406-L450)

Provides comprehensive daily verification including:
- Filing-level breakdown with status (Discovered, Fetched, Summarized, Emailed)
- Pipeline metrics (completion rate, costs)
- AI cost breakdown by model
- Cache health metrics
- Remediation results (if applicable)

### Alert System

**Alert Rules**: [lib/slack/alert-rules.ts:54-231](lib/slack/alert-rules.ts#L54-L231)

10 pre-defined alert rules with configurable thresholds:

| Alert ID | Severity | Condition |
|----------|----------|-----------|
| `filing-errors-critical` | critical | Filing errors >= 2 |
| `filing-error-warning` | warning | Filing errors >= 1 |
| `backlog-growing` | warning | Queue depth > 10 |
| `backlog-critical` | critical | Queue depth > 50 |
| `high-failure-rate` | warning | Failure rate > 10% |
| `critical-failure-rate` | critical | Failure rate > 20% |
| `stale-jobs` | warning | Oldest pending > 30 min |
| `stale-jobs-critical` | critical | Oldest pending > 60 min |
| `slow-processing` | warning | Avg processing > 120s |
| `cron-failed` | critical | Cron execution failed |

**Deduplication**: Alerts are deduplicated within a 15-minute window to prevent spam.

### Webhook Service Architecture

**File**: [lib/slack/webhook-service.ts](lib/slack/webhook-service.ts)

The `SlackWebhookService` singleton manages all Slack notifications:

```
SlackWebhookService
├── Configuration
│   ├── SLACK_WEBHOOK_URL (required)
│   ├── SLACK_ALERTS_WEBHOOK_URL (optional)
│   ├── Rate limit: 1 message/second
│   └── Retry: 3 attempts with exponential backoff
├── Hourly Batching
│   ├── Window: 60 minutes
│   ├── Accumulates quiet runs
│   └── Posts summary when window elapses
├── Alert Deduplication
│   ├── Window: 15 minutes
│   └── Tracks last trigger per rule
└── Methods
    ├── postCronResults() - Pipeline cron notifications
    ├── postAlerts() - Alert notifications
    ├── postDailySummary() - Daily reports
    └── postJobProcessingResults() - Job processing notifications
```

### File Structure

```
lib/slack/
├── index.ts                    # Main exports
├── webhook-service.ts          # Singleton service for posting
├── message-formatter.ts        # Block Kit message builders
├── alert-rules.ts              # Alert rule definitions
├── daily-report-handler.ts     # Hourly/daily report generation
├── conversation-handler.ts     # Bot @mention handling
├── types.ts                    # TypeScript interfaces
├── rate-limiter.ts             # Rate limiting
├── user-authorization.ts       # Permission checks
└── input-validation.ts         # Input sanitization

app/api/cron/
├── tier-aware/route.ts             # Main pipeline cron (every 5 min)
├── slack-hourly-summary/route.ts   # Hourly summary cron
└── slack-daily-report/route.ts     # Daily report cron

app/api/slack/
└── events/route.ts             # Bot event handling (@mentions)

cloudflare-cron/
├── wrangler.toml               # Cron schedule configuration
└── index.js                    # Worker script with cron routing
```

## Code References

### Cron Configuration
- [cloudflare-cron/wrangler.toml:12-13](cloudflare-cron/wrangler.toml#L12-L13) - Cron schedule definitions
- [cloudflare-cron/index.js:15-37](cloudflare-cron/index.js#L15-L37) - Cron routing logic

### Pipeline Cron Slack Integration
- [app/api/cron/tier-aware/route.ts:774-814](app/api/cron/tier-aware/route.ts#L774-L814) - Slack notification trigger
- [lib/slack/webhook-service.ts:426-473](lib/slack/webhook-service.ts#L426-L473) - `postCronResults()` with batching

### Hourly Summary
- [app/api/cron/slack-hourly-summary/route.ts:48-127](app/api/cron/slack-hourly-summary/route.ts#L48-L127) - Endpoint handler
- [lib/slack/daily-report-handler.ts:545-700](lib/slack/daily-report-handler.ts#L545-L700) - Metrics collection
- [lib/slack/daily-report-handler.ts:782-908](lib/slack/daily-report-handler.ts#L782-L908) - Message formatting

### Alert System
- [lib/slack/alert-rules.ts:54-231](lib/slack/alert-rules.ts#L54-L231) - Alert rule definitions
- [lib/slack/alert-rules.ts:241-271](lib/slack/alert-rules.ts#L241-L271) - Evaluation function
- [lib/slack/webhook-service.ts:478-526](lib/slack/webhook-service.ts#L478-L526) - Alert posting with deduplication

### Message Formatting
- [lib/slack/message-formatter.ts:107-169](lib/slack/message-formatter.ts#L107-L169) - Cron completion message
- [lib/slack/message-formatter.ts:175-222](lib/slack/message-formatter.ts#L175-L222) - Alert message
- [lib/slack/message-formatter.ts:264-429](lib/slack/message-formatter.ts#L264-L429) - Daily summary message
- [lib/slack/message-formatter.ts:587-770](lib/slack/message-formatter.ts#L587-L770) - Job processing message

## Architecture Documentation

### Current Notification Flow

```
Cloudflare Worker (every 5 min)
        │
        ▼
/api/cron/tier-aware
        │
        ├── Execute pipeline processing
        │
        ├── Build CronExecutionResult
        │
        ├── Evaluate alert rules
        │
        ▼
slackWebhookService.postCronResults()
        │
        ├── If meaningful activity?
        │   ├── YES → Post immediately
        │   └── NO  → Accumulate in hourly batch
        │
        ▼
slackWebhookService.postAlerts()
        │
        └── If alerts triggered and not deduplicated → Post
```

```
Cloudflare Worker (hourly at :00)
        │
        ▼
/api/cron/slack-hourly-summary
        │
        ├── Query last hour metrics
        │
        ├── Format hourly summary message
        │
        └── POST to SLACK_WEBHOOK_URL
```

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SLACK_WEBHOOK_URL` | Yes | Main webhook for notifications |
| `SLACK_ALERTS_WEBHOOK_URL` | No | Separate webhook for critical alerts |
| `SLACK_BOT_TOKEN` | For bot | OAuth token for @mention responses |
| `SLACK_SIGNING_SECRET` | For bot | Signature verification for events |
| `CRON_SECRET` | Yes | HMAC authentication with Vercel |

### Rate Limiting Configuration

| Setting | Value |
|---------|-------|
| Rate limit | 1 message/second |
| Retry attempts | 3 |
| Retry backoff | Exponential (1s, 2s, 3s) |
| Alert deduplication | 15 minutes |
| Hourly batch window | 60 minutes |

## Historical Context (from thoughts/)

The Slack monitoring bot was implemented on 2025-12-18 based on:
- [docs/plans/2025-11-30-slack-monitoring-bot.md](docs/plans/2025-11-30-slack-monitoring-bot.md) - Original planning document
- [thoughts/shared/research/2025-12-17-slack-pipeline-monitoring-bot-data-sources.md](thoughts/shared/research/2025-12-17-slack-pipeline-monitoring-bot-data-sources.md) - Data sources research

Timeline entries from TIMELINE.md:
- 2025-12-18: Slack Pipeline Monitor Bot created
- 2025-12-18: Slack Hourly Batching for Quiet Runs implemented
- 2025-12-22: Slack Hourly Schema Fix applied
- 2025-12-22: Slack Hourly Diagnostic Enhancement added

## Related Research

- [2025-12-17-slack-pipeline-monitoring-bot-data-sources.md](2025-12-17-slack-pipeline-monitoring-bot-data-sources.md) - Data sources for monitoring bot

## Reference Image Analysis (User's Desired Format)

The user provided screenshots of the desired Slack report format. This is the **Daily Pipeline Verification Report** which currently runs once daily at 9 AM AEDT.

### Desired Message Format Structure

```
📊 DAILY PIPELINE VERIFICATION REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated: 9:00 am AEDT    Verification Date: 2025-12-18    Duration: 9909ms

📥 FILINGS DISCOVERED (13 total)
┌─────────┬──────┬────────────┬───────────┐
│ Ticker  │ Form │ Filed      │ Status    │
├─────────┼──────┼────────────┼───────────┤
│ COIN    │ 144  │ 12/18/2025 │ ❌ FAILED  │
│ GOOGL   │ 4    │ 12/18/2025 │ ❌ FAILED  │
│ GOOGL   │ 4    │ 12/18/2025 │ ✅ COMPLETE│
│ GOOGL   │ 4    │ 12/17/2025 │ ⏳ PENDING │
└─────────┴──────┴────────────┴───────────┘

📋 PIPELINE BREAKDOWN
┌────────────┬────────────┬─────────┬────────────┬─────────┐
│ Filing     │ Discovered │ Fetched │ Summarized │ Emailed │
├────────────┼────────────┼─────────┼────────────┼─────────┤
│ COIN 144   │ ✅          │ ❌       │ ❌          │ -       │
│ GOOGL 4    │ ✅          │ ❌       │ ❌          │ -       │
│ GOOGL 4    │ ✅          │ ✅       │ ✅          │ ✅ (1)   │
└────────────┴────────────┴─────────┴────────────┴─────────┘

📊 SUMMARY
Total Filings: 13
❌ Completed: 6 (46%)
⏳ Pending: 1 (8%)
📧 Emails Sent: 6 to 1 unique users

💰 AI COSTS (OpenRouter)
Total Cost: $0.0157
Input Tokens: 26,478
Output Tokens: 15,538
Total Tokens: 42,016

By Model:
  unknown: Cost: $0.0157 | In: 26,478 | Out: 15,538

💾 CACHE HEALTH REPORT
Total cache entries: 7
Successful caches: 7 (100.0%)
Avg fetch duration: 606ms
```

### Key Observations from Reference Images

1. **Format Source**: This is the `formatDailySummaryMessage()` output from [lib/slack/message-formatter.ts:264-429](lib/slack/message-formatter.ts#L264-L429)

2. **Current Trigger**: Runs **once daily** at 22:00 UTC (9:00 AM AEDT) via `/api/cron/slack-daily-report`

3. **User's Request**: User wants this detailed verification report format to run **every 10 minutes** instead of just once daily

4. **Data Shown in Screenshots**:
   - 13 filings discovered (COIN 144, GOOGL Form 4s)
   - 46% completion rate (6 of 13 complete)
   - 6 emails sent to 1 unique user
   - AI cost: $0.0157 for 42K tokens
   - Cache 100% success rate

### Gap Analysis: Current vs Desired

| Aspect | Current Implementation | User's Desired Behavior |
|--------|----------------------|------------------------|
| **Report Type** | Daily Pipeline Verification | Same format |
| **Frequency** | Once daily at 9 AM AEDT | Every 10 minutes |
| **Time Window** | Previous full day (midnight to midnight UTC) | Last 10 minutes |
| **Trigger** | `0 22 * * *` cron schedule | `*/10 * * * *` cron schedule |
| **Endpoint** | `/api/cron/slack-daily-report` | New endpoint needed |

### Implementation Path

To achieve 10-minute verification reports:

1. **Create new endpoint**: `/api/cron/slack-interval-summary`
   - Reuse `formatDailySummaryMessage()` formatter
   - Modify `getVerificationMetrics()` to accept custom time window

2. **Update Cloudflare Worker cron**:
   ```toml
   # Change from:
   crons = ["*/5 * * * *", "0 * * * *", "0 22 * * *"]
   # To:
   crons = ["*/5 * * * *", "*/10 * * * *", "0 22 * * *"]
   ```

3. **Modify time window in handler**:
   ```typescript
   // Current (daily-report-handler.ts:547-548)
   const now = new Date();
   const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

   // Needed for 10-minute interval
   const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
   ```

4. **Consider data density**: 10-minute windows may show empty tables during quiet periods

## Open Questions

1. **Empty Reports**: Should 10-minute reports be skipped if no filings discovered in that window, or always post?

2. **Report Title**: Should the header change from "DAILY PIPELINE VERIFICATION REPORT" to "10-MINUTE PIPELINE REPORT" or similar?

3. **Overlap with Hourly Summary**: The current hourly summary (`0 * * * *`) provides simpler metrics. Should it be removed if 10-minute detailed reports are added?

4. **Cost/Noise Tradeoff**: 10-minute reports = 144 Slack messages per day. Is this acceptable notification volume?
