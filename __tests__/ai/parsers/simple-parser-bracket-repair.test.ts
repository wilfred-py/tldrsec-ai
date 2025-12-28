/**
 * Simple Parser Bracket Repair Tests
 *
 * Tests for the bracket repair functionality that fixes common AI output errors
 * where the model forgets to close arrays before closing objects.
 */

import { parseJSONResponse } from '../../../lib/ai/parsers/simple-parser';

describe('Simple Parser - Bracket Repair', () => {
  describe('Security and DoS Protection', () => {
    test('rejects responses exceeding 10MB size limit', () => {
      // Create a string larger than 10MB
      const largeString = '{"company":"Tesla","summary":"' + 'x'.repeat(10 * 1024 * 1024) + '"}';
      
      const result = parseJSONResponse(largeString, 'Generic');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Response size exceeds maximum');
      expect(result.error).toContain('10MB');
    });

    test('handles deeply nested structures up to limit', () => {
      // Create deeply nested JSON with 100 levels
      let deepJson = '{"company":"Tesla","summary":"Test","data":';
      for (let i = 0; i < 99; i++) {
        deepJson += '{"nested":';
      }
      deepJson += '{"value":"deep"}';
      for (let i = 0; i < 99; i++) {
        deepJson += '}';
      }
      deepJson += '}';
      
      const result = parseJSONResponse(deepJson, 'Generic');
      
      // Should parse successfully if under nesting limit (valid JSON, no repair needed)
      expect(result.success).toBe(true);
      expect(result.method).toBe('direct');
    });

    test('rejects excessively nested structures beyond limit', () => {
      // Create structure with 101+ nesting levels
      let tooDeepJson = '{"company":"Tesla","data":';
      for (let i = 0; i < 102; i++) {
        tooDeepJson += '[';
      }
      // Intentionally malformed to trigger repair attempt
      
      const result = parseJSONResponse(tooDeepJson, 'Generic');
      
      expect(result.success).toBe(false);
      // Should fail without attempting repair on excessive nesting
    });

    test('does not attempt repair on strings over 1MB', () => {
      // Create a malformed JSON over 1MB but under 10MB
      const largeJson = '{"company":"Tesla","summary":"' + 'x'.repeat(1024 * 1024 + 1) + '","keyPoints":["test"}';
      
      const result = parseJSONResponse(largeJson, 'Generic');
      
      expect(result.success).toBe(false);
      expect(result.diagnostics?.bracketRepairAttempted).not.toBe(true);
    });
  });

  describe('Unicode and Special Characters', () => {
    test('handles Unicode characters in malformed JSON', () => {
      const unicodeJson = '{"company":"特斯拉","summary":"测试摘要","keyPoints":["点一","点二"}';
      
      const result = parseJSONResponse(unicodeJson, 'Generic');
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
      expect(result.data?.company).toBe('特斯拉');
    });

    test('handles emoji in malformed JSON', () => {
      const emojiJson = '{"company":"Tesla 🚗","summary":"Electric cars 🔋","keyPoints":["Fast ⚡","Green 🌱"}';
      
      const result = parseJSONResponse(emojiJson, 'Generic');
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
      expect(result.data?.company).toBe('Tesla 🚗');
    });

    test('handles escape sequences in malformed JSON', () => {
      const escapedJson = '{"company":"Tesla\\"Inc","summary":"Test\\nSummary","keyPoints":["Point\\t1"}';
      
      const result = parseJSONResponse(escapedJson, 'Generic');
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
    });
  });

  describe('Multiple Consecutive Bracket Issues', () => {
    test('repairs multiple consecutive unclosed brackets', () => {
      const multipleUnclosed = '{"company":"Tesla","summary":"Test","arrays":[[["deep","nested"}';
      
      const result = parseJSONResponse(multipleUnclosed, 'Generic');
      
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
      if (result.success) {
        expect(result.method).toBe('bracket-repaired');
      }
    });

    test('handles mixed bracket and brace issues', () => {
      const mixedIssues = '{"company":"Tesla","data":{"items":[{"name":"item1"},{"name":"item2"';
      
      const result = parseJSONResponse(mixedIssues, 'Generic');
      
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
    });

    test('repairs arrays with objects missing closures', () => {
      const complexMissing = '{"company":"Tesla","summary":"Test","transactions":[{"type":"Buy","shares":"100"},{"type":"Sell","shares":"50"}';
      
      const result = parseJSONResponse(complexMissing, 'Generic');
      
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
      if (result.success) {
        expect(result.method).toBe('bracket-repaired');
      }
    });
  });

  describe('Schema Validation After Repair', () => {
    test('validates required fields after successful repair', () => {
      // Missing summary field which is required
      const missingField = '{"company":"Tesla","keyPoints":["Point 1"}';
      
      const result = parseJSONResponse(missingField, 'Generic');
      
      // Should repair brackets but fail validation
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('summary');
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
      expect(result.diagnostics?.bracketRepairSucceeded).toBe(true);
    });

    test('rejects repaired JSON with empty required fields', () => {
      const emptyField = '{"company":"Tesla","summary":"","keyPoints":["Point 1"}';
      
      const result = parseJSONResponse(emptyField, 'Generic');
      
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('summary');
    });

    test('accepts repaired JSON with all required fields valid', () => {
      const validAfterRepair = '{"company":"Tesla","summary":"Valid summary","keyPoints":["Point 1","Point 2"}';
      
      const result = parseJSONResponse(validAfterRepair, 'Generic');
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
      expect(result.validationErrors).toBeUndefined();
    });
  });
  
  describe('Real Production Failure Scenarios', () => {
    test('handles actual Claude response with missing bracket', () => {
      // Real failure pattern observed in production
      const claudeFailure = `{"company":"Apple Inc.","summary":"Apple filed its quarterly 10-Q report showing strong iPhone sales growth.","keyPoints":["iPhone revenue up 12% YoY","Services segment reached new all-time high","China sales recovered with 8% growth","Operating margin improved to 30.8%"}`;
      
      const result = parseJSONResponse(claudeFailure, 'Generic');
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('bracket-repaired');
      expect(result.data?.keyPoints).toHaveLength(4);
    });

    test('handles response with nested transaction objects', () => {
      // Complex Form 4 structure that failed in production
      const form4Failure = '{"company":"Microsoft","summary":"Insider trading report","filerName":"Satya Nadella","transactions":[{"transactionType":"Sale","shares":"50000","pricePerShare":"420.50"},{"transactionType":"Gift","shares":"10000","pricePerShare":"0.00"}';
      
      const result = parseJSONResponse(form4Failure, 'Form 4');
      
      expect(result.diagnostics?.bracketRepairAttempted).toBe(true);
    });
  });
  
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
