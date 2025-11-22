/**
 * Background Filing Worker
 *
 * Processes queued filing jobs asynchronously in the background.
 * Follows proven background worker patterns for reliable job processing.
 *
 * Pattern: Continuously poll queue and process jobs in batches
 */

import { logger } from '../logging';
import { JobQueueService, type JobType } from '../job-queue';
import { CronFilingProcessor } from './filing-processor';
import { getPrismaClient } from '../db/prisma';
import type { FilingJobPayload } from './async-filing-queue';
import type { JobQueue } from '@prisma/client';
import { FILING_PROCESSING_TIMEOUT } from './types';

const workerLogger = logger.child('background-filing-worker');
const prisma = getPrismaClient();

/**
 * Create a timeout promise that rejects after the specified duration
 * Used to enforce hard timeout at application level (not just database level)
 */
function createTimeoutPromise(timeoutMs: number, jobId: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Job ${jobId} exceeded ${timeoutMs}ms timeout - force failing to prevent stale job`));
    }, timeoutMs);
  });
}

/**
 * Background Filing Worker Class
 *
 * Processes filing jobs from the queue in batches.
 * Can run continuously or process a single batch.
 */
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
  async processBatch(): Promise<void> {
    const batchStartTime = Date.now();

    // First, recover any stale PROCESSING jobs (stuck > 5 minutes)
    const recoveredCount = await this.recoverStaleJobs();
    if (recoveredCount > 0) {
      workerLogger.info('Recovered stale jobs', {
        processId: this.processId,
        recoveredCount,
      });
    }

    // Get jobs to process
    const jobs = await JobQueueService.getJobsToProcess(
      this.batchSize,
      'ASYNC_SUMMARIZE_FILING' as JobType
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
   * Recover stale PROCESSING jobs that got stuck due to timeouts
   * Jobs stuck in PROCESSING for more than 5 minutes are reset to RETRYING
   */
  private async recoverStaleJobs(): Promise<number> {
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

    try {
      // Find stale PROCESSING jobs
      const staleJobs = await prisma.jobQueue.findMany({
        where: {
          status: 'PROCESSING',
          startedAt: { lt: staleThreshold },
          jobType: 'ASYNC_SUMMARIZE_FILING',
        },
        select: {
          id: true,
          retryCount: true,
          maxRetries: true,
        },
      });

      if (staleJobs.length === 0) {
        return 0;
      }

      let recoveredCount = 0;
      for (const job of staleJobs) {
        const newRetryCount = job.retryCount + 1;
        const shouldFail = newRetryCount >= job.maxRetries;

        if (shouldFail) {
          // Max retries exceeded - mark as FAILED
          await prisma.jobQueue.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              lastError: `Stale job recovery: exceeded max retries (${job.maxRetries}) after timeout`,
            },
          });
        } else {
          // Reset to RETRYING for another attempt
          await prisma.jobQueue.update({
            where: { id: job.id },
            data: {
              status: 'RETRYING',
              startedAt: null,
              retryCount: newRetryCount,
              lastError: `Stale job recovery: reset after timeout (attempt ${newRetryCount}/${job.maxRetries})`,
            },
          });
          recoveredCount++;
        }
      }

      workerLogger.warn('Recovered stale PROCESSING jobs', {
        processId: this.processId,
        totalStale: staleJobs.length,
        recovered: recoveredCount,
        failedDueToMaxRetries: staleJobs.length - recoveredCount,
      });

      return recoveredCount;
    } catch (error) {
      workerLogger.error('Failed to recover stale jobs', {
        processId: this.processId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Process a single filing job with application-level timeout enforcement
   *
   * IMPORTANT: The timeout wrapper ensures jobs fail cleanly within FILING_PROCESSING_TIMEOUT
   * before Vercel's 180s function timeout kills the process without cleanup.
   */
  private async processJob(job: JobQueue): Promise<void> {
    const jobStartTime = Date.now();
    const payload = job.payload as unknown as FilingJobPayload;

    workerLogger.info('Processing filing job', {
      processId: this.processId,
      jobId: job.id,
      ticker: payload.ticker.symbol,
      formType: payload.filing.formType,
      userId: payload.userId,
      executionId: payload.executionContext.executionId,
      timeoutMs: FILING_PROCESSING_TIMEOUT,
    });

    try {
      // Update job status to PROCESSING
      await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
        startedAt: new Date(),
      });

      // Wrap the actual processing with a timeout to ensure we fail cleanly
      // before Vercel kills the function at 180s
      const result = await Promise.race([
        this.executeFilingProcessing(job, payload),
        createTimeoutPromise(FILING_PROCESSING_TIMEOUT, job.id),
      ]);

      if (result.success) {
        // Update job status to COMPLETED
        await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
          completedAt: new Date(),
          result: {
            cost: result.cost,
            processingContext: result.processingContext,
          },
        });

        const jobDuration = Date.now() - jobStartTime;
        workerLogger.info('Filing job completed successfully', {
          processId: this.processId,
          jobId: job.id,
          ticker: payload.ticker.symbol,
          cost: result.cost,
          duration: jobDuration,
          isCached: result.processingContext?.isCached,
        });
      } else {
        throw new Error(result.error || 'Filing processing failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('exceeded') && errorMessage.includes('timeout');

      workerLogger.error('Filing job failed', {
        processId: this.processId,
        jobId: job.id,
        ticker: payload.ticker.symbol,
        error: errorMessage,
        isTimeout,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        duration: Date.now() - jobStartTime,
      });

      // Update job status to FAILED (JobQueueService handles retries)
      await JobQueueService.updateJobStatus(job.id, 'FAILED', {
        failedAt: new Date(),
        error: isTimeout ? `Application timeout after ${FILING_PROCESSING_TIMEOUT}ms` : errorMessage,
      });
    }
  }

  /**
   * Execute the actual filing processing logic (separated for timeout wrapping)
   */
  private async executeFilingProcessing(
    job: JobQueue,
    payload: FilingJobPayload
  ): Promise<{ success: boolean; cost?: number; error?: string; processingContext?: unknown }> {
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
      return { success: false, error: `User not found: ${payload.userId}` };
    }

    // Process filing using existing processor
    return await CronFilingProcessor.processSingleFiling(
      {
        id: payload.filing.filingId,
        accessionNumber: payload.filing.accessionNumber,
        filingType: payload.filing.formType,
        filingDate: new Date(payload.filing.filingDate),
        filingUrl: payload.filing.filingUrl,
      },
      user,
      payload.userTier,
      {
        symbol: payload.ticker.symbol,
        cik: payload.ticker.cik,
      },
      payload.ticker
    );
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
