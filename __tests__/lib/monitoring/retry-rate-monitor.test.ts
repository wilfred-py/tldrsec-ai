/**
 * Retry Rate Monitor Tests
 *
 * Tests the retry rate monitoring service and anomaly detection.
 */

import { RetryRateMonitor } from '@/lib/monitoring/retry-rate-monitor';
import { getPrismaClient } from '@/lib/db/prisma';

// Mock Prisma client
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn()
}));

describe('RetryRateMonitor', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Prisma client
    mockPrisma = {
      jobQueue: {
        findMany: jest.fn()
      }
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
  });

  describe('getMetrics', () => {
    it('should return baseline metrics for normal operation (100% retryCount=1)', async () => {
      // Mock: 100 jobs, all with retryCount=1 (expected baseline)
      const mockJobs = Array.from({ length: 100 }, (_, i) => ({
        id: `job-${i}`,
        retryCount: 1,
        createdAt: new Date(),
        completedAt: new Date()
      }));

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);

      const metrics = await RetryRateMonitor.getMetrics(24);

      expect(metrics.totalJobs).toBe(100);
      expect(metrics.avgRetries).toBe(1.0);
      expect(metrics.retryPercentage).toBe(100);
      expect(metrics.multipleRetryPercentage).toBe(0);
      expect(metrics.retryDistribution).toEqual({
        retryCount0: 0,
        retryCount1: 100,
        retryCount2Plus: 0
      });
      expect(metrics.anomalyDetected).toBe(false);
      expect(metrics.anomalyReason).toBeUndefined();
    });

    it('should detect anomaly when >10% have retryCount>1', async () => {
      // Mock: 100 jobs, 15 with retryCount>=2 (anomaly condition)
      const mockJobs = [
        ...Array.from({ length: 85 }, (_, i) => ({
          id: `job-normal-${i}`,
          retryCount: 1,
          createdAt: new Date(),
          completedAt: new Date()
        })),
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `job-anomaly-${i}`,
          retryCount: 2 + (i % 3), // retryCount of 2, 3, or 4
          createdAt: new Date(),
          completedAt: new Date()
        }))
      ];

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);

      const metrics = await RetryRateMonitor.getMetrics(24);

      expect(metrics.totalJobs).toBe(100);
      expect(metrics.avgRetries).toBeGreaterThan(1.0);
      expect(metrics.multipleRetryPercentage).toBe(15);
      expect(metrics.anomalyDetected).toBe(true);
      expect(metrics.anomalyReason).toContain('15% of jobs required multiple retries');
    });

    it('should handle edge case: exactly 10% at threshold', async () => {
      // Mock: 100 jobs, exactly 10 with retryCount>=2 (at threshold, not anomaly)
      const mockJobs = [
        ...Array.from({ length: 90 }, (_, i) => ({
          id: `job-normal-${i}`,
          retryCount: 1,
          createdAt: new Date(),
          completedAt: new Date()
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `job-threshold-${i}`,
          retryCount: 2,
          createdAt: new Date(),
          completedAt: new Date()
        }))
      ];

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);

      const metrics = await RetryRateMonitor.getMetrics(24);

      expect(metrics.multipleRetryPercentage).toBe(10);
      expect(metrics.anomalyDetected).toBe(false); // Not > 10%, so no anomaly
    });

    it('should handle empty dataset gracefully', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);

      const metrics = await RetryRateMonitor.getMetrics(24);

      expect(metrics.totalJobs).toBe(0);
      expect(metrics.avgRetries).toBe(0);
      expect(metrics.retryPercentage).toBe(0);
      expect(metrics.multipleRetryPercentage).toBe(0);
      expect(metrics.retryDistribution).toEqual({
        retryCount0: 0,
        retryCount1: 0,
        retryCount2Plus: 0
      });
      expect(metrics.anomalyDetected).toBe(false);
    });

    it('should calculate correct time window', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);

      await RetryRateMonitor.getMetrics(48);

      // Verify findMany was called with correct time window
      expect(mockPrisma.jobQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            completedAt: expect.objectContaining({
              gte: expect.any(Date)
            })
          })
        })
      );

      const callArgs = mockPrisma.jobQueue.findMany.mock.calls[0][0];
      const cutoffTime = callArgs.where.completedAt.gte;
      const hoursBack = (Date.now() - cutoffTime.getTime()) / (1000 * 60 * 60);

      // Should be approximately 48 hours (allow 1 minute tolerance)
      expect(hoursBack).toBeGreaterThan(47.98);
      expect(hoursBack).toBeLessThan(48.02);
    });

    it('should handle mixed retry counts correctly', async () => {
      // Mock: realistic distribution
      const mockJobs = [
        // 5% retryCount=0 (warm functions)
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `job-0-${i}`,
          retryCount: 0,
          createdAt: new Date(),
          completedAt: new Date()
        })),
        // 90% retryCount=1 (baseline)
        ...Array.from({ length: 90 }, (_, i) => ({
          id: `job-1-${i}`,
          retryCount: 1,
          createdAt: new Date(),
          completedAt: new Date()
        })),
        // 5% retryCount>=2 (within threshold)
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `job-2plus-${i}`,
          retryCount: 2,
          createdAt: new Date(),
          completedAt: new Date()
        }))
      ];

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);

      const metrics = await RetryRateMonitor.getMetrics(24);

      expect(metrics.totalJobs).toBe(100);
      expect(metrics.retryDistribution.retryCount0).toBe(5);
      expect(metrics.retryDistribution.retryCount1).toBe(90);
      expect(metrics.retryDistribution.retryCount2Plus).toBe(5);
      expect(metrics.multipleRetryPercentage).toBe(5);
      expect(metrics.anomalyDetected).toBe(false); // 5% < 10% threshold
    });
  });

  describe('getHealth', () => {
    it('should return healthy status for baseline operation', async () => {
      // Mock: 100% retryCount=1 (normal)
      const mockJobs = Array.from({ length: 100 }, (_, i) => ({
        id: `job-${i}`,
        retryCount: 1,
        createdAt: new Date(),
        completedAt: new Date()
      }));

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);

      const health = await RetryRateMonitor.getHealth(24);

      expect(health.healthy).toBe(true);
      expect(health.baseline).toEqual({
        expectedRetryRate: 100,
        anomalyThreshold: 10
      });
      expect(health.recommendations).toBeUndefined();
    });

    it('should return unhealthy status with recommendations for anomaly', async () => {
      // Mock: 15% with retryCount>=2 (anomaly)
      const mockJobs = [
        ...Array.from({ length: 85 }, (_, i) => ({
          id: `job-normal-${i}`,
          retryCount: 1,
          createdAt: new Date(),
          completedAt: new Date()
        })),
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `job-anomaly-${i}`,
          retryCount: 2,
          createdAt: new Date(),
          completedAt: new Date()
        }))
      ];

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);

      const health = await RetryRateMonitor.getHealth(24);

      expect(health.healthy).toBe(false);
      expect(health.recommendations).toBeDefined();
      expect(health.recommendations).toContain(
        'Investigate jobs with retryCount>1 for persistent errors'
      );
      expect(health.recommendations).toContain(
        'Check /api/health/pipeline for infrastructure issues'
      );
    });

    it('should provide recommendations when no jobs found', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);

      const health = await RetryRateMonitor.getHealth(24);

      expect(health.metrics.totalJobs).toBe(0);
      expect(health.recommendations).toBeDefined();
      expect(health.recommendations).toContain(
        'No completed jobs found in time window'
      );
    });

    it('should detect unusual pattern of high retryCount=0', async () => {
      // Mock: 30% retryCount=0 (unusual for cold starts)
      const mockJobs = [
        ...Array.from({ length: 30 }, (_, i) => ({
          id: `job-0-${i}`,
          retryCount: 0,
          createdAt: new Date(),
          completedAt: new Date()
        })),
        ...Array.from({ length: 70 }, (_, i) => ({
          id: `job-1-${i}`,
          retryCount: 1,
          createdAt: new Date(),
          completedAt: new Date()
        }))
      ];

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);

      const health = await RetryRateMonitor.getHealth(24);

      expect(health.healthy).toBe(true); // Still healthy, just unusual
      expect(health.recommendations).toBeDefined();
      expect(health.recommendations?.some(r =>
        r.includes('Unusually high percentage of first-attempt successes')
      )).toBe(true);
    });
  });

  describe('getDetailedBreakdown', () => {
    it('should return jobs grouped by retry count', async () => {
      const mockRetry0Jobs = [
        { id: 'job-0-1', type: 'SUMMARIZE', retryCount: 0, createdAt: new Date(), completedAt: new Date(), lastError: null }
      ];
      const mockRetry1Jobs = [
        { id: 'job-1-1', type: 'SUMMARIZE', retryCount: 1, createdAt: new Date(), completedAt: new Date(), lastError: 'Cold start timeout' }
      ];
      const mockRetry2PlusJobs = [
        { id: 'job-2-1', type: 'SUMMARIZE', retryCount: 2, createdAt: new Date(), completedAt: new Date(), lastError: 'Persistent error' }
      ];

      // Mock three separate findMany calls (one for each retry category)
      mockPrisma.jobQueue.findMany
        .mockResolvedValueOnce(mockRetry0Jobs)
        .mockResolvedValueOnce(mockRetry1Jobs)
        .mockResolvedValueOnce(mockRetry2PlusJobs);

      const breakdown = await RetryRateMonitor.getDetailedBreakdown(24, 10);

      expect(breakdown.retryCount0.count).toBe(1);
      expect(breakdown.retryCount0.jobs).toEqual(mockRetry0Jobs);

      expect(breakdown.retryCount1.count).toBe(1);
      expect(breakdown.retryCount1.jobs).toEqual(mockRetry1Jobs);

      expect(breakdown.retryCount2Plus.count).toBe(1);
      expect(breakdown.retryCount2Plus.jobs).toEqual(mockRetry2PlusJobs);
    });

    it('should respect limit parameter', async () => {
      // Mock empty results for simplicity
      mockPrisma.jobQueue.findMany.mockResolvedValue([]);

      await RetryRateMonitor.getDetailedBreakdown(24, 5);

      // Verify all three findMany calls used take: 5
      expect(mockPrisma.jobQueue.findMany).toHaveBeenCalledTimes(3);
      mockPrisma.jobQueue.findMany.mock.calls.forEach((call: any) => {
        expect(call[0].take).toBe(5);
      });
    });
  });
});
