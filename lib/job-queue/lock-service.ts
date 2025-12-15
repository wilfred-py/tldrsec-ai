import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing distributed locks to prevent concurrent job execution
 */
export class LockService {
  /**
   * Acquire a lock
   * @param lockName Name of the lock
   * @param acquiredBy Identifier of the process acquiring the lock
   * @param ttlMinutes Time-to-live in minutes before lock expires
   * @returns The lock object if acquired, null if already locked
   */
  static async acquireLock(
    lockName: string, 
    acquiredBy: string = uuidv4(), 
    ttlMinutes: number = 30
  ) {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      // First, clean up any expired locks
      await this.cleanupExpiredLocks();
      
      // Check if lock is already held
      const existingLock = await prisma.jobLock.findFirst({
        where: {
          lockName,
          released: false,
          expiresAt: { gt: new Date() }
        }
      });

      if (existingLock) {
        console.log(`Lock ${lockName} already held by ${existingLock.acquiredBy}`);
        return null;
      }

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      // Create or update the lock
      const lock = await prisma.jobLock.upsert({
        where: { lockName },
        update: {
          acquiredBy,
          acquiredAt: new Date(),
          expiresAt,
          refreshedAt: null,
          released: false
        },
        create: {
          id: uuidv4(),
          lockName,
          acquiredBy,
          acquiredAt: new Date(),
          expiresAt,
          released: false
        }
      });

      console.log(`Lock ${lockName} acquired by ${acquiredBy}, expires at ${expiresAt}`, {
        ttlMinutes,
        lockId: lock.id,
        timestamp: new Date().toISOString()
      });
      return lock;
    } catch (error) {
      console.error(`Failed to acquire lock ${lockName}:`, error, {
        ttlMinutes,
        acquiredBy,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        timestamp: new Date().toISOString()
      });
      throw new Error(`Failed to acquire lock: ${(error as Error).message}`);
    }
  }

  /**
   * Release a lock
   * @param lockName Name of the lock
   * @param acquiredBy Identifier of the process that acquired the lock (for validation)
   * @returns True if lock was released, false if lock wasn't held by this process
   */
  static async releaseLock(lockName: string, acquiredBy?: string) {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      const whereClause: any = {
        lockName,
        released: false
      };

      // If acquiredBy is provided, validate ownership
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
   * Refresh a lock to extend its expiration
   * @param lockName Name of the lock
   * @param acquiredBy Identifier of the process that acquired the lock (for validation)
   * @param extendMinutes Additional minutes to extend the lock
   * @returns True if lock was refreshed, false if lock wasn't held by this process
   */
  static async refreshLock(
    lockName: string, 
    acquiredBy: string, 
    extendMinutes: number = 15
  ) {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      const lock = await prisma.jobLock.findFirst({
        where: {
          lockName,
          acquiredBy,
          released: false
        }
      });

      if (!lock) {
        console.log(`Lock ${lockName} not found or not held by ${acquiredBy}`);
        return false;
      }

      // Calculate new expiration time
      const expiresAt = new Date(Date.now() + extendMinutes * 60 * 1000);

      await prisma.jobLock.update({
        where: { id: lock.id },
        data: {
          expiresAt,
          refreshedAt: new Date()
        }
      });

      console.log(`Lock ${lockName} refreshed by ${acquiredBy}, new expiration: ${expiresAt}`);
      return true;
    } catch (error) {
      console.error(`Failed to refresh lock ${lockName}:`, error);
      throw new Error(`Failed to refresh lock: ${(error as Error).message}`);
    }
  }

  /**
   * Force release a lock regardless of who holds it
   * @param lockName Name of the lock
   * @returns True if lock was released
   */
  static async forceReleaseLock(lockName: string) {
    return this.releaseLock(lockName);
  }

  /**
   * Clean up expired locks using Prisma
   */
  static async cleanupExpiredLocks() {
    try {
      // Dynamic import to avoid build-time dependencies
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
      // Don't throw here, just log the error to avoid blocking other operations
      return 0;
    }
  }

  /**
   * Cleanup expired locks using raw SQL for atomic operation
   * This is a defense-in-depth mechanism that bypasses Prisma ORM
   * for maximum reliability in cleanup operations.
   *
   * Use this when you need guaranteed atomic cleanup that doesn't
   * depend on Prisma's query building.
   */
  static async cleanupExpiredLocksAtomic(): Promise<number> {
    try {
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();

      // Use raw SQL for atomic cleanup - bypasses Prisma ORM entirely
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
   * WARNING: This will release ALL locks regardless of expiration status.
   * Use only in emergency situations when the pipeline is completely stalled.
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
   * Check if a lock is held
   * @param lockName Name of the lock
   * @returns Lock object if held, null if not
   */
  static async checkLock(lockName: string) {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      const lock = await prisma.jobLock.findFirst({
        where: {
          lockName,
          released: false,
          expiresAt: { gt: new Date() }
        }
      });

      return lock;
    } catch (error) {
      console.error(`Failed to check lock ${lockName}:`, error);
      throw new Error(`Failed to check lock: ${(error as Error).message}`);
    }
  }

  /**
   * List all active locks
   */
  static async listActiveLocks() {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      const locks = await prisma.jobLock.findMany({
        where: {
          released: false,
          expiresAt: { gt: new Date() }
        },
        orderBy: { acquiredAt: 'desc' }
      });

      return locks;
    } catch (error) {
      console.error('Failed to list active locks:', error);
      throw new Error(`Failed to list active locks: ${(error as Error).message}`);
    }
  }

  /**
   * Get lock health metrics for monitoring
   */
  static async getLockHealthMetrics() {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Get active locks
      const activeLocks = await prisma.jobLock.count({
        where: {
          released: false,
          expiresAt: { gt: now }
        }
      });
      
      // Get locks created in last hour
      const recentLocks = await prisma.jobLock.count({
        where: {
          acquiredAt: { gte: oneHourAgo }
        }
      });
      
      // Get expired but not released locks (potential issues)
      const staleLocksCount = await prisma.jobLock.count({
        where: {
          released: false,
          expiresAt: { lt: now }
        }
      });
      
      // Get lock contention data
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
      
      console.log('Lock health metrics collected', {
        activeLocks,
        recentLocks,
        staleLocksCount,
        topContentedLocks: locksByName.length,
        timestamp: now.toISOString()
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