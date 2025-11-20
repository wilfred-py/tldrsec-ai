/**
 * Unit tests for AsyncFilingQueue service
 * Tests job queueing, priority handling, idempotency, and queue depth tracking
 */

import { AsyncFilingQueue, type FilingJobPayload } from '../../../lib/cron/async-filing-queue';
import { JobQueueService } from '../../../lib/job-queue';

// Mock the job queue service
jest.mock('../../../lib/job-queue', () => ({
  JobQueueService: {
    addJob: jest.fn(),
    getQueueDepth: jest.fn(),
  },
}));

describe('AsyncFilingQueue', () => {
  const mockFilingPayload: FilingJobPayload = {
    userId: 'user-123',
    userEmail: 'test@example.com',
    userTier: 'PRO',
    ticker: {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      cik: '0000320193',
    },
    filing: {
      filingId: 'filing-123',
      formType: '10-K',
      filingDate: '2025-01-15',
      filingUrl: 'https://example.com/filing',
      accessionNumber: '0000320193-25-000001',
    },
    executionContext: {
      executionId: 'exec-123',
      cronTriggerTime: '2025-01-15T10:00:00Z',
      sourceContext: 'cron',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('queueFilingForProcessing', () => {
    it('should queue filing with correct job type', async () => {
      const mockJob = {
        id: 'job-123',
        jobType: 'ASYNC_SUMMARIZE_FILING',
        status: 'PENDING',
        priority: 9,
      };

      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(5);

      const result = await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-123');
      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'ASYNC_SUMMARIZE_FILING',
          priority: 9, // PRO tier
          maxAttempts: 3,
        })
      );
    });

    it('should generate correct idempotency key', async () => {
      const mockJob = {
        id: 'job-123',
        jobType: 'ASYNC_SUMMARIZE_FILING',
        status: 'PENDING',
        priority: 9,
      };

      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload);

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'filing-user-123-0000320193-25-000001',
        })
      );
    });

    it('should use custom idempotency key when provided', async () => {
      const mockJob = {
        id: 'job-123',
        jobType: 'ASYNC_SUMMARIZE_FILING',
        status: 'PENDING',
        priority: 9,
      };

      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload, {
        idempotencyKey: 'custom-key-123',
      });

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'custom-key-123',
        })
      );
    });

    it('should set correct priority for PRO tier', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing({
        ...mockFilingPayload,
        userTier: 'PRO',
      });

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 9 })
      );
    });

    it('should set correct priority for HOBBY tier', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 7 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing({
        ...mockFilingPayload,
        userTier: 'HOBBY',
      });

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 7 })
      );
    });

    it('should set correct priority for FREE tier', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 5 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing({
        ...mockFilingPayload,
        userTier: 'FREE',
      });

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 5 })
      );
    });

    it('should estimate completion time based on queue depth', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(9); // 9 jobs in queue

      const result = await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload);

      // Queue depth = 9, so estimated time = Math.ceil(9/3) * 2 = 6 minutes
      const expectedMinutes = 6;
      const actualMinutes = Math.round(
        (result.estimatedCompletionTime.getTime() - Date.now()) / 1000 / 60
      );

      expect(actualMinutes).toBeGreaterThanOrEqual(expectedMinutes - 1);
      expect(actualMinutes).toBeLessThanOrEqual(expectedMinutes + 1);
    });

    it('should return queue position', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(5);

      const result = await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload);

      expect(result.queuePosition).toBe(6); // Queue depth + 1
    });

    it('should handle custom priority override', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 10 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload, {
        priority: 10,
      });

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 10 })
      );
    });

    it('should handle job queue errors gracefully', async () => {
      (JobQueueService.addJob as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('queueMultipleFilings', () => {
    it('should queue multiple filings in batch', async () => {
      const filings: FilingJobPayload[] = [
        mockFilingPayload,
        {
          ...mockFilingPayload,
          userId: 'user-456',
          filing: { ...mockFilingPayload.filing, accessionNumber: '0000320193-25-000002' },
        },
        {
          ...mockFilingPayload,
          userId: 'user-789',
          filing: { ...mockFilingPayload.filing, accessionNumber: '0000320193-25-000003' },
        },
      ];

      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      const results = await AsyncFilingQueue.queueMultipleFilings(filings);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(JobQueueService.addJob).toHaveBeenCalledTimes(3);
    });

    it('should continue processing if one filing fails', async () => {
      const filings: FilingJobPayload[] = [
        mockFilingPayload,
        {
          ...mockFilingPayload,
          userId: 'user-456',
          filing: { ...mockFilingPayload.filing, accessionNumber: '0000320193-25-000002' },
        },
      ];

      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock)
        .mockResolvedValueOnce(mockJob)
        .mockRejectedValueOnce(new Error('Failed'));
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      const results = await AsyncFilingQueue.queueMultipleFilings(filings);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('should apply same priority to all filings in batch', async () => {
      const filings: FilingJobPayload[] = [
        mockFilingPayload,
        {
          ...mockFilingPayload,
          userId: 'user-456',
          filing: { ...mockFilingPayload.filing, accessionNumber: '0000320193-25-000002' },
        },
      ];

      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 8 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueMultipleFilings(filings, { priority: 8 });

      expect(JobQueueService.addJob).toHaveBeenCalledTimes(2);
      const calls = (JobQueueService.addJob as jest.Mock).mock.calls;
      expect(calls[0][0].priority).toBe(8);
      expect(calls[1][0].priority).toBe(8);
    });
  });

  describe('Priority Mapping', () => {
    it('should default to priority 5 for unknown tiers', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 5 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing({
        ...mockFilingPayload,
        userTier: 'UNKNOWN_TIER',
      });

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 5 })
      );
    });

    it('should be case-insensitive for tier names', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      await AsyncFilingQueue.queueFilingForProcessing({
        ...mockFilingPayload,
        userTier: 'pro', // lowercase
      });

      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 9 })
      );
    });
  });

  describe('Queue Depth Estimation', () => {
    it('should handle queue depth fetch errors gracefully', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload);

      // Should use default estimate of 10
      expect(result.success).toBe(true);
      expect(result.queuePosition).toBe(11); // Default 10 + 1
    });

    it('should calculate correct position with zero queue depth', async () => {
      const mockJob = { id: 'job-123', jobType: 'ASYNC_SUMMARIZE_FILING', status: 'PENDING', priority: 9 };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      (JobQueueService.getQueueDepth as jest.Mock).mockResolvedValue(0);

      const result = await AsyncFilingQueue.queueFilingForProcessing(mockFilingPayload);

      expect(result.queuePosition).toBe(1);
    });
  });
});
