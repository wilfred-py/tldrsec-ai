/**
 * Async Email Queue Service
 * 
 * Handles email sending with rate limiting and retry logic.
 * Integrates with the existing JobQueue system to queue email jobs
 * and processes them with proper rate limiting for Resend API.
 */

import { JobQueueService, JobType } from '../job-queue';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { EmailMessage } from './types';
import { emailClient } from './index';
import { v4 as uuidv4 } from 'uuid';
import { SecureEmailLogger, EmailQueueLock } from './security-helpers';

const emailQueueLogger = new SecureEmailLogger(logger.child('async-email-queue'));

/**
 * Email job payload for async processing
 */
export interface EmailJobPayload {
  emailMessage: EmailMessage;
  priority?: number;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Result of processing an email job
 */
export interface EmailJobResult {
  success: boolean;
  emailId?: string;
  error?: string;
  retryable?: boolean;
}

/**
 * Async Email Queue Service
 * 
 * Provides methods to queue emails for async processing and
 * process queued email jobs with proper rate limiting.
 * Includes GDPR-compliant logging and race condition protection.
 */
export class AsyncEmailQueue {
  private static instance: AsyncEmailQueue;
  private processing = false;
  private processId: string;
  
  constructor() {
    this.processId = `queue-${uuidv4().substring(0, 8)}-${process.pid || 'unknown'}`;
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): AsyncEmailQueue {
    if (!AsyncEmailQueue.instance) {
      AsyncEmailQueue.instance = new AsyncEmailQueue();
    }
    return AsyncEmailQueue.instance;
  }
  
  /**
   * Queue an email for async sending
   * 
   * @param emailMessage Email message to send
   * @param options Options for queuing
   * @returns Promise resolving to job ID
   */
  async queueEmail(
    emailMessage: EmailMessage,
    options: {
      priority?: number;
      scheduledFor?: Date;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string;
    } = {}
  ): Promise<string> {
    try {
      const requestId = uuidv4();
      const jobPayload: EmailJobPayload = {
        emailMessage,
        priority: options.priority || 5,
        metadata: options.metadata || {},
        requestId
      };
      
      emailQueueLogger.info('Queuing email for async sending', {
        requestId,
        to: emailMessage.to,
        subject: emailMessage.subject,
        priority: options.priority || 5,
        scheduledFor: options.scheduledFor
      });
      
      // Add job to queue with ASYNC_EMAIL_DIGEST type
      const job = await JobQueueService.addJob({
        jobType: 'ASYNC_EMAIL_DIGEST' as JobType,
        payload: jobPayload,
        priority: options.priority || 5,
        scheduledFor: options.scheduledFor || new Date(),
        idempotencyKey: options.idempotencyKey || `email-${requestId}`,
        maxAttempts: 3
      });
      
      monitoring.incrementCounter('email_queue.queued', 1);
      
      emailQueueLogger.info('Email queued successfully', {
        requestId,
        jobId: job.id,
        to: emailMessage.to
      });
      
      return job.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emailQueueLogger.error('Failed to queue email', {
        error: errorMessage,
        to: emailMessage.to,
        subject: emailMessage.subject
      });
      monitoring.incrementCounter('email_queue.queue_failed', 1);
      throw error;
    }
  }
  
  /**
   * Process a single email job
   * 
   * @param jobPayload Email job payload
   * @returns Promise resolving to job result
   */
  async processEmailJob(jobPayload: EmailJobPayload): Promise<EmailJobResult> {
    const { emailMessage, requestId, metadata } = jobPayload;
    
    try {
      emailQueueLogger.info('Processing email job', {
        requestId,
        to: emailMessage.to,
        subject: emailMessage.subject,
        metadata
      });
      
      const startTime = Date.now();
      
      // Send email using the rate-limited email client
      const result = await emailClient.sendEmail(emailMessage, {
        requestId,
        timeout: 30000 // 30 second timeout
      });
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        emailQueueLogger.info('Email sent successfully', {
          requestId,
          emailId: result.id,
          to: emailMessage.to,
          duration,
          metadata
        });
        
        // Update summary record if metadata contains summaryId
        if (metadata?.summaryId) {
          try {
            const { getPrismaClient } = await import('../db/prisma');
            const prisma = getPrismaClient();
            
            await prisma.summary.update({
              where: { id: metadata.summaryId as string },
              data: {
                sentToUser: true,
                totalEmailsSent: { increment: 1 },
                uniqueUsersServed: { increment: 1 }
              }
            });
            
            emailQueueLogger.info('Updated summary record after successful email', {
              requestId,
              summaryId: metadata.summaryId,
              emailId: result.id
            });
          } catch (dbError) {
            emailQueueLogger.error('Failed to update summary record after email send', {
              requestId,
              summaryId: metadata?.summaryId,
              error: dbError instanceof Error ? dbError.message : 'Unknown error'
            });
            // Don't fail the email job for DB update errors
          }
        }
        
        monitoring.incrementCounter('email_queue.sent', 1);
        monitoring.recordValue('email_queue.send_duration', duration);
        
        return {
          success: true,
          emailId: result.id
        };
      } else {
        // Determine if the error is retryable
        const retryable = this.isRetryableError(result.error);
        
        emailQueueLogger.warn('Email sending failed', {
          requestId,
          to: emailMessage.to,
          error: result.error?.message,
          retryable,
          duration,
          metadata
        });
        
        monitoring.incrementCounter('email_queue.failed', 1);
        monitoring.incrementCounter(retryable ? 'email_queue.retryable_failed' : 'email_queue.permanent_failed', 1);
        
        return {
          success: false,
          error: result.error?.message || 'Unknown error',
          retryable
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const retryable = this.isRetryableError(error);
      
      emailQueueLogger.error('Email job processing failed', {
        requestId,
        to: emailMessage.to,
        error: errorMessage,
        retryable,
        metadata
      });
      
      monitoring.incrementCounter('email_queue.processing_failed', 1);
      monitoring.incrementCounter(retryable ? 'email_queue.retryable_failed' : 'email_queue.permanent_failed', 1);
      
      return {
        success: false,
        error: errorMessage,
        retryable
      };
    }
  }
  
  /**
   * Determine if an error is retryable
   * 
   * @param error Error to check
   * @returns True if the error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (!error) return false;
    
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    // Network and temporary errors are retryable
    const retryablePatterns = [
      'timeout', 'network', 'connection', 'enotfound', 'econnrefused',
      'econnreset', 'socket hang up', 'request failed', 'fetch failed',
      'rate limit', 'quota', 'throttled', 'temporary', 'service unavailable',
      'internal server error', 'bad gateway', 'gateway timeout'
    ];
    
    // Permanent errors are not retryable
    const permanentPatterns = [
      'invalid email', 'invalid api key', 'unauthorized', 'forbidden',
      'not found', 'bad request', 'validation error', 'domain not verified'
    ];
    
    // Check for permanent errors first
    if (permanentPatterns.some(pattern => errorMessage.includes(pattern))) {
      return false;
    }
    
    // Check for retryable errors
    if (retryablePatterns.some(pattern => errorMessage.includes(pattern))) {
      return true;
    }
    
    // Default to retryable for unknown errors
    return true;
  }
  
  /**
   * Process queued email jobs with atomic locking
   * 
   * This method should be called by the job worker to process
   * ASYNC_EMAIL_DIGEST jobs from the queue. Uses distributed locking
   * to prevent race conditions in concurrent environments.
   * 
   * @param batchSize Number of jobs to process in one batch
   * @returns Promise resolving to number of jobs processed
   */
  async processQueuedEmails(batchSize: number = 5): Promise<number> {
    const lockKey = 'email-queue-processing';
    
    // Try to acquire distributed lock to prevent race conditions
    if (!EmailQueueLock.acquireLock(lockKey, this.processId)) {
      emailQueueLogger.debug('Email queue processing lock already held by another process', {
        processId: this.processId,
        lockStatus: EmailQueueLock.getLockStatus()
      });
      return 0;
    }
    
    // Additional local check for this instance
    if (this.processing) {
      EmailQueueLock.releaseLock(lockKey, this.processId);
      emailQueueLogger.debug('Email queue processing already in progress on this instance', {
        processId: this.processId
      });
      return 0;
    }
    
    this.processing = true;
    
    try {
      emailQueueLogger.info('Starting email queue processing', { 
        batchSize,
        processId: this.processId
      });
      
      // Get email jobs from the queue
      const jobs = await JobQueueService.getJobsToProcess(batchSize, 'ASYNC_EMAIL_DIGEST');
      
      if (jobs.length === 0) {
        emailQueueLogger.debug('No email jobs to process', {
          processId: this.processId
        });
        return 0;
      }
      
      emailQueueLogger.info(`Processing ${jobs.length} email jobs`, {
        jobIds: jobs.map(j => j.id),
        processId: this.processId
      });
      
      let processed = 0;
      
      // Process jobs sequentially to respect rate limits
      for (const job of jobs) {
        try {
          // Mark job as processing (be resilient to database conflicts)
          try {
            await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
              startedAt: new Date()
            });
          } catch (statusError) {
            emailQueueLogger.warn('Failed to update job status to PROCESSING, continuing with email processing', {
              jobId: job.id,
              error: statusError instanceof Error ? statusError.message : 'Unknown error'
            });
          }
          
          // Process the email job
          const result = await this.processEmailJob(job.payload as EmailJobPayload);
          
          if (result.success) {
            try {
              // Mark job as completed
              await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
                completedAt: new Date(),
                result: { emailId: result.emailId }
              });
            } catch (statusError) {
              // Log the database error but don't fail the entire process
              emailQueueLogger.warn('Failed to update job status to COMPLETED, but email was sent successfully', {
                jobId: job.id,
                emailId: result.emailId,
                error: statusError instanceof Error ? statusError.message : 'Unknown error'
              });
            }
            // Always count as processed if email was successfully sent
            processed++;
          } else {
            // Mark job as failed (JobQueue will handle retry logic)
            await JobQueueService.updateJobStatus(job.id, 'FAILED', {
              failedAt: new Date(),
              error: result.error,
              // Add retry metadata if retryable
              ...(result.retryable ? { retryable: true } : {})
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          emailQueueLogger.error('Failed to process email job', {
            jobId: job.id,
            error: errorMessage,
            processId: this.processId
          });
          
          // Mark job as failed
          await JobQueueService.updateJobStatus(job.id, 'FAILED', {
            failedAt: new Date(),
            error: errorMessage
          });
        }
      }
      
      emailQueueLogger.info('Email queue processing completed', {
        totalJobs: jobs.length,
        processedSuccessfully: processed,
        failed: jobs.length - processed,
        processId: this.processId
      });
      
      monitoring.recordValue('email_queue.batch_processed', processed);
      monitoring.recordValue('email_queue.batch_failed', jobs.length - processed);
      
      return processed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emailQueueLogger.error('Email queue processing failed', { 
        error: errorMessage,
        processId: this.processId
      });
      monitoring.incrementCounter('email_queue.processing_error', 1);
      throw error;
    } finally {
      this.processing = false;
      EmailQueueLock.releaseLock(lockKey, this.processId);
      emailQueueLogger.debug('Released email queue processing lock', {
        processId: this.processId
      });
    }
  }
}

// Export singleton instance
export const asyncEmailQueue = AsyncEmailQueue.getInstance();

/**
 * Convenience function to queue an email
 */
export async function queueEmail(
  emailMessage: EmailMessage,
  options: {
    priority?: number;
    scheduledFor?: Date;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  } = {}
): Promise<string> {
  return asyncEmailQueue.queueEmail(emailMessage, options);
}

/**
 * Convenience function to process queued emails
 */
export async function processQueuedEmails(batchSize: number = 5): Promise<number> {
  return asyncEmailQueue.processQueuedEmails(batchSize);
}
