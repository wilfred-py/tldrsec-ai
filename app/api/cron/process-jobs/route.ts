import { NextResponse } from 'next/server';
import { JobQueueService, JobType, JobResultData } from '@/lib/job-queue';
import { LockService } from '@/lib/job-queue/lock-service';
  import { DeadLetterQueueService } from '@/lib/job-queue/dead-letter-queue';
import { logger } from '@/lib/logging';
import { 
  appRouterAsyncHandler, 
  createInternalError,
  ApiError,
  ErrorCode
} from '@/lib/error-handling';
import { monitoring } from '@/lib/monitoring';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

// Define an interface for the job object structure returned from the database
interface JobQueueItem {
  id: string;
  jobType: JobType;
  payload: any;
  attempts: number;
  [key: string]: any; // For other properties we don't explicitly need to type
}

// Number of jobs to process in a single run
const BATCH_SIZE = 10;
// Maximum attempts before moving to dead letter queue
const MAX_ATTEMPTS = 3;
// Process ID for this instance
const processId = uuidv4();

// Component logger
const componentLogger = logger.child('job-processor');

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
    
    // Record start time for performance tracking
    const startTime = Date.now();
    
    // Simple job type based processing - will be expanded in future tasks
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
    
    // Calculate processing duration
    const duration = Date.now() - startTime;
    
    // Mark job as completed
    await JobQueueService.updateJobStatus(jobId, 'COMPLETED');
    
    // Log successful job completion
    componentLogger.info(`Job ${jobId} completed successfully`, { 
      jobType: job.jobType,
      duration,
    });
    
    // Track metrics
    monitoring.trackJobOperation(job.jobType, 'completed', duration);
    
    return true;
  } catch (error) {
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
    
    // Log the error
    if (error instanceof Error) {
      componentLogger.error(`Job ${jobId} failed`, error, { 
        jobId, 
        jobType: job.jobType,
        attempts: job.attempts 
      });
      
      // Update job status based on attempts
      try {
        const jobResultData: JobResultData = {
          lastError: error.message,
        };
        
        // Add stack trace if available
        if (error.stack) {
          jobResultData.stack = error.stack;
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
 * This endpoint is called by Vercel Cron to process pending jobs
 */
export const GET = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // Extract job type from query parameters if any
  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get('type');
  // Convert null to undefined if needed, and ensure the value is a valid JobType
  const specificJobType = typeParam ? (typeParam as JobType) : undefined;
  
  // Create a lock name that includes the job type if specified
  const lockName = specificJobType 
    ? `process-${specificJobType.toLowerCase()}`
    : 'process-all-jobs';
  
  // Log the job processing start
  componentLogger.info(`Starting job processing`, {
    specificJobType,
    lockName,
    processId
  });
  
  // Try to acquire a lock
  const lock = await LockService.acquireLock(lockName, processId);
  
  if (!lock) {
    componentLogger.info(`Another instance is already processing jobs for ${lockName}`);
    return NextResponse.json({
      success: true,
      message: `Another instance is already processing jobs for ${lockName}`,
      processed: 0,
    });
  }
  
  try {
    // Get pending jobs
    const jobs = await JobQueueService.getJobsToProcess(BATCH_SIZE, specificJobType);
    
    if (jobs.length === 0) {
      componentLogger.info(`No pending jobs found for processing`, { specificJobType });
      return NextResponse.json({
        success: true,
        message: `No pending jobs found for processing`,
        processed: 0,
      });
    }
    
    // Log the number of jobs found
    componentLogger.info(`Found ${jobs.length} jobs to process`, { specificJobType });
    
    // Process each job
    const results = await Promise.all(
      jobs.map((job: JobQueueItem) => processJob(job.id))
    );
    
    // Count successful jobs
    const successCount = results.filter(Boolean).length;
    const failureCount = jobs.length - successCount;
    
    // Calculate processing time
    const duration = Date.now() - startTime;
    
    // Track metrics
    monitoring.incrementCounter('jobs.processed_batch', jobs.length, { 
      success: successCount.toString(),
      failed: failureCount.toString(),
      jobType: specificJobType || 'all' 
    });
    monitoring.recordTiming('jobs.batch_duration', duration, { 
      jobType: specificJobType || 'all' 
    });
    
    // Log the job processing summary
    componentLogger.info(`Job processing complete`, {
      totalJobs: jobs.length,
      successfulJobs: successCount,
      failedJobs: failureCount,
      duration,
      specificJobType,
    });
    
    // Return response
    return NextResponse.json({
      success: true,
      message: `Processed ${successCount} out of ${jobs.length} jobs`,
      processed: successCount,
      failed: failureCount,
      duration,
    });
  } catch (error) {
    // This will be caught by the appRouterAsyncHandler
    // and handled appropriately
    if (error instanceof Error) {
      // Track error metric
      monitoring.incrementCounter('jobs.system_error', 1, {
        type: error.name,
        jobType: specificJobType || 'all'
      });
      
      throw createInternalError(`Job processing failed: ${error.message}`, {
        specificJobType,
        processId,
        error,
      });
    }
    throw error;
  } finally {
    // Always release the lock regardless of outcome
    try {
      await LockService.releaseLock(lockName, processId);
      componentLogger.debug(`Released lock: ${lockName}`);
    } catch (releaseError) {
      componentLogger.error(`Failed to release lock: ${lockName}`, releaseError);
      monitoring.incrementCounter('locks.release_error', 1);
    }
  }
}); 