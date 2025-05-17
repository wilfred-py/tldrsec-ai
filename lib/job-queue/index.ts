import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Initialize Prisma client
const prisma = new PrismaClient();

// Job types
export type JobType = 
  | 'CHECK_FILINGS' 
  | 'PROCESS_FILING' 
  | 'ARCHIVE_FILINGS'
  | 'CHECK_10K_FILINGS'
  | 'CHECK_10Q_FILINGS'
  | 'CHECK_8K_FILINGS'
  | 'CHECK_FORM4_FILINGS';

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
    maxRetries = 3
  }: {
    jobType: JobType;
    payload: JobPayload;
    priority?: number;
    scheduledFor?: Date;
    idempotencyKey?: string;
    maxRetries?: number;
  }) {
    try {
      // Check for existing job with same idempotency key if provided
      if (idempotencyKey) {
        const existingJob = await prisma.jobQueue.findFirst({
          where: {
            idempotencyKey,
            status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] }
          }
        });

        if (existingJob) {
          console.log(`Job with idempotency key ${idempotencyKey} already exists, skipping`);
          return existingJob;
        }
      }

      // Create a new job
      const job = await prisma.jobQueue.create({
        data: {
          id: uuidv4(),
          jobType,
          status: 'PENDING',
          priority,
          payload,
          idempotencyKey,
          scheduledFor,
          maxRetries,
          createdAt: new Date()
        }
      });

      console.log(`Added job ${job.id} of type ${jobType} to queue`);
      return job;
    } catch (error) {
      console.error('Failed to add job to queue:', error);
      throw new Error(`Failed to add job to queue: ${(error as Error).message}`);
    }
  }

  /**
   * Get the next pending job to process based on priority and scheduled time
   */
  static async getNextJob(jobTypes?: JobType[]) {
    try {
      const whereClause: any = {
        status: 'PENDING',
        scheduledFor: { lte: new Date() }
      };

      // Filter by job types if specified
      if (jobTypes && jobTypes.length > 0) {
        whereClause.jobType = { in: jobTypes };
      }

      const job = await prisma.jobQueue.findFirst({
        where: whereClause,
        orderBy: [
          { priority: 'desc' }, // Higher priority first
          { scheduledFor: 'asc' }, // Earlier scheduled time first
          { createdAt: 'asc' } // Oldest job first
        ]
      });

      return job;
    } catch (error) {
      console.error('Failed to get next job:', error);
      throw new Error(`Failed to get next job: ${(error as Error).message}`);
    }
  }

  /**
   * Update job status
   */
  static async updateJobStatus(jobId: string, status: JobStatus, details?: {
    startedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    lastError?: string;
    executionTime?: number;
    result?: any;
  }) {
    try {
      const updateData: any = { status };

      // Add optional fields if provided
      if (details) {
        Object.assign(updateData, details);

        // Increment retry count if status is RETRYING
        if (status === 'RETRYING') {
          updateData.retryCount = { increment: 1 };
        }
      }

      const job = await prisma.jobQueue.update({
        where: { id: jobId },
        data: updateData
      });

      console.log(`Updated job ${jobId} status to ${status}`);
      return job;
    } catch (error) {
      console.error(`Failed to update job ${jobId} status:`, error);
      throw new Error(`Failed to update job status: ${(error as Error).message}`);
    }
  }

  /**
   * Mark a job as processing
   */
  static async markJobAsProcessing(jobId: string) {
    const startedAt = new Date();
    return this.updateJobStatus(jobId, 'PROCESSING', { startedAt });
  }

  /**
   * Mark a job as completed
   */
  static async markJobAsCompleted(jobId: string, result?: any) {
    const completedAt = new Date();
    const job = await prisma.jobQueue.findUnique({ where: { id: jobId } });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Calculate execution time in milliseconds
    const startedAt = job.startedAt;
    const executionTime = startedAt ? completedAt.getTime() - startedAt.getTime() : null;

    return this.updateJobStatus(jobId, 'COMPLETED', { 
      completedAt, 
      result, 
      executionTime: executionTime || undefined 
    });
  }

  /**
   * Mark a job as failed
   */
  static async markJobAsFailed(jobId: string, error: Error | string) {
    const failedAt = new Date();
    const lastError = typeof error === 'string' ? error : error.message;
    
    const job = await prisma.jobQueue.findUnique({ where: { id: jobId } });
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Check if we should retry
    if (job.retryCount < job.maxRetries) {
      // Calculate next retry time with exponential backoff
      const retryDelay = Math.min(
        1000 * Math.pow(2, job.retryCount), 
        60 * 60 * 1000 // Max 1 hour delay
      );
      
      const scheduledFor = new Date(Date.now() + retryDelay);
      
      return prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'RETRYING',
          lastError,
          retryCount: { increment: 1 },
          scheduledFor
        }
      });
    }

    // Max retries reached, mark as permanently failed
    return this.updateJobStatus(jobId, 'FAILED', { failedAt, lastError });
  }

  /**
   * Fetch failed jobs for analysis
   */
  static async getFailedJobs(limit = 100) {
    return prisma.jobQueue.findMany({
      where: { status: 'FAILED' },
      orderBy: { failedAt: 'desc' },
      take: limit
    });
  }

  /**
   * Get stats on job processing
   */
  static async getJobStats() {
    const statusCounts = await prisma.jobQueue.groupBy({
      by: ['status', 'jobType'],
      _count: { id: true }
    });

    const totalJobs = await prisma.jobQueue.count();
    const pendingJobs = await prisma.jobQueue.count({ 
      where: { status: 'PENDING' } 
    });
    const failedJobs = await prisma.jobQueue.count({ 
      where: { status: 'FAILED' } 
    });
    const completedJobs = await prisma.jobQueue.count({ 
      where: { status: 'COMPLETED' } 
    });

    return {
      totalJobs,
      pendingJobs,
      failedJobs,
      completedJobs,
      statusCounts
    };
  }

  /**
   * Clean up old completed or failed jobs
   */
  static async cleanupOldJobs(olderThan?: Date) {
    const cutoffDate = olderThan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days

    const result = await prisma.jobQueue.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'FAILED'] },
        completedAt: { lt: cutoffDate },
        failedAt: { lt: cutoffDate }
      }
    });

    console.log(`Cleaned up ${result.count} old jobs`);
    return result;
  }
} 