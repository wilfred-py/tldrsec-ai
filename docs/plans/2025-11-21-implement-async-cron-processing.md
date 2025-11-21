# Implement Async Cron Processing to Fix 524 Timeout

**Date**: 2025-11-21 00:06:37 CST
**Git Commit**: db2f45e36db28c20ba146b475e7bd34aed00c535
**Branch**: fix/e2e-cron-pipeline-execution
**Repository**: tldrsec-ai

## Overview

Convert the tier-aware cron endpoint from synchronous to asynchronous processing to eliminate the 524 Cloudflare timeout occurring at 125 seconds. The endpoint currently waits for all filing processing (which takes 2-4 minutes) before sending a response. With async processing, the endpoint will return 200 OK immediately (within 5-10 seconds) after queueing jobs, while background workers handle the time-consuming filing summarization.

**Key Insight**: The codebase already has production-ready async email queue infrastructure. We'll build fresh async filing processing following the same proven pattern.

## Current State Analysis

### What Works ✅
- Lock acquisition and cleanup: ~150-300ms
- Database queries: ~100-500ms per query
- Email delivery: Already async via `async-email-queue.ts`
- Job queue infrastructure: `JobQueueService` in production
- Authentication and validation: <2 seconds

### What Fails ❌
- **Primary Issue**: Endpoint waits for ALL processing before response
- **Timeline to timeout**:
  - 0-50s: Filing 1 (SEC API + AI summarization)
  - 50-90s: Filing 2 (SEC API + AI summarization)
  - 90-125s: Filing 3 starts → **Cloudflare times out**
- **Bottleneck**: AI summarization takes 15-180 seconds per filing (75-90% of time)
- **Root Cause**: No early response mechanism

### Key Discoveries from Research

**File**: [app/api/cron/tier-aware/route.ts:911](../app/api/cron/tier-aware/route.ts#L911)
- Response sent AFTER all processing completes
- No 202 Accepted or streaming response
- Timeout protection only allows graceful shutdown, not early response

**File**: [lib/cron/filing-processor.ts:540](../lib/cron/filing-processor.ts#L540)
- Sequential filing processing: ~20-50 seconds per filing
- AI summarization: 15-180 seconds (cache miss)
- Cannot be parallelized (each step depends on previous)

**File**: [lib/email/async-email-queue.ts:72](../lib/email/async-email-queue.ts#L72)
- Proven async pattern in production
- Returns job ID immediately, processes in background
- Uses `JobQueueService` with retry logic and monitoring

## Desired End State

### Success Criteria (Build for Scale)

**Immediate Response** (within 5-10 seconds):
- ✅ Cloudflare Worker triggers cron every 10 minutes
- ✅ Endpoint authenticates and validates request
- ✅ Endpoint queues all filing jobs to database
- ✅ **Returns 200 OK with job tracking information**
- ✅ Response time: <10 seconds (vs current 125+ seconds)

**Background Processing** (happens after response):
- ✅ Background worker picks up jobs from queue
- ✅ Processes filings (SEC API + AI + database + email)
- ✅ Handles retries with exponential backoff
- ✅ Updates job status in database
- ✅ Logs all operations for monitoring

**Verification**:
```bash
# Automated verification
npm run test:e2e                    # Direct API test passes
npm run test:cron-comprehensive     # Cron integration tests pass
npm run cloudflare:logs             # Show 200 OK responses <10s

# Manual verification
# 1. Check Cloudflare logs show 200 OK within 10 seconds
# 2. Check database JobQueue records created
# 3. Check TEST_EMAIL receives summary (background processing)
# 4. Verify no 524 timeouts in logs
```

## What We're NOT Doing

**Out of Scope**:
- ❌ Modifying Cloudflare Worker code (no changes needed)
- ❌ Changing timeout values (270s is optimal for async pattern)
- ❌ Implementing real-time WebSocket updates for job status
- ❌ Building job status dashboard (can be added later)
- ❌ Re-enabling disabled async files (building fresh)
- ❌ Optimizing AI summarization speed (separate effort)
- ❌ Parallelizing filing processing within jobs (sequential is fine for background)
- ❌ Implementing priority queue for different user tiers (Phase 3 enhancement)

## Implementation Approach

**Strategy**: Build fresh async filing processor following the proven `async-email-queue.ts` pattern. Use existing `JobQueueService` infrastructure with minimal new code. Implement in 3 phases: (1) async job queueing, (2) background worker, (3) monitoring and optimization.

**Keep timeout at 270s** - perfect for async operations and provides safety buffer within Vercel's 5-minute limit.

---

## Phase 1: Implement Async Filing Job Queue (1-2 days)

### Overview
Create async filing job queue service following the `async-email-queue.ts` pattern. The cron endpoint will queue filing jobs and return immediately, while job metadata tracks processing status.

### Changes Required

#### 1. Create Async Filing Queue Service

**File**: `lib/cron/async-filing-queue.ts` (create new file)

**Implementation**:
```typescript
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { JobQueueService } from '@/lib/job-queue';
import type { JobType } from '@prisma/client';

const queueLogger = logger.child('async-filing-queue');

export interface FilingJobPayload {
  userId: string;
  userEmail: string;
  userTier: string;
  ticker: {
    symbol: string;
    companyName: string;
    cik: string;
  };
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
    sourceContext: 'cron' | 'manual' | 'backlog';
  };
  metadata?: Record<string, unknown>;
}

export interface QueueFilingResult {
  success: boolean;
  jobId: string;
  estimatedCompletionTime: Date;
  queuePosition: number;
}

export class AsyncFilingQueue {
  /**
   * Queue a filing for async processing
   * Returns immediately with job tracking information
   *
   * Pattern: Follows async-email-queue.ts design
   */
  static async queueFilingForProcessing(
    payload: FilingJobPayload,
    options: {
      priority?: number;
      scheduledFor?: Date;
      idempotencyKey?: string;
    } = {}
  ): Promise<QueueFilingResult> {
    const requestId = uuidv4();

    queueLogger.info('Queueing filing for async processing', {
      requestId,
      ticker: payload.ticker.symbol,
      formType: payload.filing.formType,
      userId: payload.userId,
      executionId: payload.executionContext.executionId,
    });

    try {
      // Determine priority based on user tier
      const priority = options.priority ?? this.determinePriority(payload.userTier);

      // Create idempotency key to prevent duplicate jobs
      const idempotencyKey = options.idempotencyKey ??
        `filing-${payload.userId}-${payload.filing.accessionNumber}`;

      // Add job to queue
      const job = await JobQueueService.addJob({
        jobType: 'ASYNC_SUMMARIZE_FILING' as JobType,
        payload: payload as any,
        priority,
        scheduledFor: options.scheduledFor || new Date(),
        idempotencyKey,
        maxAttempts: 3, // Retry up to 3 times
      });

      // Estimate completion time based on queue depth
      const queueDepth = await this.getQueueDepth();
      const estimatedMinutes = Math.ceil(queueDepth / 3) * 2; // 2 min per batch of 3
      const estimatedCompletionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);

      queueLogger.info('Filing queued successfully', {
        requestId,
        jobId: job.id,
        ticker: payload.ticker.symbol,
        queuePosition: queueDepth + 1,
        estimatedCompletionMinutes: estimatedMinutes,
      });

      return {
        success: true,
        jobId: job.id,
        estimatedCompletionTime,
        queuePosition: queueDepth + 1,
      };
    } catch (error) {
      queueLogger.error('Failed to queue filing', {
        requestId,
        ticker: payload.ticker.symbol,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Queue multiple filings in batch
   * More efficient than queuing one at a time
   */
  static async queueMultipleFilings(
    filings: FilingJobPayload[],
    options: {
      priority?: number;
      scheduledFor?: Date;
    } = {}
  ): Promise<QueueFilingResult[]> {
    queueLogger.info('Batch queueing filings', {
      count: filings.length,
      tickers: filings.map(f => f.ticker.symbol),
    });

    const results: QueueFilingResult[] = [];

    for (const filing of filings) {
      try {
        const result = await this.queueFilingForProcessing(filing, options);
        results.push(result);
      } catch (error) {
        queueLogger.error('Failed to queue filing in batch', {
          ticker: filing.ticker.symbol,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Continue with other filings even if one fails
        results.push({
          success: false,
          jobId: '',
          estimatedCompletionTime: new Date(),
          queuePosition: 0,
        });
      }
    }

    queueLogger.info('Batch queue complete', {
      total: filings.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    return results;
  }

  /**
   * Determine job priority based on user tier
   */
  private static determinePriority(userTier: string): number {
    const tierPriorities: Record<string, number> = {
      PRO: 9,       // Highest priority
      HOBBY: 7,     // Medium priority
      FREE: 5,      // Normal priority
    };

    return tierPriorities[userTier.toUpperCase()] ?? 5;
  }

  /**
   * Get current queue depth for estimation
   */
  private static async getQueueDepth(): Promise<number> {
    try {
      const depth = await JobQueueService.getQueueDepth('ASYNC_SUMMARIZE_FILING' as JobType);
      return depth;
    } catch (error) {
      queueLogger.warn('Failed to get queue depth, using estimate', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 10; // Default estimate
    }
  }

  /**
   * Get job status for tracking
   */
  static async getJobStatus(jobId: string) {
    return await JobQueueService.getJobStatus(jobId);
  }
}
```

**Why this approach**:
- Matches proven `async-email-queue.ts` pattern
- Uses existing `JobQueueService` infrastructure
- Returns immediately with job tracking
- Handles idempotency to prevent duplicate processing
- Priority-based processing for different tiers

#### 2. Update Cron Endpoint to Queue Jobs

**File**: `app/api/cron/tier-aware/route.ts`

**Changes**: Modify backlog processing section (lines 389-608)

**Before** (synchronous processing):
```typescript
// Lines 389-608: Current synchronous backlog processing
if (unprocessedCount > 0) {
  const maxBacklogFilings = Math.min(5, unprocessedCount);
  const backlogFilings = unprocessedFilings.slice(0, maxBacklogFilings);

  // Process in parallel batches of 3
  for (let i = 0; i < backlogFilings.length; i += PARALLEL_BATCH_SIZE) {
    const batch = backlogFilings.slice(i, i + PARALLEL_BATCH_SIZE);

    // Wait for batch to complete before continuing
    const batchResults = await Promise.allSettled(
      batch.map(filing => processSingleFiling(filing, user, ...))
    );
  }
}
```

**After** (async job queueing):
```typescript
// Import async filing queue
import { AsyncFilingQueue, type FilingJobPayload } from '@/lib/cron/async-filing-queue';

// Lines 389-608: Modified to queue jobs instead of processing
if (unprocessedCount > 0) {
  const queueStartTime = Date.now();

  cronLogger.info(`[${executionId}] Queueing ${unprocessedCount} backlog filings for async processing`);

  const maxBacklogFilings = Math.min(5, unprocessedCount);
  const backlogFilings = unprocessedFilings.slice(0, maxBacklogFilings);

  // Collect all filings to queue
  const filingsToQueue: FilingJobPayload[] = [];

  for (const filing of backlogFilings) {
    // Get users subscribed to this ticker
    const usersForTicker = await prisma.user.findMany({
      where: {
        tickers: {
          some: { symbol: filing.ticker.symbol }
        }
      },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
      }
    });

    // Queue job for each user
    for (const user of usersForTicker) {
      filingsToQueue.push({
        userId: user.id,
        userEmail: user.email,
        userTier: user.subscriptionTier,
        ticker: {
          symbol: filing.ticker.symbol,
          companyName: filing.ticker.companyName,
          cik: filing.ticker.cik,
        },
        filing: {
          filingId: filing.filingId,
          formType: filing.filingType,
          filingDate: filing.filingDate,
          filingUrl: filing.filingUrl,
          accessionNumber: filing.accessionNumber,
        },
        executionContext: {
          executionId,
          cronTriggerTime: new Date().toISOString(),
          sourceContext: 'backlog',
        },
      });
    }
  }

  // Queue all filings in batch (FAST - returns immediately)
  const queueResults = await AsyncFilingQueue.queueMultipleFilings(filingsToQueue);

  const queueDuration = Date.now() - queueStartTime;
  const successCount = queueResults.filter(r => r.success).length;

  cronLogger.info(`[${executionId}] Backlog filings queued`, {
    totalFilings: filingsToQueue.length,
    successfullyQueued: successCount,
    failed: filingsToQueue.length - successCount,
    queueDuration,
    averageQueueTime: queueDuration / filingsToQueue.length,
  });

  // Update metrics
  metrics.backlogFilingsQueued = successCount;
  metrics.queueDuration = queueDuration;
}
```

**Why this change**:
- Eliminates 2-4 minute wait for filing processing
- Returns response within 5-10 seconds
- Database queries still run but only for queueing (~5-10ms per job)
- Maintains same filing tracking and user association

#### 3. Update Response Format

**File**: `app/api/cron/tier-aware/route.ts` (lines 911-920)

**Current Response**:
```typescript
return NextResponse.json({
  success: true,
  executionId: monitorResult.executionId,
  duration: monitorResult.duration,
  marketContext: { ... },
  results
});
```

**Updated Response**:
```typescript
return NextResponse.json({
  success: true,
  executionId: monitorResult.executionId,
  duration: monitorResult.duration,
  processingMode: 'async',
  marketContext: { ... },
  queue: {
    filingsQueued: metrics.backlogFilingsQueued || 0,
    estimatedCompletionTime: new Date(Date.now() + 300000), // 5 minutes estimate
    message: 'Filings queued for background processing'
  },
  results: {
    message: 'Background processing initiated',
    // Note: actual filing processing happens asynchronously
  }
}, {
  headers: {
    'X-Processing-Mode': 'async',
    'X-Execution-ID': executionId,
    'X-Filings-Queued': String(metrics.backlogFilingsQueued || 0),
  }
});
```

**Why this change**:
- Clearly indicates async processing mode
- Provides job tracking information
- Maintains backward compatibility with monitoring systems
- Custom headers for debugging

#### 4. Add JobQueue getQueueDepth Method

**File**: `lib/job-queue/index.ts`

**Add method**:
```typescript
/**
 * Get current queue depth for a specific job type
 * Used for estimation of completion time
 */
static async getQueueDepth(jobType: JobType): Promise<number> {
  return await prisma.jobQueue.count({
    where: {
      jobType,
      status: { in: ['PENDING', 'RETRYING'] },
    }
  });
}
```

**Why this addition**:
- Enables realistic completion time estimates
- Helps with monitoring and capacity planning
- Matches async-email-queue pattern

### Success Criteria

#### Automated Verification:
- [ ] Code compiles without errors: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test`
- [ ] Type checking passes: `tsc --noEmit`
- [ ] New async queue file has no import errors
- [ ] Cron endpoint compiles with new async code

#### Manual Verification:
- [ ] Cron endpoint returns 200 OK within 10 seconds (measure with logs)
- [ ] Response includes `processingMode: 'async'` field
- [ ] Response includes `queue.filingsQueued` count
- [ ] Database `JobQueue` table shows new records with type `ASYNC_SUMMARIZE_FILING`
- [ ] No 524 timeout errors in Cloudflare logs
- [ ] Job records have correct `payload` structure
- [ ] Idempotency keys prevent duplicate jobs when endpoint called twice

**Implementation Note**: After completing this phase, the cron endpoint will return immediately but filings won't be processed yet (that's Phase 2). Test that jobs are queued correctly before proceeding.

---

## Phase 2: Implement Background Filing Worker (1-2 days)

### Overview
Create background worker process that picks up queued filing jobs and processes them using existing filing processor logic. Worker runs continuously or on scheduled intervals, processing jobs in batches with proper error handling and retries.

### Changes Required

#### 1. Create Background Filing Worker

**File**: `lib/cron/background-filing-worker.ts` (create new file)

**Implementation**:
```typescript
import { logger } from '@/lib/logger';
import { JobQueueService } from '@/lib/job-queue';
import { CronFilingProcessor } from '@/lib/cron/filing-processor';
import { getPrismaClient } from '@/lib/db/prisma-client';
import type { FilingJobPayload } from '@/lib/cron/async-filing-queue';

const workerLogger = logger.child('background-filing-worker');
const prisma = getPrismaClient();

export class BackgroundFilingWorker {
  private isRunning = false;
  private processId: string;
  private batchSize: number;
  private processingInterval: number;

  constructor(options: {
    batchSize?: number;
    processingInterval?: number;
  } = {}) {
    this.processId = `filing-worker-${process.pid}-${Date.now()}`;
    this.batchSize = options.batchSize || 3; // Process 3 filings at a time
    this.processingInterval = options.processingInterval || 30000; // 30 seconds between batches
  }

  /**
   * Start the background worker
   * Continuously processes queued filing jobs
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      workerLogger.warn('Worker already running', { processId: this.processId });
      return;
    }

    this.isRunning = true;
    workerLogger.info('Starting background filing worker', {
      processId: this.processId,
      batchSize: this.batchSize,
      processingInterval: this.processingInterval,
    });

    while (this.isRunning) {
      try {
        await this.processBatch();
      } catch (error) {
        workerLogger.error('Error in worker loop', {
          processId: this.processId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Wait before next batch
      await new Promise(resolve => setTimeout(resolve, this.processingInterval));
    }

    workerLogger.info('Background filing worker stopped', { processId: this.processId });
  }

  /**
   * Stop the background worker
   */
  stop(): void {
    workerLogger.info('Stopping background filing worker', { processId: this.processId });
    this.isRunning = false;
  }

  /**
   * Process a batch of queued filing jobs
   */
  private async processBatch(): Promise<void> {
    const batchStartTime = Date.now();

    // Get jobs to process
    const jobs = await JobQueueService.getJobsToProcess(
      this.batchSize,
      'ASYNC_SUMMARIZE_FILING' as any
    );

    if (jobs.length === 0) {
      workerLogger.debug('No jobs to process', { processId: this.processId });
      return;
    }

    workerLogger.info('Processing job batch', {
      processId: this.processId,
      jobCount: jobs.length,
      jobIds: jobs.map(j => j.id),
    });

    // Process jobs sequentially (respects SEC API rate limits)
    for (const job of jobs) {
      await this.processJob(job);
    }

    const batchDuration = Date.now() - batchStartTime;
    workerLogger.info('Batch processing complete', {
      processId: this.processId,
      jobCount: jobs.length,
      duration: batchDuration,
      averageJobTime: batchDuration / jobs.length,
    });
  }

  /**
   * Process a single filing job
   */
  private async processJob(job: any): Promise<void> {
    const jobStartTime = Date.now();
    const payload = job.payload as FilingJobPayload;

    workerLogger.info('Processing filing job', {
      processId: this.processId,
      jobId: job.id,
      ticker: payload.ticker.symbol,
      formType: payload.filing.formType,
      userId: payload.userId,
      executionId: payload.executionContext.executionId,
    });

    try {
      // Update job status to PROCESSING
      await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
        startedAt: new Date(),
        processedBy: this.processId,
      });

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          tickers: {
            where: { symbol: payload.ticker.symbol },
          },
        },
      });

      if (!user) {
        throw new Error(`User not found: ${payload.userId}`);
      }

      // Process filing using existing processor
      const result = await CronFilingProcessor.processSingleFiling(
        {
          filingId: payload.filing.filingId,
          filingType: payload.filing.formType,
          filingDate: payload.filing.filingDate,
          filingUrl: payload.filing.filingUrl,
          accessionNumber: payload.filing.accessionNumber,
          ticker: payload.ticker,
        },
        user,
        payload.userTier,
        {
          symbol: payload.ticker.symbol,
          cik: payload.ticker.cik,
        },
        payload.ticker
      );

      if (result.success) {
        // Update job status to COMPLETED
        await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
          completedAt: new Date(),
          result: {
            summaryId: result.summaryId,
            emailSent: result.emailSent,
            cached: result.cached,
          },
        });

        const jobDuration = Date.now() - jobStartTime;
        workerLogger.info('Filing job completed successfully', {
          processId: this.processId,
          jobId: job.id,
          ticker: payload.ticker.symbol,
          summaryId: result.summaryId,
          duration: jobDuration,
          cached: result.cached,
        });
      } else {
        throw new Error(result.error || 'Filing processing failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      workerLogger.error('Filing job failed', {
        processId: this.processId,
        jobId: job.id,
        ticker: payload.ticker.symbol,
        error: errorMessage,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
      });

      // Update job status to FAILED (JobQueueService handles retries)
      await JobQueueService.updateJobStatus(job.id, 'FAILED', {
        failedAt: new Date(),
        error: errorMessage,
        retryable: true,
      });
    }
  }
}

/**
 * Singleton worker instance
 */
let workerInstance: BackgroundFilingWorker | null = null;

/**
 * Start the background worker
 * Should be called when application starts
 */
export async function startFilingWorker(options?: {
  batchSize?: number;
  processingInterval?: number;
}): Promise<void> {
  if (workerInstance) {
    workerLogger.warn('Worker already exists');
    return;
  }

  workerInstance = new BackgroundFilingWorker(options);
  await workerInstance.start();
}

/**
 * Stop the background worker
 * Should be called during graceful shutdown
 */
export function stopFilingWorker(): void {
  if (!workerInstance) {
    workerLogger.warn('No worker instance to stop');
    return;
  }

  workerInstance.stop();
  workerInstance = null;
}
```

**Why this approach**:
- Follows proven background worker pattern
- Processes jobs sequentially (respects SEC API rate limits)
- Uses existing `CronFilingProcessor` (no duplicate logic)
- Proper error handling and retry logic
- Graceful start/stop for deployment

#### 2. Create Worker API Endpoint

**File**: `app/api/cron/process-filing-queue/route.ts` (create new file)

**Implementation**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { BackgroundFilingWorker } from '@/lib/cron/background-filing-worker';
import { logger } from '@/lib/logger';

const routeLogger = logger.child('process-filing-queue');

/**
 * API endpoint to trigger background filing processing
 * Called by:
 * 1. Vercel Cron (every 5 minutes)
 * 2. Manual trigger for debugging
 * 3. Cloudflare Worker (alternative trigger)
 */
export async function GET(request: NextRequest) {
  const executionId = `queue-processor-${Date.now()}`;

  routeLogger.info('Filing queue processing triggered', { executionId });

  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (providedSecret !== process.env.CRON_SECRET) {
      routeLogger.warn('Unauthorized filing queue processing attempt', {
        executionId,
        hasAuthHeader: !!authHeader,
      });

      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create worker instance for this execution
    const worker = new BackgroundFilingWorker({
      batchSize: 3,           // Process 3 filings at a time
      processingInterval: 0,  // No wait between batches (single run)
    });

    // Process one batch and return
    const startTime = Date.now();
    await worker.processBatch();
    const duration = Date.now() - startTime;

    routeLogger.info('Filing queue batch processed', {
      executionId,
      duration,
    });

    return NextResponse.json({
      success: true,
      executionId,
      duration,
      message: 'Filing queue batch processed',
    });
  } catch (error) {
    routeLogger.error('Filing queue processing failed', {
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function HEAD(request: NextRequest) {
  return new NextResponse(null, { status: 200 });
}
```

**Why this approach**:
- Separate endpoint for queue processing
- Can be called by Vercel Cron or manually
- Processes one batch per invocation (5-10 minutes)
- Properly authenticated with CRON_SECRET

#### 3. Add Vercel Cron Configuration

**File**: `vercel.json`

**Add new cron job**:
```json
{
  "crons": [
    {
      "path": "/api/cron/tier-aware",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/cron/process-filing-queue",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Why this addition**:
- Worker runs every 5 minutes (2x frequency of main cron)
- Ensures queue doesn't build up
- Independent from main cron trigger
- Can be adjusted based on load

#### 4. Update package.json Scripts

**File**: `package.json`

**Add test scripts**:
```json
{
  "scripts": {
    "worker:start": "npx tsx lib/cron/background-filing-worker.ts",
    "worker:test": "npx tsx scripts/test-filing-worker.ts",
    "queue:status": "npx tsx scripts/check-queue-status.ts"
  }
}
```

#### 5. Create Worker Test Script

**File**: `scripts/test-filing-worker.ts` (create new file)

**Implementation**:
```typescript
import { BackgroundFilingWorker } from '@/lib/cron/background-filing-worker';
import { AsyncFilingQueue } from '@/lib/cron/async-filing-queue';
import { logger } from '@/lib/logger';

const testLogger = logger.child('worker-test');

async function testWorker() {
  testLogger.info('🧪 Testing background filing worker...');

  // 1. Queue a test job
  testLogger.info('Queueing test filing job...');

  const testJob = await AsyncFilingQueue.queueFilingForProcessing({
    userId: 'test-user-id',
    userEmail: 'test@example.com',
    userTier: 'HOBBY',
    ticker: {
      symbol: 'TSLA',
      companyName: 'Tesla, Inc.',
      cik: '0001318605',
    },
    filing: {
      filingId: 'test-filing-123',
      formType: '8-K',
      filingDate: new Date().toISOString(),
      filingUrl: 'https://example.com/filing',
      accessionNumber: '0001318605-25-000001',
    },
    executionContext: {
      executionId: 'test-execution',
      cronTriggerTime: new Date().toISOString(),
      sourceContext: 'manual',
    },
  });

  testLogger.info('Test job queued', { jobId: testJob.jobId });

  // 2. Create worker and process one batch
  testLogger.info('Starting worker for one batch...');

  const worker = new BackgroundFilingWorker({
    batchSize: 1,
    processingInterval: 0,
  });

  await worker.processBatch();

  testLogger.info('✅ Worker test complete');
}

testWorker()
  .catch(error => {
    testLogger.error('❌ Worker test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

### Success Criteria

#### Automated Verification:
- [x] Worker code compiles: `npm run build`
- [ ] Worker test script runs: `npm run worker:test`
- [x] Linting passes: `npm run lint`
- [x] Type checking passes: `tsc --noEmit`
- [ ] Unit tests pass: `npm run test`

#### Manual Verification:
- [x] Queue processing endpoint authentication works (rejects without CRON_SECRET)
- [x] Worker picks up queued jobs from database (verified via `npm run worker:test`)
- [x] Worker processes filing using existing `CronFilingProcessor`
- [x] Job status updates: PENDING → PROCESSING → FAILED (with retry logic)
- [x] Failed jobs marked for retry (retryCount tracked)
- [x] Worker logs show processing with timing metrics
- [x] Database `JobQueue` table tracks job status (51 pending jobs verified)
- [ ] TEST_EMAIL receives summary after worker processes job (requires real user)
- [ ] Full end-to-end test with real filing and email delivery

**Implementation Note**: After completing this phase, the full async pipeline works end-to-end. Test with a real filing to ensure email delivery works.

---

## Phase 3: Monitoring and Optimization (1 day)

### Overview
Add monitoring, alerting, and performance tracking for the async queue system. Create dashboards for queue depth, processing times, and failure rates. Implement queue health checks and capacity planning.

### Changes Required

#### 1. Create Queue Monitoring Service

**File**: `lib/cron/queue-monitoring.ts` (create new file)

**Implementation**:
```typescript
import { logger } from '@/lib/logger';
import { JobQueueService } from '@/lib/job-queue';
import { getPrismaClient } from '@/lib/db/prisma-client';

const monitorLogger = logger.child('queue-monitoring');
const prisma = getPrismaClient();

export interface QueueMetrics {
  queueDepth: number;
  pendingJobs: number;
  processingJobs: number;
  completedLast24h: number;
  failedLast24h: number;
  averageProcessingTime: number;
  oldestPendingJob: Date | null;
  estimatedProcessingTime: number;
}

export class QueueMonitoringService {
  /**
   * Get comprehensive queue metrics
   */
  static async getQueueMetrics(): Promise<QueueMetrics> {
    const jobType = 'ASYNC_SUMMARIZE_FILING';
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      pendingJobs,
      processingJobs,
      completedJobs,
      failedJobs,
      avgProcessingTime,
      oldestJob,
    ] = await Promise.all([
      // Pending jobs count
      prisma.jobQueue.count({
        where: {
          jobType: jobType as any,
          status: 'PENDING',
        },
      }),

      // Processing jobs count
      prisma.jobQueue.count({
        where: {
          jobType: jobType as any,
          status: 'PROCESSING',
        },
      }),

      // Completed jobs in last 24h
      prisma.jobQueue.count({
        where: {
          jobType: jobType as any,
          status: 'COMPLETED',
          completedAt: { gte: oneDayAgo },
        },
      }),

      // Failed jobs in last 24h
      prisma.jobQueue.count({
        where: {
          jobType: jobType as any,
          status: 'FAILED',
          failedAt: { gte: oneDayAgo },
        },
      }),

      // Average processing time (last 24h)
      prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
        FROM "JobQueue"
        WHERE job_type = ${jobType}
          AND status = 'COMPLETED'
          AND completed_at >= ${oneDayAgo}
      ` as Promise<Array<{ avg_seconds: number | null }>>,

      // Oldest pending job
      prisma.jobQueue.findFirst({
        where: {
          jobType: jobType as any,
          status: 'PENDING',
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          createdAt: true,
        },
      }),
    ]);

    const avgSeconds = avgProcessingTime[0]?.avg_seconds || 30;
    const queueDepth = pendingJobs + processingJobs;
    const estimatedMinutes = Math.ceil(queueDepth / 3) * (avgSeconds / 60);

    return {
      queueDepth,
      pendingJobs,
      processingJobs,
      completedLast24h: completedJobs,
      failedLast24h: failedJobs,
      averageProcessingTime: avgSeconds,
      oldestPendingJob: oldestJob?.createdAt || null,
      estimatedProcessingTime: estimatedMinutes,
    };
  }

  /**
   * Check queue health and alert if needed
   */
  static async checkQueueHealth(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: QueueMetrics;
  }> {
    const metrics = await this.getQueueMetrics();
    const issues: string[] = [];

    // Check 1: Queue depth too high
    if (metrics.queueDepth > 100) {
      issues.push(`Queue depth exceeds threshold: ${metrics.queueDepth} jobs`);
    }

    // Check 2: Old pending jobs
    if (metrics.oldestPendingJob) {
      const ageMinutes = (Date.now() - metrics.oldestPendingJob.getTime()) / 60000;
      if (ageMinutes > 30) {
        issues.push(`Oldest job pending for ${ageMinutes.toFixed(0)} minutes`);
      }
    }

    // Check 3: High failure rate
    const totalJobs = metrics.completedLast24h + metrics.failedLast24h;
    if (totalJobs > 0) {
      const failureRate = metrics.failedLast24h / totalJobs;
      if (failureRate > 0.2) {
        issues.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
      }
    }

    // Check 4: Processing time too high
    if (metrics.averageProcessingTime > 120) {
      issues.push(`Average processing time high: ${metrics.averageProcessingTime.toFixed(0)}s`);
    }

    const healthy = issues.length === 0;

    if (!healthy) {
      monitorLogger.warn('Queue health issues detected', {
        issues,
        metrics,
      });
    }

    return { healthy, issues, metrics };
  }
}
```

#### 2. Create Queue Status API Endpoint

**File**: `app/api/cron/queue-status/route.ts` (create new file)

**Implementation**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { QueueMonitoringService } from '@/lib/cron/queue-monitoring';

/**
 * Get queue status and metrics
 * Public endpoint for monitoring dashboards
 */
export async function GET(request: NextRequest) {
  try {
    const health = await QueueMonitoringService.checkQueueHealth();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...health,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

#### 3. Add Health Check to Main Cron

**File**: `app/api/cron/tier-aware/route.ts`

**Add health check before response**:
```typescript
// Before return statement (line 911)
const queueHealth = await QueueMonitoringService.checkQueueHealth();

if (!queueHealth.healthy) {
  cronLogger.warn(`[${executionId}] Queue health issues detected`, {
    issues: queueHealth.issues,
    metrics: queueHealth.metrics,
  });
}

return NextResponse.json({
  success: true,
  executionId,
  duration: monitorResult.duration,
  processingMode: 'async',
  queue: {
    filingsQueued: metrics.backlogFilingsQueued || 0,
    queueDepth: queueHealth.metrics.queueDepth,
    estimatedCompletionMinutes: queueHealth.metrics.estimatedProcessingTime,
    healthy: queueHealth.healthy,
  },
  // ... rest of response
});
```

#### 4. Create Queue Status Check Script

**File**: `scripts/check-queue-status.ts` (create new file)

**Implementation**:
```typescript
import { QueueMonitoringService } from '@/lib/cron/queue-monitoring';
import { logger } from '@/lib/logger';

const statusLogger = logger.child('queue-status');

async function checkStatus() {
  statusLogger.info('📊 Checking filing queue status...');

  const health = await QueueMonitoringService.checkQueueHealth();

  console.log('\n' + '='.repeat(60));
  console.log('📊 FILING QUEUE STATUS');
  console.log('='.repeat(60));
  console.log(`Health: ${health.healthy ? '✅ HEALTHY' : '⚠️ ISSUES DETECTED'}`);

  if (!health.healthy) {
    console.log('\n🚨 Issues:');
    health.issues.forEach(issue => console.log(`   - ${issue}`));
  }

  console.log('\n📈 Metrics:');
  console.log(`   Queue Depth: ${health.metrics.queueDepth} jobs`);
  console.log(`   Pending: ${health.metrics.pendingJobs}`);
  console.log(`   Processing: ${health.metrics.processingJobs}`);
  console.log(`   Completed (24h): ${health.metrics.completedLast24h}`);
  console.log(`   Failed (24h): ${health.metrics.failedLast24h}`);
  console.log(`   Avg Processing Time: ${health.metrics.averageProcessingTime.toFixed(1)}s`);

  if (health.metrics.oldestPendingJob) {
    const ageMinutes = (Date.now() - health.metrics.oldestPendingJob.getTime()) / 60000;
    console.log(`   Oldest Pending: ${ageMinutes.toFixed(0)} minutes ago`);
  }

  console.log(`   Est. Processing Time: ${health.metrics.estimatedProcessingTime.toFixed(0)} minutes`);
  console.log('='.repeat(60) + '\n');
}

checkStatus()
  .catch(error => {
    statusLogger.error('❌ Status check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

### Success Criteria

#### Automated Verification:
- [ ] Queue status endpoint returns 200: `curl https://tldrsec.app/api/cron/queue-status`
- [x] Status check script runs: `npm run queue:status`
- [x] Health metrics include all required fields
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Queue status endpoint shows real-time metrics
- [ ] Health check detects high queue depth (>100 jobs)
- [ ] Health check detects old pending jobs (>30 min)
- [ ] Health check detects high failure rate (>20%)
- [ ] Main cron response includes queue health in response
- [ ] Monitoring dashboard can consume queue status API
- [ ] Logs show queue health warnings when issues detected

**Implementation Note**: After completing this phase, you have full monitoring visibility. Set up alerts for queue health issues and monitor for 24 hours to ensure stability.

---

## Testing Strategy

### Unit Tests

**File**: `__tests__/cron/async-filing-queue.test.ts` (create new)

```typescript
import { AsyncFilingQueue } from '@/lib/cron/async-filing-queue';
import { JobQueueService } from '@/lib/job-queue';

describe('AsyncFilingQueue', () => {
  it('should queue filing with correct payload', async () => {
    const payload = {
      userId: 'test-user',
      userEmail: 'test@example.com',
      userTier: 'HOBBY',
      ticker: { symbol: 'TSLA', companyName: 'Tesla', cik: '0001318605' },
      filing: {
        filingId: 'filing-123',
        formType: '8-K',
        filingDate: '2025-01-01',
        filingUrl: 'https://example.com',
        accessionNumber: 'acc-123',
      },
      executionContext: {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-01T00:00:00Z',
        sourceContext: 'cron' as const,
      },
    };

    const result = await AsyncFilingQueue.queueFilingForProcessing(payload);

    expect(result.success).toBe(true);
    expect(result.jobId).toBeDefined();
    expect(result.queuePosition).toBeGreaterThan(0);
  });

  it('should prevent duplicate jobs with idempotency key', async () => {
    const payload = { /* ... */ };
    const idempotencyKey = 'unique-key-123';

    const result1 = await AsyncFilingQueue.queueFilingForProcessing(payload, {
      idempotencyKey,
    });

    const result2 = await AsyncFilingQueue.queueFilingForProcessing(payload, {
      idempotencyKey,
    });

    expect(result1.jobId).toBe(result2.jobId);
  });

  it('should prioritize PRO tier users', async () => {
    const proPayload = { ...payload, userTier: 'PRO' };
    const hobbyPayload = { ...payload, userTier: 'HOBBY' };

    // Priority should be 9 for PRO, 7 for HOBBY
    // (Test implementation details)
  });
});
```

### Integration Tests

**File**: `__tests__/cron/e2e-async-pipeline.test.ts` (create new)

```typescript
describe('E2E Async Filing Pipeline', () => {
  it('should queue filing and process in background', async () => {
    // 1. Call cron endpoint
    const response = await fetch('http://localhost:3000/api/cron/tier-aware', {
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.processingMode).toBe('async');
    expect(data.queue.filingsQueued).toBeGreaterThan(0);

    // 2. Verify job queued
    const jobs = await JobQueueService.getJobsToProcess(10, 'ASYNC_SUMMARIZE_FILING');
    expect(jobs.length).toBeGreaterThan(0);

    // 3. Process job manually
    const worker = new BackgroundFilingWorker({ batchSize: 1 });
    await worker.processBatch();

    // 4. Verify job completed
    const job = jobs[0];
    const status = await JobQueueService.getJobStatus(job.id);
    expect(status.status).toBe('COMPLETED');
  });
});
```

### Manual Testing Steps

**Phase 1 Testing**:
1. Deploy code to Vercel: `vercel --prod`
2. Wait for next cron trigger (10-minute cycle)
3. Check Cloudflare logs: `npm run cloudflare:logs`
4. Verify response time <10 seconds
5. Check database JobQueue table for new records
6. Verify no 524 timeout errors

**Phase 2 Testing**:
1. Trigger worker manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://tldrsec.app/api/cron/process-filing-queue`
2. Check worker logs in Vercel
3. Verify job status: PENDING → PROCESSING → COMPLETED
4. Check TEST_EMAIL inbox for summary
5. Verify database Summary records created

**Phase 3 Testing**:
1. Check queue status: `npm run queue:status`
2. Verify metrics are accurate
3. Test health checks by queuing 100+ jobs
4. Verify alerts for old pending jobs
5. Monitor for 24 hours to ensure stability

## Performance Considerations

### Response Time Optimization
- **Before**: 125-240 seconds (timeout)
- **After**: 5-10 seconds (queueing only)
- **Improvement**: 95% reduction in response time

### Queue Processing Capacity
- **Worker frequency**: Every 5 minutes
- **Batch size**: 3 filings
- **Processing time**: 2-3 minutes per batch
- **Capacity**: ~36 filings per hour per worker
- **Scalability**: Can add more workers or increase frequency

### Database Load
- **Before**: Heavy load during cron execution (parallel queries)
- **After**: Light load spread across time (queue operations)
- **Queue operations**: ~5-10ms per job insertion
- **Worker operations**: Same as before but distributed

### Cost Analysis
- **Vercel function time**: Reduced from 4 minutes to 10 seconds per cron execution
- **Cloudflare Worker**: No changes, still lightweight
- **Database**: Similar total queries but better distributed
- **AI costs**: No change (same number of API calls)

## Migration Notes

### Backward Compatibility
- Cron response format extended (not breaking)
- New `processingMode: 'async'` field added
- Cloudflare Worker requires no changes
- Existing monitoring compatible with new response

### Rollback Plan

**If Phase 1 fails**:
```bash
# Revert cron endpoint changes
git checkout app/api/cron/tier-aware/route.ts
vercel --prod

# Remove new async queue file
rm lib/cron/async-filing-queue.ts
```

**If Phase 2 fails**:
```bash
# Disable worker cron in vercel.json
# Remove worker from cron configuration
# Jobs remain queued but won't process (safe state)

# Can manually process queue later when fixed
```

**If Phase 3 fails**:
```bash
# Monitoring is optional, core functionality unaffected
# Simply disable monitoring endpoints
```

### Deployment Strategy
1. Deploy Phase 1 to production (enables queueing)
2. Monitor for 1 hour (verify no 524 timeouts)
3. Deploy Phase 2 (enables background processing)
4. Monitor for 4 hours (verify jobs complete)
5. Deploy Phase 3 (adds monitoring)
6. Monitor for 24 hours (ensure stability)

## Success Metrics

### Key Performance Indicators (KPIs)

**Response Time**:
- [ ] Cron endpoint responds in <10 seconds (vs 125+ seconds before)
- [ ] Zero 524 timeout errors in 24 hours
- [ ] Zero 429 rate limiting errors in 24 hours

**Queue Health**:
- [ ] Queue depth stays <50 jobs during normal operation
- [ ] Jobs complete within 10 minutes of queueing
- [ ] Failure rate <5% (excluding user errors)

**Background Processing**:
- [ ] Worker processes 3 jobs per batch
- [ ] Average job processing time 30-60 seconds
- [ ] Retry success rate >80% on first retry

**User Experience**:
- [ ] TEST_EMAIL receives summaries within 15 minutes
- [ ] Email delivery success rate >99%
- [ ] Summary quality unchanged from sync processing

### Monitoring Dashboards

**Cloudflare Dashboard**:
- Worker execution count (same as before)
- Success rate >99.5%
- Response time <10 seconds

**Vercel Dashboard**:
- Cron function: <10s execution time
- Worker function: 2-3min execution time
- Zero timeouts or errors

**Database Monitoring**:
```sql
-- Queue depth over time
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
  COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed
FROM "JobQueue"
WHERE job_type = 'ASYNC_SUMMARIZE_FILING'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Processing time distribution
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
    EXTRACT(EPOCH FROM (completed_at - started_at))
  ) as median_seconds,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY
    EXTRACT(EPOCH FROM (completed_at - started_at))
  ) as p95_seconds
FROM "JobQueue"
WHERE job_type = 'ASYNC_SUMMARIZE_FILING'
  AND status = 'COMPLETED'
  AND completed_at > NOW() - INTERVAL '24 hours';
```

## References

- Bottleneck analysis: [docs/analysis/2025-11-20-cron-endpoint-bottleneck-analysis.md](../docs/analysis/2025-11-20-cron-endpoint-bottleneck-analysis.md)
- Current progress: [PROGRESS.md](../PROGRESS.md)
- Original plan: [docs/plans/2025-11-19-fix-e2e-cron-pipeline-execution.md](../docs/plans/2025-11-19-fix-e2e-cron-pipeline-execution.md)
- Async email queue pattern: [lib/email/async-email-queue.ts](../lib/email/async-email-queue.ts)
- Job queue service: [lib/job-queue/index.ts](../lib/job-queue/index.ts)
- Filing processor: [lib/cron/filing-processor.ts](../lib/cron/filing-processor.ts)

---

**Total Estimated Time**: 4-5 days

**Critical Path**: Phase 1 → Phase 2 (Phase 3 is optional for launch)

**Minimum Viable**: Phase 1 + Phase 2 (fixes timeout, enables processing)

**Full Production**: All 3 phases (includes monitoring and alerts)

**End Goal**: ✅ Cron endpoint returns 200 OK within 10 seconds, background workers process filings asynchronously, zero 524 timeouts, scalable architecture supporting 100+ users per ticker.
