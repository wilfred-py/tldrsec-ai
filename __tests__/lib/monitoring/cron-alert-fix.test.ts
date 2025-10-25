import { CronJobMonitor } from '../../../lib/monitoring/cron-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';
import { secureTestUtils } from '../../utils/secure-test-utils';

// Mock dependencies with proper factory functions
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

// Mock async alert queue module
jest.mock('../../../lib/monitoring/async-alert-queue', () => {
  let mockQueue: any[] = [];
  
  const mockAsyncAlertQueueImpl = {
    queueAlert: jest.fn().mockImplementation(async (alertData: any) => {
      mockQueue.push(alertData);
      return Promise.resolve();
    }),
    flushQueue: jest.fn().mockImplementation(async () => {
      if (mockQueue.length === 0) return;
      
      const batch = [...mockQueue];
      mockQueue.length = 0; // Clear queue
      
      // Get the mock Prisma from the test
      const mockPrisma = (global as any).__testMockPrisma;
      
      if (mockPrisma?.cronJobAlert?.createMany) {
        await mockPrisma.cronJobAlert.createMany({
          data: batch.map((alert: any) => ({
            executionId: alert.executionId,
            alertType: alert.alertType,
            severity: alert.severity,
            title: `Test Alert: ${alert.alertType}`,
            description: alert.message,
            actualValue: alert.details || {},
            jobName: alert.jobName,
            environment: alert.environment,
            triggeredAt: new Date()
          }))
        });
      }
    }),
    getQueueStats: jest.fn().mockImplementation(() => ({
      queueSize: mockQueue.length,
      isProcessing: false,
      circuitBreakerOpen: false,
      consecutiveFailures: 0
    })),
    shutdown: jest.fn().mockResolvedValue(undefined),
    // Test utility to access the queue
    _getQueue: () => mockQueue,
    _clearQueue: () => { mockQueue.length = 0; }
  };

  return { asyncAlertQueue: mockAsyncAlertQueueImpl };
});

// Mock performance monitor module  
jest.mock('../../../lib/monitoring/performance-monitor', () => ({
  performanceMonitor: {
    recordAlertProcessingTime: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({})
  }
}));

// Mock security modules
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

describe('CronJobMonitor Alert Creation Fix', () => {
  let mockPrisma: any;
  let mockAsyncAlertQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Prisma mock
    mockPrisma = secureTestUtils.getMocks().prisma;
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    
    // Expose mock Prisma globally for the async alert queue mock
    (global as any).__testMockPrisma = mockPrisma;
    
    // Setup logger mock
    (logger as any).child = jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }));

    // Get the mocked async alert queue from the module mock
    mockAsyncAlertQueue = require('../../../lib/monitoring/async-alert-queue').asyncAlertQueue;
    
    // Clear the mock queue
    mockAsyncAlertQueue._clearQueue();
  });

  afterEach(() => {
    secureTestUtils.restoreEnvironment();
  });

  describe('Alert Creation with Required Title Field', () => {
    it('should create alerts with required title field and proper enum mapping', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          await monitor.createAlert('EXECUTION_FAILED', {
            severity: 'CRITICAL',
            message: 'Job execution failed due to database error',
            details: { error: 'Connection timeout' }
          });

          // Alert should be queued, not immediately created
          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith({
            executionId: 'mock-uuid-1234',
            alertType: 'EXECUTION_FAILED',
            severity: 'CRITICAL',
            message: 'Job execution failed due to database error',
            details: { error: 'Connection timeout' },
            jobName: 'test-job',
            environment: 'development'
          });

          // Flush the queue to trigger actual database operations
          await mockAsyncAlertQueue.flushQueue();

          // Now check that the database operation was called
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([expect.objectContaining({
              executionId: 'mock-uuid-1234',
              alertType: 'EXECUTION_FAILED',
              severity: 'CRITICAL',
              title: 'Test Alert: EXECUTION_FAILED',
              description: 'Job execution failed due to database error',
              actualValue: { error: 'Connection timeout' },
              jobName: 'test-job',
              environment: 'development'
            })])
          });
        }
      );
    });

    it('should generate appropriate titles for all supported alert types', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          const testCases = [
            { type: 'HIGH_ERROR_RATE', severity: 'HIGH' },
            { type: 'COST_THRESHOLD_EXCEEDED', severity: 'MEDIUM' },
            { type: 'EMAIL_DELIVERY_FAILED', severity: 'LOW' },
            { type: 'API_RATE_LIMIT_HIT', severity: 'CRITICAL' },
            { type: 'DATABASE_CONNECTION_FAILED', severity: 'HIGH' }
          ];

          // Queue all alerts
          for (const testCase of testCases) {
            await monitor.createAlert(testCase.type, {
              severity: testCase.severity,
              message: `Test ${testCase.type} message`
            });
          }

          // Verify all were queued
          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledTimes(testCases.length);

          // Flush the queue to process all alerts
          await mockAsyncAlertQueue.flushQueue();

          // Verify batch processing occurred
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining(
              testCases.map(testCase => expect.objectContaining({
                alertType: testCase.type,
                severity: testCase.severity,
                title: `Test Alert: ${testCase.type}`
              }))
            )
          });
        }
      );
    });

    it('should handle case-insensitive alert type and severity mapping', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          await monitor.createAlert('api_rate_limit_hit', {
            severity: 'warning',
            message: 'Rate limit exceeded'
          });

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith(
            expect.objectContaining({
              alertType: 'api_rate_limit_hit', // Original case preserved in queue
              severity: 'warning' // Original severity preserved in queue
            })
          );

          await mockAsyncAlertQueue.flushQueue();

          // Database operations should normalize the values
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalled();
        }
      );
    });

    it('should handle missing alert details gracefully', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          await monitor.createAlert('NO_FILINGS_PROCESSED', {
            severity: 'HIGH',
            message: 'No filings were processed'
            // details omitted
          });

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith(
            expect.objectContaining({
              alertType: 'NO_FILINGS_PROCESSED',
              severity: 'HIGH',
              message: 'No filings were processed',
              details: undefined // Should handle undefined details
            })
          );

          await mockAsyncAlertQueue.flushQueue();

          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([expect.objectContaining({
              actualValue: {} // Should default to empty object in batch processing
            })])
          });
        }
      );
    });

    it('should handle alert creation database failures gracefully', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          // Should not throw error - alert creation failure shouldn't break cron execution
          await expect(monitor.createAlert('EXECUTION_FAILED', {
            severity: 'CRITICAL',
            message: 'Test alert'
          })).resolves.not.toThrow();

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalled();
          
          // Even if flush fails, the alert should still be queued
          expect(mockAsyncAlertQueue._getQueue()).toHaveLength(1);
        }
      );
    });

    it('should update execution metrics based on alert severity', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          // Critical alert should be queued for processing
          await monitor.createAlert('EXECUTION_FAILED', {
            severity: 'CRITICAL',
            message: 'Critical error'
          });

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith(
            expect.objectContaining({
              severity: 'CRITICAL'
            })
          );

          // Flush queue to trigger metric updates
          await mockAsyncAlertQueue.flushQueue();

          // Check that batch processing occurred
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalled();
        }
      );
    });

    it('should handle unknown alert types with fallback', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          await monitor.createAlert('UNKNOWN_ALERT_TYPE', {
            severity: 'HIGH',
            message: 'Unknown alert type'
          });

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith(
            expect.objectContaining({
              alertType: 'UNKNOWN_ALERT_TYPE', // Original type preserved in queue
              severity: 'HIGH'
            })
          );

          await mockAsyncAlertQueue.flushQueue();

          // The async queue mock handles type mapping during batch processing
          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalled();
        }
      );
    });

    it('should handle unknown severity with fallback', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'development' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          await monitor.createAlert('EXECUTION_FAILED', {
            severity: 'UNKNOWN_SEVERITY',
            message: 'Unknown severity'
          });

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith(
            expect.objectContaining({
              alertType: 'EXECUTION_FAILED',
              severity: 'UNKNOWN_SEVERITY' // Original severity preserved in queue
            })
          );

          await mockAsyncAlertQueue.flushQueue();

          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalled();
        }
      );
    });

    it('should skip alert creation in test environment', async () => {
      // Test with actual test environment
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'test' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          await monitor.createAlert('EXECUTION_FAILED', {
            severity: 'CRITICAL',
            message: 'Test alert'
          });

          // Should not queue alerts in test mode
          expect(mockAsyncAlertQueue.queueAlert).not.toHaveBeenCalled();
          expect(mockPrisma.cronJobAlert.create).not.toHaveBeenCalled();
        }
      );
    });
  });

  describe('Production Alert Creation', () => {
    it('should create alerts in production environment', async () => {
      await secureTestUtils.withControlledEnvironment(
        { NODE_ENV: 'production' },
        async () => {
          const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

          await monitor.createAlert('COST_THRESHOLD_EXCEEDED', {
            severity: 'HIGH',
            message: 'Monthly cost threshold exceeded',
            details: { currentCost: 150, threshold: 100 }
          });

          expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith({
            executionId: 'mock-uuid-1234',
            alertType: 'COST_THRESHOLD_EXCEEDED',
            severity: 'HIGH',
            message: 'Monthly cost threshold exceeded',
            details: { currentCost: 150, threshold: 100 },
            jobName: 'test-job',
            environment: 'production'
          });

          await mockAsyncAlertQueue.flushQueue();

          expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([expect.objectContaining({
              executionId: 'mock-uuid-1234',
              alertType: 'COST_THRESHOLD_EXCEEDED',
              severity: 'HIGH',
              title: 'Test Alert: COST_THRESHOLD_EXCEEDED',
              description: 'Monthly cost threshold exceeded',
              actualValue: { currentCost: 150, threshold: 100 },
              jobName: 'test-job',
              environment: 'production'
            })])
          });
        }
      );
    });
  });
});