import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging';

/**
 * Dead Letter Queue Service — behind the one-method interface production
 * actually calls (cleanupOldEntries). The former fanned-out surface
 * (addToDeadLetterQueue, getDeadLetterEntries, getDeadLetterCount,
 * markAsReprocessed, requeueDeadLetterEntry) was exported for a hypothetical
 * "put + browse + requeue" seam that never shipped — nothing in production
 * writes to the DeadLetterQueue table, so the browse and requeue methods had
 * nothing to return. `cleanupOldEntries` remains the only survivor: the cron
 * cleanup handler at `app/api/cron/route.ts` calls it to sweep reprocessed
 * rows older than 30 days.
 */
export class DeadLetterQueueService {
  private static componentLogger = logger.child('dead-letter-queue');

  static async cleanupOldEntries(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.deadLetterQueue.deleteMany({
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
