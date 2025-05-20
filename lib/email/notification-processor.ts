/**
 * Email Notification Job Processor
 * 
 * Processes jobs from the queue for sending notifications
 */

import { JobQueueService } from '../job-queue';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { 
  NotificationEventType, 
  notificationService,
  FilingNotificationPayload
} from './notification-service';

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

/**
 * Class for processing notification jobs from the queue
 */
export class NotificationProcessor {
  private config: NotificationProcessorConfig;
  private isRunning: boolean = false;
  private pollTimerId: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<NotificationProcessorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Start the notification processor
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Notification processor already running');
      return;
    }
    
    if (!this.config.enabled) {
      logger.info('Notification processor is disabled');
      return;
    }
    
    logger.info('Starting notification processor', {
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
      logger.warn('Notification processor not running');
      return;
    }
    
    logger.info('Stopping notification processor');
    
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
        logger.error('Error polling for notification jobs', err);
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
        'SEND_FILING_NOTIFICATION'
      );
      
      if (jobs.length === 0) {
        return; // No jobs to process
      }
      
      logger.info(`Processing ${jobs.length} notification jobs`);
      monitoring.incrementCounter('notification.jobs.processed', jobs.length);
      
      // Process each job
      for (const job of jobs) {
        try {
          // Mark job as processing
          await JobQueueService.updateJobStatus(job.id, 'PROCESSING', {
            startedAt: new Date()
          });
          
          // Process the job
          await this.processNotificationJob(job);
          
          // Mark job as completed
          await JobQueueService.updateJobStatus(job.id, 'COMPLETED', {
            completedAt: new Date()
          });
        } catch (error) {
          logger.error(`Error processing notification job ${job.id}`, error);
          monitoring.incrementCounter('notification.jobs.errors', 1);
          
          // Determine if job should be retried
          if (job.attempts < job.maxAttempts) {
            // Schedule retry after exponential backoff
            const retryDelay = Math.pow(2, job.attempts) * 1000; // Exponential backoff
            const retryAt = new Date(Date.now() + retryDelay);
            
            await JobQueueService.markForRetry(job.id, retryAt, {
              lastError: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              failedAt: new Date()
            });
            
            logger.info(`Scheduled retry for job ${job.id} at ${retryAt}`);
          } else {
            // Max attempts reached, mark as failed
            await JobQueueService.updateJobStatus(job.id, 'FAILED', {
              failedAt: new Date(),
              lastError: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            
            logger.warn(`Job ${job.id} failed after ${job.attempts} attempts`);
          }
        }
      }
    } catch (error) {
      logger.error('Error polling for notification jobs', error);
      monitoring.incrementCounter('notification.processor.errors', 1);
    }
  }
  
  /**
   * Process a single notification job
   * @param job Notification job from the queue
   */
  private async processNotificationJob(job: any): Promise<void> {
    const { payload } = job;
    const { notificationType, filing } = payload;
    
    if (!notificationType || !filing) {
      throw new Error('Invalid notification job payload');
    }
    
    const filingPayload = filing as FilingNotificationPayload;
    
    logger.info(`Processing ${notificationType} notification for ${filingPayload.ticker}`, {
      jobId: job.id,
      filingId: filingPayload.filingId
    });
    
    monitoring.startTimer('notification.process');
    
    // Process based on notification type
    switch (notificationType) {
      case NotificationEventType.NEW_FILING:
      case NotificationEventType.FILING_UPDATE:
        await notificationService.sendImmediateNotification(filingPayload);
        break;
        
      case NotificationEventType.SUMMARY_READY:
        await notificationService.sendImmediateNotification(filingPayload);
        break;
        
      default:
        logger.warn(`Unknown notification type: ${notificationType}`, {
          jobId: job.id,
          filingId: filingPayload.filingId
        });
        break;
    }
    
    monitoring.stopTimer('notification.process');
    
    logger.info(`Completed ${notificationType} notification for ${filingPayload.ticker}`, {
      jobId: job.id,
      filingId: filingPayload.filingId
    });
  }
}

// Create singleton instance
export const notificationProcessor = new NotificationProcessor(); 