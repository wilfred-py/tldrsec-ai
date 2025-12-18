/**
 * Discovery Handler Bulk Operations Tests
 *
 * Tests for bulk CIK enrichment to replace N+1 query patterns
 * with efficient bulk queries.
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

describe('Discovery Handler Bulk Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enrichTickersWithCik', () => {
    it('should use bulk findMany for CIK lookups instead of N individual queries', async () => {
      const tickerSymbols = ['AAPL', 'TSLA', 'NVDA'];

      // Mock CIK mappings bulk query
      mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'TSLA', cik: '0001318605' },
        { ticker: 'NVDA', cik: '0001045810' },
      ]);

      // Mock company names bulk query
      mockPrisma.ticker.findMany.mockResolvedValueOnce([
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'TSLA', companyName: 'Tesla, Inc.' },
        { symbol: 'NVDA', companyName: 'NVIDIA Corporation' },
      ]);

      // Import after mocks are set up
      const { enrichTickersWithCik } = await import('../../../../lib/cron/handlers/discovery-handler');

      const result = await enrichTickersWithCik(tickerSymbols);

      // Should call findMany with `in` clause, not findFirst N times
      expect(mockPrisma.cikMapping.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.cikMapping.findMany).toHaveBeenCalledWith({
        where: { ticker: { in: tickerSymbols } }
      });

      // Should also bulk query company names
      expect(mockPrisma.ticker.findMany).toHaveBeenCalledTimes(1);

      // Verify results
      expect(result).toHaveLength(3);
      expect(result.find(t => t.symbol === 'AAPL')?.cik).toBe('0000320193');
      expect(result.find(t => t.symbol === 'TSLA')?.cik).toBe('0001318605');
      expect(result.find(t => t.symbol === 'NVDA')?.cik).toBe('0001045810');
    });

    it('should return enriched array with correct structure', async () => {
      const tickerSymbols = ['AAPL', 'TSLA'];

      mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'TSLA', cik: '0001318605' },
      ]);

      mockPrisma.ticker.findMany.mockResolvedValueOnce([
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'TSLA', companyName: 'Tesla, Inc.' },
      ]);

      const { enrichTickersWithCik } = await import('../../../../lib/cron/handlers/discovery-handler');
      const result = await enrichTickersWithCik(tickerSymbols);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(2);

      // Check structure of each result
      for (const ticker of result) {
        expect(ticker).toHaveProperty('symbol');
        expect(ticker).toHaveProperty('companyName');
        expect(ticker).toHaveProperty('cik');
      }

      expect(result.find(t => t.symbol === 'AAPL')?.cik).toBe('0000320193');
      expect(result.find(t => t.symbol === 'AAPL')?.companyName).toBe('Apple Inc.');
    });

    it('should handle tickers without CIK mapping gracefully', async () => {
      const tickerSymbols = ['AAPL', 'UNKNOWN'];

      mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
        { ticker: 'AAPL', cik: '0000320193' },
        // UNKNOWN has no CIK mapping
      ]);

      mockPrisma.ticker.findMany.mockResolvedValueOnce([
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'UNKNOWN', companyName: 'Unknown Company' },
      ]);

      const { enrichTickersWithCik } = await import('../../../../lib/cron/handlers/discovery-handler');
      const result = await enrichTickersWithCik(tickerSymbols);

      expect(result.length).toBe(2);
      expect(result.find(t => t.symbol === 'AAPL')?.cik).toBe('0000320193');
      expect(result.find(t => t.symbol === 'UNKNOWN')?.cik).toBeNull();
    });

    it('should handle empty ticker list', async () => {
      const { enrichTickersWithCik } = await import('../../../../lib/cron/handlers/discovery-handler');
      const result = await enrichTickersWithCik([]);

      expect(result).toEqual([]);
      // Should not make any database calls for empty input
      expect(mockPrisma.cikMapping.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.ticker.findMany).not.toHaveBeenCalled();
    });

    it('should use ticker symbol as fallback company name when not found', async () => {
      const tickerSymbols = ['NEWCO'];

      mockPrisma.cikMapping.findMany.mockResolvedValueOnce([
        { ticker: 'NEWCO', cik: '0001234567' },
      ]);

      // No company name found
      mockPrisma.ticker.findMany.mockResolvedValueOnce([]);

      const { enrichTickersWithCik } = await import('../../../../lib/cron/handlers/discovery-handler');
      const result = await enrichTickersWithCik(tickerSymbols);

      expect(result.length).toBe(1);
      expect(result[0].symbol).toBe('NEWCO');
      expect(result[0].companyName).toBe('NEWCO'); // Falls back to symbol
      expect(result[0].cik).toBe('0001234567');
    });
  });
});
