/**
 * Simple JSON Parser Tests
 *
 * These tests validate the single-pass JSON parser that replaces
 * the complex 5-strategy extraction pipeline.
 *
 * Design philosophy: If the prompt is correct, the response is correct.
 * We don't repair broken JSON - we report it for prompt improvement.
 */

import { parseJSONResponse, ParseResult, ParseDiagnostics } from '@/lib/ai/parsers/simple-parser';
import { FORM_SCHEMAS } from '@/lib/ai/prompts/unified-prompts';

describe('Simple JSON Parser', () => {
  describe('parseJSONResponse', () => {
    it('should parse clean JSON on first attempt', () => {
      const response = '{"company":"Tesla","summary":"Q4 revenue grew 20%.","fiscalQuarter":"Q4 2024","keyHighlights":["Revenue up 20%"]}';

      const result = parseJSONResponse(response, '10-Q');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        company: 'Tesla',
        summary: 'Q4 revenue grew 20%.',
        fiscalQuarter: 'Q4 2024',
        keyHighlights: ['Revenue up 20%']
      });
      expect(result.method).toBe('direct');
      expect(result.attempts).toBe(1);
    });

    it('should extract JSON from markdown code block if present', () => {
      const response = '```json\n{"company":"Apple","summary":"Strong quarter.","fiscalYear":"2024","keyHighlights":["Growth"]}\n```';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(true);
      expect(result.data?.company).toBe('Apple');
      expect(result.method).toBe('codeblock-stripped');
    });

    it('should handle code block without json language specifier', () => {
      const response = '```\n{"company":"Microsoft","summary":"Cloud growth accelerated.","fiscalYear":"2024","keyHighlights":["Azure revenue up 30%"]}\n```';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(true);
      expect(result.data?.company).toBe('Microsoft');
      expect(result.method).toBe('codeblock-stripped');
    });

    it('should return failure with diagnostics for invalid JSON', () => {
      const response = '{"company":"Tesla", broken json here';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/Unexpected|Expected|Unterminated/i);
      expect(result.rawResponse).toBe(response);
    });

    it('should not attempt repairs - fail fast', () => {
      const response = '{"company": "Tesla", trailing comma,}';

      const result = parseJSONResponse(response, '10-K');

      // We want it to fail, not repair
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('should validate against schema and report missing fields', () => {
      // Missing required 'summary' field
      const response = '{"company":"Tesla","fiscalYear":"2024","keyHighlights":["Revenue up"]}';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('summary');
    });

    it('should validate required fields for 10-Q form', () => {
      // Missing required 'fiscalQuarter' and 'keyHighlights' for 10-Q
      const response = '{"company":"Tesla","summary":"Strong quarter."}';

      const result = parseJSONResponse(response, '10-Q');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toEqual(
        expect.arrayContaining(['fiscalQuarter', 'keyHighlights'])
      );
    });

    it('should validate required fields for 8-K form', () => {
      // Missing required 'eventType' for 8-K
      const response = '{"company":"Tesla","summary":"New executive appointed."}';

      const result = parseJSONResponse(response, '8-K');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('eventType');
    });

    it('should validate required fields for Form 4', () => {
      // Missing required 'filerName' and 'transactions' for Form 4
      const response = '{"company":"Tesla","summary":"Insider trading report."}';

      const result = parseJSONResponse(response, '4');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toEqual(
        expect.arrayContaining(['filerName', 'transactions'])
      );
    });

    it('should pass validation when all required fields are present', () => {
      const response = JSON.stringify({
        company: 'Tesla',
        summary: 'Strong Q4 with record deliveries.',
        eventType: 'Earnings Results',
        keyHighlights: ['Record 1.8M vehicle deliveries', 'Revenue of $25.2B'],
        sentiment: 'positive'
      });

      const result = parseJSONResponse(response, '8-K');

      expect(result.success).toBe(true);
      expect(result.validationErrors).toBeUndefined();
    });

    it('should handle empty string response', () => {
      const response = '';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle whitespace-only response', () => {
      const response = '   \n\t   ';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle null/undefined in required fields', () => {
      const response = '{"company":"Tesla","summary":null,"fiscalYear":"2024","keyHighlights":[]}';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('summary');
    });

    it('should handle empty string in required fields', () => {
      const response = '{"company":"","summary":"Good quarter.","fiscalYear":"2024","keyHighlights":["Revenue"]}';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('company');
    });

    it('should handle empty arrays in required array fields', () => {
      const response = '{"company":"Tesla","summary":"Good quarter.","fiscalYear":"2024","keyHighlights":[]}';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('keyHighlights');
    });

    it('should fall back to Generic schema for unknown form types', () => {
      const response = '{"company":"TestCo","summary":"Some filing info."}';

      const result = parseJSONResponse(response, 'UNKNOWN-FORM');

      expect(result.success).toBe(true);
      expect(result.data?.company).toBe('TestCo');
    });

    it('should include raw response in result for debugging', () => {
      const response = '{"company":"Tesla","summary":"Test."}';

      const result = parseJSONResponse(response, 'Generic');

      expect(result.rawResponse).toBe(response);
    });

    it('should track parse time in milliseconds', () => {
      const response = '{"company":"Tesla","summary":"Test."}';

      const result = parseJSONResponse(response, 'Generic');

      expect(typeof result.parseTimeMs).toBe('number');
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.parseTimeMs).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Edge cases', () => {
    it('should handle JSON with extra whitespace', () => {
      const response = '  \n  {"company":"Tesla","summary":"Test.","fiscalYear":"2024","keyHighlights":["Point 1"]}  \n  ';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(true);
      expect(result.data?.company).toBe('Tesla');
    });

    it('should handle JSON with Unicode characters', () => {
      const response = '{"company":"日本企業","summary":"こんにちは。","fiscalYear":"2024","keyHighlights":["ポイント"]}';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(true);
      expect(result.data?.company).toBe('日本企業');
    });

    it('should handle JSON with nested objects', () => {
      const response = JSON.stringify({
        company: 'Tesla',
        summary: 'Insider trading.',
        filerName: 'Elon Musk',
        transactions: [
          { type: 'Buy', shares: '10,000', price: '$200.00', date: '2024-01-15' }
        ]
      });

      const result = parseJSONResponse(response, '4');

      expect(result.success).toBe(true);
      expect(result.data?.transactions).toHaveLength(1);
    });

    it('should handle JSON with special characters in strings', () => {
      const response = '{"company":"Tesla \\"Motors\\"","summary":"Revenue: $1B. Growth: 20%.","fiscalYear":"2024","keyHighlights":["Revenue"]}';

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(true);
      expect(result.data?.company).toBe('Tesla "Motors"');
    });

    it('should handle very large JSON responses', () => {
      const largeHighlights = Array(100).fill('This is a key highlight point with some details.');
      const response = JSON.stringify({
        company: 'Tesla',
        summary: 'Annual report summary.',
        fiscalYear: '2024',
        keyHighlights: largeHighlights
      });

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(true);
      expect(result.data?.keyHighlights).toHaveLength(100);
    });

    it('should handle AI response with explanation before JSON', () => {
      // This should fail - we want clean JSON only
      const response = 'Here is the JSON response:\n{"company":"Tesla","summary":"Test."}';

      const result = parseJSONResponse(response, 'Generic');

      expect(result.success).toBe(false);
    });

    it('should handle AI response with explanation after JSON', () => {
      // This should fail - we want clean JSON only
      const response = '{"company":"Tesla","summary":"Test."}\nI hope this helps!';

      const result = parseJSONResponse(response, 'Generic');

      expect(result.success).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should parse in under 5ms on average', () => {
      const response = '{"company":"Tesla","summary":"Strong performance.","fiscalYear":"2024","keyHighlights":["Revenue up"]}';

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        parseJSONResponse(response, '10-K');
      }
      const avgTime = (performance.now() - start) / 100;

      expect(avgTime).toBeLessThan(5);
    });

    it('should handle large responses efficiently', () => {
      const largeContent = 'x'.repeat(100000);
      const response = `{"company":"Tesla","summary":"${largeContent}","fiscalYear":"2024","keyHighlights":["Revenue"]}`;

      const start = performance.now();
      const result = parseJSONResponse(response, '10-K');
      const elapsed = performance.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(50); // Even large JSON should be fast
    });
  });

  describe('Schema integration', () => {
    it('should use FORM_SCHEMAS from unified-prompts', () => {
      // Verify that all form types in FORM_SCHEMAS work with the parser
      const formTypes = Object.keys(FORM_SCHEMAS);

      formTypes.forEach(formType => {
        const schema = FORM_SCHEMAS[formType];
        const requiredFields: Record<string, unknown> = {};

        // Build a minimal valid response for this form type
        schema.required.forEach(field => {
          const prop = schema.properties[field];
          if (prop.type === 'array') {
            requiredFields[field] = ['test item'];
          } else if (prop.type === 'object') {
            requiredFields[field] = {};
          } else {
            requiredFields[field] = 'test value';
          }
        });

        const response = JSON.stringify(requiredFields);
        const result = parseJSONResponse(response, formType);

        expect(result.success).toBe(true);
      });
    });
  });

  describe('Diagnostics', () => {
    it('should include diagnostics for parse errors', () => {
      const response = '{"company":"Tesla", broken json here';
      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.responseLength).toBe(response.length);
      expect(result.diagnostics?.formType).toBe('10-K');
      expect(result.diagnostics?.usedKnownSchema).toBe(true);
      expect(result.diagnostics?.startsWithBrace).toBe(true);
    });

    it('should include diagnostics for validation errors', () => {
      const response = '{"company":"Tesla"}'; // Missing required fields for 10-K
      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.responsePreview).toContain('Tesla');
    });

    it('should include diagnostics for empty response', () => {
      const result = parseJSONResponse('', '10-K');

      expect(result.success).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.responseLength).toBe(0);
    });

    it('should detect when code block was stripped (with validation failure)', () => {
      // Use 10-K so it fails validation (missing fiscalYear, keyHighlights)
      const response = '```json\n{"company":"Tesla","summary":"Test."}\n```';
      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.hadCodeBlock).toBe(true);
      expect(result.method).toBe('codeblock-stripped');
    });

    it('should mark usedKnownSchema for known form types', () => {
      // Use a known form type that will fail validation
      const response = '{"company":"Test"}'; // Missing required fields for 10-K
      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.usedKnownSchema).toBe(true);
      expect(result.diagnostics?.formType).toBe('10-K');
    });

    it('should include response preview for debugging', () => {
      const longResponse = '{"company":"' + 'A'.repeat(200) + '"}';
      const result = parseJSONResponse(longResponse, '10-K');

      expect(result.success).toBe(false);
      expect(result.diagnostics?.responsePreview).toBeDefined();
      expect(result.diagnostics!.responsePreview.length).toBeLessThanOrEqual(103); // 100 chars + "..."
      expect(result.diagnostics!.responsePreview).toMatch(/\.\.\.$/); // Ends with ellipsis
    });

    it('should not include diagnostics for successful parses', () => {
      const response = '{"company":"Tesla","summary":"Test."}';
      const result = parseJSONResponse(response, 'Generic');

      expect(result.success).toBe(true);
      expect(result.diagnostics).toBeUndefined();
    });

    it('should record method as codeblock-stripped for successful code block parses', () => {
      const response = '```json\n{"company":"Tesla","summary":"Test."}\n```';
      const result = parseJSONResponse(response, 'Generic');

      // This should succeed (Generic only requires company and summary)
      expect(result.success).toBe(true);
      expect(result.method).toBe('codeblock-stripped');
    });
  });
});
