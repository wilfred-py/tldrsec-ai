/**
 * Integration Stress Tests for Monitoring System
 * 
 * Tests the monitoring system under various stress conditions including:
 * - High database load
 * - Concurrent operations
 * - Extended monitoring periods
 * - Resource exhaustion scenarios
 */

import { performance } from 'perf_hooks';

// Mock dependencies
jest.mock('../../lib/db/index');
jest.mock('../../lib/logging');

import {
  pipelineHealthMonitor,
  getCurrentSystemHealth,
  startHealthMonitoring,
  stopHealthMonitoring,
  getHealthHistory,
  getHealthTrends,
  type SystemHealth
} from '../../lib/monitoring/pipeline-health-monitor';

import { prisma } from '../../lib/db/index';

import {
  pipelineErrorDetector,
  detectPipelineErrors,
  generatePipelineHealthReport
} from '../../lib/monitoring/pipeline-error-detector';

jest.mock('../../lib/db/index', () => ({
  prisma: {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
    user: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn()
    },
    auditLog: {
      count: jest.fn(),
      findMany: jest.fn()
    },
    summary: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn()
    }
  }
}));

describe('Monitoring System Stress Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    
    // Setup default mocks for stress testing
    mockPrisma.$connect.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, Math.random() * 100)) // 0-100ms delay
    );
    mockPrisma.$queryRaw.mockResolvedValue([{ test: 1 }]);
    mockPrisma.user.count.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(Math.floor(Math.random() * 1000)), Math.random() * 50))
    );
    mockPrisma.user.aggregate.mockResolvedValue({ 
      _sum: { budgetUsed: 500, processingBudget: 1000 } 
    });
    mockPrisma.auditLog.count.mockResolvedValue(10);
    mockPrisma.summary.findMany.mockResolvedValue([
      { cost: 0.05, createdAt: new Date(), processingStatus: 'COMPLETED' }
    ]);
  });

  afterEach(() => {
    stopHealthMonitoring();
  });

  describe('High Database Load Scenarios', () => {
    it('should maintain performance under high database load', async () => {
      // Simulate high database load with variable response times
      let dbCallCount = 0;
      mockPrisma.$connect.mockImplementation(() => {
        dbCallCount++;
        const delay = Math.min(dbCallCount * 10, 2000); // Increasing delay up to 2s
        return new Promise(resolve => setTimeout(resolve, delay));
      });
      
      const results = [];
      const startTime = performance.now();
      
      // Execute multiple health checks under increasing load
      for (let i = 0; i < 10; i++) {
        const healthStartTime = performance.now();
        const health = await getCurrentSystemHealth();
        const healthDuration = performance.now() - healthStartTime;
        
        results.push({
          attempt: i + 1,
          duration: healthDuration,
          status: health.overall.status,
          dbStatus: health.components.database.status
        });
      }
      
      const totalDuration = performance.now() - startTime;
      
      // Analyze results
      expect(results).toHaveLength(10);
      expect(totalDuration).toBeLessThan(30000); // Should complete within 30 seconds
      
      // Earlier checks should be faster than later ones
      expect(results[0].duration).toBeLessThan(results[9].duration);
      
      // System should detect degradation
      const laterResults = results.slice(-3);
      const degradedChecks = laterResults.filter(r => r.dbStatus === 'warning' || r.dbStatus === 'critical');
      expect(degradedChecks.length).toBeGreaterThan(0);
    });

    it('should handle database connection pool exhaustion', async () => {
      let connectionAttempts = 0;
      mockPrisma.$connect.mockImplementation(() => {
        connectionAttempts++;
        if (connectionAttempts > 5) {
          return Promise.reject(new Error('Connection pool exhausted'));
        }
        return Promise.resolve();
      });
      
      const concurrentChecks = Array(10).fill(null).map(() => getCurrentSystemHealth());
      const results = await Promise.allSettled(concurrentChecks);
      
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      const rejected = results.filter(r => r.status === 'rejected').length;
      
      expect(fulfilled + rejected).toBe(10);
      expect(fulfilled).toBeGreaterThan(0); // Some should succeed
      
      // Failed checks should still return health status (error handling)
      const successfulResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<SystemHealth>).value);
      
      successfulResults.forEach(health => {
        expect(health.components.database.status).toBe('critical');
        expect(health.components.database.message).toContain('Connection pool exhausted');
      });
    });

    it('should recover from database connection pool issues', async () => {
      let connectionAttempts = 0;
      mockPrisma.$connect.mockImplementation(() => {
        connectionAttempts++;
        // Fail for first 5 attempts, then succeed
        if (connectionAttempts <= 5) {
          return Promise.reject(new Error('Pool exhausted'));
        }
        return Promise.resolve();
      });
      
      // First batch should mostly fail
      const firstBatch = await Promise.allSettled(
        Array(5).fill(null).map(() => getCurrentSystemHealth())
      );
      
      // Second batch should succeed
      const secondBatch = await Promise.allSettled(
        Array(3).fill(null).map(() => getCurrentSystemHealth())
      );
      
      const firstSuccesses = firstBatch.filter(r => r.status === 'fulfilled').length;
      const secondSuccesses = secondBatch.filter(r => r.status === 'fulfilled').length;
      
      expect(firstSuccesses).toBeLessThan(3); // Most should fail
      expect(secondSuccesses).toBe(3); // All should succeed after recovery
    });
  });

  describe('Concurrent Operations Stress', () => {
    it('should handle concurrent health checks without conflicts', async () => {
      const concurrentOperations = 20;
      const startTime = performance.now();
      
      const promises = Array(concurrentOperations).fill(null).map(async (_, index) => {
        const operationStart = performance.now();
        const health = await getCurrentSystemHealth();
        const operationDuration = performance.now() - operationStart;
        
        return {
          index,
          duration: operationDuration,
          overallStatus: health.overall.status,
          score: health.overall.score,
          timestamp: health.overall.timestamp
        };
      });
      
      const results = await Promise.all(promises);
      const totalDuration = performance.now() - startTime;
      
      // All operations should complete
      expect(results).toHaveLength(concurrentOperations);
      
      // Total time should be less than sequential execution
      expect(totalDuration).toBeLessThan(concurrentOperations * 5000);
      
      // All should have valid health data
      results.forEach((result, index) => {
        expect(result.overallStatus).toMatch(/healthy|warning|critical/);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.timestamp).toBeInstanceOf(Date);
      });
      
      // Average duration should be reasonable
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      expect(avgDuration).toBeLessThan(8000);
    });

    it('should handle concurrent error detection and health monitoring', async () => {
      const healthChecks = Array(5).fill(null).map(() => getCurrentSystemHealth());
      const errorDetections = Array(5).fill(null).map(() => detectPipelineErrors());
      const reportGenerations = Array(3).fill(null).map(() => generatePipelineHealthReport());
      
      const allOperations = await Promise.allSettled([
        ...healthChecks,
        ...errorDetections,
        ...reportGenerations
      ]);
      
      const successful = allOperations.filter(op => op.status === 'fulfilled').length;
      const failed = allOperations.filter(op => op.status === 'rejected').length;
      
      expect(successful + failed).toBe(13);
      expect(successful).toBeGreaterThan(10); // Most should succeed
      expect(failed).toBeLessThan(3); // Few failures acceptable under stress
    });

    it('should maintain data consistency under concurrent access', async () => {
      // Start monitoring
      startHealthMonitoring();
      
      // Execute concurrent operations
      const operations = [
        ...Array(5).fill(null).map(() => getCurrentSystemHealth()),
        ...Array(3).fill(null).map(() => getHealthHistory(1)),
        ...Array(2).fill(null).map(() => getHealthTrends(1))
      ];
      
      const results = await Promise.all(operations);
      
      stopHealthMonitoring();
      
      // All operations should complete successfully
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Extended Monitoring Periods', () => {
    it('should maintain stability during extended monitoring', async () => {
      const monitoringDuration = 10000; // 10 seconds
      const checkInterval = 500; // 500ms
      const results: SystemHealth[] = [];
      
      startHealthMonitoring({
        intervals: {
          healthCheck: 1, // 1 second
          metricsCollection: 1,
          alertEvaluation: 2
        }
      });
      
      const startTime = performance.now();
      
      // Collect health data over extended period
      const intervalId = setInterval(async () => {
        try {
          const health = await getCurrentSystemHealth();
          results.push(health);
        } catch (error) {
          // Track errors but don't fail the test
          console.warn('Health check failed during extended monitoring:', error);
        }
      }, checkInterval);
      
      // Wait for monitoring duration
      await new Promise(resolve => setTimeout(resolve, monitoringDuration));
      
      clearInterval(intervalId);
      stopHealthMonitoring();
      
      const totalDuration = performance.now() - startTime;
      
      // Should collect multiple health checks
      expect(results.length).toBeGreaterThan(5);
      expect(totalDuration).toBeGreaterThanOrEqual(monitoringDuration);
      
      // Health data should be consistent
      results.forEach((health, index) => {
        expect(health.overall.score).toBeGreaterThanOrEqual(0);
        expect(health.overall.score).toBeLessThanOrEqual(100);
        expect(health.overall.timestamp).toBeInstanceOf(Date);
        
        // Timestamps should be in order
        if (index > 0) {
          expect(health.overall.timestamp.getTime())
            .toBeGreaterThanOrEqual(results[index - 1].overall.timestamp.getTime());
        }
      });
    });

    it('should handle memory pressure during extended operation', async () => {
      const initialMemory = process.memoryUsage();
      
      // Run monitoring for extended period with frequent checks
      for (let i = 0; i < 200; i++) {
        await getCurrentSystemHealth();
        
        // Force garbage collection periodically
        if (i % 50 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory growth should be reasonable (less than 100MB)
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024);
      
      // RSS growth should also be reasonable
      const rssGrowth = finalMemory.rss - initialMemory.rss;
      expect(rssGrowth).toBeLessThan(200 * 1024 * 1024);
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle CPU-intensive operations gracefully', async () => {
      // Simulate CPU-intensive database operations
      mockPrisma.$connect.mockImplementation(() => {
        // Simulate CPU-bound work
        const start = Date.now();
        while (Date.now() - start < 100) {
          Math.random() * Math.random(); // CPU-intensive operation
        }
        return Promise.resolve();
      });
      
      const concurrentChecks = Array(10).fill(null).map(async () => {
        const startTime = performance.now();
        const health = await getCurrentSystemHealth();
        return {
          duration: performance.now() - startTime,
          status: health.overall.status
        };
      });
      
      const results = await Promise.all(concurrentChecks);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.duration).toBeGreaterThan(0);
        expect(result.status).toMatch(/healthy|warning|critical/);
      });
    });

    it('should handle memory-intensive operations', async () => {
      // Simulate memory-intensive operations
      const largeDataSets = Array(5).fill(null).map(() => 
        Array(10000).fill(null).map(() => ({
          id: Math.random().toString(36),
          data: Array(100).fill(Math.random()),
          timestamp: new Date()
        }))
      );
      
      mockPrisma.summary.findMany.mockResolvedValue(largeDataSets[0]);
      
      const health = await getCurrentSystemHealth();
      
      expect(health.overall.status).toBeDefined();
      expect(health.components.database.status).toBe('healthy');
      
      // Clean up large data sets
      largeDataSets.length = 0;
    });

    it('should handle network timeout scenarios', async () => {
      let timeoutCount = 0;
      mockPrisma.$connect.mockImplementation(() => {
        timeoutCount++;
        if (timeoutCount % 3 === 0) {
          return new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Network timeout')), 1000)
          );
        }
        return Promise.resolve();
      });
      
      const results = [];
      for (let i = 0; i < 6; i++) {
        try {
          const health = await getCurrentSystemHealth();
          results.push({ success: true, status: health.overall.status });
        } catch (error) {
          results.push({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
      
      const successes = results.filter(r => r.success).length;
      const failures = results.filter(r => !r.success).length;
      
      expect(successes + failures).toBe(6);
      expect(successes).toBeGreaterThan(0); // Some should succeed
      expect(failures).toBeGreaterThan(0); // Some should fail due to timeouts
    });
  });

  describe('Failure Recovery and Resilience', () => {
    it('should recover from cascading system failures', async () => {
      let systemFailure = true;
      
      // Initially all systems fail
      mockPrisma.$connect.mockImplementation(() => 
        systemFailure ? Promise.reject(new Error('System down')) : Promise.resolve()
      );
      mockPrisma.user.count.mockImplementation(() => 
        systemFailure ? Promise.reject(new Error('User service down')) : Promise.resolve(100)
      );
      
      // First check should show critical failure
      const failedHealth = await getCurrentSystemHealth();
      expect(failedHealth.overall.status).toBe('critical');
      expect(failedHealth.overall.score).toBe(0);
      
      // Simulate system recovery
      systemFailure = false;
      
      // Second check should show recovery
      const recoveredHealth = await getCurrentSystemHealth();
      expect(recoveredHealth.overall.status).not.toBe('critical');
      expect(recoveredHealth.overall.score).toBeGreaterThan(0);
      expect(recoveredHealth.components.database.status).toBe('healthy');
    });

    it('should maintain monitoring during partial system failures', async () => {
      // Simulate partial failure - database works but other services fail
      mockPrisma.$connect.mockResolvedValue(undefined);
      mockPrisma.$queryRaw.mockResolvedValue([{ test: 1 }]);
      mockPrisma.user.count.mockResolvedValue(50);
      
      // But audit logs fail
      mockPrisma.auditLog.count.mockRejectedValue(new Error('Audit service down'));
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('healthy');
      expect(health.components.security.status).toBe('critical'); // Due to audit log failure
      expect(health.overall.status).toBe('critical'); // Overall critical due to security
      expect(health.overall.score).toBeLessThan(100);
      expect(health.overall.score).toBeGreaterThan(0); // But not zero due to partial success
    });

    it('should handle intermittent failures with retry logic', async () => {
      let attemptCount = 0;
      mockPrisma.$connect.mockImplementation(() => {
        attemptCount++;
        // Fail every other attempt
        if (attemptCount % 2 === 1) {
          return Promise.reject(new Error('Intermittent failure'));
        }
        return Promise.resolve();
      });
      
      const results = [];
      for (let i = 0; i < 8; i++) {
        const health = await getCurrentSystemHealth();
        results.push({
          attempt: i + 1,
          dbStatus: health.components.database.status,
          overall: health.overall.status
        });
      }
      
      // Should have a mix of successful and failed checks
      const successes = results.filter(r => r.dbStatus === 'healthy').length;
      const failures = results.filter(r => r.dbStatus === 'critical').length;
      
      expect(successes).toBeGreaterThan(0);
      expect(failures).toBeGreaterThan(0);
      expect(successes + failures).toBe(8);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete health checks within performance thresholds', async () => {
      const iterations = 50;
      const durations: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await getCurrentSystemHealth();
        const duration = performance.now() - startTime;
        durations.push(duration);
      }
      
      // Calculate performance metrics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      
      // Performance thresholds
      expect(avgDuration).toBeLessThan(3000); // 3 seconds average
      expect(maxDuration).toBeLessThan(8000); // 8 seconds max
      expect(minDuration).toBeGreaterThan(0); // Should take some time
      
      // 95th percentile should be reasonable
      const sorted = durations.sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95Duration = sorted[p95Index];
      expect(p95Duration).toBeLessThan(5000); // 5 seconds for 95th percentile
    });

    it('should scale linearly with concurrent operations', async () => {
      const testCases = [1, 2, 5, 10];
      const results: Array<{ concurrency: number; avgDuration: number; totalDuration: number }> = [];
      
      for (const concurrency of testCases) {
        const startTime = performance.now();
        
        const promises = Array(concurrency).fill(null).map(async () => {
          const operationStart = performance.now();
          await getCurrentSystemHealth();
          return performance.now() - operationStart;
        });
        
        const durations = await Promise.all(promises);
        const totalDuration = performance.now() - startTime;
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        
        results.push({ concurrency, avgDuration, totalDuration });
      }
      
      // Analyze scaling behavior
      expect(results).toHaveLength(4);
      
      // Total duration should increase with concurrency but not linearly
      expect(results[3].totalDuration).toBeGreaterThan(results[0].totalDuration);
      expect(results[3].totalDuration).toBeLessThan(results[0].totalDuration * 10); // Should not be 10x slower
      
      // Average duration should remain relatively stable
      const maxAvgDuration = Math.max(...results.map(r => r.avgDuration));
      const minAvgDuration = Math.min(...results.map(r => r.avgDuration));
      expect(maxAvgDuration / minAvgDuration).toBeLessThan(3); // Should not vary by more than 3x
    });
  });
});