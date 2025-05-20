import { NextResponse } from 'next/server';
import { JobQueueService, JobType, JobResultData } from '@/lib/job-queue';
import { LockService } from '@/lib/job-queue/lock-service';
import { DeadLetterQueueService } from '@/lib/job-queue/dead-letter-queue';
import { logger } from '@/lib/logging';
import { 
  appRouterAsyncHandler, 
  createInternalError,
  ApiError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity
} from '@/lib/error-handling';
import { 
  executeWithRetry, 
  RetryConfig, 
  DefaultRetryConfig,
  CircuitBreakerConfig,
  DefaultCircuitBreakerConfig,
  TimeoutAbortController
} from '@/lib/error-handling/retry';
import { 
  executeWithModelFallback, 
  BatchClaudeFallback, 
  ModelCapability
} from '@/lib/error-handling/model-fallback';
import { monitoring } from '@/lib/monitoring';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { summarizeFiling, SummarizationResult, SummarizationError } from '@/lib/ai/summarize';
import { ClaudeClient } from '@/lib/ai/claude-client';

// Define an interface for the job object structure returned from the database
interface JobQueueItem {
  id: string;
  jobType: JobType;
  payload: any;
  attempts: number;
  [key: string]: any; // For other properties we don't explicitly need to type
}

// Extend the JobResultData interface to include our AI metrics
declare module '@/lib/job-queue' {
  interface JobResultData {
    duration?: number;
    modelUsed?: string;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    attempts?: number;
    // Error details
    errorCode?: string;
    errorCategory?: string;
    isRetriable?: boolean;
    lastError?: string;
    stack?: string;
  }
}

// Number of jobs to process in a single run
const BATCH_SIZE = 10;
// Maximum attempts before moving to dead letter queue
const MAX_ATTEMPTS = 3;
// Process ID for this instance
const processId = uuidv4();

// Component logger
const componentLogger = logger.child('job-processor');

// Initialize Claude client for AI processing
const claudeClient = new ClaudeClient();

// Process-specific circuit breaker configuration
const jobCircuitBreakerConfig: CircuitBreakerConfig = {
  ...DefaultCircuitBreakerConfig,
  failureThreshold: 5, // More tolerant for batch jobs
  resetTimeoutMs: 60000, // 1 minute reset time
  halfOpenSuccessThreshold: 2
};

/**
 * Process a single job with error handling
 */
const processJob = async (jobId: string) => {
  // We'll implement detailed job processing later
  try {
    // Get job details
    const job = await JobQueueService.getJobById(jobId);
    
    if (!job) {
      componentLogger.warn(`Job not found: ${jobId}`);
      monitoring.incrementCounter('jobs.not_found', 1);
      return false;
    }
    
    // Mark job as processing
    await JobQueueService.updateJobStatus(jobId, 'PROCESSING');
    
    // Log job processing start
    componentLogger.info(`Processing job ${jobId}`, { 
      jobType: job.jobType,
      payload: job.payload,
      attempts: job.attempts,
    });
    
    // Start tracking performance
    monitoring.startTimer(`job.${job.jobType}.process`);
    const startTime = Date.now();
    
    // Create an abort controller with timeout
    const abortController = new TimeoutAbortController();
    // Set different timeouts based on job type
    if (job.jobType === 'SUMMARIZE_FILING') {
      // Longer timeout for AI operations
      abortController.setTimeout(5 * 60 * 1000); // 5 minutes
    } else {
      // Standard timeout for other operations
      abortController.setTimeout(2 * 60 * 1000); // 2 minutes
    }
    
    // Simple job type based processing - will be expanded in future tasks
    let result: SummarizationResult | undefined;
    
    switch (job.jobType) {
      case 'CHECK_FILINGS':
        // Will implement detailed filing check process in future task
        componentLogger.info(`Simulating CHECK_FILINGS job execution`, { jobId });
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 500));
        break;
        
      case 'PROCESS_FILING':
        // Will implement detailed filing processing in future task
        componentLogger.info(`Simulating PROCESS_FILING job execution`, { jobId });
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;
        
      case 'ARCHIVE_FILINGS':
        // Will implement archiving in future task
        componentLogger.info(`Simulating ARCHIVE_FILINGS job execution`, { jobId });
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 300));
        break;
        
      case 'SUMMARIZE_FILING':
        // Process the filing summarization with robust error handling and retries
        componentLogger.info(`Executing SUMMARIZE_FILING job`, { 
          jobId, 
          filingId: job.payload.filingId,
          summaryId: job.payload.summaryId 
        });
        
        // Configure retry behavior specific to summarization
        const summaryRetryConfig: RetryConfig = {
          ...DefaultRetryConfig,
          maxRetries: 4, // More retries for AI operations
          initialDelayMs: 2000, // Start with 2 second delay
          maxDelayMs: 60000, // Max 1 minute delay
          backoffFactor: 3, // More aggressive backoff for AI rate limits
          jitterFactor: 0.3,
          onRetry: (error, attempt, delay) => {
            componentLogger.warn(`Retry attempt ${attempt} for summarization after ${delay}ms delay`, {
              error: error.message,
              attempt,
              delay,
              jobId,
              filingId: job.payload.filingId
            });
            monitoring.incrementCounter('jobs.summarize_filing.retry', 1);
          }
        };
        
        // Process with circuit breaker and retry mechanisms
        result = await executeWithRetry(
          async () => {
            // Use model fallback for Claude API
            return await summarizeFiling({
              filingId: job.payload.filingId,
              summaryId: job.payload.summaryId,
              requestId: jobId,
              claudeClient,
              claudeOptions: {
                requestType: 'batch', // Use batch configuration
                requiredCapabilities: [ModelCapability.SUMMARIZATION],
                abortSignal: abortController.signal,
                retryConfig: summaryRetryConfig
              }
            });
          },
          'summarize-filing-job', // Service name for circuit breaker
          summaryRetryConfig,
          jobCircuitBreakerConfig
        );
        
        // Record success after all retries and fallbacks
        monitoring.incrementCounter('jobs.summarize_filing.success', 1);
        componentLogger.info(`Successfully summarized filing`, {
          jobId,
          filingId: job.payload.filingId,
          executionTimeMs: Date.now() - startTime,
          modelUsed: result?.modelUsed,
          attempts: result?.attempts || 1,
        });
        break;
        
      // Form-specific filing checks
      case 'CHECK_10K_FILINGS':
      case 'CHECK_10Q_FILINGS':
      case 'CHECK_8K_FILINGS':
      case 'CHECK_FORM4_FILINGS':
        componentLogger.info(`Simulating ${job.jobType} job execution`, { jobId });
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 800));
        break;
        
      default:
        throw new ApiError(
          ErrorCode.BAD_REQUEST, 
          `Unsupported job type: ${job.jobType}`,
          { jobId }
        );
    }
    
    // Clear the timeout
    abortController.clearTimeout();
    
    // Calculate processing duration
    const duration = monitoring.stopTimer(`job.${job.jobType}.process`) || 
                    (Date.now() - startTime);
    
    // Prepare job result data including any important metrics
    let jobResultData: JobResultData = {};
    
    // Include AI metrics if this was an AI job
    if (job.jobType === 'SUMMARIZE_FILING' && result) {
      jobResultData = {
        duration,
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        attempts: result.attempts || 1
      };
    }
    
    // Mark job as completed with result data
    await JobQueueService.updateJobStatus(jobId, 'COMPLETED', jobResultData);
    
    // Log successful job completion
    componentLogger.info(`Job ${jobId} completed successfully`, { 
      jobType: job.jobType,
      duration,
    });
    
    // Track metrics
    monitoring.trackJobOperation(job.jobType, 'completed', duration);
    
    return true;
  } catch (error) {
    // Stop timer if running
    try {
      const job = await JobQueueService.getJobById(jobId);
      if (job) {
        monitoring.stopTimer(`job.${job.jobType}.process`);
      }
    } catch (e) {
      // Ignore errors in cleanup
    }
    
    // Get job details for failure handling
    let job;
    try {
      job = await JobQueueService.getJobById(jobId);
    } catch (getError) {
      // If we can't even get the job details, log and return
      componentLogger.error(`Failed to get job details for failure handling`, getError, { jobId });
      monitoring.incrementCounter('jobs.error', 1, { type: 'job_retrieval_error' });
      return false;
    }
    
    if (!job) {
      componentLogger.error(`Job not found for failure handling`, { jobId });
      monitoring.incrementCounter('jobs.error', 1, { type: 'job_not_found_error' });
      return false;
    }
    
    // Log the error with appropriate severity
    if (error instanceof Error) {
      // Determine error category and severity
      let category = ErrorCategory.UNKNOWN_ERROR;
      let severity = ErrorSeverity.MEDIUM;
      let isRetriable = false;
      
      if (error instanceof ApiError) {
        category = error.category;
        severity = error.severity;
        isRetriable = error.isRetriable;
        
        // Track specific API error types
        monitoring.incrementCounter('jobs.error', 1, {
          type: error.code,
          jobType: job.jobType
        });
      } else if (error instanceof SummarizationError) {
        category = ErrorCategory.AI_ERROR;
        isRetriable = error.isRetriable;
        
        // Track summarization-specific errors
        monitoring.incrementCounter('jobs.summarize_filing.error', 1, {
          reason: error.reason || 'unknown'
        });
      }
      
      // Log based on severity
      if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
        componentLogger.error(`Job ${jobId} failed with ${severity} severity`, error, { 
          jobId, 
          jobType: job.jobType,
          attempts: job.attempts,
          category,
          isRetriable
        });
      } else {
        componentLogger.warn(`Job ${jobId} failed with ${severity} severity`, { 
          error: error.message,
          jobId, 
          jobType: job.jobType,
          attempts: job.attempts,
          category,
          isRetriable
        });
      }
      
      // Update job status based on attempts
      try {
        const jobResultData: JobResultData = {
          lastError: error.message,
        };
        
        // Add stack trace if available
        if (error.stack) {
          jobResultData.stack = error.stack;
        }
        
        // Add API error details if available
        if (error instanceof ApiError) {
          jobResultData.errorCode = error.code;
          jobResultData.errorCategory = error.category;
          jobResultData.isRetriable = error.isRetriable;
        }
        
        // Check if we've exceeded max attempts
        if (job.attempts >= MAX_ATTEMPTS - 1) {
          // Move to dead letter queue before marking as failed
          await DeadLetterQueueService.addToDeadLetterQueue(
            jobId,
            job.jobType,
            job.payload,
            error,
            job.attempts + 1
          );
          
          componentLogger.warn(`Moving job ${jobId} to dead letter queue after ${job.attempts + 1} attempts`, {
            jobId,
            jobType: job.jobType
          });
          
          // Track DLQ metric
          monitoring.incrementCounter('jobs.dead_letter', 1, { jobType: job.jobType });
        } else if (job.jobType === 'SUMMARIZE_FILING' && error instanceof ApiError && error.isRetriable) {
          // For retriable errors with AI summarization, mark for retry after a delay
          // This is especially important for rate limit errors
          let retryAfterMs = error.retryAfter || 30000; // Default 30s delay if not specified
          
          componentLogger.info(`Scheduling retry for job ${jobId} after ${retryAfterMs}ms delay`, {
            jobId,
            jobType: job.jobType,
            errorCode: error.code
          });
          
          // Mark for retry with delay
          await JobQueueService.markForRetry(
            jobId, 
            new Date(Date.now() + retryAfterMs),
            jobResultData
          );
          
          monitoring.incrementCounter('jobs.scheduled_retry', 1, { 
            jobType: job.jobType,
            errorCode: error instanceof ApiError ? error.code : 'UNKNOWN'
          });
          
          return false;
        }
        
        // Update job status to FAILED
        await JobQueueService.updateJobStatus(jobId, 'FAILED', jobResultData);
        
        // Track failure metric
        monitoring.trackJobOperation(job.jobType, 'failed');
      } catch (updateError) {
        // If we can't update the job status, log it but don't fail
        componentLogger.error(`Failed to update job status for ${jobId}`, updateError);
        monitoring.incrementCounter('jobs.error', 1, { type: 'status_update_error' });
      }
    }
    
    return false;
  }
};

/**
 * GET handler for job processing cron job
 * This endpoint is called by Vercel Cron to process queued jobs
 */
export const GET = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // Extract parameters
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '5', 10);
  const jobTypes = searchParams.get('types')?.split(',') || undefined;
  
  // Create a lock name for this processor
  const lockName = 'process-jobs-queue';
  
  // Log the job start
  componentLogger.info(`Starting job processor`, {
    limit,
    jobTypes,
    processId
  });
  
  // Start tracking performance
  monitoring.incrementCounter('jobs.processing_started', 1);
  
  // Try to acquire a lock
  const lock = await LockService.acquireLock(lockName, processId);
  
  if (!lock) {
    componentLogger.info(`Another instance is already processing jobs`);
    monitoring.incrementCounter('jobs.processing_skipped', 1, { 
      reason: 'lock_exists'
    });
    
    return NextResponse.json({
      success: true,
      message: `Another instance is already processing jobs`,
      skipped: true
    });
  }
  
  try {
    // Get jobs to process
    const jobs = await JobQueueService.getJobsToProcess(limit, jobTypes ? jobTypes[0] as any : undefined);
    
    // If no jobs, return early
    if (jobs.length === 0) {
      componentLogger.info(`No jobs to process`);
      
      return NextResponse.json({
        success: true,
        message: `No jobs to process`,
        jobsProcessed: 0
      });
    }
    
    // Log the number of jobs found
    componentLogger.info(`Found ${jobs.length} jobs to process`);
    
    // Process each job
    const results = await Promise.allSettled(
      jobs.map(async (job: JobQueueItem) => {
        const jobStartTime = Date.now();
        
        // Mark job as processing
        await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
          startedAt: new Date()
        });
        
        // Log job processing start
        componentLogger.info(`Processing job ${job.id}`, {
          jobType: job.jobType,
          attempt: job.attempts + 1,
          maxAttempts: job.maxAttempts
        });
        
        try {
          // Process based on job type
          if (job.jobType === 'SUMMARIZE_FILING') {
            // Extract summaryId from payload
            const { summaryId } = job.payload;
            
            if (!summaryId) {
              throw new Error('Missing summaryId in job payload');
            }
            
            // Call the summarization function
            const result = await summarizeFiling(summaryId);
            
            // Log success
            componentLogger.info(`Successfully processed summarization job ${job.id}`, {
              summaryId,
              duration: Date.now() - jobStartTime
            });
            
            // Mark job as completed
            await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
              completedAt: new Date(),
              executionTime: Date.now() - jobStartTime,
              result
            });
            
            // Track successful job
            monitoring.incrementCounter('jobs.completed', 1, {
              jobType: job.jobType
            });
            
            return { jobId: job.id, success: true, result };
          } else {
            // Unsupported job type
            componentLogger.warn(`Unsupported job type: ${job.jobType}`, { jobId: job.id });
            
            // Mark job as failed
            await JobQueueService.updateJobStatus(job.id, 'FAILED', {
              failedAt: new Date(),
              error: `Unsupported job type: ${job.jobType}`,
              executionTime: Date.now() - jobStartTime
            });
            
            // Track failed job
            monitoring.incrementCounter('jobs.failed', 1, {
              jobType: job.jobType,
              reason: 'unsupported_type'
            });
            
            return { jobId: job.id, success: false, error: `Unsupported job type: ${job.jobType}` };
          }
        } catch (error) {
          // Log the error
          componentLogger.error(`Error processing job ${job.id}`, {
            jobType: job.jobType,
            error
          });
          
          // Mark job as failed
          await JobQueueService.updateJobStatus(job.id, 'FAILED', {
            failedAt: new Date(),
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            executionTime: Date.now() - jobStartTime
          });
          
          // Track failed job
          monitoring.incrementCounter('jobs.failed', 1, {
            jobType: job.jobType,
            reason: error instanceof SummarizationError ? error.code : 'unknown'
          });
          
          return { 
            jobId: job.id, 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    // Compile results
    const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    const failed = results.filter(r => r.status === 'rejected' || !(r.value as any).success).length;
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log completion
    componentLogger.info(`Completed job processing`, {
      processed: jobs.length,
      succeeded,
      failed,
      duration
    });
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: `Job processing completed`,
      processed: jobs.length,
      succeeded,
      failed,
      duration
    });
  } catch (error) {
    // Track processing failure
    monitoring.incrementCounter('jobs.processor_error', 1);
    
    if (error instanceof Error) {
      throw createInternalError(`Failed to process jobs: ${error.message}`, { error });
    }
    throw error;
  } finally {
    // Release the lock
    await LockService.releaseLock(lockName, processId);
  }
}); 