/**
 * Test suite to validate transaction deadlock fixes
 * 
 * This test suite verifies that the transaction isolation changes and async audit logging
 * prevent deadlocks under concurrent load while maintaining data consistency.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

// Mock setImmediate for Node.js environments where it might not be available
global.setImmediate = global.setImmediate || ((fn: (...args: any[]) => void) => setTimeout(fn, 0));

// Mock Prisma for testing
const mockTx = {
  user: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  }
};

const mockPrisma = {
  $transaction: jest.fn(),
  auditLog: {
    create: jest.fn(),
  }
};

jest.mock('../lib/db/prisma', () => ({
  getPrismaClient: () => mockPrisma
}));

// Import after mocks are set up
const { updateUserBudgetWithLock, isConcurrencyError } = require('../lib/db/concurrency');
const { createAsyncAuditLog, flushAuditQueue, clearAuditQueue, getAuditQueueStats } = require('../lib/db/async-audit');

// Mock PrismaClientKnownRequestError for testing
class MockPrismaClientKnownRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PrismaClientKnownRequestError';
  }
}

describe('Transaction Deadlock Fix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAuditQueue();
  });

  afterEach(async () => {
    await flushAuditQueue(1000); // Flush any pending audit logs
  });

  describe('Budget Update Isolation', () => {
    it('should use READ_COMMITTED isolation level by default', async () => {
      const mockUser = {
        budgetUsed: 100,
        subscriptionTier: 'PROFESSIONAL',
        budgetResetAt: new Date()
      };

      mockTx.user.findUnique.mockResolvedValue(mockUser);
      mockTx.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementation((callback) => callback(mockTx));

      const result = await updateUserBudgetWithLock('user-123', 50, 100, 500, {
        enableAuditLogging: false // Disable to avoid async complications in test
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: 'ReadCommitted',
          timeout: 5000
        })
      );

      expect(result.success).toBe(true);
      expect(result.previousBudget).toBe(100);
      expect(result.newBudget).toBe(150);
    });

    it('should handle concurrent updates with optimistic locking', async () => {
      let callCount = 0;
      const mockUser = {
        budgetUsed: 100,
        subscriptionTier: 'PROFESSIONAL', 
        budgetResetAt: new Date()
      };

      mockTx.user.findUnique.mockResolvedValue(mockUser);
      mockTx.user.updateMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails (simulates concurrent update)
          return Promise.resolve({ count: 0 });
        }
        // Second call succeeds
        return Promise.resolve({ count: 1 });
      });
      
      mockPrisma.$transaction.mockImplementation((callback) => callback(mockTx));

      const result = await updateUserBudgetWithLock('user-123', 50, 100, 500, {
        enableAuditLogging: false,
        maxRetries: 2
      });

      expect(result.success).toBe(true);
      expect(mockTx.user.updateMany).toHaveBeenCalledTimes(2);
    });

    it('should enforce budget limits strictly', async () => {
      const mockUser = {
        budgetUsed: 450,
        subscriptionTier: 'PROFESSIONAL',
        budgetResetAt: new Date()
      };

      mockTx.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.$transaction.mockImplementation((callback) => callback(mockTx));

      await expect(
        updateUserBudgetWithLock('user-123', 100, 450, 500)
      ).rejects.toThrow('Budget limit exceeded');
    });
  });

  describe('Async Audit Logging', () => {
    it('should queue audit logs asynchronously', async () => {
      const auditData = {
        userId: 'user-123',
        action: 'BUDGET_UPDATE',
        details: {
          previousBudget: 100,
          newBudget: 150,
          costAdded: 50
        },
        success: true
      };

      await createAsyncAuditLog(auditData);

      const stats = getAuditQueueStats();
      expect(stats.queueSize).toBe(1);
    });

    it('should process audit logs in batches', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      // Queue multiple audit logs
      for (let i = 0; i < 5; i++) {
        await createAsyncAuditLog({
          userId: `user-${i}`,
          action: 'BUDGET_UPDATE',
          details: { testData: i },
          success: true
        });
      }

      // Wait for processing
      await flushAuditQueue(2000);

      const stats = getAuditQueueStats();
      expect(stats.queueSize).toBe(0); // All processed
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(5);
    });

    it('should retry failed audit log creation', async () => {
      let attempts = 0;
      mockPrisma.auditLog.create.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Database connection error'));
        }
        return Promise.resolve({ id: 'audit-1' });
      });

      await createAsyncAuditLog({
        userId: 'user-123',
        action: 'BUDGET_UPDATE',
        details: { test: true },
        success: true
      });

      await flushAuditQueue(5000);

      expect(attempts).toBeGreaterThanOrEqual(3);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('Concurrency Error Detection', () => {
    it('should detect Prisma concurrency errors', () => {
      const prismaError = new MockPrismaClientKnownRequestError('P2034', 'Transaction failed');
      expect(isConcurrencyError(prismaError)).toBe(true);

      const prismaConstraintError = new MockPrismaClientKnownRequestError('P2002', 'Unique constraint');
      expect(isConcurrencyError(prismaConstraintError)).toBe(true);

      const prismaNotFoundError = new MockPrismaClientKnownRequestError('P2025', 'Record not found');
      expect(isConcurrencyError(prismaNotFoundError)).toBe(true);
    });

    it('should detect deadlock errors in messages', () => {
      const deadlockError = new Error('Deadlock detected');
      expect(isConcurrencyError(deadlockError)).toBe(true);

      const serializationError = new Error('could not serialize access');
      expect(isConcurrencyError(serializationError)).toBe(true);

      const regularError = new Error('Some other error');
      expect(isConcurrencyError(regularError)).toBe(false);
    });
  });

  describe('Load Testing Simulation', () => {
    it('should handle concurrent budget updates without deadlocks', async () => {
      const mockUser = {
        budgetUsed: 100,
        subscriptionTier: 'ENTERPRISE',
        budgetResetAt: new Date()
      };

      mockTx.user.findUnique.mockResolvedValue(mockUser);
      mockTx.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementation((callback) => callback(mockTx));

      // Simulate 20 concurrent budget updates
      const concurrentUpdates = Array(20).fill(0).map((_, index) => 
        updateUserBudgetWithLock(`user-${index}`, 10, 100, 1000, {
          enableAuditLogging: false, // Disable for test performance
          maxRetries: 5
        })
      );

      const results = await Promise.allSettled(concurrentUpdates);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // All should succeed with optimistic locking
      expect(successful).toBe(20);
      expect(failed).toBe(0);
    }, 10000); // 10 second timeout for load test

    it('should maintain budget consistency under contention', async () => {
      const initialBudget = 100;
      const updateAmount = 25;
      const concurrentUsers = 10;

      let currentBudget = initialBudget;
      
      const mockUser = {
        budgetUsed: initialBudget,
        subscriptionTier: 'INSTITUTION',
        budgetResetAt: new Date()
      };

      // Simulate budget increments with race conditions
      mockTx.user.findUnique.mockImplementation(() => {
        return Promise.resolve({
          ...mockUser,
          budgetUsed: currentBudget
        });
      });

      mockTx.user.updateMany.mockImplementation(() => {
        currentBudget += updateAmount; // Simulate actual database update
        return Promise.resolve({ count: 1 });
      });

      mockPrisma.$transaction.mockImplementation((callback) => callback(mockTx));

      const updates = Array(concurrentUsers).fill(0).map((_, i) => 
        updateUserBudgetWithLock(`user-${i}`, updateAmount, currentBudget - updateAmount, 5000, {
          enableAuditLogging: false
        })
      );

      const results = await Promise.all(updates);
      
      // All updates should be successful
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Final budget should be consistent
      const expectedFinalBudget = initialBudget + (updateAmount * concurrentUsers);
      expect(currentBudget).toBe(expectedFinalBudget);
    });
  });
});