/**
 * Async Filing Queue Service
 *
 * Handles filing processing jobs with async queueing and background processing.
 * Follows the proven async-email-queue.ts pattern for reliable async operations.
 *
 * Pattern: Queue jobs immediately and return, process in background workers
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logging';
import { JobQueueService, JobType } from '../job-queue';

const queueLogger = logger.child('async-filing-queue');

/**
 * Filing job payload for async processing
 */
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

/**
 * Result of queueing a filing job
 */
export interface QueueFilingResult {
  success: boolean;
  jobId: string;
  estimatedCompletionTime: Date;
  queuePosition: number;
}

/**
 * Async Filing Queue Service
 *
 * Provides methods to queue filing processing jobs and track their status.
 * Jobs are processed asynchronously by background workers.
 */
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
        payload: payload as unknown as Record<string, unknown>,
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
