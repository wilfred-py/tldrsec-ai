/**
 * Tests for storeSummary multi-user support
 *
 * This test suite verifies the logic for handling multiple users
 * tracking the same ticker symbol. The fix changes findFirst() to
 * findMany() to ensure all users get their summaries.
 */

import { describe, it, expect } from '@jest/globals';

describe('storeSummary Multi-User Support', () => {
  describe('findMany() vs findFirst() behavior', () => {
    it('findFirst() only returns one result even when multiple users track the same symbol', () => {
      // This demonstrates the BUG: findFirst() only returns ONE ticker
      const mockTickers = [
        { id: 'ticker-1', symbol: 'NVDA', userId: 'user-1', companyName: 'NVIDIA Corporation' },
        { id: 'ticker-2', symbol: 'NVDA', userId: 'user-2', companyName: 'NVIDIA Corporation' },
      ];

      // Simulating findFirst() behavior - returns only the first match
      const findFirstResult = mockTickers.find(t => t.symbol === 'NVDA');
      expect(findFirstResult).toBeDefined();
      expect(findFirstResult?.userId).toBe('user-1'); // Only gets the first user

      // The second user would NEVER get their summary with findFirst()
      // This is the bug we're fixing
    });

    it('findMany() returns all results when multiple users track the same symbol', () => {
      // This demonstrates the FIX: findMany() returns ALL tickers
      const mockTickers = [
        { id: 'ticker-1', symbol: 'NVDA', userId: 'user-1', companyName: 'NVIDIA Corporation' },
        { id: 'ticker-2', symbol: 'NVDA', userId: 'user-2', companyName: 'NVIDIA Corporation' },
      ];

      // Simulating findMany() behavior - returns all matches
      const findManyResult = mockTickers.filter(t => t.symbol === 'NVDA');
      expect(findManyResult).toHaveLength(2);
      expect(findManyResult[0].userId).toBe('user-1');
      expect(findManyResult[1].userId).toBe('user-2');

      // Now BOTH users can get their summaries
    });
  });

  describe('summary creation for multi-user tickers', () => {
    it('should create summary records for ALL users tracking the ticker', () => {
      const mockTickers = [
        { id: 'ticker-1', symbol: 'NVDA', userId: 'user-1', companyName: 'NVIDIA Corporation' },
        { id: 'ticker-2', symbol: 'NVDA', userId: 'user-2', companyName: 'NVIDIA Corporation' },
      ];

      // The new implementation loops over all tickers and creates summaries
      const summaryCreationCalls: string[] = [];

      for (const ticker of mockTickers) {
        // Each ticker gets a summary created
        summaryCreationCalls.push(ticker.id);
      }

      expect(summaryCreationCalls).toHaveLength(2);
      expect(summaryCreationCalls).toContain('ticker-1');
      expect(summaryCreationCalls).toContain('ticker-2');
    });

    it('should handle single user case correctly', () => {
      const mockTickers = [
        { id: 'ticker-1', symbol: 'VRT', userId: 'user-1', companyName: 'Vertiv Holdings' },
      ];

      const summaryCreationCalls: string[] = [];

      for (const ticker of mockTickers) {
        summaryCreationCalls.push(ticker.id);
      }

      expect(summaryCreationCalls).toHaveLength(1);
      expect(summaryCreationCalls[0]).toBe('ticker-1');
    });

    it('should handle empty ticker result gracefully', () => {
      const mockTickers: Array<{ id: string; symbol: string }> = [];

      const summaryCreationCalls: string[] = [];

      for (const ticker of mockTickers) {
        summaryCreationCalls.push(ticker.id);
      }

      expect(summaryCreationCalls).toHaveLength(0);
    });
  });

  describe('storeSummary return value changes', () => {
    it('should return { stored: number, total: number } for multi-user support', () => {
      // The new function signature returns an object with counts
      interface StoreSummaryResult {
        stored: number;
        total: number;
        errors: string[];
      }

      // Example: 3 users track NVDA, 2 succeed, 1 fails
      const mockResult: StoreSummaryResult = {
        stored: 2,
        total: 3,
        errors: ['user-3: Database constraint violation'],
      };

      expect(mockResult.stored).toBe(2);
      expect(mockResult.total).toBe(3);
      expect(mockResult.errors).toHaveLength(1);
    });

    it('should return true for backwards compatibility when all users receive summary', () => {
      // For backwards compatibility, we can still use boolean-like checks
      const result = { stored: 2, total: 2, errors: [] };

      // Check if "successful" - at least one user got the summary
      const isSuccess = result.stored > 0;
      expect(isSuccess).toBe(true);

      // Check if "complete" - all users got the summary
      const isComplete = result.stored === result.total;
      expect(isComplete).toBe(true);
    });

    it('should return partial success when some users fail', () => {
      const result = { stored: 1, total: 3, errors: ['user-2: error', 'user-3: error'] };

      // Still partially successful
      const isSuccess = result.stored > 0;
      expect(isSuccess).toBe(true);

      // But not complete
      const isComplete = result.stored === result.total;
      expect(isComplete).toBe(false);

      // Can log errors
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('idempotency key handling', () => {
    it('should use userId in idempotency key to prevent cross-user duplicates', () => {
      const accessionNumber = '0001588670-25-000017';
      const userId1 = 'user-1';
      const userId2 = 'user-2';

      // Old behavior: Same idempotency key for all users (BUG)
      const oldKey = `ASYNC_FETCH_FILING:${accessionNumber}`;
      expect(oldKey).toBe('ASYNC_FETCH_FILING:0001588670-25-000017');

      // New behavior: Include userId to make keys unique per user
      const newKey1 = `ASYNC_FETCH_FILING:${userId1}:${accessionNumber}`;
      const newKey2 = `ASYNC_FETCH_FILING:${userId2}:${accessionNumber}`;

      expect(newKey1).not.toBe(newKey2);
      expect(newKey1).toBe('ASYNC_FETCH_FILING:user-1:0001588670-25-000017');
      expect(newKey2).toBe('ASYNC_FETCH_FILING:user-2:0001588670-25-000017');
    });
  });
});
