/**
 * Queue Manager Service Test Suite
 * 
 * Tests dynamic worker scaling, queue metrics, and performance optimization
 * for the async email queue system.
 */

// Mock dependencies
jest.mock('../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../../lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn()
  }
}));

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn()
}));

jest.mock('../../../lib/job-queue/worker', () => ({
  JobWorker: jest.fn(),
  getJobWorker: jest.fn()
}));

import { 
  QueueManagerService,
  QueueMetrics,
  WorkerScalingDecision,
  ScalingConfig
} from '../../../lib/job-queue/queue-manager';
import { getPrismaClient } from '../../../lib/db/prisma';
import { JobWorker, getJobWorker } from '../../../lib/job-queue/worker';
import { monitoring } from '../../../lib/monitoring';

// Mock implementations
const mockPrisma = {
  jobQueue: {
    groupBy: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn()
  }
};

const mockJobWorker = {
  start: jest.fn(),
  stop: jest.fn(),
  getStatus: jest.fn(() => ({
    workerId: 'test-worker',
    isRunning: true,
    activeJobs: 0,
    config: {}
  }))
};

const mockGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;
const mockJobWorkerClass = JobWorker as jest.MockedClass<typeof JobWorker>;
const mockGetJobWorker = getJobWorker as jest.MockedFunction<typeof getJobWorker>;

describe('QueueManagerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrismaClient.mockReturnValue(mockPrisma as any);
    mockJobWorkerClass.mockImplementation(() => mockJobWorker as any);
    mockGetJobWorker.mockReturnValue(mockJobWorker as any);
    
    // Reset static state
    (QueueManagerService as any).workers = [];
    (QueueManagerService as any).isMonitoring = false;
    (QueueManagerService as any).lastScaleDown = 0;
  });

  describe('Queue Metrics Collection', () => {
    it('should collect comprehensive queue metrics', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Mock job status counts
      mockPrisma.jobQueue.groupBy
        .mockResolvedValueOnce([
          { status: 'PENDING', _count: { id: 15 } },
          { status: 'PROCESSING', _count: { id: 3 } },
          { status: 'COMPLETED', _count: { id: 100 } },
          { status: 'FAILED', _count: { id: 5 } }
        ])
        .mockResolvedValueOnce([
          { priority: 1, _count: { id: 2 } },
          { priority: 5, _count: { id: 10 } },
          { priority: 9, _count: { id: 6 } }
        ])
        .mockResolvedValueOnce([
          { jobType: 'ASYNC_EMAIL_DIGEST', _count: { id: 15 } },
          { jobType: 'SUMMARIZE_FILING', _count: { id: 3 } }
        ]);

      // Mock recent completed jobs for average processing time
      mockPrisma.jobQueue.findMany.mockResolvedValue([
        { executionTime: 30000 },
        { executionTime: 45000 },
        { executionTime: 60000 }
      ]);

      // Mock oldest pending job
      mockPrisma.jobQueue.findFirst.mockResolvedValue({
        createdAt: new Date(now.getTime() - 5 * 60 * 1000) // 5 minutes ago
      });

      const metrics = await QueueManagerService.getQueueMetrics();

      expect(metrics).toEqual({
        totalJobs: 123, // 15 + 3 + 100 + 5
        pendingJobs: 15,
        processingJobs: 3,
        failedJobs: 5,
        avgProcessingTime: 45000, // (30000 + 45000 + 60000) / 3
        queueDepth: 18, // 15 + 3
        oldestPendingJobAge: 5 * 60 * 1000, // 5 minutes
        priorityDistribution: {
          'priority_1': 2,
          'priority_5': 10,
          'priority_9': 6
        },
        jobTypeDistribution: {
          'ASYNC_EMAIL_DIGEST': 15,
          'SUMMARIZE_FILING': 3
        }
      });

      // Verify monitoring metrics were recorded
      expect(monitoring.recordValue).toHaveBeenCalledWith('queue.total_jobs', 123);
      expect(monitoring.recordValue).toHaveBeenCalledWith('queue.pending_jobs', 15);
      expect(monitoring.recordValue).toHaveBeenCalledWith('queue.processing_jobs', 3);
      expect(monitoring.recordValue).toHaveBeenCalledWith('queue.queue_depth', 18);
    });

    it('should handle empty queue metrics gracefully', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      const metrics = await QueueManagerService.getQueueMetrics();

      expect(metrics).toEqual({
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        failedJobs: 0,
        avgProcessingTime: 45000, // Default value
        queueDepth: 0,
        oldestPendingJobAge: 0,
        priorityDistribution: {},
        jobTypeDistribution: {}
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.jobQueue.groupBy.mockRejectedValue(new Error('Database error'));

      const metrics = await QueueManagerService.getQueueMetrics();

      // Should return empty metrics on error
      expect(metrics.totalJobs).toBe(0);
      expect(metrics.queueDepth).toBe(0);
    });

    it('should calculate average processing time correctly with no completed jobs', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]); // No completed jobs
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      const metrics = await QueueManagerService.getQueueMetrics();

      expect(metrics.avgProcessingTime).toBe(45000); // Default fallback
    });
  });

  describe('Worker Scaling Decisions', () => {
    const defaultConfig: ScalingConfig = {
      minWorkers: 1,
      maxWorkers: 5,
      maxJobsPerWorker: 3,
      scaleUpThreshold: 0.75,
      scaleDownThreshold: 0.25,
      scaleDownDelayMs: 600000, // 10 minutes
      evaluationIntervalMs: 30000
    };

    beforeEach(() => {
      (QueueManagerService as any).scalingConfig = defaultConfig;
    });

    it('should scale up when queue utilization exceeds threshold', async () => {
      // Mock high queue depth with current single worker
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 10 } },
        { status: 'PROCESSING', _count: { id: 2 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with 1 worker
      (QueueManagerService as any).workers = [mockJobWorker];

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision).toEqual({
        action: 'scale_up',
        targetWorkerCount: 2,
        currentWorkerCount: 1,
        reason: expect.stringContaining('exceeds 75% threshold'),
        queueUtilization: 4, // 12 jobs / 3 capacity = 4.0 (400%)
        recommendedAction: 'Add 1 worker(s) to handle increased load'
      });

      // Should have started a new worker
      expect(mockJobWorkerClass).toHaveBeenCalledWith({
        maxConcurrentJobs: 3,
        batchSize: 5,
        pollingIntervalMs: 5000,
        timeoutMs: 700000
      });
      expect(mockJobWorker.start).toHaveBeenCalled();
    });

    it('should scale down when queue utilization is below threshold', async () => {
      // Mock low queue depth with multiple workers
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 1 } },
        { status: 'PROCESSING', _count: { id: 0 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with 3 workers and sufficient time since last scale down
      (QueueManagerService as any).workers = [mockJobWorker, mockJobWorker, mockJobWorker];
      (QueueManagerService as any).lastScaleDown = Date.now() - 700000; // 11.6 minutes ago

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision).toEqual({
        action: 'scale_down',
        targetWorkerCount: 2,
        currentWorkerCount: 3,
        reason: expect.stringContaining('below 25% threshold'),
        queueUtilization: expect.any(Number),
        recommendedAction: 'Remove 1 worker(s) to optimize resource usage'
      });

      expect(mockJobWorker.stop).toHaveBeenCalled();
    });

    it('should maintain workers when utilization is in normal range', async () => {
      // Mock moderate queue depth
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 4 } },
        { status: 'PROCESSING', _count: { id: 2 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with 2 workers
      (QueueManagerService as any).workers = [mockJobWorker, mockJobWorker];

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision.action).toBe('maintain');
      expect(decision.targetWorkerCount).toBe(2);
      expect(decision.currentWorkerCount).toBe(2);
      expect(decision.reason).toBe('Queue utilization within normal range');
    });

    it('should respect minimum worker limits', async () => {
      // Mock empty queue
      mockPrisma.jobQueue.groupBy.mockResolvedValue([]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with minimum workers
      (QueueManagerService as any).workers = [mockJobWorker];
      (QueueManagerService as any).lastScaleDown = Date.now() - 700000;

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision.action).toBe('maintain');
      expect(decision.targetWorkerCount).toBe(1);
      expect(decision.currentWorkerCount).toBe(1);
    });

    it('should respect maximum worker limits', async () => {
      // Mock very high queue depth
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 50 } },
        { status: 'PROCESSING', _count: { id: 10 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with maximum workers
      (QueueManagerService as any).workers = Array(5).fill(mockJobWorker);

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision.action).toBe('maintain');
      expect(decision.targetWorkerCount).toBe(5);
      expect(decision.currentWorkerCount).toBe(5);
    });

    it('should prevent scale down too soon after last scale down', async () => {
      // Mock low queue depth
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 1 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with multiple workers but recent scale down
      (QueueManagerService as any).workers = [mockJobWorker, mockJobWorker];
      (QueueManagerService as any).lastScaleDown = Date.now() - 300000; // 5 minutes ago

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision.action).toBe('maintain');
      expect(decision.reason).toBe('Queue utilization within normal range');
    });

    it('should handle scaling calculation edge cases', async () => {
      // Mock zero capacity scenario
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 10 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with no workers
      (QueueManagerService as any).workers = [];

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision.queueUtilization).toBe(1); // Should default to 100% when capacity is 0
      expect(decision.action).toBe('scale_up');
    });
  });

  describe('Scaling Execution', () => {
    it('should execute scale up correctly', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 10 } },
        { status: 'PROCESSING', _count: { id: 2 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with 1 worker
      (QueueManagerService as any).workers = [mockJobWorker];

      await QueueManagerService.scaleWorkers();

      // Should have added workers
      expect((QueueManagerService as any).workers.length).toBe(2);
      expect(mockJobWorkerClass).toHaveBeenCalled();
      expect(mockJobWorker.start).toHaveBeenCalled();
    });

    it('should execute scale down correctly', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 1 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Start with 3 workers
      const workers = [
        { ...mockJobWorker, stop: jest.fn() },
        { ...mockJobWorker, stop: jest.fn() },
        { ...mockJobWorker, stop: jest.fn() }
      ];
      (QueueManagerService as any).workers = workers;
      (QueueManagerService as any).lastScaleDown = Date.now() - 700000;

      await QueueManagerService.scaleWorkers();

      // Should have removed one worker
      expect((QueueManagerService as any).workers.length).toBe(2);
      expect(workers[2].stop).toHaveBeenCalled();
    });

    it('should handle scaling execution errors', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 10 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Mock worker start failure
      mockJobWorker.start.mockRejectedValue(new Error('Worker start failed'));

      (QueueManagerService as any).workers = [mockJobWorker];

      await expect(QueueManagerService.scaleWorkers()).rejects.toThrow('Worker start failed');
    });
  });

  describe('Monitoring and Configuration', () => {
    it('should start monitoring with default configuration', async () => {
      await QueueManagerService.startMonitoring();

      expect((QueueManagerService as any).isMonitoring).toBe(true);
      expect((QueueManagerService as any).workers.length).toBe(1);
      expect(mockGetJobWorker).toHaveBeenCalled();
      expect(mockJobWorker.start).toHaveBeenCalled();
    });

    it('should start monitoring with custom configuration', async () => {
      const customConfig: Partial<ScalingConfig> = {
        minWorkers: 2,
        maxWorkers: 10,
        scaleUpThreshold: 0.8
      };

      await QueueManagerService.startMonitoring(customConfig);

      const finalConfig = QueueManagerService.getScalingConfig();
      expect(finalConfig.minWorkers).toBe(2);
      expect(finalConfig.maxWorkers).toBe(10);
      expect(finalConfig.scaleUpThreshold).toBe(0.8);
      expect(finalConfig.scaleDownThreshold).toBe(0.25); // Default value preserved
    });

    it('should prevent starting monitoring twice', async () => {
      await QueueManagerService.startMonitoring();
      await QueueManagerService.startMonitoring(); // Second call

      // Should only start once
      expect(mockGetJobWorker).toHaveBeenCalledTimes(1);
    });

    it('should stop monitoring correctly', async () => {
      // Start with multiple workers
      const workers = [
        { ...mockJobWorker, stop: jest.fn() },
        { ...mockJobWorker, stop: jest.fn() },
        { ...mockJobWorker, stop: jest.fn() }
      ];
      (QueueManagerService as any).workers = workers;
      (QueueManagerService as any).isMonitoring = true;

      await QueueManagerService.stopMonitoring();

      expect((QueueManagerService as any).isMonitoring).toBe(false);
      expect((QueueManagerService as any).workers.length).toBe(1); // Keep minimum
      expect(workers[1].stop).toHaveBeenCalled();
      expect(workers[2].stop).toHaveBeenCalled();
    });

    it('should update scaling configuration', () => {
      const newConfig: Partial<ScalingConfig> = {
        maxWorkers: 8,
        scaleUpThreshold: 0.9
      };

      QueueManagerService.updateScalingConfig(newConfig);

      const finalConfig = QueueManagerService.getScalingConfig();
      expect(finalConfig.maxWorkers).toBe(8);
      expect(finalConfig.scaleUpThreshold).toBe(0.9);
      expect(finalConfig.minWorkers).toBe(1); // Original value preserved
    });

    it('should provide worker status information', () => {
      const workers = [
        { getStatus: () => ({ workerId: 'worker-1', isRunning: true, activeJobs: 2, config: {} }) },
        { getStatus: () => ({ workerId: 'worker-2', isRunning: true, activeJobs: 0, config: {} }) }
      ];
      (QueueManagerService as any).workers = workers;

      const status = QueueManagerService.getWorkerStatus();

      expect(status).toHaveLength(2);
      expect(status[0].workerId).toBe('worker-1');
      expect(status[0].activeJobs).toBe(2);
      expect(status[1].workerId).toBe('worker-2');
      expect(status[1].activeJobs).toBe(0);
    });
  });

  describe('Monitoring Loop and Error Handling', () => {
    it('should handle errors in monitoring loop gracefully', async () => {
      // Mock getQueueMetrics to fail
      mockPrisma.jobQueue.groupBy.mockRejectedValue(new Error('Database error'));

      await QueueManagerService.startMonitoring();

      // Should not crash and should continue monitoring
      expect((QueueManagerService as any).isMonitoring).toBe(true);
    });

    it('should record scaling metrics correctly', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 5 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      (QueueManagerService as any).workers = [mockJobWorker, mockJobWorker];

      await QueueManagerService.scaleWorkers();

      expect(monitoring.recordValue).toHaveBeenCalledWith('queue.worker_count', 2);
      expect(monitoring.recordValue).toHaveBeenCalledWith('queue.utilization', expect.any(Number));
      expect(monitoring.incrementCounter).toHaveBeenCalledWith(
        'queue.scaling_evaluation',
        1,
        expect.objectContaining({
          action: expect.any(String),
          current_workers: '2',
          target_workers: expect.any(String)
        })
      );
    });

    it('should handle scaling execution monitoring', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 10 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      (QueueManagerService as any).workers = [mockJobWorker];

      await QueueManagerService.scaleWorkers();

      expect(monitoring.incrementCounter).toHaveBeenCalledWith(
        'queue.scaling_executed',
        1,
        expect.objectContaining({
          action: 'scale_up',
          workers_changed: '1'
        })
      );
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle zero jobs scenario', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      (QueueManagerService as any).workers = [mockJobWorker];

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision.queueUtilization).toBe(0);
      expect(decision.action).toBe('maintain');
    });

    it('should handle very high job counts', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 1000 } },
        { status: 'PROCESSING', _count: { id: 500 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      (QueueManagerService as any).workers = [mockJobWorker];

      const decision = await QueueManagerService.scaleWorkers();

      expect(decision.action).toBe('scale_up');
      expect(decision.targetWorkerCount).toBe(5); // Should be capped at maxWorkers
    });

    it('should handle rapid scaling decisions', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 15 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      (QueueManagerService as any).workers = [mockJobWorker];

      // Execute multiple scaling decisions rapidly
      const promises = [
        QueueManagerService.scaleWorkers(),
        QueueManagerService.scaleWorkers(),
        QueueManagerService.scaleWorkers()
      ];

      const results = await Promise.all(promises);

      // All should complete successfully
      results.forEach(result => {
        expect(result.action).toBeDefined();
        expect(result.currentWorkerCount).toBeGreaterThanOrEqual(1);
      });
    });

    it('should handle worker start/stop failures gracefully', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { id: 10 } }
      ]);
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);
      mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

      // Mock worker operations to fail
      const failingWorker = {
        start: jest.fn().mockRejectedValue(new Error('Start failed')),
        stop: jest.fn().mockRejectedValue(new Error('Stop failed')),
        getStatus: jest.fn(() => ({ workerId: 'failing', isRunning: false, activeJobs: 0, config: {} }))
      };

      mockJobWorkerClass.mockImplementation(() => failingWorker as any);
      (QueueManagerService as any).workers = [mockJobWorker];

      await expect(QueueManagerService.scaleWorkers()).rejects.toThrow();
    });

    it('should maintain consistent worker count tracking', async () => {
      // Simulate complex scaling scenario
      const scenarios = [
        { pending: 20, expected: 'scale_up' },
        { pending: 5, expected: 'maintain' },
        { pending: 1, expected: 'scale_down' }
      ];

      for (const scenario of scenarios) {
        mockPrisma.jobQueue.groupBy.mockResolvedValue([
          { status: 'PENDING', _count: { id: scenario.pending } }
        ]);
        mockPrisma.jobQueue.findMany.mockResolvedValue([]);
        mockPrisma.jobQueue.findFirst.mockResolvedValue(null);

        const beforeCount = (QueueManagerService as any).workers.length;
        const decision = await QueueManagerService.scaleWorkers();
        const afterCount = (QueueManagerService as any).workers.length;

        expect(decision.currentWorkerCount).toBe(beforeCount);
        expect(decision.targetWorkerCount).toBe(afterCount);
      }
    });
  });
});