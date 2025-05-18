import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
// Initialize Prisma client
const prisma = new PrismaClient();
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
    static async acquireLock(lockName, acquiredBy = uuidv4(), ttlMinutes = 15) {
        try {
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
            console.log(`Lock ${lockName} acquired by ${acquiredBy}, expires at ${expiresAt}`);
            return lock;
        }
        catch (error) {
            console.error(`Failed to acquire lock ${lockName}:`, error);
            throw new Error(`Failed to acquire lock: ${error.message}`);
        }
    }
    /**
     * Release a lock
     * @param lockName Name of the lock
     * @param acquiredBy Identifier of the process that acquired the lock (for validation)
     * @returns True if lock was released, false if lock wasn't held by this process
     */
    static async releaseLock(lockName, acquiredBy) {
        try {
            const whereClause = {
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
        }
        catch (error) {
            console.error(`Failed to release lock ${lockName}:`, error);
            throw new Error(`Failed to release lock: ${error.message}`);
        }
    }
    /**
     * Refresh a lock to extend its expiration
     * @param lockName Name of the lock
     * @param acquiredBy Identifier of the process that acquired the lock (for validation)
     * @param extendMinutes Additional minutes to extend the lock
     * @returns True if lock was refreshed, false if lock wasn't held by this process
     */
    static async refreshLock(lockName, acquiredBy, extendMinutes = 15) {
        try {
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
        }
        catch (error) {
            console.error(`Failed to refresh lock ${lockName}:`, error);
            throw new Error(`Failed to refresh lock: ${error.message}`);
        }
    }
    /**
     * Force release a lock regardless of who holds it
     * @param lockName Name of the lock
     * @returns True if lock was released
     */
    static async forceReleaseLock(lockName) {
        return this.releaseLock(lockName);
    }
    /**
     * Clean up expired locks
     */
    static async cleanupExpiredLocks() {
        try {
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
        }
        catch (error) {
            console.error('Failed to clean up expired locks:', error);
            // Don't throw here, just log the error to avoid blocking other operations
            return 0;
        }
    }
    /**
     * Check if a lock is held
     * @param lockName Name of the lock
     * @returns Lock object if held, null if not
     */
    static async checkLock(lockName) {
        try {
            const lock = await prisma.jobLock.findFirst({
                where: {
                    lockName,
                    released: false,
                    expiresAt: { gt: new Date() }
                }
            });
            return lock;
        }
        catch (error) {
            console.error(`Failed to check lock ${lockName}:`, error);
            throw new Error(`Failed to check lock: ${error.message}`);
        }
    }
    /**
     * List all active locks
     */
    static async listActiveLocks() {
        try {
            const locks = await prisma.jobLock.findMany({
                where: {
                    released: false,
                    expiresAt: { gt: new Date() }
                },
                orderBy: { acquiredAt: 'desc' }
            });
            return locks;
        }
        catch (error) {
            console.error('Failed to list active locks:', error);
            throw new Error(`Failed to list active locks: ${error.message}`);
        }
    }
}
