/**
 * Historical Context Tests
 *
 * Tests for retrieving historical summaries and building context-enriched prompts.
 * Phase 3 of SEC Summary Quality Improvements.
 *
 * Key scenarios tested:
 * 1. Retrieving last N summaries for a ticker
 * 2. Excluding current filing date from historical results
 * 3. Ordering by filing date descending
 * 4. Building context-enriched prompts
 * 5. Truncating long historical summaries
 */

import {
  getHistoricalSummaries,
  buildContextEnrichedPrompt,
  HistoricalSummary,
} from '../../lib/ai/historical-context';

// Create a persistent mock for findMany
const mockFindMany = jest.fn();

// Mock Prisma client - return the SAME mock object every time
jest.mock('../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    summary: {
      findMany: mockFindMany,
    },
  })),
}));

describe('Historical Context for Summaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockReset();
  });

  describe('getHistoricalSummaries', () => {
    it('should retrieve last 3 summaries for ticker', async () => {
      const mockSummaries = [
        {
          id: '1',
          filingType: '4',
          filingDate: new Date('2026-01-10'),
          summaryText: 'CEO sold shares...',
          ticker: { symbol: 'GOOG' },
        },
        {
          id: '2',
          filingType: '4',
          filingDate: new Date('2026-01-05'),
          summaryText: 'CFO exercised options...',
          ticker: { symbol: 'GOOG' },
        },
        {
          id: '3',
          filingType: '8-K',
          filingDate: new Date('2025-12-20'),
          summaryText: 'Material event...',
          ticker: { symbol: 'GOOG' },
        },
      ];

      mockFindMany.mockResolvedValue(mockSummaries);

      const summaries = await getHistoricalSummaries('GOOG', '2026-01-12');

      expect(summaries).toHaveLength(3);
      expect(summaries.every((s) => s.ticker.symbol === 'GOOG')).toBe(true);
    });

    it('should exclude the current filing date', async () => {
      mockFindMany.mockResolvedValue([]);

      await getHistoricalSummaries('GOOG', '2026-01-12');

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            filingDate: {
              lt: new Date('2026-01-12'),
            },
          }),
        })
      );
    });

    it('should order by filing date descending', async () => {
      mockFindMany.mockResolvedValue([]);

      await getHistoricalSummaries('GOOG', '2026-01-12');

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            filingDate: 'desc',
          },
        })
      );
    });

    it('should return empty array for new ticker with no prior summaries', async () => {
      mockFindMany.mockResolvedValue([]);

      const summaries = await getHistoricalSummaries('NEWCO', '2026-01-12');

      expect(summaries).toHaveLength(0);
    });

    it('should limit results to maximum of 3 summaries', async () => {
      mockFindMany.mockResolvedValue([]);

      await getHistoricalSummaries('GOOG', '2026-01-12');

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3,
        })
      );
    });

    it('should query by ticker symbol', async () => {
      mockFindMany.mockResolvedValue([]);

      await getHistoricalSummaries('TSLA', '2026-01-12');

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ticker: {
              symbol: 'TSLA',
            },
          }),
        })
      );
    });
  });

  describe('buildContextEnrichedPrompt', () => {
    it('should include historical context section when summaries exist', () => {
      const historicalSummaries: HistoricalSummary[] = [
        {
          id: '1',
          filingType: '4',
          filingDate: new Date('2026-01-05'),
          summaryText: 'CEO sold 10K shares...',
          ticker: { symbol: 'GOOG' },
        },
        {
          id: '2',
          filingType: '4',
          filingDate: new Date('2025-12-15'),
          summaryText: 'CFO exercised options...',
          ticker: { symbol: 'GOOG' },
        },
      ];

      const enrichedPrompt = buildContextEnrichedPrompt(
        'Current filing content',
        historicalSummaries
      );

      expect(enrichedPrompt).toContain('## Historical Context');
      expect(enrichedPrompt).toContain('CEO sold 10K shares');
      expect(enrichedPrompt).toContain('CFO exercised options');
    });

    it('should not include historical section when no prior summaries', () => {
      const enrichedPrompt = buildContextEnrichedPrompt('Current filing content', []);
      expect(enrichedPrompt).not.toContain('## Historical Context');
      expect(enrichedPrompt).toBe('Current filing content');
    });

    it('should truncate long historical summaries', () => {
      const longSummary = 'A'.repeat(5000);
      const historicalSummaries: HistoricalSummary[] = [
        {
          id: '1',
          filingType: '4',
          filingDate: new Date('2026-01-05'),
          summaryText: longSummary,
          ticker: { symbol: 'GOOG' },
        },
      ];

      const enrichedPrompt = buildContextEnrichedPrompt('Current content', historicalSummaries);

      // Should be truncated - enriched prompt should be less than long summary + reasonable overhead
      expect(enrichedPrompt.length).toBeLessThan(longSummary.length + 1000);
      expect(enrichedPrompt).toContain('...');
    });

    it('should include filing type and date for each historical summary', () => {
      const historicalSummaries: HistoricalSummary[] = [
        {
          id: '1',
          filingType: 'Form 4',
          filingDate: new Date('2026-01-05'),
          summaryText: 'Some summary text',
          ticker: { symbol: 'GOOG' },
        },
      ];

      const enrichedPrompt = buildContextEnrichedPrompt('Current content', historicalSummaries);

      expect(enrichedPrompt).toContain('Form 4');
      expect(enrichedPrompt).toContain('2026-01-05');
    });

    it('should preserve current filing content in output', () => {
      const currentContent = 'This is the current filing content to analyze';
      const historicalSummaries: HistoricalSummary[] = [
        {
          id: '1',
          filingType: '4',
          filingDate: new Date('2026-01-05'),
          summaryText: 'Historical summary',
          ticker: { symbol: 'GOOG' },
        },
      ];

      const enrichedPrompt = buildContextEnrichedPrompt(currentContent, historicalSummaries);

      expect(enrichedPrompt).toContain(currentContent);
      expect(enrichedPrompt).toContain('## Current Filing');
    });
  });
});
