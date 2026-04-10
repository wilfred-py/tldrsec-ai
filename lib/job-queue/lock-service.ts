/**
 * Service for managing distributed locks.
 * After removing the legacy sync pipeline, only cleanup/release/metrics are needed.
 */
export class LockService {
  /**
   * Release a lock
   */
  static async releaseLock(lockName: string, acquiredBy?: string) {
    try {
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const whereClause: any = {
        lockName,
        released: false
      };

      if (acquiredBy) {
        whereClause.acquiredBy = acquiredBy;
      }

      const lock = await prisma.jobLock.findFirst({ where: whereClause });

      if (!lock) {
        console.log(`Lock ${lockName} not found or already released`);
        return false;
      }

      await prisma.jobLock.update({
        where: { id: lock.id },
        data: { released: true }
      });

      console.log(`Lock ${lockName} released by ${acquiredBy || 'forced release'}`);
      return true;
    } catch (error) {
      console.error(`Failed to release lock ${lockName}:`, error);
      throw new Error(`Failed to release lock: ${(error as Error).message}`);
    }
  }

  /**
   * Force release a lock regardless of who holds it
   */
  static async forceReleaseLock(lockName: string) {
    return this.releaseLock(lockName);
  }

  /**
   * Clean up expired locks using Prisma
   */
  static async cleanupExpiredLocks() {
    try {
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();

      const result = await prisma.jobLock.updateMany({
        where: {
          released: false,
          expiresAt: { lt: new Date() }
        },
        data: {
          released: true
        }
      });

      if (result.count > 0) {
        console.log(`Cleaned up ${result.count} expired locks`);
      }

      return result.count;
    } catch (error) {
      console.error('Failed to clean up expired locks:', error);
      return 0;
    }
  }

  /**
   * Cleanup expired locks using raw SQL for atomic operation.
   * Defense-in-depth mechanism that bypasses Prisma ORM.
   */
  static async cleanupExpiredLocksAtomic(): Promise<number> {
    try {
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();

      const result = await prisma.$executeRaw`
        UPDATE "JobLock"
        SET released = true
        WHERE released = false
          AND "expiresAt" < NOW()
      `;

      if (result > 0) {
        console.log(`[LockService] Atomic cleanup: ${result} expired locks marked as released`);
      }

      return result;
    } catch (error) {
      console.error('[LockService] Atomic cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Force cleanup ALL locks (for emergency recovery)
   */
  static async forceCleanupAllLocks(): Promise<number> {
    try {
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();

      const result = await prisma.$executeRaw`
        UPDATE "JobLock"
        SET released = true
        WHERE released = false
      `;

      console.log(`[LockService] FORCE CLEANUP: ${result} locks forcefully released`);
      return result;
    } catch (error) {
      console.error('[LockService] Force cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Get lock health metrics for monitoring
   */
  static async getLockHealthMetrics() {
    try {
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const activeLocks = await prisma.jobLock.count({
        where: {
          released: false,
          expiresAt: { gt: now }
        }
      });

      const recentLocks = await prisma.jobLock.count({
        where: {
          acquiredAt: { gte: oneHourAgo }
        }
      });

      const staleLocksCount = await prisma.jobLock.count({
        where: {
          released: false,
          expiresAt: { lt: now }
        }
      });

      const locksByName = await prisma.jobLock.groupBy({
        by: ['lockName'],
        where: {
          acquiredAt: { gte: oneHourAgo }
        },
        _count: {
          lockName: true
        },
        orderBy: {
          _count: {
            lockName: 'desc'
          }
        },
        take: 10
      });

      return {
        activeLocks,
        recentLocks,
        staleLocksCount,
        topContentedLocks: locksByName.map(group => ({
          lockName: group.lockName,
          count: group._count.lockName
        })),
        healthStatus: staleLocksCount > 5 ? 'CRITICAL' :
                     staleLocksCount > 2 ? 'WARNING' : 'HEALTHY',
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error('Failed to get lock health metrics:', error);
      return {
        activeLocks: 0,
        recentLocks: 0,
        staleLocksCount: 0,
        topContentedLocks: [],
        healthStatus: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
}
