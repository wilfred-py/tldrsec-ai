/**
 * Response Parser Tests
 *
 * Phase 3: Tests for simplified response parser using single-pass parsing.
 */

import { parseResponse } from './response-parser';

describe('Response Parser - Phase 3', () => {
  describe('parseResponse', () => {
    test('successfully parses valid JSON response for 10-K', () => {
      const jsonInput = JSON.stringify({
        company: 'Test Corp',
        summary: 'This is a complete test summary for the filing.',
        fiscalYear: '2024',
        keyHighlights: ['Revenue grew 15%', 'Expanded to 10 new markets']
      });

      const result = parseResponse(jsonInput, '10-K');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.company).toBe('Test Corp');
      expect(result.data?.summary).toBe('This is a complete test summary for the filing.');
      expect(result.partial).toBeUndefined();
      expect(result.errors).toBeUndefined();
    });

    test('parses JSON wrapped in markdown code blocks', () => {
      const jsonInput = '```json\n{"company":"Test Corp","summary":"A test summary.","eventType":"Earnings"}\n```';

      const result = parseResponse(jsonInput, '8-K');

      expect(result.success).toBe(true);
      expect(result.data?.company).toBe('Test Corp');
      expect(result.data?.eventType).toBe('Earnings');
    });

    test('handles parsing failure gracefully', () => {
      const invalidJson = 'This is not JSON at all';

      const result = parseResponse(invalidJson, '10-K');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    test('returns partial data when validation fails but data extracted', () => {
      // Missing required fiscalYear and keyHighlights for 10-K
      const partialJson = JSON.stringify({
        company: 'Test Corp',
        summary: 'A test summary.'
      });

      const result = parseResponse(partialJson, '10-K', { allowPartial: true });

      expect(result.success).toBe(true); // Partial data allowed
      expect(result.data?.company).toBe('Test Corp');
      expect(result.partial).toBe(true);
    });

    test('collects metrics when requested', () => {
      const jsonInput = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test summary.',
        eventType: 'Leadership Change'
      });

      const result = parseResponse(jsonInput, '8-K', { collectMetrics: true });

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.extractionSuccess).toBe(true);
      expect(result.metrics?.documentType).toBe('8-K');
      expect(typeof result.metrics?.extractionTimeMs).toBe('number');
    });

    test('normalizes date fields', () => {
      const jsonInput = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test summary for the fiscal year.',
        fiscalYear: '2024',
        keyHighlights: ['Key point 1'],
        filingDate: '2024-01-15'
      });

      const result = parseResponse(jsonInput, '10-K');

      expect(result.success).toBe(true);
      expect(result.data?.filingDate).toBe('2024-01-15');
    });

    test('generates fallback summary when missing', () => {
      const jsonInput = JSON.stringify({
        company: 'Test Corp',
        fiscalYear: '2024',
        keyHighlights: ['Key point 1']
        // No summary field
      });

      const result = parseResponse(jsonInput, '10-K', { allowPartial: true });

      // The post-processor should generate a fallback summary
      expect(result.data?.summary).toBeDefined();
    });

    test('handles Form 4 insider trading data', () => {
      const jsonInput = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider sold 10,000 shares.',
        filerName: 'John Doe',
        transactions: [
          { type: 'Sell', shares: '10,000', price: '$50.00', date: '2024-01-15' }
        ]
      });

      const result = parseResponse(jsonInput, '4');

      expect(result.success).toBe(true);
      expect(result.data?.filerName).toBe('John Doe');
      expect(result.data?.transactions).toHaveLength(1);
    });
  });
});
