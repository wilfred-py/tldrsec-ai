import { prisma } from '../db/prisma';
import { v4 as uuidv4 } from 'uuid';

// Job types (Enhanced for Phase 2 async processing)
export type JobType = 
  | 'CHECK_FILINGS' 
  | 'PROCESS_FILING' 
  | 'ARCHIVE_FILINGS'
  | 'CHECK_10K_FILINGS'
  | 'CHECK_10Q_FILINGS'
  | 'CHECK_8K_FILINGS'
  | 'CHECK_FORM4_FILINGS'
  | 'SUMMARIZE_FILING'
  | 'SEND_FILING_NOTIFICATION'
  | 'COMPILE_DAILY_DIGEST'
  // Phase 2: Async processing job types
  | 'ASYNC_SUMMARIZE_FILING'
  | 'ASYNC_EMAIL_DIGEST'
  | 'ASYNC_FILING_CLEANUP'
  | 'ASYNC_WEBHOOK_NOTIFICATION';

// Job status
export type JobStatus = 
  | 'PENDING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'RETRYING';

// Job payload interface
export interface JobPayload {
  [key: string]: any;
}

// Job result/error data
export interface JobResultData {
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  lastError?: string;
  executionTime?: number;
  result?: any;
  stack?: string;
  error?: string;
}

/**
 * Process a job based on its type
 */
export async function processJobCallback(job: any, digestService?: any) {
  switch (job.jobType) {
    case 'COMPILE_DAILY_DIGEST':
      if (!digestService) {
        throw new Error('Digest service is required for COMPILE_DAILY_DIGEST job');
      }
      await digestService.compileAndSendDigests();
      break;
    // Other job types handled elsewhere
    default:
      // This function can be extended to handle other job types
      break;
  }
}

/**
 * Job queue service for managing background tasks
 */
export class JobQueueService {
  /**
   * Add a new job to the queue
   */
  static async addJob({
    jobType,
    payload,
    priority = 5,
    scheduledFor = new Date(),
    idempotencyKey,
    maxAttempts = 3
  }: {
    jobType: JobType;
    payload: JobPayload;
    priority?: number;
    scheduledFor?: Date;
    idempotencyKey?: string;
    maxAttempts?: number;
  }) {
    try {
      // If idempotency key is provided, check for existing job
      if (idempotencyKey) {
        const existingJob = await prisma.jobQueue.findFirst({
          where: {
            idempotencyKey,
            status: {
              in: ['PENDING', 'PROCESSING', 'RETRYING']
            }
          }
        });

        if (existingJob) {
          return existingJob;
        }
      }

      // Create a new job
      return await prisma.jobQueue.create({
        data: {
          id: uuidv4(),
          jobType,
          payload,
          priority,
          scheduledFor,
          idempotencyKey,
          maxRetries: maxAttempts,
          status: 'PENDING',
          createdAt: new Date()
          // updatedAt is handled by Prisma's @updatedAt decorator
        }
      });
    } catch (error) {
      console.error('Error adding job to queue:', error);
      throw error;
    }
  }

  /**
   * Get a specific job by ID
   */
  static async getJobById(id: string) {
    try {
      return await prisma.jobQueue.findUnique({
        where: { id }
      });
    } catch (error) {
      console.error(`Error fetching job ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get jobs to process
   */
  static async getJobsToProcess(limit: number = 10, jobType?: JobType) {
    try {
      const now = new Date();
      
      return await prisma.jobQueue.findMany({
        where: {
          status: {
            in: ['PENDING', 'RETRYING']
          },
          scheduledFor: {
            lte: now
          },
          ...(jobType ? { jobType } : {}),
          retryCount: {
            lt: prisma.jobQueue.fields.maxRetries
          }
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledFor: 'asc' },
          { createdAt: 'asc' }
        ],
        take: limit
      });
    } catch (error) {
      console.error('Error getting jobs to process:', error);
      throw error;
    }
  }

  /**
   * Get the next job to process
   */
  static async getNextJob(jobTypes?: JobType[]) {
    try {
      const now = new Date();
      
      return await prisma.jobQueue.findFirst({
        where: {
          status: {
            in: ['PENDING', 'RETRYING']
          },
          scheduledFor: {
            lte: now
          },
          ...(jobTypes && jobTypes.length > 0 
            ? { jobType: { in: jobTypes } } 
            : {}),
          retryCount: {
            lt: prisma.jobQueue.fields.maxRetries
          }
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledFor: 'asc' },
          { createdAt: 'asc' }
        ]
      });
    } catch (error) {
      console.error('Error getting next job:', error);
      throw error;
    }
  }

  /**
   * Update job status with optional result data
   */
  static async updateJobStatus(id: string, status: JobStatus, resultData: JobResultData = {}) {
    try {
      const job = await prisma.jobQueue.findUnique({
        where: { id }
      });

      if (!job) {
        throw new Error(`Job with ID ${id} not found`);
      }

      const now = new Date();
      const updateData: any = {
        status
        // updatedAt is handled by Prisma's @updatedAt decorator
      };

      // Add appropriate timestamp based on status
      if (status === 'PROCESSING') {
        updateData.startedAt = resultData.startedAt || now;
        updateData.retryCount = job.retryCount + 1;
      } else if (status === 'COMPLETED') {
        updateData.completedAt = resultData.completedAt || now;
        updateData.executionTime = resultData.executionTime || 
          (job.startedAt ? now.getTime() - job.startedAt.getTime() : undefined);
        updateData.result = resultData.result;
      } else if (status === 'FAILED') {
        updateData.failedAt = resultData.failedAt || now;
        updateData.lastError = resultData.error || resultData.lastError;
        
        // If stack trace is provided, save it
        if (resultData.stack) {
          updateData.lastErrorStack = resultData.stack;
        }
        
        // Determine if we should retry
        if (job.retryCount < job.maxRetries) {
          // Schedule for retry with exponential backoff
          const backoffMinutes = Math.pow(2, job.retryCount);
          const retryDate = new Date();
          retryDate.setMinutes(retryDate.getMinutes() + backoffMinutes);
          
          updateData.status = 'RETRYING';
          updateData.scheduledFor = retryDate;
        }
      }

      return await prisma.jobQueue.update({
        where: { id },
        data: updateData
      });
    } catch (error) {
      console.error(`Error updating job ${id} status:`, error);
      throw error;
    }
  }

  /**
   * Mark a job for retry at a specific time
   * 
   * @param id - Job ID to retry
   * @param retryAt - Date/time when the job should be retried
   * @param resultData - Optional data to store with the job
   * @returns The updated job record
   */
  static async markForRetry(id: string, retryAt: Date, resultData: JobResultData = {}) {
    try {
      const job = await prisma.jobQueue.findUnique({
        where: { id }
      });

      if (!job) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      const now = new Date();
      const updateData: any = {
        status: 'RETRYING',
        scheduledFor: retryAt
        // updatedAt is handled by Prisma's @updatedAt decorator
      };
      
      // Add error information if provided
      if (resultData.lastError) {
        updateData.lastError = resultData.lastError;
      }
      
      if (resultData.stack) {
        updateData.lastErrorStack = resultData.stack;
      }
      
      // Store additional result data in the job record
      if (Object.keys(resultData).length > 0) {
        // Ensure job.result is treated as an object before spreading
        const existingResult = typeof job.result === 'object' && job.result !== null ? job.result : {};
        updateData.result = {
          ...existingResult,
          lastRetry: {
            attemptNumber: job.retryCount,
            error: resultData.lastError,
            timeStamp: now.toISOString()
          }
        };
      }
      
      return await prisma.jobQueue.update({
        where: { id },
        data: updateData
      });
    } catch (error) {
      console.error(`Error marking job ${id} for retry:`, error);
      throw error;
    }
  }

  /**
   * Clean up old completed jobs
   */
  static async cleanupOldJobs(olderThan: Date) {
    try {
      return await prisma.jobQueue.deleteMany({
        where: {
          status: {
            in: ['COMPLETED', 'FAILED']
          },
          // Use createdAt instead of updatedAt since updatedAt might not be in the schema
          createdAt: {
            lt: olderThan
          }
        }
      });
    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
      throw error;
    }
  }
}
