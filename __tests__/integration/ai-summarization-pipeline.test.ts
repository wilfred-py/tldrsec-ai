import { jest } from '@jest/globals';

// Integration test for the AI summarization pipeline that was just fixed
// This tests the actual integration without heavy mocking

// Mock only external services that would make network calls
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate
      }
    }))
  };
});

jest.mock('../../lib/network/enhanced-fetch', () => ({
  enhancedFetch: jest.fn()
}));

jest.mock('../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn()
}));

jest.mock('../../lib/email/summary-service', () => ({
  sendFilingSummaryEmail: jest.fn()
}));

jest.mock('../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    })),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

import { generateAISummaryWithRetry } from '../../services/filing/summaryGenerationService';
import { parseFormContentEnhanced } from '../../lib/parsers/enhanced-form-parser';

const { Anthropic } = require('@anthropic-ai/sdk');

describe('AI Summarization Pipeline Integration', () => {
  let mockAnthropicCreate: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up the Anthropic mock
    mockAnthropicCreate = Anthropic().messages.create;
    
    // Set environment variables
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('Core Functionality Tests', () => {
    it('should successfully parse filing content and generate AI summary', async () => {
      // Mock successful AI response
      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            summary: 'Tesla Inc. reported strong quarterly financial performance with record deliveries.',
            financialHighlights: [
              { metric: 'Revenue', value: '$25.2B', yearOverYearChange: '+19%' },
              { metric: 'Net Income', value: '$3.3B', yearOverYearChange: '+27%' }
            ],
            businessHighlights: [
              { detail: 'Record vehicle deliveries of 484,507 units' },
              { detail: 'Expansion of Supercharger network to 45,000 global stations' }
            ],
            riskFactors: [
              { description: 'Supply chain constraints affecting production' },
              { description: 'Increased competition in EV market' }
            ],
            keyTakeaway: 'Tesla continues to demonstrate strong execution with record performance across key metrics.'
          })
        }],
        usage: {
          input_tokens: 2500,
          output_tokens: 800
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockAIResponse);

      // Sample SEC filing content (realistic structure)
      const sampleFilingContent = `
        <DOCUMENT>
        <TYPE>10-Q
        <DESCRIPTION>FORM 10-Q
        <TEXT>
        UNITED STATES SECURITIES AND EXCHANGE COMMISSION
        Washington, D.C. 20549
        
        FORM 10-Q
        
        QUARTERLY REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
        
        For the quarterly period ended September 30, 2023
        
        TESLA, INC.
        (Exact name of registrant as specified in its charter)
        
        PART I—FINANCIAL INFORMATION
        
        Item 1. Financial Statements
        
        TESLA, INC.
        CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS
        (in millions, except per share data)
        (Unaudited)
        
                                        Three Months Ended
                                        September 30,
                                    2023        2022
        Automotive revenues         $19,625     $18,692
        Services and other revenues  $2,790      $1,645
        Total revenues              $25,215     $21,454
        
        Operating income             $1,761      $3,653
        Income before income taxes   $2,296      $3,292
        Net income                   $1,853      $3,292
        
        Item 2. Management's Discussion and Analysis of Financial Condition and Results of Operations
        
        We delivered 484,507 vehicles in Q3 2023, representing a 27% increase compared to the same period in the prior year.
        We continue to expand our Supercharger network, reaching over 45,000 Superchargers globally.
        
        </TEXT>
        </DOCUMENT>
      `;

      // Test the enhanced parser
      const parsedContent = await parseFormContentEnhanced(sampleFilingContent, '10-Q', 'https://sec.gov/test-filing');
      
      expect(parsedContent).toBeDefined();
      expect(parsedContent.sections).toBeDefined();
      expect(typeof parsedContent.sections === 'string' || typeof parsedContent.sections === 'object').toBe(true);

      // Test AI summary generation
      const summaryResult = await generateAISummaryWithRetry(
        typeof parsedContent.sections === 'string' ? parsedContent.sections : JSON.stringify(parsedContent.sections),
        {
          formType: '10-Q',
          filingDate: '2023-09-30',
          accessionNumber: '0001628280-23-000456'
        },
        {
          name: 'Tesla Inc.',
          ticker: 'TSLA'
        }
      );

      // Verify AI summary structure
      expect(summaryResult).toBeDefined();
      expect(summaryResult.summary).toBe('Tesla Inc. reported strong quarterly financial performance with record deliveries.');
      expect(summaryResult.keyPoints).toHaveLength(7); // 2 financial + 2 business + 2 risk + 1 key takeaway
      expect(summaryResult.tokensUsed).toBe(3300);
      expect(summaryResult.inputTokens).toBe(2500);
      expect(summaryResult.outputTokens).toBe(800);
      expect(summaryResult.cost).toBeCloseTo(0.0975); // (2500/1M * 15) + (800/1M * 75)
      expect(summaryResult.model).toBe('claude-3-opus-20240229');
      expect(summaryResult.error).toBeUndefined();

      // Verify AI was called with proper prompt structure
      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        temperature: 0.2,
        system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, concise summaries in valid JSON format.',
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('You are an expert financial analyst specializing in SEC filings')
          }
        ]
      });

      const promptContent = mockAnthropicCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('Tesla Inc.');
      expect(promptContent).toContain('TSLA');
      expect(promptContent).toContain('10-Q');
      expect(promptContent).toContain('9/30/2023');
    });

    it('should handle Date to ISO string conversion correctly', async () => {
      // Mock AI response
      mockAnthropicCreate.mockResolvedValue({
        content: [{ text: '{"summary": "Test summary"}' }],
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      // Test with Date object (as would come from database)
      const filingDate = new Date('2023-12-31T10:30:00Z');
      
      const result = await generateAISummaryWithRetry(
        'Test content',
        {
          formType: '10-K',
          filingDate: filingDate.toISOString(), // This is how the cron job converts it
          accessionNumber: '0001234567-23-000001'
        },
        {
          name: 'Test Company',
          ticker: 'TEST'
        }
      );

      expect(result).toBeDefined();
      
      // Verify the prompt was generated with properly formatted date
      const promptContent = mockAnthropicCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('12/31/2023'); // Should be formatted for display
    });

    it('should handle retry mechanism with exponential backoff', async () => {
      const startTime = Date.now();
      
      // Mock first two calls to fail, third to succeed
      mockAnthropicCreate
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Temporary service unavailable'))
        .mockResolvedValue({
          content: [{ text: '{"summary": "Success after retries"}' }],
          usage: { input_tokens: 200, output_tokens: 100 }
        });

      const result = await generateAISummaryWithRetry(
        'Test content',
        { formType: '8-K', filingDate: '2023-06-15' },
        { name: 'Retry Test Co', ticker: 'RETRY' },
        2 // maxRetries
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should have succeeded on third attempt
      expect(result.summary).toBe('Success after retries');
      expect(result.error).toBeUndefined();
      
      // Should have taken at least 3 seconds (2^0 * 1000 + 2^1 * 1000 = 3s for backoff)
      expect(duration).toBeGreaterThan(3000);
      
      // Should have been called 3 times
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(3);
    });

    it('should generate fallback summary when AI fails after all retries', async () => {
      // Mock all calls to fail
      mockAnthropicCreate.mockRejectedValue(new Error('Persistent API failure'));

      const result = await generateAISummaryWithRetry(
        'Test filing content',
        {
          formType: 'DEF 14A',
          filingDate: '2023-04-15',
          accessionNumber: '0001234567-23-000002'
        },
        {
          name: 'Fallback Test Company',
          ticker: 'FALL'
        },
        1 // maxRetries
      );

      // Should return fallback summary
      expect(result.summary).toContain('Fallback Test Company (FALL) filed a DEF 14A');
      expect(result.keyPoints).toContain('AI-powered summary generation failed after multiple attempts. This is a fallback summary.');
      expect(result.error).toBe('Persistent API failure');
      expect(result.cost).toBeUndefined(); // Fallback summaries have no cost
      expect(result.tokensUsed).toBeUndefined();

      // Should have attempted retries
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('should handle JSON and string content sections correctly', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ text: '{"summary": "Test summary"}' }],
        usage: { input_tokens: 300, output_tokens: 150 }
      });

      // Test with object sections
      const objectSections = {
        businessOverview: 'Company business information',
        financialData: 'Financial metrics and performance',
        riskFactors: 'Risk assessment details'
      };

      const result1 = await generateAISummaryWithRetry(
        JSON.stringify(objectSections),
        { formType: '10-K', filingDate: '2023-12-31' },
        { name: 'Object Test Co', ticker: 'OBJ' }
      );

      expect(result1).toBeDefined();

      // Test with string sections
      const stringSection = 'Combined filing content as a single string';

      const result2 = await generateAISummaryWithRetry(
        stringSection,
        { formType: '10-K', filingDate: '2023-12-31' },
        { name: 'String Test Co', ticker: 'STR' }
      );

      expect(result2).toBeDefined();

      // Both should work and generate summaries
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle malformed JSON response gracefully', async () => {
      // Mock malformed JSON response
      mockAnthropicCreate.mockResolvedValue({
        content: [{ text: 'Invalid JSON response from Claude {incomplete' }],
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      const result = await generateAISummaryWithRetry(
        'Test content',
        { formType: '8-K', filingDate: '2023-06-01' },
        { name: 'JSON Error Co', ticker: 'JSON' }
      );

      // Should fall back to generated summary
      expect(result.summary).toContain('JSON Error Co (JSON) filed a 8-K');
      expect(result.error).toBe('Failed to parse AI summary response');
    });

    it('should handle missing API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await generateAISummaryWithRetry(
        'Test content',
        { formType: 'S-1', filingDate: '2023-08-01' },
        { name: 'No API Key Co', ticker: 'NOKEY' }
      );

      // Should generate fallback without calling API
      expect(result.summary).toContain('No API Key Co (NOKEY) filed a S-1');
      expect(result.error).toBe('ANTHROPIC_API_KEY not set');
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });

    it('should handle content that is too long by truncating', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ text: '{"summary": "Summary of truncated content"}' }],
        usage: { input_tokens: 1500, output_tokens: 200 }
      });

      // Create very long content (over 32k characters)
      const longContent = 'A'.repeat(50000);

      const result = await generateAISummaryWithRetry(
        longContent,
        { formType: '10-K', filingDate: '2023-12-31' },
        { name: 'Long Content Co', ticker: 'LONG' }
      );

      expect(result.summary).toBe('Summary of truncated content');

      // Verify the content was truncated in the prompt
      const promptContent = mockAnthropicCreate.mock.calls[0][0].messages[0].content;
      const contentStart = promptContent.indexOf('Here is the filing content:') + 27;
      const actualContent = promptContent.substring(contentStart).trim();
      
      // Content should be truncated to 32000 characters max
      expect(actualContent.length).toBeLessThanOrEqual(32000);
    });
  });

  describe('Cost Calculation Tests', () => {
    it('should calculate costs correctly for different token usage patterns', async () => {
      const testCases = [
        { inputTokens: 1000, outputTokens: 500, expectedCost: 0.0525 },
        { inputTokens: 5000, outputTokens: 2000, expectedCost: 0.225 },
        { inputTokens: 100, outputTokens: 50, expectedCost: 0.00525 }
      ];

      for (const testCase of testCases) {
        mockAnthropicCreate.mockResolvedValue({
          content: [{ text: '{"summary": "Test summary for cost calculation"}' }],
          usage: {
            input_tokens: testCase.inputTokens,
            output_tokens: testCase.outputTokens
          }
        });

        const result = await generateAISummaryWithRetry(
          'Test content for cost calculation',
          { formType: '10-Q', filingDate: '2023-09-30' },
          { name: 'Cost Test Co', ticker: 'COST' }
        );

        expect(result.inputTokens).toBe(testCase.inputTokens);
        expect(result.outputTokens).toBe(testCase.outputTokens);
        expect(result.tokensUsed).toBe(testCase.inputTokens + testCase.outputTokens);
        expect(result.cost).toBeCloseTo(testCase.expectedCost, 4);

        jest.clearAllMocks();
      }
    });
  });
});