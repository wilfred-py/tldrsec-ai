/**
 * Unit tests for JobQueueService.markForRetry validation
 *
 * Tests that markForRetry correctly validates retry count before marking jobs for retry.
 * This is a defensive measure to prevent jobs from being stuck in RETRYING status
 * when they've already exhausted their retries.
 */

// Mock the prisma module - factory function runs after hoisting
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../../lib/db/prisma', () => {
  // Return the mock object
  const prisma = {
    jobQueue: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  };
  return {
    __esModule: true,
    prisma,
    getPrismaClient: () => prisma,
  };
});

import { JobQueueService } from '@/lib/job-queue';

// Mock job template
const mockJob = {
  id: 'test-job-id',
  jobType: 'TEST_JOB',
  payload: { test: true },
  status: 'FAILED',
  retryCount: 1,
  maxRetries: 3,
  scheduledFor: new Date(),
  priority: 5,
  result: null,
};

describe('JobQueueService.markForRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark job for retry when retryCount < maxRetries', async () => {
    // Arrange: Job with retries remaining
    const jobWithRetries = { ...mockJob, retryCount: 1, maxRetries: 3 };
    mockFindUnique.mockResolvedValue(jobWithRetries);
    mockUpdate.mockResolvedValue({
      ...jobWithRetries,
      status: 'RETRYING',
    });

    // Act
    const retryDate = new Date(Date.now() + 60000);
    const result = await JobQueueService.markForRetry('test-job-id', retryDate, {
      lastError: 'Test error'
    });

    // Assert
    expect(result.status).toBe('RETRYING');
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('should throw error when retryCount >= maxRetries', async () => {
    // Arrange: Job with exhausted retries (retryCount == maxRetries)
    const exhaustedJob = { ...mockJob, retryCount: 3, maxRetries: 3 };
    mockFindUnique.mockResolvedValue(exhaustedJob);

    // Act & Assert
    const retryDate = new Date(Date.now() + 60000);
    await expect(
      JobQueueService.markForRetry('test-job-id', retryDate, { lastError: 'Test error' })
    ).rejects.toThrow('retry count (3) >= max retries (3)');

    // Verify update was NOT called
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should throw error when retryCount > maxRetries', async () => {
    // Arrange: Job where retryCount exceeds maxRetries (edge case)
    const overRetryJob = { ...mockJob, retryCount: 5, maxRetries: 3 };
    mockFindUnique.mockResolvedValue(overRetryJob);

    // Act & Assert
    const retryDate = new Date(Date.now() + 60000);
    await expect(
      JobQueueService.markForRetry('test-job-id', retryDate)
    ).rejects.toThrow('retry count (5) >= max retries (3)');

    // Verify update was NOT called
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should include job ID in error message for debugging', async () => {
    // Arrange
    const exhaustedJob = { ...mockJob, id: 'specific-job-uuid', retryCount: 3, maxRetries: 3 };
    mockFindUnique.mockResolvedValue(exhaustedJob);

    // Act & Assert
    const retryDate = new Date(Date.now() + 60000);
    await expect(
      JobQueueService.markForRetry('specific-job-uuid', retryDate)
    ).rejects.toThrow('specific-job-uuid');
  });
});
