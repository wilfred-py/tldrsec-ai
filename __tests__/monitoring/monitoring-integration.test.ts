/**
 * Monitoring System Integration Tests
 * 
 * Integration tests that verify all monitoring components work together correctly,
 * including parameter validation, SEC API monitoring, user processing tracking,
 * and dashboard metrics export.
 */

import { jest } from '@jest/globals';
import {
  recordLockOperation,
  recordParameterValidation,
  recordSecApiOperation,
  recordUserProcessing,
  startPipelineHealthMonitoring,
  getCurrentHealthMetrics
} from '../../lib/monitoring/pipeline-health-monitoring-system';

import {
  ParameterValidators,
  validateWithMonitoring
} from '../../lib/monitoring/parameter-validation-monitor';

import {
  MonitoredSECEdgarClient,
  SecApiMonitor
} from '../../lib/monitoring/sec-api-monitor';

import {
  userProcessingMonitor,
  UserProcessingMonitor
} from '../../lib/monitoring/user-processing-monitor';

import {
  exportDashboardMetrics,
  getRealTimeMetrics,
  clearDashboardCache
} from '../../lib/monitoring/dashboard-metrics-exporter';

// Mock external dependencies
jest.mock('../../lib/logging');
jest.mock('../../lib/monitoring/index');
jest.mock('../../lib/sec-edgar/client');
jest.mock('../../lib/db/prisma');

describe('Monitoring System Integration', () => {
  beforeEach(() => {
    // Clear all monitoring state before each test
    clearDashboardCache();
    userProcessingMonitor.resetMetrics();
    
    // Reset singletons
    (require('../../lib/monitoring/pipeline-health-monitoring-system').PipelineHealthMonitoringSystem as any).instance = undefined;
    (require('../../lib/monitoring/dashboard-metrics-exporter').DashboardMetricsExporter as any).instance = undefined;
    (require('../../lib/monitoring/user-processing-monitor').UserProcessingMonitor as any).instance = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Full Pipeline Health Monitoring Flow', () => {
    it('should track a complete user processing cycle', async () => {
      // Start monitoring
      startPipelineHealthMonitoring();

      // Simulate a complete user processing cycle
      const userId = 'user_123';
      const sessionId = 'session_456';

      // 1. Parameter validation
      recordParameterValidation('user_validation', { userId }, true, []);

      // 2. Lock acquisition
      recordLockOperation(`user_${userId}`, true, 1500, false);

      // 3. SEC API calls
      recordSecApiOperation('/cgi-bin/browse-edgar', true, 2000, 200);
      recordSecApiOperation('/filing/document.html', true, 1800, 200);

      // 4. User processing
      recordUserProcessing(userId, 'filing_processing', true, 15000, {
        filingsProcessed: 3,
        cost: 0.12,
        tier: 'PRO'
      });

      // 5. Verify metrics were recorded
      const metrics = getCurrentHealthMetrics();
      
      expect(metrics.parameterValidation.total).toBe(1);
      expect(metrics.parameterValidation.mismatchRate).toBe(0);
      
      expect(metrics.lockTimeouts.total).toBe(1);
      expect(metrics.lockTimeouts.timeoutRate).toBe(0);
      
      expect(metrics.secApiCalls.total).toBe(2);
      expect(metrics.secApiCalls.failureRate).toBe(0);
      
      expect(metrics.userProcessing.total).toBe(1);
      expect(metrics.userProcessing.successRate).toBe(100);
    });

    it('should handle error scenarios across all components', async () => {
      startPipelineHealthMonitoring();

      const userId = 'user_error';

      // Simulate errors in each component
      recordParameterValidation('user_validation', { userId: 'invalid' }, false, ['Invalid user ID']);
      recordLockOperation(`user_${userId}`, false, 30000, true);
      recordSecApiOperation('/api/failing-endpoint', false, 5000, 500);
      recordUserProcessing(userId, 'failing_process', false, 8000, {
        error: 'Budget exceeded'
      });

      const metrics = getCurrentHealthMetrics();
      
      expect(metrics.parameterValidation.mismatchRate).toBe(100);
      expect(metrics.lockTimeouts.timeoutRate).toBe(100);
      expect(metrics.secApiCalls.failureRate).toBe(100);
      expect(metrics.userProcessing.successRate).toBe(0);
    });

    it('should aggregate metrics for dashboard export', async () => {
      startPipelineHealthMonitoring();

      // Generate some test data
      for (let i = 0; i < 10; i++) {
        recordParameterValidation(`op_${i}`, { id: i }, i % 5 !== 0, i % 5 === 0 ? ['error'] : []);
        recordLockOperation(`lock_${i}`, i % 8 !== 0, 1000 + i * 100, i % 8 === 0);
        recordSecApiOperation(`/api/${i}`, i % 10 !== 0, 1500 + i * 50, i % 10 === 0 ? 500 : 200);
        recordUserProcessing(`user_${i}`, 'process', i % 7 !== 0, 2000 + i * 200);
      }

      const dashboardMetrics = await exportDashboardMetrics();
      
      expect(dashboardMetrics.overview).toBeDefined();
      expect(dashboardMetrics.components).toBeDefined();
      expect(dashboardMetrics.realTimeMetrics).toBeDefined();
      expect(dashboardMetrics.healthScore).toBeDefined();

      // Verify aggregated data makes sense
      expect(dashboardMetrics.realTimeMetrics.parameterValidations).toBe(10);
      expect(dashboardMetrics.realTimeMetrics.lockOperations).toBe(10);
      expect(dashboardMetrics.realTimeMetrics.secApiCalls).toBe(10);
      expect(dashboardMetrics.realTimeMetrics.userProcessingOperations).toBe(10);
    });
  });

  describe('Parameter Validation Integration', () => {
    it('should validate user IDs with monitoring', async () => {
      const result = await ParameterValidators.validateUserId('user_12345abcdef', 'test_operation');
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(1);
      expect(metrics.parameterValidation.mismatchRate).toBe(0);
    });

    it('should validate SEC filing parameters with monitoring', async () => {
      const params = {
        accessionNumber: '0001234567-23-001234',
        cik: '1234567',
        formType: '10-K',
        filingDate: '2023-12-31'
      };

      const result = await ParameterValidators.validateSecFilingParams(params);
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(1);
    });

    it('should handle validation failures with proper monitoring', async () => {
      const invalidParams = {
        accessionNumber: 'invalid-format',
        cik: 'not-a-number',
        formType: 'INVALID',
        filingDate: 'invalid-date'
      };

      const result = await ParameterValidators.validateSecFilingParams(invalidParams);
      
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(1);
      expect(metrics.parameterValidation.mismatchRate).toBe(100);
    });

    it('should work with custom validation functions', async () => {
      const customValidator = async (params: { value: number }) => {
        if (params.value < 0) {
          return { isValid: false, issues: ['Value must be positive'] };
        }
        return { isValid: true, issues: [] };
      };

      const result = await validateWithMonitoring(
        { operation: 'custom_validation', parameters: { value: 42 } },
        customValidator,
        { value: 42 }
      );

      expect(result.isValid).toBe(true);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(1);
    });
  });

  describe('SEC API Monitoring Integration', () => {
    it('should monitor SEC API operations through wrapper', async () => {
      const mockApiFunction = jest.fn().mockResolvedValue({ data: 'test' });
      const wrappedFunction = SecApiMonitor.createWrapper(
        mockApiFunction,
        '/test-endpoint',
        'test-operation'
      );

      const result = await wrappedFunction('param1', 'param2');

      expect(result).toEqual({ data: 'test' });
      expect(mockApiFunction).toHaveBeenCalledWith('param1', 'param2');

      const metrics = getCurrentHealthMetrics();
      expect(metrics.secApiCalls.total).toBe(1);
      expect(metrics.secApiCalls.failureRate).toBe(0);
    });

    it('should handle SEC API failures with monitoring', async () => {
      const failingApiFunction = jest.fn().mockRejectedValue(new Error('API Error'));
      const wrappedFunction = SecApiMonitor.createWrapper(
        failingApiFunction,
        '/failing-endpoint',
        'failing-operation'
      );

      await expect(wrappedFunction()).rejects.toThrow('API Error');

      const metrics = getCurrentHealthMetrics();
      expect(metrics.secApiCalls.total).toBe(1);
      expect(metrics.secApiCalls.failureRate).toBe(100);
    });

    it('should monitor concurrent SEC API operations', async () => {
      const operations = Array.from({ length: 5 }, (_, i) => 
        () => Promise.resolve(`result${i}`)
      );
      const endpoints = operations.map((_, i) => `/endpoint${i}`);

      const results = await SecApiMonitor.monitorConcurrentOperations(
        operations,
        endpoints,
        { maxConcurrency: 3, operationName: 'concurrent-test' }
      );

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.secApiCalls.total).toBe(5);
      expect(metrics.secApiCalls.failureRate).toBe(0);
    });
  });

  describe('User Processing Monitoring Integration', () => {
    it('should monitor complete user processing session', async () => {
      const users = [
        { userId: 'user1', tier: 'HOBBY' },
        { userId: 'user2', tier: 'PRO' },
        { userId: 'user3', tier: 'HOBBY' }
      ];

      const mockProcessor = jest.fn()
        .mockResolvedValueOnce({ filingsProcessed: 2, cost: 0.05 })
        .mockResolvedValueOnce({ filingsProcessed: 5, cost: 0.15 })
        .mockResolvedValueOnce({ filingsProcessed: 1, cost: 0.02 });

      const result = await userProcessingMonitor.monitorBatchProcessing(
        users,
        mockProcessor,
        { sessionId: 'test-session', maxConcurrency: 2 }
      );

      expect(result.summary.totalUsers).toBe(3);
      expect(result.summary.successful).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(result.summary.totalFilings).toBe(8);
      expect(result.summary.totalCost).toBeCloseTo(0.22);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.userProcessing.total).toBe(3);
      expect(metrics.userProcessing.successRate).toBe(100);
    });

    it('should handle mixed success/failure user processing', async () => {
      const users = [
        { userId: 'user1', tier: 'HOBBY' },
        { userId: 'user2', tier: 'PRO' },
        { userId: 'user3', tier: 'HOBBY' }
      ];

      const mockProcessor = jest.fn()
        .mockResolvedValueOnce({ filingsProcessed: 2, cost: 0.05 })
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce({ filingsProcessed: 1, cost: 0.02 });

      const result = await userProcessingMonitor.monitorBatchProcessing(
        users,
        mockProcessor,
        { sessionId: 'mixed-session' }
      );

      expect(result.summary.totalUsers).toBe(3);
      expect(result.summary.successful).toBe(2);
      expect(result.summary.failed).toBe(1);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.userProcessing.total).toBe(3);
      expect(metrics.userProcessing.successRate).toBeCloseTo(66.67, 1);
    });

    it('should track individual user processing with session', async () => {
      const result = await userProcessingMonitor.monitorUserProcessing(
        'user_test',
        'PRO',
        async () => ({ filingsProcessed: 3, cost: 0.10 }),
        'individual-session'
      );

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user_test');
      expect(result.tier).toBe('PRO');
      expect(result.filingsProcessed).toBe(3);
      expect(result.cost).toBe(0.10);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.userProcessing.total).toBe(1);
      expect(metrics.userProcessing.successRate).toBe(100);
    });
  });

  describe('Dashboard Integration', () => {
    it('should provide real-time metrics for dashboard updates', async () => {
      startPipelineHealthMonitoring();

      // Generate some activity
      recordLockOperation('lock1', true, 1000, false);
      recordParameterValidation('op1', {}, true, []);
      recordSecApiOperation('/api1', true, 1500, 200);
      recordUserProcessing('user1', 'process1', true, 2000);

      const realTimeMetrics = await getRealTimeMetrics();

      expect(realTimeMetrics.timestamp).toBeInstanceOf(Date);
      expect(realTimeMetrics.lockOperations).toBe(1);
      expect(realTimeMetrics.parameterValidations).toBe(1);
      expect(realTimeMetrics.secApiCalls).toBe(1);
      expect(realTimeMetrics.userProcessingOperations).toBe(1);
      expect(typeof realTimeMetrics.systemLoad).toBe('number');
    });

    it('should export comprehensive dashboard metrics', async () => {
      startPipelineHealthMonitoring();

      // Simulate realistic activity patterns
      const operations = 50;
      for (let i = 0; i < operations; i++) {
        const success = i % 10 !== 0; // 90% success rate
        
        recordParameterValidation(`op_${i}`, { id: i }, success, success ? [] : ['validation error']);
        recordLockOperation(`lock_${i}`, success, 1000 + Math.random() * 2000, !success);
        recordSecApiOperation(`/api/${i}`, success, 1500 + Math.random() * 1000, success ? 200 : 500);
        recordUserProcessing(`user_${i}`, 'process', success, 2000 + Math.random() * 3000, {
          filingsProcessed: success ? Math.floor(Math.random() * 5) + 1 : 0,
          cost: success ? Math.random() * 0.2 : 0
        });
      }

      const dashboardMetrics = await exportDashboardMetrics();

      // Verify structure
      expect(dashboardMetrics.overview.overallHealth.status).toBeDefined();
      expect(['healthy', 'warning', 'critical']).toContain(dashboardMetrics.overview.overallHealth.status);
      
      expect(dashboardMetrics.overview.overallHealth.score).toBeGreaterThanOrEqual(0);
      expect(dashboardMetrics.overview.overallHealth.score).toBeLessThanOrEqual(100);

      // Verify real-time metrics match expectations
      expect(dashboardMetrics.realTimeMetrics.parameterValidations).toBe(operations);
      expect(dashboardMetrics.realTimeMetrics.lockOperations).toBe(operations);
      expect(dashboardMetrics.realTimeMetrics.secApiCalls).toBe(operations);
      expect(dashboardMetrics.realTimeMetrics.userProcessingOperations).toBe(operations);

      // Verify component metrics are reasonable
      expect(dashboardMetrics.components.pipelineHealth.parameterValidation.rate).toBeCloseTo(10, 0);
      expect(dashboardMetrics.components.pipelineHealth.lockTimeouts.rate).toBeCloseTo(10, 0);
      expect(dashboardMetrics.components.pipelineHealth.secApiFailures.rate).toBeCloseTo(10, 0);
      expect(dashboardMetrics.components.pipelineHealth.userProcessingSuccess.rate).toBeCloseTo(90, 0);
    });

    it('should maintain performance under load', async () => {
      startPipelineHealthMonitoring();

      const operationCount = 1000;
      const startTime = Date.now();

      // Simulate high-volume operations
      const promises = [];
      for (let i = 0; i < operationCount; i++) {
        promises.push(Promise.resolve().then(() => {
          recordLockOperation(`lock_${i}`, true, 1000, false);
          recordParameterValidation(`op_${i}`, { id: i }, true, []);
          recordSecApiOperation(`/api/${i}`, true, 1500, 200);
          recordUserProcessing(`user_${i}`, 'process', true, 2000);
        }));
      }

      await Promise.all(promises);

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify all operations were recorded
      const metrics = getCurrentHealthMetrics();
      expect(metrics.parameterValidation.total).toBe(operationCount);
      expect(metrics.lockTimeouts.total).toBe(operationCount);
      expect(metrics.secApiCalls.total).toBe(operationCount);
      expect(metrics.userProcessing.total).toBe(operationCount);

      // Dashboard export should still work efficiently
      const dashboardStartTime = Date.now();
      const dashboardMetrics = await exportDashboardMetrics();
      const dashboardTime = Date.now() - dashboardStartTime;
      
      expect(dashboardTime).toBeLessThan(1000); // Should export in under 1 second
      expect(dashboardMetrics.realTimeMetrics.parameterValidations).toBe(operationCount);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should continue operating when individual components fail', async () => {
      startPipelineHealthMonitoring();

      // Simulate component failure by mocking internal methods to throw
      const originalConsoleError = console.error;
      console.error = jest.fn(); // Suppress error logs during test

      try {
        // Record operations that should work despite errors
        recordLockOperation('lock1', true, 1000, false);
        recordParameterValidation('op1', {}, true, []);
        
        // These should not throw even if internal processing fails
        recordSecApiOperation('', true, 1000, 200); // Empty endpoint
        recordUserProcessing('', 'process', true, 1000); // Empty user ID

        const metrics = getCurrentHealthMetrics();
        expect(metrics.lockTimeouts.total).toBe(1);
        expect(metrics.parameterValidation.total).toBe(1);

        // Dashboard should still work
        const dashboardMetrics = await exportDashboardMetrics();
        expect(dashboardMetrics.overview).toBeDefined();

      } finally {
        console.error = originalConsoleError;
      }
    });

    it('should handle concurrent access safely', async () => {
      startPipelineHealthMonitoring();

      const concurrentOperations = 100;
      const promises = [];

      // Create many concurrent operations
      for (let i = 0; i < concurrentOperations; i++) {
        promises.push(
          Promise.resolve().then(async () => {
            recordLockOperation(`lock_${i}`, true, 1000, false);
            recordParameterValidation(`op_${i}`, { id: i }, true, []);
            
            // Also test async operations
            await userProcessingMonitor.monitorUserProcessing(
              `user_${i}`,
              'HOBBY',
              async () => ({ filingsProcessed: 1, cost: 0.01 })
            );
          })
        );
      }

      await Promise.all(promises);

      const metrics = getCurrentHealthMetrics();
      expect(metrics.lockTimeouts.total).toBe(concurrentOperations);
      expect(metrics.parameterValidation.total).toBe(concurrentOperations);
      expect(metrics.userProcessing.total).toBe(concurrentOperations);

      // All operations should have succeeded
      expect(metrics.lockTimeouts.timeoutRate).toBe(0);
      expect(metrics.parameterValidation.mismatchRate).toBe(0);
      expect(metrics.userProcessing.successRate).toBe(100);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with continuous operations', async () => {
      startPipelineHealthMonitoring();

      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations to test memory management
      for (let i = 0; i < 10000; i++) {
        recordLockOperation(`lock_${i}`, true, 1000, false);
        recordParameterValidation(`op_${i}`, { data: `data_${i}` }, true, []);
        recordSecApiOperation(`/api/${i}`, true, 1500, 200);
        recordUserProcessing(`user_${i}`, 'process', true, 2000);
        
        // Periodically check memory usage
        if (i % 1000 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = currentMemory - initialMemory;
          
          // Memory increase should be reasonable (less than 100MB)
          expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        }
      }

      // Final memory check
      const finalMemory = process.memoryUsage().heapUsed;
      const totalIncrease = finalMemory - initialMemory;
      
      // Should not have excessive memory growth
      expect(totalIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB increase
    });
  });
});