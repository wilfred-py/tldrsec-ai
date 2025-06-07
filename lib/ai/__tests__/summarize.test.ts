import { extractJSON, repairJSON } from '../parsers/json-extractors';

describe('JSON Extraction and Repair', () => {
  describe('repairJSON', () => {
    it('should fix trailing commas in objects', () => {
      const brokenJSON = '{"key": "value", }';
      const repaired = repairJSON(brokenJSON);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual({key: 'value'});
    });

    it('should fix trailing commas in arrays', () => {
      const brokenJSON = '[1, 2, 3, ]';
      const repaired = repairJSON(brokenJSON);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual([1, 2, 3]);
    });

    it('should fix single quotes used as string delimiters', () => {
      const brokenJSON = "{'key': 'value'}";
      const repaired = repairJSON(brokenJSON);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual({key: 'value'});
    });

    it('should fix unquoted property names', () => {
      const brokenJSON = '{key: "value"}';
      const repaired = repairJSON(brokenJSON);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual({key: 'value'});
    });

    it('should fix unquoted string values', () => {
      const brokenJSON = '{"key": value}';
      const repaired = repairJSON(brokenJSON);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual({key: 'value'});
    });

    it('should handle multiple repair issues simultaneously', () => {
      const brokenJSON = '{key: value, "another_key": "another value", }';
      const repaired = repairJSON(brokenJSON);
      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired)).toEqual({
        key: 'value',
        another_key: 'another value'
      });
    });
  });

  describe('extractJSON', () => {
    it('should extract JSON from markdown code blocks', () => {
      const response = '```json\n{"key": "value"}\n```';
      const result = extractJSON(response);
      expect(result.success).toBe(true);
      expect(result.parsed).toEqual({key: 'value'});
      expect(result.extractionMethod).toBe('code-block');
    });

    it('should extract JSON using bracket matching when no code blocks exist', () => {
      const response = 'Here is the data: {"key": "value"}';
      const result = extractJSON(response);
      expect(result.success).toBe(true);
      expect(result.parsed).toEqual({key: 'value'});
      expect(result.extractionMethod).toBe('bracketMatching');
    });

    it('should extract the largest JSON structure when multiple exist', () => {
      const response = '{"small": true} Here is more: {"key": "value", "nested": {"more": "data"}}';
      const result = extractJSON(response);
      expect(result.success).toBe(true);
      expect(result.parsed).toHaveProperty('nested');
      expect(result.extractionMethod).toBe('largestJSONStructure');
    });

    it('should attempt partial extraction for malformed JSON', () => {
      const response = '{"key": "value", "broken":}';
      const result = extractJSON(response);
      expect(result.success).toBe(true);
      expect(result.parsed).toHaveProperty('key');
      expect(result.extractionMethod).toBe('partialExtraction');
    });

    it('should handle Claude-style responses with explanations', () => {
      const response = 'I\'ll provide the summary in JSON format:\n\n```json\n{"key": "value"}\n```\n\nThis JSON contains the key information you requested.';
      const result = extractJSON(response);
      expect(result.success).toBe(true);
      expect(result.parsed).toEqual({key: 'value'});
      expect(result.extractionMethod).toBe('code-block');
    });

    it('should return failure for responses with no valid JSON', () => {
      const response = 'There is no JSON here, just text.';
      const result = extractJSON(response);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

// No additional tests needed
