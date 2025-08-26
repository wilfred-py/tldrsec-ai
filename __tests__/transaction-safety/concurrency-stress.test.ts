/**
 * Concurrency Stress Tests for Transaction Safety
 * 
 * Tests concurrent operations under high load to validate deadlock prevention
 * and data consistency under stress conditions.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  withOptimisticLocking, 
  isConcurrencyError, 
  calculateIntelligentBackoff,
  createOptimisticLockError,
  executeWithIsolation
} from '../../lib/db/concurrency';
import { updateUserBudgetWithLock } from '../../lib/db/budget-operations';
import { createAsyncAuditLog, clearAuditQueue, flushAuditQueue, getAuditQueueStats } from '../../lib/db/async-audit';
import { validateCostUpdate } from '../../lib/db/cost-validation';
import { getPrismaClient } from '../../lib/db/prisma';

const prisma = getPrismaClient();

// Mock PrismaClientKnownRequestError for testing
class MockPrismaClientKnownRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PrismaClientKnownRequestError';
  }
}

describe('Concurrency Stress Tests', () => {
  beforeEach(async () => {
    // Clear audit queue before each test
    clearAuditQueue();
    
    // Mock console methods to reduce test noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Flush and clear audit queue after each test
    await flushAuditQueue(5000);
    clearAuditQueue();
    
    // Restore console methods
    jest.restoreAllMocks();
  });

  describe('High Concurrency Budget Updates', () => {
    it('should handle 50+ concurrent budget updates without deadlocks', async () => {
      const concurrentOperations = 60;
      const userId = 'test-user-concurrent-' + Date.now();
      const tierLimit = 10.0;
      let currentBudget = 0;
      let successCount = 0;
      let conflictCount = 0;
      let errorCount = 0;

      // Create promises for concurrent operations
      const promises = Array.from({ length: concurrentOperations }, async (_, index) => {
        try {
          // Simulate concurrent budget updates with small costs
          const costToAdd = 0.1; // Small cost to allow many operations
          
          // Use atomic budget read to prevent optimistic lock conflicts initially
          const result = await updateUserBudgetWithLock(
            userId,
            costToAdd,
            null, // Use atomic read (null expected budget)
            tierLimit,
            {
              tier: 'PROFESSIONAL',
              enableAuditLogging: false, // Disable to focus on concurrency
              atomicBudgetRead: true,
              maxRetries: 8, // Higher retries for stress test
              baseDelay: 10, // Faster retries
              maxDelay: 500
            }
          );

          successCount++;
          return { success: true, result, operationIndex: index };
        } catch (error) {
          if (isConcurrencyError(error)) {
            conflictCount++;
            return { success: false, error: 'concurrency', operationIndex: index };
          } else {
            errorCount++;
            return { success: false, error: error instanceof Error ? error.message : 'unknown', operationIndex: index };
          }
        }
      });

      // Execute all promises and wait for completion
      const results = await Promise.allSettled(promises);
      
      // Analyze results
      const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const successful = fulfilled.filter(r => r.success).length;
      const conflicts = fulfilled.filter(r => !r.success && r.error === 'concurrency').length;
      const errors = fulfilled.filter(r => !r.success && r.error !== 'concurrency').length;

      console.log(`Concurrency Test Results:
        Total Operations: ${concurrentOperations}
        Successful: ${successful}
        Concurrency Conflicts: ${conflicts}
        Other Errors: ${errors}
        Success Rate: ${((successful / concurrentOperations) * 100).toFixed(1)}%`);

      // Validate results
      expect(successful).toBeGreaterThan(concurrentOperations * 0.8); // At least 80% success
      expect(conflicts).toBeLessThan(concurrentOperations * 0.3); // Less than 30% conflicts
      expect(errors).toBe(0); // No unexpected errors

      // Validate data consistency - check final budget matches successful operations
      try {
        const finalUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { budgetUsed: true }
        });
        
        if (finalUser) {
          const expectedBudget = successful * 0.1;
          const actualBudget = finalUser.budgetUsed || 0;
          
          // Allow small floating point differences
          expect(Math.abs(actualBudget - expectedBudget)).toBeLessThan(0.01);
        }
      } catch (userNotFoundError) {
        // Expected if no operations succeeded
        expect(successful).toBe(0);
      }
    }, 30000); // 30 second timeout

    it('should prevent budget manipulation under concurrent access', async () => {
      const userId = 'test-user-manipulation-' + Date.now();
      const tierLimit = 5.0;
      const concurrentOperations = 30;
      
      // Try to exceed budget through concurrent operations
      const promises = Array.from({ length: concurrentOperations }, async (_, index) => {
        try {
          const costToAdd = 0.5; // Each operation adds 0.5, total would be 15.0 (exceeds 5.0 limit)
          
          const result = await updateUserBudgetWithLock(
            userId,
            costToAdd,
            null, // Atomic read
            tierLimit,
            {
              tier: 'FREE',
              enableAuditLogging: false,
              atomicBudgetRead: true,
              maxRetries: 3
            }
          );

          return { success: true, result, index };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'unknown';
          return { 
            success: false, 
            error: errorMessage, 
            index,
            isBudgetLimit: errorMessage.includes('Budget limit exceeded'),
            isConcurrency: isConcurrencyError(error)
          };
        }
      });

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      
      const successful = fulfilled.filter(r => r.success);
      const budgetLimitErrors = fulfilled.filter(r => !r.success && r.isBudgetLimit);
      const concurrencyErrors = fulfilled.filter(r => !r.success && r.isConcurrency);

      console.log(`Budget Protection Test Results:
        Successful: ${successful.length}
        Budget Limit Errors: ${budgetLimitErrors.length}
        Concurrency Errors: ${concurrencyErrors.length}`);

      // Validate budget protection
      expect(successful.length).toBeLessThanOrEqual(10); // At most 10 operations should succeed (5.0 / 0.5)
      expect(budgetLimitErrors.length).toBeGreaterThan(0); // Should have budget limit errors

      // Validate final budget doesn't exceed limit
      try {
        const finalUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { budgetUsed: true }
        });
        
        if (finalUser) {
          expect(finalUser.budgetUsed).toBeLessThanOrEqual(tierLimit);
        }
      } catch (error) {
        // User might not exist if all operations failed
      }
    }, 20000);
  });

  describe('Audit Queue Stress Testing', () => {
    it('should handle high volume audit logging without memory exhaustion', async () => {
      const auditCount = 1000;
      const startTime = Date.now();

      // Generate high volume of audit logs
      const promises = Array.from({ length: auditCount }, async (_, index) => {
        await createAsyncAuditLog({
          userId: `user-${index % 10}`, // Distribute across 10 users
          action: 'STRESS_TEST',
          details: {
            operationIndex: index,
            timestamp: new Date().toISOString(),
            metadata: {
              testData: 'x'.repeat(100) // Add some bulk to test memory
            }
          },
          success: true,
          correlationId: `stress-${index}`
        });
      });

      await Promise.all(promises);
      const queueTime = Date.now() - startTime;

      // Check queue stats
      const stats = getAuditQueueStats();
      
      console.log(`Audit Queue Stress Test:
        Logs Queued: ${auditCount}
        Queue Time: ${queueTime}ms
        Current Queue Size: ${stats.queueSize}
        Processing Queue: ${stats.processingQueue}
        Success Rate: ${stats.successRate.toFixed(1)}%`);

      // Validate queue handling
      expect(stats.queueSize).toBeLessThanOrEqual(auditCount); // Queue shouldn't exceed input
      expect(stats.successRate).toBeGreaterThan(0); // Some processing should occur
      
      // Flush queue and validate completion
      await flushAuditQueue(10000); // 10 second timeout
      const finalStats = getAuditQueueStats();
      
      expect(finalStats.queueSize).toBeLessThan(stats.queueSize); // Should reduce
    }, 25000);

    it('should maintain audit queue integrity under concurrent stress', async () => {
      const concurrentUsers = 20;
      const operationsPerUser = 50;

      // Create concurrent audit operations from multiple users
      const userPromises = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
        const userId = `concurrent-user-${userIndex}`;
        const operations = Array.from({ length: operationsPerUser }, async (_, opIndex) => {
          await createAsyncAuditLog({
            userId,
            action: 'CONCURRENT_OPERATION',
            details: {
              userIndex,
              operationIndex: opIndex,
              timestamp: new Date().toISOString()
            },
            success: true,
            correlationId: `concurrent-${userIndex}-${opIndex}`
          });
        });
        
        return Promise.all(operations);
      });

      const startTime = Date.now();
      await Promise.all(userPromises);
      const totalTime = Date.now() - startTime;

      const totalOperations = concurrentUsers * operationsPerUser;
      const stats = getAuditQueueStats();

      console.log(`Concurrent Audit Test:
        Total Operations: ${totalOperations}
        Concurrent Users: ${concurrentUsers}
        Operations Per User: ${operationsPerUser}
        Total Time: ${totalTime}ms
        Queue Size: ${stats.queueSize}
        Avg Item Age: ${stats.oldestItemAge}ms`);

      // Validate concurrent handling
      expect(stats.queueSize).toBeLessThanOrEqual(totalOperations);
      expect(stats.oldestItemAge).toBeLessThan(60000); // No item older than 1 minute
    }, 30000);
  });

  describe('Cost Validation Under Load', () => {
    it('should maintain validation integrity under concurrent requests', async () => {
      const validationCount = 200;
      const validCosts = [0.1, 0.5, 1.0, 2.0];
      const invalidCosts = [-0.1, 0, 999, NaN, undefined as any];
      const tiers = ['FREE', 'PROFESSIONAL', 'ENTERPRISE', 'INSTITUTION'];

      // Mix valid and invalid costs
      const testCases = Array.from({ length: validationCount }, (_, index) => {
        const isValid = index % 3 !== 0; // 2/3 valid, 1/3 invalid
        const cost = isValid 
          ? validCosts[index % validCosts.length]
          : invalidCosts[index % invalidCosts.length];
        const tier = tiers[index % tiers.length];
        
        return { cost, tier, shouldBeValid: isValid, index };
      });

      // Execute concurrent validations
      const promises = testCases.map(async (testCase) => {
        try {
          const result = validateCostUpdate(testCase.cost, testCase.tier, {
            userId: `validation-user-${testCase.index}`,
            operation: 'concurrent-validation-test'
          });
          
          return {
            ...testCase,
            result,
            success: true
          };
        } catch (error) {
          return {
            ...testCase,
            result: null,
            success: false,
            error: error instanceof Error ? error.message : 'unknown'
          };
        }
      });

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);

      // Analyze validation consistency
      const validResults = fulfilled.filter(r => r.shouldBeValid);
      const invalidResults = fulfilled.filter(r => !r.shouldBeValid);

      const validSuccesses = validResults.filter(r => r.result?.valid).length;
      const invalidRejections = invalidResults.filter(r => !r.result?.valid || !r.result).length;

      console.log(`Cost Validation Stress Test:
        Total Validations: ${validationCount}
        Valid Inputs: ${validResults.length}
        Invalid Inputs: ${invalidResults.length}
        Valid Successes: ${validSuccesses}
        Invalid Rejections: ${invalidRejections}
        Accuracy: ${((validSuccesses + invalidRejections) / validationCount * 100).toFixed(1)}%`);

      // Validate accuracy
      expect(validSuccesses).toBeGreaterThan(validResults.length * 0.9); // 90%+ valid cases succeed
      expect(invalidRejections).toBeGreaterThan(invalidResults.length * 0.9); // 90%+ invalid cases rejected
    });
  });

  describe('Transaction Rollback Scenarios', () => {
    it('should properly rollback failed transactions under concurrent load', async () => {
      const userId = 'rollback-test-user-' + Date.now();
      const operations = 20;
      let rollbackCount = 0;
      let successCount = 0;

      const promises = Array.from({ length: operations }, async (_, index) => {
        try {
          // Simulate operations that may fail randomly
          const shouldFail = index % 4 === 0; // 1/4 operations fail
          
          const result = await withOptimisticLocking(async () => {
            if (shouldFail) {
              throw new Error(`Simulated failure for operation ${index}`);
            }
            
            // Simulate successful operation
            return { operationIndex: index, success: true };
          }, {
            maxRetries: 2,
            baseDelay: 50
          });

          successCount++;
          return { success: true, result, index };
        } catch (error) {
          rollbackCount++;
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'unknown',
            index
          };
        }
      });

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);

      const actualSuccesses = fulfilled.filter(r => r.success).length;
      const actualFailures = fulfilled.filter(r => !r.success).length;

      console.log(`Transaction Rollback Test:
        Operations: ${operations}
        Expected Failures: ${operations / 4}
        Actual Successes: ${actualSuccesses}
        Actual Failures: ${actualFailures}`);

      // Validate proper handling
      expect(actualFailures).toBeGreaterThan(operations * 0.2); // At least 20% failures
      expect(actualSuccesses).toBeGreaterThan(operations * 0.6); // At least 60% successes
    });
  });

  describe('Error Recovery Stress Testing', () => {
    it('should recover from various error conditions under load', async () => {
      const errorTypes = [
        () => new MockPrismaClientKnownRequestError('P2002', 'Unique constraint violation'),
        () => new MockPrismaClientKnownRequestError('P2034', 'Transaction conflict'),
        () => new MockPrismaClientKnownRequestError('P2025', 'Record not found'),
        () => new Error('Deadlock detected'),
        () => new Error('Connection timeout'),
        () => createOptimisticLockError('TestModel', 'test-id', 1, 2)
      ];

      const testOperations = 60;
      const results = {
        recovered: 0,
        failed: 0,
        retryAttempts: 0
      };

      const promises = Array.from({ length: testOperations }, async (_, index) => {
        const errorToThrow = errorTypes[index % errorTypes.length]();
        let attempts = 0;

        try {
          const result = await withOptimisticLocking(async () => {
            attempts++;
            
            // Fail on first 2 attempts, succeed on 3rd
            if (attempts <= 2) {
              throw errorToThrow;
            }
            
            return { recovered: true, attempts };
          }, {
            maxRetries: 5,
            baseDelay: 10,
            maxDelay: 100
          });

          results.recovered++;
          results.retryAttempts += attempts;
          return { success: true, attempts, errorType: errorToThrow.constructor.name };
        } catch (error) {
          results.failed++;
          results.retryAttempts += attempts;
          return { 
            success: false, 
            attempts, 
            errorType: errorToThrow.constructor.name,
            finalError: error instanceof Error ? error.message : 'unknown'
          };
        }
      });

      const testResults = await Promise.allSettled(promises);
      const fulfilled = testResults.filter(r => r.status === 'fulfilled').map(r => r.value);

      const recoveryRate = (results.recovered / testOperations) * 100;
      const avgRetries = results.retryAttempts / testOperations;

      console.log(`Error Recovery Stress Test:
        Total Operations: ${testOperations}
        Recovered: ${results.recovered}
        Failed: ${results.failed}
        Recovery Rate: ${recoveryRate.toFixed(1)}%
        Avg Retries: ${avgRetries.toFixed(1)}`);

      // Validate recovery capability
      expect(recoveryRate).toBeGreaterThan(70); // At least 70% recovery rate
      expect(avgRetries).toBeGreaterThan(2); // Should retry at least 2 times on average
      expect(avgRetries).toBeLessThan(4); // Shouldn't need excessive retries
    });
  });

  describe('Performance Benchmarks', () => {
    it('should maintain acceptable performance under concurrent load', async () => {
      const operations = 100;
      const startTime = process.hrtime.bigint();

      // Simple concurrent operations for performance measurement
      const promises = Array.from({ length: operations }, async (_, index) => {
        const opStart = process.hrtime.bigint();
        
        try {
          await withOptimisticLocking(async () => {
            // Simulate lightweight operation
            await new Promise(resolve => setTimeout(resolve, 1));
            return { index };
          }, {
            maxRetries: 3,
            baseDelay: 5
          });
          
          const opEnd = process.hrtime.bigint();
          return { 
            success: true, 
            duration: Number(opEnd - opStart) / 1000000, // Convert to milliseconds
            index 
          };
        } catch (error) {
          const opEnd = process.hrtime.bigint();
          return { 
            success: false, 
            duration: Number(opEnd - opStart) / 1000000,
            index,
            error: error instanceof Error ? error.message : 'unknown'
          };
        }
      });

      const results = await Promise.allSettled(promises);
      const endTime = process.hrtime.bigint();
      const totalTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const successful = fulfilled.filter(r => r.success);
      const avgOperationTime = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
      
      const operationsPerSecond = (operations / totalTime) * 1000;

      console.log(`Performance Benchmark:
        Operations: ${operations}
        Total Time: ${totalTime.toFixed(2)}ms
        Avg Operation Time: ${avgOperationTime.toFixed(2)}ms
        Operations/Second: ${operationsPerSecond.toFixed(2)}
        Success Rate: ${(successful.length / operations * 100).toFixed(1)}%`);

      // Performance assertions
      expect(operationsPerSecond).toBeGreaterThan(50); // At least 50 ops/second
      expect(avgOperationTime).toBeLessThan(100); // Less than 100ms per operation
      expect(successful.length / operations).toBeGreaterThan(0.9); // 90%+ success rate
    }, 15000);
  });
});