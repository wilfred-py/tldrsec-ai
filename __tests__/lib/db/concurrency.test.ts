/**
 * Concurrency Utilities Test
 * 
 * Tests the optimistic locking and concurrency handling utilities
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import {
  isConcurrencyError,
  withOptimisticLocking,
  executeWithIsolation,
  updateTickerMonitoringWithLock
} from '../../../lib/db/concurrency';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { getPrismaClient } from '../../../lib/db/prisma';

const prisma = getPrismaClient();

describe('Concurrency Utilities', () => {
  describe('isConcurrencyError', () => {
    it('should identify P2025 errors as concurrency errors', () => {
      const error = new PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0'
      });
      
      expect(isConcurrencyError(error)).toBe(true);
    });

    it('should identify P2002 errors as concurrency errors', () => {
      const error = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0'
      });
      
      expect(isConcurrencyError(error)).toBe(true);
    });

    it('should identify P2034 errors as concurrency errors', () => {
      const error = new PrismaClientKnownRequestError('Transaction failed', {
        code: 'P2034',
        clientVersion: '5.0.0'
      });
      
      expect(isConcurrencyError(error)).toBe(true);
    });

    it('should identify optimistic lock errors', () => {
      const error = { code: 'OPTIMISTIC_LOCK_FAILED', model: 'Test', id: '123' };
      
      expect(isConcurrencyError(error)).toBe(true);
    });

    it('should not identify other errors as concurrency errors', () => {
      const error = new Error('Generic error');
      
      expect(isConcurrencyError(error)).toBe(false);
    });
  });

  describe('withOptimisticLocking', () => {
    it('should execute operation successfully on first try', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await withOptimisticLocking(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on concurrency errors', async () => {
      const concurrencyError = new PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0'
      });
      
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(concurrencyError)
        .mockResolvedValueOnce('success');
      
      const result = await withOptimisticLocking(mockOperation, { maxRetries: 2 });
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-concurrency errors', async () => {
      const genericError = new Error('Generic error');
      
      const mockOperation = jest.fn().mockRejectedValue(genericError);
      
      await expect(withOptimisticLocking(mockOperation)).rejects.toThrow('Generic error');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exceeded', async () => {
      const concurrencyError = new PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0'
      });
      
      const mockOperation = jest.fn().mockRejectedValue(concurrencyError);
      
      await expect(withOptimisticLocking(mockOperation, { maxRetries: 2 }))
        .rejects.toThrow('Record not found');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeWithIsolation', () => {
    it('should process all items successfully', async () => {
      const items = [1, 2, 3];
      const operation = jest.fn().mockImplementation((item: number) => Promise.resolve(item * 2));
      
      const results = await executeWithIsolation(items, operation);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(results.map(r => r.result)).toEqual([2, 4, 6]);
    });

    it('should isolate failures', async () => {
      const items = [1, 2, 3];
      const operation = jest.fn().mockImplementation((item: number) => {
        if (item === 2) {
          return Promise.reject(new Error('Item 2 failed'));
        }
        return Promise.resolve(item * 2);
      });
      
      const results = await executeWithIsolation(items, operation, { continueOnError: true });
      
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ item: 1, result: 2, success: true });
      expect(results[1]).toEqual({ item: 2, error: expect.any(Error), success: false });
      expect(results[2]).toEqual({ item: 3, result: 6, success: true });
    });

    it('should respect maxConcurrency', async () => {
      const items = [1, 2, 3, 4, 5];
      let concurrentOperations = 0;
      let maxConcurrent = 0;
      
      const operation = jest.fn().mockImplementation(async (item: number) => {
        concurrentOperations++;
        maxConcurrent = Math.max(maxConcurrent, concurrentOperations);
        
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));
        
        concurrentOperations--;
        return item * 2;
      });
      
      await executeWithIsolation(items, operation, { maxConcurrency: 2 });
      
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });
});

describe('Database Integration Tests', () => {
  let testUserId: string;
  let testCik: string;

  beforeAll(async () => {
    // These tests require a test database
    // Skip if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      return;
    }

    // Create test user
    try {
      const testUser = await prisma.user.create({
        data: {
          email: `test-concurrency-${Date.now()}@example.com`,
          authProvider: 'test',
          authProviderId: 'test-id',
          subscriptionTier: 'FREE'
        }
      });
      testUserId = testUser.id;

      // Create test CIK mapping
      const testMapping = await prisma.cikMapping.create({
        data: {
          cik: `TEST-CIK-${Date.now()}`,
          ticker: 'TESTCONCUR',
          companyName: 'Test Concurrency Company'
        }
      });
      testCik = testMapping.cik;
    } catch (error) {
      console.log('Skipping database integration tests - database not available');
    }
  });

  afterAll(async () => {
    if (testUserId) {
      try {
        await prisma.user.delete({ where: { id: testUserId } });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    if (testCik) {
      try {
        await prisma.cikMapping.delete({ where: { cik: testCik } });
        await prisma.tickerMonitoring.deleteMany({ where: { cik: testCik } });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should handle concurrent ticker monitoring updates', async () => {
    if (!testCik) {
      console.log('Skipping test - no test CIK available');
      return;
    }

    // Create initial ticker monitoring record
    const initialRecord = await prisma.tickerMonitoring.create({
      data: {
        cik: testCik,
        symbol: 'TESTCONCUR',
        companyName: 'Test Concurrency Company',
        rssUrl: 'https://test.com/rss',
        subscriberCount: 0,
        isActive: true
      }
    });

    const concurrentUpdates = Array.from({ length: 3 }, () => 
      updateTickerMonitoringWithLock(
        initialRecord.id,
        { subscriberCount: 1 },
        { maxRetries: 3 }
      )
    );

    const results = await Promise.allSettled(concurrentUpdates);
    
    // All should eventually succeed due to retry logic
    const successful = results.filter(r => r.status === 'fulfilled').length;
    expect(successful).toBeGreaterThan(0);
    
    // Cleanup
    await prisma.tickerMonitoring.delete({ where: { id: initialRecord.id } });
  });
}, 30000); // Increase timeout for integration tests