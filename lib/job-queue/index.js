import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
// Initialize Prisma client
const prisma = new PrismaClient();
/**
 * Job queue service for managing background tasks
 */
export class JobQueueService {
    /**
     * Add a new job to the queue
     */
    static async addJob({ jobType, payload, priority = 5, scheduledFor = new Date(), idempotencyKey, maxAttempts = 3 }) {
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
                    maxAttempts,
                    status: 'PENDING',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
        }
        catch (error) {
            console.error('Error adding job to queue:', error);
            throw error;
        }
    }
    /**
     * Get a specific job by ID
     */
    static async getJobById(id) {
        try {
            return await prisma.jobQueue.findUnique({
                where: { id }
            });
        }
        catch (error) {
            console.error(`Error fetching job ${id}:`, error);
            throw error;
        }
    }
    /**
     * Get jobs to process
     */
    static async getJobsToProcess(limit = 10, jobType) {
        try {
            const now = new Date();
            return await prisma.jobQueue.findMany({
                where: Object.assign(Object.assign({ status: {
                        in: ['PENDING', 'RETRYING']
                    }, scheduledFor: {
                        lte: now
                    } }, (jobType ? { jobType } : {})), { attempts: {
                        lt: prisma.jobQueue.fields.maxAttempts
                    } }),
                orderBy: [
                    { priority: 'desc' },
                    { scheduledFor: 'asc' },
                    { createdAt: 'asc' }
                ],
                take: limit
            });
        }
        catch (error) {
            console.error('Error getting jobs to process:', error);
            throw error;
        }
    }
    /**
     * Get the next job to process
     */
    static async getNextJob(jobTypes) {
        try {
            const now = new Date();
            return await prisma.jobQueue.findFirst({
                where: Object.assign(Object.assign({ status: {
                        in: ['PENDING', 'RETRYING']
                    }, scheduledFor: {
                        lte: now
                    } }, (jobTypes && jobTypes.length > 0
                    ? { jobType: { in: jobTypes } }
                    : {})), { attempts: {
                        lt: prisma.jobQueue.fields.maxAttempts
                    } }),
                orderBy: [
                    { priority: 'desc' },
                    { scheduledFor: 'asc' },
                    { createdAt: 'asc' }
                ]
            });
        }
        catch (error) {
            console.error('Error getting next job:', error);
            throw error;
        }
    }
    /**
     * Update job status with optional result data
     */
    static async updateJobStatus(id, status, resultData = {}) {
        try {
            const job = await prisma.jobQueue.findUnique({
                where: { id }
            });
            if (!job) {
                throw new Error(`Job with ID ${id} not found`);
            }
            const now = new Date();
            const updateData = {
                status,
                updatedAt: now
            };
            // Add appropriate timestamp based on status
            if (status === 'PROCESSING') {
                updateData.startedAt = resultData.startedAt || now;
                updateData.attempts = job.attempts + 1;
            }
            else if (status === 'COMPLETED') {
                updateData.completedAt = resultData.completedAt || now;
                updateData.executionTime = resultData.executionTime ||
                    (job.startedAt ? now.getTime() - job.startedAt.getTime() : undefined);
                updateData.result = resultData.result;
            }
            else if (status === 'FAILED') {
                updateData.failedAt = resultData.failedAt || now;
                updateData.lastError = resultData.error || resultData.lastError;
                // If stack trace is provided, save it
                if (resultData.stack) {
                    updateData.lastErrorStack = resultData.stack;
                }
                // Determine if we should retry
                if (job.attempts < job.maxAttempts) {
                    // Schedule for retry with exponential backoff
                    const backoffMinutes = Math.pow(2, job.attempts);
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
        }
        catch (error) {
            console.error(`Error updating job ${id} status:`, error);
            throw error;
        }
    }
    /**
     * Clean up old completed jobs
     */
    static async cleanupOldJobs(olderThan) {
        try {
            return await prisma.jobQueue.deleteMany({
                where: {
                    status: {
                        in: ['COMPLETED', 'FAILED']
                    },
                    updatedAt: {
                        lt: olderThan
                    }
                }
            });
        }
        catch (error) {
            console.error('Error cleaning up old jobs:', error);
            throw error;
        }
    }
}
