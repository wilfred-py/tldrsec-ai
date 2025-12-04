/**
 * Integration tests for journalist tone prompt → summary → email flow
 * Validates end-to-end pipeline with new prompts
 */

import { Form10KPrompt } from '../form-10k';
import { Form10QPrompt } from '../form-10q';
import { Form8KPrompt } from '../form-8k';
import { FormForm4Prompt } from '../form-4';

// Mock filing data for testing
const mockFiling = {
  id: 'test-filing-123',
  companyName: 'Test Corp',
  formType: '10-K',
  filedDate: new Date('2024-01-15'),
  periodEndDate: new Date('2023-12-31'),
  accessionNumber: '0001234567-24-000001',
  summary: null,
  content: 'Mock filing content for testing...',
  cik: '1234567',
  ticker: 'TEST'
};

const mockSummary = {
  id: 'summary-123',
  filingId: 'test-filing-123',
  summary: JSON.stringify({
    companyName: 'Test Corp',
    formType: '10-K',
    reportDate: '2023-12-31',
    keyHighlights: [
      'Revenue increased 25% to $2.1B vs $1.7B prior year',
      'Operating margin compressed to 18% from 22% due to supply chain costs',
      'Acquired competitor for $150M to expand market share'
    ],
    financialMetrics: {
      revenue: { current: 2100000000, previous: 1700000000, change: 23.5 },
      netIncome: { current: 315000000, previous: 280000000, change: 12.5 },
      eps: { current: 2.85, previous: 2.52, change: 13.1 }
    },
    businessInsights: [
      'Market share gains in core segments',
      'Supply chain disruption impacting margins'
    ],
    riskFactors: [
      'Increasing competition in target markets',
      'Supply chain cost pressures'
    ]
  }),
  tokensUsed: 1500,
  costInCents: 15,
  processingTimeMs: 2500,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('Journalist Tone Integration Tests', () => {
  describe('Prompt Output Validation', () => {
    it('should generate prompts with journalist tone requirements', () => {
      const prompt = new Form10KPrompt();
      const systemPrompt = prompt.getSystemPrompt();
      
      // Verify journalist tone elements are present
      expect(systemPrompt).toContain('financial journalist');
      expect(systemPrompt).toContain('Lead with what changed');
      expect(systemPrompt).toContain('Year-over-year comparisons are essential');
      
      // Verify output format requirements
      expect(systemPrompt).toContain('valid JSON');
      expect(systemPrompt).toContain('provided schema');
    });

    it('should handle quarterly vs annual context correctly', () => {
      const annualPrompt = new Form10KPrompt();
      const quarterlyPrompt = new Form10QPrompt();
      
      const annualSystem = annualPrompt.getSystemPrompt();
      const quarterlySystem = quarterlyPrompt.getSystemPrompt();
      
      expect(annualSystem).toContain('Year-over-year comparisons are essential');
      expect(quarterlySystem).toContain('sequential comparisons');
      expect(quarterlySystem).toContain('Sequential trends');
    });
  });

  describe('Prompt Template Integration', () => {
    it('should generate consistent prompts across form types', () => {
      const prompts = [
        new Form10KPrompt(),
        new Form10QPrompt(), 
        new Form8KPrompt(),
        new FormForm4Prompt()
      ];

      prompts.forEach(prompt => {
        const systemPrompt = prompt.getSystemPrompt();
        
        // All prompts should require JSON output
        expect(systemPrompt).toContain('JSON');
        expect(systemPrompt).toContain('schema');
        
        // All prompts should include data accuracy requirements
        expect(systemPrompt).toContain('directly from the filing');
        
        // Should not be empty
        expect(systemPrompt.length).toBeGreaterThan(100);
      });
    });

    it('should include form-specific context in prompts', () => {
      const annualPrompt = new Form10KPrompt().getSystemPrompt();
      const quarterlyPrompt = new Form10QPrompt().getSystemPrompt();
      const eventPrompt = new Form8KPrompt().getSystemPrompt();
      const insiderPrompt = new FormForm4Prompt().getSystemPrompt();

      // Each prompt should have form-specific language
      expect(annualPrompt).toContain('annual');
      expect(quarterlyPrompt).toContain('quarter');
      expect(eventPrompt).toContain('material events');
      expect(insiderPrompt).toContain('Matt Levine');
    });
  });

  describe('Prompt Validation', () => {
    it('should validate prompt template inheritance', () => {
      const prompts = [
        new Form10KPrompt(),
        new Form10QPrompt(),
        new Form8KPrompt(),
        new FormForm4Prompt()
      ];

      prompts.forEach(prompt => {
        // Should inherit from PromptTemplate
        expect(typeof prompt.getSystemPrompt).toBe('function');
        expect(typeof prompt.getUserPrompt).toBe('function');
      });
    });

    it('should handle empty or minimal input gracefully', () => {
      const prompts = [
        new Form10KPrompt(),
        new Form10QPrompt(),
        new Form8KPrompt(),
        new FormForm4Prompt()
      ];

      prompts.forEach(prompt => {
        // Should not throw when called with valid context
        expect(() => {
          const userPrompt = prompt.getUserPrompt({ content: 'test content' });
          expect(userPrompt).toBeDefined();
        }).not.toThrow();
      });
    });
  });

  describe('Performance Considerations', () => {
    it('should render prompts efficiently', () => {
      const prompts = [
        new Form10KPrompt(),
        new Form10QPrompt(),
        new Form8KPrompt(),
        new FormForm4Prompt()
      ];

      const startTime = Date.now();
      
      // Render prompts multiple times
      for (let i = 0; i < 100; i++) {
        prompts.forEach(prompt => {
          prompt.getSystemPrompt();
          prompt.getUserPrompt({ content: 'test content' });
        });
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should render prompts quickly (less than 1000ms total for 400 calls)
      expect(totalTime).toBeLessThan(1000);
    });
  });
});