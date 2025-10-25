/**
 * Async Integration Tests
 * 
 * Tests the integration between CronJobMonitor and async alert processing,
 * focusing on the key improvements: non-blocking alert creation and proper
 * async behavior.
 */

import { CronJobMonitor } from '../../../lib/monitoring/cron-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';
import { secureTestUtils } from '../../utils/secure-test-utils';

// Mock dependencies with async behavior
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-execution-id')
}));

// Create mock async alert queue that tracks timing
let mockAlertQueue: any[] = [];
let totalQueueTime = 0;
let totalFlushTime = 0;

jest.mock('../../../lib/monitoring/async-alert-queue', () => ({
  asyncAlertQueue: {
    queueAlert: jest.fn().mockImplementation(async (alertData: any) => {
      const start = performance.now();
      mockAlertQueue.push(alertData);
      totalQueueTime += performance.now() - start;
      return Promise.resolve();
    }),
    flushQueue: jest.fn().mockImplementation(async () => {
      const start = performance.now();
      const batch = [...mockAlertQueue];
      mockAlertQueue.length = 0;
      
      const mockPrisma = (global as any).__testMockPrisma;
      if (mockPrisma?.cronJobAlert?.createMany && batch.length > 0) {
        await mockPrisma.cronJobAlert.createMany({
          data: batch.map((alert: any) => ({
            executionId: alert.executionId,
            alertType: alert.alertType,
            severity: alert.severity,
            title: `${alert.severity}: ${alert.alertType}`,
            description: alert.message,
            actualValue: alert.details || {},
            jobName: alert.jobName,
            environment: alert.environment,
            triggeredAt: new Date()
          }))
        });
      }
      totalFlushTime += performance.now() - start;
    }),
    getQueueStats: jest.fn().mockImplementation(() => ({
      queueSize: mockAlertQueue.length,
      isProcessing: false,
      circuitBreakerOpen: false,
      consecutiveFailures: 0
    })),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock other dependencies
jest.mock('../../../lib/monitoring/performance-monitor', () => ({
  performanceMonitor: {
    recordAlertProcessingTime: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({})
  }
}));

jest.mock('../../../lib/security/data-sanitizer', () => ({
  dataSanitizer: {},
  sanitize: {
    logContext: jest.fn((data) => data),
    userId: jest.fn((userId) => `sanitized_${userId}`),
    string: jest.fn((str) => str)
  }
}));

jest.mock('../../../lib/security/validation-schemas', () => ({
  SecureValidator: {
    validateUserNotification: jest.fn((data) => data)
  }
}));

jest.mock('../../../lib/security/rbac', () => ({
  rbacAuthorizer: {
    authorize: jest.fn().mockResolvedValue({ authorized: true, reason: 'test_authorized' })
  },
  UserRole: { SYSTEM: 'SYSTEM' },
  ResourceType: { USER_DATA: 'USER_DATA' },
  Operation: { UPDATE: 'UPDATE' }
}));

jest.mock('../../../lib/security/secure-logger', () => ({
  secureLogger: {},
  auditLog: {
    userNotified: jest.fn().mockResolvedValue(undefined),
    securityViolation: jest.fn().mockResolvedValue(undefined)
  },
  SecuritySeverity: { MEDIUM: 'MEDIUM' }
}));

describe('Async Integration Tests', () => {
  let mockPrisma: any;
  let mockAsyncAlertQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset tracking variables
    mockAlertQueue.length = 0;
    totalQueueTime = 0;
    totalFlushTime = 0;
    
    // Setup Prisma mock
    mockPrisma = secureTestUtils.getMocks().prisma;
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    (global as any).__testMockPrisma = mockPrisma;
    
    // Setup logger mock
    (logger as any).child = jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }));

    // Get the mocked async alert queue
    mockAsyncAlertQueue = require('../../../lib/monitoring/async-alert-queue').asyncAlertQueue;
  });

  afterEach(() => {
    secureTestUtils.restoreEnvironment();
  });

  describe('Performance Improvements', () => {
    it('should queue alerts quickly without blocking main thread', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('performance-test', 'MANUAL');

          const alertCount = 50;
          const startTime = performance.now();

          // Create many alerts in sequence
          for (let i = 0; i < alertCount; i++) {
            await monitor.createAlert('HIGH_ERROR_RATE', {
              severity: 'HIGH',
              message: `Performance test alert ${i}`,
              details: { alertIndex: i }
            });
          }

          const totalTime = performance.now() - startTime;
          
          // Each alert should be queued very quickly (target: <1ms per alert)
          const avgTimePerAlert = totalTime / alertCount;
          expect(avgTimePerAlert).toBeLessThan(5); // Allow some margin for test overhead
          
          // All alerts should be queued
          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledTimes(alertCount);
          
          // Queue should contain all alerts
          const stats = mockAsyncAlertQueue.getQueueStats();
          expect(stats.queueSize).toBe(alertCount);
        }
      );
    });

    it('should process alerts in batches efficiently', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('batch-test', 'MANUAL');

          // Queue multiple alerts
          const alertCount = 25;
          for (let i = 0; i < alertCount; i++) {
            await monitor.createAlert('EMAIL_DELIVERY_FAILED', {
              severity: 'MEDIUM',
              message: `Batch test alert ${i}`,
              details: { batchIndex: i }
            });
          }

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledTimes(alertCount);

          // Flush the queue
          const flushStart = performance.now();
          await mockAsyncAlertQueue.flushQueue();
          const flushTime = performance.now() - flushStart;

          // Batch processing should be efficient
          expect(flushTime).toBeLessThan(50); // Should process 25 alerts in <50ms

          // Should have called createMany with all alerts
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining(
              Array.from({ length: alertCount }, (_, i) =>
                expect.objectContaining({
                  description: `Batch test alert ${i}`,
                  actualValue: { batchIndex: i }
                })
              )
            )
          });
        }
      );
    });

    it('should maintain performance under concurrent load', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('concurrent-test', 'MANUAL');

          const concurrentRequests = 20;
          const alertsPerRequest = 5;
          
          const startTime = performance.now();

          // Create concurrent alert batches
          const requestPromises = Array.from({ length: concurrentRequests }, async (_, requestIndex) => {
            const alertPromises = Array.from({ length: alertsPerRequest }, (_, alertIndex) =>
              monitor.createAlert('API_RATE_LIMIT_HIT', {
                severity: 'HIGH',
                message: `Concurrent alert ${requestIndex}-${alertIndex}`,
                details: { requestIndex, alertIndex }
              })
            );
            return Promise.all(alertPromises);
          });

          await Promise.all(requestPromises);

          const totalTime = performance.now() - startTime;
          const totalAlerts = concurrentRequests * alertsPerRequest;

          // Should handle concurrent load efficiently
          expect(totalTime).toBeLessThan(1000); // 100 alerts in <1 second
          
          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledTimes(totalAlerts);
          
          const stats = mockAsyncAlertQueue.getQueueStats();
          expect(stats.queueSize).toBe(totalAlerts);
        }
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle alert queueing failures gracefully', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('error-test', 'MANUAL');

          // Mock queue failure
          mockAsyncAlertQueue.queueAlert.mockRejectedValueOnce(new Error('Queue failed'));

          // Should not throw error
          await expect(monitor.createAlert('EXECUTION_FAILED', {
            severity: 'CRITICAL',
            message: 'Test alert that should fail'
          })).resolves.not.toThrow();

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalled();
        }
      );
    });

    it('should handle batch processing failures', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('batch-error-test', 'MANUAL');

          // Queue some alerts
          await monitor.createAlert('DATABASE_CONNECTION_FAILED', {
            severity: 'CRITICAL',
            message: 'DB connection failed'
          });

          // Mock flush failure
          mockPrisma.cronJobAlert.createMany.mockRejectedValueOnce(new Error('DB Error'));

          // Should handle flush failure gracefully
          await expect(mockAsyncAlertQueue.flushQueue()).rejects.toThrow('DB Error');

          // Original alert should still be in queue
          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalled();
        }
      );
    });
  });

  describe('Integration with Security Features', () => {
    it('should validate alert data before queueing', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('security-test', 'MANUAL');

          await monitor.createAlert('EXECUTION_FAILED', {
            severity: 'CRITICAL',
            message: 'Security validation test',
            details: { sensitive: 'data' }
          });

          // Should queue the alert with proper data
          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith({
            executionId: 'test-execution-id',
            alertType: 'EXECUTION_FAILED',
            severity: 'CRITICAL',
            message: 'Security validation test',
            details: { sensitive: 'data' },
            jobName: 'security-test',
            environment: 'development'
          });
        }
      );
    });

    it('should record performance metrics for alert operations', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('metrics-test', 'MANUAL');
          const performanceMonitor = require('../../../lib/monitoring/performance-monitor').performanceMonitor;

          await monitor.createAlert('COST_THRESHOLD_EXCEEDED', {
            severity: 'HIGH',
            message: 'Cost threshold exceeded'
          });

          // Should record alert processing time
          expect(performanceMonitor.recordAlertProcessingTime).toHaveBeenCalledWith(
            expect.any(Number)
          );
        }
      );
    });
  });

  describe('Production Scenario Simulation', () => {
    it('should simulate SEC filing processing with multiple alerts', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'production' },
        async () => {
          const monitor = await CronJobMonitor.create('sec-filing-processor', 'RAILWAY_CRON');

          // Simulate processing 10 companies with various issues
          const companies = ['TSLA', 'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'JPM', 'V', 'JNJ'];
          
          const alertPromises = companies.map(async (ticker, index) => {
            // Each company has different types of alerts
            const alertTypes = [
              'HIGH_ERROR_RATE',
              'EMAIL_DELIVERY_FAILED', 
              'API_RATE_LIMIT_HIT',
              'COST_THRESHOLD_EXCEEDED'
            ];

            return Promise.all(alertTypes.map(alertType =>
              monitor.createAlert(alertType, {
                severity: ['LOW', 'MEDIUM', 'HIGH'][index % 3],
                message: `${alertType} for ${ticker}`,
                details: { 
                  ticker,
                  companyIndex: index,
                  processingTime: Math.random() * 1000,
                  errorCode: `ERR_${alertType}_${ticker}`
                }
              })
            ));
          });

          const startTime = performance.now();
          await Promise.all(alertPromises);
          const processingTime = performance.now() - startTime;

          // Should process 40 alerts (10 companies × 4 alert types) quickly
          expect(processingTime).toBeLessThan(500);

          const totalAlerts = companies.length * 4;
          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledTimes(totalAlerts);

          // Process all alerts
          await mockAsyncAlertQueue.flushQueue();

          // Should have processed all alerts
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([
              expect.objectContaining({
                description: expect.stringMatching(/HIGH_ERROR_RATE for (TSLA|AAPL|GOOGL)/),
                environment: 'production'
              })
            ])
          });
        }
      );
    });

    it('should handle complete filing processing workflow', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'production' },
        async () => {
          const monitor = await CronJobMonitor.create('filing-workflow', 'VERCEL_CRON');

          // Simulate workflow stages
          const workflowStages = [
            { stage: 'fetch', alertType: 'API_RATE_LIMIT_HIT', severity: 'MEDIUM' },
            { stage: 'parse', alertType: 'HIGH_ERROR_RATE', severity: 'HIGH' },
            { stage: 'summarize', alertType: 'COST_THRESHOLD_EXCEEDED', severity: 'HIGH' },
            { stage: 'notify', alertType: 'EMAIL_DELIVERY_FAILED', severity: 'MEDIUM' }
          ];

          for (const { stage, alertType, severity } of workflowStages) {
            await monitor.createAlert(alertType, {
              severity,
              message: `Issue in ${stage} stage`,
              details: { 
                stage,
                timestamp: new Date().toISOString(),
                workflowId: 'workflow-123'
              }
            });
          }

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledTimes(workflowStages.length);

          // Process the workflow alerts
          await mockAsyncAlertQueue.flushQueue();

          // Verify alerts were processed with workflow context
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([
              expect.objectContaining({
                description: 'Issue in fetch stage',
                actualValue: expect.objectContaining({
                  stage: 'fetch',
                  workflowId: 'workflow-123'
                })
              })
            ])
          });
        }
      );
    });
  });

  describe('Monitoring and Observability', () => {
    it('should provide queue statistics for monitoring', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('monitoring-test', 'MANUAL');

          // Initial state
          let stats = mockAsyncAlertQueue.getQueueStats();
          expect(stats.queueSize).toBe(0);
          expect(stats.isProcessing).toBe(false);

          // Queue some alerts
          await monitor.createAlert('EXECUTION_FAILED', {
            severity: 'CRITICAL',
            message: 'Monitor test alert 1'
          });

          await monitor.createAlert('HIGH_ERROR_RATE', {
            severity: 'HIGH', 
            message: 'Monitor test alert 2'
          });

          // Stats should reflect queued alerts
          stats = mockAsyncAlertQueue.getQueueStats();
          expect(stats.queueSize).toBe(2);
        }
      );
    });

    it('should track timing and performance metrics', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('timing-test', 'MANUAL');

          const alertCount = 10;
          for (let i = 0; i < alertCount; i++) {
            await monitor.createAlert('PERFORMANCE_DEGRADED', {
              severity: 'MEDIUM',
              message: `Timing test alert ${i}`
            });
          }

          // Total queue time should be minimal
          expect(totalQueueTime).toBeLessThan(50); // <5ms per alert on average

          await mockAsyncAlertQueue.flushQueue();

          // Flush time should also be reasonable
          expect(totalFlushTime).toBeLessThan(100);
        }
      );
    });
  });
});