/**
 * Batch Processing for SEC Filing Summarization
 * 
 * Provides parallel processing capabilities with concurrency limits
 * for efficient handling of multiple filing summarization requests.
 */

import { SummarizationOptions, SummarizationResult } from '../summarize';
import { logger } from '../../logging';
import { monitoring } from '../../monitoring';
import { processAllChunks } from '../chunking/enhanced-chunker';
import { SECFilingType } from '../prompts/prompt-types';
import pLimit from 'p-limit';

// Logger for this component
const componentLogger = logger.child('batch-processor');

/**
 * Interface for a batch processing job
 */
export interface BatchJob {
  id: string;
  chunks: string[];
  filingType: SECFilingType;
  options: SummarizationOptions;
}

/**
 * Interface for batch processing results
 */
export interface BatchResults {
  jobId: string;
  results: SummarizationResult[];
  errors: { jobId: string; error: string }[];
  completedAt: Date;
  processingTimeMs: number;
}

/**
 * Batch processor for handling multiple summarization jobs in parallel
 */
export class BatchProcessor {
  private concurrencyLimit: number;
  private activeJobs: Map<string, Promise<SummarizationResult>> = new Map();
  private limiter: ReturnType<typeof pLimit>;
  
  /**
   * Create a new batch processor
   * @param concurrencyLimit Maximum number of concurrent jobs
   */
  constructor(concurrencyLimit: number = 3) {
    this.concurrencyLimit = concurrencyLimit;
    this.limiter = pLimit(concurrencyLimit);
    componentLogger.info(`Batch processor initialized with concurrency limit of ${concurrencyLimit}`);
  }
  
  /**
   * Process a batch of jobs with concurrency control
   * @param jobs Array of batch jobs to process
   * @returns Results of batch processing
   */
  async processBatch(jobs: BatchJob[]): Promise<BatchResults> {
    const startTime = Date.now();
    const results: SummarizationResult[] = [];
    const errors: { jobId: string; error: string }[] = [];
    
    componentLogger.info(`Starting batch processing of ${jobs.length} jobs`);
    monitoring.incrementCounter('ai.batch.jobs_submitted', jobs.length);
    
    // Process jobs in parallel with concurrency limit
    const promises = jobs.map(job => {
      return this.limiter(async () => {
        try {
          componentLogger.info(`Processing job ${job.id}`);
          monitoring.incrementCounter('ai.batch.jobs_started', 1);
          
          // Track this job as active
          const jobPromise = processAllChunks(job.chunks, job.filingType, job.options);
          this.activeJobs.set(job.id, jobPromise);
          
          // Wait for job to complete
          const result = await jobPromise;
          
          // Remove from active jobs and return result
          this.activeJobs.delete(job.id);
          results.push(result);
          
          componentLogger.info(`Completed job ${job.id}`);
          monitoring.incrementCounter('ai.batch.jobs_completed', 1);
          
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          componentLogger.error(`Error processing job ${job.id}: ${errorMessage}`);
          monitoring.incrementCounter('ai.batch.jobs_failed', 1);
          
          // Remove from active jobs and track error
          this.activeJobs.delete(job.id);
          errors.push({ jobId: job.id, error: errorMessage });
          
          // Re-throw to propagate error
          throw error;
        }
      }).catch(error => {
        // Catch errors here to prevent Promise.all from failing early
        const errorMessage = error instanceof Error ? error.message : String(error);
        componentLogger.error(`Caught error in job: ${errorMessage}`);
        // Error already tracked in the try/catch above
        return null;
      });
    });
    
    // Wait for all jobs to complete (or fail)
    await Promise.all(promises);
    
    const processingTimeMs = Date.now() - startTime;
    componentLogger.info(`Batch processing completed in ${processingTimeMs}ms. Successful: ${results.length}, Failed: ${errors.length}`);
    monitoring.recordTiming('ai.batch.total_processing_time', processingTimeMs);
    
    return {
      jobId: `batch-${startTime}`,
      results,
      errors,
      completedAt: new Date(),
      processingTimeMs
    };
  }
  
  /**
   * Process a single job with the batch processor
   * @param job Batch job to process
   * @returns Result of job processing
   */
  async processJob(job: BatchJob): Promise<SummarizationResult> {
    return this.processBatch([job]).then(batchResults => {
      if (batchResults.errors.length > 0) {
        throw new Error(batchResults.errors[0].error);
      }
      return batchResults.results[0];
    });
  }
  
  /**
   * Cancel a specific job by ID
   * @param jobId ID of the job to cancel
   * @returns True if job was cancelled, false if not found
   */
  cancelJob(jobId: string): boolean {
    if (!this.activeJobs.has(jobId)) {
      componentLogger.warn(`Attempted to cancel non-existent job: ${jobId}`);
      return false;
    }
    
    // We can't actually cancel the promise, but we can remove it from our tracking
    this.activeJobs.delete(jobId);
    componentLogger.info(`Cancelled job ${jobId}`);
    monitoring.incrementCounter('ai.batch.jobs_cancelled', 1);
    
    return true;
  }
  
  /**
   * Get the status of all active jobs
   * @returns Map of job IDs to their status
   */
  getActiveJobs(): string[] {
    return Array.from(this.activeJobs.keys());
  }
  
  /**
   * Change the concurrency limit
   * @param newLimit New concurrency limit
   */
  setConcurrencyLimit(newLimit: number): void {
    this.concurrencyLimit = newLimit;
    this.limiter = pLimit(newLimit);
    componentLogger.info(`Updated concurrency limit to ${newLimit}`);
  }
}

// Export a singleton instance with default concurrency
export const batchProcessor = new BatchProcessor(3);
