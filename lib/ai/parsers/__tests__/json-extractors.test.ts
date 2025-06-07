import { extractJSON, repairJSON } from '../json-extractors';

describe('JSON Extractors', () => {
  describe('repairJSON', () => {
    it('should repair trailing commas in objects', () => {
      const broken = '{"key1": "value1", "key2": "value2",}';
      const fixed = repairJSON(broken);
      expect(() => JSON.parse(fixed)).not.toThrow();
      expect(JSON.parse(fixed)).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should repair trailing commas in arrays', () => {
      const broken = '["item1", "item2",]';
      const fixed = repairJSON(broken);
      expect(() => JSON.parse(fixed)).not.toThrow();
      expect(JSON.parse(fixed)).toEqual(['item1', 'item2']);
    });

    it('should repair missing quotes around property names', () => {
      const broken = '{key1: "value1", key2: "value2"}';
      const fixed = repairJSON(broken);
      expect(() => JSON.parse(fixed)).not.toThrow();
      expect(JSON.parse(fixed)).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should repair single quotes used instead of double quotes', () => {
      const broken = "{'key1': 'value1', 'key2': 'value2'}";
      const fixed = repairJSON(broken);
      expect(() => JSON.parse(fixed)).not.toThrow();
      expect(JSON.parse(fixed)).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should remove markdown code block markers', () => {
      const broken = '```json\n{"key": "value"}\n```';
      const fixed = repairJSON(broken);
      expect(() => JSON.parse(fixed)).not.toThrow();
      expect(JSON.parse(fixed)).toEqual({ key: 'value' });
    });
  });

  describe('extractJSON', () => {
    it('should extract JSON from code blocks', () => {
      const text = 'Here is the JSON summary:\n\n```json\n{"key": "value"}\n```\n\nEnd of summary.';
      const result = extractJSON(text);
      expect(result.success).toBe(true);
      expect(result.extractionMethod).toBe('codeBlock');
      expect(result.parsed).toEqual({ key: 'value' });
    });

    it('should extract JSON from structured responses', () => {
      const text = "Here's the JSON summary of the filing:\n\n{\"summary\": \"This is a test summary\", \"keyPoints\": [\"Point 1\", \"Point 2\"]}";
      const result = extractJSON(text);
      expect(result.success).toBe(true);
      expect(result.extractionMethod).toBe('structuredResponse');
      expect(result.parsed).toEqual({ summary: 'This is a test summary', keyPoints: ['Point 1', 'Point 2'] });
    });

    it('should extract JSON using bracket matching', () => {
      const text = 'Some text before {"key": "value"} and some text after';
      const result = extractJSON(text);
      expect(result.success).toBe(true);
      expect(result.extractionMethod).toBe('bracketMatching');
      expect(result.parsed).toEqual({ key: 'value' });
    });

    it('should extract the largest JSON structure', () => {
      const text = 'Small {"a":"b"} and larger {"key1": "value1", "key2": "value2"}';
      const result = extractJSON(text);
      expect(result.success).toBe(true);
      // The bracket matching method is finding this first
      expect(result.extractionMethod).toBe('bracketMatching');
      expect(result.parsed).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should attempt partial extraction when allowed', () => {
      const text = 'Summary: This is important\nRisk Factors: These are the risks\nFinancial Highlights: Revenue increased';
      const result = extractJSON(text, { allowPartial: true });
      expect(result.success).toBe(true);
      expect(result.extractionMethod).toBe('structuredExtraction');
      // Check that we have a summary property with the full text
      expect(result.parsed).toHaveProperty('summary');
      // The current implementation captures the full text as a summary
      expect(result.parsed.summary).toContain('Summary: This is important');
      expect(result.parsed.summary).toContain('Risk Factors: These are the risks');
    });

    it('should handle Claude-style responses with explanations', () => {
      const text = `I've analyzed the SEC filing and extracted the key information. Here's a structured summary:

\`\`\`json
{
  "summary": "Quarterly report showing strong growth",
  "keyPoints": [
    "Revenue increased by 15%",
    "New product launch successful"
  ],
  "riskFactors": [
    "Market competition intensifying",
    "Supply chain challenges"
  ]
}
\`\`\`

Let me know if you need any clarification on these points.`;

      const result = extractJSON(text);
      expect(result.success).toBe(true);
      expect(result.parsed).toEqual({
        summary: "Quarterly report showing strong growth",
        keyPoints: [
          "Revenue increased by 15%",
          "New product launch successful"
        ],
        riskFactors: [
          "Market competition intensifying",
          "Supply chain challenges"
        ]
      });
    });
  });
});
