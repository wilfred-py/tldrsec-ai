import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging';

const componentLogger = logger.child('dead-letter-queue');

/**
 * Delete reprocessed dead-letter-queue rows whose `processedAt` is older than
 * `olderThanDays`. Returns the deleted row count. Catches errors and returns 0
 * so callers driving a cron sweep don't fail the whole sweep on a transient
 * DB hiccup. The only production caller is `app/api/cron/route.ts`'s
 * cleanup-dlq action.
 */
export async function cleanupOldDeadLetterEntries(
  olderThanDays: number = 30
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.deadLetterQueue.deleteMany({
      where: {
        reprocessed: true,
        processedAt: { lt: cutoffDate },
      },
    });

    componentLogger.info(`Cleaned up old DLQ entries`, {
      count: result.count,
      olderThanDays,
    });

    return result.count;
  } catch (error) {
    componentLogger.error(`Failed to cleanup old DLQ entries`, error);
    return 0;
  }
}
