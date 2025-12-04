/**
 * Tests for journalist tone implementation in SEC filing prompts
 * Validates that new prompts produce expected output format and tone
 */

import { Form10KPrompt } from '../form-10k';
import { Form10QPrompt } from '../form-10q';
import { Form8KPrompt } from '../form-8k';
import { FormForm4Prompt } from '../form-4';

describe('Journalist Tone Prompts', () => {
  describe('Form 10K Prompt', () => {
    it('should contain journalist tone guidance', () => {
      const prompt = new Form10KPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('financial journalist');
      expect(systemPrompt).toContain('Lead with what changed');
      expect(systemPrompt).toContain('Year-over-year comparisons are essential');
      expect(systemPrompt).toContain('No corporate-speak');
    });

    it('should require JSON output format', () => {
      const prompt = new Form10KPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('valid JSON');
      expect(systemPrompt).toContain('provided schema');
    });

    it('should emphasize data accuracy', () => {
      const prompt = new Form10KPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('Every number must come directly from the filing');
    });
  });

  describe('Form 10Q Prompt', () => {
    it('should contain journalist tone guidance', () => {
      const prompt = new Form10QPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('financial journalist');
      expect(systemPrompt).toContain('Lead with the quarter');
      expect(systemPrompt).toContain('sequential comparisons');
    });

    it('should focus on quarterly context', () => {
      const prompt = new Form10QPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('quarter');
      expect(systemPrompt).toContain('Sequential trends');
    });
  });

  describe('Form 8K Prompt', () => {
    it('should contain journalist tone guidance', () => {
      const prompt = new Form8KPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('breaking news');
      expect(systemPrompt).toContain('material events');
      expect(systemPrompt).toContain('Lead with what happened');
    });

    it('should emphasize urgency and materiality', () => {
      const prompt = new Form8KPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('move stock prices');
      expect(systemPrompt).toContain('why it matters');
    });
  });

  describe('Form 4 Prompt', () => {
    it('should contain journalist tone guidance', () => {
      const prompt = new FormForm4Prompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('financial journalist');
      expect(systemPrompt).toContain('sophisticated investors');
    });

    it('should focus on insider context', () => {
      const prompt = new FormForm4Prompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      expect(systemPrompt).toContain('Matt Levine');
      expect(systemPrompt).toContain('sophisticated investors');
    });
  });

  describe('Common Journalist Elements', () => {
    const promptClasses = [
      { class: Form10KPrompt, name: 'Form10KPrompt' },
      { class: Form10QPrompt, name: 'Form10QPrompt' },
      { class: Form8KPrompt, name: 'Form8KPrompt' },
      { class: FormForm4Prompt, name: 'FormForm4Prompt' }
    ];
    
    promptClasses.forEach(({ class: PromptClass, name }) => {
      describe(name, () => {
        it('should avoid corporate speak', () => {
          const prompt = new PromptClass();
          const systemPrompt = prompt.getSystemPrompt();
          
          expect(
            systemPrompt.includes('corporate-speak') || 
            systemPrompt.includes('jargon') ||
            systemPrompt.includes('bullshit') ||
            systemPrompt.includes('No euphemisms')
          ).toBe(true);
        });

        it('should emphasize conciseness', () => {
          const prompt = new PromptClass();
          const systemPrompt = prompt.getSystemPrompt();
          
          expect(
            systemPrompt.includes('Concise') || 
            systemPrompt.includes('concise') ||
            systemPrompt.includes('30 seconds') ||
            systemPrompt.includes('brief') ||
            systemPrompt.includes('short') ||
            systemPrompt.includes('sharp') ||
            systemPrompt.includes('precision') ||
            systemPrompt.includes('Be direct') ||
            systemPrompt.includes('direct') ||
            systemPrompt.includes('get to the point')
          ).toBe(true);
        });

        it('should target busy investors', () => {
          const prompt = new PromptClass();
          const systemPrompt = prompt.getSystemPrompt();
          
          expect(
            systemPrompt.includes('busy investor') || 
            systemPrompt.includes('investors') ||
            systemPrompt.includes('someone who manages') ||
            systemPrompt.includes('reader')
          ).toBe(true);
        });
      });
    });
  });
});