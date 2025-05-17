import { NextResponse } from 'next/server';
import { JobQueueService, JobType } from '@/lib/job-queue';
import { LockService } from '@/lib/job-queue/lock-service';
import { v4 as uuidv4 } from 'uuid';

// Number of jobs to process in a single run
const BATCH_SIZE = 10;
// Process ID for this instance
const processId = uuidv4();

/**
 * GET handler for job processing cron job
 * This endpoint is called by Vercel Cron to process pending jobs
 */
export async function GET(request: Request) {
  // Extract job type from query parameters if any
  const { searchParams } = new URL(request.url);
  const specificJobType = searchParams.get('type') as JobType | null;
  
  // Create a lock name that includes the job type if specified
  const lockName = specificJobType 
    ? `process-${specificJobType.toLowerCase()}`
    : 'process-all-jobs';
    
  try {
    // Try to acquire a distributed lock to prevent concurrent execution
    const lock = await LockService.acquireLock(lockName, processId, 10); // 10 minutes TTL
    
    if (!lock) {
      console.log(`Job processor ${lockName} is already running, skipping`);
      return NextResponse.json({ 
        success: false, 
        message: 'Another job processor is already running' 
      });
    }
    
    console.log(`Starting job processor ${lockName} with process ID ${processId}`);
    
    // Determine job types to process
    const jobTypes = specificJobType ? [specificJobType] : undefined;
    
    // Process a batch of jobs
    const results = await processBatchOfJobs(jobTypes);
    
    // Release the lock after processing
    await LockService.releaseLock(lockName, processId);
    
    return NextResponse.json({
      success: true,
      processed: results.processed,
      failed: results.failed,
      jobTypes: results.jobTypes
    });
  } catch (error) {
    console.error(`Error in job processor ${lockName}:`, error);
    
    // Attempt to release the lock in case of error
    try {
      await LockService.releaseLock(lockName, processId);
    } catch (lockError) {
      console.error('Failed to release lock:', lockError);
    }
    
    // Return a formatted error response
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to process jobs',
      message: (error as Error).message
    }, { 
      status: 500 
    });
  }
}

/**
 * Process a batch of jobs from the queue
 */
async function processBatchOfJobs(jobTypes?: JobType[]) {
  let processed = 0;
  let failed = 0;
  const processedJobTypes = new Set<string>();
  
  try {
    // Process up to BATCH_SIZE jobs
    for (let i = 0; i < BATCH_SIZE; i++) {
      // Get the next job
      const job = await JobQueueService.getNextJob(jobTypes);
      
      // If no more jobs, break the loop
      if (!job) {
        console.log('No more jobs to process');
        break;
      }
      
      console.log(`Processing job ${job.id} of type ${job.jobType}`);
      processedJobTypes.add(job.jobType);
      
      try {
        // Mark job as processing
        await JobQueueService.markJobAsProcessing(job.id);
        
        // Process job based on type
        switch (job.jobType) {
          case 'CHECK_10K_FILINGS':
          case 'CHECK_10Q_FILINGS':
          case 'CHECK_8K_FILINGS':
          case 'CHECK_FORM4_FILINGS':
            // These jobs should call back to the check-filings endpoint with the specific type
            const filingType = job.payload.filingType;
            // In a real implementation, we would use fetch to call the endpoint
            // For now, just log it
            console.log(`Would process filing check for type ${filingType}`);
            break;
            
          case 'PROCESS_FILING':
            // This will be implemented in a future task for AI summarization
            console.log(`Would process filing summary for ${job.payload.ticker}`);
            break;
            
          case 'ARCHIVE_FILINGS':
            // Archive old filings
            console.log('Would archive old filings');
            break;
            
          default:
            throw new Error(`Unknown job type: ${job.jobType}`);
        }
        
        // Mark job as completed
        await JobQueueService.markJobAsCompleted(job.id, { status: 'success' });
        processed++;
      } catch (error) {
        console.error(`Failed to process job ${job.id}:`, error);
        
        // Mark job as failed
        await JobQueueService.markJobAsFailed(job.id, error as Error);
        failed++;
      }
    }
    
    return {
      processed,
      failed,
      jobTypes: Array.from(processedJobTypes)
    };
  } catch (error) {
    console.error('Error processing batch of jobs:', error);
    throw new Error(`Failed to process batch of jobs: ${(error as Error).message}`);
  }
} 