import { NextRequest, NextResponse } from 'next/server';
import { JobQueueService, JobType } from '../../../../lib/job-queue';
// JobResultData imported but used in interface declaration extension
import { LockService } from '../../../../lib/job-queue/lock-service';
// DeadLetterQueueService import removed - not used in active code paths
import { logger } from '../../../../lib/logging';
import { 
  appRouterAsyncHandler
} from '../../../../lib/error-handling/index';
import { 
  applySecurityMiddleware,
  createErrorResponse,
  createSuccessResponse,
  logSecurityEvent
} from '../../../../lib/validation/middleware';
import { CronSchemas } from '../../../../lib/validation/schemas/api-schemas';
// ApiError, ErrorCode imports removed - not used in active code paths
// ErrorCategory, ErrorSeverity imports removed - not used in active code paths
// Retry and circuit breaker imports removed - not used in active code paths
// import { 
//   executeWithRetry, 
//   RetryConfig, 
//   DefaultRetryConfig,
//   CircuitBreakerConfig,
//   DefaultCircuitBreakerConfig,
//   TimeoutAbortController
// } from '../../../../lib/error-handling/retry';
// Model fallback imports - reserved for future use
// import { 
//   executeWithModelFallback, 
//   BatchClaudeFallback, 
//   ModelCapability
// } from '../../../../lib/error-handling/model-fallback';
import { monitoring } from '@/lib/monitoring';
import { v4 as uuidv4 } from 'uuid';
// PrismaClient import - using service layer instead
// import { PrismaClient } from '@prisma/client';
import { summarizeFiling, SummarizationError } from '../../../../lib/ai/summarize';
import { AsyncFilingProcessor } from '../../../../lib/job-queue/async-filing-processor';
// claudeClient import removed - not used in active code paths
// SummarizationResult import removed - not used in active code paths

// Define an interface for the job object structure returned from the database
interface JobQueueItem {
  id: string;
  jobType: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts?: number;
  [key: string]: unknown; // For other properties we don't explicitly need to type
}

// Extend the JobResultData interface to include our AI metrics
declare module '../../../../lib/job-queue' {
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

// Batch size configuration - using dynamic limit parameter instead
// const BATCH_SIZE = 10;
// Maximum attempts configuration - reserved for complex job processing
// const MAX_ATTEMPTS = 3;
// Process ID for this instance
const processId = uuidv4();

// Component logger
const componentLogger = logger.child('job-processor');

// Use singleton Claude client for AI processing

// Circuit breaker configuration - reserved for complex error handling
// const jobCircuitBreakerConfig = {
//   failureThreshold: 5,
//   resetTimeoutMs: 60000,
//   halfOpenSuccessThreshold: 2
// };

// The processJob function is currently unused - reserved for future job processing architecture
// This would be used for more complex job processing scenarios
/*
const processJob = async (jobId: string) => {
  // Implementation reserved for future use
};
*/

/**
 * GET handler for job processing cron job
 * This endpoint is called by Vercel Cron to process queued jobs
 * 
 * SECURITY: Protected with cron authentication and input validation
 */
export const GET = appRouterAsyncHandler(async (request: NextRequest) => {
  const startTime = Date.now();
  
  // Build-time safety check
  if (!request?.headers) {
    return NextResponse.json({ 
      error: 'Invalid request context', 
      buildTime: true 
    }, { status: 400 });
  }
  
  try {
    // Apply comprehensive security validation
    const securityResult = await applySecurityMiddleware(
      request,
      CronSchemas.processJobsQuery,
      {
        requireCronAuth: true,
        logSecurityEvents: true,
        timeoutMs: 300000 // 5 minutes for job processing
      }
    );
    
    // Check if security validation failed
    if (securityResult.response) {
      return securityResult.response;
    }
    
    // Extract validated parameters
    const { limit, types } = securityResult.data;
    const jobTypes = types ? types.split(',').filter(Boolean) : undefined;
    
    // Additional validation for job types
    if (jobTypes) {
      const validJobTypes: JobType[] = [
        'CHECK_FILINGS', 'PROCESS_FILING', 'ARCHIVE_FILINGS',
        'CHECK_10K_FILINGS', 'CHECK_10Q_FILINGS', 'CHECK_8K_FILINGS', 'CHECK_FORM4_FILINGS',
        'SUMMARIZE_FILING', 'SEND_FILING_NOTIFICATION', 'COMPILE_DAILY_DIGEST',
        'ASYNC_SUMMARIZE_FILING', 'ASYNC_EMAIL_DIGEST', 'ASYNC_FILING_CLEANUP', 'ASYNC_WEBHOOK_NOTIFICATION'
      ];
      
      for (const type of jobTypes) {
        if (!validJobTypes.includes(type as JobType)) {
          return createErrorResponse(`Invalid job type: ${type}`, 400);
        }
      }
    }
  
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
    const jobs = await JobQueueService.getJobsToProcess(limit, jobTypes ? jobTypes[0] as JobType : undefined);
    
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
          } else if (job.jobType === 'ASYNC_SUMMARIZE_FILING') {
            // Phase 2: Process async filing summarization
            const payload = job.payload as { filingId?: string; userId?: string; [key: string]: unknown }; // Type assertion for async job payload
            
            if (!payload.filingId || !payload.userId) {
              throw new Error('Missing filingId or userId in async job payload');
            }
            
            componentLogger.info(`Processing async filing summarization ${job.id}`, {
              filingId: payload.filingId,
              ticker: payload.ticker,
              userId: payload.userId
            });
            
            // Call the async filing processor
            const result = await AsyncFilingProcessor.processAsyncFilingSummarization(
              job.id,
              payload
            );
            
            if (!result.success) {
              throw new Error(result.error || 'Async filing processing failed');
            }
            
            // Log success
            componentLogger.info(`Successfully processed async filing job ${job.id}`, {
              summaryId: result.summaryId,
              cost: result.cost,
              processingTime: result.processingTime,
              duration: Date.now() - jobStartTime
            });
            
            // Mark job as completed
            await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
              completedAt: new Date(),
              executionTime: Date.now() - jobStartTime,
              result: {
                summaryId: result.summaryId,
                cost: result.cost,
                tokensUsed: result.tokensUsed,
                model: result.model,
                processingTime: result.processingTime,
                fallbackUsed: result.fallbackUsed
              }
            });
            
            // Track successful async job
            monitoring.incrementCounter('jobs.completed', 1, {
              jobType: job.jobType,
              priority: payload.priority || 'unknown'
            });
            
            monitoring.recordTiming('async_filing.job_duration', Date.now() - jobStartTime);
            
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
    const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as { success: boolean }).success).length;
    const failed = results.filter(r => r.status === 'rejected' || !(r.value as { success: boolean }).success).length;
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log completion
    componentLogger.info(`Completed job processing`, {
      processed: jobs.length,
      succeeded,
      failed,
      duration
    });
    
    // Return success response with security headers
    return createSuccessResponse({
      success: true,
      message: `Job processing completed`,
      processed: jobs.length,
      succeeded,
      failed,
      duration,
      processId
    });
  } catch (error) {
    // Track processing failure
    monitoring.incrementCounter('jobs.processor_error', 1);
    
    // Log security event for processing failures
    logSecurityEvent({
      type: 'invalid_request',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      url: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      details: { 
        error: error instanceof Error ? error.message : String(error),
        processId 
      }
    });
    
    if (error instanceof Error) {
      return createErrorResponse(`Failed to process jobs: ${error.message}`, 500);
    }
    return createErrorResponse('Unknown error occurred during job processing', 500);
  } finally {
    // Release the lock
    await LockService.releaseLock(lockName, processId);
  }
  
  } catch (outerError) {
    // Handle security middleware errors
    return createErrorResponse(
      `Security validation failed: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`,
      400
    );
  }
}); 