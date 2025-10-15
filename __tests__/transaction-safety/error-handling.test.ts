/**
 * Error Handling and Recovery Tests
 * 
 * Tests comprehensive error scenarios, recovery mechanisms, and graceful degradation
 * under various failure conditions.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  withOptimisticLocking, 
  isConcurrencyError, 
  createOptimisticLockError,
  executeWithIsolation
} from '../../lib/db/concurrency';
import { updateUserBudgetWithLock } from '../../lib/db/budget-operations';
import { 
  createAsyncAuditLog, 
  clearAuditQueue, 
  flushAuditQueue, 
  getAuditQueueStats,
  shutdownAuditSystem
} from '../../lib/db/async-audit';
import { validateCostUpdate, getCostValidationConfig } from '../../lib/db/cost-validation';
import { TransactionManager, FilingTransactionManager } from '../../lib/db/transaction-manager';
import { getPrismaClient } from '../../lib/db/prisma';

const prisma = getPrismaClient();

// Mock PrismaClientKnownRequestError for comprehensive error testing
class MockPrismaClientKnownRequestError extends Error {
  code: string;
  meta?: any;
  constructor(code: string, message: string, meta?: any) {
    super(message);
    this.code = code;
    this.name = 'PrismaClientKnownRequestError';
    this.meta = meta;
  }
}

describe('Error Handling and Recovery Tests', () => {
  beforeEach(async () => {
    clearAuditQueue();
    
    // Mock console to reduce noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await flushAuditQueue(3000);
    clearAuditQueue();
    jest.restoreAllMocks();
  });

  describe('Database Connection Failures', () => {
    it('should handle connection timeout errors gracefully', async () => {
      const connectionTimeoutError = new MockPrismaClientKnownRequestError(
        'P2024',
        'Timed out waiting for connection from pool'
      );

      let attempts = 0;
      const result = await withOptimisticLocking(async () => {
        attempts++;
        if (attempts <= 2) {
          throw connectionTimeoutError;
        }
        return { success: true, attempts };
      }, {
        maxRetries: 5,
        baseDelay: 10,
        maxDelay: 100
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(attempts).toBe(3);
    });

    it('should detect and categorize connection errors correctly', () => {
      const connectionErrors = [
        new MockPrismaClientKnownRequestError('P2024', 'Connection timeout'),
        new MockPrismaClientKnownRequestError('P5008', 'Query timeout'),
        new Error('Connection refused'),
        new Error('ECONNRESET')
      ];

      connectionErrors.forEach(error => {
        const isDetected = isConcurrencyError(error);
        if (error instanceof MockPrismaClientKnownRequestError && ['P2024', 'P5008'].includes(error.code)) {
          expect(isDetected).toBe(true);
        }
      });
    });

    it('should implement exponential backoff for connection failures', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      // Mock setTimeout to capture delays
      global.setTimeout = jest.fn((callback: Function, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0); // Execute immediately for test
      }) as any;

      try {
        await withOptimisticLocking(async () => {
          throw new MockPrismaClientKnownRequestError('P2024', 'Connection timeout');
        }, {
          maxRetries: 4,
          baseDelay: 50,
          maxDelay: 1000
        });
      } catch (error) {
        // Expected to fail after retries
      }

      // Restore setTimeout
      global.setTimeout = originalSetTimeout;

      expect(delays.length).toBe(3); // 3 retries
      expect(delays[0]).toBeLessThan(delays[1]); // Increasing delays
      expect(delays[1]).toBeLessThan(delays[2]);
      expect(Math.max(...delays)).toBeLessThanOrEqual(1000); // Respect max delay
    });
  });

  describe('Serialization Failures', () => {
    it('should handle serialization conflicts with intelligent backoff', async () => {
      const serializationErrors = [
        new Error('could not serialize access due to concurrent update'),
        new Error('serialization failure'),
        new MockPrismaClientKnownRequestError('P2034', 'Transaction failed due to write conflict')
      ];

      const testPromises = serializationErrors.map(async (error, index) => {
        let attempts = 0;
        try {
          const result = await withOptimisticLocking(async () => {
            attempts++;
            if (attempts <= 1) {
              throw error;
            }
            return { recovered: true, attempts, errorType: error.constructor.name };
          }, {
            maxRetries: 3,
            baseDelay: 25
          });
          
          return { success: true, ...result };
        } catch (finalError) {
          return { 
            success: false, 
            attempts, 
            originalError: error.message,
            finalError: finalError instanceof Error ? finalError.message : 'unknown'
          };
        }
      });

      const results = await Promise.all(testPromises);
      
      // All should recover successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.attempts).toBe(2);
      });
    });

    it('should distinguish between different types of database errors', () => {
      const testCases = [
        { error: new MockPrismaClientKnownRequestError('P2002', 'Unique constraint'), expected: true },
        { error: new MockPrismaClientKnownRequestError('P2034', 'Write conflict'), expected: true },
        { error: new MockPrismaClientKnownRequestError('P2025', 'Record not found'), expected: true },
        { error: new MockPrismaClientKnownRequestError('P2024', 'Connection timeout'), expected: true },
        { error: new MockPrismaClientKnownRequestError('P5008', 'Query timeout'), expected: true },
        { error: new MockPrismaClientKnownRequestError('P1001', 'Database unreachable'), expected: false },
        { error: new Error('Validation error'), expected: false },
        { error: new Error('Not found'), expected: false }
      ];

      testCases.forEach(({ error, expected }) => {
        const result = isConcurrencyError(error);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Deadlock Detection and Recovery', () => {
    it('should detect deadlock errors in various formats', () => {
      const deadlockErrors = [
        new Error('Deadlock detected'),
        new Error('DEADLOCK FOUND'),
        new Error('Transaction was deadlocked'),
        new Error('Lock wait timeout exceeded; try restarting transaction')
      ];

      deadlockErrors.forEach(error => {
        expect(isConcurrencyError(error)).toBe(true);
      });
    });

    it('should implement random jitter for deadlock recovery', async () => {
      const delays: number[] = [];
      const calculateBackoffCallCount = 0;

      // Import the function to test
      const { calculateIntelligentBackoff } = require('../../lib/db/concurrency');

      // Test multiple calculations for randomness
      for (let i = 0; i < 20; i++) {
        const delay = calculateIntelligentBackoff(1, new Error('Deadlock detected'), 50);
        delays.push(delay);
      }

      // Verify randomness - all values should be different
      const uniqueDelays = [...new Set(delays)];
      expect(uniqueDelays.length).toBeGreaterThan(15); // At least 15 unique values out of 20

      // Verify all delays are positive and reasonable
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThan(1000); // Reasonable upper bound
      });
    });

    it('should handle deadlock scenarios with proper backoff progression', async () => {
      const deadlockError = new Error('Deadlock detected during transaction');
      let attemptCount = 0;
      const attemptDelays: number[] = [];

      try {
        await withOptimisticLocking(async () => {
          attemptCount++;
          if (attemptCount <= 3) {
            // Simulate deadlock on first 3 attempts
            throw deadlockError;
          }
          return { recovered: true, totalAttempts: attemptCount };
        }, {
          maxRetries: 5,
          baseDelay: 30,
          maxDelay: 500
        });
      } catch (error) {
        // May fail if all retries exhausted
      }

      expect(attemptCount).toBeGreaterThan(3); // Should retry multiple times
    });
  });

  describe('Cost Validation Error Scenarios', () => {
    it('should handle malformed cost inputs gracefully', () => {
      const malformedInputs = [
        { cost: null, tier: 'FREE' },
        { cost: undefined, tier: 'PROFESSIONAL' },
        { cost: 'invalid', tier: 'ENTERPRISE' },
        { cost: {}, tier: 'INSTITUTION' },
        { cost: [], tier: 'FREE' },
        { cost: Infinity, tier: 'PROFESSIONAL' },
        { cost: -Infinity, tier: 'ENTERPRISE' }
      ];

      malformedInputs.forEach(({ cost, tier }) => {
        const result = validateCostUpdate(cost as any, tier);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.sanitizedCost).toBe(0);
      });
    });

    it('should enforce security constraints under attack scenarios', () => {
      const attackScenarios = [
        { cost: -0.01, tier: 'FREE', attack: 'negative_budget_reduction' },
        { cost: 999999, tier: 'FREE', attack: 'budget_exhaustion' },
        { cost: 0.0001, tier: 'ENTERPRISE', attack: 'micro_cost_bypass' },
        { cost: Number.MAX_VALUE, tier: 'INSTITUTION', attack: 'overflow_attack' },
        { cost: Number.MIN_VALUE, tier: 'PROFESSIONAL', attack: 'underflow_attack' }
      ];

      attackScenarios.forEach(({ cost, tier, attack }) => {
        const result = validateCostUpdate(cost, tier, {
          userId: `attacker-${attack}`,
          operation: 'security-test'
        });

        // All attack scenarios should be rejected
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        
        console.log(`Blocked ${attack}: ${result.error}`);
      });
    });

    it('should validate environment-specific behavior', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalJestWorkerId = process.env.JEST_WORKER_ID;
      
      try {
        // Test production environment
        process.env.NODE_ENV = 'production';
        delete process.env.JEST_WORKER_ID; // Temporarily clear Jest worker ID to test production behavior
        let config = getCostValidationConfig();
        expect(config.environment.isProduction).toBe(true);
        
        let result = validateCostUpdate(0, 'FREE');
        expect(result.valid).toBe(false); // Zero cost rejected in production
        
        // Test development environment  
        process.env.NODE_ENV = 'development';
        config = getCostValidationConfig();
        expect(config.environment.isDevelopment).toBe(true);
        
        result = validateCostUpdate(0, 'FREE');
        expect(result.valid).toBe(true); // Zero cost allowed in development
        
        // Test test environment
        process.env.NODE_ENV = 'test';
        config = getCostValidationConfig();
        expect(config.environment.isTest).toBe(true);
        
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalJestWorkerId) {
          process.env.JEST_WORKER_ID = originalJestWorkerId;
        }
      }
    });
  });

  describe('Audit System Failure Recovery', () => {
    it('should handle audit queue overflow gracefully', async () => {
      const initialStats = getAuditQueueStats();
      
      // Generate massive number of audit logs to test overflow
      const massiveLogCount = 15000; // Exceeds MAX_QUEUE_SIZE (10000)
      
      const promises = Array.from({ length: massiveLogCount }, async (_, index) => {
        try {
          await createAsyncAuditLog({
            userId: `overflow-test-${index % 100}`,
            action: 'OVERFLOW_TEST',
            details: { index, data: 'x'.repeat(50) },
            success: true
          });
          return { success: true, index };
        } catch (error) {
          return { success: false, index, error: error instanceof Error ? error.message : 'unknown' };
        }
      });

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      
      const stats = getAuditQueueStats();
      
      console.log(`Overflow Test Results:
        Attempted Logs: ${massiveLogCount}
        Queue Size: ${stats.queueSize}
        Processing: ${stats.processingQueue}
        Success Rate: ${stats.successRate.toFixed(1)}%`);

      // Queue should implement overflow protection
      expect(stats.queueSize).toBeLessThanOrEqual(10000); // MAX_QUEUE_SIZE
      expect(stats.successRate).toBeGreaterThan(0); // Some processing should occur
    });

    it('should handle audit system shutdown gracefully', async () => {
      // Create some audit logs
      await Promise.all([
        createAsyncAuditLog({
          userId: 'shutdown-test-1',
          action: 'PRE_SHUTDOWN',
          details: { phase: 'before_shutdown' },
          success: true
        }),
        createAsyncAuditLog({
          userId: 'shutdown-test-2',
          action: 'PRE_SHUTDOWN',
          details: { phase: 'before_shutdown' },
          success: true
        })
      ]);

      const preShutdownStats = getAuditQueueStats();
      expect(preShutdownStats.queueSize).toBeGreaterThan(0);

      // Test graceful shutdown
      const shutdownPromise = shutdownAuditSystem(5000);
      await expect(shutdownPromise).resolves.toBeUndefined();

      const postShutdownStats = getAuditQueueStats();
      
      // Queue should be smaller or empty after shutdown
      expect(postShutdownStats.queueSize).toBeLessThanOrEqual(preShutdownStats.queueSize);
    });

    it('should recover from audit processing errors', async () => {
      // Create audit log that would cause processing issues
      await createAsyncAuditLog({
        userId: 'error-test-user',
        action: 'ERROR_SIMULATION',
        details: {
          // Create circular reference that could cause JSON.stringify issues
          circularRef: null as any,
          largeData: 'x'.repeat(10000)
        },
        success: true
      });

      // Set up circular reference
      const auditData = {
        userId: 'circular-ref-user',
        action: 'CIRCULAR_TEST',
        details: {} as any,
        success: true
      };
      auditData.details.self = auditData; // Circular reference

      try {
        await createAsyncAuditLog(auditData);
      } catch (error) {
        // Expected to handle gracefully
      }

      // System should continue processing other logs
      await createAsyncAuditLog({
        userId: 'recovery-test',
        action: 'POST_ERROR',
        details: { message: 'system should still work' },
        success: true
      });

      const stats = getAuditQueueStats();
      expect(stats.queueSize).toBeGreaterThan(0);
    });
  });

  describe('Budget Operation Error Scenarios', () => {
    it('should handle concurrent budget updates with user state changes', async () => {
      const userId = 'state-change-test-' + Date.now();
      
      // Simulate concurrent operations where user state might change
      const operations = [
        // Operation 1: Normal budget update
        updateUserBudgetWithLock(userId, 0.5, null, 2.0, { tier: 'PROFESSIONAL' }),
        
        // Operation 2: Another update (simulates concurrent access)
        updateUserBudgetWithLock(userId, 0.3, null, 2.0, { tier: 'PROFESSIONAL' }),
        
        // Operation 3: Update with different tier (simulates tier change)
        updateUserBudgetWithLock(userId, 0.2, null, 2.0, { tier: 'ENTERPRISE' })
      ];

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Concurrent Budget Updates:
        Successful: ${successful}
        Failed: ${failed}`);

      // At least some operations should succeed
      expect(successful).toBeGreaterThan(0);
    });

    it('should validate budget update input sanitization', () => {
      const invalidInputs = [
        { userId: '', cost: 0.5, budget: 1.0, limit: 2.0 },
        { userId: '   ', cost: 0.5, budget: 1.0, limit: 2.0 },
        { userId: 'valid', cost: NaN, budget: 1.0, limit: 2.0 },
        { userId: 'valid', cost: 0.5, budget: Infinity, limit: 2.0 },
        { userId: 'valid', cost: 0.5, budget: 1.0, limit: -1 }
      ];

      invalidInputs.forEach(async ({ userId, cost, budget, limit }) => {
        await expect(
          updateUserBudgetWithLock(userId, cost, budget, limit)
        ).rejects.toThrow();
      });
    });

    it('should handle budget limit edge cases', async () => {
      const userId = 'edge-case-test-' + Date.now();
      const limit = 1.0;

      // Test exact limit boundary
      const exactLimitResult = await expect(
        updateUserBudgetWithLock(userId, limit, 0, limit, { tier: 'FREE' })
      ).rejects.toThrow('Budget limit exceeded');

      // Test just under limit
      const underLimitResult = await updateUserBudgetWithLock(
        userId, 
        limit - 0.001, 
        null, 
        limit, 
        { tier: 'FREE', atomicBudgetRead: true }
      );
      expect(underLimitResult.success).toBe(true);
    });
  });

  describe('Transaction Manager Error Handling', () => {
    it('should handle transaction timeout scenarios', async () => {
      const result = await TransactionManager.executeTransaction(
        async (tx, context) => {
          // Simulate long-running operation
          await new Promise(resolve => setTimeout(resolve, 100));
          return { success: true, transactionId: context.id };
        },
        {
          timeout: 50, // Very short timeout to trigger timeout
          description: 'Timeout test transaction'
        }
      );

      // Should fail due to timeout but handle gracefully
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.transactionId).toBeDefined();
    });

    it('should retry transactions on retryable errors', async () => {
      let attempts = 0;
      
      const result = await TransactionManager.executeTransaction(
        async (tx, context) => {
          attempts++;
          if (attempts <= 2) {
            throw new MockPrismaClientKnownRequestError('P2034', 'Transaction conflict');
          }
          return { success: true, attempts };
        },
        {
          retryOnConflict: true,
          maxRetries: 3,
          description: 'Retry test transaction'
        }
      );

      expect(result.success).toBe(true);
      expect(result.data?.attempts).toBe(3);
      expect(result.retryCount).toBe(2);
    });

    it('should not retry on non-retryable errors', async () => {
      let attempts = 0;
      
      const result = await TransactionManager.executeTransaction(
        async (tx, context) => {
          attempts++;
          throw new Error('Business logic error'); // Non-retryable
        },
        {
          retryOnConflict: true,
          maxRetries: 3,
          description: 'Non-retryable error test'
        }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(1); // Should not retry
      expect(result.retryCount).toBeUndefined();
    });
  });

  describe('Error Isolation and Containment', () => {
    it('should isolate errors in batch operations', async () => {
      const items = [
        { id: 1, shouldFail: false },
        { id: 2, shouldFail: true },
        { id: 3, shouldFail: false },
        { id: 4, shouldFail: true },
        { id: 5, shouldFail: false }
      ];

      const results = await executeWithIsolation(
        items,
        async (item) => {
          if (item.shouldFail) {
            throw new Error(`Simulated failure for item ${item.id}`);
          }
          return { processed: true, id: item.id };
        },
        {
          continueOnError: true,
          maxConcurrency: 2
        }
      );

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      expect(successful.length).toBe(3); // Items 1, 3, 5
      expect(failed.length).toBe(2); // Items 2, 4
      
      // Verify successful items have correct results
      successful.forEach(result => {
        expect(result.result?.processed).toBe(true);
        expect(result.result?.id).toBeDefined();
      });
    });

    it('should stop on first error when configured', async () => {
      const items = [
        { id: 1, shouldFail: false },
        { id: 2, shouldFail: true },  // This will fail first
        { id: 3, shouldFail: false },
        { id: 4, shouldFail: false }
      ];

      const results = await executeWithIsolation(
        items,
        async (item) => {
          await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
          if (item.shouldFail) {
            throw new Error(`Failure for item ${item.id}`);
          }
          return { processed: true, id: item.id };
        },
        {
          continueOnError: false,
          maxConcurrency: 1 // Process sequentially to ensure order
        }
      );

      // Should process items until first failure
      const processedCount = results.length;
      expect(processedCount).toBeLessThanOrEqual(2); // Should stop at or before the failing item
    });
  });

  describe('Graceful Degradation', () => {
    it('should maintain core functionality when audit system fails', async () => {
      // Simulate audit system failure by filling queue beyond capacity
      const auditPromises = Array.from({ length: 12000 }, (_, i) => 
        createAsyncAuditLog({
          userId: `degradation-${i}`,
          action: 'SYSTEM_OVERLOAD',
          details: { index: i },
          success: true
        })
      );

      await Promise.all(auditPromises);

      // Core operations should still work despite audit overload
      const budgetResult = await updateUserBudgetWithLock(
        'degradation-test-user',
        0.25,
        null,
        1.0,
        { tier: 'FREE', enableAuditLogging: false, atomicBudgetRead: true }
      );

      expect(budgetResult.success).toBe(true);
      expect(budgetResult.newBudget).toBe(0.25);
    });

    it('should handle partial system failures gracefully', async () => {
      // Simulate various system components failing
      const operations = [
        // Cost validation (should work)
        () => validateCostUpdate(0.5, 'PROFESSIONAL'),
        
        // Optimistic locking (should work) 
        () => withOptimisticLocking(async () => ({ success: true })),
        
        // Error detection (should work)
        () => isConcurrencyError(new MockPrismaClientKnownRequestError('P2034', 'Conflict'))
      ];

      const results = await Promise.allSettled(
        operations.map(op => op())
      );

      // All core operations should succeed
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
        console.log(`Operation ${index} result:`, result.value);
      });
    });
  });
});