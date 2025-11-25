import { prisma } from '../db/prisma';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sanitizeJSON, detectMaliciousPatterns } from '../validation/sanitizers';

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
  | 'ASYNC_WEBHOOK_NOTIFICATION'
  // Phase 3: 3-phase async pipeline (202 pattern)
  | 'ASYNC_DISCOVER_FILINGS'  // Fast discovery job (<5s)
  | 'ASYNC_FETCH_FILING'       // SEC content fetch (60-120s)
  | 'ASYNC_SUMMARIZE_CACHED';  // AI summarization using cached content (17-90s)

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
   * 
   * SECURITY: Validates and sanitizes all input parameters
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
      // Validate job type
      const validJobTypes: JobType[] = [
        'CHECK_FILINGS', 'PROCESS_FILING', 'ARCHIVE_FILINGS',
        'CHECK_10K_FILINGS', 'CHECK_10Q_FILINGS', 'CHECK_8K_FILINGS', 'CHECK_FORM4_FILINGS',
        'SUMMARIZE_FILING', 'SEND_FILING_NOTIFICATION', 'COMPILE_DAILY_DIGEST',
        'ASYNC_SUMMARIZE_FILING', 'ASYNC_EMAIL_DIGEST', 'ASYNC_FILING_CLEANUP', 'ASYNC_WEBHOOK_NOTIFICATION',
        'ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'
      ];
      
      if (!validJobTypes.includes(jobType)) {
        throw new Error(`Invalid job type: ${jobType}`);
      }
      
      // Validate and sanitize payload
      const sanitizedPayload = sanitizeJSON(payload) as JobPayload;
      
      // Check for malicious patterns in payload (skip for email and filing jobs)
      // Skip security scanning for filing jobs as they contain SEC URLs and filing data that may trigger false positives
      // Also skip 3-phase pipeline jobs as they contain execution IDs and market context that may trigger false positives
      const skipSecurityScan = [
        'ASYNC_EMAIL_DIGEST',
        'ASYNC_SUMMARIZE_FILING',
        'ASYNC_DISCOVER_FILINGS',
        'ASYNC_FETCH_FILING',
        'ASYNC_SUMMARIZE_CACHED'
      ].includes(jobType);

      if (!skipSecurityScan) {
        const payloadString = JSON.stringify(sanitizedPayload);
        const detection = detectMaliciousPatterns(payloadString);
        if (detection.detected) {
          throw new Error(`Job payload contains potentially malicious patterns: ${detection.threats.join(', ')}`);
        }
      }
      
      // Validate priority
      const validatedPriority = z.number().int().min(1).max(10).parse(priority);
      
      // Validate maxAttempts
      const validatedMaxAttempts = z.number().int().min(1).max(10).parse(maxAttempts);
      
      // Validate idempotencyKey if provided
      let validatedIdempotencyKey: string | undefined = undefined;
      if (idempotencyKey) {
        validatedIdempotencyKey = z.string().max(255).parse(idempotencyKey);
      }
      
      // Validate scheduledFor date
      if (scheduledFor && (scheduledFor.getTime() < Date.now() - 24 * 60 * 60 * 1000)) {
        throw new Error('Cannot schedule jobs more than 24 hours in the past');
      }
      
      if (scheduledFor && (scheduledFor.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000)) {
        throw new Error('Cannot schedule jobs more than 30 days in the future');
      }

      // If idempotency key is provided, check for existing job
      if (validatedIdempotencyKey) {
        const existingJob = await prisma.jobQueue.findFirst({
          where: {
            idempotencyKey: validatedIdempotencyKey,
            status: {
              in: ['PENDING', 'PROCESSING', 'RETRYING']
            }
          }
        });

        if (existingJob) {
          return existingJob;
        }
      }
      
      // Generate secure job ID
      const jobId = uuidv4();

      // Create a new job
      return await prisma.jobQueue.create({
        data: {
          id: jobId,
          jobType,
          payload: sanitizedPayload,
          priority: validatedPriority,
          scheduledFor,
          idempotencyKey: validatedIdempotencyKey,
          maxRetries: validatedMaxAttempts,
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
   * 
   * SECURITY: Validates job ID format
   */
  static async getJobById(id: string) {
    try {
      // Validate job ID format
      const validatedId = z.string().uuid().parse(id);
      
      return await prisma.jobQueue.findUnique({
        where: { id: validatedId }
      });
    } catch (error) {
      console.error(`Error fetching job ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get jobs to process
   * 
   * SECURITY: Validates parameters and limits result size
   */
  static async getJobsToProcess(limit: number = 10, jobType?: JobType) {
    try {
      // Validate limit parameter
      const validatedLimit = z.number().int().min(1).max(100).parse(limit);
      
      // Validate job type if provided
      if (jobType) {
        const validJobTypes: JobType[] = [
          'CHECK_FILINGS', 'PROCESS_FILING', 'ARCHIVE_FILINGS',
          'CHECK_10K_FILINGS', 'CHECK_10Q_FILINGS', 'CHECK_8K_FILINGS', 'CHECK_FORM4_FILINGS',
          'SUMMARIZE_FILING', 'SEND_FILING_NOTIFICATION', 'COMPILE_DAILY_DIGEST',
          'ASYNC_SUMMARIZE_FILING', 'ASYNC_EMAIL_DIGEST', 'ASYNC_FILING_CLEANUP', 'ASYNC_WEBHOOK_NOTIFICATION'
        ];
        
        if (!validJobTypes.includes(jobType)) {
          throw new Error(`Invalid job type: ${jobType}`);
        }
      }
      
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
        take: validatedLimit
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
   * Get current queue depth for a specific job type
   * Used for estimation of completion time
   */
  static async getQueueDepth(jobType: JobType): Promise<number> {
    try {
      return await prisma.jobQueue.count({
        where: {
          jobType,
          status: { in: ['PENDING', 'RETRYING'] },
        }
      });
    } catch (error) {
      console.error('Error getting queue depth:', error);
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
