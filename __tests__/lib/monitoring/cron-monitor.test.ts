import { CronJobMonitor, CronJobAnalytics } from '../../../lib/monitoring/cron-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');
jest.mock('../../../lib/monitoring/async-alert-queue');
jest.mock('../../../lib/monitoring/performance-monitor');
jest.mock('../../../lib/security/data-sanitizer');
jest.mock('../../../lib/security/validation-schemas');
jest.mock('../../../lib/security/rbac');
jest.mock('../../../lib/security/secure-logger');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

// Mock async alert queue
const mockAsyncAlertQueue = {
  queueAlert: jest.fn().mockResolvedValue(undefined),
  getQueueStats: jest.fn().mockReturnValue({
    queueSize: 0,
    isProcessing: false,
    circuitBreakerOpen: false,
    consecutiveFailures: 0
  }),
  shutdown: jest.fn().mockResolvedValue(undefined)
};

// Mock performance monitor
const mockPerformanceMonitor = {
  recordAlertProcessingTime: jest.fn(),
  getMetrics: jest.fn().mockReturnValue({})
};

// Mock security modules
const mockSanitize = {
  logContext: jest.fn((data) => data),
  userId: jest.fn((userId) => `sanitized_${userId}`),
  string: jest.fn((str) => str)
};

const mockSecureValidator = {
  validateUserNotification: jest.fn((data) => data)
};

const mockRbacAuthorizer = {
  authorize: jest.fn().mockResolvedValue({ authorized: true, reason: 'test_authorized' })
};

const mockAuditLog = {
  userNotified: jest.fn().mockResolvedValue(undefined),
  securityViolation: jest.fn().mockResolvedValue(undefined)
};

// Apply mocks
require('../../../lib/monitoring/async-alert-queue').asyncAlertQueue = mockAsyncAlertQueue;
require('../../../lib/monitoring/performance-monitor').performanceMonitor = mockPerformanceMonitor;
require('../../../lib/security/data-sanitizer').dataSanitizer = {};
require('../../../lib/security/data-sanitizer').sanitize = mockSanitize;
require('../../../lib/security/validation-schemas').SecureValidator = mockSecureValidator;
require('../../../lib/security/rbac').rbacAuthorizer = mockRbacAuthorizer;
require('../../../lib/security/rbac').UserRole = { SYSTEM: 'SYSTEM' };
require('../../../lib/security/rbac').ResourceType = { USER_DATA: 'USER_DATA' };
require('../../../lib/security/rbac').Operation = { UPDATE: 'UPDATE' };
require('../../../lib/security/secure-logger').secureLogger = {};
require('../../../lib/security/secure-logger').auditLog = mockAuditLog;
require('../../../lib/security/secure-logger').SecuritySeverity = { MEDIUM: 'MEDIUM' };

describe('CronJobMonitor', () => {
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear environment variables to avoid test mode detection
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJestWorker = process.env.JEST_WORKER_ID;
    
    // Force non-test environment for testing database operations
    process.env.NODE_ENV = 'development';
    delete process.env.JEST_WORKER_ID;
    
    mockPrisma = {
      cronJobExecution: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        groupBy: jest.fn()
      },
      cronJobAlert: {
        create: jest.fn()
      },
      filingProcessingLog: {
        groupBy: jest.fn()
      }
    };

    mockLogger = {
      child: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }))
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    (logger as any).child = mockLogger.child;
    
    // Re-apply mocks after clearAllMocks
    mockAsyncAlertQueue.queueAlert = jest.fn().mockResolvedValue(undefined);
    mockPerformanceMonitor.recordAlertProcessingTime = jest.fn();
    
    // Store original values for cleanup
    (global as any).__originalEnvVars = { originalNodeEnv, originalJestWorker };
  });
  
  afterEach(() => {
    // Restore original environment variables
    const { originalNodeEnv, originalJestWorker } = (global as any).__originalEnvVars || {};
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalJestWorker !== undefined) {
      process.env.JEST_WORKER_ID = originalJestWorker;
    }
  });

  describe('Factory Method and Initialization', () => {
    it('should handle database connection failures gracefully during initialization', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.cronJobExecution.create.mockRejectedValue(dbError);

      await expect(CronJobMonitor.create('test-job', 'MANUAL')).rejects.toThrow('Database connection failed');
    });

    it('should create monitor successfully with valid database connection', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // Operations should work normally
      await monitor.updateMetrics({ tickersChecked: 5 });
      await monitor.complete('SUCCESS');
      
      expect(mockPrisma.cronJobExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobName: 'test-job',
          executionId: 'mock-uuid-1234',
          status: 'STARTED'
        })
      });
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledTimes(2);
    });

    it('should initialize with proper execution ID and metrics', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      expect(monitor.getExecutionId()).toBe('mock-uuid-1234');
      expect(monitor.getCurrentMetrics()).toEqual({
        tickersChecked: 0,
        newFilingsFound: 0,
        filingsProcessed: 0,
        emailsSent: 0,
        usersNotified: 0,
        totalCostUSD: 0,
        aiCostUSD: 0,
        emailCostUSD: 0,
        tokensUsed: 0,
        errorCount: 0,
        warningCount: 0
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database errors during metric updates gracefully', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockRejectedValue(new Error('Update failed'));

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // Should not throw despite database error
      await expect(monitor.updateMetrics({ tickersChecked: 1 })).resolves.not.toThrow();
      
      // Internal metrics should still be updated
      const metrics = monitor.getCurrentMetrics();
      expect(metrics.tickersChecked).toBe(1);
    });

    it('should handle database errors during completion and return fallback result', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockRejectedValue(new Error('Completion failed'));

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // Should not throw but return fallback result 
      const result = await monitor.complete('SUCCESS');
      
      expect(result).toEqual({
        executionId: 'mock-uuid-1234',
        duration: expect.any(Number),
        status: 'SUCCESS',
        metrics: expect.any(Object)
      });
    });

    it('should handle partial database update failures', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      
      let updateCallCount = 0;
      mockPrisma.cronJobExecution.update.mockImplementation(() => {
        updateCallCount++;
        if (updateCallCount === 1) {
          return Promise.reject(new Error('First update failed'));
        }
        return Promise.resolve({ id: 'test-id' });
      });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // First update fails
      await monitor.updateMetrics({ tickersChecked: 1 });
      
      // Second update succeeds
      await monitor.updateMetrics({ filingsProcessed: 1 });
      
      expect(updateCallCount).toBe(2);
      
      // Internal state should reflect both updates
      const metrics = monitor.getCurrentMetrics();
      expect(metrics.tickersChecked).toBe(1);
      expect(metrics.filingsProcessed).toBe(1);
    });
  });

  describe('Status Changes and Completion', () => {
    it('should record SUCCESS status correctly', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      const result = await monitor.complete('SUCCESS');
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: expect.objectContaining({
          status: 'SUCCESS',
          completedAt: expect.any(Date),
          durationMs: expect.any(Number)
        })
      });
      
      expect(result.status).toBe('SUCCESS');
      expect(result.executionId).toBe('mock-uuid-1234');
    });

    it('should handle all valid status transitions', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const statuses: Array<'SUCCESS' | 'FAILED' | 'TIMEOUT'> = ['SUCCESS', 'FAILED', 'TIMEOUT'];
      
      for (const status of statuses) {
        const monitor = await CronJobMonitor.create(`test-job-${status}`, 'MANUAL');
        
        const result = await monitor.complete(status, status === 'FAILED' ? 'Test error' : undefined);
        
        expect(result.status).toBe(status);
        expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
          where: { executionId: 'mock-uuid-1234' },
          data: expect.objectContaining({
            status,
            errorMessage: status === 'FAILED' ? 'Test error' : undefined
          })
        });
        
        jest.clearAllMocks();
        mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
        mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });
      }
    });

    it('should calculate duration accurately', async () => {
      jest.useFakeTimers();
      const startTime = new Date('2024-01-01T10:00:00Z');
      jest.setSystemTime(startTime);

      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // Advance time by 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);
      
      const result = await monitor.complete('SUCCESS');
      
      expect(result.duration).toBe(5 * 60 * 1000); // 5 minutes in ms
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: expect.objectContaining({
          durationMs: 5 * 60 * 1000
        })
      });
      
      jest.useRealTimers();
    });
  });

  describe('Metrics Tracking', () => {
    it('should track all supported metrics accurately', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // Update various metrics
      await monitor.updateMetrics({
        tickersChecked: 10,
        newFilingsFound: 5,
        filingsProcessed: 4,
        emailsSent: 8,
        usersNotified: 6,
        errorCount: 1,
        warningCount: 2
      });
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: {
          tickersChecked: 10,
          newFilingsFound: 5,
          filingsProcessed: 4,
          emailsSent: 8,
          errorsCount: 1
        }
      });
      
      const metrics = monitor.getCurrentMetrics();
      expect(metrics).toEqual({
        tickersChecked: 10,
        newFilingsFound: 5,
        filingsProcessed: 4,
        emailsSent: 8,
        usersNotified: 6,
        totalCostUSD: 0,
        aiCostUSD: 0,
        emailCostUSD: 0,
        tokensUsed: 0,
        errorCount: 1,
        warningCount: 2
      });
    });

    it('should handle partial metric updates', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // Update only some metrics
      await monitor.updateMetrics({ tickersChecked: 5 });
      await monitor.updateMetrics({ filingsProcessed: 3 });
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledTimes(2);
      
      const metrics = monitor.getCurrentMetrics();
      expect(metrics.tickersChecked).toBe(5);
      expect(metrics.filingsProcessed).toBe(3);
      expect(metrics.emailsSent).toBe(0); // Should remain at default
    });

    it('should handle filing processing metrics', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      const filingMetrics = {
        accessionNumber: '0001234567-24-000001',
        ticker: 'TSLA',
        companyName: 'Tesla Inc',
        filingType: '10-K',
        filingDate: new Date('2024-01-01'),
        filingUrl: 'https://sec.gov/filing',
        processingTimeMs: 1500,
        summaryTokens: 2000,
        summaryCostUSD: 0.05,
        aiModel: 'claude-3-haiku',
        emailsSent: 2
      };
      
      await monitor.recordFilingProcessing(filingMetrics, 'SUCCESS');
      
      // Should update execution metrics
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: {
          filingsProcessed: 1,
          emailsSent: 2
        }
      });
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle zero metrics correctly', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      await monitor.updateMetrics({ tickersChecked: 0, errorCount: 0 });
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: {
          tickersChecked: 0,
          errorsCount: 0
        }
      });
    });

    it('should handle very large metric values', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      const largeValue = Number.MAX_SAFE_INTEGER;
      await monitor.updateMetrics({ tickersChecked: largeValue });
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: {
          tickersChecked: largeValue
        }
      });
    });

    it('should handle undefined metric updates gracefully', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      // Pass object with undefined values
      await monitor.updateMetrics({ 
        tickersChecked: 5,
        newFilingsFound: undefined,
        filingsProcessed: undefined 
      });
      
      // Should only include defined values in DB update
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: {
          tickersChecked: 5
        }
      });
    });

    it('should handle empty metric updates', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      await monitor.updateMetrics({});
      
      // Should still call update with empty data object
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: {}
      });
    });
  });

  describe('Async Alert Queue Integration', () => {
    it('should queue alerts through async alert queue', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('EXECUTION_FAILED', {
        severity: 'CRITICAL',
        message: 'Job execution failed due to database error',
        details: { error: 'Connection timeout' }
      });

      expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalledWith({
        executionId: 'mock-uuid-1234',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        message: 'Job execution failed due to database error',
        details: { error: 'Connection timeout' },
        jobName: 'test-job',
        environment: 'development'
      });
    });

    it('should handle async alert queue failures gracefully', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockAsyncAlertQueue.queueAlert.mockRejectedValue(new Error('Queue failed'));

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      // Should not throw error
      await expect(monitor.createAlert('HIGH_ERROR_RATE', {
        severity: 'HIGH',
        message: 'Error rate exceeded'
      })).resolves.not.toThrow();

      expect(mockAsyncAlertQueue.queueAlert).toHaveBeenCalled();
    });

    it('should record performance metrics for alert processing', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('EMAIL_DELIVERY_FAILED', {
        severity: 'MEDIUM',
        message: 'Email failed'
      });

      expect(mockPerformanceMonitor.recordAlertProcessingTime).toHaveBeenCalledWith(
        expect.any(Number)
      );
    });
  });

  describe('Security Integration Tests', () => {
    it('should sanitize user notification data', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.recordUserNotification(
        'user-123',
        'test@example.com',
        'TSLA',
        'delivered',
        0.001
      );

      expect(mockSecureValidator.validateUserNotification).toHaveBeenCalledWith({
        userId: 'user-123',
        userEmail: 'test@example.com',
        ticker: 'TSLA',
        deliveryStatus: 'delivered',
        deliveryCostUSD: 0.001
      });

      expect(mockRbacAuthorizer.authorize).toHaveBeenCalled();
      expect(mockAuditLog.userNotified).toHaveBeenCalled();
    });

    it('should handle RBAC authorization failures', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });
      mockRbacAuthorizer.authorize.mockResolvedValue({ 
        authorized: false, 
        reason: 'Insufficient permissions' 
      });

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.recordUserNotification(
        'user-123',
        'test@example.com',
        'TSLA',
        'delivered',
        0.001
      );

      expect(mockAuditLog.securityViolation).toHaveBeenCalledWith(
        'user_notification_failed',
        'MEDIUM',
        'Failed to record user notification',
        expect.objectContaining({
          userId: 'sanitized_user-123',
          ticker: 'TSLA'
        })
      );
    });
  });

  describe('Multi-tenancy and Isolation', () => {
    it('should isolate different monitor instances', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor1 = await CronJobMonitor.create('job-1', 'MANUAL');
      const monitor2 = await CronJobMonitor.create('job-2', 'RAILWAY_CRON');
      
      await monitor1.updateMetrics({ tickersChecked: 5 });
      await monitor2.updateMetrics({ tickersChecked: 10 });
      
      const metrics1 = monitor1.getCurrentMetrics();
      const metrics2 = monitor2.getCurrentMetrics();
      
      expect(metrics1.tickersChecked).toBe(5);
      expect(metrics2.tickersChecked).toBe(10);
      
      // Should have same execution IDs (due to mock)
      expect(monitor1.getExecutionId()).toBe(monitor2.getExecutionId());
    });

    it('should handle different trigger sources correctly', async () => {
      const sources = ['VERCEL_CRON', 'RAILWAY_CRON', 'MANUAL', 'EXTERNAL'] as const;
      
      for (const source of sources) {
        mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
        
        const monitor = await CronJobMonitor.create('test-job', source);
        
        expect(mockPrisma.cronJobExecution.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            jobName: 'test-job'
          })
        });
        
        jest.clearAllMocks();
      }
    });
  });
});

describe('CronJobAnalytics', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPrisma = {
      cronJobExecution: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        groupBy: jest.fn()
      },
      filingProcessingLog: {
        groupBy: jest.fn()
      }
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
  });

  describe('Analytics Query Functions', () => {
    it('should fetch recent executions with proper includes', async () => {
      const mockExecutions = [
        {
          id: '1',
          jobName: 'test-job',
          status: 'SUCCESS',
          startedAt: new Date(),
          filingProcessingLogs: [],
          userNotificationLogs: []
        }
      ];

      mockPrisma.cronJobExecution.findMany.mockResolvedValue(mockExecutions);

      const result = await CronJobAnalytics.getRecentExecutions(5);

      expect(mockPrisma.cronJobExecution.findMany).toHaveBeenCalledWith({
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: {
          filingProcessingLogs: {
            select: {
              ticker: true,
              filingType: true,
              status: true,
              summaryCostUSD: true
            }
          },
          userNotificationLogs: {
            select: {
              deliveryStatus: true,
              deliveryCostUSD: true
            }
          }
        }
      });

      expect(result).toEqual(mockExecutions);
    });

    it('should get daily cost summary with SUCCESS status filter', async () => {
      const mockCostData = [
        {
          createdAt: new Date(),
          _sum: {
            totalCostUSD: 10.50,
            aiCostUSD: 8.00,
            emailCostUSD: 2.50,
            tokensUsed: 5000
          },
          _count: {
            filingsProcessed: 5,
            usersNotified: 20
          }
        }
      ];

      mockPrisma.cronJobExecution.groupBy.mockResolvedValue(mockCostData);

      const result = await CronJobAnalytics.getDailyCostSummary(7);

      expect(mockPrisma.cronJobExecution.groupBy).toHaveBeenCalledWith({
        by: ['createdAt'],
        where: {
          createdAt: {
            gte: expect.any(Date)
          },
          status: 'SUCCESS'
        },
        _sum: {
          totalCostUSD: true,
          aiCostUSD: true,
          emailCostUSD: true,
          tokensUsed: true
        },
        _count: {
          filingsProcessed: true,
          usersNotified: true
        }
      });

      expect(result).toEqual(mockCostData);
    });

    it('should get ticker activity with proper grouping', async () => {
      const mockTickerData = [
        {
          ticker: 'TSLA',
          _count: { id: 5 },
          _sum: { summaryCostUSD: 2.50, emailsSent: 10 }
        }
      ];

      mockPrisma.filingProcessingLog.groupBy.mockResolvedValue(mockTickerData);

      const result = await CronJobAnalytics.getTickerActivity(7);

      expect(mockPrisma.filingProcessingLog.groupBy).toHaveBeenCalledWith({
        by: ['ticker'],
        where: {
          processedAt: {
            gte: expect.any(Date)
          }
        },
        _count: { id: true },
        _sum: {
          summaryCostUSD: true,
          emailsSent: true
        },
        orderBy: {
          _count: { id: 'desc' }
        }
      });

      expect(result).toEqual(mockTickerData);
    });

    it('should get current job status with running and completed job queries', async () => {
      const mockRunningJobs = [
        { id: '1', jobName: 'active-job', status: 'STARTED' }
      ];
      const mockLastCompleted = {
        id: '2',
        jobName: 'completed-job',
        status: 'SUCCESS'
      };

      mockPrisma.cronJobExecution.findMany.mockResolvedValue(mockRunningJobs);
      mockPrisma.cronJobExecution.findFirst.mockResolvedValue(mockLastCompleted);

      const result = await CronJobAnalytics.getCurrentJobStatus();

      expect(mockPrisma.cronJobExecution.findMany).toHaveBeenCalledWith({
        where: { status: 'STARTED' },
        orderBy: { startedAt: 'desc' }
      });

      expect(mockPrisma.cronJobExecution.findFirst).toHaveBeenCalledWith({
        where: { status: { in: ['SUCCESS', 'FAILED'] } },
        orderBy: { completedAt: 'desc' }
      });

      expect(result).toEqual({
        runningJobs: mockRunningJobs,
        lastCompletedJob: mockLastCompleted,
        isHealthy: false // Has running jobs
      });
    });

    it('should report healthy status when no running jobs and last job succeeded', async () => {
      mockPrisma.cronJobExecution.findMany.mockResolvedValue([]);
      mockPrisma.cronJobExecution.findFirst.mockResolvedValue({
        id: '1',
        status: 'SUCCESS'
      });

      const result = await CronJobAnalytics.getCurrentJobStatus();

      expect(result.isHealthy).toBe(true);
    });

    it('should report unhealthy status when last job failed', async () => {
      mockPrisma.cronJobExecution.findMany.mockResolvedValue([]);
      mockPrisma.cronJobExecution.findFirst.mockResolvedValue({
        id: '1',
        status: 'FAILED'
      });

      const result = await CronJobAnalytics.getCurrentJobStatus();

      expect(result.isHealthy).toBe(false);
    });
  });

  describe('Error Handling in Analytics', () => {
    it('should handle database errors in analytics queries', async () => {
      mockPrisma.cronJobExecution.findMany.mockRejectedValue(new Error('DB Error'));

      await expect(CronJobAnalytics.getRecentExecutions()).rejects.toThrow('DB Error');
    });

    it('should handle date calculation edge cases', async () => {
      // Test with very large day values
      mockPrisma.cronJobExecution.groupBy.mockResolvedValue([]);

      await CronJobAnalytics.getDailyCostSummary(999999);

      const call = mockPrisma.cronJobExecution.groupBy.mock.calls[0][0];
      expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    });
  });
});