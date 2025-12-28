/**
 * Integration Tests for Simplified Parsing Pipeline
 *
 * These tests verify that the new simplified parsing system works correctly
 * after the deletion of legacy components in Phase 3.
 *
 * Tests cover:
 * 1. The new simple-parser works independently
 * 2. The unified-prompts system generates correct prompts
 * 3. The system can parse real-world AI response formats
 * 4. Error handling works correctly
 */

import { parseJSONResponse, ParseResult } from '@/lib/ai/parsers/simple-parser';
import { generateFilingPrompt, FORM_SCHEMAS, getSchemaForFormType, isFormTypeSupported } from '@/lib/ai/prompts/unified-prompts';

describe('Parsing Integration - Phase 3 Safety Tests', () => {

  describe('Simple Parser Integration', () => {
    it('should parse clean JSON for all supported form types', () => {
      const testCases: { formType: string; json: Record<string, unknown> }[] = [
        {
          formType: '10-K',
          json: {
            company: 'Tesla, Inc.',
            summary: 'Tesla reported strong annual results.',
            fiscalYear: '2024',
            keyHighlights: ['Revenue increased 15%']
          }
        },
        {
          formType: '10-Q',
          json: {
            company: 'Apple Inc.',
            summary: 'Apple Q3 results exceeded expectations.',
            fiscalQuarter: 'Q3 2024',
            keyHighlights: ['iPhone sales up 10%']
          }
        },
        {
          formType: '8-K',
          json: {
            company: 'NVIDIA Corporation',
            summary: 'NVIDIA announced leadership change.',
            eventType: 'Leadership Change'
          }
        },
        {
          formType: '4',
          json: {
            company: 'Alphabet Inc.',
            summary: 'CEO sold shares for portfolio diversification.',
            filerName: 'Sundar Pichai',
            transactions: [
              { type: 'Sell', shares: '10,000', price: '$150.00', date: '2024-12-15' }
            ]
          }
        }
      ];

      for (const { formType, json } of testCases) {
        const response = JSON.stringify(json);
        const result = parseJSONResponse(response, formType);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject(json);
        expect(result.method).toBe('direct');
        expect(result.attempts).toBe(1);
      }
    });

    it('should strip markdown code blocks and parse successfully', () => {
      const json = {
        company: 'Microsoft Corporation',
        summary: 'Microsoft reported strong quarterly results.',
        fiscalQuarter: 'Q4 2024',
        keyHighlights: ['Cloud revenue up 25%']
      };

      const response = '```json\n' + JSON.stringify(json, null, 2) + '\n```';
      const result = parseJSONResponse(response, '10-Q');

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject(json);
      expect(result.method).toBe('codeblock-stripped');
    });

    it('should fail fast on invalid JSON without repair attempts', () => {
      const invalidResponse = '{"company": "Tesla", broken json here';
      const result = parseJSONResponse(invalidResponse, '10-K');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(1);
      expect(result.diagnostics).toBeDefined();
    });

    it('should report validation errors for missing required fields', () => {
      // Missing 'summary' and 'keyHighlights' for 10-K
      const response = JSON.stringify({
        company: 'Tesla, Inc.',
        fiscalYear: '2024'
      });

      const result = parseJSONResponse(response, '10-K');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('summary');
      expect(result.validationErrors).toContain('keyHighlights');
    });

    it('should complete parsing in under 5ms average', () => {
      const response = JSON.stringify({
        company: 'Tesla',
        summary: 'Strong performance.',
        fiscalYear: '2024',
        keyHighlights: ['Revenue up']
      });

      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        parseJSONResponse(response, '10-K');
      }

      const avgTime = (performance.now() - startTime) / iterations;

      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('Unified Prompts Integration', () => {
    it('should generate prompts for all supported form types', () => {
      const formTypes = ['10-K', '10-Q', '8-K', '4', '144', 'SC 13G', 'SC 13D', '424B2'];

      for (const formType of formTypes) {
        const result = generateFilingPrompt({ formType });

        expect(result.systemPrompt).toBeDefined();
        expect(result.userPrompt).toBeDefined();
        expect(result.schema).toBeDefined();
        expect(result.schema.required).toContain('company');
        expect(result.schema.required).toContain('summary');
      }
    });

    it('should include strict JSON requirements in system prompt', () => {
      const { systemPrompt } = generateFilingPrompt({ formType: '10-K' });

      expect(systemPrompt).toMatch(/^CRITICAL: You must respond with ONLY valid JSON/);
      expect(systemPrompt).toContain('Do not wrap');
      expect(systemPrompt).toContain('no markdown');
    });

    it('should place schema before content in user prompt', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'This is the filing content...'
      });

      const schemaIndex = userPrompt.indexOf('JSON Schema');
      const contentIndex = userPrompt.indexOf('Filing Content');

      expect(schemaIndex).toBeLessThan(contentIndex);
    });

    it('should produce deterministic prompts for same inputs', () => {
      const config = { formType: '8-K' };
      const prompt1 = generateFilingPrompt(config);
      const prompt2 = generateFilingPrompt(config);

      expect(prompt1.systemPrompt).toEqual(prompt2.systemPrompt);
      expect(prompt1.userPrompt).toEqual(prompt2.userPrompt);
      expect(prompt1.schema).toEqual(prompt2.schema);
    });

    it('should use exact field names without synonyms', () => {
      const { userPrompt } = generateFilingPrompt({ formType: '10-K' });

      // Must use 'company' not alternatives
      expect(userPrompt).toContain('"company"');
      expect(userPrompt).not.toContain('"companyName"');
      expect(userPrompt).not.toContain('"issuerName"');

      // Must use 'summary' not alternatives
      expect(userPrompt).toContain('"summary"');
      expect(userPrompt).not.toContain('"executiveSummary"');
    });
  });

  describe('Schema Utilities', () => {
    it('should return correct schema for known form types', () => {
      const schema = getSchemaForFormType('10-K');

      expect(schema.required).toContain('company');
      expect(schema.required).toContain('fiscalYear');
      expect(schema.properties.keyHighlights).toBeDefined();
    });

    it('should return Generic schema for unknown form types', () => {
      const schema = getSchemaForFormType('UNKNOWN-FORM');

      expect(schema).toEqual(FORM_SCHEMAS['Generic']);
      expect(schema.required).toEqual(['company', 'summary']);
    });

    it('should correctly identify supported form types', () => {
      expect(isFormTypeSupported('10-K')).toBe(true);
      expect(isFormTypeSupported('8-K')).toBe(true);
      expect(isFormTypeSupported('Generic')).toBe(false);
      expect(isFormTypeSupported('UNKNOWN')).toBe(false);
    });
  });

  describe('End-to-End Workflow Simulation', () => {
    it('should handle complete prompt → response → parse workflow', () => {
      // Step 1: Generate prompt
      const { schema } = generateFilingPrompt({ formType: '10-K' });

      // Step 2: Simulate AI response (as if model followed the prompt)
      const aiResponse = JSON.stringify({
        company: 'Tesla, Inc.',
        summary: 'Tesla reported $96.8B in annual revenue for FY2024, up 19% YoY.',
        fiscalYear: '2024',
        keyHighlights: [
          'Revenue reached $96.8 billion, up 19% year-over-year.',
          'Net income was $15 billion with 15.5% margin.',
          'Vehicle deliveries exceeded 1.8 million units.'
        ],
        risks: [
          'Supply chain disruptions could impact production.',
          'Increasing competition in EV market.'
        ],
        revenue: '$96.8B',
        netIncome: '$15B'
      });

      // Step 3: Parse the response
      const result = parseJSONResponse(aiResponse, '10-K');

      // Verify success
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Verify all required fields present
      for (const field of schema.required) {
        expect(result.data![field]).toBeDefined();
      }
    });

    it('should handle Form 4 insider trading workflow', () => {
      const { schema } = generateFilingPrompt({ formType: '4' });

      const aiResponse = JSON.stringify({
        company: 'Apple Inc.',
        summary: 'Tim Cook sold 50,000 shares for portfolio diversification.',
        filerName: 'Tim Cook',
        relationship: 'CEO',
        transactions: [
          { type: 'Sell', shares: '50,000', price: '$195.50', date: '2024-12-20' }
        ],
        totalValue: '$9,775,000'
      });

      const result = parseJSONResponse(aiResponse, '4');

      expect(result.success).toBe(true);

      for (const field of schema.required) {
        expect(result.data![field]).toBeDefined();
      }
    });
  });
});
