/**
 * Email Notification Job Processor
 * 
 * Processes jobs from the queue for sending notifications
 * 
 * Refactored to break circular dependencies
 */

import { JobQueueService, JobType, JobStatus, JobResultData } from '../job-queue';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { SecureEmailLogger } from './security-helpers';
import { 
  NotificationEventType,
  FilingNotificationPayload,
  NotificationProcessorInterface
} from './notification-types';

// Define job interface to match Prisma schema
interface JobQueueItem {
  id: string;
  jobType: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  createdAt: Date;
  scheduledFor: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastErrorStack: string | null;
  result: Record<string, unknown>;
  executionTime: number | null;
}

/**
 * Notification job processor configuration
 */
export interface NotificationProcessorConfig {
  pollInterval?: number; // Time between polling in ms
  batchSize?: number;    // Number of jobs to process in a batch
  enabled?: boolean;     // Whether the processor is enabled
}

/**
 * Default processor configuration
 */
const DEFAULT_CONFIG: NotificationProcessorConfig = {
  pollInterval: 5000,  // Every 5 seconds
  batchSize: 10,       // Process 10 jobs at a time
  enabled: true        // Enabled by default
};

// Create secure logger to prevent PII exposure
const secureLogger = new SecureEmailLogger(logger.child('notification-processor'));

/**
 * Class for processing notification jobs from the queue
 */
export class NotificationProcessor implements NotificationProcessorInterface {
  private config: NotificationProcessorConfig;
  private isRunning: boolean = false;
  private pollTimerId: NodeJS.Timeout | null = null;
  
  /**
   * Process a notification directly
   * @param payload The notification payload to process
   */
  async processNotification(payload: Record<string, unknown>): Promise<void> {
    const job = {
      id: `direct-${Date.now()}`,
      payload
    };
    
    return this.processNotificationJob(job);
  }
  
  /**
   * Queue a notification for processing
   * @param payload The notification payload to queue
   */
  async queueNotification(payload: Record<string, unknown>): Promise<void> {
    try {
      const job = await JobQueueService.addJob({
        jobType: 'SEND_FILING_NOTIFICATION',
        payload,
        priority: payload?.priorityLevel === 'high' ? 1 : 2,
        idempotencyKey: `notification-${payload?.filingId || Date.now()}`
      });
      
      secureLogger.info('Queued notification job', {
        jobId: job.id,
        notificationType: payload?.notificationType,
        filingId: payload?.filing?.filingId
      });
      
      return Promise.resolve();
    } catch (error) {
      secureLogger.error('Error queueing notification', {
        error: error instanceof Error ? error.message : String(error),
        notificationType: payload?.notificationType,
        filingId: payload?.filing?.filingId
      });
      throw error;
    }
  }
  
  constructor(config: Partial<NotificationProcessorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Start the notification processor
   */
  start(): void {
    if (this.isRunning) {
      secureLogger.warn('Notification processor already running');
      return;
    }
    
    if (!this.config.enabled) {
      secureLogger.info('Notification processor is disabled');
      return;
    }
    
    secureLogger.info('Starting notification processor', {
      pollInterval: this.config.pollInterval,
      batchSize: this.config.batchSize
    });
    
    this.isRunning = true;
    this.schedulePoll();
  }
  
  /**
   * Stop the notification processor
   */
  stop(): void {
    if (!this.isRunning) {
      secureLogger.warn('Notification processor not running');
      return;
    }
    
    secureLogger.info('Stopping notification processor');
    
    if (this.pollTimerId) {
      clearTimeout(this.pollTimerId);
      this.pollTimerId = null;
    }
    
    this.isRunning = false;
  }
  
  /**
   * Schedule the next poll
   */
  private schedulePoll(): void {
    if (!this.isRunning) return;
    
    this.pollTimerId = setTimeout(
      () => this.poll().catch(err => {
        secureLogger.error('Error polling for notification jobs', { error: err instanceof Error ? err.message : String(err) });
      }).finally(() => {
        this.schedulePoll();
      }), 
      this.config.pollInterval
    );
  }
  
  /**
   * Poll for jobs and process them
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;
    
    try {
      // Get jobs to process
      const jobs = await JobQueueService.getJobsToProcess(
        this.config.batchSize, 
        'SEND_FILING_NOTIFICATION' as JobType
      );
      
      if (jobs.length === 0) {
        return; // No jobs to process
      }
      
      secureLogger.info('Processing notification jobs', { jobCount: jobs.length });
      monitoring.incrementCounter('notification.jobs.processed', jobs.length);
      
      // Process each job
      for (const job of jobs) {
        try {
          // Mark job as processing
          await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
            startedAt: new Date()
          } as JobResultData);
          
          // Process the job
          await this.processNotificationJob(job);
          
          // Mark job as completed
          await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
            completedAt: new Date()
          } as JobResultData);
        } catch (error) {
          secureLogger.error('Error processing notification job', {
            error: error instanceof Error ? error.message : String(error),
            jobId: job.id
          });
          monitoring.incrementCounter('notification.jobs.errors', 1);
          
          // Cast job to JobQueueItem to access attempts and maxAttempts
          const jobItem = job as unknown as JobQueueItem;
          
          // Determine if job should be retried
          if (jobItem.attempts < jobItem.maxAttempts) {
            // Schedule retry after exponential backoff
            const retryDelay = Math.pow(2, jobItem.attempts) * 1000; // Exponential backoff
            const retryAt = new Date(Date.now() + retryDelay);
            
            await JobQueueService.markForRetry(job.id, retryAt, {
              lastError: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error && error.stack ? error.stack : undefined,
              failedAt: new Date()
            } as JobResultData);
            
            secureLogger.info('Scheduled job retry', { jobId: job.id, retryAt });
          } else {
            // Max attempts reached, mark as failed
            await JobQueueService.updateJobStatus(job.id, 'FAILED', {
              failedAt: new Date(),
              lastError: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error && error.stack ? error.stack : undefined
            } as JobResultData);
            
            secureLogger.warn('Job failed after max attempts', { jobId: job.id, attempts: (job as unknown as JobQueueItem).attempts });
          }
        }
      }
    } catch (error) {
      secureLogger.error('Error polling for notification jobs', {
        error: error instanceof Error ? error.message : String(error)
      });
      monitoring.incrementCounter('notification.processor.errors', 1);
    }
  }
  
  /**
   * Process a notification job
   * @param job The job to process
   */
  private async processNotificationJob(job: Record<string, unknown>): Promise<void> {
    try {
      const payload = job.payload;
      
      if (!payload) {
        throw new Error('Job payload is missing');
      }
      
      const { notificationType, filing } = payload;
      
      if (!notificationType || !filing) {
        throw new Error('Invalid notification job payload');
      }
      
      const filingPayload = filing as FilingNotificationPayload;
      
      secureLogger.info('Processing notification', {
        notificationType,
        ticker: filingPayload.ticker,
        jobId: job.id,
        filingId: filingPayload.filingId
      });
      
      monitoring.startTimer('notification.process');
      
      // Dynamically import notification service to avoid circular dependencies
      const { notificationService } = await import('./notification-service');
      
      // Process based on notification type
      switch (notificationType) {
        case NotificationEventType.NEW_FILING:
        case NotificationEventType.FILING_UPDATE:
        case NotificationEventType.SUMMARY_READY:
          await notificationService.sendImmediateNotification(filingPayload);
          break;
          
        default:
          secureLogger.warn('Unknown notification type', {
            notificationType,
            jobId: job.id,
            filingId: filingPayload.filingId
          });
          break;
      }
      
      secureLogger.info('Completed notification processing', {
        notificationType,
        ticker: filingPayload.ticker,
        jobId: job.id,
        filingId: filingPayload.filingId
      });
      
      monitoring.incrementCounter('notification.jobs.processed', 1);
      monitoring.stopTimer('notification.process');
    } catch (error) {
      secureLogger.error('Error processing notification job', {
        error: error instanceof Error ? error.message : String(error),
        jobId: job.id
      });
      throw error;
    }
  }
}

// Create singleton instance
export const notificationProcessor = new NotificationProcessor();

/**
 * Process a notification directly
 * @param payload The notification payload to process
 */
export async function processNotification(payload: Record<string, unknown>): Promise<void> {
  return notificationProcessor.processNotification(payload);
}