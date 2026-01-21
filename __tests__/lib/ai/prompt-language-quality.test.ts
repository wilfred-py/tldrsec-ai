import { generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('Prompt Language Quality', () => {
  describe('verb variety guidance', () => {
    it('should instruct AI to vary verbs for sales transactions', () => {
      // Arrange & Act
      const { systemPrompt, userPrompt } = generateFilingPrompt({
        formType: 'Form 4',
        company: 'Tesla',
        ticker: 'TSLA',
        filingDate: '2026-01-20',
        filingContent: 'Mock content'
      });

      const fullPrompt = systemPrompt + userPrompt;

      // Assert
      expect(fullPrompt).toMatch(/vary.*verb/i);
      expect(fullPrompt).toMatch(/sold|divested|offloaded/i);
      expect(fullPrompt).not.toMatch(/dumped/i);  // Should NOT contain "dumped"
    });

    it('should provide alternative verbs for different transaction types', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: 'Form 4',
        company: 'Test',
        ticker: 'TEST',
        filingDate: '2026-01-20',
        filingContent: 'Test'
      });

      expect(systemPrompt).toMatch(/acquired|bought|purchased/i);
      expect(systemPrompt).toMatch(/granted|awarded/i);
    });
  });

  describe('acronym expansion guidance', () => {
    it('should instruct AI to expand acronyms on first use', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: 'Form 4',
        company: 'Test',
        ticker: 'TEST',
        filingDate: '2026-01-20',
        filingContent: 'Test'
      });

      expect(systemPrompt).toMatch(/expand.*acronym/i);
      expect(systemPrompt).toMatch(/first use/i);
    });

    it('should provide examples of acronym expansion', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: '10-K',
        company: 'Test',
        ticker: 'TEST',
        filingDate: '2026-01-20',
        filingContent: 'Test'
      });

      expect(systemPrompt).toMatch(/TSR.*Total Shareholder Return/i);
      expect(systemPrompt).toMatch(/PSU.*Performance Stock Units/i);
    });

    it('should allow acronym reuse after first expansion', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: 'Form 4',
        company: 'Test',
        ticker: 'TEST',
        filingDate: '2026-01-20',
        filingContent: 'Test'
      });

      expect(systemPrompt).toMatch(/subsequent.*use.*acronym/i);
    });
  });
});
