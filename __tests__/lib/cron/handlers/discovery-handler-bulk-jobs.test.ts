/**
 * Discovery Handler Bulk Job Creation Tests
 *
 * Tests for bulk job creation to replace sequential addJob calls
 * with efficient bulk createMany operations.
 *
 * Reference: docs/plans/2025-12-18-discovery-scalability-optimization.md
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Create mock Prisma instance
const mockPrisma = {
  ticker: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  cikMapping: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  jobQueue: {
    createMany: jest.fn(),
    findFirst: jest.fn(),
  },
  tickerMonitoring: {
    findFirst: jest.fn(),
  },
};

// Mock Prisma before importing modules that use it
jest.mock('../../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

// Mock logging to avoid console noise
jest.mock('../../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Mock the SEC filing service
jest.mock('../../../../lib/cron/sec-filing-service', () => ({
  CronSecFilingService: {
    checkForNewFilings: jest.fn().mockResolvedValue([]),
  },
}));

describe('Discovery Handler Bulk Job Creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBulkFetchJobs', () => {
    it('should use createMany instead of individual addJob calls', async () => {
      const usersForFiling = [
        { id: 'user-1', email: 'user1@example.com', subscriptionTier: 'PRO', tickers: [{ id: 'ticker-1', companyName: 'Apple' }] },
        { id: 'user-2', email: 'user2@example.com', subscriptionTier: 'HOBBY', tickers: [{ id: 'ticker-2', companyName: 'Apple' }] },
      ];

      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      const tickerInfo = { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' };

      const executionContext = {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      };

      mockPrisma.jobQueue.createMany.mockResolvedValueOnce({ count: 2 });

      const { createBulkFetchJobs } = await import('../../../../lib/cron/handlers/discovery-handler');
      const result = await createBulkFetchJobs(usersForFiling, filing, tickerInfo, executionContext);

      expect(mockPrisma.jobQueue.createMany).toHaveBeenCalledTimes(1);
      expect(result).toBe(2);

      // Verify the data structure
      const createManyCall = mockPrisma.jobQueue.createMany.mock.calls[0][0];
      expect(createManyCall.data.length).toBe(2);
      expect(createManyCall.skipDuplicates).toBe(true);
    });

    it('should generate correct idempotency keys for deduplication', async () => {
      const usersForFiling = [
        { id: 'user-1', email: 'user1@example.com', subscriptionTier: 'PRO', tickers: [{ id: 'ticker-1', companyName: 'Apple' }] },
      ];

      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      mockPrisma.jobQueue.createMany.mockResolvedValueOnce({ count: 1 });

      const { createBulkFetchJobs } = await import('../../../../lib/cron/handlers/discovery-handler');
      await createBulkFetchJobs(usersForFiling, filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      });

      const createManyCall = mockPrisma.jobQueue.createMany.mock.calls[0][0];
      const jobData = createManyCall.data[0];

      // Idempotency key format: ASYNC_FETCH_FILING:userId:accessionNumber
      expect(jobData.idempotencyKey).toBe('ASYNC_FETCH_FILING:user-1:0000320193-25-000001');
    });

    it('should handle empty user list gracefully', async () => {
      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      const { createBulkFetchJobs } = await import('../../../../lib/cron/handlers/discovery-handler');
      const result = await createBulkFetchJobs([], filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      });

      expect(result).toBe(0);
      expect(mockPrisma.jobQueue.createMany).not.toHaveBeenCalled();
    });

    it('should set correct priority based on subscription tier', async () => {
      const usersForFiling = [
        { id: 'user-1', email: 'user1@example.com', subscriptionTier: 'ENTERPRISE', tickers: [{ id: 'ticker-1', companyName: 'Apple' }] },
        { id: 'user-2', email: 'user2@example.com', subscriptionTier: 'PROFESSIONAL', tickers: [{ id: 'ticker-2', companyName: 'Apple' }] },
        { id: 'user-3', email: 'user3@example.com', subscriptionTier: 'HOBBY', tickers: [{ id: 'ticker-3', companyName: 'Apple' }] },
      ];

      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      mockPrisma.jobQueue.createMany.mockResolvedValueOnce({ count: 3 });

      const { createBulkFetchJobs } = await import('../../../../lib/cron/handlers/discovery-handler');
      await createBulkFetchJobs(usersForFiling, filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      });

      const createManyCall = mockPrisma.jobQueue.createMany.mock.calls[0][0];
      const jobs = createManyCall.data;

      // Find jobs by userId in payload
      const enterpriseJob = jobs.find((j: { payload: { userId: string } }) => j.payload.userId === 'user-1');
      const professionalJob = jobs.find((j: { payload: { userId: string } }) => j.payload.userId === 'user-2');
      const hobbyJob = jobs.find((j: { payload: { userId: string } }) => j.payload.userId === 'user-3');

      expect(enterpriseJob.priority).toBe(8); // ENTERPRISE
      expect(professionalJob.priority).toBe(7); // PROFESSIONAL
      expect(hobbyJob.priority).toBe(5); // HOBBY
    });

    it('should skip users without ticker records', async () => {
      const usersForFiling = [
        { id: 'user-1', email: 'user1@example.com', subscriptionTier: 'PRO', tickers: [{ id: 'ticker-1', companyName: 'Apple' }] },
        { id: 'user-2', email: 'user2@example.com', subscriptionTier: 'HOBBY', tickers: [] }, // No ticker record
      ];

      const filing = {
        ticker: 'AAPL',
        formType: '10-K',
        filingDate: '2025-01-15',
        url: 'https://sec.gov/filing',
        accessionNumber: '0000320193-25-000001',
        id: 'AAPL-0000320193-25-000001',
        title: 'Annual Report',
      };

      mockPrisma.jobQueue.createMany.mockResolvedValueOnce({ count: 1 });

      const { createBulkFetchJobs } = await import('../../../../lib/cron/handlers/discovery-handler');
      const result = await createBulkFetchJobs(usersForFiling, filing, { symbol: 'AAPL', cik: '0000320193', companyName: 'Apple Inc.' }, {
        executionId: 'exec-123',
        cronTriggerTime: '2025-01-15T10:00:00Z',
      });

      const createManyCall = mockPrisma.jobQueue.createMany.mock.calls[0][0];
      expect(createManyCall.data.length).toBe(1); // Only user-1 has ticker
      expect(result).toBe(1);
    });
  });
});
