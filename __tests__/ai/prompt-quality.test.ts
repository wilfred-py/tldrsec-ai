import { generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('Filing Prompt Quality Rules', () => {
  describe('Word blocklist', () => {
    // Review Decision #6: Test structural presence, not exact wording
    it('should include a forbidden word/phrase blocklist section in system prompt', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: '8-K',
        filingContent: 'Test content',
      });
      // Test that a blocklist section exists with multiple entries
      expect(systemPrompt).toMatch(/never use|forbidden|avoid these/i);
      // Verify blocklist has substance (at least 5 entries)
      const blocklistMatch = systemPrompt.match(/NEVER use.*?(?=\n\nEXAMPLE)/is);
      expect(blocklistMatch).toBeTruthy();
      const entryCount = (blocklistMatch![0].match(/^- /gm) || []).length;
      expect(entryCount).toBeGreaterThanOrEqual(5);
    });

    it('should include bad/good example pairs for writing style', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'Test content',
      });
      // Test structure: BAD/GOOD example pairs exist
      expect(systemPrompt).toMatch(/BAD:.*\n.*GOOD:/is);
    });
  });

  describe('8-K item descriptions', () => {
    it('should include item-to-description mapping in 8-K extraction guidance', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '8-K',
        filingContent: 'Test content with Item 2.02',
      });
      expect(userPrompt).toContain('itemDescriptions');
    });
  });

  describe('Financial metric enforcement', () => {
    it('should require gross margin calculation for 10-K', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'Revenue: $50B, COGS: $20B',
      });
      expect(userPrompt).toContain('Gross margin');
      expect(userPrompt).toContain('MANDATORY');
    });
  });
});
