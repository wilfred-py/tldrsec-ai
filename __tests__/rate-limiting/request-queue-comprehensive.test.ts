/**
 * Comprehensive Request Queue Testing Suite
 * 
 * Tests queue behavior, priority handling, timeout protection,
 * retry mechanisms, and batch processing functionality.
 */

import { 
  InfrastructureRequestQueue, 
  QueuedRequest, 
  ProcessingResult 
} from '../../lib/infrastructure/request-queue';

describe('Request Queue Comprehensive Tests', () => {
  let requestQueue: InfrastructureRequestQueue;

  beforeEach(() => {
    requestQueue = new InfrastructureRequestQueue();
  });

  afterEach(async () => {
    await requestQueue.shutdown();
  });

  describe('Queue Management and Priority Handling', () => {
    test('should enqueue requests and return unique IDs', async () => {
      const requestId1 = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: { test: 'data1' },
        maxRetries: 3,
        timeout: 5000
      });

      const requestId2 = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 2,
        payload: { test: 'data2' },
        maxRetries: 3,
        timeout: 5000
      });

      expect(requestId1).toBeDefined();
      expect(requestId2).toBeDefined();
      expect(requestId1).not.toBe(requestId2);
    });

    test('should process high priority requests first', async () => {
      const results: string[] = [];
      
      // Enqueue requests with different priorities
      const lowPriorityId = await requestQueue.enqueueRequest({
        type: 'email_delivery',
        priority: 5,
        payload: 'low-priority',
        maxRetries: 3,
        timeout: 1000
      });

      const highPriorityId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'high-priority',
        maxRetries: 3,
        timeout: 1000
      });

      const mediumPriorityId = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 3,
        payload: 'medium-priority',
        maxRetries: 3,
        timeout: 1000
      });

      // Process requests and track order
      const processors = [
        { id: lowPriorityId, processor: async (payload: unknown) => { results.push(payload as string); return payload; } },
        { id: highPriorityId, processor: async (payload: unknown) => { results.push(payload as string); return payload; } },
        { id: mediumPriorityId, processor: async (payload: unknown) => { results.push(payload as string); return payload; } }
      ];

      const processingResults = await requestQueue.processBatch(processors, 1);

      expect(results[0]).toBe('high-priority');
      expect(results[1]).toBe('medium-priority');
      expect(results[2]).toBe('low-priority');
    });

    test('should handle queue statistics correctly', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'test',
        maxRetries: 3,
        timeout: 5000
      });

      const stats = requestQueue.getQueueStats();
      expect(stats.activeRequests).toBe(1);
    });
  });

  describe('Timeout Protection', () => {
    test('should timeout requests that exceed timeout limit', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'timeout-test',
        maxRetries: 0, // No retries for this test
        timeout: 100 // Very short timeout
      });

      const slowProcessor = async () => {
        await new Promise(resolve => setTimeout(resolve, 200)); // Longer than timeout
        return 'should not complete';
      };

      const result = await requestQueue.processRequest(requestId, slowProcessor);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should complete requests within timeout limit', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'fast-test',
        maxRetries: 3,
        timeout: 1000 // Generous timeout
      });

      const fastProcessor = async (payload: unknown) => {
        await new Promise(resolve => setTimeout(resolve, 50)); // Quick operation
        return `processed-${payload}`;
      };

      const result = await requestQueue.processRequest(requestId, fastProcessor);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('processed-fast-test');
    });
  });

  describe('Retry Mechanisms and Exponential Backoff', () => {
    test('should retry failed requests up to maxRetries', async () => {
      let attemptCount = 0;
      
      const requestId = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'retry-test',
        maxRetries: 3,
        timeout: 1000
      });

      const flakyProcessor = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return 'success-after-retries';
      };

      const result = await requestQueue.processRequest(requestId, flakyProcessor);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success-after-retries');
      expect(result.retryCount).toBe(2); // 2 retries before success
      expect(attemptCount).toBe(3); // 1 initial + 2 retries
    });

    test('should fail after exceeding maxRetries', async () => {
      let attemptCount = 0;
      
      const requestId = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'max-retry-test',
        maxRetries: 2,
        timeout: 1000
      });

      const alwaysFailProcessor = async () => {
        attemptCount++;
        throw new Error('Persistent failure');
      };

      const result = await requestQueue.processRequest(requestId, alwaysFailProcessor);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Persistent failure');
      expect(result.retryCount).toBe(2); // Maximum retries reached
      expect(attemptCount).toBe(3); // 1 initial + 2 retries
    });

    test('should not retry timeout errors', async () => {
      let attemptCount = 0;
      
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'timeout-no-retry',
        maxRetries: 3,
        timeout: 100
      });

      const timeoutProcessor = async () => {
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, 200)); // Always timeout
        return 'should not complete';
      };

      const result = await requestQueue.processRequest(requestId, timeoutProcessor);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(attemptCount).toBe(1); // No retries for timeout errors
    });

    test('should implement exponential backoff between retries', async () => {
      const retryTimes: number[] = [];
      let attemptCount = 0;
      
      const requestId = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'backoff-test',
        maxRetries: 3,
        timeout: 5000
      });

      const trackingProcessor = async () => {
        attemptCount++;
        retryTimes.push(Date.now());
        
        if (attemptCount < 3) {
          throw new Error('Retry needed');
        }
        return 'success';
      };

      const startTime = Date.now();
      const result = await requestQueue.processRequest(requestId, trackingProcessor);
      
      expect(result.success).toBe(true);
      expect(retryTimes.length).toBe(3);
      
      // Check that delays increase exponentially (approximately)
      if (retryTimes.length >= 2) {
        const delay1 = retryTimes[1] - retryTimes[0];
        const delay2 = retryTimes[2] - retryTimes[1];
        expect(delay2).toBeGreaterThan(delay1);
      }
    }, 10000);
  });

  describe('Batch Processing', () => {
    test('should process batches of requests in parallel', async () => {
      const requestIds: string[] = [];
      const processors: Array<{ id: string; processor: (payload: unknown) => Promise<string> }> = [];

      // Enqueue multiple requests
      for (let i = 0; i < 5; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'filing_processing',
          priority: 1,
          payload: `batch-item-${i}`,
          maxRetries: 3,
          timeout: 2000
        });
        
        requestIds.push(requestId);
        processors.push({
          id: requestId,
          processor: async (payload: unknown) => {
            await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
            return `processed-${payload}`;
          }
        });
      }

      const startTime = Date.now();
      const results = await requestQueue.processBatch(processors, 3); // Batch size 3
      const endTime = Date.now();

      expect(results.length).toBe(5);
      expect(results.every(r => r.success)).toBe(true);
      
      // Parallel processing should be faster than sequential
      expect(endTime - startTime).toBeLessThan(1000); // Should be much less than 5 * 100ms
    });

    test('should handle batch processing with different batch sizes', async () => {
      const requestIds: string[] = [];
      const processors: Array<{ id: string; processor: (payload: unknown) => Promise<string> }> = [];

      // Enqueue 7 requests
      for (let i = 0; i < 7; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'email_delivery',
          priority: 1,
          payload: `batch-${i}`,
          maxRetries: 3,
          timeout: 1000
        });
        
        requestIds.push(requestId);
        processors.push({
          id: requestId,
          processor: async (payload: unknown) => `processed-${payload}`
        });
      }

      const results = await requestQueue.processBatch(processors, 3); // Batch size 3 (3+3+1)

      expect(results.length).toBe(7);
      expect(results.every(r => r.success)).toBe(true);
    });

    test('should handle mixed success and failure in batch processing', async () => {
      const processors: Array<{ id: string; processor: (payload: unknown) => Promise<string> }> = [];

      // Create mix of successful and failing requests
      for (let i = 0; i < 3; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'ai_summarization',
          priority: 1,
          payload: `item-${i}`,
          maxRetries: 0, // No retries to speed up test
          timeout: 1000
        });
        
        processors.push({
          id: requestId,
          processor: async (payload: unknown) => {
            if ((payload as string).includes('1')) {
              throw new Error('Test failure');
            }
            return `processed-${payload}`;
          }
        });
      }

      const results = await requestQueue.processBatch(processors, 2);

      expect(results.length).toBe(3);
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBe(2); // item-0 and item-2
      expect(failureCount).toBe(1); // item-1
    });
  });

  describe('Concurrent Operations and Resource Management', () => {
    test('should handle high concurrency without resource exhaustion', async () => {
      const concurrentRequests = 20;
      const processors: Array<{ id: string; processor: (payload: unknown) => Promise<string> }> = [];

      // Enqueue many concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'filing_processing',
          priority: Math.floor(Math.random() * 5) + 1, // Random priority
          payload: `concurrent-${i}`,
          maxRetries: 2,
          timeout: 2000
        });
        
        processors.push({
          id: requestId,
          processor: async (payload: unknown) => {
            // Simulate variable processing time
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            return `processed-${payload}`;
          }
        });
      }

      const results = await requestQueue.processBatch(processors, 10);

      expect(results.length).toBe(concurrentRequests);
      expect(results.every(r => r.success)).toBe(true);
    });

    test('should prevent deadlocks in concurrent processing', async () => {
      const requestCount = 10;
      const processors: Array<{ id: string; processor: (payload: unknown) => Promise<string> }> = [];

      // Create requests that simulate resource contention
      for (let i = 0; i < requestCount; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'ai_summarization',
          priority: 1,
          payload: `deadlock-test-${i}`,
          maxRetries: 1,
          timeout: 3000
        });
        
        processors.push({
          id: requestId,
          processor: async (payload: unknown) => {
            // Simulate some shared resource access
            await new Promise(resolve => setTimeout(resolve, 50));
            return `processed-${payload}`;
          }
        });
      }

      const startTime = Date.now();
      const results = await requestQueue.processBatch(processors, 5);
      const endTime = Date.now();

      expect(results.length).toBe(requestCount);
      expect(results.every(r => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete reasonably quickly
    });
  });

  describe('Memory Management and Resource Cleanup', () => {
    test('should clean up completed requests', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'cleanup-test',
        maxRetries: 3,
        timeout: 1000
      });

      const processor = async (payload: unknown) => `processed-${payload}`;
      
      const initialStats = requestQueue.getQueueStats();
      expect(initialStats.activeRequests).toBe(1);

      await requestQueue.processRequest(requestId, processor);
      
      const finalStats = requestQueue.getQueueStats();
      expect(finalStats.activeRequests).toBe(0);
    });

    test('should clean up failed requests', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'fail-cleanup-test',
        maxRetries: 0,
        timeout: 1000
      });

      const failingProcessor = async () => {
        throw new Error('Test failure');
      };
      
      const initialStats = requestQueue.getQueueStats();
      expect(initialStats.activeRequests).toBe(1);

      await requestQueue.processRequest(requestId, failingProcessor);
      
      const finalStats = requestQueue.getQueueStats();
      expect(finalStats.activeRequests).toBe(0);
    });

    test('should handle shutdown gracefully', async () => {
      // Add some requests
      for (let i = 0; i < 3; i++) {
        await requestQueue.enqueueRequest({
          type: 'email_delivery',
          priority: 1,
          payload: `shutdown-test-${i}`,
          maxRetries: 3,
          timeout: 1000
        });
      }

      const stats = requestQueue.getQueueStats();
      expect(stats.activeRequests).toBe(3);

      // Shutdown should complete without errors
      await expect(requestQueue.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle processor that throws non-Error objects', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'non-error-test',
        maxRetries: 0,
        timeout: 1000
      });

      const badProcessor = async () => {
        throw 'string error'; // Non-Error object
      };

      const result = await requestQueue.processRequest(requestId, badProcessor);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('string error');
    });

    test('should handle processor that returns undefined', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'undefined-test',
        maxRetries: 3,
        timeout: 1000
      });

      const undefinedProcessor = async () => {
        return undefined;
      };

      const result = await requestQueue.processRequest(requestId, undefinedProcessor);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    test('should handle processing non-existent request ID', async () => {
      const fakeRequestId = 'non-existent-id';
      const processor = async (payload: unknown) => 'should not execute';

      await expect(
        requestQueue.processRequest(fakeRequestId, processor)
      ).rejects.toThrow('Request non-existent-id not found in queue');
    });

    test('should handle empty batch processing', async () => {
      const results = await requestQueue.processBatch([], 5);
      expect(results).toEqual([]);
    });

    test('should handle batch processing with zero batch size', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'zero-batch-test',
        maxRetries: 3,
        timeout: 1000
      });

      const processor = async (payload: unknown) => `processed-${payload}`;

      // Should handle gracefully even with batch size 0
      const results = await requestQueue.processBatch([{ id: requestId, processor }], 0);
      expect(results.length).toBe(1);
    });
  });

  describe('Performance and Monitoring', () => {
    test('should track execution times accurately', async () => {
      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'timing-test',
        maxRetries: 3,
        timeout: 2000
      });

      const delayedProcessor = async (payload: unknown) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return `processed-${payload}`;
      };

      const result = await requestQueue.processRequest(requestId, delayedProcessor);
      
      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(100);
      expect(result.executionTime).toBeLessThan(200); // Should be reasonably close
    });

    test('should provide queue statistics for monitoring', async () => {
      const stats = requestQueue.getQueueStats();
      
      expect(stats).toHaveProperty('activeRequests');
      expect(stats).toHaveProperty('queuedJobs');
      expect(stats).toHaveProperty('runningJobs');
      expect(stats).toHaveProperty('pendingJobs');
      expect(stats).toHaveProperty('done');
      expect(stats).toHaveProperty('failed');
    });
  });
});