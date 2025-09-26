/**
 * Distributed Locking System
 * 
 * Provides database-based distributed locking to prevent race conditions
 * in cron job execution and filing processing. Uses PostgreSQL advisory locks
 * and database records for reliable coordination across multiple instances.
 */

import { getPrismaClient } from './prisma';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { v4 as uuidv4 } from 'uuid';

const prisma = getPrismaClient();
const lockLogger = logger.child('distributed-lock');

export interface LockOptions {
  ttl?: number; // Lock timeout in milliseconds
  acquireTimeout?: number; // How long to wait when acquiring lock
  retryDelay?: number; // Delay between retry attempts
  maxRetries?: number; // Maximum acquisition retries
  autoRenewal?: boolean; // Auto-renew locks before expiration
  renewalInterval?: number; // How often to renew (percentage of TTL)
}

export interface LockResult {
  acquired: boolean;
  lockId?: string;
  expiresAt?: Date;
  error?: string;
}

export interface LockContext {
  lockId: string;
  lockName: string;
  acquiredAt: Date;
  expiresAt: Date;
  acquiredBy: string;
  autoRenewal: boolean;
  renewalTimer?: NodeJS.Timeout;
}

/**
 * Distributed lock manager using database-based advisory locks
 */
export class DistributedLockManager {
  private static instance: DistributedLockManager;
  private activeLocks = new Map<string, LockContext>();
  private readonly instanceId = `instance-${uuidv4()}`;

  private constructor() {
    // Set up cleanup on process exit
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('beforeExit', () => this.cleanup());
  }

  static getInstance(): DistributedLockManager {
    if (!DistributedLockManager.instance) {
      DistributedLockManager.instance = new DistributedLockManager();
    }
    return DistributedLockManager.instance;
  }

  /**
   * Acquire a distributed lock
   */
  async acquireLock(
    lockName: string, 
    options: LockOptions = {}
  ): Promise<LockResult> {
    const config = {
      ttl: 300000, // 5 minutes default
      acquireTimeout: 10000, // 10 seconds
      retryDelay: 500,
      maxRetries: 5,
      autoRenewal: true,
      renewalInterval: 60, // Renew at 60% of TTL
      ...options
    };

    const lockId = uuidv4();
    const acquiredAt = new Date();
    const expiresAt = new Date(acquiredAt.getTime() + config.ttl);

    lockLogger.info('Attempting to acquire lock', {
      lockName,
      lockId,
      instanceId: this.instanceId,
      ttl: config.ttl,
      expiresAt: expiresAt.toISOString()
    });

    let attempts = 0;
    const startTime = Date.now();

    while (attempts <= config.maxRetries && (Date.now() - startTime) < config.acquireTimeout) {
      attempts++;

      try {
        // Try to acquire the lock using database transaction
        const acquired = await this.tryAcquireLock(lockName, lockId, acquiredAt, expiresAt);

        if (acquired) {
          // Store lock context
          const lockContext: LockContext = {
            lockId,
            lockName,
            acquiredAt,
            expiresAt,
            acquiredBy: this.instanceId,
            autoRenewal: config.autoRenewal
          };

          this.activeLocks.set(lockId, lockContext);

          // Set up auto-renewal if enabled
          if (config.autoRenewal) {
            this.setupAutoRenewal(lockContext, config.ttl, config.renewalInterval);
          }

          lockLogger.info('Lock acquired successfully', {
            lockName,
            lockId,
            attempts,
            duration: Date.now() - startTime
          });

          monitoring.incrementCounter('lock.acquired', 1);
          monitoring.recordValue('lock.acquisition_time', Date.now() - startTime);

          return {
            acquired: true,
            lockId,
            expiresAt
          };
        }

        // Lock not acquired, wait before retry
        if (attempts <= config.maxRetries) {
          lockLogger.debug('Lock acquisition failed, retrying', {
            lockName,
            attempt: attempts,
            maxRetries: config.maxRetries,
            retryDelay: config.retryDelay
          });

          await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        }

      } catch (error) {
        lockLogger.error('Error during lock acquisition', {
          lockName,
          lockId,
          attempt: attempts,
          error: error instanceof Error ? error.message : String(error)
        });

        monitoring.incrementCounter('lock.acquisition_error', 1);

        // On database errors, wait before retry
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
      }
    }

    lockLogger.warn('Failed to acquire lock after all attempts', {
      lockName,
      attempts,
      duration: Date.now() - startTime,
      timeout: config.acquireTimeout
    });

    monitoring.incrementCounter('lock.acquisition_failed', 1);

    return {
      acquired: false,
      error: `Failed to acquire lock '${lockName}' after ${attempts} attempts`
    };
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(lockId: string): Promise<boolean> {
    const lockContext = this.activeLocks.get(lockId);
    
    if (!lockContext) {
      lockLogger.warn('Attempted to release unknown lock', { lockId });
      return false;
    }

    try {
      // Clear auto-renewal timer
      if (lockContext.renewalTimer) {
        clearTimeout(lockContext.renewalTimer);
      }

      // Release the lock in database
      const released = await prisma.$transaction(async (tx) => {
        const result = await tx.jobLock.updateMany({
          where: {
            id: lockId,
            acquiredBy: this.instanceId,
            released: false
          },
          data: {
            released: true
          }
        });

        return result.count > 0;
      });

      if (released) {
        this.activeLocks.delete(lockId);
        
        lockLogger.info('Lock released successfully', {
          lockName: lockContext.lockName,
          lockId,
          holdTime: Date.now() - lockContext.acquiredAt.getTime()
        });

        monitoring.incrementCounter('lock.released', 1);
        monitoring.recordValue('lock.hold_time', Date.now() - lockContext.acquiredAt.getTime());

        return true;
      } else {
        lockLogger.warn('Lock release failed - not found or already released', {
          lockName: lockContext.lockName,
          lockId
        });
        return false;
      }

    } catch (error) {
      lockLogger.error('Error releasing lock', {
        lockName: lockContext.lockName,
        lockId,
        error: error instanceof Error ? error.message : String(error)
      });

      monitoring.incrementCounter('lock.release_error', 1);
      return false;
    }
  }

  /**
   * Execute an operation with a distributed lock
   */
  async withLock<T>(
    lockName: string,
    operation: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lockResult = await this.acquireLock(lockName, options);
    
    if (!lockResult.acquired) {
      throw new Error(`Failed to acquire lock '${lockName}': ${lockResult.error}`);
    }

    try {
      lockLogger.info('Executing operation with lock', {
        lockName,
        lockId: lockResult.lockId
      });

      const result = await operation();

      lockLogger.info('Operation completed successfully with lock', {
        lockName,
        lockId: lockResult.lockId
      });

      return result;

    } finally {
      // Always try to release the lock
      if (lockResult.lockId) {
        await this.releaseLock(lockResult.lockId);
      }
    }
  }

  /**
   * Try to acquire a lock using database transaction
   */
  private async tryAcquireLock(
    lockName: string,
    lockId: string,
    acquiredAt: Date,
    expiresAt: Date
  ): Promise<boolean> {
    return await prisma.$transaction(async (tx) => {
      // Clean up expired locks first
      await tx.jobLock.deleteMany({
        where: {
          lockName,
          OR: [
            { expiresAt: { lt: new Date() } },
            { released: true }
          ]
        }
      });

      // Try to create the lock
      try {
        await tx.jobLock.create({
          data: {
            id: lockId,
            lockName,
            acquiredBy: this.instanceId,
            acquiredAt,
            expiresAt,
            released: false
          }
        });

        return true;
      } catch {
        // Lock already exists
        return false;
      }
    });
  }

  /**
   * Set up automatic lock renewal
   */
  private setupAutoRenewal(
    lockContext: LockContext,
    ttl: number,
    renewalPercentage: number
  ): void {
    const renewalInterval = Math.floor((ttl * renewalPercentage) / 100);
    
    lockContext.renewalTimer = setTimeout(async () => {
      try {
        await this.renewLock(lockContext, ttl);
        
        // Schedule next renewal
        this.setupAutoRenewal(lockContext, ttl, renewalPercentage);
        
      } catch (error) {
        lockLogger.error('Auto-renewal failed', {
          lockName: lockContext.lockName,
          lockId: lockContext.lockId,
          error: error instanceof Error ? error.message : String(error)
        });

        // Remove from active locks since renewal failed
        this.activeLocks.delete(lockContext.lockId);
        monitoring.incrementCounter('lock.renewal_failed', 1);
      }
    }, renewalInterval);
  }

  /**
   * Renew an existing lock
   */
  private async renewLock(lockContext: LockContext, ttl: number): Promise<void> {
    const newExpiresAt = new Date(Date.now() + ttl);

    const renewed = await prisma.$transaction(async (tx) => {
      const result = await tx.jobLock.updateMany({
        where: {
          id: lockContext.lockId,
          acquiredBy: this.instanceId,
          released: false
        },
        data: {
          expiresAt: newExpiresAt,
          refreshedAt: new Date()
        }
      });

      return result.count > 0;
    });

    if (renewed) {
      lockContext.expiresAt = newExpiresAt;
      
      lockLogger.debug('Lock renewed successfully', {
        lockName: lockContext.lockName,
        lockId: lockContext.lockId,
        newExpiresAt: newExpiresAt.toISOString()
      });

      monitoring.incrementCounter('lock.renewed', 1);
    } else {
      throw new Error('Failed to renew lock - lock may have been released or expired');
    }
  }

  /**
   * Get information about active locks
   */
  getActiveLocks(): Array<{
    lockId: string;
    lockName: string;
    acquiredAt: Date;
    expiresAt: Date;
    holdTime: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeLocks.values()).map(lock => ({
      lockId: lock.lockId,
      lockName: lock.lockName,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt,
      holdTime: now - lock.acquiredAt.getTime()
    }));
  }

  /**
   * Clean up all locks held by this instance
   */
  async cleanup(): Promise<void> {
    lockLogger.info('Cleaning up distributed locks', {
      activeLocks: this.activeLocks.size,
      instanceId: this.instanceId
    });

    // Clear all renewal timers
    for (const lockContext of this.activeLocks.values()) {
      if (lockContext.renewalTimer) {
        clearTimeout(lockContext.renewalTimer);
      }
    }

    // Release all locks in database
    try {
      const result = await prisma.jobLock.updateMany({
        where: {
          acquiredBy: this.instanceId,
          released: false
        },
        data: {
          released: true
        }
      });

      lockLogger.info('Released locks during cleanup', {
        releasedCount: result.count,
        instanceId: this.instanceId
      });

    } catch (error) {
      lockLogger.error('Error during lock cleanup', {
        error: error instanceof Error ? error.message : String(error),
        instanceId: this.instanceId
      });
    }

    this.activeLocks.clear();
  }

  /**
   * Clean up expired locks globally (maintenance task)
   */
  static async cleanupExpiredLocks(): Promise<number> {
    try {
      const result = await prisma.jobLock.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { released: true }
          ]
        }
      });

      lockLogger.info('Cleaned up expired locks', {
        cleanedCount: result.count
      });

      return result.count;
    } catch (error) {
      lockLogger.error('Error cleaning up expired locks', {
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }
}

// Singleton instance
export const distributedLockManager = DistributedLockManager.getInstance();

// Convenience functions
export const acquireLock = (lockName: string, options?: LockOptions) => 
  distributedLockManager.acquireLock(lockName, options);

export const releaseLock = (lockId: string) => 
  distributedLockManager.releaseLock(lockId);

export const withLock = <T>(lockName: string, operation: () => Promise<T>, options?: LockOptions) => 
  distributedLockManager.withLock(lockName, operation, options);