/**
 * Security Tests for Budget Manipulation Prevention
 * 
 * Tests critical security vulnerabilities in budget management system
 * including race conditions, cost validation, and tier escalation attacks.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { updateUserBudgetWithLock, validateCostUpdate } from '../../lib/db/concurrency';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { getPrismaClient } from '../../lib/db/prisma';

// Mock Prisma client
jest.mock('../../lib/db/prisma', () => {
  const mockPrismaInstance = {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn()
    },
    auditLog: {
      create: jest.fn()
    },
    $transaction: jest.fn()
  };
  
  return {
    getPrismaClient: jest.fn(() => mockPrismaInstance)
  };
});

jest.mock('../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

const mockPrisma = (getPrismaClient as jest.Mock)();

describe('Budget Manipulation Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default transaction mock
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      const mockTx = {
        user: {
          findUnique: jest.fn(),
          updateMany: jest.fn()
        },
        auditLog: {
          create: jest.fn()
        }
      };
      
      mockTx.user.findUnique.mockResolvedValue({
        id: 'test-user',
        budgetUsed: 0,
        subscriptionTier: 'FREE',
        budgetResetAt: new Date()
      });
      
      mockTx.user.updateMany.mockResolvedValue({ count: 1 });
      mockTx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
      
      return await callback(mockTx);
    });
  });

  describe('Cost Validation Security', () => {
    it('should reject negative costs (budget reduction attack)', () => {
      const result = validateCostUpdate(-0.5, 'FREE', 'user123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Negative cost not allowed');
      expect(result.sanitizedCost).toBe(0);
    });

    it('should reject extremely small costs (bypass attack)', () => {
      // Set production environment to ensure strict validation
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      try {
        const result = validateCostUpdate(0.0001, 'FREE', 'user123');
        
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Cost too small');
        expect(result.sanitizedCost).toBe(0);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should allow zero cost in test environment only', () => {
      // Test environment should allow zero costs
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      
      try {
        const result = validateCostUpdate(0, 'FREE', 'user123');
        
        expect(result.valid).toBe(true);
        expect(result.sanitizedCost).toBe(0);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should reject costs exceeding tier limits (privilege escalation)', () => {
      const result = validateCostUpdate(1.0, 'FREE', 'user123'); // FREE limit is 0.20
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cost exceeds tier limit');
      expect(result.sanitizedCost).toBe(0);
    });

    it('should reject costs exceeding maximum per operation', () => {
      const result = validateCostUpdate(15.0, 'INSTITUTION', 'user123'); // MAX_COST_PER_OPERATION is 10.0
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cost exceeds maximum');
      expect(result.sanitizedCost).toBe(0);
    });

    it('should sanitize floating point precision attacks', () => {
      const result = validateCostUpdate(0.123456789, 'FREE', 'user123');
      
      expect(result.valid).toBe(true);
      expect(result.sanitizedCost).toBe(0.123); // Rounded to 3 decimal places
    });

    it('should reject invalid data types', () => {
      const result = validateCostUpdate(NaN, 'FREE', 'user123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid cost type');
      expect(result.sanitizedCost).toBe(0);
    });

    it('should reject infinite values', () => {
      const result = validateCostUpdate(Infinity, 'FREE', 'user123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid cost type');
      expect(result.sanitizedCost).toBe(0);
    });

    it('should reject invalid tiers', () => {
      const result = validateCostUpdate(0.1, 'INVALID_TIER' as any, 'user123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid tier');
      expect(result.sanitizedCost).toBe(0);
    });
  });

  describe('Race Condition Protection', () => {
    it('should detect budget changes during update (race condition)', async () => {
      // Mock user with budget that changes during processing
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'test-user',
              budgetUsed: 0.15, // Changed from expected 0.10
              subscriptionTier: 'FREE',
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn()
          },
          auditLog: {
            create: jest.fn()
          }
        };
        
        return await callback(mockTx);
      });

      await expect(updateUserBudgetWithLock(
        'test-user',
        0.05,
        0.10, // Expected budget
        0.20, // Daily limit
        { enableAuditLogging: false }
      )).rejects.toThrow('Optimistic lock failed');
    });

    it('should prevent budget updates when user is deleted', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue(null), // User not found
            updateMany: jest.fn()
          },
          auditLog: {
            create: jest.fn()
          }
        };
        
        return await callback(mockTx);
      });

      await expect(updateUserBudgetWithLock(
        'deleted-user',
        0.05,
        0,
        0.20,
        { enableAuditLogging: false }
      )).rejects.toThrow('User deleted-user not found');
    });

    it('should handle concurrent budget updates with updateMany failure', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'test-user',
              budgetUsed: 0,
              subscriptionTier: 'FREE',
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }) // No rows updated
          },
          auditLog: {
            create: jest.fn()
          }
        };
        
        return await callback(mockTx);
      });

      await expect(updateUserBudgetWithLock(
        'test-user',
        0.05,
        0,
        0.20,
        { enableAuditLogging: false }
      )).rejects.toThrow('Optimistic lock failed');
    });
  });

  describe('Tier Escalation Security', () => {
    it('should prevent processing users with wrong tier configuration', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'test-user',
              budgetUsed: 0,
              subscriptionTier: 'FREE', // User is actually FREE
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn()
          },
          auditLog: {
            create: jest.fn()
          }
        };
        
        return await callback(mockTx);
      });

      // Try to process with ENTERPRISE costs but user is FREE
      await expect(updateUserBudgetWithLock(
        'test-user',
        1.0, // High cost for ENTERPRISE
        0,
        1.25, // ENTERPRISE limit
        { tier: 'ENTERPRISE', enableAuditLogging: false }
      )).rejects.toThrow();
    });

    it('should enforce budget limits per actual subscription tier', async () => {
      await expect(updateUserBudgetWithLock(
        'test-user',
        0.25, // Cost exceeds FREE limit
        0,
        0.20, // FREE daily limit
        { tier: 'FREE', enableAuditLogging: false }
      )).rejects.toThrow('Budget limit exceeded');
    });
  });

  describe('Audit Trail Security', () => {
    it('should log all budget manipulation attempts', async () => {
      const mockAuditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
      
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'test-user',
              budgetUsed: 0,
              subscriptionTier: 'FREE',
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 })
          },
          auditLog: {
            create: mockAuditCreate
          }
        };
        
        return await callback(mockTx);
      });

      await updateUserBudgetWithLock(
        'test-user',
        0.05,
        0,
        0.20,
        { tier: 'FREE', enableAuditLogging: true }
      );

      expect(mockAuditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'test-user',
          action: 'BUDGET_UPDATE',
          details: expect.stringContaining('previousBudget'),
          success: true
        })
      });
    });

    it('should log failed budget manipulation attempts', async () => {
      const mockAuditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
      
      // Mock both transaction and global prisma for catch block
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'test-user',
              budgetUsed: 0.18,
              subscriptionTier: 'FREE',
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn()
          },
          auditLog: {
            create: mockAuditCreate
          }
        };
        
        throw new Error('Budget limit exceeded: 0.23 > 0.20');
      });
      
      // Mock global prisma for the catch block audit logging
      mockPrisma.auditLog = { create: mockAuditCreate };

      try {
        await updateUserBudgetWithLock(
          'test-user',
          0.05,
          0.18,
          0.20,
          { tier: 'FREE', enableAuditLogging: true }
        );
      } catch (error) {
        // Expected to fail
      }

      // Should still attempt to create audit log
      expect(mockAuditCreate).toHaveBeenCalled();
    });
  });

  describe('Input Sanitization', () => {
    it('should handle malformed user IDs', async () => {
      await expect(updateUserBudgetWithLock(
        '', // Empty user ID
        0.05,
        0,
        0.20,
        { enableAuditLogging: false }
      )).rejects.toThrow();
    });

    it('should handle extremely large numbers', () => {
      const result = validateCostUpdate(Number.MAX_VALUE, 'FREE', 'user123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cost exceeds maximum');
    });

    it('should handle malicious cost objects', () => {
      // Try to pass object instead of number
      const result = validateCostUpdate({} as any, 'FREE', 'user123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid cost type');
    });
  });

  describe('Concurrent Attack Scenarios', () => {
    it('should prevent simultaneous budget updates from same user', async () => {
      // Simulate two concurrent requests for the same user
      const promise1 = updateUserBudgetWithLock(
        'test-user',
        0.05,
        0,
        0.20,
        { enableAuditLogging: false, maxRetries: 1 }
      );

      // Second update should fail due to race condition
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'test-user',
              budgetUsed: 0.05, // Budget already changed
              subscriptionTier: 'FREE',
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn()
          },
          auditLog: {
            create: jest.fn()
          }
        };
        
        return await callback(mockTx);
      });

      const promise2 = updateUserBudgetWithLock(
        'test-user',
        0.05,
        0, // Expected budget is now wrong
        0.20,
        { enableAuditLogging: false, maxRetries: 1 }
      );

      // First should succeed, second should fail
      const results = await Promise.allSettled([promise1, promise2]);
      
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
      expect(results.some(r => r.status === 'rejected')).toBe(true);
    });

    it('should prevent budget overflow through rapid concurrent requests', async () => {
      let callCount = 0;
      
      // Simulate realistic race condition: first call succeeds, subsequent calls see updated budget
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        callCount++;
        
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'test-user',
              budgetUsed: callCount === 1 ? 0 : 0.15, // First call sees 0, others see 0.15
              subscriptionTier: 'FREE',
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn().mockResolvedValue({ count: callCount === 1 ? 1 : 0 }) // Only first succeeds
          },
          auditLog: {
            create: jest.fn()
          }
        };
        
        // After first call, the budget would exceed limit (0.15 + 0.15 = 0.30 > 0.20)
        if (callCount > 1) {
          throw new Error('Budget limit exceeded: 0.30 > 0.20');
        }
        
        return await callback(mockTx);
      });
      
      // Simulate multiple concurrent requests that would exceed budget
      const promises = Array.from({ length: 5 }, () =>
        updateUserBudgetWithLock(
          'test-user',
          0.15, // Each would use 0.15, total would be 0.75 > 0.20 limit
          0,
          0.20,
          { enableAuditLogging: false, maxRetries: 1 }
        )
      );

      const results = await Promise.allSettled(promises);
      
      // Most should fail due to budget limits or race conditions
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      expect(successful).toBeLessThanOrEqual(1); // At most 1 should succeed
      expect(failed).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Time-Based Attacks', () => {
    it('should prevent budget reset manipulation', async () => {
      const mockUser = {
        id: 'test-user',
        budgetUsed: 0.19,
        subscriptionTier: 'FREE',
        budgetResetAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue(mockUser),
            updateMany: jest.fn().mockResolvedValue({ count: 1 })
          },
          auditLog: {
            create: jest.fn()
          }
        };
        
        return await callback(mockTx);
      });

      // Should still respect current budget even if reset date is old
      await expect(updateUserBudgetWithLock(
        'test-user',
        0.05, // Would exceed 0.20 limit
        0.19,
        0.20,
        { enableAuditLogging: false }
      )).rejects.toThrow('Budget limit exceeded');
    });
  });
});