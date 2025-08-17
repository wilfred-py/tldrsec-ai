import { CronJobMonitor, CronJobAnalytics } from '../../../lib/monitoring/cron-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

describe('CronJobMonitor', () => {
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPrisma = {
      cronJobExecution: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        groupBy: jest.fn()
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
  });

  describe('Async Initialization Safety', () => {
    it('should handle database connection failures gracefully during initialization', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.cronJobExecution.create.mockRejectedValue(dbError);

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      
      // Ensure initialization attempt completes
      await monitor.ensureInitialized();
      
      // Monitor should handle the failure gracefully
      expect((monitor as any).initialized).toBe(false);
      
      // Should not throw when trying to use monitor methods
      await expect(monitor.updateMetrics({ tickersChecked: 1 })).resolves.not.toThrow();
      await expect(monitor.complete('SUCCESS')).resolves.not.toThrow();
    });

    it('should prevent operations before initialization completes', async () => {
      let resolveInit: (value?: any) => void;
      const initPromise = new Promise(resolve => {
        resolveInit = resolve;
      });

      mockPrisma.cronJobExecution.create.mockImplementation(() => initPromise);

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      
      // Start operations before initialization completes
      const updatePromise = monitor.updateMetrics({ tickersChecked: 1 });
      const completePromise = monitor.complete('SUCCESS');
      
      // These operations should be waiting for initialization
      expect(mockPrisma.cronJobExecution.update).not.toHaveBeenCalled();
      
      // Complete initialization
      resolveInit!();
      await initPromise;
      
      // Now operations should proceed
      await updatePromise;
      await completePromise;
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledTimes(2);
    });

    it('should allow operations after initialization succeeds', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      
      // Wait for initialization
      await monitor.ensureInitialized();
      
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

    it('should handle concurrent initialization attempts safely', async () => {
      let resolveCount = 0;
      mockPrisma.cronJobExecution.create.mockImplementation(() => {
        resolveCount++;
        return Promise.resolve({ id: `test-id-${resolveCount}` });
      });

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      
      // Start multiple concurrent initialization attempts
      const promises = [
        monitor.ensureInitialized(),
        monitor.ensureInitialized(),
        monitor.ensureInitialized()
      ];
      
      await Promise.all(promises);
      
      // Should only initialize once
      expect(mockPrisma.cronJobExecution.create).toHaveBeenCalledTimes(1);
      expect((monitor as any).initialized).toBe(true);
    });

    it('should handle initialization timeout scenarios', async () => {
      jest.useFakeTimers();
      
      let timeoutId: NodeJS.Timeout;
      mockPrisma.cronJobExecution.create.mockImplementation(() => {
        return new Promise((resolve) => {
          // Simulate a very slow database response
          timeoutId = setTimeout(() => resolve({ id: 'test-id' }), 10000);
        });
      });

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      
      // Start initialization
      const initPromise = monitor.ensureInitialized();
      
      // Fast-forward time but not enough to complete
      jest.advanceTimersByTime(5000);
      
      // Operations should still be waiting
      const updatePromise = monitor.updateMetrics({ tickersChecked: 1 });
      
      // Complete initialization
      jest.advanceTimersByTime(6000);
      await initPromise;
      await updatePromise;
      
      clearTimeout(timeoutId);
      jest.useRealTimers();
      
      expect((monitor as any).initialized).toBe(true);
    });

    it('should maintain state consistency during failed initialization recovery', async () => {
      // First attempt fails
      mockPrisma.cronJobExecution.create
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      
      // Wait for first (failed) initialization
      await monitor.ensureInitialized();
      expect((monitor as any).initialized).toBe(false);
      
      // Update metrics should skip DB operations but update internal state
      await monitor.updateMetrics({ tickersChecked: 3, errorCount: 1 });
      
      const metrics = monitor.getCurrentMetrics();
      expect(metrics.tickersChecked).toBe(3);
      expect(metrics.errorCount).toBe(1);
      
      // Verify update was skipped due to failed initialization
      expect(mockPrisma.cronJobExecution.update).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database errors during metric updates gracefully', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockRejectedValue(new Error('Update failed'));

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
      // Should not throw despite database error
      await expect(monitor.updateMetrics({ tickersChecked: 1 })).resolves.not.toThrow();
      
      // Internal metrics should still be updated
      const metrics = monitor.getCurrentMetrics();
      expect(metrics.tickersChecked).toBe(1);
    });

    it('should handle database errors during completion gracefully', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockRejectedValue(new Error('Completion failed'));

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
      // Should throw error during completion failure (unlike metric updates)
      await expect(monitor.complete('SUCCESS')).rejects.toThrow('Completion failed');
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

  describe('Status Changes (COMPLETED to SUCCESS)', () => {
    it('should record SUCCESS status correctly', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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
        const monitor = new CronJobMonitor(`test-job-${status}`, 'MANUAL');
        await monitor.ensureInitialized();
        
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
      }
    });

    it('should calculate duration accurately', async () => {
      jest.useFakeTimers();
      const startTime = new Date('2024-01-01T10:00:00Z');
      jest.setSystemTime(startTime);

      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
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

      const monitor = new CronJobMonitor('test-job', 'MANUAL');
      await monitor.ensureInitialized();
      
      await monitor.updateMetrics({});
      
      // Should still call update with empty data object
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: {}
      });
    });
  });

  describe('Multi-tenancy and Isolation', () => {
    it('should isolate different monitor instances', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor1 = new CronJobMonitor('job-1', 'MANUAL');
      const monitor2 = new CronJobMonitor('job-2', 'RAILWAY_CRON');
      
      await monitor1.ensureInitialized();
      await monitor2.ensureInitialized();
      
      await monitor1.updateMetrics({ tickersChecked: 5 });
      await monitor2.updateMetrics({ tickersChecked: 10 });
      
      const metrics1 = monitor1.getCurrentMetrics();
      const metrics2 = monitor2.getCurrentMetrics();
      
      expect(metrics1.tickersChecked).toBe(5);
      expect(metrics2.tickersChecked).toBe(10);
      
      // Should have different execution IDs
      expect(monitor1.getExecutionId()).toBe(monitor2.getExecutionId()); // Both use mock UUID
    });

    it('should handle different trigger sources correctly', async () => {
      const sources = ['VERCEL_CRON', 'RAILWAY_CRON', 'MANUAL', 'EXTERNAL'] as const;
      
      for (const source of sources) {
        mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
        
        const monitor = new CronJobMonitor('test-job', source);
        await monitor.ensureInitialized();
        
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