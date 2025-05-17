import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logging';
import { JobType } from './index';

// Dead letter queue entry interface
export interface DeadLetterEntry {
  id: string;
  originalJobId: string;
  jobType: JobType;
  payload: any;
  error: string;
  attempts: number;
  createdAt: Date;
  processedAt?: Date;
  reprocessed: boolean;
}

// Database entry type from Prisma
interface DbDeadLetterEntry {
  id: string;
  originalJobId: string;
  jobType: string;
  payload: string | object;
  error: string;
  attempts: number;
  createdAt: Date;
  processedAt?: Date | null;
  reprocessed: boolean;
}

/**
 * Dead Letter Queue Service
 * 
 * Handles jobs that have failed repeatedly and moves them to a separate queue
 * for later manual inspection or automatic retry
 */
export class DeadLetterQueueService {
  private static prisma = new PrismaClient();
  private static componentLogger = logger.child('dead-letter-queue');

  /**
   * Add a failed job to the dead letter queue
   */
  static async addToDeadLetterQueue(
    originalJobId: string,
    jobType: JobType,
    payload: any,
    error: string | Error,
    attempts: number
  ): Promise<string> {
    try {
      const errorMessage = error instanceof Error ? `${error.message}\n${error.stack || ''}` : error;
      
      // Create a DLQ entry in the database
      const dlqEntry = await this.prisma.deadLetterQueue.create({
        data: {
          originalJobId,
          jobType,
          payload: JSON.stringify(payload),
          error: errorMessage,
          attempts,
          reprocessed: false
        }
      });
      
      this.componentLogger.info(`Added job to dead letter queue`, {
        originalJobId,
        dlqId: dlqEntry.id,
        jobType,
        attempts,
        error: errorMessage.split('\n')[0] // Just log the first line of the error
      });
      
      return dlqEntry.id;
    } catch (error) {
      this.componentLogger.error(`Failed to add job to dead letter queue`, error, {
        originalJobId,
        jobType,
        attempts
      });
      
      // Since this is a fallback mechanism, we don't want to throw further errors
      return ''; 
    }
  }

  /**
   * Get dead letter queue entries
   */
  static async getDeadLetterEntries(
    limit: number = 100,
    offset: number = 0,
    includeReprocessed: boolean = false
  ): Promise<DeadLetterEntry[]> {
    try {
      const entries = await this.prisma.deadLetterQueue.findMany({
        where: includeReprocessed ? {} : { reprocessed: false },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });
      
      return entries.map((entry: DbDeadLetterEntry) => ({
        ...entry,
        payload: typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload
      }));
    } catch (error) {
      this.componentLogger.error(`Failed to get dead letter queue entries`, error);
      return [];
    }
  }

  /**
   * Get count of dead letter queue entries
   */
  static async getDeadLetterCount(includeReprocessed: boolean = false): Promise<number> {
    try {
      return await this.prisma.deadLetterQueue.count({
        where: includeReprocessed ? {} : { reprocessed: false }
      });
    } catch (error) {
      this.componentLogger.error(`Failed to get dead letter queue count`, error);
      return 0;
    }
  }

  /**
   * Mark a dead letter queue entry as reprocessed
   */
  static async markAsReprocessed(dlqId: string): Promise<boolean> {
    try {
      await this.prisma.deadLetterQueue.update({
        where: { id: dlqId },
        data: {
          reprocessed: true,
          processedAt: new Date()
        }
      });
      
      this.componentLogger.info(`Marked DLQ entry as reprocessed`, { dlqId });
      return true;
    } catch (error) {
      this.componentLogger.error(`Failed to mark DLQ entry as reprocessed`, error, { dlqId });
      return false;
    }
  }

  /**
   * Requeue a dead letter queue entry back to the main job queue
   */
  static async requeueDeadLetterEntry(
    dlqId: string,
    addJobFunction: (jobType: JobType, payload: any) => Promise<string>
  ): Promise<string | null> {
    try {
      // Get the DLQ entry
      const dlqEntry = await this.prisma.deadLetterQueue.findUnique({
        where: { id: dlqId }
      });
      
      if (!dlqEntry) {
        this.componentLogger.warn(`DLQ entry not found`, { dlqId });
        return null;
      }
      
      // Parse the payload
      const payload = JSON.parse(dlqEntry.payload as string);
      
      // Add back to the main job queue
      const newJobId = await addJobFunction(dlqEntry.jobType as JobType, payload);
      
      if (newJobId) {
        // Mark the DLQ entry as reprocessed
        await this.markAsReprocessed(dlqId);
        
        this.componentLogger.info(`Requeued DLQ entry successfully`, {
          dlqId,
          newJobId,
          jobType: dlqEntry.jobType
        });
        
        return newJobId;
      }
      
      return null;
    } catch (error) {
      this.componentLogger.error(`Failed to requeue DLQ entry`, error, { dlqId });
      return null;
    }
  }
  
  /**
   * Cleanup old reprocessed entries (optional)
   */
  static async cleanupOldEntries(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const result = await this.prisma.deadLetterQueue.deleteMany({
        where: {
          reprocessed: true,
          processedAt: {
            lt: cutoffDate
          }
        }
      });
      
      this.componentLogger.info(`Cleaned up old DLQ entries`, {
        count: result.count,
        olderThanDays
      });
      
      return result.count;
    } catch (error) {
      this.componentLogger.error(`Failed to cleanup old DLQ entries`, error);
      return 0;
    }
  }
} 