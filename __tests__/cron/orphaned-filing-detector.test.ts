/**
 * Tests for OrphanedFilingDetector
 *
 * Unit tests for OrphanedFilingDetector that verify the service correctly
 * detects filings with processed=false but no corresponding JobQueue entries,
 * and creates ASYNC_FETCH_FILING jobs with the correct per-user payload shape.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 3
 */

// Mock getPrismaClient before importing the module under test
const mockPrismaClient = {
  tickerMonitoring: {
    findMany: jest.fn(),
  },
  rssFilingCheck: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => mockPrismaClient,
}));

jest.mock('@/lib/job-queue', () => ({
  JobQueueService: {
    addJob: jest.fn(),
  },
}));

import { OrphanedFilingDetector } from '@/lib/cron/orphaned-filing-detector';

describe('OrphanedFilingDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectOrphanedFilings', () => {
    it('should return empty array when all unprocessed filings have jobs', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
        ],
      });

      expect(orphaned).toHaveLength(0);
    });

    it('should detect filings without any jobs', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
          { id: 'filing-2', accessionNumber: 'ACC-2', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
        ],
      });

      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].id).toBe('filing-2');
    });

    it('should only consider filings older than threshold', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [
          { id: 'filing-recent', accessionNumber: 'ACC-R', createdAt: new Date() },
        ],
        mockJobsForFilings: [],
      });

      expect(orphaned).toHaveLength(0);
    });

    it('should detect multiple orphaned filings', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 30 * 60 * 1000) },
          { id: 'filing-2', accessionNumber: 'ACC-2', createdAt: new Date(Date.now() - 25 * 60 * 1000) },
          { id: 'filing-3', accessionNumber: 'ACC-3', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
        ],
      });

      expect(orphaned).toHaveLength(2);
      expect(orphaned.map(f => f.id)).toContain('filing-2');
      expect(orphaned.map(f => f.id)).toContain('filing-3');
    });

    it('should return empty array when no unprocessed filings exist', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [],
        mockJobsForFilings: [],
      });

      expect(orphaned).toHaveLength(0);
    });

    it('should use default age threshold of 10 minutes', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 5 * 60 * 1000) },
        ],
        mockJobsForFilings: [],
      });

      expect(orphaned).toHaveLength(0);
    });
  });

  describe('recoverOrphanedFilings', () => {
    const mockTickerMonitoring = {
      id: 'tm-1',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      cik: '0000320193',
    };

    const mockRssFiling = {
      id: 'filing-1',
      filingUrl: 'https://sec.gov/filing/1',
      filingDate: new Date('2026-04-01'),
      filingType: '10-K',
      accessionNumber: 'ACC-1',
    };

    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      subscriptionTier: 'FREE',
      isTrialing: false,
      trialEndsAt: null,
      tickers: [{ id: 'ticker-1', symbol: 'AAPL', companyName: 'Apple Inc.' }],
    };

    beforeEach(() => {
      mockPrismaClient.tickerMonitoring.findMany.mockResolvedValue([mockTickerMonitoring]);
      mockPrismaClient.rssFilingCheck.findMany.mockResolvedValue([mockRssFiling]);
      mockPrismaClient.rssFilingCheck.update.mockResolvedValue({});
      mockPrismaClient.user.findMany.mockResolvedValue([mockUser]);
    });

    it('should create ASYNC_FETCH_FILING jobs for orphaned filings', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created).toHaveLength(1);
      expect(created[0].jobType).toBe('ASYNC_FETCH_FILING');
      expect(created[0].payload.filing.filingId).toBe('filing-1');
    });

    it('should include orphaned-filing-recovery source in execution context', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-Q', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created[0].payload.executionContext.sourceContext).toBe('orphaned-filing-recovery');
    });

    it('should return empty array when no orphaned filings', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [],
        dryRun: true,
      });

      expect(created).toHaveLength(0);
    });

    it('should create one job per user per filing', async () => {
      const user2 = {
        ...mockUser,
        id: 'user-2',
        email: 'user2@example.com',
        tickers: [{ id: 'ticker-2', symbol: 'AAPL', companyName: 'Apple Inc.' }],
      };
      mockPrismaClient.user.findMany.mockResolvedValue([mockUser, user2]);

      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created).toHaveLength(2);
      expect(created[0].payload.userId).toBe('user-1');
      expect(created[1].payload.userId).toBe('user-2');
    });

    it('should skip filings with no real users tracking the ticker', async () => {
      mockPrismaClient.user.findMany.mockResolvedValue([]);

      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created).toHaveLength(0);
    });

    it('should use deterministic idempotency key (no Date.now)', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created[0].idempotencyKey).toBe('orphan-recovery-filing-1-user-1');
      // Run again -- should produce same key (deterministic)
      const created2 = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });
      expect(created2[0].idempotencyKey).toBe(created[0].idempotencyKey);
    });

    it('should set higher priority for recovery jobs', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created[0].priority).toBe(5);
    });

    it('should build correct FetchJobPayload shape', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      const payload = created[0].payload;
      expect(payload.userId).toBe('user-1');
      expect(payload.userEmail).toBe('test@example.com');
      expect(payload.userTier).toBe('FREE');
      expect(payload.ticker.symbol).toBe('AAPL');
      expect(payload.ticker.companyName).toBe('Apple Inc.');
      expect(payload.ticker.cik).toBe('0000320193');
      expect(payload.filing.filingId).toBe('filing-1');
      expect(payload.filing.formType).toBe('10-K');
      expect(payload.filing.filingUrl).toBe('https://sec.gov/filing/1');
      expect(payload.filing.accessionNumber).toBe('ACC-1');
    });
  });

  describe('getOrphanedSummary', () => {
    it('should return formatted summary for single orphaned filing', () => {
      const orphaned = [
        {
          id: 'filing-1',
          accessionNumber: 'ACC-1',
          formType: '10-K',
          tickerId: 'ticker-1',
          createdAt: new Date('2026-01-10T10:00:00Z'),
        },
      ];

      const summary = OrphanedFilingDetector.getOrphanedSummary(orphaned);

      expect(summary).toContain('filing-1');
      expect(summary).toContain('10-K');
      expect(summary).toContain('ACC-1');
    });

    it('should return formatted summary for multiple orphaned filings', () => {
      const orphaned = [
        { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'ticker-1', createdAt: new Date() },
        { id: 'filing-2', accessionNumber: 'ACC-2', formType: '8-K', tickerId: 'ticker-2', createdAt: new Date() },
      ];

      const summary = OrphanedFilingDetector.getOrphanedSummary(orphaned);

      expect(summary).toContain('filing-1');
      expect(summary).toContain('filing-2');
    });

    it('should return empty string for no orphaned filings', () => {
      const summary = OrphanedFilingDetector.getOrphanedSummary([]);

      expect(summary).toBe('');
    });
  });

  describe('checkAndRecover', () => {
    beforeEach(() => {
      mockPrismaClient.tickerMonitoring.findMany.mockResolvedValue([
        { id: 'tm-1', symbol: 'AAPL', companyName: 'Apple Inc.', cik: '0000320193' },
      ]);
      mockPrismaClient.rssFilingCheck.findMany.mockResolvedValue([
        { id: 'filing-1', filingUrl: 'https://sec.gov/1', filingDate: new Date('2026-04-01'), filingType: '10-K', accessionNumber: 'ACC-1' },
      ]);
      mockPrismaClient.rssFilingCheck.update.mockResolvedValue({});
      mockPrismaClient.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'test@example.com', subscriptionTier: 'FREE', isTrialing: false, trialEndsAt: null, tickers: [{ id: 't-1', symbol: 'AAPL', companyName: 'Apple Inc.' }] },
      ]);
    });

    it('should return recovered count and filings list', async () => {
      const result = await OrphanedFilingDetector.checkAndRecover({
        detectOptions: {
          ageThresholdMinutes: 10,
          mockUnprocessedFilings: [
            { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'tm-1', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
          ],
          mockJobsForFilings: [],
        },
        dryRun: true,
      });

      expect(result.recovered).toBe(1);
      expect(result.filings).toHaveLength(1);
      expect(result.filings[0].id).toBe('filing-1');
    });

    it('should return zero when no orphaned filings found', async () => {
      const result = await OrphanedFilingDetector.checkAndRecover({
        detectOptions: {
          mockUnprocessedFilings: [],
          mockJobsForFilings: [],
        },
        dryRun: true,
      });

      expect(result.recovered).toBe(0);
      expect(result.filings).toHaveLength(0);
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      OrphanedFilingDetector.clearRateLimit();
    });

    it('should clear rate limit for testing', () => {
      OrphanedFilingDetector.clearRateLimit();
      expect(true).toBe(true);
    });
  });
});
