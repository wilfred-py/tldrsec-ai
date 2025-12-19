---
date: 2025-12-17T08:53:32+11:00
researcher: Claude
git_commit: 8ba26e774bef40f9eb18c3be0b05891e7a8e1326
branch: main
repository: tldrsec-ai
topic: "Slack Pipeline Monitoring Bot - Data Sources and Infrastructure Research"
tags: [research, codebase, slack, monitoring, pipeline, cron, metrics]
status: complete
last_updated: 2025-12-17
last_updated_by: Claude
---

# Research: Slack Pipeline Monitoring Bot - Data Sources and Infrastructure

**Date**: 2025-12-17T08:53:32 AEDT
**Researcher**: Claude
**Git Commit**: 8ba26e774bef40f9eb18c3be0b05891e7a8e1326
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

What data sources and infrastructure exist to support a Slack monitoring bot that tracks:
1. Number of discovered filings per cron job
2. Number of filings in each stage of the E2E pipeline
3. Number of successfully generated summaries
4. Number of cached summaries sent vs newly generated
5. Number of emails sent
6. Number of users tracking a particular ticker that has been discovered
7. Daily summaries of these metrics (leveraging `npm run verify:daily`)

**Primary Goal**: Validate pipeline is working and identify any blockages.

---

## Summary

The codebase has **comprehensive data infrastructure** to support all requested Slack bot metrics. Key findings:

| Metric | Data Source | Query Method |
|--------|-------------|--------------|
| Filings discovered per cron | `CronJobExecution.newFilingsFound` | Direct field access |
| Pipeline stage counts | `JobQueue` by `jobType` and `status` | GroupBy query |
| Successfully generated summaries | `Summary` with `processingStatus='COMPLETED'` | Count query |
| Cached vs new summaries | `Summary.isCacheHit` boolean field | GroupBy query |
| Emails sent | `SummaryEmailDelivery` count | Count query |
| Users per ticker | `Ticker` grouped by symbol, or `TickerMonitoring.subscriberCount` | GroupBy or direct |
| Daily summaries | `DailyPipelineVerification` table | Direct query |

**Existing Infrastructure**:
- `npm run verify:daily` script generates comprehensive daily reports
- Monitoring API endpoints at `/api/monitoring/*`
- Slack configuration stubs exist but need implementation
- Existing plan at `docs/plans/2025-11-30-slack-monitoring-bot.md`

---

## Detailed Findings

### 1. Cron Job Execution and Discovery Metrics

#### Database Schema
**File**: [prisma/schema.prisma:372-403](prisma/schema.prisma#L372-L403)

```prisma
model CronJobExecution {
  id               String   @id @default(uuid())
  jobName          String
  executionId      String   @unique
  status           CronJobStatus  // STARTED, SUCCESS, FAILED, TIMEOUT, CANCELLED
  startedAt        DateTime
  completedAt      DateTime?
  durationMs       Int?

  // KEY METRICS FOR SLACK BOT
  tickersChecked   Int      @default(0)
  newFilingsFound  Int      @default(0)  // <-- FILINGS DISCOVERED
  filingsProcessed Int      @default(0)
  emailsSent       Int      @default(0)
  errorsCount      Int      @default(0)
}
```

#### How Metrics Are Captured
**File**: [lib/cron/sec-filing-service.ts:156-221](lib/cron/sec-filing-service.ts#L156-L221)

The `runSecFilingMonitoring()` function:
1. Gets active tickers from database
2. Processes tickers in batches, checking RSS feeds
3. Accumulates `newFilingsFound` counter from each batch
4. Updates `CronJobMonitor` via `updateMetrics()` method

**File**: [lib/monitoring/cron-monitor.ts:127-159](lib/monitoring/cron-monitor.ts#L127-L159)

```typescript
async updateMetrics(updates: Partial<CronExecutionMetrics>): Promise<void> {
  if (updates.newFilingsFound !== undefined)
    updateData.newFilingsFound = updates.newFilingsFound;
  // ... updates CronJobExecution record atomically
}
```

#### Query Examples

```typescript
// Get last 10 cron executions with filing counts
const executions = await prisma.cronJobExecution.findMany({
  orderBy: { startedAt: 'desc' },
  take: 10,
  select: {
    executionId: true,
    startedAt: true,
    status: true,
    tickersChecked: true,
    newFilingsFound: true,  // <-- FILINGS DISCOVERED
    filingsProcessed: true,
    emailsSent: true,
    durationMs: true
  }
});

// Total filings discovered in last 24 hours
const total = await prisma.cronJobExecution.aggregate({
  where: {
    startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    status: 'SUCCESS'
  },
  _sum: { newFilingsFound: true }
});
```

---

### 2. Pipeline Stage Tracking (Fetch, Summarize, Email)

#### The 3-Phase Pipeline

| Phase | Job Type | Duration | Creates |
|-------|----------|----------|---------|
| Discovery | `ASYNC_DISCOVER_FILINGS` | <5s | SecFiling records |
| Fetch | `ASYNC_FETCH_FILING` | 60-120s | FilingContentCache |
| Summarize | `ASYNC_SUMMARIZE_CACHED` | 17-90s | Summary + Email |

#### JobQueue Schema
**File**: [prisma/schema.prisma:146-178](prisma/schema.prisma#L146-L178)

**Status Values** from [lib/job-queue/index.ts:45-50](lib/job-queue/index.ts#L45-L50):
- `PENDING` - Waiting to be processed
- `PROCESSING` - Currently being processed
- `COMPLETED` - Finished successfully
- `FAILED` - Failed and exceeded max retries
- `RETRYING` - Failed but will be retried

#### Query: Jobs by Stage and Status

```typescript
// Count jobs by phase and status
const jobCounts = await prisma.jobQueue.groupBy({
  by: ['jobType', 'status'],
  _count: { id: true },
  where: {
    jobType: {
      in: ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED']
    }
  }
});

// Result format:
// [
//   { jobType: 'ASYNC_FETCH_FILING', status: 'PENDING', _count: { id: 5 } },
//   { jobType: 'ASYNC_FETCH_FILING', status: 'COMPLETED', _count: { id: 42 } },
//   { jobType: 'ASYNC_SUMMARIZE_CACHED', status: 'PROCESSING', _count: { id: 2 } },
//   ...
// ]
```

#### Tracking Tables by Phase

| Phase | Primary Table | Status Field | Success Indicator |
|-------|---------------|--------------|-------------------|
| Discovery | `SecFiling` | (existence) | Record created |
| Fetch | `FilingContentCache` | `status` | `status='CACHED'` |
| Summarize | `Summary` | `processingStatus` | `processingStatus='COMPLETED'` |
| Email | `SummaryEmailDelivery` | `deliveryStatus` | `deliveryStatus='sent'` |

---

### 3. Cached Summary Sharing Mechanism

#### Key Fields
**File**: [prisma/schema.prisma:58-107](prisma/schema.prisma#L58-L107)

```prisma
model Summary {
  // Cache tracking
  isCacheHit        Boolean  @default(false)  // TRUE = shared from another user
  cacheUsageCount   Int      @default(0)

  // Cost tracking (0 for cache hits)
  totalCost         Float    // $0.00 for shared, actual cost for new
  inputTokens       Int
  outputTokens      Int

  // Email tracking
  totalEmailsSent   Int      @default(0)
  uniqueUsersServed Int      @default(0)
}
```

#### Sharing Logic
**File**: [lib/cron/handlers/summarize-cached-handler.ts:216-284](lib/cron/handlers/summarize-cached-handler.ts#L216-L284)

1. Check if user already has summary for this filing
2. Check for shared summary from ANY user with same `filingUrl` + `filingType`
3. If found: Create new Summary with `isCacheHit: true`, `totalCost: 0`
4. If not found: Generate via OpenRouter, `isCacheHit: false`, actual cost

#### Query: Cache Hit Rate

```typescript
// Cache hit vs new generation breakdown
const cacheStats = await prisma.summary.groupBy({
  by: ['isCacheHit'],
  _count: { id: true },
  _sum: { totalCost: true }
});

// Result:
// [
//   { isCacheHit: false, _count: { id: 21 }, _sum: { totalCost: 0.0538 } },
//   { isCacheHit: true, _count: { id: 3 }, _sum: { totalCost: 0 } }
// ]

// Cost savings from sharing
const costSavings = await prisma.summary.aggregate({
  where: { isCacheHit: true },
  _count: { id: true }
});
// Multiply count by average generation cost (~$0.002) for savings estimate
```

---

### 4. Email Delivery Tracking

#### Schema
**File**: [prisma/schema.prisma:606-623](prisma/schema.prisma#L606-L623)

```prisma
model SummaryEmailDelivery {
  id             String   @id @default(uuid())
  summaryId      String
  userId         String
  emailAddress   String
  sentAt         DateTime @default(now())
  deliveryStatus String   @default("sent")
  emailServiceId String?  // Resend email ID

  @@unique([userId, summaryId])  // Prevents duplicate emails
}
```

#### Query: Emails Sent

```typescript
// Total emails sent today
const emailCount = await prisma.summaryEmailDelivery.count({
  where: {
    sentAt: { gte: startOfDay },
    deliveryStatus: 'sent'
  }
});

// Emails by status
const emailStats = await prisma.summaryEmailDelivery.groupBy({
  by: ['deliveryStatus'],
  _count: { id: true },
  where: { sentAt: { gte: startOfDay } }
});

// Unique users notified
const uniqueUsers = await prisma.summaryEmailDelivery.findMany({
  where: { sentAt: { gte: startOfDay } },
  select: { userId: true },
  distinct: ['userId']
});
```

---

### 5. User-Ticker Tracking Relationships

#### Schema
**File**: [prisma/schema.prisma:45-56](prisma/schema.prisma#L45-L56)

```prisma
model Ticker {
  id          String   @id @default(uuid())
  symbol      String
  companyName String
  userId      String   // Each ticker belongs to one user

  @@unique([userId, symbol])  // One subscription per user per ticker
}
```

#### TickerMonitoring with Subscriber Count
**File**: [prisma/schema.prisma:280-298](prisma/schema.prisma#L280-L298)

```prisma
model TickerMonitoring {
  cik             String   @unique
  symbol          String
  subscriberCount Int      @default(0)  // Pre-calculated user count
}
```

#### Queries

```typescript
// Method 1: Real-time count of users tracking a ticker
const usersForTicker = await prisma.user.findMany({
  where: {
    tickers: { some: { symbol: 'AAPL' } }
  },
  select: { id: true, email: true }
});
const userCount = usersForTicker.length;

// Method 2: Cached subscriber count (faster)
const monitoring = await prisma.tickerMonitoring.findFirst({
  where: { symbol: 'AAPL' }
});
const cachedCount = monitoring?.subscriberCount;

// Method 3: Aggregate all tickers with user counts
const tickerCounts = await prisma.ticker.groupBy({
  by: ['symbol'],
  _count: { id: true }
});
// Result: [{ symbol: 'AAPL', _count: { id: 3 } }, ...]
```

---

### 6. Daily Verification Script (`npm run verify:daily`)

#### Entry Point
**File**: [scripts/verify-daily-pipeline.ts:1](scripts/verify-daily-pipeline.ts)

**npm scripts** from [package.json:148-149](package.json#L148-L149):
- `npm run verify:daily` - Verify yesterday's filings with auto-remediation
- `npm run verify:daily:no-remediation` - Dry-run without remediation
- `npm run verify:daily -- --date=2025-11-28` - Verify specific date

#### DailyPipelineVerification Schema
**File**: [prisma/schema.prisma:782-823](prisma/schema.prisma#L782-L823)

```prisma
model DailyPipelineVerification {
  id                    String   @id @default(uuid())
  verificationDate      DateTime @db.Date @unique
  runAt                 DateTime

  // Filing counts
  filingsDiscovered     Int
  filingsCompleted      Int
  filingsPending        Int
  filingsFailed         Int

  // Phase breakdown
  fetchSuccessCount     Int
  fetchFailedCount      Int
  summarizeSuccessCount Int
  summarizeFailedCount  Int
  emailsSentCount       Int
  uniqueUsersNotified   Int

  // AI costs
  aiTotalCostUsd        Float
  aiInputTokens         Int
  aiOutputTokens        Int
  aiTotalTokens         Int
  aiModelBreakdown      Json     // Per-model breakdown

  // Remediation
  remediationAttempted  Int
  remediationSucceeded  Int
  remediationFailed     Int

  // Details
  filingDetails         Json     // Full FilingVerification array
  errors                String[]
}
```

#### Exported Functions for Slack Integration
**File**: [scripts/verify-daily-pipeline.ts:1016-1026](scripts/verify-daily-pipeline.ts#L1016-L1026)

```typescript
export {
  runVerification,           // Returns full VerificationReport
  runRemediation,            // Retry failed filings
  attemptRemediation,        // Retry single filing
  displayReport,             // Console output formatter
  saveVerificationResults,   // Persist to database
  getYesterdayRange,         // Date range helper
  verifyFiling,              // Single filing verification
  FilingVerification,        // Type export
  VerificationReport         // Type export
};
```

#### Query: Get Daily Verification Data

```typescript
// Get yesterday's verification report
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setHours(0, 0, 0, 0);

const report = await prisma.dailyPipelineVerification.findUnique({
  where: { verificationDate: yesterday }
});

// Get last 7 days
const weekAgo = new Date();
weekAgo.setDate(weekAgo.getDate() - 7);

const weeklyData = await prisma.dailyPipelineVerification.findMany({
  where: { verificationDate: { gte: weekAgo } },
  orderBy: { verificationDate: 'desc' }
});
```

---

### 7. Existing Monitoring Infrastructure

#### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/monitoring/pipeline-health` | Real-time pipeline status |
| `/api/monitoring/error-alerts` | Alert management |
| `/api/monitoring/health-trends` | Historical trend analysis |
| `/api/monitoring/metrics` | Comprehensive system metrics |

#### Slack Configuration (Existing but Not Implemented)
**File**: [lib/monitoring/config.ts:93-100](lib/monitoring/config.ts#L93-L100)

```typescript
slack: {
  enabled: boolean;
  webhook?: string;
  channels: {
    alerts: string;      // Default: '#alerts'
    escalations: string; // Default: '#critical-alerts'
  }
}
```

#### Existing Slack Plan
**File**: [docs/plans/2025-11-30-slack-monitoring-bot.md](docs/plans/2025-11-30-slack-monitoring-bot.md)

The existing plan uses `@vercel/slack-bolt` and focuses on:
- Daily reports at 8:30 AM AEST
- Conversational queries via @mentions
- Weekly trend summaries

---

## Recommended Data Queries for Slack Bot

### Per-Cron-Job Metrics

```typescript
interface CronJobMetrics {
  executionId: string;
  startedAt: Date;
  duration: number;
  discovered: number;        // CronJobExecution.newFilingsFound
  fetchPending: number;      // JobQueue where jobType=FETCH, status=PENDING
  fetchCompleted: number;    // JobQueue where jobType=FETCH, status=COMPLETED
  summarizePending: number;  // JobQueue where jobType=SUMMARIZE, status=PENDING
  summarizeCompleted: number;
  emailsSent: number;        // CronJobExecution.emailsSent
  errors: number;            // CronJobExecution.errorsCount
}
```

### Pipeline Health Query

```typescript
async function getPipelineHealth() {
  const [jobStats, recentCron, cacheStats] = await Promise.all([
    prisma.jobQueue.groupBy({
      by: ['jobType', 'status'],
      _count: { id: true }
    }),
    prisma.cronJobExecution.findFirst({
      orderBy: { startedAt: 'desc' }
    }),
    prisma.summary.groupBy({
      by: ['isCacheHit'],
      _count: { id: true },
      where: { createdAt: { gte: startOfDay } }
    })
  ]);

  return {
    lastCron: recentCron,
    byStage: transformJobStats(jobStats),
    cacheHitRate: calculateCacheHitRate(cacheStats)
  };
}
```

### Daily Summary Query

```typescript
async function getDailySummary(date: Date) {
  // Try database first
  const stored = await prisma.dailyPipelineVerification.findUnique({
    where: { verificationDate: date }
  });

  if (stored) return stored;

  // Otherwise run verification
  const { runVerification } = await import('@/scripts/verify-daily-pipeline');
  return runVerification(date.toISOString().split('T')[0]);
}
```

---

## Architecture Documentation

### Data Flow: Cron → Discovery → Fetch → Summarize → Email

```
┌─────────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (every 10 min)                                    │
│   └── POST /api/cron/tier-aware                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: DISCOVERY (<5s)                                            │
│   ├── Query: TickerMonitoring.findMany()                           │
│   ├── Check: SEC RSS feeds for each ticker                          │
│   ├── Create: SecFiling records                                     │
│   ├── Create: ASYNC_FETCH_FILING job per user per filing           │
│   └── Update: CronJobExecution.newFilingsFound                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 2: FETCH (60-120s)                                            │
│   ├── Check: FilingContentCache for cached content                  │
│   ├── Fetch: SEC EDGAR if cache miss                                │
│   ├── Create: FilingContentCache with status='CACHED'              │
│   └── Create: ASYNC_SUMMARIZE_CACHED job                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 3: SUMMARIZE (17-90s)                                         │
│   ├── Check: Existing Summary for this user                        │
│   ├── Check: Shared Summary from other users (isCacheHit=true)     │
│   ├── Generate: OpenRouter API if no shared summary                 │
│   ├── Create: Summary record                                        │
│   ├── Send: Email via Resend                                        │
│   └── Create: SummaryEmailDelivery record                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Metrics Collection Points

```
CronJobExecution ──────► newFilingsFound, tickersChecked, emailsSent
       │
       ▼
JobQueue ──────────────► status (PENDING/PROCESSING/COMPLETED/FAILED)
       │                 jobType (DISCOVER/FETCH/SUMMARIZE)
       ▼
FilingContentCache ────► status (CACHED/ERROR), fetchDuration
       │
       ▼
Summary ───────────────► isCacheHit, totalCost, processingStatus
       │
       ▼
SummaryEmailDelivery ──► deliveryStatus, sentAt, userId
       │
       ▼
DailyPipelineVerification ► Aggregated daily metrics
```

---

## Historical Context (from thoughts/)

### Related Research Files
- [2025-12-17-openrouter-summary-generation-cross-reference-analysis.md](./2025-12-17-openrouter-summary-generation-cross-reference-analysis.md) - Validates OpenRouter costs match database records
- [2025-12-16-pipeline-fix-validation-post-mortem.md](./2025-12-16-pipeline-fix-validation-post-mortem.md) - Pipeline stall investigation
- [2025-12-15-pipeline-stall-openrouter-correlation-analysis.md](./2025-12-15-pipeline-stall-openrouter-correlation-analysis.md) - OpenRouter correlation with stall

### Existing Plan
- [docs/plans/2025-11-30-slack-monitoring-bot.md](../../../docs/plans/2025-11-30-slack-monitoring-bot.md) - Detailed implementation plan for Slack bot

---

## Open Questions

1. **Slack App Setup**: Has the Slack app been created in the tldrsecworkspace? Environment variables (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID`) need to be configured.

2. **Webhook vs Bot**: The existing plan uses `@vercel/slack-bolt` for conversational bot. For simpler notifications, a webhook-only approach could be faster to implement.

3. **Real-time vs Scheduled**: Should metrics be pushed after each cron job (real-time), or only on daily summary (scheduled)?

4. **Alert Thresholds**: What thresholds should trigger Slack alerts? (e.g., >5 failures, 0 discoveries when expected)

5. **Command Invocation**: The request mentions "created through command invocation" - is this a Slack slash command or @mention?

---

## Code References

### Primary Data Sources
- `prisma/schema.prisma:372-403` - CronJobExecution model
- `prisma/schema.prisma:146-178` - JobQueue model
- `prisma/schema.prisma:58-107` - Summary model with isCacheHit
- `prisma/schema.prisma:606-623` - SummaryEmailDelivery model
- `prisma/schema.prisma:782-823` - DailyPipelineVerification model
- `prisma/schema.prisma:45-56` - Ticker model
- `prisma/schema.prisma:280-298` - TickerMonitoring with subscriberCount

### Implementation Files
- `lib/cron/sec-filing-service.ts:156-221` - Discovery metrics capture
- `lib/monitoring/cron-monitor.ts:127-159` - CronJobMonitor.updateMetrics()
- `lib/cron/handlers/summarize-cached-handler.ts:216-284` - Summary sharing logic
- `scripts/verify-daily-pipeline.ts` - Daily verification script

### Monitoring Infrastructure
- `app/api/monitoring/pipeline-health/route.ts` - Health API
- `lib/monitoring/alert-service.ts` - Alert management
- `lib/monitoring/config.ts:93-100` - Slack config stubs

### Existing Plans
- `docs/plans/2025-11-30-slack-monitoring-bot.md` - Full implementation plan
