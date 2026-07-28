/**
 * Discovery Handler - Unprocessed Filing Recovery Tests
 *
 * Tests for recovering orphaned filings that are in RssFilingCheck
 * with processed=false but have no corresponding fetch jobs.
 *
 * Reference: docs/plans/2026-01-08-fix-orphaned-filings-pipeline.md
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Create mock Prisma instance
const mockPrisma = {
  ticker: {
    findMany: jest.fn(),
  },
  cikMapping: {
    findMany: jest.fn(),
  },
  tickerMonitoring: {
    findFirst: jest.fn(),
  },
  rssFilingCheck: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  jobQueue: {
    createMany: jest.fn(),
  },
};

// Track markFilingAsProcessed calls
const markFilingAsProcessedCalls: Array<{ id: string }> = [];

// Mock Prisma before importing modules that use it
jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

// Mock ticker-monitoring module
jest.mock('../../../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn().mockResolvedValue([]),
  getUnprocessedFilings: jest.fn(),
  markFilingAsProcessed: jest.fn(async (id: string) => {
    markFilingAsProcessedCalls.push({ id });
  }),
}));

// Mock the SEC filing discovery module
jest.mock('../../../lib/cron/sec-filing-service', () => ({
  checkForNewFilings: jest.fn(),
}));

// Mock logging to avoid console noise
jest.mock('../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

describe('Discovery Handler - Unprocessed Filing Recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    markFilingAsProcessedCalls.length = 0;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should process existing unprocessed filings even when RSS returns empty', async () => {
    // Setup: Create RssFilingCheck with processed=false, no pending fetch jobs
    const unprocessedFilings = [
      {
        id: 'rss-check-1',
        accessionNumber: '0001950047-26-000247',
        filingType: '10-K',
        filingDate: new Date('2026-01-05'),
        filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000195004726000247/0001950047-26-000247-index.htm',
        ticker: {
          cik: '0000320193',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        id: 'rss-check-2',
        accessionNumber: '0001950047-26-000248',
        filingType: '8-K',
        filingDate: new Date('2026-01-06'),
        filingUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000195004726000248/0001950047-26-000248-index.htm',
        ticker: {
          cik: '0001318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.',
        },
      },
    ];

    // Mock: Unique tickers in system
    mockPrisma.ticker.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL' },
      { symbol: 'TSLA' },
    ]);

    // Mock: CIK mappings
    mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
      { ticker: 'AAPL', cik: '0000320193' },
      { ticker: 'TSLA', cik: '0001318605' },
    ]);

    // Mock: Company names
    mockPrisma.ticker.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', companyName: 'Apple Inc.' },
      { symbol: 'TSLA', companyName: 'Tesla, Inc.' },
    ]);

    // Mock: RSS returns empty (no new filings in RSS feed)
    const { checkForNewFilings } = await import('../../../lib/cron/sec-filing-service');
    (checkForNewFilings as jest.Mock).mockResolvedValueOnce([]);

    // Mock: getUnprocessedFilings returns orphaned filings
    const { getUnprocessedFilings } = await import('../../../lib/sec-edgar/ticker-monitoring');
    (getUnprocessedFilings as jest.Mock).mockResolvedValueOnce(unprocessedFilings);

    // Mock: Pre-fetch ALL users for all discovered tickers (single bulk query)
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'user-1',
        email: 'user1@example.com',
        subscriptionTier: 'PRO',
        isTrialing: false,
        trialEndsAt: null,
        tickers: [{ id: 'ticker-1', symbol: 'AAPL', companyName: 'Apple Inc.' }],
      },
      {
        id: 'user-2',
        email: 'user2@example.com',
        subscriptionTier: 'FREE',
        isTrialing: false,
        trialEndsAt: null,
        tickers: [{ id: 'ticker-2', symbol: 'TSLA', companyName: 'Tesla, Inc.' }],
      },
    ]);

    // Mock: Job creation returns count
    mockPrisma.jobQueue.createMany.mockResolvedValue({ count: 1 });

    // Execute
    const { handleDiscovery } = await import('../../../lib/cron/handlers/discovery-handler');
    const result = await handleDiscovery({
      executionId: 'test-exec-001',
      cronTriggerTime: new Date().toISOString(),
    });

    // Assert: Filings were discovered from unprocessed backlog
    expect(result.success).toBe(true);
    expect(result.filingsDiscovered).toBeGreaterThan(0);
    expect(result.fetchJobsQueued).toBeGreaterThan(0);

    // Assert: getUnprocessedFilings was called
    expect(getUnprocessedFilings).toHaveBeenCalledWith(50);
  });

  it('should mark filings as processed after job creation', async () => {
    // Setup: Single unprocessed filing
    const unprocessedFilings = [
      {
        id: 'rss-check-mark-test',
        accessionNumber: '0001950047-26-000300',
        filingType: '10-Q',
        filingDate: new Date('2026-01-07'),
        filingUrl: 'https://www.sec.gov/test',
        ticker: {
          cik: '0000320193',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
    ];

    // Mock: Unique tickers
    mockPrisma.ticker.findMany.mockResolvedValueOnce([{ symbol: 'AAPL' }]);

    // Mock: CIK mappings
    mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
      { ticker: 'AAPL', cik: '0000320193' },
    ]);

    // Mock: Company names
    mockPrisma.ticker.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', companyName: 'Apple Inc.' },
    ]);

    // Mock: RSS returns empty
    const { checkForNewFilings } = await import('../../../lib/cron/sec-filing-service');
    (checkForNewFilings as jest.Mock).mockResolvedValueOnce([]);

    // Mock: getUnprocessedFilings returns the filing
    const { getUnprocessedFilings, markFilingAsProcessed } = await import('../../../lib/sec-edgar/ticker-monitoring');
    (getUnprocessedFilings as jest.Mock).mockResolvedValueOnce(unprocessedFilings);

    // Mock: Pre-fetch ALL users for all discovered tickers (single bulk query)
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'user-mark-test',
        email: 'user@example.com',
        subscriptionTier: 'FREE',
        isTrialing: false,
        trialEndsAt: null,
        tickers: [{ id: 'ticker-mark-test', symbol: 'AAPL', companyName: 'Apple Inc.' }],
      },
    ]);

    // Mock: Job creation succeeds
    mockPrisma.jobQueue.createMany.mockResolvedValue({ count: 1 });

    // Execute
    const { handleDiscovery } = await import('../../../lib/cron/handlers/discovery-handler');
    await handleDiscovery({
      executionId: 'test-exec-mark',
      cronTriggerTime: new Date().toISOString(),
    });

    // Assert: markFilingAsProcessed was called for the filing
    expect(markFilingAsProcessed).toHaveBeenCalled();
    // The call should include the filing id
    const calls = (markFilingAsProcessed as jest.Mock).mock.calls;
    expect(calls.some((call: unknown[]) => call[0] === 'rss-check-mark-test')).toBe(true);
  });

  it('should handle both RSS new filings AND unprocessed backlog', async () => {
    // Setup: RSS returns one new filing, database has one unprocessed filing
    const rssNewFiling = {
      id: 'NVDA-0001950047-26-000400',
      accessionNumber: '0001950047-26-000400',
      formType: '8-K',
      filingDate: '2026-01-08',
      url: 'https://www.sec.gov/test-nvda',
      ticker: 'NVDA',
      title: '8-K - NVIDIA Corporation',
    };

    const unprocessedFiling = {
      id: 'rss-check-backlog',
      accessionNumber: '0001950047-26-000350',
      filingType: '10-K',
      filingDate: new Date('2026-01-04'),
      filingUrl: 'https://www.sec.gov/test-aapl-backlog',
      ticker: {
        cik: '0000320193',
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
      },
    };

    // Mock: Unique tickers
    mockPrisma.ticker.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL' },
      { symbol: 'NVDA' },
    ]);

    // Mock: CIK mappings
    mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
      { ticker: 'AAPL', cik: '0000320193' },
      { ticker: 'NVDA', cik: '0001045810' },
    ]);

    // Mock: Company names
    mockPrisma.ticker.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', companyName: 'Apple Inc.' },
      { symbol: 'NVDA', companyName: 'NVIDIA Corporation' },
    ]);

    // Mock: RSS returns one new filing
    const { checkForNewFilings } = await import('../../../lib/cron/sec-filing-service');
    (checkForNewFilings as jest.Mock).mockResolvedValueOnce([rssNewFiling]);

    // Mock: getUnprocessedFilings returns one backlog filing
    const { getUnprocessedFilings } = await import('../../../lib/sec-edgar/ticker-monitoring');
    (getUnprocessedFilings as jest.Mock).mockResolvedValueOnce([unprocessedFiling]);

    // Mock: Pre-fetch ALL users for all discovered tickers (single bulk query)
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'user-nvda',
        email: 'nvda@example.com',
        subscriptionTier: 'FREE',
        isTrialing: false,
        trialEndsAt: null,
        tickers: [{ id: 'ticker-nvda', symbol: 'NVDA', companyName: 'NVIDIA Corporation' }],
      },
      {
        id: 'user-aapl-backlog',
        email: 'aapl@example.com',
        subscriptionTier: 'FREE',
        isTrialing: false,
        trialEndsAt: null,
        tickers: [{ id: 'ticker-aapl', symbol: 'AAPL', companyName: 'Apple Inc.' }],
      },
    ]);

    // Mock: Job creation returns count
    mockPrisma.jobQueue.createMany.mockResolvedValue({ count: 1 });

    // Execute
    const { handleDiscovery } = await import('../../../lib/cron/handlers/discovery-handler');
    const result = await handleDiscovery({
      executionId: 'test-exec-both',
      cronTriggerTime: new Date().toISOString(),
    });

    // Assert: Both filings were processed
    expect(result.success).toBe(true);
    expect(result.filingsDiscovered).toBe(2); // One from RSS + one from backlog
    expect(result.fetchJobsQueued).toBe(2); // Jobs for both filings
  });

  it('should not duplicate filings already discovered from RSS', async () => {
    // Setup: Same filing in both RSS and unprocessed backlog
    const sharedAccessionNumber = '0001950047-26-000500';

    const rssNewFiling = {
      id: 'AAPL-' + sharedAccessionNumber,
      accessionNumber: sharedAccessionNumber,
      formType: '10-K',
      filingDate: '2026-01-08',
      url: 'https://www.sec.gov/test-shared',
      ticker: 'AAPL',
      title: '10-K - Apple Inc.',
    };

    const unprocessedFiling = {
      id: 'rss-check-shared',
      accessionNumber: sharedAccessionNumber, // Same accession number
      filingType: '10-K',
      filingDate: new Date('2026-01-08'),
      filingUrl: 'https://www.sec.gov/test-shared',
      ticker: {
        cik: '0000320193',
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
      },
    };

    // Mock: Unique tickers
    mockPrisma.ticker.findMany.mockResolvedValueOnce([{ symbol: 'AAPL' }]);

    // Mock: CIK mappings
    mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
      { ticker: 'AAPL', cik: '0000320193' },
    ]);

    // Mock: Company names
    mockPrisma.ticker.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', companyName: 'Apple Inc.' },
    ]);

    // Mock: RSS returns the filing
    const { checkForNewFilings } = await import('../../../lib/cron/sec-filing-service');
    (checkForNewFilings as jest.Mock).mockResolvedValueOnce([rssNewFiling]);

    // Mock: getUnprocessedFilings also returns the same filing
    const { getUnprocessedFilings } = await import('../../../lib/sec-edgar/ticker-monitoring');
    (getUnprocessedFilings as jest.Mock).mockResolvedValueOnce([unprocessedFiling]);

    // Mock: Pre-fetch ALL users for all discovered tickers (single bulk query)
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'user-dedup',
        email: 'dedup@example.com',
        subscriptionTier: 'FREE',
        isTrialing: false,
        trialEndsAt: null,
        tickers: [{ id: 'ticker-dedup', symbol: 'AAPL', companyName: 'Apple Inc.' }],
      },
    ]);

    // Mock: Job creation returns count
    mockPrisma.jobQueue.createMany.mockResolvedValue({ count: 1 });

    // Execute
    const { handleDiscovery } = await import('../../../lib/cron/handlers/discovery-handler');
    const result = await handleDiscovery({
      executionId: 'test-exec-dedup',
      cronTriggerTime: new Date().toISOString(),
    });

    // Assert: Only one filing processed (deduplication worked)
    expect(result.success).toBe(true);
    expect(result.filingsDiscovered).toBe(1); // Deduplicated to 1
  });
});
