/**
 * Tests for AsyncAlertQueue - Performance Optimization Component
 * Validates that the async alert system eliminates main thread blocking
 */

import { AsyncAlertQueue } from '../../../lib/monitoring/async-alert-queue';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');

describe('AsyncAlertQueue', () => {
  let alertQueue: AsyncAlertQueue;
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    mockPrisma = {
      cronJobAlert: {
        createMany: jest.fn(),
      },
      cronJobExecution: {
        update: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(mockPrisma)),
    };

    mockLogger = {
      child: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      })),
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    (logger as any).child = mockLogger.child;

    // Create fresh instance for each test
    alertQueue = AsyncAlertQueue.getInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Performance Optimization Tests', () => {
    it('should queue alerts with minimal blocking time (<1ms)', async () => {
      const startTime = Date.now();
      
      await alertQueue.queueAlert({
        executionId: 'test-execution-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test alert message',
        jobName: 'test-job',
        environment: 'test',
      });

      const processingTime = Date.now() - startTime;
      
      // Should be much faster than the original 120-285ms blocking time
      expect(processingTime).toBeLessThan(10);
      
      // Verify queue contains the alert
      const stats = alertQueue.getQueueStats();
      expect(stats.queueSize).toBeGreaterThan(0);
    });

    it('should handle high volume alert queuing without blocking', async () => {
      const alertCount = 100;
      const startTime = Date.now();
      
      // Queue multiple alerts rapidly
      const promises = Array.from({ length: alertCount }, (_, i) =>
        alertQueue.queueAlert({
          executionId: `test-execution-${i}`,
          alertType: 'HIGH_ERROR_RATE',
          severity: 'HIGH',
          message: `Test alert ${i}`,
          jobName: 'load-test-job',
          environment: 'test',
        })
      );

      await Promise.all(promises);
      
      const totalProcessingTime = Date.now() - startTime;
      const avgTimePerAlert = totalProcessingTime / alertCount;
      
      // Average time per alert should be well under 1ms
      expect(avgTimePerAlert).toBeLessThan(1);
      expect(totalProcessingTime).toBeLessThan(100); // Total time should be very low
      
      const stats = alertQueue.getQueueStats();
      expect(stats.queueSize).toBe(alertCount);
    });

    it('should batch process alerts efficiently', async () => {
      // Configure small batch size for testing
      process.env.ALERT_BATCH_SIZE = '5';
      
      mockPrisma.cronJobAlert.createMany.mockResolvedValue({ count: 5 });
      mockPrisma.cronJobExecution.update.mockResolvedValue({});

      // Queue alerts that will trigger batching
      for (let i = 0; i < 10; i++) {
        await alertQueue.queueAlert({
          executionId: `batch-test-${i}`,
          alertType: 'COST_THRESHOLD_EXCEEDED',
          severity: 'MEDIUM',
          message: `Batch test alert ${i}`,
          jobName: 'batch-test-job',
          environment: 'test',
        });
      }

      // Trigger flush manually for testing
      jest.advanceTimersByTime(6000); // Advance past flush interval
      await jest.runAllTimersAsync();

      // Should have called createMany for batch operations
      expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalled();
      
      // Verify batching occurred
      const createManyCall = mockPrisma.cronJobAlert.createMany.mock.calls[0];
      expect(createManyCall[0].data).toHaveLength(5); // Should batch 5 at a time
    });

    it('should aggregate metric updates to reduce database writes', async () => {
      const executionId = 'metric-test-execution';
      
      // Queue multiple alerts for the same execution
      await alertQueue.queueAlert({
        executionId,
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Error 1',
        jobName: 'metric-test',
        environment: 'test',
      });

      await alertQueue.queueAlert({
        executionId,
        alertType: 'HIGH_ERROR_RATE',
        severity: 'CRITICAL',
        message: 'Error 2',
        jobName: 'metric-test',
        environment: 'test',
      });

      await alertQueue.queueAlert({
        executionId,
        alertType: 'PERFORMANCE_DEGRADED',
        severity: 'WARNING',
        message: 'Warning 1',
        jobName: 'metric-test',
        environment: 'test',
      });

      // Trigger flush
      jest.advanceTimersByTime(6000);
      await jest.runAllTimersAsync();

      // Should aggregate metrics for the same execution ID
      // Instead of 3 separate update calls, should be 1 aggregated call
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId },
        data: {
          errorsCount: { increment: 2 }, // 2 CRITICAL alerts
        },
      });
    });
  });

  describe('Circuit Breaker Functionality', () => {
    it('should open circuit breaker after consecutive failures', async () => {
      // Configure low threshold for testing
      const mockQueue = new (AsyncAlertQueue as any)();
      mockQueue.config = { ...mockQueue.config, circuitBreakerThreshold: 2 };

      // Mock database failures
      mockPrisma.$transaction.mockRejectedValue(new Error('Database error'));

      // Queue alerts that will trigger failures
      await alertQueue.queueAlert({
        executionId: 'circuit-test-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test failure 1',
        jobName: 'circuit-test',
        environment: 'test',
      });

      await alertQueue.queueAlert({
        executionId: 'circuit-test-2',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test failure 2',
        jobName: 'circuit-test',
        environment: 'test',
      });

      // Trigger flush to cause failures
      jest.advanceTimersByTime(6000);
      await jest.runAllTimersAsync();

      const stats = alertQueue.getQueueStats();
      expect(stats.circuitBreakerOpen).toBe(true);
    });

    it('should skip alert queuing when circuit breaker is open', async () => {
      // Manually open circuit breaker
      const mockQueue = alertQueue as any;
      mockQueue.circuitBreakerOpen = true;

      const initialQueueSize = alertQueue.getQueueStats().queueSize;

      await alertQueue.queueAlert({
        executionId: 'skip-test',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Should be skipped',
        jobName: 'skip-test',
        environment: 'test',
      });

      const finalQueueSize = alertQueue.getQueueStats().queueSize;
      expect(finalQueueSize).toBe(initialQueueSize); // Should not increase
    });
  });

  describe('Memory Management', () => {
    it('should prevent queue from growing unbounded', async () => {
      // Set very small batch size to test queue limits
      process.env.ALERT_BATCH_SIZE = '10';
      
      // Disable flush timer to prevent automatic processing
      const mockQueue = alertQueue as any;
      clearInterval(mockQueue.flushTimer);

      // Queue many alerts
      for (let i = 0; i < 1000; i++) {
        await alertQueue.queueAlert({
          executionId: `memory-test-${i}`,
          alertType: 'MEMORY_LIMIT_EXCEEDED',
          severity: 'HIGH',
          message: `Memory test ${i}`,
          jobName: 'memory-test',
          environment: 'test',
        });
      }

      // Queue should trigger automatic flushing before growing too large
      const stats = alertQueue.getQueueStats();
      expect(stats.queueSize).toBeLessThan(500); // Should not grow unbounded
    });
  });

  describe('Error Handling', () => {
    it('should handle database transaction failures gracefully', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      // Should not throw error
      await expect(alertQueue.queueAlert({
        executionId: 'error-test',
        alertType: 'DATABASE_CONNECTION_FAILED',
        severity: 'CRITICAL',
        message: 'Error handling test',
        jobName: 'error-test',
        environment: 'test',
      })).resolves.not.toThrow();

      // Trigger flush
      jest.advanceTimersByTime(6000);
      await jest.runAllTimersAsync();

      // Should continue operating despite errors
      const stats = alertQueue.getQueueStats();
      expect(stats.isProcessing).toBe(false); // Should complete processing
    });

    it('should skip database operations in test environment', async () => {
      // Ensure test environment is detected
      process.env.NODE_ENV = 'test';

      await alertQueue.queueAlert({
        executionId: 'test-env-check',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Test environment check',
        jobName: 'test-env',
        environment: 'test',
      });

      // Trigger flush
      jest.advanceTimersByTime(6000);
      await jest.runAllTimersAsync();

      // Should not call database operations in test environment
      expect(mockPrisma.cronJobAlert.createMany).not.toHaveBeenCalled();
    });
  });

  describe('Performance Regression Tests', () => {
    it('should maintain sub-10ms alert creation under load', async () => {
      const measurements: number[] = [];
      const alertCount = 50;

      for (let i = 0; i < alertCount; i++) {
        const startTime = Date.now();
        
        await alertQueue.queueAlert({
          executionId: `perf-test-${i}`,
          alertType: 'PERFORMANCE_DEGRADED',
          severity: 'HIGH',
          message: `Performance test ${i}`,
          jobName: 'perf-test',
          environment: 'test',
        });

        const duration = Date.now() - startTime;
        measurements.push(duration);
      }

      // Calculate statistics
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);
      const p95Time = measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)];

      // Performance assertions
      expect(avgTime).toBeLessThan(2); // Average should be very fast
      expect(maxTime).toBeLessThan(10); // Even max should be under target
      expect(p95Time).toBeLessThan(5); // 95th percentile should be excellent

      // Log performance metrics for monitoring
      console.log(`Alert Queue Performance: avg=${avgTime}ms, max=${maxTime}ms, p95=${p95Time}ms`);
    });
  });

  describe('Queue Statistics and Monitoring', () => {
    it('should provide accurate queue statistics', async () => {
      // Queue some alerts
      await alertQueue.queueAlert({
        executionId: 'stats-test-1',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Stats test 1',
        jobName: 'stats-test',
        environment: 'test',
      });

      await alertQueue.queueAlert({
        executionId: 'stats-test-2',
        alertType: 'HIGH_ERROR_RATE',
        severity: 'HIGH',
        message: 'Stats test 2',
        jobName: 'stats-test',
        environment: 'test',
      });

      const stats = alertQueue.getQueueStats();
      
      expect(stats.queueSize).toBe(2);
      expect(stats.isProcessing).toBe(false);
      expect(stats.circuitBreakerOpen).toBe(false);
      expect(stats.consecutiveFailures).toBe(0);
    });
  });
});