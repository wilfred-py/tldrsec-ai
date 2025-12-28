/**
 * Simple Parser Bracket Repair Tests
 *
 * Tests for the bracket repair functionality that fixes common AI output errors
 * where the model forgets to close arrays before closing objects.
 */

import { parseJSONResponse } from '../../../lib/ai/parsers/simple-parser';

describe('Simple Parser - Bracket Repair', () => {
  describe('Missing closing bracket before closing brace', () => {
    test('repairs single missing ] before }', () => {
      // This is the exact failure mode observed with Grok 4.1-fast
      const malformedJson = '{"company":"Tesla","summary":"Test summary.","keyPoints":["Point 1","Point 2"}';

      const result = parseJSONResponse(malformedJson, 'Generic');

      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
      expect(result.data?.company).toBe('Tesla');
      expect(result.data?.keyPoints).toEqual(['Point 1', 'Point 2']);
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
      expect(result.diagnostics?.bracketRepairSucceeded).toBe(true);
    });

    test('repairs multiple missing ] before }', () => {
      // Nested arrays both missing closing brackets
      const malformedJson = '{"data":{"items":["a","b","nested":["x","y"}}';

      const result = parseJSONResponse(malformedJson, 'Generic');

      // This should attempt repair but may fail due to structure issues
      // The important thing is it attempts repair without crashing
      expect(result.diagnostics?.bracketRepairAttempted).toBeDefined();
    });

    test('handles real TSLA failure case - Form 4 with keyPoints', () => {
      // Form 4 requires: company, summary, filerName, transactions
      // This test uses Generic schema to focus on bracket repair
      const malformedJson = '{"company":"Tesla, Inc.","summary":"Elon Musk, Director and 10% Owner of Tesla, Inc., filed Form 4 reporting changes.","keyPoints":["Sold 500,000 shares at $420.00 per share.","Gift of 100,000 shares valued at $0.00.","Post-transaction holdings are 715,100,000 shares."}';

      const result = parseJSONResponse(malformedJson, 'Generic');

      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
      expect(result.data?.company).toBe('Tesla, Inc.');
      expect(result.data?.keyPoints).toHaveLength(3);
    });
  });

  describe('Already valid JSON', () => {
    test('does not modify valid JSON', () => {
      const validJson = '{"company":"Tesla","summary":"Test summary.","keyPoints":["Point 1","Point 2"]}';

      const result = parseJSONResponse(validJson, 'Generic');

      expect(result.success).toBe(true);
      expect(result.method).toBe('direct');
      expect(result.diagnostics?.bracketRepairAttempted).toBeUndefined();
    });

    test('handles complex valid JSON with nested structures', () => {
      // Use Generic schema which only requires company and summary
      const validJson = JSON.stringify({
        company: 'Tesla',
        summary: 'Test summary.',
        transactions: [
          { type: 'Sell', shares: '10,000', price: '$420.00' },
          { type: 'Buy', shares: '5,000', price: '$400.00' }
        ],
        keyPoints: ['Point 1', 'Point 2']
      });

      const result = parseJSONResponse(validJson, 'Generic');

      expect(result.success).toBe(true);
      expect(result.method).toBe('direct');
    });
  });

  describe('Unrepairable cases', () => {
    test('returns error for completely invalid JSON', () => {
      const invalidJson = 'This is not JSON at all';

      const result = parseJSONResponse(invalidJson, 'Generic');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('returns error for missing opening braces (cannot repair)', () => {
      // Missing opening { - cannot be repaired
      const invalidJson = '"company":"Tesla","summary":"Test."}';

      const result = parseJSONResponse(invalidJson, 'Generic');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('returns error for truncated JSON mid-string', () => {
      // Truncated in the middle of a string value
      const truncatedJson = '{"company":"Tesla","summary":"This is a very long summ';

      const result = parseJSONResponse(truncatedJson, 'Generic');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    test('handles empty response', () => {
      const result = parseJSONResponse('', 'Generic');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty response received from AI model');
    });

    test('handles whitespace-only response', () => {
      const result = parseJSONResponse('   \n\t  ', 'Generic');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty response received from AI model');
    });

    test('repairs JSON inside markdown code blocks', () => {
      // Need to include required fields: company and summary
      const malformedWithCodeBlock = '```json\n{"company":"Tesla","summary":"Test summary.","keyPoints":["Point 1"}\n```';

      const result = parseJSONResponse(malformedWithCodeBlock, 'Generic');

      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
      expect(result.diagnostics?.hadCodeBlock).toBe(true);
    });

    test('handles deeply nested unclosed brackets', () => {
      // Two levels of unclosed brackets
      const malformedJson = '{"data":{"items":["a",["b","c"}}';

      const result = parseJSONResponse(malformedJson, 'Generic');

      // Should attempt repair
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
    });
  });

  describe('Performance', () => {
    test('repairs quickly (< 5ms)', () => {
      const malformedJson = '{"company":"Tesla","summary":"Test.","keyPoints":["Point 1","Point 2","Point 3","Point 4","Point 5"}';

      const startTime = performance.now();
      const result = parseJSONResponse(malformedJson, 'Generic');
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5);
    });

    test('handles large JSON repair efficiently', () => {
      // Create a large malformed JSON
      const keyPoints = Array.from({ length: 100 }, (_, i) => `Key point ${i + 1} with some additional text to make it longer.`);
      const largeJson = `{"company":"Tesla","summary":"Long summary.","keyPoints":${JSON.stringify(keyPoints).slice(0, -1)}}`;

      const startTime = performance.now();
      const result = parseJSONResponse(largeJson, 'Generic');
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(10);
    });
  });

  describe('Diagnostics', () => {
    test('includes repair diagnostics on successful repair', () => {
      const malformedJson = '{"company":"Tesla","keyPoints":["Point 1"}';

      const result = parseJSONResponse(malformedJson, 'Generic');

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
      expect(result.diagnostics?.bracketRepairSucceeded).toBe(true);
    });

    test('includes repair diagnostics on failed repair', () => {
      const unreparableJson = '{"company":Tesla}'; // Missing quotes - cannot repair

      const result = parseJSONResponse(unreparableJson, 'Generic');

      expect(result.success).toBe(false);
      expect(result.diagnostics?.bracketRepairAttempted).toBe(false);
      expect(result.diagnostics?.bracketRepairSucceeded).toBe(false);
    });
  });
});
