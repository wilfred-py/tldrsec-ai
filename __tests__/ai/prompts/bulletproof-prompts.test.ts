/**
 * Bulletproof Prompt Tests
 *
 * These tests validate that the unified prompt system generates
 * prompts that guarantee clean JSON output from AI models.
 */

import { generateFilingPrompt, FilingPromptConfig, FORM_SCHEMAS } from '@/lib/ai/prompts/unified-prompts';

describe('Unified Filing Prompts', () => {
  describe('generateFilingPrompt', () => {
    it('should generate prompt that produces parseable JSON for 10-K', () => {
      const config: FilingPromptConfig = {
        formType: '10-K',
        company: 'Tesla, Inc.',
        ticker: 'TSLA',
        filingDate: '2024-02-07'
      };

      const { systemPrompt, userPrompt } = generateFilingPrompt(config);

      // Prompt must start with JSON requirements
      expect(systemPrompt).toMatch(/^CRITICAL: You must respond with ONLY valid JSON/);

      // Prompt must include schema before content
      expect(userPrompt.indexOf('JSON Schema:')).toBeLessThan(userPrompt.indexOf('Filing Content:'));

      // Prompt must forbid markdown
      expect(systemPrompt).toContain('Do not wrap in markdown code blocks');
    });

    it('should include exact field names with no synonyms', () => {
      const { userPrompt } = generateFilingPrompt({ formType: '10-K' });

      // Must use 'company' not 'issuer', 'companyName', etc.
      expect(userPrompt).toContain('"company"');
      expect(userPrompt).not.toContain('"companyName"');
      expect(userPrompt).not.toContain('"issuerName"');
    });

    it('should specify length constraints for all text fields', () => {
      const { userPrompt } = generateFilingPrompt({ formType: '10-K' });

      expect(userPrompt).toMatch(/summary.*max.*\d+/i);
      expect(userPrompt).toMatch(/keyHighlights.*max.*\d+/i);
    });

    it('should produce identical prompt for same inputs (deterministic)', () => {
      const config: FilingPromptConfig = { formType: '8-K' };
      const prompt1 = generateFilingPrompt(config);
      const prompt2 = generateFilingPrompt(config);

      expect(prompt1).toEqual(prompt2);
    });

    it('should include filing content when provided', () => {
      const config: FilingPromptConfig = {
        formType: '10-K',
        filingContent: 'This is the SEC filing content...'
      };

      const { userPrompt } = generateFilingPrompt(config);

      expect(userPrompt).toContain('Filing Content:');
      expect(userPrompt).toContain('This is the SEC filing content...');
    });

    it('should work without filing content', () => {
      const config: FilingPromptConfig = { formType: '10-K' };

      const { userPrompt } = generateFilingPrompt(config);

      // Should still have schema but no filing content section
      expect(userPrompt).toContain('JSON Schema');
      expect(userPrompt).not.toContain('Filing Content:');
    });

    it('should forbid common AI response patterns', () => {
      const { systemPrompt } = generateFilingPrompt({ formType: '10-K' });

      // Should forbid markdown code blocks
      expect(systemPrompt).toMatch(/```/);
      // Should forbid explanation text
      expect(systemPrompt).toContain('Here is the JSON');
      // Should forbid synonyms
      expect(systemPrompt).toContain('companyName');
      expect(systemPrompt).toContain('issuerName');
      expect(systemPrompt).toContain('executiveSummary');
    });
  });

  describe('Form-specific prompts', () => {
    const formTypes = ['10-K', '10-Q', '8-K', '4', '144', 'SC 13G', 'SC 13D', '424B2'] as const;

    formTypes.forEach(formType => {
      it(`should generate valid prompt for ${formType}`, () => {
        const { systemPrompt, userPrompt, schema } = generateFilingPrompt({ formType });

        expect(systemPrompt).toBeDefined();
        expect(userPrompt).toBeDefined();
        expect(schema).toBeDefined();
        expect(schema.required).toContain('company');
        expect(schema.required).toContain('summary');
      });
    });

    it('should have form-specific required fields for 10-K', () => {
      const { schema } = generateFilingPrompt({ formType: '10-K' });

      expect(schema.required).toContain('fiscalYear');
      expect(schema.required).toContain('keyHighlights');
    });

    it('should have form-specific required fields for 10-Q', () => {
      const { schema } = generateFilingPrompt({ formType: '10-Q' });

      expect(schema.required).toContain('fiscalQuarter');
      expect(schema.required).toContain('keyHighlights');
    });

    it('should have form-specific required fields for 8-K', () => {
      const { schema } = generateFilingPrompt({ formType: '8-K' });

      expect(schema.required).toContain('eventType');
    });

    it('should have form-specific required fields for Form 4', () => {
      const { schema } = generateFilingPrompt({ formType: '4' });

      expect(schema.required).toContain('filerName');
      expect(schema.required).toContain('transactions');
    });
  });

  describe('Schema exports', () => {
    it('should export FORM_SCHEMAS for use by parser', () => {
      expect(FORM_SCHEMAS).toBeDefined();
      expect(typeof FORM_SCHEMAS).toBe('object');
      expect(FORM_SCHEMAS['10-K']).toBeDefined();
      expect(FORM_SCHEMAS['10-Q']).toBeDefined();
      expect(FORM_SCHEMAS['8-K']).toBeDefined();
      expect(FORM_SCHEMAS['4']).toBeDefined();
    });

    it('should have consistent schema structure across all form types', () => {
      const formTypes = Object.keys(FORM_SCHEMAS);

      formTypes.forEach(formType => {
        const schema = FORM_SCHEMAS[formType];

        expect(schema.type).toBe('object');
        expect(Array.isArray(schema.required)).toBe(true);
        expect(typeof schema.properties).toBe('object');
        // All schemas should require company and summary
        expect(schema.required).toContain('company');
        expect(schema.required).toContain('summary');
      });
    });
  });
});
