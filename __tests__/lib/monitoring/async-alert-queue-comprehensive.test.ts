/**
 * Comprehensive AsyncAlertQueue Test Suite
 * 
 * Tests the async alert queue system with batching, circuit breaker,
 * performance optimization, and error handling.
 */

import { jest } from '@jest/globals';
import { secureTestUtils } from '../../utils/secure-test-utils';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');

// We'll test the actual async alert queue implementation
const { AsyncAlertQueue } = jest.requireActual('../../../lib/monitoring/async-alert-queue');

describe('AsyncAlertQueue Comprehensive Tests', () => {
  let mockPrisma: any;
  let asyncAlertQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup Prisma mock
    mockPrisma = secureTestUtils.getMocks().prisma;
    require('../../../lib/db/prisma').getPrismaClient = jest.fn().mockReturnValue(mockPrisma);
    
    // Create fresh AsyncAlertQueue instance for each test
    asyncAlertQueue = AsyncAlertQueue.getInstance();
    
    // Reset the singleton for testing
    (AsyncAlertQueue as any).instance = undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
    secureTestUtils.restoreEnvironment();
  });

  describe('Singleton Pattern and Initialization', () => {
    it('should implement singleton pattern correctly', () => {
      const instance1 = AsyncAlertQueue.getInstance();
      const instance2 = AsyncAlertQueue.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(AsyncAlertQueue);
    });

    it('should initialize with default configuration', () => {
      const instance = AsyncAlertQueue.getInstance();
      const stats = instance.getQueueStats();
      
      expect(stats).toEqual({
        queueSize: 0,
        isProcessing: false,
        circuitBreakerOpen: false,
        consecutiveFailures: 0
      });
    });

    it('should respect environment configuration', () => {
      // Test with custom environment variables
      process.env.ALERT_BATCH_SIZE = '25';
      process.env.ALERT_FLUSH_INTERVAL = '2000';
      
      const instance = new (AsyncAlertQueue as any)();
      
      // Access private config for testing
      const config = (instance as any).config;
      expect(config.maxBatchSize).toBe(25);
      expect(config.flushIntervalMs).toBe(2000);
      
      // Cleanup
      delete process.env.ALERT_BATCH_SIZE;
      delete process.env.ALERT_FLUSH_INTERVAL;
    });
  });

  describe('Alert Queueing Operations', () => {
    it('should queue alerts successfully', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      const alertData = {
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test alert message',
        details: { error: 'Test error' },
        jobName: 'test-job',
        environment: 'test'
      };

      await instance.queueAlert(alertData);
      
      const stats = instance.getQueueStats();
      expect(stats.queueSize).toBe(1);
    });

    it('should handle multiple concurrent alert queueing', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      const alertPromises = Array.from({ length: 10 }, (_, i) => 
        instance.queueAlert({
          executionId: `test-execution-${i}`,
          alertType: 'HIGH_ERROR_RATE',
          severity: 'HIGH',
          message: `Test alert ${i}`,
          jobName: 'test-job',
          environment: 'test'
        })
      );

      await Promise.all(alertPromises);
      
      const stats = instance.getQueueStats();
      expect(stats.queueSize).toBe(10);
    });

    it('should skip queueing when circuit breaker is open', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Force circuit breaker open
      (instance as any).circuitBreakerOpen = true;
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });
      
      const stats = instance.getQueueStats();
      expect(stats.queueSize).toBe(0);
      expect(stats.circuitBreakerOpen).toBe(true);
    });

    it('should aggregate metric updates correctly', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Queue multiple alerts for same execution
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Critical alert 1',
        jobName: 'test-job',
        environment: 'test'
      });

      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'HIGH_ERROR_RATE',
        severity: 'CRITICAL',
        message: 'Critical alert 2',
        jobName: 'test-job',
        environment: 'test'
      });

      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'API_RATE_LIMIT_HIT',
        severity: 'WARNING',
        message: 'Warning alert',
        jobName: 'test-job',
        environment: 'test'
      });

      const metricUpdates = (instance as any).metricUpdates;
      const updates = metricUpdates.get('test-execution-1');
      
      expect(updates).toEqual({
        errorCount: 2, // Two CRITICAL alerts
        warningCount: 1 // One WARNING alert
      });
    });
  });

  describe('Batch Processing and Flushing', () => {
    it('should process alerts in batches', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Queue more alerts than batch size
      const alertPromises = Array.from({ length: 75 }, (_, i) =>
        instance.queueAlert({
          executionId: `test-execution-${i}`,
          alertType: 'EXECUTION_FAILED',
          severity: 'HIGH',
          message: `Alert ${i}`,
          jobName: 'test-job',
          environment: 'test'
        })
      );

      await Promise.all(alertPromises);
      
      // Mock the process environment to avoid test mode skipping
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          // Trigger flush
          await (instance as any).flushQueue();
          
          // Should have called createMany with batch
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalled();
          const call = mockPrisma.cronJobAlert.createMany.mock.calls[0][0];
          expect(call.data).toHaveLength(50); // Default batch size
        }
      );
    });

    it('should handle database transaction failures', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });

      // Mock transaction failure
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          // Should handle error gracefully
          await expect((instance as any).flushQueue()).rejects.toThrow('Transaction failed');
          
          // Should increment consecutive failures
          const stats = instance.getQueueStats();
          expect(stats.consecutiveFailures).toBe(1);
        }
      );
    });

    it('should automatically flush when batch size is reached', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Set small batch size for testing
      (instance as any).config.maxBatchSize = 3;
      
      const flushSpy = jest.spyOn(instance as any, 'flushQueue');
      
      // Queue exactly batch size number of alerts
      for (let i = 0; i < 3; i++) {
        await instance.queueAlert({
          executionId: `test-execution-${i}`,
          alertType: 'EXECUTION_FAILED',
          severity: 'HIGH',
          message: `Alert ${i}`,
          jobName: 'test-job',
          environment: 'test'
        });
      }

      // Should trigger automatic flush
      await new Promise(resolve => setImmediate(resolve));
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should handle periodic flush timer', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Set short flush interval for testing
      (instance as any).config.flushIntervalMs = 1000;
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'HIGH',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });

      const flushSpy = jest.spyOn(instance as any, 'flushQueue');
      
      // Fast-forward timer
      jest.advanceTimersByTime(1000);
      await new Promise(resolve => setImmediate(resolve));
      
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker Functionality', () => {
    it('should open circuit breaker after consecutive failures', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Set low threshold for testing
      (instance as any).config.circuitBreakerThreshold = 2;
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });

      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          // Mock consecutive failures
          mockPrisma.$transaction.mockRejectedValue(new Error('Database error'));
          
          // First failure
          await expect((instance as any).flushQueue()).rejects.toThrow();
          expect(instance.getQueueStats().consecutiveFailures).toBe(1);
          expect(instance.getQueueStats().circuitBreakerOpen).toBe(false);
          
          // Add another alert and trigger second failure
          await instance.queueAlert({
            executionId: 'test-execution-2',
            alertType: 'EXECUTION_FAILED',
            severity: 'CRITICAL',
            message: 'Test alert 2',
            jobName: 'test-job',
            environment: 'test'
          });
          
          await expect((instance as any).flushQueue()).rejects.toThrow();
          
          // Circuit breaker should now be open
          const stats = instance.getQueueStats();
          expect(stats.consecutiveFailures).toBe(2);
          expect(stats.circuitBreakerOpen).toBe(true);
        }
      );
    });

    it('should close circuit breaker after timeout', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Set short timeout for testing
      (instance as any).config.circuitBreakerTimeoutMs = 5000;
      
      // Force circuit breaker open
      (instance as any).circuitBreakerOpen = true;
      (instance as any).lastCircuitBreakerOpen = Date.now();
      (instance as any).consecutiveFailures = 5;
      
      expect(instance.getQueueStats().circuitBreakerOpen).toBe(true);
      
      // Fast-forward time past timeout
      jest.advanceTimersByTime(6000);
      
      // Check circuit breaker status
      const isOpen = (instance as any).isCircuitBreakerOpen();
      expect(isOpen).toBe(false);
      
      const stats = instance.getQueueStats();
      expect(stats.circuitBreakerOpen).toBe(false);
      expect(stats.consecutiveFailures).toBe(0);
    });

    it('should reset circuit breaker on successful processing', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Set some failures first
      (instance as any).consecutiveFailures = 3;
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'HIGH',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });

      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          // Mock successful processing
          mockPrisma.$transaction.mockResolvedValue(undefined);
          
          await (instance as any).flushQueue();
          
          // Should reset failures
          const stats = instance.getQueueStats();
          expect(stats.consecutiveFailures).toBe(0);
          expect(stats.circuitBreakerOpen).toBe(false);
        }
      );
    });
  });

  describe('Performance and Memory Management', () => {
    it('should track processing performance', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      const startTime = Date.now();
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'HIGH',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });

      // Processing should be very fast (< 5ms target)
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(10); // Allow some margin for test overhead
    });

    it('should prevent queue from growing unbounded', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Set very small batch size to test behavior
      (instance as any).config.maxBatchSize = 5;
      
      const alertPromises = Array.from({ length: 20 }, (_, i) =>
        instance.queueAlert({
          executionId: `test-execution-${i}`,
          alertType: 'HIGH_ERROR_RATE',
          severity: 'HIGH',
          message: `Alert ${i}`,
          jobName: 'test-job',
          environment: 'test'
        })
      );

      await Promise.all(alertPromises);
      
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          // Should trigger multiple flushes automatically
          await new Promise(resolve => setImmediate(resolve));
          
          const stats = instance.getQueueStats();
          // Queue should be much smaller than the 20 alerts queued
          expect(stats.queueSize).toBeLessThan(20);
        }
      );
    });

    it('should handle high throughput efficiently', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      const startTime = Date.now();
      
      // Queue many alerts rapidly
      const alertPromises = Array.from({ length: 1000 }, (_, i) =>
        instance.queueAlert({
          executionId: `test-execution-${i % 10}`, // Some overlap in execution IDs
          alertType: 'HIGH_ERROR_RATE',
          severity: 'MEDIUM',
          message: `Alert ${i}`,
          jobName: 'test-job',
          environment: 'test'
        })
      );

      await Promise.all(alertPromises);
      
      const queueingTime = Date.now() - startTime;
      
      // Should queue 1000 alerts very quickly (< 100ms target)
      expect(queueingTime).toBeLessThan(200); // Allow margin for test overhead
      
      const stats = instance.getQueueStats();
      expect(stats.queueSize).toBe(1000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed alert data gracefully', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Test with missing required fields
      await expect(instance.queueAlert({
        executionId: 'test-execution-1',
        // Missing alertType, severity, message
        jobName: 'test-job',
        environment: 'test'
      } as any)).resolves.not.toThrow();
      
      // Should still be queued (validation happens during processing)
      const stats = instance.getQueueStats();
      expect(stats.queueSize).toBe(1);
    });

    it('should handle processing when no alerts are queued', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          // Should handle empty queue gracefully
          await expect((instance as any).flushQueue()).resolves.not.toThrow();
          
          // Should not call database
          expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        }
      );
    });

    it('should handle concurrent flush attempts', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'HIGH',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });

      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          // Start multiple flush operations concurrently
          const flushPromises = Array.from({ length: 3 }, () => 
            (instance as any).flushQueue()
          );

          await Promise.all(flushPromises);
          
          // Should only process once (isProcessing flag prevents concurrent processing)
          expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        }
      );
    });
  });

  describe('Graceful Shutdown', () => {
    it('should flush remaining alerts on shutdown', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      await instance.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'HIGH',
        message: 'Test alert',
        jobName: 'test-job',
        environment: 'test'
      });

      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          await instance.shutdown();
          
          // Should have processed the queued alert
          expect(mockPrisma.$transaction).toHaveBeenCalled();
          
          const stats = instance.getQueueStats();
          expect(stats.queueSize).toBe(0);
        }
      );
    });

    it('should clear flush timer on shutdown', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      await instance.shutdown();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Integration with Production Scenarios', () => {
    it('should handle realistic alert volume', async () => {
      const instance = AsyncAlertQueue.getInstance();
      
      // Simulate realistic SEC filing processing scenario
      // 100 companies × 5 alerts per company (moderate error scenario)
      const alertPromises = Array.from({ length: 500 }, (_, i) => {
        const companyId = Math.floor(i / 5);
        const alertTypes = ['EXECUTION_FAILED', 'HIGH_ERROR_RATE', 'EMAIL_DELIVERY_FAILED', 'API_RATE_LIMIT_HIT', 'COST_THRESHOLD_EXCEEDED'];
        
        return instance.queueAlert({
          executionId: `execution-${companyId}`,
          alertType: alertTypes[i % 5],
          severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(Math.random() * 4)],
          message: `Alert for company ${companyId}, type ${alertTypes[i % 5]}`,
          details: { companyIndex: companyId, alertIndex: i },
          jobName: 'sec-filing-processor',
          environment: 'production'
        });
      });

      const startTime = Date.now();
      await Promise.all(alertPromises);
      const queueTime = Date.now() - startTime;
      
      // Should queue 500 alerts quickly
      expect(queueTime).toBeLessThan(500); // < 1ms per alert
      
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'production' },
        async () => {
          const flushStartTime = Date.now();
          
          // Process all alerts
          while (instance.getQueueStats().queueSize > 0) {
            await (instance as any).flushQueue();
          }
          
          const flushTime = Date.now() - flushStartTime;
          
          // Should process all alerts efficiently
          expect(flushTime).toBeLessThan(1000); // < 2ms per alert for processing
          
          // Verify all alerts were processed
          expect(mockPrisma.$transaction).toHaveBeenCalled();
          const stats = instance.getQueueStats();
          expect(stats.queueSize).toBe(0);
        }
      );
    });

    it.skip('should maintain performance under sustained load', async () => {
      // Skip this test for now - it's too performance intensive for CI
      // This would be better as a separate performance benchmark test
    });
  });
});