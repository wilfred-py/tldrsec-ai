# Scalable Job Processing Architecture - Unblock Pipeline

**Date**: 2025-11-27 17:30:30 AEDT
**Git Commit**: 7c3be761cef56ec3928c2a1e31975e0769504d97
**Branch**: main
**Repository**: tldrsec-ai

## Overview

This plan addresses the critical issue of the 3-phase pipeline being blocked at Phase 1→Phase 2 transition due to HTTP 524 timeouts (~125s). The VRT Form 4 filings from November 25-26, 2025 were never processed because discovery jobs are accumulating as PENDING while the BackgroundFilingWorker times out trying to process them.

**Root Cause**: The `process-filing-queue` endpoint uses `batchSize: 1` but still times out because Phase 1 (discovery) jobs trigger Phase 2 job creation, which involves database operations and logging that push execution time past Vercel's limits.

**Solution**: Implement a tiered approach focusing on immediate pipeline unblocking, then scalability improvements.

## Current State Analysis

### Pipeline Status
- **Phase 1 (Discovery)**: 9 PENDING jobs, 140 COMPLETED - jobs are being created but not processed
- **Phase 2 (Fetch)**: 0 jobs ever created - pipeline never reaches this phase
- **Phase 3 (Summarize)**: 0 jobs ever created - awaiting Phase 2
- **Legacy Jobs**: 494 FAILED, 19 PENDING, 24 RETRYING - excluded from BackgroundFilingWorker

### Key Configuration Issues Found

| Setting | Current Value | Location | Issue |
|---------|---------------|----------|-------|
| `batchSize` | 1 | `route.ts:57` | Even 1 job times out |
| Cron frequency | `*/10` | `wrangler.toml:10` | Slow throughput |
| Idempotency key | `filing-${userId}-${accessionNumber}` | `async-filing-queue.ts:90` | Per-user scaling issue |
| Worker timeout | 165s | `types.ts:191` | Close to Vercel 180s limit |

### Key Discoveries

1. **Discovery jobs are fast (<5s)** but the BackgroundFilingWorker times out because:
   - It recovers stale jobs first (`recoverStaleJobs()` at line 135)
   - It processes jobs sequentially (line 164)
   - Phase 1 completion triggers Phase 2 job creation with database writes

2. **The timeout happens in Phase 1→Phase 2 transition**, not in Phase 1 itself:
   - Discovery handler at [lib/cron/handlers/discovery-handler.ts:129-172](lib/cron/handlers/discovery-handler.ts#L129-L172) queues fetch jobs
   - For each new filing, it creates an `ASYNC_FETCH_FILING` job via `JobQueueService.addJob()`
   - Multiple filings × multiple users = many database writes

3. **Current idempotency creates N jobs per filing** where N = number of subscribed users:
   - Format: `filing-${userId}-${accessionNumber}` at [lib/cron/async-filing-queue.ts:90](lib/cron/async-filing-queue.ts#L90)
   - 100 users watching TSLA = 100 jobs for one Tesla filing

## Desired End State

After this plan is complete:

1. **Pipeline Unblocked**: Phase 2 and Phase 3 jobs are being created and processed
2. **Discovery Backlog Cleared**: 9 PENDING discovery jobs processed within 30 minutes
3. **VRT Filings Discovered**: The Nov 25-26 Form 4 filings are discovered and queued
4. **Scalable Architecture**: System can handle 100+ jobs/hour (vs current 6 jobs/hour)
5. **Legacy Jobs Cleaned**: 494 FAILED + 19 PENDING + 24 RETRYING legacy jobs cleared

### Verification

```bash
# Check job queue status
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const counts = await prisma.\$queryRaw\`
    SELECT \"jobType\", status, COUNT(*) as count
    FROM \"JobQueue\"
    GROUP BY \"jobType\", status
    ORDER BY \"jobType\", status
  \`;
  console.table(counts);
  await prisma.\$disconnect();
})();
"

# Verify Phase 2/3 jobs exist
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const phase2 = await prisma.jobQueue.count({ where: { jobType: 'ASYNC_FETCH_FILING' }});
  const phase3 = await prisma.jobQueue.count({ where: { jobType: 'ASYNC_SUMMARIZE_CACHED' }});
  console.log('Phase 2 (ASYNC_FETCH_FILING):', phase2);
  console.log('Phase 3 (ASYNC_SUMMARIZE_CACHED):', phase3);
  await prisma.\$disconnect();
})();
"
```

## What We're NOT Doing

1. **NOT implementing parallel workers (Tier 3)** - deferred to future iteration
2. **NOT migrating to external queue service (Inngest/BullMQ)** - not needed at current scale
3. **NOT changing the 3-phase pipeline architecture** - it's sound, just needs unblocking
4. **NOT modifying the Vercel timeout** - can't exceed 180s limit
5. **NOT re-enabling legacy JobWorker** - 3-phase pipeline is the path forward

## Implementation Approach

**Strategy**: Fix the immediate blocking issue first (Tier 0), then implement quick wins (Tier 1), then add deduplication (Tier 2).

**Phasing**:
- **Phase 1**: Unblock pipeline by separating discovery from fetch job creation
- **Phase 2**: Increase throughput with batch sizing and cron frequency
- **Phase 3**: Implement filing-level deduplication for scalability
- **Phase 4**: Clean up legacy jobs

---

## Phase 1: Unblock Pipeline - Separate Discovery from Fetch Creation

### Overview
The core issue is that Phase 1 (discovery) handlers try to create Phase 2 (fetch) jobs inline, causing timeouts. We need to separate these operations so discovery completes quickly.

### Changes Required:

#### 1. Modify Discovery Handler to Batch Fetch Job Creation

**File**: `lib/cron/handlers/discovery-handler.ts`
**Changes**: Instead of creating fetch jobs inline, return the list of filings to queue and let the worker batch them.

```typescript
// Current implementation (lines 129-172) creates jobs inline:
// for (const filing of newFilings) {
//   const fetchJob = await JobQueueService.addJob({ ... });
// }

// New implementation: Return filings for batch processing
export interface DiscoveryResult {
  success: boolean;
  filingsDiscovered: number;
  filingsToFetch: Array<{
    userId: string;
    userEmail: string;
    userTier: string;
    ticker: { symbol: string; companyName: string; cik: string };
    filing: {
      filingId: string;
      formType: string;
      filingDate: string;
      filingUrl: string;
      accessionNumber: string;
    };
    executionContext: {
      executionId: string;
      cronTriggerTime: string;
      sourceContext: string;
      discoveryPhaseCompletedAt: string;
    };
  }>;
  error?: string;
}
```

#### 2. Add Batch Fetch Job Creation Function

**File**: `lib/cron/handlers/discovery-handler.ts`
**Changes**: Add a separate function to create fetch jobs in batches with controlled timing.

```typescript
export async function createFetchJobsBatch(
  filingsToFetch: DiscoveryResult['filingsToFetch'],
  batchSize: number = 5
): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;

  // Process in small batches to avoid timeout
  for (let i = 0; i < filingsToFetch.length; i += batchSize) {
    const batch = filingsToFetch.slice(i, i + batchSize);

    await Promise.all(batch.map(async (filing) => {
      try {
        await JobQueueService.addJob({
          jobType: 'ASYNC_FETCH_FILING',
          payload: filing,
          priority: filing.userTier === 'PREMIUM' ? 8 :
                   filing.userTier === 'PLUS' ? 6 : 5,
          idempotencyKey: `fetch-${filing.filing.accessionNumber}-${filing.userId}`,
          maxAttempts: 3
        });
        created++;
      } catch (error) {
        failed++;
      }
    }));
  }

  return { created, failed };
}
```

#### 3. Update BackgroundFilingWorker to Handle Discovery Results

**File**: `lib/cron/background-filing-worker.ts`
**Changes**: After discovery job completes, queue fetch jobs separately with timeout protection.

```typescript
// In routeJobToHandler, after discovery:
case 'ASYNC_DISCOVER_FILINGS': {
  const { handleDiscovery, createFetchJobsBatch } = await import('./handlers/discovery-handler');
  const discoveryResult = await handleDiscovery(payload);

  // If discovery found filings, create fetch jobs in a controlled manner
  if (discoveryResult.success && discoveryResult.filingsToFetch.length > 0) {
    // Check remaining time before creating fetch jobs
    const elapsed = Date.now() - jobStartTime;
    const remainingTime = FILING_PROCESSING_TIMEOUT - elapsed;

    if (remainingTime > 30000) { // Only if we have 30s+ remaining
      const batchResult = await createFetchJobsBatch(
        discoveryResult.filingsToFetch,
        5 // Small batches for safety
      );
      discoveryResult.fetchJobsCreated = batchResult.created;
      discoveryResult.fetchJobsFailed = batchResult.failed;
    } else {
      // Not enough time - filings will be re-discovered next run
      workerLogger.warn('Skipping fetch job creation due to time constraint', {
        remainingTime,
        filingsToQueue: discoveryResult.filingsToFetch.length
      });
    }
  }

  return discoveryResult;
}
```

#### 4. Add Quick Discovery Mode for Backlog Processing

**File**: `lib/cron/background-filing-worker.ts`
**Changes**: Add a mode that only runs discovery without creating fetch jobs, allowing backlog clearing.

```typescript
// Add to BackgroundFilingWorker constructor options
interface WorkerOptions {
  batchSize?: number;
  processingInterval?: number;
  discoveryOnly?: boolean; // New option
}

// In processBatch, respect discoveryOnly mode
if (this.discoveryOnly && job.jobType !== 'ASYNC_DISCOVER_FILINGS') {
  continue; // Skip non-discovery jobs in discovery-only mode
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test`
- [ ] Discovery handler exports new types: `grep -r "DiscoveryResult" lib/cron/handlers/`

#### Manual Verification:
- [ ] Trigger cron manually and verify discovery completes in <30s
- [ ] Verify fetch jobs are created for discovered filings
- [ ] Check Vercel logs show no 524 timeout errors
- [ ] Confirm VRT filings appear in RssFilingCheck table

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Increase Throughput - Batch Sizing and Cron Frequency

### Overview
With the pipeline unblocked, increase processing capacity through smarter batch sizing and faster cron execution.

### Changes Required:

#### 1. Implement Job-Type-Aware Batch Sizing

**File**: `lib/cron/background-filing-worker.ts`
**Changes**: Add dynamic batch sizing based on job type.

```typescript
// Add batch size configuration by job type
const JOB_TYPE_BATCH_SIZES: Record<string, number> = {
  'ASYNC_DISCOVER_FILINGS': 10,    // Fast jobs (2-5s each) = 20-50s total
  'ASYNC_FETCH_FILING': 2,          // Medium jobs (60-90s each) = 120-180s total
  'ASYNC_SUMMARIZE_CACHED': 2,      // Medium jobs (30-60s each) = 60-120s total
};

// In processBatch, fetch jobs by type with appropriate batch sizes
private async getJobsByTypeWithBatching(): Promise<JobQueue[]> {
  const allJobs: JobQueue[] = [];

  for (const jobType of ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED']) {
    const batchSize = JOB_TYPE_BATCH_SIZES[jobType] || 1;
    const jobs = await JobQueueService.getJobsToProcessMultipleTypes(
      batchSize,
      [jobType as JobType]
    );
    allJobs.push(...jobs);
  }

  // Sort by priority and return up to overall batch limit
  return allJobs
    .sort((a, b) => b.priority - a.priority)
    .slice(0, this.batchSize);
}
```

#### 2. Update Process-Filing-Queue Endpoint

**File**: `app/api/cron/process-filing-queue/route.ts`
**Changes**: Increase batch size now that discovery is decoupled.

```typescript
// Change from:
const worker = new BackgroundFilingWorker({
  batchSize: 1,           // Process 1 filing per invocation
  processingInterval: 0,  // No wait between batches
});

// To:
const worker = new BackgroundFilingWorker({
  batchSize: 5,           // Process up to 5 jobs per invocation
  processingInterval: 0,  // No wait between batches (single run)
});
```

#### 3. Increase Cloudflare Cron Frequency

**File**: `cloudflare-cron/wrangler.toml`
**Changes**: Change from every 10 minutes to every 5 minutes.

```toml
# Change from:
[triggers]
crons = ["*/10 * * * *"]

# To:
[triggers]
crons = ["*/5 * * * *"]
```

#### 4. Add Throughput Metrics Logging

**File**: `lib/cron/background-filing-worker.ts`
**Changes**: Add metrics to track jobs processed per minute.

```typescript
// Add at end of processBatch:
const jobsPerMinute = batchResult.processed / (batchDuration / 60000);
workerLogger.info('Batch throughput metrics', {
  processId: this.processId,
  jobsProcessed: batchResult.processed,
  batchDurationMs: batchDuration,
  jobsPerMinute: jobsPerMinute.toFixed(2),
  jobTypes: jobs.map(j => j.jobType),
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Cloudflare Worker deploys: `cd cloudflare-cron && npx wrangler deploy --dry-run`

#### Manual Verification:
- [ ] Cron executes every 5 minutes (check Cloudflare dashboard)
- [ ] Multiple jobs processed per invocation (check Vercel logs)
- [ ] No timeout errors with new batch sizes
- [ ] Discovery backlog (9 jobs) cleared within 15 minutes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Filing-Level Deduplication

### Overview
Change idempotency from per-user to per-filing to dramatically reduce job count at scale. A filing watched by 100 users should create 1 processing job, not 100.

### Changes Required:

#### 1. Update Idempotency Key Format

**File**: `lib/cron/async-filing-queue.ts`
**Changes**: Change key format from per-user to per-filing.

```typescript
// Change from (line 88-90):
const idempotencyKey = options.idempotencyKey ??
  `filing-${payload.userId}-${payload.filing.accessionNumber}`;

// To:
const idempotencyKey = options.idempotencyKey ??
  `filing-${payload.filing.accessionNumber}-${payload.filing.formType}`;
```

#### 2. Update Discovery Handler Idempotency

**File**: `lib/cron/handlers/discovery-handler.ts`
**Changes**: Use filing-level idempotency for fetch jobs.

```typescript
// Change from (around line 133):
idempotencyKey: `fetch-${filing.accessionNumber}-${user.id}-${executionContext.executionId}`

// To:
idempotencyKey: `fetch-${filing.accessionNumber}-${filing.formType}`
```

#### 3. Add User Notification Fanout

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Changes**: After creating summary, notify ALL subscribed users.

```typescript
// After summary is saved to database, find all subscribed users
const subscribedUsers = await prisma.user.findMany({
  where: {
    tickers: {
      some: { symbol: ticker.symbol }
    }
  },
  select: { id: true, email: true }
});

// Send notification to each user
for (const user of subscribedUsers) {
  await JobQueueService.addJob({
    jobType: 'ASYNC_EMAIL_NOTIFICATION' as JobType,
    payload: {
      userId: user.id,
      userEmail: user.email,
      summaryId: summary.id,
      ticker: ticker.symbol,
      formType: filing.formType,
    },
    priority: 5,
    idempotencyKey: `email-${summary.id}-${user.id}`,
    maxAttempts: 3
  });
}
```

#### 4. Add Email Notification Job Type

**File**: `lib/job-queue/index.ts`
**Changes**: Add new job type for email notifications.

```typescript
// Add to JobType (around line 26):
| 'ASYNC_EMAIL_NOTIFICATION'

// Add to valid job types array (around line 97-103):
'ASYNC_EMAIL_NOTIFICATION',

// Add to skip list for security scanning (around line 115-121):
'ASYNC_EMAIL_NOTIFICATION',
```

#### 5. Create Email Notification Handler

**File**: `lib/cron/handlers/email-notification-handler.ts`
**Changes**: New handler for sending email notifications.

```typescript
import { prisma } from '@/lib/db';
import { sendFilingSummaryEmail } from '@/lib/email/filing-summary-email';
import { createLogger } from '@/lib/logging';

const logger = createLogger('email-notification-handler');

export interface EmailNotificationPayload {
  userId: string;
  userEmail: string;
  summaryId: string;
  ticker: string;
  formType: string;
}

export async function handleEmailNotification(
  payload: EmailNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  const { userId, userEmail, summaryId, ticker, formType } = payload;

  try {
    // Get the summary
    const summary = await prisma.summary.findUnique({
      where: { id: summaryId }
    });

    if (!summary) {
      return { success: false, error: 'Summary not found' };
    }

    // Send email
    await sendFilingSummaryEmail({
      to: userEmail,
      summary,
      ticker,
      formType,
    });

    logger.info('Email notification sent', {
      userId,
      summaryId,
      ticker,
    });

    return { success: true };
  } catch (error) {
    logger.error('Email notification failed', {
      userId,
      summaryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

#### 6. Add Handler Routing

**File**: `lib/cron/background-filing-worker.ts`
**Changes**: Route email notification jobs to handler.

```typescript
// Add to routeJobToHandler switch statement:
case 'ASYNC_EMAIL_NOTIFICATION': {
  const { handleEmailNotification } = await import('./handlers/email-notification-handler');
  return await handleEmailNotification(payload);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test`
- [ ] New handler file exists: `ls lib/cron/handlers/email-notification-handler.ts`

#### Manual Verification:
- [ ] Single filing creates only 1 fetch job regardless of subscriber count
- [ ] All subscribed users receive email notifications
- [ ] No duplicate emails sent to same user for same filing
- [ ] Verify with 2+ users watching same ticker

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Clean Up Legacy Jobs

### Overview
Clear the 494 FAILED + 19 PENDING + 24 RETRYING legacy `ASYNC_SUMMARIZE_FILING` jobs from the queue.

### Changes Required:

#### 1. Create Cleanup Script

**File**: `scripts/cleanup-legacy-jobs.ts`
**Changes**: Script to archive and clear legacy jobs.

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupLegacyJobs() {
  console.log('Starting legacy job cleanup...');

  // Count legacy jobs
  const counts = await prisma.jobQueue.groupBy({
    by: ['status'],
    where: { jobType: 'ASYNC_SUMMARIZE_FILING' },
    _count: true,
  });

  console.log('Legacy job counts by status:');
  counts.forEach(c => console.log(`  ${c.status}: ${c._count}`));

  // Archive job data to JSON file before deletion
  const legacyJobs = await prisma.jobQueue.findMany({
    where: { jobType: 'ASYNC_SUMMARIZE_FILING' },
    select: {
      id: true,
      status: true,
      payload: true,
      lastError: true,
      createdAt: true,
      failedAt: true,
    }
  });

  const archivePath = `./legacy-jobs-archive-${new Date().toISOString().split('T')[0]}.json`;
  require('fs').writeFileSync(archivePath, JSON.stringify(legacyJobs, null, 2));
  console.log(`Archived ${legacyJobs.length} jobs to ${archivePath}`);

  // Delete legacy jobs
  const deleted = await prisma.jobQueue.deleteMany({
    where: { jobType: 'ASYNC_SUMMARIZE_FILING' }
  });

  console.log(`Deleted ${deleted.count} legacy jobs`);

  await prisma.$disconnect();
}

cleanupLegacyJobs().catch(console.error);
```

#### 2. Add Missing CIK Mappings

**File**: `scripts/add-missing-cik-mappings.sql`
**Changes**: SQL script to add COIN, CMG, GOOG mappings.

```sql
-- Add missing CIK mappings for user-subscribed tickers
INSERT INTO "CikMapping" (
  "cik", "ticker", "companyName", "aliases", "exchangeCodes",
  "lastUpdated", "isActive", "fetchAttempts", "source"
) VALUES
  ('0001679788', 'COIN', 'Coinbase Global, Inc.',
   ARRAY['COINBASE GLOBAL INC', 'COINBASE'], ARRAY['NASDAQ'],
   NOW(), true, 0, 'MANUAL_SEED'),
  ('0001058090', 'CMG', 'Chipotle Mexican Grill, Inc.',
   ARRAY['CHIPOTLE MEXICAN GRILL INC', 'CHIPOTLE'], ARRAY['NYSE'],
   NOW(), true, 0, 'MANUAL_SEED'),
  ('0001652044', 'GOOG', 'Alphabet Inc.',
   ARRAY['ALPHABET INC', 'GOOGLE'], ARRAY['NASDAQ'],
   NOW(), true, 0, 'MANUAL_SEED')
ON CONFLICT ("cik") DO UPDATE SET
  "ticker" = EXCLUDED."ticker",
  "companyName" = EXCLUDED."companyName",
  "aliases" = EXCLUDED."aliases",
  "lastUpdated" = NOW();

-- Verify
SELECT "ticker", "cik", "companyName" FROM "CikMapping"
WHERE "ticker" IN ('COIN', 'CMG', 'GOOG');
```

#### 3. Create TickerMonitoring Entries

**File**: `scripts/add-ticker-monitoring.sql`
**Changes**: SQL script to add monitoring entries for new tickers.

```sql
-- Add TickerMonitoring entries for new CIK mappings
INSERT INTO "TickerMonitoring" (
  "id", "cik", "ticker", "rssUrl", "lastChecked", "subscriberCount"
)
SELECT
  gen_random_uuid(),
  cm."cik",
  cm."ticker",
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' || cm."cik" || '&output=atom',
  NOW() - INTERVAL '1 hour', -- Set to 1 hour ago so it gets checked soon
  (SELECT COUNT(*) FROM "User" u
   JOIN "_TickerToUser" tu ON u."id" = tu."B"
   JOIN "Ticker" t ON t."id" = tu."A"
   WHERE t."symbol" = cm."ticker")
FROM "CikMapping" cm
WHERE cm."ticker" IN ('COIN', 'CMG', 'GOOG')
ON CONFLICT ("cik") DO UPDATE SET
  "ticker" = EXCLUDED."ticker",
  "rssUrl" = EXCLUDED."rssUrl",
  "lastChecked" = EXCLUDED."lastChecked";

-- Verify
SELECT "ticker", "cik", "rssUrl", "lastChecked" FROM "TickerMonitoring"
WHERE "ticker" IN ('COIN', 'CMG', 'GOOG');
```

### Success Criteria:

#### Automated Verification:
- [ ] Scripts execute without error
- [ ] Legacy job count is 0: `SELECT COUNT(*) FROM "JobQueue" WHERE "jobType" = 'ASYNC_SUMMARIZE_FILING'`
- [ ] CIK mappings exist for COIN, CMG, GOOG
- [ ] TickerMonitoring entries exist for COIN, CMG, GOOG

#### Manual Verification:
- [ ] Legacy jobs archive file created with expected data
- [ ] No disruption to active 3-phase pipeline jobs
- [ ] New tickers appear in RSS feed checks

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
- Test `createFetchJobsBatch()` with various batch sizes
- Test `DiscoveryResult` type handling in worker
- Test email notification handler
- Test idempotency key generation

### Integration Tests:
- Full pipeline flow: Discovery → Fetch → Summarize → Email
- Batch processing with mixed job types
- Idempotency deduplication verification

### Manual Testing Steps:
1. Trigger cron manually via Cloudflare dashboard
2. Monitor Vercel logs for timeout errors
3. Verify job queue progression in database
4. Check email delivery for test user
5. Verify VRT filings are discovered and processed

## Performance Considerations

### Expected Improvements

| Metric | Before | After (Tier 1) | After (Tier 2) |
|--------|--------|----------------|----------------|
| Jobs/hour | 6 | 60 | 600+ |
| Discovery batch | 1 | 10 | 10 |
| Cron frequency | 10 min | 5 min | 5 min |
| Jobs per filing | N users | N users | 1 |

### Monitoring Points
- Vercel function duration (should stay <180s)
- Job queue depth by status
- Discovery-to-email latency
- Failed job rate

## Migration Notes

### Rollback Plan
1. Revert Cloudflare cron to `*/10`
2. Revert batch size to 1
3. Revert idempotency key format
4. Re-enable legacy job processing if needed

### Data Migration
- Legacy jobs archived before deletion
- Existing idempotency keys continue to work (old format still valid)
- New summary notifications use new fanout pattern

## References

- Research document: [thoughts/shared/research/2025-11-27-vrt-form4-processing-failure-investigation.md](../../thoughts/shared/research/2025-11-27-vrt-form4-processing-failure-investigation.md)
- PROGRESS.md: [PROGRESS.md](../../PROGRESS.md)
- BackgroundFilingWorker: [lib/cron/background-filing-worker.ts](../../lib/cron/background-filing-worker.ts)
- Discovery handler: [lib/cron/handlers/discovery-handler.ts](../../lib/cron/handlers/discovery-handler.ts)
- Async filing queue: [lib/cron/async-filing-queue.ts](../../lib/cron/async-filing-queue.ts)
- Process filing queue: [app/api/cron/process-filing-queue/route.ts](../../app/api/cron/process-filing-queue/route.ts)
- Cloudflare Worker: [cloudflare-cron/wrangler.toml](../../cloudflare-cron/wrangler.toml)
