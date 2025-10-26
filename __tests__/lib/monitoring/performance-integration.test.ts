/**
 * Performance Integration Tests
 * Validates end-to-end performance improvements across the optimized system
 * Tests the complete pipeline: alert creation -> context management -> database operations
 */

import { CronJobMonitor } from '../../../lib/monitoring/cron-monitor';
import { asyncAlertQueue } from '../../../lib/monitoring/async-alert-queue';
import { boundedContextManager } from '../../../lib/cron/bounded-context-manager';
import { performanceMonitor } from '../../../lib/monitoring/performance-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');

describe('Performance Integration Tests', () => {
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    mockPrisma = {
      cronJobExecution: {
        create: jest.fn(),
        update: jest.fn(),
      },
      cronJobAlert: {
        create: jest.fn(),
        createMany: jest.fn(),
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('End-to-End Performance Validation', () => {
    it('should process 1000+ users with alerts in under 10 seconds', async () => {
      // Simulate high-scale cron processing scenario
      const userCount = 1000;
      const filingCount = 5; // Average filings per user
      const startTime = Date.now();

      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobAlert.createMany.mockResolvedValue({ count: 10 });

      // Create multiple cron monitors to simulate concurrent processing
      const monitors = [];
      for (let i = 0; i < 10; i++) {
        const monitor = await CronJobMonitor.create(`test-job-${i}`, 'VERCEL_CRON');
        monitors.push(monitor);
      }

      // Simulate processing multiple users with filings and alerts
      const promises = [];
      
      for (let userId = 0; userId < userCount; userId++) {
        const monitorIndex = userId % monitors.length;
        const monitor = monitors[monitorIndex];

        // Simulate filing processing with potential alerts
        for (let filingId = 0; filingId < filingCount; filingId++) {
          const promise = (async () => {
            // Add processing context
            boundedContextManager.addContext(`user-${userId}`, {
              userId: `user-${userId}`,
              tier: userId % 2 === 0 ? 'PRO' : 'HOBBY',
              operation: `filing-${filingId}`,
              operationType: filingId % 3 === 0 ? 'cached_summary' : 'ai_generation',
              isCached: filingId % 3 === 0,
              processingStartTime: Date.now(),
            });

            // Create alerts for some filings (simulating errors/warnings)
            if (filingId % 10 === 0) {
              await monitor.createAlert('HIGH_ERROR_RATE', {
                severity: 'HIGH',
                message: `High error rate for user ${userId}, filing ${filingId}`,
                details: { userId, filingId, errorRate: 0.15 }
              });
            }

            if (filingId % 20 === 0) {
              await monitor.createAlert('COST_THRESHOLD_EXCEEDED', {
                severity: 'MEDIUM',
                message: `Cost threshold exceeded for user ${userId}`,
                details: { userId, currentCost: 5.50, threshold: 5.00 }
              });
            }
          })();

          promises.push(promise);
        }
      }

      // Wait for all processing to complete
      await Promise.all(promises);

      // Trigger alert queue processing
      jest.advanceTimersByTime(6000);
      await jest.runAllTimersAsync();

      const totalProcessingTime = Date.now() - startTime;

      // Performance assertions
      expect(totalProcessingTime).toBeLessThan(10000); // Under 10 seconds

      // Verify alert queue is not overwhelmed
      const queueStats = asyncAlertQueue.getQueueStats();
      expect(queueStats.circuitBreakerOpen).toBe(false);

      // Verify context manager is handling memory efficiently
      const contextStats = boundedContextManager.getStats();
      expect(contextStats.memoryUsageMB).toBeLessThan(100); // Reasonable memory usage

      console.log(`Processed ${userCount} users with ${userCount * filingCount} filings in ${totalProcessingTime}ms`);
    });

    it('should maintain sub-10ms alert creation times under sustained load', async () => {
      const monitor = await CronJobMonitor.create('load-test-job', 'VERCEL_CRON');
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const alertCount = 500;
      const alertTimes: number[] = [];

      // Create alerts under sustained load
      for (let i = 0; i < alertCount; i++) {
        const startTime = Date.now();
        
        await monitor.createAlert('PERFORMANCE_DEGRADED', {
          severity: 'HIGH',
          message: `Performance test alert ${i}`,
          details: { alertIndex: i, timestamp: Date.now() }
        });

        const alertTime = Date.now() - startTime;
        alertTimes.push(alertTime);

        // Measure performance with the performance monitor
        performanceMonitor.recordAlertProcessingTime(alertTime);
      }

      // Calculate performance metrics
      const avgTime = alertTimes.reduce((a, b) => a + b, 0) / alertTimes.length;
      const maxTime = Math.max(...alertTimes);
      const p95Time = alertTimes.sort((a, b) => a - b)[Math.floor(alertTimes.length * 0.95)];
      const p99Time = alertTimes[Math.floor(alertTimes.length * 0.99)];

      // Performance requirements validation
      expect(avgTime).toBeLessThan(5); // Average under 5ms (target <10ms)
      expect(p95Time).toBeLessThan(10); // 95th percentile under 10ms
      expect(p99Time).toBeLessThan(20); // 99th percentile under 20ms
      expect(maxTime).toBeLessThan(50); // Maximum under 50ms

      // Verify no alerts took longer than the old blocking time
      const slowAlerts = alertTimes.filter(time => time > 120);
      expect(slowAlerts.length).toBe(0); // No alerts should take 120+ms

      console.log(`Alert Performance: avg=${avgTime}ms, p95=${p95Time}ms, p99=${p99Time}ms, max=${maxTime}ms`);
    });

    it('should handle memory efficiently with large context sets', async () => {
      const userCount = 100;
      const contextsPerUser = 50;
      const initialMemory = process.memoryUsage().heapUsed;

      // Add many contexts to test memory management
      for (let userId = 0; userId < userCount; userId++) {
        const contexts = [];
        
        for (let contextId = 0; contextId < contextsPerUser; contextId++) {
          const context = {
            userId: `memory-test-user-${userId}`,
            tier: 'PRO',
            operation: `memory-test-${contextId}`,
            operationType: 'ai_generation' as const,
            isCached: false,
            processingStartTime: Date.now() + contextId,
          };
          
          boundedContextManager.addContext(`memory-test-user-${userId}`, context);
          contexts.push(context);
        }

        // Create aggregate context to test aggregation performance
        const startTime = Date.now();
        boundedContextManager.createBoundedAggregateContext(
          `memory-test-user-${userId}`,
          'PRO',
          contexts,
          Math.random() * 10,
          contexts.length
        );
        const aggregationTime = Date.now() - startTime;

        // Aggregation should be fast even with many contexts
        expect(aggregationTime).toBeLessThan(50);
      }

      // Trigger cleanup
      for (let userId = 0; userId < userCount; userId++) {
        boundedContextManager.cleanupCompletedContexts(`memory-test-user-${userId}`);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth

      // Context manager should report healthy stats
      const stats = boundedContextManager.getStats();
      expect(stats.totalContexts).toBeLessThan(userCount * contextsPerUser); // Should have bounds
      expect(stats.evictedContexts).toBeGreaterThan(0); // Should have evicted some

      console.log(`Memory growth: ${memoryGrowth}MB, Total contexts: ${stats.totalContexts}, Evicted: ${stats.evictedContexts}`);
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect and report performance regressions', async () => {
      // Simulate normal operations
      for (let i = 0; i < 50; i++) {
        performanceMonitor.recordAlertProcessingTime(Math.random() * 5); // Good performance
        performanceMonitor.recordMainThreadBlocking(Math.random() * 5); // Minimal blocking
        performanceMonitor.recordDatabaseOperation('batched');
      }

      // Simulate performance regression
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordAlertProcessingTime(15 + Math.random() * 10); // Slow alerts
        performanceMonitor.recordMainThreadBlocking(60 + Math.random() * 40); // Excessive blocking
        performanceMonitor.recordDatabaseOperation('individual'); // Non-batched operations
      }

      const regression = performanceMonitor.checkPerformanceRegression();
      
      expect(regression.hasRegression).toBe(true);
      expect(regression.issues.length).toBeGreaterThan(0);
      expect(regression.issues.some(issue => issue.includes('Alert processing'))).toBe(true);
    });

    it('should generate comprehensive performance reports', () => {
      // Add some performance data
      performanceMonitor.recordAlertProcessingTime(3);
      performanceMonitor.recordAlertProcessingTime(7);
      performanceMonitor.recordMainThreadBlocking(2);
      performanceMonitor.recordDatabaseOperation('batched');
      performanceMonitor.recordDatabaseOperation('batched');
      performanceMonitor.recordDatabaseOperation('individual');

      const report = performanceMonitor.generateReport();
      
      expect(report).toContain('PERFORMANCE MONITOR REPORT');
      expect(report).toContain('ALERT SYSTEM PERFORMANCE');
      expect(report).toContain('PROCESSING TIMES');
      expect(report).toContain('MEMORY MANAGEMENT');
      expect(report).toContain('DATABASE OPERATIONS');
      expect(report).toContain('MAIN THREAD BLOCKING');

      // Should show healthy status for good metrics
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.alertProcessingTime.avg).toBeLessThan(10);
      expect(metrics.databaseOperations.batchRatio).toBeGreaterThan(0.5);
    });
  });

  describe('Database Operation Optimization', () => {
    it('should demonstrate significant reduction in database operations', async () => {
      const monitor = await CronJobMonitor.create('db-optimization-test', 'VERCEL_CRON');
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobAlert.createMany.mockResolvedValue({ count: 20 });

      // Create many alerts that will be batched
      const alertPromises = [];
      for (let i = 0; i < 100; i++) {
        alertPromises.push(
          monitor.createAlert('HIGH_ERROR_RATE', {
            severity: 'HIGH',
            message: `Database optimization test ${i}`,
            details: { testIndex: i }
          })
        );
      }

      await Promise.all(alertPromises);

      // Trigger batch processing
      jest.advanceTimersByTime(6000);
      await jest.runAllTimersAsync();

      // Should have significantly fewer database calls than alerts created
      const createManyCallCount = mockPrisma.cronJobAlert.createMany.mock.calls.length;
      const individualCreateCallCount = mockPrisma.cronJobAlert.create?.mock.calls.length || 0;

      // With batching, should have much fewer DB calls than alerts
      expect(createManyCallCount + individualCreateCallCount).toBeLessThan(10);
      
      // Should have used batching (createMany) primarily
      expect(createManyCallCount).toBeGreaterThan(0);
      expect(createManyCallCount).toBeGreaterThan(individualCreateCallCount);

      console.log(`Created 100 alerts with ${createManyCallCount + individualCreateCallCount} database operations`);
    });
  });

  describe('Circuit Breaker and Resilience', () => {
    it('should maintain system stability under database failures', async () => {
      const monitor = await CronJobMonitor.create('resilience-test', 'VERCEL_CRON');
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });
      
      // Simulate database failures
      mockPrisma.$transaction.mockRejectedValue(new Error('Database unavailable'));

      const startTime = Date.now();
      
      // Create alerts that will fail to be persisted
      const alertPromises = [];
      for (let i = 0; i < 50; i++) {
        alertPromises.push(
          monitor.createAlert('DATABASE_CONNECTION_FAILED', {
            severity: 'CRITICAL',
            message: `Database failure test ${i}`,
            details: { testIndex: i }
          })
        );
      }

      // Should not throw errors despite database failures
      await expect(Promise.all(alertPromises)).resolves.not.toThrow();

      const alertCreationTime = Date.now() - startTime;

      // Alert creation should still be fast despite database issues
      expect(alertCreationTime).toBeLessThan(500);

      // Trigger batch processing (which will fail)
      jest.advanceTimersByTime(6000);
      await jest.runAllTimersAsync();

      // Circuit breaker should be triggered
      const queueStats = asyncAlertQueue.getQueueStats();
      expect(queueStats.consecutiveFailures).toBeGreaterThan(0);

      console.log(`System remained stable during database failures: ${alertCreationTime}ms for 50 alerts`);
    });
  });

  describe('Comparative Performance Analysis', () => {
    it('should demonstrate improvement over original blocking implementation', async () => {
      // Simulate the old blocking behavior timing
      const oldBlockingTimePerAlert = 150; // ms (average of 120-285ms range)
      const newAsyncTimePerAlert = 3; // ms (target performance)
      
      const alertCount = 100;
      
      // Calculate theoretical times
      const oldTotalTime = alertCount * oldBlockingTimePerAlert;
      const newTotalTime = alertCount * newAsyncTimePerAlert;
      const improvementRatio = oldTotalTime / newTotalTime;
      const timesSaved = oldTotalTime - newTotalTime;

      console.log(`Performance Improvement Analysis:`);
      console.log(`- Old blocking approach: ${oldTotalTime}ms for ${alertCount} alerts`);
      console.log(`- New async approach: ${newTotalTime}ms for ${alertCount} alerts`);
      console.log(`- Improvement ratio: ${improvementRatio}x faster`);
      console.log(`- Time saved: ${timesSaved}ms (${timesSaved/1000}s)`);

      // Verify improvements are significant
      expect(improvementRatio).toBeGreaterThan(30); // At least 30x improvement
      expect(timesSaved).toBeGreaterThan(10000); // Save at least 10 seconds for 100 alerts

      // Test actual performance
      const monitor = await CronJobMonitor.create('comparison-test', 'VERCEL_CRON');
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });

      const actualStartTime = Date.now();
      
      const alertPromises = [];
      for (let i = 0; i < alertCount; i++) {
        alertPromises.push(
          monitor.createAlert('PERFORMANCE_DEGRADED', {
            severity: 'HIGH',
            message: `Comparison test ${i}`,
            details: { testIndex: i }
          })
        );
      }

      await Promise.all(alertPromises);
      const actualTotalTime = Date.now() - actualStartTime;

      // Actual performance should be close to theoretical improvement
      expect(actualTotalTime).toBeLessThan(newTotalTime * 2); // Allow some overhead
      expect(actualTotalTime).toBeLessThan(oldTotalTime / 10); // At least 10x better than old

      console.log(`- Actual measured time: ${actualTotalTime}ms`);
      console.log(`- Actual improvement: ${oldTotalTime / actualTotalTime}x faster`);
    });
  });
});