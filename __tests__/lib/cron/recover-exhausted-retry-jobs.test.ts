/**
 * Unit tests for BackgroundFilingWorker.recoverExhaustedRetryJobs
 *
 * Tests that jobs stuck in RETRYING status with exhausted retries (retryCount >= maxRetries)
 * are properly marked as FAILED. This is a defensive cleanup mechanism to prevent jobs
 * from being stuck indefinitely in RETRYING status.
 */

// Create mock functions at module scope for access in tests
// Using var for hoisting - these get initialized before jest.mock runs
var mockFindMany = jest.fn();
var mockUpdate = jest.fn();
var mockLoggerInfo = jest.fn();
var mockLoggerWarn = jest.fn();
var mockLoggerError = jest.fn();
var mockLoggerDebug = jest.fn();

// Mock DB - uses arrow functions to defer mock access
jest.mock('../../../lib/db/prisma', () => {
  const prisma = {
    jobQueue: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  };
  return {
    __esModule: true,
    prisma,
    getPrisma: () => prisma,
    getPrismaClient: () => prisma,
  };
});

// Mock logger - uses arrow functions to defer mock access
jest.mock('../../../lib/logging', () => {
  const mockLogger = {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    child: () => mockLogger,
  };
  return { logger: mockLogger };
});

// Mock JobQueueService to prevent database interactions during tests
jest.mock('../../../lib/job-queue', () => ({
  JobQueueService: {
    getJobsToProcessMultipleTypes: jest.fn().mockResolvedValue([]),
  },
}));

// Mock CronFilingProcessor to avoid loading its dependencies
jest.mock('../../../lib/cron/filing-processor', () => ({
  CronFilingProcessor: jest.fn(),
}));

import { BackgroundFilingWorker } from '@/lib/cron/background-filing-worker';

describe('BackgroundFilingWorker.recoverExhaustedRetryJobs', () => {
  let worker: BackgroundFilingWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    worker = new BackgroundFilingWorker('test-process-id');
    // Default: no stale PROCESSING jobs, no exhausted RETRYING jobs
    mockFindMany.mockResolvedValue([]);
  });

  describe('identifies and fails exhausted RETRYING jobs', () => {
    it('should mark RETRYING job as FAILED when retryCount >= maxRetries', async () => {
      // Arrange: First call returns no stale PROCESSING jobs,
      // second call returns exhausted RETRYING job
      mockFindMany
        .mockResolvedValueOnce([]) // recoverStaleJobs query
        .mockResolvedValueOnce([
          {
            id: 'exhausted-job-1',
            status: 'RETRYING',
            retryCount: 3,
            maxRetries: 3,
            lastError: 'Previous error',
          },
        ]); // recoverExhaustedRetryJobs query

      mockUpdate.mockResolvedValue({ id: 'exhausted-job-1', status: 'FAILED' });

      // Act
      await worker.processBatch();

      // Assert: Should update job to FAILED status
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exhausted-job-1' },
          data: expect.objectContaining({
            status: 'FAILED',
          }),
        })
      );
    });

    it('should mark job as FAILED when retryCount exceeds maxRetries', async () => {
      // Arrange: Job where retryCount > maxRetries (edge case)
      mockFindMany
        .mockResolvedValueOnce([]) // recoverStaleJobs query
        .mockResolvedValueOnce([
          {
            id: 'over-retried-job',
            status: 'RETRYING',
            retryCount: 5,
            maxRetries: 3,
          },
        ]);

      mockUpdate.mockResolvedValue({ id: 'over-retried-job', status: 'FAILED' });

      // Act
      await worker.processBatch();

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'over-retried-job' },
          data: expect.objectContaining({
            status: 'FAILED',
          }),
        })
      );
    });

    it('should include descriptive error message in failed job', async () => {
      // Arrange
      mockFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'test-job',
            status: 'RETRYING',
            retryCount: 3,
            maxRetries: 3,
          },
        ]);

      mockUpdate.mockResolvedValue({ id: 'test-job', status: 'FAILED' });

      // Act
      await worker.processBatch();

      // Assert: Error message should mention exhausted retries (case-insensitive)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastError: expect.stringMatching(/exhausted/i),
          }),
        })
      );
    });

    it('should set failedAt timestamp when marking job as FAILED', async () => {
      // Arrange
      mockFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'test-job',
            status: 'RETRYING',
            retryCount: 3,
            maxRetries: 3,
          },
        ]);

      mockUpdate.mockResolvedValue({ id: 'test-job', status: 'FAILED' });

      // Act
      await worker.processBatch();

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should handle multiple exhausted jobs in a single batch', async () => {
      // Arrange: Multiple exhausted jobs
      mockFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'job-1', status: 'RETRYING', retryCount: 3, maxRetries: 3 },
          { id: 'job-2', status: 'RETRYING', retryCount: 4, maxRetries: 3 },
          { id: 'job-3', status: 'RETRYING', retryCount: 5, maxRetries: 5 },
        ]);

      mockUpdate.mockResolvedValue({ status: 'FAILED' });

      // Act
      await worker.processBatch();

      // Assert: All three jobs should be updated
      expect(mockUpdate).toHaveBeenCalledTimes(3);
    });
  });

  describe('does not affect valid RETRYING jobs', () => {
    it('should not touch RETRYING jobs with retries remaining', async () => {
      // Arrange: Job with retries remaining should not be affected
      // The findMany query for exhausted jobs should filter these out
      mockFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]); // No exhausted jobs found

      // Act
      await worker.processBatch();

      // Assert: No updates should occur for recovery
      // Note: There might be updates for job processing, so we check the calls
      const recoveryCalls = mockUpdate.mock.calls.filter(
        (call) => call[0]?.data?.status === 'FAILED' &&
                  call[0]?.data?.lastError?.includes('exhausted')
      );
      expect(recoveryCalls).toHaveLength(0);
    });
  });

  describe('logging and metrics', () => {
    it('should log warning when exhausted jobs are found and cleaned up', async () => {
      // Arrange
      mockFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'job-1', status: 'RETRYING', retryCount: 3, maxRetries: 3 },
        ]);

      mockUpdate.mockResolvedValue({ status: 'FAILED' });

      // Act
      await worker.processBatch();

      // Assert: Should log warning about cleaned up jobs
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('exhausted'),
        expect.objectContaining({
          cleanedUp: 1,
        })
      );
    });

    it('should not log warning when no exhausted jobs found', async () => {
      // Arrange
      mockFindMany.mockResolvedValue([]);

      // Act
      await worker.processBatch();

      // Assert: No warning should be logged for exhausted job cleanup
      const exhaustedWarnCalls = mockLoggerWarn.mock.calls.filter(
        (call) => call[0]?.includes?.('exhausted')
      );
      expect(exhaustedWarnCalls).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully and continue processing', async () => {
      // Arrange: First call succeeds, second throws error
      mockFindMany
        .mockResolvedValueOnce([]) // recoverStaleJobs
        .mockRejectedValueOnce(new Error('Database connection lost')); // recoverExhaustedRetryJobs

      // Act & Assert: Should not throw, should continue gracefully
      await expect(worker.processBatch()).resolves.not.toThrow();
    });

    it('should log error when database operation fails', async () => {
      // Arrange
      mockFindMany
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Database error'));

      // Act
      await worker.processBatch();

      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to recover exhausted'),
        expect.objectContaining({
          error: 'Database error',
        })
      );
    });
  });
});
