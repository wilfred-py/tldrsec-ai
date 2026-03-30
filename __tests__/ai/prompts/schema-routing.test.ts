import { getSchemaForFormType, generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('Schema routing with canonicalization', () => {
  describe('getSchemaForFormType', () => {
    it('routes 10-K/A to the 10-K schema (not Generic)', () => {
      const schema = getSchemaForFormType('10-K/A');
      expect(schema.required).toContain('financialHighlights');
    });

    it('routes 10-Q/A to the 10-Q schema', () => {
      const schema = getSchemaForFormType('10-Q/A');
      expect(schema.required).toContain('financialHighlights');
    });

    it('routes SC 13G/A to SC 13G schema', () => {
      const schema = getSchemaForFormType('SC 13G/A');
      expect(schema.required).toContain('ownershipPercentage');
    });

    it('routes SC 13D/A to SC 13D schema', () => {
      const schema = getSchemaForFormType('SC 13D/A');
      expect(schema.required).toContain('ownershipPercentage');
    });

    it('routes SCHEDULE 13G to SC 13G schema', () => {
      const schema = getSchemaForFormType('SCHEDULE 13G');
      expect(schema.required).toContain('ownershipPercentage');
    });

    it('routes SCHEDULE 13D to SC 13D schema', () => {
      const schema = getSchemaForFormType('SCHEDULE 13D');
      expect(schema.required).toContain('ownershipPercentage');
    });

    it('routes Form4 to Form 4 schema', () => {
      const schema = getSchemaForFormType('Form4');
      expect(schema.required).toContain('transactions');
    });

    it('routes Form 4 (with space) to Form 4 schema', () => {
      const schema = getSchemaForFormType('Form 4');
      expect(schema.required).toContain('transactions');
    });

    it('has Form 3 schema with ownershipPercentage', () => {
      const schema = getSchemaForFormType('3');
      expect(schema.required).toContain('ownershipPercentage');
      expect(schema.required).toContain('filerName');
    });

    it('routes Form 3 variant to the schema', () => {
      const schema = getSchemaForFormType('Form 3');
      expect(schema.required).toContain('ownershipPercentage');
    });
  });

  describe('generateFilingPrompt amendment guidance', () => {
    it('includes amendment guidance for 10-K/A', () => {
      const result = generateFilingPrompt({
        formType: '10-K/A',
        filingContent: 'Test filing content'
      });
      expect(result.userPrompt).toContain('AMENDMENT FILING');
      expect(result.userPrompt).toContain('10-K/A');
    });

    it('includes amendment guidance for SC 13G/A', () => {
      const result = generateFilingPrompt({
        formType: 'SC 13G/A',
        filingContent: 'Test filing content'
      });
      expect(result.userPrompt).toContain('AMENDMENT FILING');
    });

    it('does NOT include amendment guidance for regular 10-K', () => {
      const result = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'Test filing content'
      });
      expect(result.userPrompt).not.toContain('AMENDMENT FILING');
    });

    it('uses correct schema for amendment type', () => {
      const result = generateFilingPrompt({
        formType: '10-K/A',
        filingContent: 'Test'
      });
      // Schema should be the 10-K schema, which requires financialHighlights
      expect(result.schema.required).toContain('financialHighlights');
    });
  });
});
