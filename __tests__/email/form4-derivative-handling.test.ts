/**
 * Form 4 Derivative Transaction Handling Tests
 *
 * Tests for Bug 4 (derivative-only filings) and Bug 5 (derivative newStake)
 * from the Form 4 email systemic issues plan.
 */

import { parseResponse } from '../../lib/ai/parsers/response-parser';

// Mock dependencies used by response-parser
jest.mock('../../utils/logger', () => ({
  secLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../lib/monitoring/json-parsing-monitor', () => ({
  jsonParsingMonitor: {
    recordParsingAttempt: jest.fn(),
  },
}));

describe('Derivative transaction handling (Bug 4 & 5)', () => {
  describe('newStake derivation for derivative-only filings (Bug 5)', () => {
    it('should suffix newStake with "derivative securities" when all transactions are derivative-type', () => {
      // Simulates a VRT stock option grant: Table II only, code A, $0 price
      const jsonData = {
        company: 'Vertiv Holdings Co',
        summary: 'Executive received stock option grant.',
        filerName: 'Test Officer',
        transactions: [
          {
            code: 'A',
            type: 'Award/Grant',
            shares: '100000',
            pricePerShare: '$0',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '250000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('250,000 derivative securities');
    });

    it('should suffix newStake with "shares" when transactions include non-derivative types', () => {
      // Mixed filing: purchase (non-derivative) + option exercise (derivative)
      const jsonData = {
        company: 'Tesla Inc',
        summary: 'Insider purchased shares and exercised options.',
        filerName: 'Test Insider',
        transactions: [
          {
            code: 'P',
            type: 'Purchase',
            shares: '1000',
            pricePerShare: '$200',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '50000',
          },
          {
            code: 'M',
            type: 'Exercise',
            shares: '5000',
            pricePerShare: '$50',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '55000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('55,000 shares');
    });

    it('should suffix with "derivative securities" for M-code only filings', () => {
      const jsonData = {
        company: 'Test Corp',
        summary: 'Option exercise filing.',
        filerName: 'Test Person',
        transactions: [
          {
            code: 'M',
            type: 'Exercise',
            shares: '10000',
            pricePerShare: '$15',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '40000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('40,000 derivative securities');
    });

    it('should override AI newStake with derived SOF (holdings-mismatch fix 2026-04)', () => {
      // Plan: .claude/tasks/form4-holdings-mismatch.md — the LLM's top-level
      // newStake is unreliable (Parekh bug: pulled from a Table II RSU row).
      // Derivation from transactions[].sharesOwnedFollowing now always runs.
      const jsonData = {
        company: 'Test Corp',
        summary: 'Test filing.',
        filerName: 'Test Person',
        newStake: '500,000 shares', // LLM hallucinated value — overridden
        transactions: [
          {
            code: 'A',
            type: 'Award/Grant',
            shares: '10000',
            pricePerShare: '$0',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '40000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      // All-derivative filing → "40,000 derivative securities" (A-code with $0)
      expect(data.newStake).toBe('40,000 derivative securities');
    });

    it('should not replace "derivative securities" suffix during stake normalization', () => {
      const jsonData = {
        company: 'Test Corp',
        summary: 'Stock option grant.',
        filerName: 'Test Person',
        transactions: [
          {
            code: 'A',
            type: 'Award/Grant',
            shares: '50000',
            pricePerShare: '$0',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '100000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      // Ensure the normalization doesn't replace "derivative securities" with "shares"
      expect(data.newStake).toContain('derivative securities');
      expect(data.newStake).not.toContain('shares');
    });
  });

  describe('Derivative + disposition codes edge cases', () => {
    it('should treat C (conversion) as derivative', () => {
      const jsonData = {
        company: 'Test Corp',
        summary: 'Conversion filing.',
        filerName: 'Test Person',
        transactions: [
          {
            code: 'C',
            type: 'Conversion',
            shares: '5000',
            pricePerShare: '$0',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '20000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('20,000 derivative securities');
    });

    it('should treat mixed A($0) + M as all-derivative', () => {
      const jsonData = {
        company: 'Test Corp',
        summary: 'Grant and exercise.',
        filerName: 'Test Person',
        transactions: [
          {
            code: 'A',
            type: 'Award/Grant',
            shares: '10000',
            pricePerShare: '$0',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '30000',
          },
          {
            code: 'M',
            type: 'Exercise',
            shares: '5000',
            pricePerShare: '$10',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '35000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('35,000 derivative securities');
    });

    it('should treat A($50) + M as NOT all-derivative (A with price is non-derivative)', () => {
      const jsonData = {
        company: 'Test Corp',
        summary: 'Grant with price and exercise.',
        filerName: 'Test Person',
        transactions: [
          {
            code: 'A',
            type: 'Award/Grant',
            shares: '10000',
            pricePerShare: '$50',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '30000',
          },
          {
            code: 'M',
            type: 'Exercise',
            shares: '5000',
            pricePerShare: '$10',
            acquisitionDisposition: 'A',
            sharesOwnedFollowing: '35000',
          },
        ],
      };

      const result = parseResponse(JSON.stringify(jsonData), '4' as never);
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('35,000 shares');
    });
  });
});
