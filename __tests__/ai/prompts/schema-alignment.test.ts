/**
 * Schema Alignment Tests
 *
 * Ensures that AI prompt schemas match template expectations exactly.
 * This is critical for generating correct structured data that templates can render.
 *
 * Phase 1: Schema Alignment Foundation
 */

import { FORM_SCHEMAS, generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('Schema Alignment', () => {
  describe('10-K Schema', () => {
    it('should have financialHighlights array with label/value/change objects', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.financialHighlights).toBeDefined();
      expect(schema.properties.financialHighlights.type).toBe('array');
      expect(schema.properties.financialHighlights.items).toBeDefined();

      const items = schema.properties.financialHighlights.items as {
        type: string;
        properties?: Record<string, unknown>;
      };
      expect(items.properties?.label).toBeDefined();
      expect(items.properties?.value).toBeDefined();
      expect(items.properties?.change).toBeDefined();
    });

    it('should have segments array with name/revenue/growth objects', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.segments).toBeDefined();
      expect(schema.properties.segments.type).toBe('array');

      const items = schema.properties.segments.items as {
        type: string;
        properties?: Record<string, unknown>;
      };
      expect(items.properties?.name).toBeDefined();
      expect(items.properties?.revenue).toBeDefined();
      expect(items.properties?.growth).toBeDefined();
    });

    it('should have riskFactors array (not risks)', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.riskFactors).toBeDefined();
      expect(schema.properties.risks).toBeUndefined();
    });

    it('should have keyPoints array for fallback', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.keyPoints).toBeDefined();
      expect(schema.properties.keyPoints.type).toBe('array');
    });
  });

  describe('10-Q Schema', () => {
    it('should have financialHighlights with qoqChange support', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.financialHighlights).toBeDefined();

      const items = schema.properties.financialHighlights.items as {
        type: string;
        properties?: Record<string, unknown>;
      };
      expect(items.properties?.qoqChange).toBeDefined();
    });

    it('should have quarterlyTrends array', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.quarterlyTrends).toBeDefined();
      expect(schema.properties.quarterlyTrends.type).toBe('array');
    });

    it('should have guidanceUpdates array', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.guidanceUpdates).toBeDefined();
      expect(schema.properties.guidanceUpdates.type).toBe('array');
    });

    it('should have riskFactors array for consistency with 10-K', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.riskFactors).toBeDefined();
      expect(schema.properties.riskFactors.type).toBe('array');
    });
  });

  describe('Form 4 Schema', () => {
    it('should use filerRole (not relationship) to match Form 144', () => {
      const schema = FORM_SCHEMAS['4'];
      expect(schema.properties.filerRole).toBeDefined();
    });

    it('should have transactions array with required fields', () => {
      const schema = FORM_SCHEMAS['4'];
      expect(schema.properties.transactions).toBeDefined();
      expect(schema.properties.transactions.type).toBe('array');
    });
  });

  describe('All Schemas', () => {
    const formTypes = ['10-K', '10-Q', '8-K', '4', '144', 'SC 13G', 'SC 13D', '424B2'];

    formTypes.forEach(formType => {
      it(`${formType} should have company field (required)`, () => {
        const schema = FORM_SCHEMAS[formType];
        expect(schema).toBeDefined();
        expect(schema.required).toContain('company');
      });

      it(`${formType} should have summary field (required)`, () => {
        const schema = FORM_SCHEMAS[formType];
        expect(schema).toBeDefined();
        expect(schema.required).toContain('summary');
      });
    });
  });

  describe('Schema Consistency', () => {
    it('Form 4 and Form 144 should both have filerRole field', () => {
      const form4Schema = FORM_SCHEMAS['4'];
      const form144Schema = FORM_SCHEMAS['144'];

      expect(form4Schema.properties.filerRole).toBeDefined();
      expect(form144Schema.properties.filerRole).toBeDefined();
    });

    it('10-K and 10-Q financialHighlights should have same base structure', () => {
      const schema10K = FORM_SCHEMAS['10-K'];
      const schema10Q = FORM_SCHEMAS['10-Q'];

      const items10K = schema10K.properties.financialHighlights.items as {
        properties?: Record<string, unknown>;
      };
      const items10Q = schema10Q.properties.financialHighlights.items as {
        properties?: Record<string, unknown>;
      };

      // Both should have label and value
      expect(items10K.properties?.label).toBeDefined();
      expect(items10K.properties?.value).toBeDefined();
      expect(items10Q.properties?.label).toBeDefined();
      expect(items10Q.properties?.value).toBeDefined();
    });
  });

  describe('Extraction Guidance', () => {
    it('10-K prompt should include gross margin as required metric', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'Test filing content'
      });

      expect(userPrompt).toContain('Gross Margin');
      expect(userPrompt).toContain('ALWAYS calculate and include');
      expect(userPrompt).toContain('Revenue - COGS');
    });

    it('10-Q prompt should include gross margin as mandatory metric', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'Test filing content'
      });

      expect(userPrompt).toContain('Gross Margin');
      expect(userPrompt).toContain('REQUIRED FINANCIAL METRICS');
    });

    it('10-Q prompt enumerates all six required metrics in canonical order', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'Test filing content'
      });

      // Anchor on the explicit metric block so we don't trip over other
      // mentions of "Revenue"/"Gross Margin" elsewhere in the prompt.
      const blockStart = userPrompt.indexOf('REQUIRED FINANCIAL METRICS (must include ALL SIX');
      expect(blockStart).toBeGreaterThan(-1);
      const block = userPrompt.slice(blockStart);

      const order = ['Revenue', 'Gross Margin', 'Operating Margin', 'FCF Margin', 'Net Income', 'EPS'];
      let lastIdx = -1;
      for (const metric of order) {
        const idx = block.indexOf(metric);
        expect(idx).toBeGreaterThan(lastIdx);
        lastIdx = idx;
      }
    });

    it('10-Q prompt mandates two-decimal-place value formatting', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'Test filing content'
      });

      expect(userPrompt.toLowerCase()).toContain('two decimal places');
    });

    it('10-K prompt should list Revenue, Net Income, Gross Margin, EPS as required', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'Test filing content'
      });

      expect(userPrompt).toContain('Revenue');
      expect(userPrompt).toContain('Net Income');
      expect(userPrompt).toContain('Gross Margin');
      expect(userPrompt).toContain('EPS');
      expect(userPrompt).toContain('REQUIRED FINANCIAL METRICS');
    });

    it('10-Q prompt should include YoY and QoQ change guidance', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'Test filing content'
      });

      expect(userPrompt).toContain('YoY AND QoQ');
    });
  });
});
