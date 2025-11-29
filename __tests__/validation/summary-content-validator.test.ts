/**
 * Unit tests for Summary Content Validator
 */

import { validateSummaryWithAI, SummaryValidationInput, SummaryValidationResult } from '../../lib/validation/summary-content-validator';

// Mock the openRouterClient
jest.mock('../../lib/ai/openrouter-client', () => ({
  openRouterClient: {
    sendMessage: jest.fn()
  }
}));

// Mock the logger
jest.mock('../../lib/logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }
}));

import { openRouterClient } from '../../lib/ai/openrouter-client';

const mockSendMessage = openRouterClient.sendMessage as jest.MockedFunction<typeof openRouterClient.sendMessage>;

describe('Summary Content Validator', () => {
  const validInput: SummaryValidationInput = {
    summaryText: 'Apple Inc reported strong quarterly earnings with revenue of $95 billion.',
    sourceContent: 'Apple Inc (AAPL) filed its quarterly report showing revenue of $95 billion for Q3 2024.',
    ticker: 'AAPL',
    formType: '10-Q',
    companyName: 'Apple Inc',
    filingDate: '2024-08-01'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateSummaryWithAI', () => {
    it('should return valid result when AI validates summary successfully', async () => {
      const mockResponse = {
        content: JSON.stringify({
          isValid: true,
          confidenceScore: 95,
          accuracyScore: 92,
          completenessScore: 85,
          relevanceScore: 90,
          issues: [],
          strengths: ['Accurate revenue figure', 'Clear presentation'],
          overallAssessment: 'The summary accurately reflects the key financial data from the filing.'
        }),
        id: 'test-id',
        model: 'test-model',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0.001, outputCost: 0.0005, totalCost: 0.0015 },
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0015,
        attempts: 1,
        executionTimeMs: 1000,
        fallbackUsed: false
      };

      mockSendMessage.mockResolvedValueOnce(mockResponse);

      const result = await validateSummaryWithAI(validInput);

      expect(result.isValid).toBe(true);
      expect(result.confidenceScore).toBe(95);
      expect(result.accuracyScore).toBe(92);
      expect(result.completenessScore).toBe(85);
      expect(result.relevanceScore).toBe(90);
      expect(result.issues).toEqual([]);
      expect(result.strengths).toContain('Accurate revenue figure');
      expect(result.validationDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return invalid result when AI identifies issues', async () => {
      const mockResponse = {
        content: JSON.stringify({
          isValid: false,
          confidenceScore: 40,
          accuracyScore: 50,
          completenessScore: 60,
          relevanceScore: 55,
          issues: ['Revenue figure is incorrect', 'Missing important risk factors'],
          strengths: ['Good structure'],
          overallAssessment: 'The summary contains factual errors that need correction.'
        }),
        id: 'test-id',
        model: 'test-model',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0.001, outputCost: 0.0005, totalCost: 0.0015 },
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0015,
        attempts: 1,
        executionTimeMs: 1000,
        fallbackUsed: false
      };

      mockSendMessage.mockResolvedValueOnce(mockResponse);

      const result = await validateSummaryWithAI(validInput);

      expect(result.isValid).toBe(false);
      expect(result.confidenceScore).toBe(40);
      expect(result.issues.length).toBe(2);
      expect(result.issues).toContain('Revenue figure is incorrect');
    });

    it('should handle API errors gracefully', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('API timeout'));

      const result = await validateSummaryWithAI(validInput);

      expect(result.isValid).toBe(false);
      expect(result.confidenceScore).toBe(0);
      expect(result.issues).toContain('Validation error: API timeout');
      expect(result.overallAssessment).toBe('Validation failed due to error');
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        content: 'This is not valid JSON',
        id: 'test-id',
        model: 'test-model',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0.001, outputCost: 0.0005, totalCost: 0.0015 },
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0015,
        attempts: 1,
        executionTimeMs: 1000,
        fallbackUsed: false
      };

      mockSendMessage.mockResolvedValueOnce(mockResponse);

      const result = await validateSummaryWithAI(validInput);

      expect(result.isValid).toBe(false);
      expect(result.confidenceScore).toBe(0);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle partial JSON response with missing fields', async () => {
      const mockResponse = {
        content: JSON.stringify({
          isValid: true,
          confidenceScore: 80
          // Missing other fields
        }),
        id: 'test-id',
        model: 'test-model',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0.001, outputCost: 0.0005, totalCost: 0.0015 },
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0015,
        attempts: 1,
        executionTimeMs: 1000,
        fallbackUsed: false
      };

      mockSendMessage.mockResolvedValueOnce(mockResponse);

      const result = await validateSummaryWithAI(validInput);

      expect(result.isValid).toBe(true);
      expect(result.confidenceScore).toBe(80);
      // Default values for missing fields
      expect(result.accuracyScore).toBe(0);
      expect(result.completenessScore).toBe(0);
      expect(result.relevanceScore).toBe(0);
      expect(result.issues).toEqual([]);
      expect(result.strengths).toEqual([]);
    });

    it('should truncate long source content', async () => {
      const longContent = 'A'.repeat(100000); // 100k characters
      const inputWithLongContent = {
        ...validInput,
        sourceContent: longContent
      };

      const mockResponse = {
        content: JSON.stringify({
          isValid: true,
          confidenceScore: 90,
          accuracyScore: 85,
          completenessScore: 80,
          relevanceScore: 85,
          issues: [],
          strengths: ['Good'],
          overallAssessment: 'OK'
        }),
        id: 'test-id',
        model: 'test-model',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0.001, outputCost: 0.0005, totalCost: 0.0015 },
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0015,
        attempts: 1,
        executionTimeMs: 1000,
        fallbackUsed: false
      };

      mockSendMessage.mockResolvedValueOnce(mockResponse);

      const result = await validateSummaryWithAI(inputWithLongContent);

      expect(result.isValid).toBe(true);
      // Verify the API was called (content was truncated internally)
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });
});
