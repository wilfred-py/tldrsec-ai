import { generateFilingPrompt } from '../../../lib/ai/prompts/unified-prompts';

describe('Unified Prompts - Markdown Prevention', () => {
  describe('SYSTEM_PROMPT', () => {
    // Get the system prompt from generateFilingPrompt
    const { systemPrompt } = generateFilingPrompt({ formType: '8-K' });

    it('should explicitly forbid markdown headers (###, ####) in JSON values', () => {
      // Verify the system prompt contains explicit markdown prohibition
      expect(systemPrompt).toContain('Do not use markdown headers');
    });

    it('should forbid bullet points (* or -) in summary fields', () => {
      expect(systemPrompt).toMatch(/Do not use .*(bullet|list|[-*])/i);
    });

    it('should encourage plain prose sentences', () => {
      expect(systemPrompt).toContain('plain prose');
    });
  });

  describe('SYSTEM_PROMPT Writing Style', () => {
    const { systemPrompt } = generateFilingPrompt({ formType: '10-K' });

    it('should include financial journalist writing style guidance', () => {
      expect(systemPrompt).toMatch(/financial journalist|Morning Brew|Bloomberg/i);
    });

    it('should encourage concise writing with specific numbers', () => {
      expect(systemPrompt).toMatch(/concise|specific numbers/i);
    });

    it('should prefer active voice', () => {
      expect(systemPrompt).toMatch(/active voice/i);
    });
  });
});
