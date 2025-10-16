/**
 * Background Job Worker - Phase 2 Implementation
 * 
 * Processes async jobs from the JobQueue table to enable
 * background processing for SEC filing summarization
 */

import { logger } from '../logging/index';
import { monitoring } from '../monitoring/index';
import { JobQueueService, JobType, JobStatus } from './index';
import { AsyncFilingProcessor } from './async-filing-processor';
import { v4 as uuidv4 } from 'uuid';

const workerLogger = logger.child('job-worker');

export interface WorkerConfig {
  maxConcurrentJobs: number;
  batchSize: number;
  pollingIntervalMs: number;
  timeoutMs: number;
  enabledJobTypes?: JobType[];
}

export interface JobExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  retryable?: boolean;
}

/**
 * Background Job Worker
 * Processes jobs from the job queue with priority ordering and error handling
 */
export class JobWorker {
  private config: WorkerConfig;
  private isRunning = false;
  private activeJobs = new Set<string>();
  private workerId: string;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.workerId = `worker-${uuidv4().slice(0, 8)}`;
    this.config = {
      maxConcurrentJobs: 3,
      batchSize: 5,
      pollingIntervalMs: 5000, // 5 seconds
      timeoutMs: 700000, // 11.7 minutes per job (increased for complex filings)
      ...config
    };

    workerLogger.info('Job worker initialized', {
      workerId: this.workerId,
      config: this.config
    });
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      workerLogger.warn('Worker already running', { workerId: this.workerId });
      return;
    }

    this.isRunning = true;
    workerLogger.info('Starting job worker', { workerId: this.workerId });

    // Start the main processing loop
    this.processJobsLoop().catch(error => {
      workerLogger.error('Worker loop crashed', {
        workerId: this.workerId,
        error: error.message
      });
      this.isRunning = false;
    });
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    workerLogger.info('Stopping job worker', { workerId: this.workerId });
    this.isRunning = false;

    // Wait for active jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeJobs.size > 0 && (Date.now() - startTime) < timeout) {
      workerLogger.info('Waiting for active jobs to complete', {
        workerId: this.workerId,
        activeJobs: this.activeJobs.size
      });
      await this.sleep(1000);
    }

    if (this.activeJobs.size > 0) {
      workerLogger.warn('Force stopping worker with active jobs', {
        workerId: this.workerId,
        activeJobs: this.activeJobs.size
      });
    }
  }

  /**
   * Process a single batch of jobs
   */
  async processBatch(): Promise<{ processed: number; errors: number }> {
    if (!this.isRunning) {
      return { processed: 0, errors: 0 };
    }

    try {
      // Calculate how many jobs we can process
      const availableSlots = this.config.maxConcurrentJobs - this.activeJobs.size;
      if (availableSlots <= 0) {
        return { processed: 0, errors: 0 };
      }

      // Get jobs to process
      const jobs = await JobQueueService.getJobsToProcess(
        Math.min(availableSlots, this.config.batchSize),
        this.config.enabledJobTypes?.[0] // Pass first enabled type if any
      );

      if (jobs.length === 0) {
        return { processed: 0, errors: 0 };
      }

      workerLogger.info('Processing job batch', {
        workerId: this.workerId,
        jobCount: jobs.length,
        availableSlots
      });

      // Process jobs concurrently
      const promises = jobs.map(job => this.processJob(job));
      const results = await Promise.allSettled(promises);

      // Count results
      let processed = 0;
      let errors = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          errors++;
          workerLogger.error('Job processing failed', {
            workerId: this.workerId,
            error: result.reason
          });
        }
      }

      return { processed, errors };

    } catch (error) {
      workerLogger.error('Batch processing failed', {
        workerId: this.workerId,
        error: error.message
      });
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Main processing loop
   */
  private async processJobsLoop(): Promise<void> {
    workerLogger.info('Worker processing loop started', { workerId: this.workerId });

    while (this.isRunning) {
      try {
        const { processed, errors } = await this.processBatch();

        // Record metrics
        if (processed > 0) {
          monitoring.incrementCounter('job_worker.jobs_processed', processed);
        }
        if (errors > 0) {
          monitoring.incrementCounter('job_worker.jobs_failed', errors);
        }

        // Log activity
        if (processed > 0 || errors > 0) {
          workerLogger.info('Batch completed', {
            workerId: this.workerId,
            processed,
            errors,
            activeJobs: this.activeJobs.size
          });
        }

        // Wait before next batch
        await this.sleep(this.config.pollingIntervalMs);

      } catch (error) {
        workerLogger.error('Processing loop error', {
          workerId: this.workerId,
          error: error.message
        });
        
        // Back off on errors
        await this.sleep(this.config.pollingIntervalMs * 2);
      }
    }

    workerLogger.info('Worker processing loop stopped', { workerId: this.workerId });
  }

  /**
   * Process a single job
   */
  private async processJob(job: any): Promise<JobExecutionResult> {
    const jobId = job.id;
    const startTime = Date.now();

    // Track active job
    this.activeJobs.add(jobId);

    try {
      workerLogger.info('Processing job', {
        workerId: this.workerId,
        jobId,
        jobType: job.jobType,
        priority: job.priority,
        retryCount: job.retryCount
      });

      // Mark job as processing
      await JobQueueService.updateJobStatus(jobId, 'PROCESSING', {
        startedAt: new Date()
      });

      // Execute the job with timeout
      const result = await this.executeJobWithTimeout(job);

      // Mark job as completed
      await JobQueueService.updateJobStatus(jobId, 'COMPLETED', {
        completedAt: new Date(),
        executionTime: Date.now() - startTime,
        result: result.result
      });

      workerLogger.info('Job completed successfully', {
        workerId: this.workerId,
        jobId,
        executionTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      workerLogger.error('Job failed', {
        workerId: this.workerId,
        jobId,
        error: errorMessage,
        executionTime
      });

      // Mark job as failed (JobQueueService will handle retry logic)
      await JobQueueService.updateJobStatus(jobId, 'FAILED', {
        failedAt: new Date(),
        lastError: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
        retryable: this.isRetryableError(error)
      };

    } finally {
      // Remove from active jobs
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Execute a job with timeout protection
   */
  private async executeJobWithTimeout(job: any): Promise<JobExecutionResult> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Job timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      try {
        const result = await this.executeJob(job);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Execute a job based on its type
   */
  private async executeJob(job: any): Promise<JobExecutionResult> {
    const startTime = Date.now();

    switch (job.jobType) {
      case 'ASYNC_SUMMARIZE_FILING':
        return await this.processAsyncFilingSummarization(job);

      case 'SEND_FILING_NOTIFICATION':
        return await this.processSendFilingNotification(job);

      case 'ASYNC_EMAIL_DIGEST':
        return await this.processAsyncEmailDigest(job);

      case 'ASYNC_FILING_CLEANUP':
        return await this.processAsyncFilingCleanup(job);

      default:
        throw new Error(`Unsupported job type: ${job.jobType}`);
    }
  }

  /**
   * Process async filing summarization job
   */
  private async processAsyncFilingSummarization(job: any): Promise<JobExecutionResult> {
    const startTime = Date.now();
    
    try {
      const payload = job.payload;
      const result = await AsyncFilingProcessor.processAsyncFilingSummarization(
        job.id,
        payload
      );

      return {
        success: result.success,
        result: {
          summaryId: result.summaryId,
          cost: result.cost,
          tokensUsed: result.tokensUsed,
          processingTime: result.processingTime
        },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        retryable: true
      };
    }
  }

  /**
   * Process filing notification job
   */
  private async processSendFilingNotification(job: any): Promise<JobExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { userId, summaryId, notificationType } = job.payload;

      // Use lazy loading to get the notification service
      const { getNotificationService } = await import('../email/index');
      const notificationService = await getNotificationService();

      // Send email notification
      await notificationService.sendFilingNotification({
        userId,
        summaryId,
        notificationType,
        filingId: job.payload.filingId || '',
        ticker: job.payload.ticker || '',
        formType: job.payload.formType || '',
        filingDate: job.payload.filingDate || new Date().toISOString(),
        filingUrl: job.payload.filingUrl || ''
      });

      return {
        success: true,
        result: { notificationSent: true },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        retryable: true
      };
    }
  }

  /**
   * Process async email digest job
   */
  private async processAsyncEmailDigest(job: any): Promise<JobExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Placeholder for email digest processing
      workerLogger.info('Processing async email digest', {
        jobId: job.id,
        payload: job.payload
      });

      return {
        success: true,
        result: { digestProcessed: true },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        retryable: true
      };
    }
  }

  /**
   * Process async filing cleanup job
   */
  private async processAsyncFilingCleanup(job: any): Promise<JobExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Placeholder for filing cleanup processing
      workerLogger.info('Processing async filing cleanup', {
        jobId: job.id,
        payload: job.payload
      });

      return {
        success: true,
        result: { cleanupCompleted: true },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        retryable: false // Cleanup failures usually aren't retryable
      };
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    
    // Non-retryable errors
    const nonRetryablePatterns = [
      'invalid',
      'unauthorized',
      'forbidden',
      'not found',
      'malformed',
      'syntax error'
    ];

    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return false;
      }
    }

    // Retryable errors
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'temporary',
      'rate limit',
      'service unavailable'
    ];

    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return true;
      }
    }

    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get worker status
   */
  getStatus(): {
    workerId: string;
    isRunning: boolean;
    activeJobs: number;
    config: WorkerConfig;
  } {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      config: this.config
    };
  }
}

/**
 * Singleton worker instance for the application
 */
let globalWorker: JobWorker | null = null;

/**
 * Get or create the global worker instance
 */
export function getJobWorker(): JobWorker {
  if (!globalWorker) {
    globalWorker = new JobWorker({
      maxConcurrentJobs: 3,
      batchSize: 5,
      pollingIntervalMs: 5000,
      timeoutMs: 700000,
      enabledJobTypes: [
        'ASYNC_SUMMARIZE_FILING',
        'SEND_FILING_NOTIFICATION',
        'ASYNC_EMAIL_DIGEST',
        'ASYNC_FILING_CLEANUP'
      ]
    });
  }
  return globalWorker;
}

/**
 * Start the global worker
 */
export async function startGlobalWorker(): Promise<void> {
  const worker = getJobWorker();
  await worker.start();
}

/**
 * Stop the global worker
 */
export async function stopGlobalWorker(): Promise<void> {
  if (globalWorker) {
    await globalWorker.stop();
    globalWorker = null;
  }
}