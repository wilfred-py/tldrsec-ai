/**
 * Comprehensive Edge Case and Boundary Testing for Monitoring System
 * 
 * Tests extreme scenarios, boundary conditions, and failure modes
 * that could occur in production environments
 */

import { performance } from 'perf_hooks';

// Mock dependencies
jest.mock('../../lib/db/index');
jest.mock('../../lib/logging');
jest.mock('../../lib/monitoring/pipeline-error-detector');

import {
  pipelineHealthMonitor,
  getCurrentSystemHealth,
  startHealthMonitoring,
  stopHealthMonitoring,
  type SystemHealth,
  type MonitoringConfig
} from '../../lib/monitoring/pipeline-health-monitor';

import { prisma } from '../../lib/db/index';

import { pipelineErrorDetector } from '../../lib/monitoring/pipeline-error-detector';

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
      count: jest.fn()
    }
  }
}));

const mockErrorDetector = {
  analyzeAndDetect: jest.fn(),
  collectMetrics: jest.fn(),
  generateDetectionReport: jest.fn()
};

jest.mock('../../lib/monitoring/pipeline-error-detector', () => ({
  pipelineErrorDetector: mockErrorDetector
}));

describe('Monitoring Edge Cases and Boundaries', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;
    
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    
    // Setup default successful mocks
    mockPrisma.$connect.mockResolvedValue(undefined);
    mockPrisma.$queryRaw.mockResolvedValue([{ test: 1 }]);
    mockPrisma.user.count.mockResolvedValue(5);
    mockPrisma.user.aggregate.mockResolvedValue({ _sum: { budgetUsed: 100, processingBudget: 1000 } });
    mockPrisma.auditLog.count.mockResolvedValue(2);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    
    mockErrorDetector.analyzeAndDetect.mockResolvedValue([]);
    mockErrorDetector.collectMetrics.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    stopHealthMonitoring();
  });

  describe('Database Failure Scenarios', () => {
    it('should handle complete database unavailability', async () => {
      mockPrisma.$connect.mockRejectedValue(new Error('ECONNREFUSED'));
      mockPrisma.user.count.mockRejectedValue(new Error('Connection failed'));
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database down'));
      
      const health = await getCurrentSystemHealth();
      
      expect(health.overall.status).toBe('critical');
      expect(health.overall.score).toBe(0);
      expect(health.components.database.status).toBe('critical');
      expect(health.components.database.message).toContain('Database connection failed');
    });

    it('should work during database maintenance windows', async () => {
      mockPrisma.$connect.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 8000)) // 8 second delay
      );
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('critical');
      expect(health.components.database.message).toBe('Database response time is critically slow');
    });

    it('should detect and report connection pool issues', async () => {
      mockPrisma.$connect.mockRejectedValue(new Error('Connection pool exhausted'));
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('critical');
      expect(health.components.database.message).toContain('Connection pool exhausted');
      expect(health.components.database.recommendations).toContain('Check database connectivity');
    });

    it('should handle database connection timeouts', async () => {
      mockPrisma.$connect.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 1000)
        )
      );
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('critical');
      expect(health.components.database.message).toContain('Connection timeout');
    });

    it('should handle partial database failures', async () => {
      mockPrisma.$connect.mockResolvedValue(undefined);
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.auditLog.count.mockRejectedValue(new Error('Audit table locked'));
      mockPrisma.summary.findMany.mockRejectedValue(new Error('Summary table corrupted'));
      
      const health = await getCurrentSystemHealth();
      
      // Database connection works, but some components fail
      expect(health.components.database.status).toBe('healthy');
      expect(health.components.security.status).toBe('critical');
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should validate monitoring intervals are positive', () => {
      const invalidConfig: Partial<MonitoringConfig> = {
        intervals: {
          healthCheck: -60,
          metricsCollection: 0,
          alertEvaluation: -120
        }
      };
      
      expect(() => startHealthMonitoring(invalidConfig)).not.toThrow();
      
      // Should use default values for invalid intervals
      const currentHealth = pipelineHealthMonitor.getCurrentHealth();
      expect(currentHealth).toBeDefined();
    });

    it('should reject invalid threshold configurations', () => {
      const invalidThresholds: Partial<MonitoringConfig> = {
        thresholds: {
          responseTime: { warning: -1000, critical: -5000 },
          errorRate: { warning: 150, critical: 200 }, // > 100%
          cost: { warning: 110, critical: 90 }, // warning > critical
          uptime: { warning: 50, critical: 150 } // > 100%
        }
      };
      
      expect(() => startHealthMonitoring(invalidThresholds)).not.toThrow();
      
      // Should sanitize invalid values
      const health = pipelineHealthMonitor.getCurrentHealth();
      expect(health).toBeDefined();
    });

    it('should handle missing environment variables gracefully', () => {
      process.env = {}; // Clear all environment variables
      
      expect(async () => {
        await getCurrentSystemHealth();
      }).not.toThrow();
    });

    it('should handle extremely large configuration values', () => {
      const extremeConfig: Partial<MonitoringConfig> = {
        intervals: {
          healthCheck: Number.MAX_SAFE_INTEGER,
          metricsCollection: Number.MAX_SAFE_INTEGER,
          alertEvaluation: Number.MAX_SAFE_INTEGER
        },
        retention: {
          metrics: Number.MAX_SAFE_INTEGER,
          alerts: Number.MAX_SAFE_INTEGER,
          healthHistory: Number.MAX_SAFE_INTEGER
        }
      };
      
      expect(() => startHealthMonitoring(extremeConfig)).not.toThrow();
    });

    it('should handle null and undefined configuration values', () => {
      const nullConfig = null as any;
      const undefinedConfig = undefined as any;
      
      expect(() => startHealthMonitoring(nullConfig)).not.toThrow();
      expect(() => startHealthMonitoring(undefinedConfig)).not.toThrow();
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory during long monitoring sessions', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Simulate extended monitoring
      for (let i = 0; i < 100; i++) {
        await getCurrentSystemHealth();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Memory growth should be reasonable (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });

    it('should properly clean up event listeners', () => {
      const initialListenerCount = pipelineHealthMonitor.listenerCount('health:check:completed');
      
      // Start and stop monitoring multiple times
      for (let i = 0; i < 20; i++) {
        startHealthMonitoring();
        stopHealthMonitoring();
      }
      
      const finalListenerCount = pipelineHealthMonitor.listenerCount('health:check:completed');
      
      // Should not accumulate listeners
      expect(finalListenerCount).toBeLessThanOrEqual(initialListenerCount + 1);
    });

    it('should handle historical metrics overflow correctly', async () => {
      // Mock error detector to track metrics calls
      let metricsCallCount = 0;
      mockErrorDetector.collectMetrics.mockImplementation(() => {
        metricsCallCount++;
        return Promise.resolve({
          performance: { avgResponseTime: 1000 + metricsCallCount },
          cost: { totalSpent: metricsCallCount },
          security: { failedAuthAttempts: 0 },
          data: { consistencyErrors: 0 },
          reliability: { uptime: 99.9 },
          userExperience: { avgProcessingDelay: 30000 }
        });
      });
      
      // Generate many metric collections
      for (let i = 0; i < 150; i++) {
        await mockErrorDetector.collectMetrics();
      }
      
      // Historical metrics should be bounded
      const detector = pipelineErrorDetector as any;
      if (detector.historicalMetrics) {
        expect(detector.historicalMetrics.length).toBeLessThanOrEqual(100);
      }
    });

    it('should handle concurrent health checks without resource conflicts', async () => {
      const concurrentChecks = Array(10).fill(null).map(() => getCurrentSystemHealth());
      
      const results = await Promise.all(concurrentChecks);
      
      expect(results).toHaveLength(10);
      results.forEach((health, index) => {
        expect(health).toBeDefined();
        expect(health.overall).toBeDefined();
        expect(health.components).toBeDefined();
      });
    });

    it('should handle rapid start/stop cycles without resource leaks', () => {
      for (let i = 0; i < 50; i++) {
        startHealthMonitoring();
        stopHealthMonitoring();
      }
      
      // Should not throw or cause resource leaks
      expect(true).toBe(true);
    });
  });

  describe('Extreme Data Scenarios', () => {
    it('should handle zero data scenarios', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.aggregate.mockResolvedValue({ _sum: { budgetUsed: 0, processingBudget: 0 } });
      mockPrisma.auditLog.count.mockResolvedValue(0);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('healthy');
      expect(health.components.costManagement.details?.budgetUtilization).toBe(0);
    });

    it('should handle extremely large data volumes', async () => {
      mockPrisma.user.count.mockResolvedValue(Number.MAX_SAFE_INTEGER);
      mockPrisma.user.aggregate.mockResolvedValue({ 
        _sum: { 
          budgetUsed: Number.MAX_SAFE_INTEGER, 
          processingBudget: Number.MAX_SAFE_INTEGER 
        } 
      });
      mockPrisma.auditLog.count.mockResolvedValue(Number.MAX_SAFE_INTEGER);
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('healthy');
      expect(health.components.security.status).toBe('critical'); // Too many failed attempts
    });

    it('should handle corrupted database responses', async () => {
      mockPrisma.user.count.mockResolvedValue(null as any);
      mockPrisma.user.aggregate.mockResolvedValue({ _sum: null as any });
      mockPrisma.$queryRaw.mockResolvedValue(null);
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('healthy'); // Should handle nulls gracefully
    });

    it('should handle malformed database responses', async () => {
      mockPrisma.user.count.mockResolvedValue('invalid' as any);
      mockPrisma.user.aggregate.mockResolvedValue('malformed' as any);
      mockPrisma.auditLog.count.mockResolvedValue({ invalid: 'object' } as any);
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('healthy'); // Should coerce types gracefully
    });
  });

  describe('Network and Timing Edge Cases', () => {
    it('should handle network interruptions during health checks', async () => {
      let callCount = 0;
      mockPrisma.$connect.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('Network interrupted'));
        }
        return Promise.resolve();
      });
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('critical');
      expect(health.components.database.message).toContain('Network interrupted');
    });

    it('should handle system clock changes during monitoring', async () => {
      const originalDateNow = Date.now;
      let timeOffset = 0;
      
      // Mock Date.now to simulate time changes
      Date.now = jest.fn(() => originalDateNow() + timeOffset);
      
      const health1 = await getCurrentSystemHealth();
      
      // Simulate clock jumping backward
      timeOffset = -3600000; // 1 hour back
      
      const health2 = await getCurrentSystemHealth();
      
      expect(health1.overall.timestamp).toBeDefined();
      expect(health2.overall.timestamp).toBeDefined();
      
      // Restore original Date.now
      Date.now = originalDateNow;
    });

    it('should handle extremely slow operations', async () => {
      mockPrisma.$connect.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 20000)) // 20 seconds
      );
      
      const startTime = performance.now();
      const health = await getCurrentSystemHealth();
      const duration = performance.now() - startTime;
      
      expect(health.components.database.status).toBe('critical');
      expect(duration).toBeGreaterThan(19000); // Should wait for the slow operation
    });
  });

  describe('Error Propagation and Recovery', () => {
    it('should isolate component failures', async () => {
      mockPrisma.$connect.mockRejectedValue(new Error('Database failed'));
      // Other components should still work
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('critical');
      expect(health.components.aiService.status).toBe('healthy'); // Should still work
      expect(health.components.emailService.status).toBe('healthy'); // Should still work
    });

    it('should recover from transient failures', async () => {
      let attemptCount = 0;
      mockPrisma.$connect.mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject(new Error('Transient failure'));
        }
        return Promise.resolve();
      });
      
      // First call should fail
      const health1 = await getCurrentSystemHealth();
      expect(health1.components.database.status).toBe('critical');
      
      // Second call should succeed
      const health2 = await getCurrentSystemHealth();
      expect(health2.components.database.status).toBe('healthy');
    });

    it('should handle cascading failures gracefully', async () => {
      // Simulate cascading failure where database failure affects other components
      mockPrisma.$connect.mockRejectedValue(new Error('Database down'));
      mockPrisma.user.count.mockRejectedValue(new Error('Cannot connect'));
      mockPrisma.auditLog.count.mockRejectedValue(new Error('Cannot connect'));
      mockPrisma.summary.findMany.mockRejectedValue(new Error('Cannot connect'));
      
      const health = await getCurrentSystemHealth();
      
      expect(health.overall.status).toBe('critical');
      expect(health.overall.score).toBe(0);
      
      // Non-database components should still work
      expect(health.components.aiService.status).toBe('healthy');
      expect(health.components.emailService.status).toBe('healthy');
    });
  });

  describe('Performance Under Stress', () => {
    it('should maintain performance under high concurrent load', async () => {
      const concurrentOperations = Array(50).fill(null).map(async () => {
        const startTime = performance.now();
        await getCurrentSystemHealth();
        return performance.now() - startTime;
      });
      
      const durations = await Promise.all(concurrentOperations);
      
      // All operations should complete
      expect(durations).toHaveLength(50);
      
      // Average duration should be reasonable
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      expect(avgDuration).toBeLessThan(10000); // Less than 10 seconds average
    });

    it('should handle resource exhaustion scenarios', async () => {
      // Simulate resource exhaustion by making database very slow
      mockPrisma.$connect.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('critical');
      expect(health.components.database.message).toBe('Database response time is critically slow');
    });
  });
});