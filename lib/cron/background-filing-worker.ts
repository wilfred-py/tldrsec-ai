/**
 * Background Filing Worker
 *
 * Processes queued filing jobs asynchronously in the background.
 * Follows proven background worker patterns for reliable job processing.
 *
 * Pattern: Continuously poll queue and process jobs in batches
 *
 * TIMEOUT ARCHITECTURE:
 * - Uses AbortController to properly cancel in-flight requests on timeout
 * - Prevents resource leaks from orphaned promises after Promise.race timeout
 * - Signal propagated to SEC and AI clients for proper request cancellation
 */

import { logger } from '../logging';
import { JobQueueService, type JobType } from '../job-queue';
import { CronFilingProcessor } from './filing-processor';
import { getPrismaClient } from '../db/prisma';
import type { FilingJobPayload } from './async-filing-queue';
import type { JobQueue } from '@prisma/client';
import { FILING_PROCESSING_TIMEOUT, getBatchSizeForJobType } from './types';

const workerLogger = logger.child('background-filing-worker');
// Lazy accessor to avoid build-time initialization
const getPrisma = () => getPrismaClient();

/**
 * Result from processing a single job, used for Slack notifications
 * Captures detailed metrics from each handler for pipeline visibility
 */
export interface ProcessedJobResult {
  jobId: string;
  jobType: JobType;
  ticker?: string;
  formType?: string;
  success: boolean;
  durationMs: number;
  error?: string;
  // Discovery handler metrics (Phase 1)
  discovery?: {
    filingsDiscovered: number;
    fetchJobsQueued: number;
    eligibleUsers: number;
    uniqueTickers: number;
  };
  // Fetch handler metrics (Phase 2)
  fetch?: {
    cached: boolean;
    contentLength?: number;
    summarizeJobQueued: boolean;
  };
  // Summarize handler metrics (Phase 3)
  summarize?: {
    summaryId?: string;
    cost?: number;
    inputTokens?: number;
    outputTokens?: number;
    emailSent: boolean;
  };
}

/**
 * Handler result type for job processing
 * Union of all handler-specific result types
 */
export interface HandlerResult {
  success: boolean;
  error?: string;
  cost?: number;
  filingsDiscovered?: number;
  cached?: boolean;
  summaryId?: string;
  processingContext?: unknown;
  // Discovery metrics (Phase 1)
  fetchJobsQueued?: number;
  eligibleUsers?: number;
  uniqueTickers?: number;
  // Fetch metrics (Phase 2)
  contentLength?: number;
  summarizeJobQueued?: boolean;
  // Summarize metrics (Phase 3)
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  emailSent?: boolean;
}

/**
 * Result from processing a batch of jobs
 */
export interface BatchProcessingResult {
  processId: string;
  jobsProcessed: ProcessedJobResult[];
  recoveredStaleJobs: number;
  batchDuration: number;
}

/**
 * Create an abortable timeout for job processing
 *
 * Returns an AbortController and a timeout promise that:
 * 1. Rejects after the specified timeout
 * 2. Calls abort() on the controller to cancel in-flight requests
 * 3. Cleans up the timer if abort is called externally
 *
 * This prevents resource leaks from orphaned promises when using Promise.race
 */
function createAbortableTimeout(timeoutMs: number, jobId: string): {
  controller: AbortController;
  timeoutPromise: Promise<never>;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Job ${jobId} exceeded ${timeoutMs}ms timeout - aborted`));
    }, timeoutMs);
  });

  // Cleanup function to clear timeout if processing completes early
  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  // Also cleanup if abort is called externally
  controller.signal.addEventListener('abort', cleanup, { once: true });

  return { controller, timeoutPromise, cleanup };
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
  private jobTypes?: JobType[];  // Optional filter for job types to process

  constructor(options: {
    batchSize?: number;
    processingInterval?: number;
    jobTypes?: JobType[];  // Optional job type filter
  } = {}) {
    this.processId = `filing-worker-${process.pid}-${Date.now()}`;
    this.batchSize = options.batchSize || 3; // Process 3 filings at a time
    this.processingInterval = options.processingInterval || 30000; // 30 seconds between batches
    this.jobTypes = options.jobTypes;  // Store filter (undefined means use default)
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
   * @returns BatchProcessingResult with details about processed jobs for notifications
   */
  async processBatch(): Promise<BatchProcessingResult> {
    const batchStartTime = Date.now();
    const jobResults: ProcessedJobResult[] = [];

    // First, recover any stale PROCESSING jobs (stuck > 5 minutes)
    const recoveredCount = await this.recoverStaleJobs();
    if (recoveredCount > 0) {
      workerLogger.info('Recovered stale jobs', {
        processId: this.processId,
        recoveredCount,
      });
    }

    // Get jobs to process - ONLY 3-phase async jobs
    // IMPORTANT: Exclude ASYNC_SUMMARIZE_FILING (legacy sync jobs that timeout)
    // Legacy jobs are still handled by tier-aware endpoint's sync processing path
    //
    // Dynamic batch sizing strategy:
    // 1. First, try to get discovery jobs (fast, can batch 10)
    // 2. If no discovery jobs, try fetch jobs (medium, batch 2)
    // 3. If no fetch jobs, try summarize jobs (slow, batch 3)
    // This ensures we maximize throughput while staying within timeout limits.

    const defaultJobTypes: JobType[] = ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'];
    const jobTypesToProcess = this.jobTypes ?? defaultJobTypes;

    // Log if using filter
    if (this.jobTypes) {
      workerLogger.info('Processing with job type filter', {
        processId: this.processId,
        filteredTypes: this.jobTypes,
      });
    }

    let jobs: JobQueue[] = [];

    // Try each job type with its optimal batch size
    for (const jobType of jobTypesToProcess) {
      if (jobs.length > 0) break; // Already have jobs to process

      const batchSize = getBatchSizeForJobType(jobType);
      const typeJobs = await JobQueueService.getJobsToProcessMultipleTypes(
        batchSize,
        [jobType]
      );

      if (typeJobs.length > 0) {
        jobs = typeJobs;
        workerLogger.info('Fetched jobs with dynamic batch sizing', {
          processId: this.processId,
          jobType,
          batchSize,
          jobCount: typeJobs.length,
        });
      }
    }

    // Log batch processing summary
    if (jobs.length === 0) {
      workerLogger.debug('No jobs available to process', {
        processId: this.processId,
        checkedTypes: jobTypesToProcess,
      });
      return {
        processId: this.processId,
        jobsProcessed: [],
        recoveredStaleJobs: recoveredCount,
        batchDuration: Date.now() - batchStartTime,
      };
    }

    workerLogger.info('Starting batch processing', {
      processId: this.processId,
      jobCount: jobs.length,
      jobTypes: jobs.map(j => j.jobType),
      jobIds: jobs.map(j => j.id),
    });

    // Process jobs sequentially (respects SEC API rate limits)
    for (const job of jobs) {
      const jobResult = await this.processJob(job);
      jobResults.push(jobResult);
    }

    const batchDuration = Date.now() - batchStartTime;
    workerLogger.info('Batch processing complete', {
      processId: this.processId,
      jobCount: jobs.length,
      duration: batchDuration,
      averageJobTime: batchDuration / jobs.length,
    });

    return {
      processId: this.processId,
      jobsProcessed: jobResults,
      recoveredStaleJobs: recoveredCount,
      batchDuration,
    };
  }

  /**
   * Recover stale PROCESSING jobs that got stuck due to timeouts
   * Jobs stuck in PROCESSING for more than 5 minutes are reset to RETRYING
   */
  private async recoverStaleJobs(): Promise<number> {
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

    try {
      // Find stale PROCESSING jobs - ONLY 3-phase async jobs
      // IMPORTANT: Exclude ASYNC_SUMMARIZE_FILING (legacy sync jobs handled elsewhere)
      const staleJobs = await getPrisma().jobQueue.findMany({
        where: {
          status: 'PROCESSING',
          startedAt: { lt: staleThreshold },
          jobType: {
            in: ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'],
          },
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
          await getPrisma().jobQueue.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              lastError: `Stale job recovery: exceeded max retries (${job.maxRetries}) after timeout`,
            },
          });
        } else {
          // Reset to RETRYING for another attempt
          await getPrisma().jobQueue.update({
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
   *
   * Uses AbortController to properly cancel in-flight requests when timeout fires,
   * preventing resource leaks from orphaned promises.
   *
   * Routes job to appropriate handler based on jobType:
   * - ASYNC_DISCOVER_FILINGS -> discovery-handler
   * - ASYNC_FETCH_FILING -> fetch-handler
   * - ASYNC_SUMMARIZE_CACHED -> summarize-cached-handler
   * - ASYNC_SUMMARIZE_FILING -> legacy filing processor
   *
   * @returns ProcessedJobResult with job details for Slack notifications
   */
  private async processJob(job: JobQueue): Promise<ProcessedJobResult> {
    const jobStartTime = Date.now();
    const payload = job.payload as unknown as FilingJobPayload;

    workerLogger.info('Processing job', {
      processId: this.processId,
      jobId: job.id,
      jobType: job.jobType,
      ticker: payload.ticker?.symbol,
      formType: payload.filing?.formType,
      userId: payload.userId,
      executionId: payload.executionContext?.executionId,
      timeoutMs: FILING_PROCESSING_TIMEOUT,
    });

    // Create abortable timeout - allows us to cancel in-flight requests on timeout
    const { controller, timeoutPromise, cleanup } = createAbortableTimeout(
      FILING_PROCESSING_TIMEOUT,
      job.id
    );

    try {
      // Update job status to PROCESSING
      await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
        startedAt: new Date(),
      });

      // Route to appropriate handler based on jobType
      // Wrap the actual processing with a timeout to ensure we fail cleanly
      // before Vercel kills the function at 180s
      const result = await Promise.race([
        this.routeJobToHandler(job, payload, controller.signal),
        timeoutPromise,
      ]);

      // Cleanup timeout timer on success
      cleanup();

      if (result.success) {
        // Update job status to COMPLETED
        await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
          completedAt: new Date(),
          result: {
            cost: result.cost,
            ...result, // Include all handler-specific result data
          },
        });

        const jobDuration = Date.now() - jobStartTime;
        workerLogger.info('Job completed successfully', {
          processId: this.processId,
          jobId: job.id,
          jobType: job.jobType,
          ticker: payload.ticker?.symbol,
          cost: result.cost,
          duration: jobDuration,
          ...(result.filingsDiscovered !== undefined && { filingsDiscovered: result.filingsDiscovered }),
          ...(result.cached !== undefined && { cached: result.cached }),
          ...(result.summaryId && { summaryId: result.summaryId }),
        });

        // Build result with handler-specific metrics for Slack notifications
        const jobResult: ProcessedJobResult = {
          jobId: job.id,
          jobType: job.jobType as JobType,
          ticker: payload.ticker?.symbol,
          formType: payload.filing?.formType,
          success: true,
          durationMs: jobDuration,
        };

        // Capture handler-specific metrics for pipeline visibility
        if (job.jobType === 'ASYNC_DISCOVER_FILINGS') {
          jobResult.discovery = {
            filingsDiscovered: result.filingsDiscovered || 0,
            fetchJobsQueued: result.fetchJobsQueued || 0,
            eligibleUsers: result.eligibleUsers || 0,
            uniqueTickers: result.uniqueTickers || 0,
          };
        } else if (job.jobType === 'ASYNC_FETCH_FILING') {
          jobResult.fetch = {
            cached: result.cached || false,
            contentLength: result.contentLength,
            summarizeJobQueued: result.summarizeJobQueued || false,
          };
        } else if (job.jobType === 'ASYNC_SUMMARIZE_CACHED') {
          jobResult.summarize = {
            summaryId: result.summaryId,
            cost: result.cost,
            inputTokens: result.tokenUsage?.inputTokens,
            outputTokens: result.tokenUsage?.outputTokens,
            emailSent: result.emailSent || false,
          };
        }

        return jobResult;
      } else {
        throw new Error(result.error || 'Job processing failed');
      }
    } catch (error) {
      // IMPORTANT: Capture error message BEFORE calling abort(), because abort() sets
      // controller.signal.aborted = true, and we were incorrectly using that to mask errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('exceeded') && errorMessage.includes('timeout');
      // Only check if the error itself mentions abort, not if we manually aborted after catching
      const wasAbortedByTimeout = errorMessage.includes('aborted') || errorMessage.includes('AbortError');

      // Now abort any in-flight requests to clean up
      controller.abort();
      cleanup();

      const duration = Date.now() - jobStartTime;

      workerLogger.error('Filing job failed', {
        processId: this.processId,
        jobId: job.id,
        ticker: payload.ticker?.symbol,
        error: errorMessage,
        isTimeout,
        wasAbortedByTimeout,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        duration,
      });

      // Update job status to FAILED (JobQueueService handles retries)
      // BUG FIX: Only report timeout message for actual timeouts, not all errors
      // Previously, we were checking controller.signal.aborted AFTER calling abort(),
      // which meant ALL errors were incorrectly reported as "Application timeout"
      const finalErrorMessage = isTimeout || wasAbortedByTimeout
        ? `Application timeout after ${duration}ms (requests aborted): ${errorMessage}`
        : errorMessage;

      await JobQueueService.updateJobStatus(job.id, 'FAILED', {
        failedAt: new Date(),
        error: finalErrorMessage,
      });

      return {
        jobId: job.id,
        jobType: job.jobType as JobType,
        ticker: payload.ticker?.symbol,
        formType: payload.filing?.formType,
        success: false,
        durationMs: duration,
        error: finalErrorMessage,
      };
    }
  }

  /**
   * Route job to appropriate handler based on jobType
   *
   * @param job - The job queue entry
   * @param payload - The job payload
   * @param signal - Optional AbortSignal for cancelling in-flight requests on timeout
   */
  private async routeJobToHandler(
    job: JobQueue,
    payload: unknown,
    signal?: AbortSignal
  ): Promise<HandlerResult> {
    // Check if already aborted before routing
    if (signal?.aborted) {
      return { success: false, error: 'Job was aborted before routing started' };
    }

    try {
      switch (job.jobType) {
        case 'ASYNC_DISCOVER_FILINGS': {
          const { handleDiscovery } = await import('./handlers/discovery-handler');
          type DiscoveryPayloadType = Parameters<typeof handleDiscovery>[0];
          return await handleDiscovery(payload as DiscoveryPayloadType) as HandlerResult;
        }

        case 'ASYNC_FETCH_FILING': {
          const { handleFetch } = await import('./handlers/fetch-handler');
          type FetchPayloadType = Parameters<typeof handleFetch>[0];
          return await handleFetch(payload as FetchPayloadType) as HandlerResult;
        }

        case 'ASYNC_SUMMARIZE_CACHED': {
          const { handleSummarizeCached } = await import('./handlers/summarize-cached-handler');
          type SummarizePayloadType = Parameters<typeof handleSummarizeCached>[0];
          return await handleSummarizeCached(payload as SummarizePayloadType) as HandlerResult;
        }

        case 'ASYNC_SUMMARIZE_FILING':
        default:
          // Legacy filing processing for backward compatibility
          return await this.executeFilingProcessing(job, payload as FilingJobPayload, signal);
      }
    } catch (error) {
      workerLogger.error('Handler routing failed', {
        jobId: job.id,
        jobType: job.jobType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown routing error'
      };
    }
  }

  /**
   * Execute the actual filing processing logic (separated for timeout wrapping)
   * LEGACY: Used for ASYNC_SUMMARIZE_FILING and backward compatibility
   *
   * @param job - The job queue entry
   * @param payload - The filing job payload with user, ticker, and filing info
   * @param signal - Optional AbortSignal for cancelling in-flight requests on timeout
   */
  private async executeFilingProcessing(
    job: JobQueue,
    payload: FilingJobPayload,
    signal?: AbortSignal
  ): Promise<{ success: boolean; cost?: number; error?: string; processingContext?: unknown }> {
    // Check if already aborted before starting
    if (signal?.aborted) {
      return { success: false, error: 'Job was aborted before processing started' };
    }

    // Get user from database
    const user = await getPrisma().user.findUnique({
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

    // Check if aborted after DB query
    if (signal?.aborted) {
      return { success: false, error: 'Job was aborted after user lookup' };
    }

    // Process filing using existing processor
    // Pass signal through for proper request cancellation
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
      payload.ticker,
      signal // Pass abort signal to processor
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
