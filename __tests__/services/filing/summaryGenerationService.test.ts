import { jest } from '@jest/globals';
import { generateAISummary, generateAISummaryWithRetry } from '../../../services/filing/summaryGenerationService';
import { SECFiling, Company, SummaryGenerationResult } from '../../../services/filing/types';

// Mock dependencies
jest.mock('@anthropic-ai/sdk');
jest.mock('../../../lib/logging', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

const mockGenerateFallbackSummary = jest.fn();
jest.mock('../../../services/filing/fallbackSummary', () => ({
  generateFallbackSummary: mockGenerateFallbackSummary
}));

// Mock Anthropic SDK
const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockAnthropicCreate
      }
    }))
  };
});

describe('AI Summary Generation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set default mock for fallback summary
    mockGenerateFallbackSummary.mockReturnValue('Fallback summary for test filing');
    
    // Set environment variable for API key
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  const mockFiling: SECFiling = {
    formType: '10-K',
    filingDate: '2023-12-31',
    accessionNumber: '0001234567-23-000001',
    cik: '0001234567'
  };

  const mockCompany: Company = {
    name: 'Test Company Inc.',
    ticker: 'TEST',
    cik: '0001234567'
  };

  const mockContent = 'This is test filing content containing financial information and business updates.';

  describe('generateAISummary', () => {
    it('should successfully generate AI summary with valid JSON response', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            summary: 'Test company reported strong quarterly results.',
            financialHighlights: [
              { metric: 'Revenue', value: '$100M', yearOverYearChange: '+10%' },
              { metric: 'Net Income', value: '$20M', yearOverYearChange: '+15%' }
            ],
            businessHighlights: [
              { detail: 'Expanded into new markets' },
              { detail: 'Launched new product line' }
            ],
            riskFactors: [
              { description: 'Market volatility concerns' },
              { description: 'Supply chain disruptions' }
            ],
            keyTakeaway: 'Strong financial performance with strategic growth initiatives.'
          })
        }],
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await generateAISummary(mockContent, mockFiling, mockCompany);

      expect(result).toEqual({
        summary: 'Test company reported strong quarterly results.',
        keyPoints: [
          'Revenue: $100M (+10%)',
          'Net Income: $20M (+15%)',
          'Expanded into new markets',
          'Launched new product line',
          'Market volatility concerns',
          'Supply chain disruptions',
          'Strong financial performance with strategic growth initiatives.'
        ],
        tokensUsed: 1500,
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-3-opus-20240229',
        cost: 0.0525 // (1000/1M * 15) + (500/1M * 75)
      });

      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        temperature: 0.2,
        system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, concise summaries in valid JSON format.',
        messages: [
          { 
            role: 'user', 
            content: expect.stringContaining('You are an expert financial analyst') 
          }
        ]
      });
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const jsonResponse = {
        summary: 'Test summary in markdown',
        financialHighlights: [],
        businessHighlights: [],
        riskFactors: [],
        keyTakeaway: 'Key insight from markdown'
      };

      const mockResponse = {
        content: [{
          text: '```json\n' + JSON.stringify(jsonResponse) + '\n```'
        }],
        usage: {
          input_tokens: 800,
          output_tokens: 400
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await generateAISummary(mockContent, mockFiling, mockCompany);

      expect(result.summary).toBe('Test summary in markdown');
      expect(result.keyPoints).toContain('Key insight from markdown');
    });

    it('should generate fallback summary when API key is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await generateAISummary(mockContent, mockFiling, mockCompany);

      expect(result.summary).toBe('Fallback summary for test filing');
      expect(result.keyPoints).toEqual([
        'This is a 10-K filing for Test Company Inc. (TEST).',
        'AI-powered summary generation failed. This is a fallback summary.',
        'Please review the original filing for complete details.'
      ]);
      expect(result.error).toBe('ANTHROPIC_API_KEY not set');
      expect(mockGenerateFallbackSummary).toHaveBeenCalledWith(mockFiling, mockCompany, '10-K');
    });

    it('should generate fallback summary when Anthropic API fails', async () => {
      const apiError = new Error('API rate limit exceeded');
      mockAnthropicCreate.mockRejectedValue(apiError);

      const result = await generateAISummary(mockContent, mockFiling, mockCompany);

      expect(result.summary).toBe('Fallback summary for test filing');
      expect(result.error).toBe('API rate limit exceeded');
      expect(mockGenerateFallbackSummary).toHaveBeenCalled();
    });

    it('should generate fallback summary when JSON parsing fails', async () => {
      const mockResponse = {
        content: [{
          text: 'Invalid JSON response from Claude'
        }],
        usage: {
          input_tokens: 500,
          output_tokens: 200
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await generateAISummary(mockContent, mockFiling, mockCompany);

      expect(result.summary).toBe('Fallback summary for test filing');
      expect(result.error).toBe('Failed to parse AI summary response');
    });

    it('should handle partial or missing JSON fields gracefully', async () => {
      const partialJsonResponse = {
        summary: 'Partial summary data',
        // Missing some expected fields
        keyTakeaway: 'Main insight'
      };

      const mockResponse = {
        content: [{
          text: JSON.stringify(partialJsonResponse)
        }],
        usage: {
          input_tokens: 600,
          output_tokens: 300
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await generateAISummary(mockContent, mockFiling, mockCompany);

      expect(result.summary).toBe('Partial summary data');
      expect(result.keyPoints).toEqual(['Main insight']);
      expect(result.tokensUsed).toBe(900);
      expect(result.cost).toBeCloseTo(0.0315); // (600/1M * 15) + (300/1M * 75)
    });

    it('should truncate content to 32000 characters in prompt', async () => {
      const longContent = 'A'.repeat(50000); // Content longer than 32k chars
      
      const mockResponse = {
        content: [{
          text: JSON.stringify({ summary: 'Summary of truncated content' })
        }],
        usage: {
          input_tokens: 1200,
          output_tokens: 100
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      await generateAISummary(longContent, mockFiling, mockCompany);

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      const promptContent = callArgs.messages[0].content;
      
      // The content should be truncated to 32000 characters in the prompt
      const contentInPrompt = promptContent.substring(promptContent.indexOf('Here is the filing content:') + 27);
      expect(contentInPrompt.length).toBeLessThanOrEqual(32000);
    });
  });

  describe('generateAISummaryWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            summary: 'Success on first try',
            keyTakeaway: 'No retries needed'
          })
        }],
        usage: {
          input_tokens: 500,
          output_tokens: 200
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await generateAISummaryWithRetry(mockContent, mockFiling, mockCompany, 2);

      expect(result.summary).toBe('Success on first try');
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const failureResponse = new Error('Temporary API error');
      const successResponse = {
        content: [{
          text: JSON.stringify({
            summary: 'Success after retry',
            keyTakeaway: 'Retry worked'
          })
        }],
        usage: {
          input_tokens: 600,
          output_tokens: 250
        }
      };

      mockAnthropicCreate
        .mockRejectedValueOnce(failureResponse)
        .mockResolvedValue(successResponse);

      const result = await generateAISummaryWithRetry(mockContent, mockFiling, mockCompany, 2);

      expect(result.summary).toBe('Success after retry');
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
    });

    it('should generate fallback after all retries fail', async () => {
      const apiError = new Error('Persistent API failure');
      mockAnthropicCreate.mockRejectedValue(apiError);

      const result = await generateAISummaryWithRetry(mockContent, mockFiling, mockCompany, 2);

      expect(result.summary).toBe('Fallback summary for test filing');
      expect(result.error).toBe('Persistent API failure');
      expect(result.keyPoints).toContain('AI-powered summary generation failed after multiple attempts. This is a fallback summary.');
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should use exponential backoff between retries', async () => {
      const startTime = Date.now();
      const apiError = new Error('Rate limit error');
      mockAnthropicCreate.mockRejectedValue(apiError);

      await generateAISummaryWithRetry(mockContent, mockFiling, mockCompany, 2);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 2s (first retry) + 4s (second retry) = 6s for exponential backoff
      expect(duration).toBeGreaterThan(6000);
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(3);
    });

    it('should handle different company/filing formats', async () => {
      const filingWithoutType: SECFiling = {
        filingDate: '2023-06-30'
      };
      
      const companyWithoutName: Company = {
        ticker: 'UNK'
      };

      const mockResponse = {
        content: [{
          text: JSON.stringify({
            summary: 'Summary for unknown company',
          })
        }],
        usage: {
          input_tokens: 400,
          output_tokens: 150
        }
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await generateAISummaryWithRetry(mockContent, filingWithoutType, companyWithoutName, 1);

      expect(result.summary).toBe('Summary for unknown company');
      
      // Verify the prompt was generated with fallback values
      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      const promptContent = callArgs.messages[0].content;
      expect(promptContent).toContain('Unknown Company');
      expect(promptContent).toContain('UNKNOWN');
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate correct costs for different token counts', async () => {
      const testCases = [
        { input: 1000, output: 500, expectedCost: 0.0525 },
        { input: 2000, output: 1000, expectedCost: 0.105 },
        { input: 500, output: 250, expectedCost: 0.02625 }
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          content: [{
            text: JSON.stringify({ summary: 'Test summary' })
          }],
          usage: {
            input_tokens: testCase.input,
            output_tokens: testCase.output
          }
        };

        mockAnthropicCreate.mockResolvedValue(mockResponse);

        const result = await generateAISummary(mockContent, mockFiling, mockCompany);

        expect(result.cost).toBeCloseTo(testCase.expectedCost, 4);
        expect(result.inputTokens).toBe(testCase.input);
        expect(result.outputTokens).toBe(testCase.output);
        expect(result.tokensUsed).toBe(testCase.input + testCase.output);

        jest.clearAllMocks();
      }
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed API response structure', async () => {
      const malformedResponse = {
        content: [], // Empty content array
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      };

      mockAnthropicCreate.mockResolvedValue(malformedResponse);

      const result = await generateAISummary(mockContent, mockFiling, mockCompany);

      expect(result.summary).toBe('Fallback summary for test filing');
      expect(result.error).toBeDefined();
    });

    it('should handle missing usage information', async () => {
      const responseWithoutUsage = {
        content: [{
          text: JSON.stringify({ summary: 'Test summary' })
        }]
        // Missing usage field
      };

      mockAnthropicCreate.mockResolvedValue(responseWithoutUsage);

      await expect(generateAISummary(mockContent, mockFiling, mockCompany))
        .rejects.toThrow();
    });

    it('should handle non-Error objects in retry logic', async () => {
      mockAnthropicCreate.mockRejectedValue('String error message');

      const result = await generateAISummaryWithRetry(mockContent, mockFiling, mockCompany, 1);

      expect(result.summary).toBe('Fallback summary for test filing');
      expect(result.error).toBe('String error message');
    });
  });
});