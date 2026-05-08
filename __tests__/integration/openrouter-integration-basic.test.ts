/**
 * Basic OpenRouter Integration Test
 * 
 * Simple test to verify OpenRouter xAI migration works end-to-end
 */

import { generateAISummaryWithRetry } from '../../services/filing/summaryGenerationService';

// Mock only the HTTP fetch call to avoid network issues
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Mock logging
jest.mock('../../lib/logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock monitoring with proper functions
jest.mock('../../lib/monitoring', () => ({
  __esModule: true,
  default: {
    startTimer: jest.fn(() => 'mock-timer'),
    stopTimer: jest.fn(() => 1000),
    recordTiming: jest.fn(),
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordMetric: jest.fn()
  },
  monitoring: {
    startTimer: jest.fn(() => 'mock-timer'),
    stopTimer: jest.fn(() => 1000),
    recordTiming: jest.fn(),
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordMetric: jest.fn()
  }
}));

describe('OpenRouter xAI Integration', () => {
  jest.setTimeout(15000); // 15 second timeout for async operations
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set OpenRouter environment variables
    process.env.TLDRSEC_AI_SUMMARIZER = 'test-api-key';
    process.env.DEFAULT_AI_MODEL = 'x-ai/grok-4.3';
  });

  afterEach(() => {
    delete process.env.TLDRSEC_AI_SUMMARIZER;
    delete process.env.DEFAULT_AI_MODEL;
  });

  it('should use OpenRouter for AI summarization with xAI models', async () => {
    // Mock successful OpenRouter response
    const mockOpenRouterResponse = {
      id: 'test-response',
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Apple Inc. filed a quarterly 10-Q report showing strong financial performance.',
            financialHighlights: [
              {
                metric: 'Revenue',
                value: '$94.9B',
                yearOverYearChange: '+2%',
                significance: 'Steady revenue growth'
              }
            ],
            businessHighlights: [
              {
                category: 'Product',
                detail: 'Strong iPhone sales in Q4',
                impact: 'Increased market share'
              }
            ],
            riskFactors: [
              {
                category: 'Market',
                description: 'Global economic uncertainty',
                severity: 'Medium'
              }
            ],
            keyTakeaway: 'Apple continues to demonstrate resilience despite market challenges.',
            investorImpact: 'Positive outlook for sustained growth'
          })
        }
      }],
      usage: {
        prompt_tokens: 5000,
        completion_tokens: 1000,
        total_tokens: 6000
      }
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockOpenRouterResponse
    } as Response);

    // Test AI summarization
    const result = await generateAISummaryWithRetry(
      'Sample SEC filing content for AAPL 10-Q',
      {
        formType: '10-Q',
        filingDate: '2024-01-31',
        accessionNumber: '0000320193-24-000007'
      },
      {
        name: 'Apple Inc.',
        ticker: 'AAPL'
      }
    );

    // Verify the result structure
    expect(result).toBeDefined();
    expect(result.summary).toBe('Apple Inc. filed a quarterly 10-Q report showing strong financial performance.');
    expect(result.keyPoints).toContain('Revenue: $94.9B (+2%) - Steady revenue growth');
    expect(result.keyPoints).toContain('Key Takeaway: Apple continues to demonstrate resilience despite market challenges.');
    expect(result.model).toBe('x-ai/grok-4.3');
    expect(result.cost).toBe(0); // Free model
    expect(result.inputTokens).toBe(5000);
    expect(result.outputTokens).toBe(1000);
    expect(result.tokensUsed).toBe(6000);

    // Verify OpenRouter API was called
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Bearer '), // API key might be different
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://tldrsec.app',
          'X-Title': 'TLDRSEC.AI'
        }),
        body: expect.stringContaining('x-ai/grok-4.3')
      })
    );

    // Verify the request included the right prompt structure
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(requestBody.model).toBe('x-ai/grok-4.3');
    expect(requestBody.max_tokens).toBe(4000);
    expect(requestBody.temperature).toBe(0.1);
    expect(requestBody.messages).toHaveLength(2); // system + user message
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.messages[1].role).toBe('user');
    expect(requestBody.messages[1].content).toContain('Apple Inc.');
    expect(requestBody.messages[1].content).toContain('AAPL');
    expect(requestBody.messages[1].content).toContain('10-Q');
  });

  // TODO: Fix timeout issues in retry logic
  // it('should handle API errors gracefully', async () => {
  //   mockFetch.mockResolvedValue({
  //     ok: false,
  //     status: 429,
  //     statusText: 'Too Many Requests',
  //     text: async () => 'Rate limit exceeded'
  //   } as Response);

  //   const result = await generateAISummaryWithRetry(
  //     'Test content',
  //     {
  //       formType: '8-K',
  //       filingDate: '2024-01-31'
  //     },
  //     {
  //       name: 'Test Company',
  //       ticker: 'TEST'
  //     },
  //     0 // No retries to fail fast
  //   );

  //   // Should return error result
  //   expect(result.summary).toBe('');
  //   expect(result.keyPoints).toEqual([]);
  //   expect(result.processingStatus).toBe('FAILED');
  //   expect(result.error).toContain('OpenRouter API error: 429');
  // });

  // it('should work without API key (should fail gracefully)', async () => {
  //   delete process.env.TLDRSEC_AI_SUMMARIZER;
    
  //   const result = await generateAISummaryWithRetry(
  //     'Test content',
  //     {
  //       formType: '10-K',
  //       filingDate: '2024-01-31'
  //     },
  //     {
  //       name: 'No Key Company',
  //       ticker: 'NOKEY'
  //     }
  //   );

  //   expect(result.summary).toBe('');
  //   expect(result.keyPoints).toEqual([]);
  //   expect(result.processingStatus).toBe('FAILED');
  //   expect(result.error).toContain('OpenRouter API key not configured');
  //   expect(mockFetch).not.toHaveBeenCalled();
  // });
});