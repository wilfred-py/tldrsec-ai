/**
 * Tests for Extractor Integration at Generation Time
 *
 * Phase 3: Integrates extractors into the AI summary generation pipeline.
 * Extractors validate AI output and fill gaps before database storage.
 */

import { getExtractor, EXTRACTOR_REGISTRY } from '@/lib/email/extractor-registry';
import { mergeWithFallback, logDataDiscrepancies, type MergeResult } from '@/lib/email/extractor-merge-utils';
import { supportsExtractorValidation } from '@/lib/ai/summarize-with-validation';

describe('Extractor Registry', () => {
  describe('getExtractor', () => {
    it('should return 10-K extractor for 10-K form type', () => {
      const extractor = getExtractor('10-K');
      expect(extractor).toBeDefined();
      expect(typeof extractor).toBe('function');
    });

    it('should return 10-Q extractor for 10-Q form type', () => {
      const extractor = getExtractor('10-Q');
      expect(extractor).toBeDefined();
      expect(typeof extractor).toBe('function');
    });

    it('should return 8-K extractor for 8-K form type', () => {
      const extractor = getExtractor('8-K');
      expect(extractor).toBeDefined();
      expect(typeof extractor).toBe('function');
    });

    it('should return Form 4 extractor for "4" form type', () => {
      const extractor = getExtractor('4');
      expect(extractor).toBeDefined();
      expect(typeof extractor).toBe('function');
    });

    it('should return Form 4 extractor for "Form 4" form type', () => {
      const extractor = getExtractor('Form 4');
      expect(extractor).toBeDefined();
      expect(typeof extractor).toBe('function');
    });

    it('should return Form 144 extractor for "144" form type', () => {
      const extractor = getExtractor('144');
      expect(extractor).toBeDefined();
      expect(typeof extractor).toBe('function');
    });

    it('should return Form 144 extractor for "Form 144" form type', () => {
      const extractor = getExtractor('Form 144');
      expect(extractor).toBeDefined();
      expect(typeof extractor).toBe('function');
    });

    it('should return null for unsupported form type', () => {
      const extractor = getExtractor('UNKNOWN-FORM');
      expect(extractor).toBeNull();
    });

    it('should return null for empty form type', () => {
      const extractor = getExtractor('');
      expect(extractor).toBeNull();
    });
  });

  describe('EXTRACTOR_REGISTRY', () => {
    it('should include all 5 supported extractors', () => {
      // Core form types
      expect(EXTRACTOR_REGISTRY['10-K']).toBeDefined();
      expect(EXTRACTOR_REGISTRY['10-Q']).toBeDefined();
      expect(EXTRACTOR_REGISTRY['8-K']).toBeDefined();
      expect(EXTRACTOR_REGISTRY['4']).toBeDefined();
      expect(EXTRACTOR_REGISTRY['144']).toBeDefined();
    });

    it('should have aliases for Form 4 and Form 144', () => {
      expect(EXTRACTOR_REGISTRY['Form 4']).toBeDefined();
      expect(EXTRACTOR_REGISTRY['Form 144']).toBeDefined();
    });
  });
});

describe('mergeWithFallback', () => {
  it('should prefer AI-generated data over extracted data', () => {
    const aiData = {
      company: 'NVIDIA Corp',
      summary: 'AI-generated summary',
      financialHighlights: [{ label: 'Revenue', value: '$130B', change: '+114%' }],
    };
    const extractedData = {
      financialHighlights: [{ label: 'Revenue', value: '$130.5B', change: '+114%' }],
      segments: [{ name: 'Data Center', revenue: '$90B' }],
    };

    const result = mergeWithFallback(aiData, extractedData);

    // AI data should take precedence
    expect(result.data.company).toBe('NVIDIA Corp');
    expect(result.data.summary).toBe('AI-generated summary');
    // AI-provided financialHighlights should be used
    expect(result.data.financialHighlights).toEqual(aiData.financialHighlights);
  });

  it('should fill gaps with extracted data when AI data is sparse', () => {
    const aiData = {
      company: 'Tesla Inc',
      summary: 'Quarterly report summary',
      // Missing segments and riskFactors
    };
    const extractedData = {
      financialHighlights: [{ label: 'Revenue', value: '$28B' }],
      segments: [{ name: 'Automotive', revenue: '$25B' }],
      riskFactors: ['Supply chain disruptions'],
    };

    const result = mergeWithFallback(aiData, extractedData);

    // Should keep AI data
    expect(result.data.company).toBe('Tesla Inc');
    // Should add extracted data that was missing
    expect(result.data.financialHighlights).toEqual(extractedData.financialHighlights);
    expect(result.data.segments).toEqual(extractedData.segments);
    expect(result.data.riskFactors).toEqual(extractedData.riskFactors);
  });

  it('should not overwrite non-empty AI arrays with extracted arrays', () => {
    const aiData = {
      company: 'Apple Inc',
      summary: 'Test summary',
      riskFactors: ['AI-identified risk 1', 'AI-identified risk 2'],
    };
    const extractedData = {
      riskFactors: ['Extracted risk 1'],
    };

    const result = mergeWithFallback(aiData, extractedData);

    // AI arrays should not be overwritten
    expect(result.data.riskFactors).toEqual(aiData.riskFactors);
  });

  it('should fill empty AI arrays with extracted arrays', () => {
    const aiData = {
      company: 'Meta Platforms',
      summary: 'Test summary',
      riskFactors: [], // Empty array
    };
    const extractedData = {
      riskFactors: ['Extracted risk 1', 'Extracted risk 2'],
    };

    const result = mergeWithFallback(aiData, extractedData);

    // Empty AI array should be filled with extracted data
    expect(result.data.riskFactors).toEqual(extractedData.riskFactors);
  });

  it('should handle null/undefined AI data gracefully', () => {
    const extractedData = {
      financialHighlights: [{ label: 'Revenue', value: '$50B' }],
    };

    const result1 = mergeWithFallback(null as unknown as Record<string, unknown>, extractedData);
    const result2 = mergeWithFallback(undefined as unknown as Record<string, unknown>, extractedData);

    expect(result1.data).toEqual(extractedData);
    expect(result2.data).toEqual(extractedData);
  });

  it('should track which fields were filled by extractor', () => {
    const aiData = {
      company: 'Microsoft',
      summary: 'Summary text',
    };
    const extractedData = {
      financialHighlights: [{ label: 'Revenue', value: '$200B' }],
      segments: [{ name: 'Cloud', revenue: '$100B' }],
    };

    const result = mergeWithFallback(aiData, extractedData);

    expect(result.fieldsFilledByExtractor).toContain('financialHighlights');
    expect(result.fieldsFilledByExtractor).toContain('segments');
    expect(result.fieldsFilledByExtractor).not.toContain('company');
    expect(result.fieldsFilledByExtractor).not.toContain('summary');
  });
});

describe('logDataDiscrepancies', () => {
  it('should not throw when called with valid data', () => {
    const aiData = {
      company: 'Test Corp',
      financialHighlights: [{ label: 'Revenue', value: '$100B' }],
    };
    const extractedData = {
      financialHighlights: [{ label: 'Revenue', value: '$100.5B' }],
    };

    expect(() => {
      logDataDiscrepancies('10-K', aiData, extractedData);
    }).not.toThrow();
  });

  it('should handle empty data without errors', () => {
    expect(() => {
      logDataDiscrepancies('10-K', {}, {});
    }).not.toThrow();
  });

  it('should handle null/undefined data gracefully', () => {
    expect(() => {
      logDataDiscrepancies('10-K', null as unknown as Record<string, unknown>, {});
    }).not.toThrow();

    expect(() => {
      logDataDiscrepancies('10-K', {}, null as unknown as Record<string, unknown>);
    }).not.toThrow();
  });
});

describe('Extractor Integration', () => {
  describe('10-K Extractor via Registry', () => {
    it('should extract financialHighlights from summary text', () => {
      const extractor = getExtractor('10-K');
      expect(extractor).not.toBeNull();

      const summaryText = `
        **Revenue**: $130.5B (+114% YoY)
        **Net Income**: $72.9B (+181% YoY)
        **Gross Margin**: 75.0%
      `;

      const result = extractor!(summaryText);
      const highlights = (result as { financialHighlights?: Array<{ label: string; value: string; change?: string }> }).financialHighlights;

      expect(highlights).toBeDefined();
      expect(highlights!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('10-Q Extractor via Registry', () => {
    it('should extract quarterly financial data', () => {
      const extractor = getExtractor('10-Q');
      expect(extractor).not.toBeNull();

      const summaryText = `
        **Revenue**: $28.1B (+12% YoY)
        **Gross Margin**: 18% (flat QoQ)

        Guidance: Management expects continued growth in Q2.
      `;

      const result = extractor!(summaryText);
      const highlights = (result as { financialHighlights?: Array<{ label: string; value: string }> }).financialHighlights;

      expect(highlights).toBeDefined();
      expect(highlights!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('8-K Extractor via Registry', () => {
    it('should extract event data from summary text', () => {
      const extractor = getExtractor('8-K');
      expect(extractor).not.toBeNull();

      const summaryText = `
        Item 2.02 - Results of Operations and Financial Condition

        Company announces quarterly earnings exceeding expectations.
        - Revenue beat estimates by 5%
        - Earnings per share of $2.50
      `;

      const result = extractor!(summaryText);

      expect(result).toBeDefined();
      const typedResult = result as { itemNumbers?: string[]; eventType?: string };
      expect(typedResult.itemNumbers || typedResult.eventType).toBeDefined();
    });
  });

  describe('Form 4 Extractor via Registry', () => {
    it('should extract transaction data from summary text', () => {
      const extractor = getExtractor('4');
      expect(extractor).not.toBeNull();

      const summaryText = `
        **Insider Transaction Summary**

        Filer: John Smith (CEO)
        Transaction: Sale of 10,000 shares at $150.00
        Total Value: $1,500,000
      `;

      const result = extractor!(summaryText);

      expect(result).toBeDefined();
    });
  });

  describe('Form 144 Extractor via Registry', () => {
    it('should extract filing data from summary text', () => {
      const extractor = getExtractor('144');
      expect(extractor).not.toBeNull();

      const summaryText = `
        **Form 144 Notice of Proposed Sale**

        Filer: Jane Doe (Director)
        Shares to be sold: 50,000
        Approximate sale date: 2026-02-01
      `;

      const result = extractor!(summaryText);

      expect(result).toBeDefined();
    });
  });
});

describe('supportsExtractorValidation', () => {
  it('should return true for supported form types', () => {
    expect(supportsExtractorValidation('10-K')).toBe(true);
    expect(supportsExtractorValidation('10-Q')).toBe(true);
    expect(supportsExtractorValidation('8-K')).toBe(true);
    expect(supportsExtractorValidation('4')).toBe(true);
    expect(supportsExtractorValidation('Form 4')).toBe(true);
    expect(supportsExtractorValidation('144')).toBe(true);
    expect(supportsExtractorValidation('Form 144')).toBe(true);
  });

  it('should return false for unsupported form types', () => {
    expect(supportsExtractorValidation('SC 13G')).toBe(false);
    expect(supportsExtractorValidation('SC 13D')).toBe(false);
    expect(supportsExtractorValidation('424B2')).toBe(false);
    expect(supportsExtractorValidation('DEF 14A')).toBe(false);
    expect(supportsExtractorValidation('S-1')).toBe(false);
    expect(supportsExtractorValidation('UNKNOWN')).toBe(false);
  });
});
