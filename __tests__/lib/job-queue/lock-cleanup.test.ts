/**
 * Tests for LockService cleanup functionality
 * These tests verify that expired locks are properly cleaned up
 */

// Mock dependencies
jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(),
}));

import { getPrismaClient } from '../../../lib/db/prisma';
import { LockService } from '../../../lib/job-queue/lock-service';

// Type for mocked Prisma
type MockPrismaClient = {
  jobLock: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
    upsert: jest.Mock;
  };
  $executeRaw: jest.Mock;
  $disconnect: jest.Mock;
};

describe('LockService Cleanup', () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh mock for each test
    mockPrisma = {
      jobLock: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        upsert: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $disconnect: jest.fn(),
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
  });

  describe('cleanupExpiredLocks', () => {
    it('should mark expired locks as released', async () => {
      // Mock: updateMany returns 1 affected row
      mockPrisma.jobLock.updateMany.mockResolvedValue({ count: 1 });

      const cleaned = await LockService.cleanupExpiredLocks();

      expect(cleaned).toBe(1);
      expect(mockPrisma.jobLock.updateMany).toHaveBeenCalledWith({
        where: {
          released: false,
          expiresAt: { lt: expect.any(Date) },
        },
        data: {
          released: true,
        },
      });
    });

    it('should return 0 when no expired locks exist', async () => {
      mockPrisma.jobLock.updateMany.mockResolvedValue({ count: 0 });

      const cleaned = await LockService.cleanupExpiredLocks();

      expect(cleaned).toBe(0);
    });

    it('should handle multiple expired locks', async () => {
      mockPrisma.jobLock.updateMany.mockResolvedValue({ count: 5 });

      const cleaned = await LockService.cleanupExpiredLocks();

      expect(cleaned).toBe(5);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.jobLock.updateMany.mockRejectedValue(new Error('Database error'));

      const cleaned = await LockService.cleanupExpiredLocks();

      // Should return 0 and not throw
      expect(cleaned).toBe(0);
    });
  });

  describe('cleanupExpiredLocksAtomic', () => {
    it('should clean up expired locks using raw SQL', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(3);

      const cleaned = await LockService.cleanupExpiredLocksAtomic();

      expect(cleaned).toBe(3);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should return 0 when no expired locks exist', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(0);

      const cleaned = await LockService.cleanupExpiredLocksAtomic();

      expect(cleaned).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.$executeRaw.mockRejectedValue(new Error('Database error'));

      const cleaned = await LockService.cleanupExpiredLocksAtomic();

      expect(cleaned).toBe(0);
    });
  });

  describe('forceCleanupAllLocks', () => {
    it('should release ALL locks regardless of expiration', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(10);

      const cleaned = await LockService.forceCleanupAllLocks();

      expect(cleaned).toBe(10);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should return 0 when no locks exist', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(0);

      const cleaned = await LockService.forceCleanupAllLocks();

      expect(cleaned).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.$executeRaw.mockRejectedValue(new Error('Database error'));

      const cleaned = await LockService.forceCleanupAllLocks();

      expect(cleaned).toBe(0);
    });
  });

  describe('getLockHealthMetrics', () => {
    it('should return HEALTHY when no stale locks exist', async () => {
      const now = new Date();

      // Mock counts - no active, no stale
      mockPrisma.jobLock.count
        .mockResolvedValueOnce(0) // active locks
        .mockResolvedValueOnce(0) // recent locks
        .mockResolvedValueOnce(0); // stale locks

      mockPrisma.jobLock.groupBy.mockResolvedValue([]);

      const metrics = await LockService.getLockHealthMetrics();

      expect(metrics.healthStatus).toBe('HEALTHY');
      expect(metrics.staleLocksCount).toBe(0);
    });

    it('should return HEALTHY with active non-stale locks', async () => {
      mockPrisma.jobLock.count
        .mockResolvedValueOnce(1) // active locks
        .mockResolvedValueOnce(1) // recent locks
        .mockResolvedValueOnce(0); // stale locks

      mockPrisma.jobLock.groupBy.mockResolvedValue([]);

      const metrics = await LockService.getLockHealthMetrics();

      expect(metrics.healthStatus).toBe('HEALTHY');
      expect(metrics.activeLocks).toBe(1);
      expect(metrics.staleLocksCount).toBe(0);
    });

    it('should return WARNING when 3-5 stale locks exist', async () => {
      mockPrisma.jobLock.count
        .mockResolvedValueOnce(0) // active locks
        .mockResolvedValueOnce(0) // recent locks
        .mockResolvedValueOnce(4); // stale locks

      mockPrisma.jobLock.groupBy.mockResolvedValue([]);

      const metrics = await LockService.getLockHealthMetrics();

      expect(metrics.healthStatus).toBe('WARNING');
      expect(metrics.staleLocksCount).toBe(4);
    });

    it('should return CRITICAL when 6+ stale locks exist', async () => {
      mockPrisma.jobLock.count
        .mockResolvedValueOnce(0) // active locks
        .mockResolvedValueOnce(0) // recent locks
        .mockResolvedValueOnce(6); // stale locks

      mockPrisma.jobLock.groupBy.mockResolvedValue([]);

      const metrics = await LockService.getLockHealthMetrics();

      expect(metrics.healthStatus).toBe('CRITICAL');
      expect(metrics.staleLocksCount).toBe(6);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.jobLock.count.mockRejectedValue(new Error('Database error'));

      const metrics = await LockService.getLockHealthMetrics();

      expect(metrics.healthStatus).toBe('ERROR');
    });
  });

  describe('releaseLock', () => {
    it('should mark lock as released', async () => {
      const existingLock = {
        id: 'lock-id',
        lockName: 'test-lock',
        acquiredBy: 'test-process',
        released: false,
      };
      mockPrisma.jobLock.findFirst.mockResolvedValue(existingLock);
      mockPrisma.jobLock.update.mockResolvedValue({ ...existingLock, released: true });

      const result = await LockService.releaseLock('test-lock', 'test-process');

      expect(result).toBe(true);
      expect(mockPrisma.jobLock.update).toHaveBeenCalledWith({
        where: { id: 'lock-id' },
        data: { released: true },
      });
    });

    it('should return false if lock not found', async () => {
      mockPrisma.jobLock.findFirst.mockResolvedValue(null);

      const result = await LockService.releaseLock('test-lock', 'test-process');

      expect(result).toBe(false);
    });

    it('should release lock without ownership check if acquiredBy not provided', async () => {
      const existingLock = {
        id: 'lock-id',
        lockName: 'test-lock',
        acquiredBy: 'other-process',
        released: false,
      };
      mockPrisma.jobLock.findFirst.mockResolvedValue(existingLock);
      mockPrisma.jobLock.update.mockResolvedValue({ ...existingLock, released: true });

      const result = await LockService.releaseLock('test-lock');

      expect(result).toBe(true);
    });
  });

});
