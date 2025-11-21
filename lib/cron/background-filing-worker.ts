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

const workerLogger = logger.child('background-filing-worker');
const prisma = getPrismaClient();

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
   * Process a single filing job
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
    });

    try {
      // Update job status to PROCESSING
      await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
        startedAt: new Date(),
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
