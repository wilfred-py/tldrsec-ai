/**
 * Tests for the robust Claude client implementation
 * Validates retry mechanisms, error handling, and fallback strategies
 */

import { jest } from '@jest/globals';
import { RobustClaudeClient } from '../robust-claude-client';
import { ClaudeClient, ClaudeMessage } from '../claude-client';
import { ApiError, ErrorCode } from '../../error-handling';
import { monitoring } from '../../monitoring';
import { generateFallbackSummary } from '../fallback-summary';

// Mock dependencies
jest.mock('../claude-client');
jest.mock('../../logging');
jest.mock('../../monitoring');
jest.mock('../fallback-summary');

describe('RobustClaudeClient', () => {
  let mockClaudeClient: jest.Mocked<ClaudeClient>;
  let client: RobustClaudeClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock Claude client
    mockClaudeClient = {
      sendMessage: jest.fn(),
      completeChat: jest.fn(),
      normalizeError: jest.fn(),
      getUsage: jest.fn(),
      resetUsage: jest.fn()
    } as unknown as jest.Mocked<ClaudeClient>;
    
    // Create a new client with the mock
    client = new RobustClaudeClient(mockClaudeClient);
    
    // Mock monitoring functions
    (monitoring.incrementCounter as jest.Mock).mockImplementation(() => {});
    (monitoring.recordDuration as jest.Mock).mockImplementation(() => {});
    
    // Mock fallback summary generation
    (generateFallbackSummary as jest.Mock).mockImplementation((filingType, error) => ({
      summaryId: 'fallback-123',
      summaryText: 'This is a fallback summary',
      filingType,
      modelUsed: 'fallback-template',
      inputTokens: 100,
      outputTokens: 50,
      cost: 0,
      duration: 10,
      metadata: {
        fallbackReason: error.message,
        errorType: error instanceof ApiError ? error.code : 'UNKNOWN'
      },
      fallbackUsed: true
    }));
  });
  
  describe('sendMessage', () => {
    const testMessages: ClaudeMessage[] = [
      { role: 'user', content: 'Hello, Claude!' }
    ];
    
    const successResponse = {
      id: 'response-123',
      content: 'Hello, human!',
      model: 'claude-sonnet-4-20250514',
      usage: {
        inputTokens: 10,
        outputTokens: 20
      },
      inputTokens: 10,
      outputTokens: 20,
      cost: {
        inputCost: 0.00003,
        outputCost: 0.0003,
        totalCost: 0.00033
      },
      totalCost: 0.00033,
      attempts: 1,
      executionTimeMs: 1500,
      fallbackUsed: false
    };
    
    test('should successfully send a message', async () => {
      // Setup mock
      mockClaudeClient.sendMessage.mockResolvedValueOnce(successResponse);
      
      // Execute
      const result = await client.sendMessage(testMessages);
      
      // Verify
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        testMessages,
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514'
        })
      );
      expect(result).toEqual(successResponse);
      expect(monitoring.incrementCounter).toHaveBeenCalledWith(
        'ai.claude.requests',
        1,
        expect.any(Object)
      );
    });
    
    test('should retry on rate limit errors', async () => {
      // Setup mocks for rate limit error then success
      const rateLimitError = new ApiError(
        ErrorCode.QUOTA_EXCEEDED,
        'Rate limit exceeded',
        { retryAfter: 1000 },
        true,
        'req-123',
        1000
      );
      
      mockClaudeClient.sendMessage
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);
      
      // Execute
      const result = await client.sendMessage(testMessages, {
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 100 // Use small delay for tests
        }
      });
      
      // Verify
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledTimes(2);
      expect(result).toEqual(successResponse);
      expect(monitoring.incrementCounter).toHaveBeenCalledWith(
        'ai.claude.retries',
        1,
        expect.objectContaining({
          errorType: ErrorCode.QUOTA_EXCEEDED
        })
      );
    });
    
    test('should generate fallback on exhausted retries', async () => {
      // Setup mock to always fail with rate limit
      const rateLimitError = new ApiError(
        ErrorCode.QUOTA_EXCEEDED,
        'Rate limit exceeded',
        {},
        true,
        'req-123'
      );
      
      mockClaudeClient.sendMessage.mockRejectedValue(rateLimitError);
      
      // Execute
      const result = await client.sendMessage(testMessages, {
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 100
        }
      });
      
      // Verify
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result.fallbackUsed).toBe(true);
      expect(monitoring.incrementCounter).toHaveBeenCalledWith(
        'ai.claude.fallbacks',
        1,
        expect.any(Object)
      );
    });
    
    test('should throw error when fallback is disabled', async () => {
      // Setup mock to fail
      const networkError = new ApiError(
        ErrorCode.NETWORK_ERROR,
        'Network error',
        {},
        true,
        'req-123'
      );
      
      mockClaudeClient.sendMessage.mockRejectedValue(networkError);
      
      // Execute and verify
      await expect(client.sendMessage(testMessages, {
        useFallback: false,
        useAdaptiveRetry: false
      })).rejects.toThrow('Network error');
    });
  });
  
  describe('processDocument', () => {
    const testDocument = 'This is a test SEC filing document.';
    const filingType = 'FORM_4';
    
    test('should successfully process a document', async () => {
      // Setup mock
      mockClaudeClient.sendMessage.mockResolvedValueOnce({
        id: 'response-123',
        content: 'This is a comprehensive summary of the Form 4 filing. It includes details about the reporting person, transaction dates, and share amounts.',
        model: 'claude-sonnet-4-20250514',
        usage: {
          inputTokens: 50,
          outputTokens: 30
        },
        inputTokens: 50,
        outputTokens: 30,
        cost: {
          inputCost: 0.00015,
          outputCost: 0.00045,
          totalCost: 0.0006
        },
        totalCost: 0.0006,
        attempts: 1,
        executionTimeMs: 2000,
        fallbackUsed: false
      });
      
      // Execute
      const result = await client.processDocument(testDocument, filingType);
      
      // Verify
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(result.fallbackUsed).toBe(false);
      expect(result.summaryText).toContain('comprehensive summary');
      expect(result.filingType).toBe(filingType);
    });
    
    test('should generate fallback on incomplete summary', async () => {
      // Setup mock to return incomplete summary
      mockClaudeClient.sendMessage.mockResolvedValueOnce({
        id: 'response-123',
        content: 'I will analyze this Form 4...',
        model: 'claude-sonnet-4-20250514',
        usage: {
          inputTokens: 50,
          outputTokens: 10
        },
        inputTokens: 50,
        outputTokens: 10,
        cost: {
          inputCost: 0.00015,
          outputCost: 0.00015,
          totalCost: 0.0003
        },
        totalCost: 0.0003,
        attempts: 1,
        executionTimeMs: 1000,
        fallbackUsed: false
      });
      
      // Execute
      const result = await client.processDocument(testDocument, filingType);
      
      // Verify
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(generateFallbackSummary).toHaveBeenCalledTimes(1);
      expect(result.fallbackUsed).toBe(true);
    });
    
    test('should generate fallback on error', async () => {
      // Setup mock to fail
      const contextWindowError = new ApiError(
        ErrorCode.CONTEXT_WINDOW_EXCEEDED,
        'Context window exceeded',
        {},
        false,
        'req-123'
      );
      
      mockClaudeClient.sendMessage.mockRejectedValue(contextWindowError);
      
      // Execute
      const result = await client.processDocument(testDocument, filingType);
      
      // Verify
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(generateFallbackSummary).toHaveBeenCalledTimes(1);
      expect(generateFallbackSummary).toHaveBeenCalledWith(
        filingType,
        contextWindowError,
        testDocument,
        expect.any(Object)
      );
      expect(result.fallbackUsed).toBe(true);
    });
  });
});
