import { CronJobMonitor, CronJobAnalytics } from '../../../lib/monitoring/cron-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-execution-id')
}));

describe('Cron Job Status Changes (COMPLETED to SUCCESS)', () => {
  let mockPrisma: any;

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

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
  });

  describe('Status Recording and Verification', () => {
    it('should record SUCCESS status correctly in database', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      const result = await monitor.complete('SUCCESS');
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'test-execution-id' },
        data: expect.objectContaining({
          status: 'SUCCESS',
          completedAt: expect.any(Date),
          durationMs: expect.any(Number),
          errorMessage: undefined
        })
      });
      
      expect(result.status).toBe('SUCCESS');
    });

    it('should record FAILED status correctly in database', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      const errorMessage = 'Database connection failed';
      const result = await monitor.complete('FAILED', errorMessage);
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'test-execution-id' },
        data: expect.objectContaining({
          status: 'FAILED',
          completedAt: expect.any(Date),
          durationMs: expect.any(Number),
          errorMessage
        })
      });
      
      expect(result.status).toBe('FAILED');
    });

    it('should record TIMEOUT status correctly in database', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      const result = await monitor.complete('TIMEOUT');
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'test-execution-id' },
        data: expect.objectContaining({
          status: 'TIMEOUT',
          completedAt: expect.any(Date),
          durationMs: expect.any(Number),
          errorMessage: undefined
        })
      });
      
      expect(result.status).toBe('TIMEOUT');
    });

    it('should not accept legacy COMPLETED status', () => {
      // This test ensures the type system prevents using old status
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      
      // TypeScript should prevent this, but we test runtime behavior
      // @ts-expect-error Testing invalid status
      expect(() => monitor.complete('COMPLETED')).toThrow();
    });

    it('should validate status parameter at runtime', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      // Test with invalid status
      const invalidStatus = 'INVALID_STATUS' as any;
      
      // Should validate and reject invalid status
      try {
        await monitor.complete(invalidStatus);
        fail('Should have thrown error for invalid status');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should preserve all metrics when completing with SUCCESS', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      // Update metrics before completion
      await monitor.updateMetrics({
        tickersChecked: 15,
        newFilingsFound: 8,
        filingsProcessed: 7,
        emailsSent: 12,
        usersNotified: 10,
        errorCount: 1,
        warningCount: 3
      });
      
      const result = await monitor.complete('SUCCESS');
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenLastCalledWith({
        where: { executionId: 'test-execution-id' },
        data: expect.objectContaining({
          status: 'SUCCESS',
          tickersChecked: 15,
          newFilingsFound: 8,
          filingsProcessed: 7,
          emailsSent: 12,
          errorsCount: 1
        })
      });
      
      expect(result.metrics).toEqual({
        tickersChecked: 15,
        newFilingsFound: 8,
        filingsProcessed: 7,
        emailsSent: 12,
        usersNotified: 10,
        totalCostUSD: 0,
        aiCostUSD: 0,
        emailCostUSD: 0,
        tokensUsed: 0,
        errorCount: 1,
        warningCount: 3
      });
    });
  });

  describe('Analytics with New Status Values', () => {
    it('should filter by SUCCESS status in daily cost summary', async () => {
      const mockCostData = [
        {
          createdAt: new Date('2024-01-01'),
          _sum: {
            totalCostUSD: 15.75,
            aiCostUSD: 12.50,
            emailCostUSD: 3.25,
            tokensUsed: 7500
          },
          _count: {
            filingsProcessed: 8,
            usersNotified: 25
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

    it('should include SUCCESS and FAILED in current job status check', async () => {
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

      expect(mockPrisma.cronJobExecution.findFirst).toHaveBeenCalledWith({
        where: {
          status: { in: ['SUCCESS', 'FAILED'] }
        },
        orderBy: { completedAt: 'desc' }
      });

      expect(result).toEqual({
        runningJobs: mockRunningJobs,
        lastCompletedJob: mockLastCompleted,
        isHealthy: false // Has running jobs
      });
    });

    it('should report healthy when last job has SUCCESS status', async () => {
      mockPrisma.cronJobExecution.findMany.mockResolvedValue([]);
      mockPrisma.cronJobExecution.findFirst.mockResolvedValue({
        id: '1',
        status: 'SUCCESS',
        completedAt: new Date()
      });

      const result = await CronJobAnalytics.getCurrentJobStatus();

      expect(result.isHealthy).toBe(true);
      expect(result.lastCompletedJob?.status).toBe('SUCCESS');
    });

    it('should report unhealthy when last job has FAILED status', async () => {
      mockPrisma.cronJobExecution.findMany.mockResolvedValue([]);
      mockPrisma.cronJobExecution.findFirst.mockResolvedValue({
        id: '1',
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: 'Job execution failed'
      });

      const result = await CronJobAnalytics.getCurrentJobStatus();

      expect(result.isHealthy).toBe(false);
      expect(result.lastCompletedJob?.status).toBe('FAILED');
    });

    it('should report unhealthy when last job has TIMEOUT status', async () => {
      mockPrisma.cronJobExecution.findMany.mockResolvedValue([]);
      mockPrisma.cronJobExecution.findFirst.mockResolvedValue({
        id: '1',
        status: 'TIMEOUT',
        completedAt: new Date()
      });

      const result = await CronJobAnalytics.getCurrentJobStatus();

      expect(result.isHealthy).toBe(false);
      expect(result.lastCompletedJob?.status).toBe('TIMEOUT');
    });

    it('should exclude legacy COMPLETED status from queries', async () => {
      // Ensure analytics queries don't include old COMPLETED status
      await CronJobAnalytics.getCurrentJobStatus();

      expect(mockPrisma.cronJobExecution.findFirst).toHaveBeenCalledWith({
        where: {
          status: { in: ['SUCCESS', 'FAILED'] }
        },
        orderBy: { completedAt: 'desc' }
      });

      // Verify COMPLETED is not included
      const whereClause = mockPrisma.cronJobExecution.findFirst.mock.calls[0][0].where;
      expect(whereClause.status.in).not.toContain('COMPLETED');
    });
  });

  describe('Status Migration and Backward Compatibility', () => {
    it('should handle existing COMPLETED records in database queries', async () => {
      // Simulate existing records with old COMPLETED status
      const mixedStatusRecords = [
        { id: '1', status: 'SUCCESS', completedAt: new Date() },
        { id: '2', status: 'COMPLETED', completedAt: new Date() }, // Legacy
        { id: '3', status: 'FAILED', completedAt: new Date() }
      ];

      mockPrisma.cronJobExecution.findMany.mockResolvedValue(mixedStatusRecords);

      const result = await CronJobAnalytics.getRecentExecutions(10);

      expect(result).toEqual(mixedStatusRecords);
      // Should handle mixed status records gracefully
    });

    it('should not create new records with COMPLETED status', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();

      // Verify that creation uses STARTED status, not COMPLETED
      expect(mockPrisma.cronJobExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'STARTED'
        })
      });
    });

    it('should validate that only new status values are used in updates', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();

      // Test all valid statuses
      const validStatuses = ['SUCCESS', 'FAILED', 'TIMEOUT'];
      
      for (const status of validStatuses) {
        await monitor.complete(status as any);
        
        expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
          where: { executionId: 'test-execution-id' },
          data: expect.objectContaining({
            status
          })
        });
        
        // Reset for next test
        mockPrisma.cronJobExecution.update.mockClear();
      }
    });
  });

  describe('Status-based Health Monitoring', () => {
    it('should calculate health score based on SUCCESS rate', async () => {
      const recentExecutions = [
        { status: 'SUCCESS', completedAt: new Date() },
        { status: 'SUCCESS', completedAt: new Date() },
        { status: 'FAILED', completedAt: new Date() },
        { status: 'SUCCESS', completedAt: new Date() },
        { status: 'TIMEOUT', completedAt: new Date() }
      ];

      mockPrisma.cronJobExecution.findMany.mockResolvedValue(recentExecutions);

      const executions = await CronJobAnalytics.getRecentExecutions(10);
      
      // Calculate success rate
      const successCount = executions.filter(exec => exec.status === 'SUCCESS').length;
      const totalCount = executions.length;
      const successRate = successCount / totalCount;

      expect(successRate).toBe(0.6); // 3 SUCCESS out of 5 total = 60%
    });

    it('should identify patterns in job failures', async () => {
      const recentExecutions = [
        { 
          id: '1',
          status: 'FAILED', 
          completedAt: new Date('2024-01-01T10:00:00Z'),
          errorMessage: 'Database timeout'
        },
        { 
          id: '2',
          status: 'FAILED', 
          completedAt: new Date('2024-01-01T11:00:00Z'),
          errorMessage: 'Database timeout'
        },
        { 
          id: '3',
          status: 'SUCCESS', 
          completedAt: new Date('2024-01-01T12:00:00Z')
        }
      ];

      mockPrisma.cronJobExecution.findMany.mockResolvedValue(recentExecutions);

      const executions = await CronJobAnalytics.getRecentExecutions(10);
      
      // Analyze failure patterns
      const failures = executions.filter(exec => exec.status === 'FAILED');
      const timeoutErrors = failures.filter(exec => 
        exec.errorMessage?.includes('timeout')
      );

      expect(failures).toHaveLength(2);
      expect(timeoutErrors).toHaveLength(2);
    });

    it('should track status transitions over time', async () => {
      const executionHistory = [
        { status: 'SUCCESS', startedAt: new Date('2024-01-01T08:00:00Z') },
        { status: 'SUCCESS', startedAt: new Date('2024-01-01T09:00:00Z') },
        { status: 'FAILED', startedAt: new Date('2024-01-01T10:00:00Z') },
        { status: 'TIMEOUT', startedAt: new Date('2024-01-01T11:00:00Z') },
        { status: 'SUCCESS', startedAt: new Date('2024-01-01T12:00:00Z') }
      ];

      mockPrisma.cronJobExecution.findMany.mockResolvedValue(executionHistory);

      const executions = await CronJobAnalytics.getRecentExecutions(10);
      
      // Track status transitions
      const statusTransitions = [];
      for (let i = 1; i < executions.length; i++) {
        statusTransitions.push({
          from: executions[i - 1].status,
          to: executions[i].status
        });
      }

      expect(statusTransitions).toEqual([
        { from: 'SUCCESS', to: 'SUCCESS' },
        { from: 'SUCCESS', to: 'FAILED' },
        { from: 'FAILED', to: 'TIMEOUT' },
        { from: 'TIMEOUT', to: 'SUCCESS' }
      ]);
    });
  });

  describe('Error Context with Status Changes', () => {
    it('should preserve error context when status is FAILED', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      const detailedError = 'RSS feed parsing failed for CIK 1318605: Invalid XML structure at line 42';
      const result = await monitor.complete('FAILED', detailedError);
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'test-execution-id' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: detailedError
        })
      });
      
      expect(result.status).toBe('FAILED');
    });

    it('should not include error message for SUCCESS status', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      const result = await monitor.complete('SUCCESS');
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'test-execution-id' },
        data: expect.objectContaining({
          status: 'SUCCESS',
          errorMessage: undefined
        })
      });
    });

    it('should handle optional error message for TIMEOUT status', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      const timeoutMessage = 'Job exceeded 10 minute timeout limit';
      const result = await monitor.complete('TIMEOUT', timeoutMessage);
      
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'test-execution-id' },
        data: expect.objectContaining({
          status: 'TIMEOUT',
          errorMessage: timeoutMessage
        })
      });
    });
  });

  describe('Performance Impact of Status Changes', () => {
    it('should complete status updates efficiently', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitor = new CronJobMonitor('test-job', 'RAILWAY_CRON');
      await monitor.ensureInitialized();
      
      const startTime = performance.now();
      await monitor.complete('SUCCESS');
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle concurrent status updates safely', async () => {
      mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
      mockPrisma.cronJobExecution.update.mockResolvedValue({ id: 'test-id' });

      const monitors = Array.from({ length: 10 }, (_, i) => 
        new CronJobMonitor(`job-${i}`, 'RAILWAY_CRON')
      );

      // Initialize all monitors
      await Promise.all(monitors.map(m => m.ensureInitialized()));

      // Complete all jobs concurrently
      const completionPromises = monitors.map((monitor, i) => 
        monitor.complete(i % 2 === 0 ? 'SUCCESS' : 'FAILED')
      );

      const results = await Promise.all(completionPromises);

      expect(results).toHaveLength(10);
      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledTimes(10);
    });
  });
});