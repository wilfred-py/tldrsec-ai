/**
 * Form 4 Prompt Eval Suite
 *
 * Integration tests that verify AI prompt compliance for Form 4 filings.
 * These tests run the actual parser on realistic AI response shapes
 * to verify that the normalizer + parser pipeline handles all observed
 * AI output patterns correctly.
 *
 * NOTE: These tests do NOT call the live AI API. They test the parser's
 * handling of response shapes that the AI has been observed to produce.
 * For live AI round-trip testing, use `npm run test:e2e`.
 *
 * Test coverage:
 * - sharesOwnedFollowing compliance (Bug 3)
 * - Field name variants the AI actually uses vs schema
 * - Cross-form normalizer alignment (10-K financials, DEF 14A exec comp)
 */

import { parseResponse } from '../../lib/ai/parsers/response-parser';
import { normalizeForm4Data } from '../../lib/email/form4-field-normalizer';

describe('Form 4 Prompt Eval: sharesOwnedFollowing Compliance', () => {
  describe('when AI returns sharesOwnedFollowing on transactions', () => {
    it('should derive newStake and previousStake from transaction data', () => {
      const aiResponse = JSON.stringify({
        company: 'NVIDIA CORP',
        summary: 'NVDA Director sold 3,004 shares at $184.90, direct holdings dropped to 14,788 shares.',
        filerName: 'Dabiri John',
        filerRole: 'Director',
        filingDate: '2026-03-17',
        totalValue: '$555,440',
        has10b51Plan: true,
        transactions: [
          {
            code: 'S',
            type: 'Sale',
            shares: '3,004',
            pricePerShare: '$184.90',
            date: '2026-03-13',
            acquisitionDisposition: 'D',
            sharesOwnedFollowing: '14,788',
          },
        ],
        signalStrength: '10b5-1 Plan',
        percentageChange: '-16.90%',
      });

      const result = parseResponse(aiResponse, '4' as any);
      expect(result.success).toBe(true);

      const data = result.data as Record<string, unknown>;
      const txns = data.transactions as Record<string, unknown>[];
      expect(txns[0].sharesOwnedFollowing).toBeDefined();

      // Verify the normalizer can derive stakes
      const normalized = normalizeForm4Data(data);
      expect(normalized).not.toBeNull();
      // newStake is derived from sharesOwnedFollowing — parser may add "shares" suffix
      expect(normalized!.newStake).toMatch(/14[,.]?788/);
      expect(normalized!.previousStake).toBeTruthy();
    });
  });

  describe('when AI omits sharesOwnedFollowing (the common failure)', () => {
    it('should still produce valid output with fallback from summaryText', () => {
      const aiResponse = JSON.stringify({
        company: 'NVIDIA CORP',
        summary: 'NVDA Director sold 3,004 shares at $184.90, direct holdings dropped to 14,788 shares.',
        filerName: 'Dabiri John',
        filerRole: 'Director',
        transactions: [
          {
            code: 'S',
            type: 'Sale',
            shares: '3,004',
            pricePerShare: '$184.90',
            acquisitionDisposition: 'D',
            // sharesOwnedFollowing intentionally omitted
          },
        ],
        signalStrength: '10b5-1 Plan',
        percentageChange: '-16.90%',
      });

      const result = parseResponse(aiResponse, '4' as any);
      expect(result.success).toBe(true);

      // Normalizer should extract newStake from summaryText fallback
      const data = result.data as Record<string, unknown>;
      const summaryText = 'NVDA Director sold 3,004 shares at $184.90, direct holdings dropped to 14,788 shares.';
      const normalized = normalizeForm4Data(data, summaryText);
      expect(normalized).not.toBeNull();
      expect(normalized!.newStake).toBe('14,788');
    });

    it('should handle summaryText with "totaled X shares" pattern', () => {
      const data = {
        company: 'VRT',
        summary: 'Test',
        filerName: 'Test',
        transactions: [{ code: 'F', shares: 930, pricePerShare: '$258.88' }],
      };
      const summaryText = 'Post-transaction direct holdings totaled 3,318 shares including RSUs.';
      const normalized = normalizeForm4Data(data, summaryText);
      expect(normalized!.newStake).toBe('3,318');
    });

    it('should handle summaryText with "holdings at X shares" pattern', () => {
      const data = {
        company: 'BAC',
        summary: 'Test',
        filerName: 'Test',
        transactions: [{ code: 'M', shares: 18082 }],
      };
      const summaryText = 'Direct holdings net unchanged at 2,699,612 shares plus indirect positions.';
      const normalized = normalizeForm4Data(data, summaryText);
      expect(normalized!.newStake).toBe('2,699,612');
    });

    it('should handle summaryText with "position of X shares" pattern', () => {
      const data = {
        company: 'MSFT',
        summary: 'Test',
        filerName: 'Test',
        transactions: [{ code: 'A', shares: '52.01', pricePerShare: '$0' }],
      };
      const summaryText = 'This boosts her derivative holdings to 23,020 units.';
      const normalized = normalizeForm4Data(data, summaryText);
      expect(normalized!.newStake).toBe('23,020');
    });
  });

  describe('AI response shape variants observed in production', () => {
    it('should handle AAPL pattern: non-standard field names', () => {
      // Exact shape observed in DB for AAPL Newstead (March 17, 2026)
      const data = {
        company: 'Apple Inc.',
        summary: 'AAPL SVP Jennifer Newstead vested 60,208 RSUs.',
        filerName: 'Newstead Jennifer',
        filerRole: 'SVP, GC and Secretary',
        filingDate: '2026-03-17',
        totalValue: '$8,135,903.00',
        has10b51Plan: false,
        transactions: [
          { code: 'M', price: 0, table: 'I', action: 'Acquired', shares: 60208, security: 'Common Stock' },
          { code: 'F', price: '$250.12', table: 'I', action: 'Disposed', shares: 32528, security: 'Common Stock' },
          { code: 'M', price: 0, table: 'II', action: 'Disposed', shares: 60208, security: 'Restricted Stock Unit' },
        ],
        signalStrength: 'Option Exercise',
        percentageChange: '-54.00%',
      };

      const normalized = normalizeForm4Data(data);
      expect(normalized).not.toBeNull();
      expect(normalized!.filerName).toBe('Newstead Jennifer');
      expect(normalized!.filerRole).toBe('SVP, GC and Secretary');
      expect(normalized!.transactions.length).toBe(3);
      // Bug 1: price:0 must alias to pricePerShare
      expect(normalized!.transactions[0].pricePerShare).toBe(0);
      // Bug 2: action aliased to type
      expect(normalized!.transactions[0].type).toBe('Acquired');
      expect(normalized!.transactions[0].code).toBe('M');
    });

    it('should handle BAC pattern: string transactions (character-indexed in DB)', () => {
      // Exact shape that WOULD have been in AI response before string-spread bug
      const data = {
        company: 'BANK OF AMERICA CORP /DE/',
        summary: 'BAC Chair and CEO Brian T. Moynihan exercised 18,082 RSUs.',
        filerName: 'MOYNIHAN BRIAN T',
        filerRole: 'Chair and CEO',
        transactions: [
          'Acquired 18,082 Common Stock shares at $0.00 via derivative exercise (M, A)',
        ],
        signalStrength: 'Option Exercise',
        percentageChange: '0.00%',
      };

      const normalized = normalizeForm4Data(data);
      expect(normalized).not.toBeNull();
      expect(normalized!.transactions.length).toBe(1);
      expect(normalized!.transactions[0].code).toBe('M');
      expect(normalized!.transactions[0].shares).toBe('18,082');
    });

    it('should handle JNJ pattern: minimal JSON with only company/summary/filingType', () => {
      const data = {
        company: 'Johnson & Johnson',
        summary: 'JNJ Director acquired deferred share units.',
        filingType: '4',
        // No filerName, no transactions, no other fields
      };

      const normalized = normalizeForm4Data(data);
      expect(normalized).not.toBeNull();
      expect(normalized!.filerName).toBe('');
      expect(normalized!.transactions.length).toBe(0);
    });

    it('should handle character-indexed objects in DB (stale data)', () => {
      const data = {
        company: 'NVIDIA CORP',
        summary: 'NVDA Director sold shares.',
        filerName: 'Dabiri John',
        transactions: [
          { '0': 'S', '1': 'o', '2': 'l', '3': 'd', '4': ' ', '5': '3', '6': ',', '7': '0', '8': '0', '9': '4' },
        ],
      };

      const normalized = normalizeForm4Data(data);
      expect(normalized).not.toBeNull();
      // Character-indexed objects should be filtered out
      expect(normalized!.transactions.length).toBe(0);
    });
  });
});

describe('Cross-Form Normalizer Alignment', () => {
  describe('10-K/10-Q: financials vs financialHighlights', () => {
    it('should alias financials to financialHighlights for 10-K', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Annual report summary.',
        fiscalYear: '2025',
        financials: [
          { label: 'Revenue', value: '$100B', growth: '+15%' },
        ],
        financialHighlights: undefined,
      });

      const result = parseResponse(aiResponse, '10-K' as any);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      // Should be renamed from financials to financialHighlights
      expect(data.financialHighlights).toBeDefined();
      expect(Array.isArray(data.financialHighlights)).toBe(true);
      expect((data.financialHighlights as any[])[0].label).toBe('Revenue');
    });

    it('should preserve financialHighlights when AI uses the correct name', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Quarterly report.',
        fiscalQuarter: 'Q3 2025',
        financialHighlights: [
          { label: 'Revenue', value: '$25B', growth: '+10%' },
        ],
      });

      const result = parseResponse(aiResponse, '10-Q' as any);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.financialHighlights).toBeDefined();
      expect((data.financialHighlights as any[])[0].value).toBeDefined();
    });
  });

  describe('DEF 14A: exec comp total alias', () => {
    it('should alias total to totalCompensation', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Proxy statement summary.',
        meetingDate: '2026-05-15',
        executiveCompensation: [
          { name: 'John CEO', title: 'CEO', total: '$15,200,000' },
        ],
      });

      const result = parseResponse(aiResponse, 'DEF 14A' as any);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const execs = data.executiveCompensation as any[];
      expect(execs[0].totalCompensation).toBeDefined();
    });

    it('should compute totalCompensation from individual components', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Proxy statement.',
        meetingDate: '2026-05-15',
        executiveCompensation: [
          {
            name: 'John CEO',
            title: 'CEO',
            salary: '$1,500,000',
            bonus: '$2,000,000',
            stockAwards: '$10,000,000',
          },
        ],
      });

      const result = parseResponse(aiResponse, 'DEF 14A' as any);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const execs = data.executiveCompensation as any[];
      // Should have computed totalCompensation
      expect(execs[0].totalCompensation).toBeDefined();
    });
  });
});
