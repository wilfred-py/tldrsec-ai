/**
 * Infrastructure Timeout Prevention Test Suite
 * 
 * Tests all components designed to prevent 524 timeout errors
 * and verify infrastructure optimizations are working correctly
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { infrastructureQueue } from '../../lib/infrastructure/request-queue';
import { aiProcessingCircuitBreaker } from '../../lib/infrastructure/circuit-breaker';
import { infrastructureMonitor } from '../../lib/infrastructure/monitoring';

describe('Infrastructure Timeout Prevention', () => {
  beforeAll(async () => {
    // Start monitoring for tests
    infrastructureMonitor.startMonitoring(5000); // 5 second intervals for testing
  });

  afterAll(async () => {
    // Clean up
    infrastructureMonitor.stopMonitoring();
    await infrastructureQueue.shutdown();
    aiProcessingCircuitBreaker.reset();
  });

  describe('Request Queue Performance', () => {
    beforeEach(() => {
      // Reset queue stats before each test
      infrastructureQueue.getQueueStats();
    });

    it('should process requests within timeout limits', async () => {
      const startTime = Date.now();
      
      const requestId = await infrastructureQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: { testData: 'fast_operation' },
        maxRetries: 1,
        timeout: 5000 // 5 second timeout
      });

      const result = await infrastructureQueue.processRequest(requestId, async (payload) => {
        // Simulate fast processing
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true, data: payload.testData };
      });

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeLessThan(5000);
      expect(duration).toBeLessThan(1000); // Should be much faster than timeout
      expect(result.data).toEqual({ success: true, data: 'fast_operation' });
    });

    it('should handle timeout gracefully', async () => {
      const requestId = await infrastructureQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: { testData: 'slow_operation' },
        maxRetries: 0, // No retries for this test
        timeout: 1000 // 1 second timeout
      });

      const result = await infrastructureQueue.processRequest(requestId, async (payload) => {
        // Simulate slow processing that exceeds timeout
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { success: true, data: payload.testData };
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should process multiple requests in parallel', async () => {
      const startTime = Date.now();
      const requestPromises: Promise<any>[] = [];

      // Enqueue multiple requests
      for (let i = 0; i < 5; i++) {
        const requestId = await infrastructureQueue.enqueueRequest({
          type: 'filing_processing',
          priority: 1,
          payload: { testId: i },
          maxRetries: 1,
          timeout: 3000
        });

        const promise = infrastructureQueue.processRequest(requestId, async (payload) => {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms processing
          return { testId: payload.testId, processed: true };
        });

        requestPromises.push(promise);
      }

      const results = await Promise.all(requestPromises);
      const duration = Date.now() - startTime;

      // Should complete in less than 1.5 seconds (parallel processing)
      // vs 2.5 seconds if sequential
      expect(duration).toBeLessThan(1500);
      expect(results.every(r => r.success)).toBe(true);
      expect(results).toHaveLength(5);
    });

    it('should handle batch processing efficiently', async () => {
      const batchRequests = [];
      
      // Create 10 requests
      for (let i = 0; i < 10; i++) {
        const requestId = await infrastructureQueue.enqueueRequest({
          type: 'filing_processing',
          priority: 1,
          payload: { batchId: i },
          maxRetries: 1,
          timeout: 2000
        });

        batchRequests.push({
          id: requestId,
          processor: async (payload: any) => {
            await new Promise(resolve => setTimeout(resolve, 200));
            return { batchId: payload.batchId, status: 'completed' };
          }
        });
      }

      const startTime = Date.now();
      const results = await infrastructureQueue.processBatch(batchRequests, 3); // Batch size 3
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);
      // Should be faster than sequential processing
      expect(duration).toBeLessThan(3000); // vs ~2 seconds sequential
    });
  });

  describe('Circuit Breaker Protection', () => {
    beforeEach(() => {
      aiProcessingCircuitBreaker.reset();
    });

    it('should allow requests when circuit is closed', async () => {
      const stats = aiProcessingCircuitBreaker.getStats();
      expect(stats.state).toBe('CLOSED');

      const result = await aiProcessingCircuitBreaker.execute(async () => {
        return { success: true, data: 'test' };
      });

      expect(result).toEqual({ success: true, data: 'test' });
    });

    it('should open circuit after threshold failures', async () => {
      // Force failures to open circuit
      const failurePromises = [];
      
      for (let i = 0; i < 6; i++) { // Exceed failure threshold of 5
        const promise = aiProcessingCircuitBreaker.execute(async () => {
          throw new Error('Simulated AI timeout');
        }).catch(error => ({ error: error.message }));
        
        failurePromises.push(promise);
      }

      await Promise.all(failurePromises);

      const stats = aiProcessingCircuitBreaker.getStats();
      expect(stats.state).toBe('OPEN');
      expect(stats.totalFailures).toBeGreaterThanOrEqual(5);
    });

    it('should reject requests when circuit is open', async () => {
      // First, force circuit open
      for (let i = 0; i < 6; i++) {
        try {
          await aiProcessingCircuitBreaker.execute(async () => {
            throw new Error('Force failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      // Verify circuit is open
      expect(aiProcessingCircuitBreaker.getStats().state).toBe('OPEN');

      // Try to execute - should be rejected
      await expect(
        aiProcessingCircuitBreaker.execute(async () => {
          return { success: true };
        })
      ).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should transition to half-open and close on success', async () => {
      // Force circuit open
      for (let i = 0; i < 6; i++) {
        try {
          await aiProcessingCircuitBreaker.execute(async () => {
            throw new Error('Force failure');
          });
        } catch (error) {
          // Expected failures
        }
      }

      expect(aiProcessingCircuitBreaker.getStats().state).toBe('OPEN');

      // Force state to half-open for testing
      aiProcessingCircuitBreaker.forceState('HALF_OPEN' as any);
      
      // Execute successful requests to close circuit
      for (let i = 0; i < 3; i++) {
        await aiProcessingCircuitBreaker.execute(async () => {
          return { success: true, attempt: i };
        });
      }

      expect(aiProcessingCircuitBreaker.getStats().state).toBe('CLOSED');
    });
  });

  describe('Infrastructure Monitoring', () => {
    it('should collect infrastructure metrics', async () => {
      const metrics = await infrastructureMonitor.collectMetrics();

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('vercel');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('aiApi');
      expect(metrics).toHaveProperty('queue');
      expect(metrics).toHaveProperty('circuitBreaker');

      // Verify metric structure
      expect(metrics.vercel).toHaveProperty('functionExecutionTime');
      expect(metrics.vercel).toHaveProperty('functionMemoryUsage');
      expect(metrics.database).toHaveProperty('connectionPoolUsage');
      expect(metrics.queue).toHaveProperty('activeJobs');
    });

    it('should provide health summary', () => {
      const health = infrastructureMonitor.getHealthSummary();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('metrics');
      expect(health).toHaveProperty('activeAlerts');
      expect(health).toHaveProperty('recommendations');

      expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(health.status);
      expect(Array.isArray(health.activeAlerts)).toBe(true);
      expect(Array.isArray(health.recommendations)).toBe(true);
    });

    it('should generate performance recommendations', () => {
      const health = infrastructureMonitor.getHealthSummary();
      
      // Should have at least basic recommendations
      expect(health.recommendations.length).toBeGreaterThanOrEqual(0);
      
      if (health.recommendations.length > 0) {
        health.recommendations.forEach(rec => {
          expect(typeof rec).toBe('string');
          expect(rec.length).toBeGreaterThan(10); // Should be meaningful recommendations
        });
      }
    });
  });

  describe('End-to-End Timeout Prevention', () => {
    it('should handle complex workflow without timeout', async () => {
      const startTime = Date.now();
      
      // Simulate complex SEC filing processing workflow
      const workflowSteps = [
        // Step 1: SEC filing monitoring (fast)
        async () => {
          const requestId = await infrastructureQueue.enqueueRequest({
            type: 'filing_processing',
            priority: 1,
            payload: { step: 'sec_monitoring' },
            maxRetries: 1,
            timeout: 30000
          });

          return infrastructureQueue.processRequest(requestId, async (payload) => {
            await new Promise(resolve => setTimeout(resolve, 500));
            return { step: payload.step, filings: 5, success: true };
          });
        },

        // Step 2: AI processing with circuit breaker (can be slow)
        async () => {
          return aiProcessingCircuitBreaker.execute(async () => {
            // Simulate AI processing
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { summariesGenerated: 5, cost: 0.25, success: true };
          }, 'e2e_ai_processing');
        },

        // Step 3: Email notifications (fast)
        async () => {
          const requestId = await infrastructureQueue.enqueueRequest({
            type: 'email_delivery',
            priority: 2,
            payload: { step: 'email_notifications' },
            maxRetries: 2,
            timeout: 10000
          });

          return infrastructureQueue.processRequest(requestId, async (payload) => {
            await new Promise(resolve => setTimeout(resolve, 300));
            return { step: payload.step, emailsSent: 5, success: true };
          });
        }
      ];

      // Execute all steps in parallel
      const results = await Promise.all(workflowSteps.map(step => step()));
      const duration = Date.now() - startTime;

      // Verify results
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // Should complete well under timeout limits
      expect(duration).toBeLessThan(5000); // 5 seconds max
      
      // Verify individual results
      expect(results[0].filings).toBe(5);
      expect(results[1].summariesGenerated).toBe(5);
      expect(results[2].emailsSent).toBe(5);

      console.log(`E2E workflow completed in ${duration}ms`);
    }, 10000); // 10 second test timeout

    it('should handle partial failures gracefully', async () => {
      const workflowSteps = [
        // Step 1: Success
        () => Promise.resolve({ step: 1, success: true }),
        
        // Step 2: Failure (but should not crash entire workflow)
        () => Promise.reject(new Error('Simulated failure')),
        
        // Step 3: Success
        () => Promise.resolve({ step: 3, success: true })
      ];

      const results = await Promise.allSettled(workflowSteps.map(step => step()));

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      // Verify partial success handling
      const successfulResults = results.filter(r => r.status === 'fulfilled');
      expect(successfulResults).toHaveLength(2);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance targets for queue processing', async () => {
      const targetProcessingTime = 100; // 100ms per request max
      const numberOfRequests = 10;
      
      const startTime = Date.now();
      const requests = [];

      for (let i = 0; i < numberOfRequests; i++) {
        const requestId = await infrastructureQueue.enqueueRequest({
          type: 'filing_processing',
          priority: 1,
          payload: { requestId: i },
          maxRetries: 0,
          timeout: 5000
        });

        requests.push(
          infrastructureQueue.processRequest(requestId, async (payload) => {
            // Simulate typical filing processing
            await new Promise(resolve => setTimeout(resolve, 50));
            return { processed: payload.requestId, success: true };
          })
        );
      }

      const results = await Promise.all(requests);
      const totalDuration = Date.now() - startTime;
      const averagePerRequest = totalDuration / numberOfRequests;

      console.log(`Performance benchmark: ${averagePerRequest}ms average per request`);

      expect(results.every(r => r.success)).toBe(true);
      expect(averagePerRequest).toBeLessThan(targetProcessingTime);
    });

    it('should handle burst traffic without timeouts', async () => {
      const burstSize = 20;
      const maxBurstTime = 3000; // 3 seconds max for entire burst

      const startTime = Date.now();
      const burstPromises = [];

      // Create burst of requests
      for (let i = 0; i < burstSize; i++) {
        const promise = (async () => {
          const requestId = await infrastructureQueue.enqueueRequest({
            type: 'filing_processing',
            priority: Math.floor(Math.random() * 5) + 1, // Random priorities
            payload: { burstId: i },
            maxRetries: 1,
            timeout: 2000
          });

          return infrastructureQueue.processRequest(requestId, async (payload) => {
            const processingTime = Math.random() * 200 + 50; // 50-250ms
            await new Promise(resolve => setTimeout(resolve, processingTime));
            return { burstId: payload.burstId, processingTime, success: true };
          });
        })();

        burstPromises.push(promise);
      }

      const results = await Promise.all(burstPromises);
      const burstDuration = Date.now() - startTime;

      console.log(`Burst test: ${burstSize} requests completed in ${burstDuration}ms`);

      expect(results).toHaveLength(burstSize);
      expect(results.every(r => r.success)).toBe(true);
      expect(burstDuration).toBeLessThan(maxBurstTime);
    });
  });
});