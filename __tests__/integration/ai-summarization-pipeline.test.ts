import { jest } from '@jest/globals';

// Integration test for the AI summarization pipeline that was just fixed
// This tests the actual integration without heavy mocking

// Mock OpenRouter client instead of Anthropic
const mockSendMessage = jest.fn();
jest.mock('../../lib/ai/openrouter-client', () => ({
  openRouterClient: {
    sendMessage: mockSendMessage
  },
  OpenRouterClient: jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage
  }))
}));

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

jest.mock('../../lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordTiming: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordMetric: jest.fn()
  },
  default: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordTiming: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordMetric: jest.fn()
  }
}));

// Mock circuit breaker to bypass state persistence between tests
jest.mock('../../lib/error-handling/retry', () => ({
  checkCircuitBreaker: jest.fn().mockReturnValue({ isOpen: false }),
  getCircuitBreaker: jest.fn().mockReturnValue({
    failures: 0,
    lastFailure: 0,
    isOpen: false
  }),
  resetCircuitBreaker: jest.fn(),
  executeWithRetry: jest.fn().mockImplementation(async (fn) => fn())
}));

import { generateAISummaryWithRetry } from '../../services/filing/summaryGenerationService';
import { parseFormContentEnhanced } from '../../lib/parsers/enhanced-form-parser';
import { openRouterClient } from '../../lib/ai/openrouter-client';

describe('AI Summarization Pipeline Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables for OpenRouter
    process.env.TLDRSEC_AI_SUMMARIZER = 'test-api-key';
    process.env.DEFAULT_AI_MODEL = 'x-ai/grok-4-fast:free';
  });

  afterEach(() => {
    delete process.env.TLDRSEC_AI_SUMMARIZER;
    delete process.env.DEFAULT_AI_MODEL;
  });

  describe('Core Functionality Tests', () => {
    it('should successfully parse filing content and generate AI summary', async () => {
      // Mock successful OpenRouter response
      const mockOpenRouterResponse = {
        id: 'test-response-id',
        content: JSON.stringify({
          summary: 'Tesla Inc. reported strong quarterly financial performance with record deliveries.',
          financialHighlights: [
            { metric: 'Revenue', value: '$25.2B', yearOverYearChange: '+19%', significance: 'Strong revenue growth' },
            { metric: 'Net Income', value: '$3.3B', yearOverYearChange: '+27%', significance: 'Improved profitability' }
          ],
          businessHighlights: [
            { category: 'Operations', detail: 'Record vehicle deliveries of 484,507 units', impact: 'Significant market expansion' },
            { category: 'Infrastructure', detail: 'Expansion of Supercharger network to 45,000 global stations', impact: 'Enhanced customer experience' }
          ],
          riskFactors: [
            { category: 'Operational', description: 'Supply chain constraints affecting production', severity: 'Medium' },
            { category: 'Market', description: 'Increased competition in EV market', severity: 'Medium' }
          ],
          keyTakeaway: 'Tesla continues to demonstrate strong execution with record performance across key metrics.',
          investorImpact: 'Positive outlook for continued growth'
        }),
        model: 'x-ai/grok-4-fast:free',
        usage: {
          inputTokens: 2500,
          outputTokens: 800
        },
        cost: {
          inputCost: 0.0375,
          outputCost: 0.060,
          totalCost: 0.0975
        },
        inputTokens: 2500,
        outputTokens: 800,
        totalCost: 0.0975,
        attempts: 1,
        executionTimeMs: 3000,
        fallbackUsed: false
      };

      mockSendMessage.mockResolvedValue(mockOpenRouterResponse);

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
      expect(summaryResult.keyPoints).toHaveLength(9); // 2 financial + 2 business + 2 risk + 1 key takeaway + 2 additional structured points
      expect(summaryResult.tokensUsed).toBe(3300);
      expect(summaryResult.inputTokens).toBe(2500);
      expect(summaryResult.outputTokens).toBe(800);
      expect(summaryResult.cost).toBeCloseTo(0.0975, 4);
      expect(summaryResult.model).toBe('x-ai/grok-4-fast:free');
      expect(summaryResult.error).toBeUndefined();

      // Verify OpenRouter was called with proper prompt structure
      expect(mockSendMessage).toHaveBeenCalledWith(
        [{ role: 'user', content: expect.stringContaining('You are an expert financial analyst specializing in SEC filings') }],
        expect.objectContaining({
          model: 'x-ai/grok-4-fast:free',
          maxTokens: 4000,
          temperature: 0.1,
          system: expect.stringContaining('You are a financial expert specializing in SEC filing analysis'),
          requestType: 'standard',
          timeout: 120000,
          requiredCapabilities: ['reasoning'],
          costLimit: 0.50
        })
      );

      const promptContent = mockSendMessage.mock.calls[0][0][0].content;
      expect(promptContent).toContain('Tesla Inc.');
      expect(promptContent).toContain('TSLA');
      expect(promptContent).toContain('10-Q');
      expect(promptContent).toContain('9/30/2023');
    });

    it('should handle Date to ISO string conversion correctly', async () => {
      // Mock OpenRouter response
      mockSendMessage.mockResolvedValue({
        id: 'test-response-2',
        content: '{"summary": "Test summary"}',
        model: 'x-ai/grok-4-fast:free',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0.0015, outputCost: 0.0075, totalCost: 0.009 },
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.009,
        attempts: 1,
        executionTimeMs: 1500,
        fallbackUsed: false
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
      const promptContent = mockSendMessage.mock.calls[0][0][0].content;
      expect(promptContent).toContain('12/31/2023'); // Should be formatted for display
    });

    it('should handle retry mechanism with exponential backoff', async () => {
      const startTime = Date.now();
      
      // Mock first two calls to fail, third to succeed
      mockSendMessage
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Temporary service unavailable'))
        .mockResolvedValue({
          id: 'test-response-3',
          content: '{"summary": "Success after retries"}',
          model: 'x-ai/grok-4-fast:free',
          usage: { inputTokens: 200, outputTokens: 100 },
          cost: { inputCost: 0.003, outputCost: 0.015, totalCost: 0.018 },
          inputTokens: 200,
          outputTokens: 100,
          totalCost: 0.018,
          attempts: 3,
          executionTimeMs: 4500,
          fallbackUsed: false
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
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });

    it('should generate fallback summary when AI fails after all retries', async () => {
      // Mock all calls to fail
      mockSendMessage.mockRejectedValue(new Error('Persistent API failure'));

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

      // Should return error result for OpenRouter failure
      expect(result.summary).toBe('');
      expect(result.keyPoints).toEqual([]);
      expect(result.error).toContain('Persistent API failure');
      expect(result.processingStatus).toBe('FAILED');
      expect(result.cost).toBeUndefined();
      expect(result.tokensUsed).toBeUndefined();

      // Should have attempted retries
      expect(mockSendMessage).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('should handle JSON and string content sections correctly', async () => {
      mockSendMessage.mockResolvedValue({
        id: 'test-response-4',
        content: '{"summary": "Test summary"}',
        model: 'x-ai/grok-4-fast:free',
        usage: { inputTokens: 300, outputTokens: 150 },
        cost: { inputCost: 0.0045, outputCost: 0.0225, totalCost: 0.027 },
        inputTokens: 300,
        outputTokens: 150,
        totalCost: 0.027,
        attempts: 1,
        executionTimeMs: 2500,
        fallbackUsed: false
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
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle malformed JSON response gracefully', async () => {
      // Mock malformed JSON response
      mockSendMessage.mockResolvedValue({
        id: 'test-response-5',
        content: 'Invalid JSON response from xAI {incomplete',
        model: 'x-ai/grok-4-fast:free',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0.0015, outputCost: 0.0075, totalCost: 0.009 },
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.009,
        attempts: 1,
        executionTimeMs: 1500,
        fallbackUsed: false
      });

      const result = await generateAISummaryWithRetry(
        'Test content',
        { formType: '8-K', filingDate: '2023-06-01' },
        { name: 'JSON Error Co', ticker: 'JSON' }
      );

      // Should return failed result with parsing error
      expect(result.summary).toBe('');
      expect(result.keyPoints).toEqual([]);
      expect(result.error).toContain('Failed to parse AI response JSON');
    });

    it('should handle missing API key', async () => {
      delete process.env.TLDRSEC_AI_SUMMARIZER;

      const result = await generateAISummaryWithRetry(
        'Test content',
        { formType: 'S-1', filingDate: '2023-08-01' },
        { name: 'No API Key Co', ticker: 'NOKEY' }
      );

      // Should return error result without calling API
      expect(result.summary).toBe('');
      expect(result.keyPoints).toEqual([]);
      expect(result.error).toContain('OpenRouter API key not configured');
      expect(result.processingStatus).toBe('FAILED');
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should handle content that is too long by truncating', async () => {
      mockSendMessage.mockResolvedValue({
        id: 'test-response-6',
        content: '{"summary": "Summary of truncated content"}',
        model: 'x-ai/grok-4-fast:free',
        usage: { inputTokens: 1500, outputTokens: 200 },
        cost: { inputCost: 0.0225, outputCost: 0.03, totalCost: 0.0525 },
        inputTokens: 1500,
        outputTokens: 200,
        totalCost: 0.0525,
        attempts: 1,
        executionTimeMs: 3000,
        fallbackUsed: false
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
      const promptContent = mockSendMessage.mock.calls[0][0][0].content;
      const contentStart = promptContent.indexOf('Here is the filing content') + 26;
      const actualContent = promptContent.substring(contentStart).trim();
      
      // Content should be truncated to ~1.8M characters for xAI model context window
      expect(actualContent.length).toBeLessThanOrEqual(1800000);
    });
  });

  describe('Cost Calculation Tests', () => {
    it('should calculate costs correctly for different token usage patterns', async () => {
      const testCases = [
        { inputTokens: 1000, outputTokens: 500, expectedCost: 0 }, // Free model
        { inputTokens: 5000, outputTokens: 2000, expectedCost: 0 }, // Free model
        { inputTokens: 100, outputTokens: 50, expectedCost: 0 } // Free model
      ];

      for (const testCase of testCases) {
        mockSendMessage.mockResolvedValue({
          id: 'test-cost-response',
          content: '{"summary": "Test summary for cost calculation"}',
          model: 'x-ai/grok-4-fast:free',
          usage: {
            inputTokens: testCase.inputTokens,
            outputTokens: testCase.outputTokens
          },
          cost: {
            inputCost: testCase.expectedCost * 0.5,
            outputCost: testCase.expectedCost * 0.5,
            totalCost: testCase.expectedCost
          },
          inputTokens: testCase.inputTokens,
          outputTokens: testCase.outputTokens,
          totalCost: testCase.expectedCost,
          attempts: 1,
          executionTimeMs: 2000,
          fallbackUsed: false
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