/**
 * Concurrency Stress Tests
 * 
 * Tests edge cases and failure modes in concurrent operations under stress
 * including database timeouts, connection pool exhaustion, and deadlocks.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  withOptimisticLocking,
  executeWithIsolation,
  updateTickerMonitoringWithLock,
  isConcurrencyError
} from '../../lib/db/concurrency';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Mock Prisma
jest.mock('../../lib/db/prisma', () => {
  const mockPrismaInstance = {
    tickerMonitoring: {
      findUnique: jest.fn(),
      update: jest.fn()
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

describe('Concurrency Stress Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Connection Pool Exhaustion', () => {
    it('should handle connection pool exhaustion gracefully', async () => {
      // Simulate connection pool exhaustion
      const poolExhaustedError = new Error('Connection pool exhausted');
      
      let attemptCount = 0;
      const mockOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw poolExhaustedError;
        }
        return Promise.resolve('success');
      });

      const result = await withOptimisticLocking(mockOperation, { 
        maxRetries: 3,
        baseDelay: 50 
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries on persistent connection issues', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Connection refused'));

      await expect(withOptimisticLocking(mockOperation, { 
        maxRetries: 3 
      })).rejects.toThrow('Connection refused');
      
      expect(mockOperation).toHaveBeenCalledTimes(1); // Non-concurrency error, no retries
    });
  });

  describe('Transaction Timeout Scenarios', () => {
    it('should handle transaction timeouts with proper retry backoff', async () => {
      const timeoutError = new PrismaClientKnownRequestError('Transaction timeout', {
        code: 'P2034',
        clientVersion: '5.0.0'
      });

      let attemptCount = 0;
      const mockOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw timeoutError;
        }
        return Promise.resolve('success after timeout');
      });

      const startTime = Date.now();
      const result = await withOptimisticLocking(mockOperation, { 
        maxRetries: 3,
        baseDelay: 100,
        backoffMultiplier: 2
      });
      const duration = Date.now() - startTime;

      expect(result).toBe('success after timeout');
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(duration).toBeGreaterThan(300); // Should include backoff delays
    });

    it('should handle nested transaction deadlocks', async () => {
      const deadlockError = new PrismaClientKnownRequestError('Deadlock detected', {
        code: 'P2034',
        clientVersion: '5.0.0'
      });

      let attemptCount = 0;
      const mockOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          throw deadlockError;
        }
        return Promise.resolve({ id: 'resolved', version: 1 });
      });

      const result = await withOptimisticLocking(mockOperation, { 
        maxRetries: 3 
      });

      expect(result).toEqual({ id: 'resolved', version: 1 });
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('High Concurrent Load Testing', () => {
    it('should handle 50 concurrent operations with isolation', async () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ id: i, value: i * 2 }));
      
      let operationCount = 0;
      const mockOperation = jest.fn().mockImplementation(async (item) => {
        operationCount++;
        
        // Simulate random processing time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        
        // Randomly fail some operations to test error isolation
        if (Math.random() < 0.1) { // 10% failure rate
          throw new Error(`Random failure for item ${item.id}`);
        }
        
        return item.value;
      });

      const results = await executeWithIsolation(items, mockOperation, {
        maxConcurrency: 10,
        continueOnError: true
      });

      expect(results).toHaveLength(50);
      expect(mockOperation).toHaveBeenCalledTimes(50);
      
      const successResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      
      expect(successResults.length).toBeGreaterThan(40); // Should have mostly successes
      expect(failedResults.length).toBeLessThan(10);
      
      // Verify all items were processed
      expect(results.map(r => r.item.id).sort()).toEqual(
        Array.from({ length: 50 }, (_, i) => i)
      );
    });

    it('should respect concurrency limits under stress', async () => {
      const items = Array.from({ length: 20 }, (_, i) => i);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const mockOperation = jest.fn().mockImplementation(async (item) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 50));
        
        currentConcurrent--;
        return item * 2;
      });

      await executeWithIsolation(items, mockOperation, {
        maxConcurrency: 5,
        continueOnError: true
      });

      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(mockOperation).toHaveBeenCalledTimes(20);
    });
  });

  describe('Memory Pressure Under Concurrency', () => {
    it('should handle large data processing with memory constraints', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(1000) // 1KB per item
      }));

      const mockOperation = jest.fn().mockImplementation(async (item) => {
        // Simulate memory-intensive processing
        const processedData = item.data.repeat(5); // 5KB processed data
        
        // Add some random delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
        
        return { id: item.id, processed: processedData.length };
      });

      const initialMemory = process.memoryUsage();
      
      const results = await executeWithIsolation(items, mockOperation, {
        maxConcurrency: 10,
        continueOnError: true
      });
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(results).toHaveLength(100);
      expect(results.every(r => r.success)).toBe(true);
      
      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Version Conflict Storm', () => {
    it('should handle rapid version conflicts on popular records', async () => {
      const getPrismaClient = (await import('../../lib/db/prisma')).getPrismaClient;
      const mockPrisma = getPrismaClient();

      // Simulate version conflicts on a popular ticker
      let versionConflictCount = 0;
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          tickerMonitoring: {
            findUnique: jest.fn().mockResolvedValue({
              version: 5 + versionConflictCount // Version keeps changing
            }),
            update: jest.fn().mockImplementation(() => {
              versionConflictCount++;
              if (versionConflictCount <= 3) {
                // Simulate version conflict
                throw new PrismaClientKnownRequestError('Record not found', {
                  code: 'P2025',
                  clientVersion: '5.0.0'
                });
              }
              return { id: 'ticker-1', version: 5 + versionConflictCount };
            })
          }
        };
        
        return await callback(mockTx);
      });

      const result = await updateTickerMonitoringWithLock(
        'popular-ticker',
        { subscriberCount: 100 },
        { maxRetries: 5, baseDelay: 10 }
      );

      expect(result).toEqual({ id: 'ticker-1', version: 9 });
      expect(versionConflictCount).toBe(4); // 3 conflicts + 1 success
    });

    it('should eventually fail after max retries on persistent conflicts', async () => {
      const getPrismaClient = (await import('../../lib/db/prisma')).getPrismaClient;
      const mockPrisma = getPrismaClient();

      // Always throw version conflicts
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          tickerMonitoring: {
            findUnique: jest.fn().mockResolvedValue({ version: 1 }),
            update: jest.fn().mockRejectedValue(
              new PrismaClientKnownRequestError('Record not found', {
                code: 'P2025',
                clientVersion: '5.0.0'
              })
            )
          }
        };
        
        return await callback(mockTx);
      });

      await expect(updateTickerMonitoringWithLock(
        'conflicted-ticker',
        { subscriberCount: 50 },
        { maxRetries: 3, baseDelay: 10 }
      )).rejects.toThrow('Record not found');
    });
  });

  describe('Edge Case Error Classifications', () => {
    it('should correctly identify various Prisma errors as concurrency errors', () => {
      const errors = [
        new PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0'
        }),
        new PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.0.0'
        }),
        new PrismaClientKnownRequestError('Transaction failed', {
          code: 'P2034',
          clientVersion: '5.0.0'
        }),
        { code: 'OPTIMISTIC_LOCK_FAILED', model: 'User', id: '123' }
      ];

      errors.forEach(error => {
        expect(isConcurrencyError(error)).toBe(true);
      });
    });

    it('should not classify other errors as concurrency errors', () => {
      const errors = [
        new Error('Network timeout'),
        new PrismaClientKnownRequestError('Invalid input', {
          code: 'P2006',
          clientVersion: '5.0.0'
        }),
        { message: 'Some other error' },
        null,
        undefined
      ];

      errors.forEach(error => {
        expect(isConcurrencyError(error)).toBe(false);
      });
    });
  });

  describe('Jitter and Backoff Under Load', () => {
    it('should add appropriate jitter to prevent thundering herd', async () => {
      const attempts: number[] = [];
      
      const mockOperation = jest.fn().mockImplementation(() => {
        attempts.push(Date.now());
        if (attempts.length <= 3) {
          throw new PrismaClientKnownRequestError('Conflict', {
            code: 'P2025',
            clientVersion: '5.0.0'
          });
        }
        return Promise.resolve('success');
      });

      await withOptimisticLocking(mockOperation, {
        maxRetries: 4,
        baseDelay: 100,
        jitterMs: 50
      });

      expect(attempts).toHaveLength(4);
      
      // Check that delays between attempts vary (due to jitter)
      const delays = attempts.slice(1).map((time, i) => time - attempts[i]);
      const hasJitter = delays.some((delay, i, arr) => 
        Math.abs(delay - arr[0]) > 10
      );
      
      expect(hasJitter).toBe(true);
    });

    it('should respect maximum delay limits', async () => {
      const attempts: number[] = [];
      
      const mockOperation = jest.fn().mockImplementation(() => {
        attempts.push(Date.now());
        if (attempts.length <= 5) {
          throw new PrismaClientKnownRequestError('Conflict', {
            code: 'P2025',
            clientVersion: '5.0.0'
          });
        }
        return Promise.resolve('success');
      });

      const startTime = Date.now();
      await withOptimisticLocking(mockOperation, {
        maxRetries: 6,
        baseDelay: 100,
        backoffMultiplier: 2,
        maxDelay: 500, // Cap delays at 500ms
        jitterMs: 100
      });
      const duration = Date.now() - startTime;

      expect(attempts).toHaveLength(6);
      
      // Duration should not exceed max possible time with capped delays
      // 5 retries * (500ms max + 100ms jitter max) = 3000ms max
      expect(duration).toBeLessThan(4000);
    });
  });

  describe('Resource Cleanup Under Failure', () => {
    it('should maintain operation isolation when some operations fail', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const processedItems: number[] = [];

      const mockOperation = jest.fn().mockImplementation(async (item) => {
        processedItems.push(item.id);
        
        if (item.id === 3 || item.id === 7) {
          throw new Error(`Processing failed for item ${item.id}`);
        }
        
        return `processed-${item.id}`;
      });

      const results = await executeWithIsolation(items, mockOperation, {
        maxConcurrency: 3,
        continueOnError: true
      });

      expect(results).toHaveLength(10);
      expect(processedItems).toHaveLength(10); // All items attempted
      
      const successResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      
      expect(successResults).toHaveLength(8);
      expect(failedResults).toHaveLength(2);
      
      // Failed items should be 3 and 7
      expect(failedResults.map(r => r.item.id).sort()).toEqual([3, 7]);
    });

    it('should stop processing on first error when continueOnError is false', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const processedItems: number[] = [];

      const mockOperation = jest.fn().mockImplementation(async (item) => {
        processedItems.push(item.id);
        
        if (item.id === 2) {
          throw new Error(`Critical failure for item ${item.id}`);
        }
        
        return `processed-${item.id}`;
      });

      const results = await executeWithIsolation(items, mockOperation, {
        maxConcurrency: 1, // Sequential to ensure order
        continueOnError: false
      });

      // Should process items 0, 1, 2 (fails) and stop
      expect(processedItems.length).toBeLessThanOrEqual(5); // Allow for some concurrent processing
      expect(results.some(r => !r.success)).toBe(true);
    });
  });
});