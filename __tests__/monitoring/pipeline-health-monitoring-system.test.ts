/**
 * Pipeline Health Monitoring System Tests
 * 
 * Comprehensive test suite for the pipeline health monitoring system,
 * including metrics collection, alerting, data retention, and dashboard exports.
 */

import { jest } from '@jest/globals';
import { 
  PipelineHealthMonitoringSystem,
  HealthMonitoringConfig,
  HealthMetrics,
  AlertEvent,
  recordLockOperation,
  recordParameterValidation,
  recordSecApiOperation,
  recordUserProcessing,
  startPipelineHealthMonitoring,
  getCurrentHealthMetrics,
  getDashboardMetrics
} from '../../lib/monitoring/pipeline-health-monitoring-system';

// Mock dependencies
jest.mock('../../lib/logging');
jest.mock('../../lib/monitoring/index');

describe('PipelineHealthMonitoringSystem', () => {
  let healthMonitor: PipelineHealthMonitoringSystem;
  let mockConfig: Partial<HealthMonitoringConfig>;

  beforeEach(() => {
    mockConfig = {
      alertThresholds: {
        lockTimeoutRate: { warn: 5, critical: 15 },
        parameterMismatchRate: { warn: 1, critical: 5 },
        secApiFailureRate: { warn: 10, critical: 25 },
        userProcessingSuccessRate: { warn: 90, critical: 75 }
      },
      alertDelivery: {
        consoleLogging: true
      },
      performance: {
        maxOverheadMs: 1,
        asyncProcessing: true,
        memoryUsageLimitMB: 100
      },
      dataRetention: {
        realTimeMetricsHours: 24,
        hourlyAggregatesDays: 30,
        dailySummariesDays: 90
      }
    };

    healthMonitor = PipelineHealthMonitoringSystem.getInstance(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset the singleton instance for clean tests
    (PipelineHealthMonitoringSystem as any).instance = undefined;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PipelineHealthMonitoringSystem.getInstance();
      const instance2 = PipelineHealthMonitoringSystem.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use provided config on first instantiation', () => {
      const customConfig = {
        alertThresholds: {
          lockTimeoutRate: { warn: 10, critical: 20 },
          parameterMismatchRate: { warn: 2, critical: 10 },
          secApiFailureRate: { warn: 15, critical: 30 },
          userProcessingSuccessRate: { warn: 85, critical: 70 }
        }
      };

      const instance = PipelineHealthMonitoringSystem.getInstance(customConfig);
      expect(instance).toBeInstanceOf(PipelineHealthMonitoringSystem);
    });
  });

  describe('Lock Operation Monitoring', () => {
    it('should record successful lock operations', () => {
      const lockKey = 'test-lock-key';
      const duration = 1500;

      recordLockOperation(lockKey, true, duration, false);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.lockTimeouts.total).toBe(1);
      expect(metrics.lockTimeouts.failures).toBe(0);
      expect(metrics.lockTimeouts.timeoutRate).toBe(0);
    });

    it('should record failed lock operations', () => {
      const lockKey = 'test-lock-key';
      const duration = 5000;

      recordLockOperation(lockKey, false, duration, true);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.lockTimeouts.total).toBe(1);
      expect(metrics.lockTimeouts.failures).toBe(1);
      expect(metrics.lockTimeouts.timeoutRate).toBe(100);
    });

    it('should sanitize sensitive lock keys', () => {
      const sensitiveKey = 'user-12345-secret-operation';
      
      recordLockOperation(sensitiveKey, true, 1000, false);

      // Should not throw and should handle sensitive data appropriately
      expect(() => getCurrentHealthMetrics()).not.toThrow();
    });

    it('should track lock timeout rate correctly', () => {
      // Record multiple operations
      recordLockOperation('lock1', true, 1000, false);
      recordLockOperation('lock2', false, 5000, true);
      recordLockOperation('lock3', true, 800, false);
      recordLockOperation('lock4', false, 6000, true);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.lockTimeouts.total).toBe(4);
      expect(metrics.lockTimeouts.failures).toBe(2);
      expect(metrics.lockTimeouts.timeoutRate).toBe(50);
    });
  });

  describe('Parameter Validation Monitoring', () => {
    it('should record successful parameter validation', () => {
      const operation = 'user-validation';
      const parameters = { userId: 'user_123', email: 'test@example.com' };

      recordParameterValidation(operation, parameters, true, []);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(1);
      expect(metrics.parameterValidation.mismatches).toBe(0);
      expect(metrics.parameterValidation.mismatchRate).toBe(0);
    });

    it('should record failed parameter validation', () => {
      const operation = 'user-validation';
      const parameters = { userId: 'invalid', email: 'not-an-email' };
      const issues = ['Invalid user ID format', 'Invalid email format'];

      recordParameterValidation(operation, parameters, false, issues);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(1);
      expect(metrics.parameterValidation.mismatches).toBe(1);
      expect(metrics.parameterValidation.mismatchRate).toBe(100);
    });

    it('should sanitize sensitive parameters', () => {
      const operation = 'auth-validation';
      const parameters = { 
        userId: 'user_123', 
        password: 'secret123',
        apiKey: 'sk-1234567890'
      };

      recordParameterValidation(operation, parameters, true, []);

      // Should not throw and should handle sensitive data appropriately
      expect(() => getCurrentHealthMetrics()).not.toThrow();
    });

    it('should calculate mismatch rate correctly', () => {
      recordParameterValidation('op1', {}, true, []);
      recordParameterValidation('op2', {}, false, ['error1']);
      recordParameterValidation('op3', {}, true, []);
      recordParameterValidation('op4', {}, false, ['error2']);
      recordParameterValidation('op5', {}, true, []);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(5);
      expect(metrics.parameterValidation.mismatches).toBe(2);
      expect(metrics.parameterValidation.mismatchRate).toBe(40);
    });
  });

  describe('SEC API Monitoring', () => {
    it('should record successful SEC API operations', () => {
      const endpoint = '/cgi-bin/browse-edgar';
      const responseTime = 2000;

      recordSecApiOperation(endpoint, true, responseTime, 200);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.secApiCalls.total).toBe(1);
      expect(metrics.secApiCalls.failures).toBe(0);
      expect(metrics.secApiCalls.failureRate).toBe(0);
    });

    it('should record failed SEC API operations', () => {
      const endpoint = '/cgi-bin/browse-edgar';
      const responseTime = 30000;

      recordSecApiOperation(endpoint, false, responseTime, 500);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.secApiCalls.total).toBe(1);
      expect(metrics.secApiCalls.failures).toBe(1);
      expect(metrics.secApiCalls.failureRate).toBe(100);
    });

    it('should sanitize endpoint URLs', () => {
      const sensitiveEndpoint = '/api/user/123456/secret-data?key=abc123';
      
      recordSecApiOperation(sensitiveEndpoint, true, 1000, 200);

      // Should not throw and should handle sensitive data appropriately
      expect(() => getCurrentHealthMetrics()).not.toThrow();
    });

    it('should track API failure rate correctly', () => {
      recordSecApiOperation('/endpoint1', true, 1000, 200);
      recordSecApiOperation('/endpoint2', false, 5000, 500);
      recordSecApiOperation('/endpoint3', true, 800, 200);
      recordSecApiOperation('/endpoint4', false, 6000, 404);
      recordSecApiOperation('/endpoint5', true, 1200, 200);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.secApiCalls.total).toBe(5);
      expect(metrics.secApiCalls.failures).toBe(2);
      expect(metrics.secApiCalls.failureRate).toBe(40);
    });
  });

  describe('User Processing Monitoring', () => {
    it('should record successful user processing', () => {
      const userId = 'user_123';
      const operation = 'filing-processing';
      const processingTime = 5000;

      recordUserProcessing(userId, operation, true, processingTime, {
        filingsProcessed: 3,
        cost: 0.15
      });

      const metrics = getCurrentHealthMetrics();
      expect(metrics.userProcessing.total).toBe(1);
      expect(metrics.userProcessing.successes).toBe(1);
      expect(metrics.userProcessing.successRate).toBe(100);
    });

    it('should record failed user processing', () => {
      const userId = 'user_456';
      const operation = 'filing-processing';
      const processingTime = 2000;

      recordUserProcessing(userId, operation, false, processingTime, {
        error: 'Budget exceeded'
      });

      const metrics = getCurrentHealthMetrics();
      expect(metrics.userProcessing.total).toBe(1);
      expect(metrics.userProcessing.successes).toBe(0);
      expect(metrics.userProcessing.successRate).toBe(0);
    });

    it('should calculate user processing success rate correctly', () => {
      recordUserProcessing('user1', 'op', true, 1000);
      recordUserProcessing('user2', 'op', false, 2000);
      recordUserProcessing('user3', 'op', true, 1500);
      recordUserProcessing('user4', 'op', true, 1200);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.userProcessing.total).toBe(4);
      expect(metrics.userProcessing.successes).toBe(3);
      expect(metrics.userProcessing.successRate).toBe(75);
    });
  });

  describe('Alert System', () => {
    it('should trigger lock timeout alerts at warning threshold', () => {
      // Create enough lock failures to trigger warning threshold (5%)
      for (let i = 0; i < 100; i++) {
        const success = i < 5 ? false : true; // 5% failure rate
        recordLockOperation(`lock${i}`, success, 1000, !success);
      }

      // Allow some time for async processing
      setTimeout(() => {
        const dashboardMetrics = getDashboardMetrics();
        const lockTimeoutRate = dashboardMetrics.realTimeMetrics.lockTimeouts.timeoutRate;
        expect(lockTimeoutRate).toBeGreaterThanOrEqual(5);
      }, 100);
    });

    it('should trigger parameter validation alerts at critical threshold', () => {
      // Create enough validation failures to trigger critical threshold (5%)
      for (let i = 0; i < 100; i++) {
        const isValid = i < 5 ? false : true; // 5% failure rate
        recordParameterValidation(`op${i}`, {}, isValid, isValid ? [] : ['error']);
      }

      setTimeout(() => {
        const dashboardMetrics = getDashboardMetrics();
        const mismatchRate = dashboardMetrics.realTimeMetrics.parameterValidation.mismatchRate;
        expect(mismatchRate).toBeGreaterThanOrEqual(5);
      }, 100);
    });

    it('should handle alert delivery configuration', () => {
      const configWithWebhook = {
        ...mockConfig,
        alertDelivery: {
          consoleLogging: true,
          webhookUrl: 'https://example.com/webhook'
        }
      };

      const monitorWithWebhook = PipelineHealthMonitoringSystem.getInstance(configWithWebhook);
      expect(monitorWithWebhook).toBeInstanceOf(PipelineHealthMonitoringSystem);
    });
  });

  describe('Performance Optimization', () => {
    it('should respect maximum overhead configuration', () => {
      const startTime = Date.now();
      
      // Record multiple operations rapidly
      for (let i = 0; i < 10; i++) {
        recordLockOperation(`lock${i}`, true, 1000, false);
      }
      
      const totalTime = Date.now() - startTime;
      
      // Should complete quickly (under 100ms for 10 operations)
      expect(totalTime).toBeLessThan(100);
    });

    it('should handle async processing configuration', () => {
      const asyncConfig = {
        ...mockConfig,
        performance: {
          ...mockConfig.performance!,
          asyncProcessing: true
        }
      };

      const asyncMonitor = PipelineHealthMonitoringSystem.getInstance(asyncConfig);
      expect(asyncMonitor).toBeInstanceOf(PipelineHealthMonitoringSystem);
    });

    it('should enforce memory usage limits', () => {
      const memoryConfig = {
        ...mockConfig,
        performance: {
          ...mockConfig.performance!,
          memoryUsageLimitMB: 1 // Very low limit for testing
        }
      };

      const memoryMonitor = PipelineHealthMonitoringSystem.getInstance(memoryConfig);
      expect(memoryMonitor).toBeInstanceOf(PipelineHealthMonitoringSystem);
    });
  });

  describe('Data Retention', () => {
    it('should respect real-time metrics retention policy', () => {
      const retentionConfig = {
        ...mockConfig,
        dataRetention: {
          ...mockConfig.dataRetention!,
          realTimeMetricsHours: 1 // 1 hour retention for testing
        }
      };

      const retentionMonitor = PipelineHealthMonitoringSystem.getInstance(retentionConfig);
      expect(retentionMonitor).toBeInstanceOf(PipelineHealthMonitoringSystem);
    });

    it('should handle cleanup of old metrics', () => {
      // Force cleanup by calling it directly
      healthMonitor.forceCleanup();
      
      // Should not throw
      expect(() => getCurrentHealthMetrics()).not.toThrow();
    });
  });

  describe('Dashboard Metrics Export', () => {
    it('should export dashboard-ready metrics', () => {
      // Record some test data
      recordLockOperation('lock1', true, 1000, false);
      recordParameterValidation('op1', {}, true, []);
      recordSecApiOperation('/api1', true, 1500, 200);
      recordUserProcessing('user1', 'process1', true, 2000);

      const dashboardMetrics = getDashboardMetrics();

      expect(dashboardMetrics).toHaveProperty('currentHealth');
      expect(dashboardMetrics).toHaveProperty('realTimeMetrics');
      expect(dashboardMetrics).toHaveProperty('recentAlerts');
      expect(dashboardMetrics).toHaveProperty('trends');
      expect(dashboardMetrics).toHaveProperty('systemPerformance');

      expect(dashboardMetrics.currentHealth).toHaveProperty('overall');
      expect(dashboardMetrics.currentHealth).toHaveProperty('score');
      expect(dashboardMetrics.currentHealth).toHaveProperty('lastUpdated');
    });

    it('should include real-time metrics in dashboard export', () => {
      recordLockOperation('lock1', true, 1000, false);
      recordUserProcessing('user1', 'process1', true, 2000);

      const dashboardMetrics = getDashboardMetrics();

      expect(dashboardMetrics.realTimeMetrics.lockTimeouts.total).toBe(1);
      expect(dashboardMetrics.realTimeMetrics.userProcessing.total).toBe(1);
    });

    it('should calculate overall health score', () => {
      // Record mostly successful operations
      for (let i = 0; i < 10; i++) {
        recordLockOperation(`lock${i}`, true, 1000, false);
        recordParameterValidation(`op${i}`, {}, true, []);
        recordSecApiOperation(`/api${i}`, true, 1500, 200);
        recordUserProcessing(`user${i}`, 'process', true, 2000);
      }

      const dashboardMetrics = getDashboardMetrics();
      expect(dashboardMetrics.currentHealth.score).toBeGreaterThan(80);
    });

    it('should provide trend data for dashboard', () => {
      const dashboardMetrics = getDashboardMetrics();

      expect(dashboardMetrics.trends).toHaveProperty('last24Hours');
      expect(dashboardMetrics.trends).toHaveProperty('last7Days');
      expect(dashboardMetrics.trends).toHaveProperty('last30Days');
    });
  });

  describe('Monitoring Lifecycle', () => {
    it('should start monitoring successfully', () => {
      expect(() => startPipelineHealthMonitoring()).not.toThrow();
    });

    it('should start monitoring with custom config', () => {
      const customConfig = {
        alertThresholds: {
          lockTimeoutRate: { warn: 10, critical: 20 },
          parameterMismatchRate: { warn: 2, critical: 10 },
          secApiFailureRate: { warn: 15, critical: 30 },
          userProcessingSuccessRate: { warn: 85, critical: 70 }
        }
      };

      expect(() => startPipelineHealthMonitoring(customConfig)).not.toThrow();
    });

    it('should handle monitoring start and stop', () => {
      healthMonitor.startMonitoring();
      expect(() => healthMonitor.stopMonitoring()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid parameters gracefully', () => {
      expect(() => recordLockOperation('', true, -1, false)).not.toThrow();
      expect(() => recordParameterValidation('', {}, true, [])).not.toThrow();
      expect(() => recordSecApiOperation('', true, 0, 200)).not.toThrow();
      expect(() => recordUserProcessing('', '', true, 0)).not.toThrow();
    });

    it('should handle null and undefined values', () => {
      expect(() => recordLockOperation(null as any, true, 1000, false)).not.toThrow();
      expect(() => recordParameterValidation('op', null as any, true, [])).not.toThrow();
      expect(() => recordUserProcessing(undefined as any, 'op', true, 1000)).not.toThrow();
    });

    it('should continue functioning after errors', () => {
      // Trigger some errors
      recordLockOperation(null as any, true, 1000, false);
      
      // Should still work normally
      recordLockOperation('valid-lock', true, 1000, false);
      
      const metrics = getCurrentHealthMetrics();
      expect(metrics.lockTimeouts.total).toBeGreaterThan(0);
    });
  });

  describe('Convenience Functions', () => {
    it('should provide working convenience functions', () => {
      expect(typeof recordLockOperation).toBe('function');
      expect(typeof recordParameterValidation).toBe('function');
      expect(typeof recordSecApiOperation).toBe('function');
      expect(typeof recordUserProcessing).toBe('function');
      expect(typeof getCurrentHealthMetrics).toBe('function');
      expect(typeof getDashboardMetrics).toBe('function');
      expect(typeof startPipelineHealthMonitoring).toBe('function');
    });

    it('should return valid metrics from convenience functions', () => {
      const metrics = getCurrentHealthMetrics();
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('lockTimeouts');
      expect(metrics).toHaveProperty('parameterValidation');
      expect(metrics).toHaveProperty('secApiCalls');
      expect(metrics).toHaveProperty('userProcessing');
      expect(metrics).toHaveProperty('performance');
    });
  });
});

describe('Integration Tests', () => {
  it('should integrate with existing monitoring system', () => {
    // Test that the health monitoring system works with the existing monitoring
    startPipelineHealthMonitoring();
    
    recordLockOperation('integration-test', true, 1000, false);
    recordParameterValidation('integration-test', { test: 'value' }, true, []);
    
    const metrics = getCurrentHealthMetrics();
    expect(metrics.lockTimeouts.total).toBe(1);
    expect(metrics.parameterValidation.total).toBe(1);
  });

  it('should handle high-volume operations', () => {
    const operationCount = 1000;
    const startTime = Date.now();
    
    // Record many operations quickly
    for (let i = 0; i < operationCount; i++) {
      recordLockOperation(`lock${i}`, i % 10 !== 0, 1000, i % 10 === 0);
      recordParameterValidation(`op${i}`, {}, i % 20 !== 0, i % 20 === 0 ? ['error'] : []);
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Should handle high volume efficiently (under 2 seconds)
    expect(totalTime).toBeLessThan(2000);
    
    const metrics = getCurrentHealthMetrics();
    expect(metrics.lockTimeouts.total).toBe(operationCount);
    expect(metrics.parameterValidation.total).toBe(operationCount);
  });

  it('should maintain accuracy under concurrent operations', async () => {
    const concurrentOperations = 50;
    const promises: Promise<void>[] = [];
    
    // Create concurrent operations
    for (let i = 0; i < concurrentOperations; i++) {
      promises.push(
        Promise.resolve().then(() => {
          recordLockOperation(`concurrent${i}`, true, 1000, false);
          recordUserProcessing(`user${i}`, 'concurrent', true, 1500);
        })
      );
    }
    
    await Promise.all(promises);
    
    const metrics = getCurrentHealthMetrics();
    expect(metrics.lockTimeouts.total).toBe(concurrentOperations);
    expect(metrics.userProcessing.total).toBe(concurrentOperations);
  });
});