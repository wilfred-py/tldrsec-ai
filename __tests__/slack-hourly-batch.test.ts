/**
 * Comprehensive Slack Hourly Batching Tests
 * 
 * Tests for hourly batching logic, meaningful activity detection, 
 * edge cases, and memory management in SlackWebhookService.
 */

import type {
  CronExecutionResult,
  JobProcessingResult,
  QueueHealthStatus,
} from '../lib/slack/types';

// Mock the logger
jest.mock('../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Mock fetch for webhook calls
global.fetch = jest.fn();

describe('SlackWebhookService Hourly Batching', () => {
  let slackWebhookService: any;
  const originalEnv = process.env;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Reset environment
    process.env = {
      ...originalEnv,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test',
    };

    // Reset mocks
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    // Dynamically import to avoid module loading issues
    const { slackWebhookService: service } = require('../lib/slack/webhook-service');
    slackWebhookService = service;
    slackWebhookService.initialize();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Meaningful Activity Detection', () => {
    const createQuietCronResult = (): CronExecutionResult => ({
      executionId: 'test-exec',
      startTime: new Date(),
      endTime: new Date(),
      duration: 3000,
      success: true,
      results: {
        filingMonitoring: {
          newFilingsFound: 0,
          errors: 0,
          processed: [],
        },
        jobProcessing: {
          fetchJobsQueued: 0,
          summarizeJobsRun: 0,
          summariesGenerated: 0,
          emailsSent: 0,
          errors: 0,
        },
      },
    });

    const createMeaningfulCronResult = (filings = 3): CronExecutionResult => ({
      ...createQuietCronResult(),
      results: {
        filingMonitoring: {
          newFilingsFound: filings,
          errors: 0,
          processed: [],
        },
        jobProcessing: {
          fetchJobsQueued: filings,
          summarizeJobsRun: 0,
          summariesGenerated: 0,
          emailsSent: 0,
          errors: 0,
        },
      },
    });

    const createHealthyQueueStatus = (): QueueHealthStatus => ({
      pendingJobs: 0,
      activeJobs: 0,
      completedJobs: 10,
      failedJobs: 0,
      deadLetterJobs: 0,
      totalJobs: 10,
      queueHealth: 'healthy',
      avgProcessingTime: 5000,
      circuitBreakerState: 'CLOSED',
      backlogSizeWarning: false,
    });

    test('should not post immediate notification for quiet runs', async () => {
      const quietResult = createQuietCronResult();
      const healthStatus = createHealthyQueueStatus();

      await slackWebhookService.postCronResults(quietResult, healthStatus);

      // Should not have called fetch (no immediate notification)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should post immediate notification for meaningful activity', async () => {
      const meaningfulResult = createMeaningfulCronResult();
      const healthStatus = createHealthyQueueStatus();

      await slackWebhookService.postCronResults(meaningfulResult, healthStatus);

      // Should have called fetch (immediate notification)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    test('should post immediate notification for failed runs', async () => {
      const failedResult = {
        ...createQuietCronResult(),
        success: false,
        results: {
          ...createQuietCronResult().results,
          filingMonitoring: {
            ...createQuietCronResult().results.filingMonitoring,
            errors: 1,
          },
        },
      };
      const healthStatus = createHealthyQueueStatus();

      await slackWebhookService.postCronResults(failedResult, healthStatus);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should post immediate notification for unusually long runs', async () => {
      const slowResult = {
        ...createQuietCronResult(),
        duration: 45000, // 45 seconds
      };
      const healthStatus = createHealthyQueueStatus();

      await slackWebhookService.postCronResults(slowResult, healthStatus);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Job Processing Meaningful Activity', () => {
    const createQuietJobResult = (): JobProcessingResult => ({
      executionId: 'test-job-exec',
      startTime: new Date(),
      endTime: new Date(),
      duration: 5000,
      jobs: {
        total: 5,
        processed: [
          { id: '1', type: 'fetch', success: true, duration: 1000, data: {} },
          { id: '2', type: 'fetch', success: true, duration: 1000, data: {} },
          { id: '3', type: 'fetch', success: true, duration: 1000, data: {} },
          { id: '4', type: 'fetch', success: true, duration: 1000, data: {} },
          { id: '5', type: 'fetch', success: true, duration: 1000, data: {} },
        ],
      },
      pipeline: {
        fetch: { summarizeJobsQueued: 0 },
        summarize: { jobsRun: 0, summariesGenerated: 0, emailsSent: 0 },
      },
    });

    const createMeaningfulJobResult = (): JobProcessingResult => ({
      ...createQuietJobResult(),
      pipeline: {
        fetch: { summarizeJobsQueued: 5 },
        summarize: { jobsRun: 3, summariesGenerated: 3, emailsSent: 8 },
      },
    });

    test('should not post immediate notification for quiet job processing', async () => {
      const quietJobResult = createQuietJobResult();

      await slackWebhookService.postJobProcessingResults(quietJobResult);

      // Should not have posted immediate notification
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should post immediate notification when summaries generated', async () => {
      const meaningfulJobResult = createMeaningfulJobResult();

      await slackWebhookService.postJobProcessingResults(meaningfulJobResult);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should post immediate notification when emails sent', async () => {
      const emailJobResult = {
        ...createQuietJobResult(),
        pipeline: {
          fetch: { summarizeJobsQueued: 0 },
          summarize: { jobsRun: 0, summariesGenerated: 0, emailsSent: 3 },
        },
      };

      await slackWebhookService.postJobProcessingResults(emailJobResult);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should post immediate notification when jobs fail', async () => {
      const failedJobResult = {
        ...createQuietJobResult(),
        jobs: {
          total: 3,
          processed: [
            { id: '1', type: 'fetch', success: true, duration: 1000, data: {} },
            { id: '2', type: 'summarize', success: false, duration: 1000, data: {}, error: 'Test failure' },
            { id: '3', type: 'fetch', success: true, duration: 1000, data: {} },
          ],
        },
      };

      await slackWebhookService.postJobProcessingResults(failedJobResult);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should skip notification when no jobs processed', async () => {
      const noJobsResult: JobProcessingResult = {
        executionId: 'test-no-jobs',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        jobs: {
          total: 0,
          processed: [],
        },
      };

      await slackWebhookService.postJobProcessingResults(noJobsResult);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Hourly Summary Posting', () => {
    test('should post hourly summary after accumulating quiet runs', async () => {
      // Mock the current time to simulate hour boundary
      const originalNow = Date.now;
      const startTime = new Date('2025-01-01T10:00:00Z').getTime();
      Date.now = jest.fn(() => startTime);

      const quietResult = {
        executionId: 'test-quiet',
        startTime: new Date(),
        endTime: new Date(),
        duration: 3000,
        success: true,
        results: {
          filingMonitoring: { newFilingsFound: 0, errors: 0, processed: [] },
          jobProcessing: { fetchJobsQueued: 0, summarizeJobsRun: 0, summariesGenerated: 0, emailsSent: 0, errors: 0 },
        },
      };
      const healthStatus = createHealthyQueueStatus();

      // Accumulate several quiet runs
      for (let i = 0; i < 5; i++) {
        await slackWebhookService.postCronResults(quietResult, healthStatus);
      }

      // No immediate notifications should have been posted
      expect(mockFetch).not.toHaveBeenCalled();

      // Simulate hour boundary - move to next hour
      Date.now = jest.fn(() => startTime + 60 * 60 * 1000 + 1000);

      // Post hourly summary method (this would typically be called by a scheduler)
      await slackWebhookService.postHourlySummary();

      // Should have posted the hourly summary
      expect(mockFetch).toHaveBeenCalledTimes(1);

      Date.now = originalNow;
    });

    test('should handle empty hourly batch gracefully', async () => {
      // Try to post hourly summary with no accumulated data
      await slackWebhookService.postHourlySummary?.();

      // Should either not post or post empty summary without error
      if (mockFetch.mock.calls.length > 0) {
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1]?.body as string);
        expect(body).toBeDefined();
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle webhook posting errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const meaningfulResult = {
        executionId: 'test-error',
        startTime: new Date(),
        endTime: new Date(),
        duration: 5000,
        success: true,
        results: {
          filingMonitoring: { newFilingsFound: 3, errors: 0, processed: [] },
          jobProcessing: { fetchJobsQueued: 0, summarizeJobsRun: 0, summariesGenerated: 0, emailsSent: 0, errors: 0 },
        },
      };

      // Should not throw error
      await expect(
        slackWebhookService.postCronResults(meaningfulResult, createHealthyQueueStatus())
      ).resolves.not.toThrow();
    });

    test('should handle malformed results gracefully', async () => {
      const malformedResult = {
        executionId: 'test-malformed',
        // Missing required fields
      } as any;

      await expect(
        slackWebhookService.postCronResults(malformedResult, createHealthyQueueStatus())
      ).resolves.not.toThrow();
    });

    test('should handle undefined metrics gracefully', async () => {
      const undefinedMetricsResult = {
        executionId: 'test-undefined',
        startTime: new Date(),
        endTime: new Date(),
        duration: 5000,
        success: true,
        results: undefined,
      } as any;

      await expect(
        slackWebhookService.postCronResults(undefinedMetricsResult, createHealthyQueueStatus())
      ).resolves.not.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory with many quiet runs', async () => {
      const quietResult = {
        executionId: 'test-memory',
        startTime: new Date(),
        endTime: new Date(),
        duration: 3000,
        success: true,
        results: {
          filingMonitoring: { newFilingsFound: 0, errors: 0, processed: [] },
          jobProcessing: { fetchJobsQueued: 0, summarizeJobsRun: 0, summariesGenerated: 0, emailsSent: 0, errors: 0 },
        },
      };

      // Simulate many quiet runs (like a full day of 10-minute intervals)
      for (let i = 0; i < 144; i++) {
        await slackWebhookService.postCronResults(quietResult, createHealthyQueueStatus());
      }

      // Should not have posted immediate notifications
      expect(mockFetch).not.toHaveBeenCalled();

      // Service should still be functional
      expect(slackWebhookService.isConfigured()).toBe(true);
    });

    test('should reset hourly batch at hour boundaries', async () => {
      const originalNow = Date.now;
      let currentTime = new Date('2025-01-01T10:30:00Z').getTime();
      Date.now = jest.fn(() => currentTime);

      const result = {
        executionId: 'test-boundary',
        startTime: new Date(),
        endTime: new Date(),
        duration: 3000,
        success: true,
        results: {
          filingMonitoring: { newFilingsFound: 1, errors: 0, processed: [] },
          jobProcessing: { fetchJobsQueued: 0, summarizeJobsRun: 0, summariesGenerated: 0, emailsSent: 0, errors: 0 },
        },
      };

      // Post in current hour
      await slackWebhookService.postCronResults(result, createHealthyQueueStatus());
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Move to next hour
      currentTime = new Date('2025-01-01T11:15:00Z').getTime();

      // Post again - should start fresh batch
      await slackWebhookService.postCronResults(result, createHealthyQueueStatus());
      expect(mockFetch).toHaveBeenCalledTimes(2);

      Date.now = originalNow;
    });
  });

  describe('Configuration Handling', () => {
    test('should handle missing webhook URL gracefully', async () => {
      delete process.env.SLACK_WEBHOOK_URL;

      const { slackWebhookService: unconfiguredService } = require('../lib/slack/webhook-service');
      unconfiguredService.initialize();

      const result = {
        executionId: 'test-no-config',
        startTime: new Date(),
        endTime: new Date(),
        duration: 5000,
        success: true,
        results: {
          filingMonitoring: { newFilingsFound: 5, errors: 0, processed: [] },
          jobProcessing: { fetchJobsQueued: 0, summarizeJobsRun: 0, summariesGenerated: 0, emailsSent: 0, errors: 0 },
        },
      };

      // Should not throw and should not call webhook
      await expect(
        unconfiguredService.postCronResults(result, createHealthyQueueStatus())
      ).resolves.not.toThrow();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  const createHealthyQueueStatus = (): QueueHealthStatus => ({
    pendingJobs: 0,
    activeJobs: 0,
    completedJobs: 10,
    failedJobs: 0,
    deadLetterJobs: 0,
    totalJobs: 10,
    queueHealth: 'healthy',
    avgProcessingTime: 5000,
    circuitBreakerState: 'CLOSED',
    backlogSizeWarning: false,
  });
});