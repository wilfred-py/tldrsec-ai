/**
 * Comprehensive tests for Enhanced Claude Client
 * Tests core functionality, streaming, batch processing, error recovery, and caching
 */

import { EnhancedClaudeClient, EnhancedClaudeOptions } from '../../lib/ai/enhanced-claude-client';
import { OpenRouterMessage, OpenRouterResponse } from '../../lib/ai/openrouter-client';
import { summaryCache } from '../../lib/ai/cache/summary-cache';
import { batchProcessor } from '../../lib/ai/batch/batch-processor';
import { ApiError, ErrorCode } from '../../lib/error-handling';

// Mock dependencies
jest.mock('../../lib/ai/openrouter-client');
jest.mock('../../lib/ai/cache/summary-cache');
jest.mock('../../lib/ai/batch/batch-processor');
jest.mock('../../lib/ai/streaming/stream-handler');
jest.mock('../../lib/ai/chunking/enhanced-chunker');
jest.mock('../../lib/ai/config', () => ({
  getClaudeModel: jest.fn(() => 'claude-3-haiku-20240307')
}));
jest.mock('../../lib/logging');
jest.mock('../../lib/monitoring');
jest.mock('../../lib/ai/fallback-summary');

describe('Enhanced Claude Client Core Functionality', () => {
  let client: EnhancedClaudeClient;
  let mockMessages: OpenRouterMessage[];
  let mockResponse: OpenRouterResponse;

  beforeEach(() => {
    client = new EnhancedClaudeClient();
    
    mockMessages = [
      { role: 'user', content: 'Test message for SEC filing analysis' }
    ];
    
    mockResponse = {
      id: 'test-response-id',
      content: 'Test response content',
      model: 'claude-3-haiku-20240307',
      usage: { inputTokens: 100, outputTokens: 50 },
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.001,
      totalCost: 0.001,
      attempts: 1,
      executionTimeMs: 250,
      fromCache: false
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Message Sending', () => {
    test('should send message with default options', async () => {
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn().mockResolvedValue(mockResponse);
      
      const result = await client.sendMessage(mockMessages);
      
      expect(result).toEqual(mockResponse);
      expect(mockOpenRouterClient.openRouterClient.sendMessage).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          model: 'claude-3-haiku-20240307',
          maxTokens: 4000,
          temperature: 0.3
        })
      );
    });

    test('should merge custom options with defaults', async () => {
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn().mockResolvedValue(mockResponse);
      
      const customOptions: EnhancedClaudeOptions = {
        model: 'claude-3-sonnet-20240307',
        maxTokens: 8000,
        temperature: 0.5,
        useCache: false
      };
      
      await client.sendMessage(mockMessages, customOptions);
      
      expect(mockOpenRouterClient.openRouterClient.sendMessage).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          model: 'claude-3-sonnet-20240307',
          maxTokens: 8000,
          temperature: 0.5
        })
      );
    });
  });

  describe('Caching Functionality', () => {
    test('should return cached response when available', async () => {
      const cachedResponse = {
        id: 'cached-id',
        content: 'Cached response content',
        model: 'claude-3-haiku-20240307',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.001
      };

      (summaryCache.checkCache as jest.Mock).mockResolvedValue(cachedResponse);
      
      const result = await client.sendMessage(mockMessages, { useCache: true });
      
      expect(result.fromCache).toBe(true);
      expect(result.content).toBe(cachedResponse.content);
      expect(result.executionTimeMs).toBe(0);
      expect(summaryCache.checkCache).toHaveBeenCalled();
    });

    test('should fetch new response when cache miss', async () => {
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn().mockResolvedValue(mockResponse);
      
      (summaryCache.checkCache as jest.Mock).mockResolvedValue(null);
      (summaryCache.storeCache as jest.Mock).mockResolvedValue(undefined);
      
      const result = await client.sendMessage(mockMessages, { useCache: true });
      
      expect(result.fromCache).toBe(false);
      expect(summaryCache.checkCache).toHaveBeenCalled();
      expect(summaryCache.storeCache).toHaveBeenCalled();
      expect(mockOpenRouterClient.openRouterClient.sendMessage).toHaveBeenCalled();
    });

    test('should skip caching when disabled', async () => {
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn().mockResolvedValue(mockResponse);
      
      await client.sendMessage(mockMessages, { useCache: false });
      
      expect(summaryCache.checkCache).not.toHaveBeenCalled();
      expect(summaryCache.storeCache).not.toHaveBeenCalled();
    });
  });

  describe('Streaming Functionality', () => {
    test('should handle streaming response', async () => {
      const mockStreamHandler = {
        handleStream: jest.fn().mockResolvedValue(mockResponse)
      };
      
      const result = await client.sendMessage(mockMessages, {
        useStreaming: true,
        streamHandler: mockStreamHandler
      });
      
      expect(result).toEqual(mockResponse);
      expect(mockStreamHandler.handleStream).toHaveBeenCalled();
    });

    test('should handle streaming failures gracefully', async () => {
      const mockStreamHandler = {
        handleStream: jest.fn().mockRejectedValue(new Error('Stream failed'))
      };
      
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn().mockResolvedValue({
        ...mockResponse,
        content: 'Fallback response after stream failure'
      });
      
      const result = await client.sendMessage(mockMessages, {
        useStreaming: true,
        streamHandler: mockStreamHandler,
        useFallback: true
      });
      
      expect(result.content).toContain('Fallback response');
      expect(mockStreamHandler.handleStream).toHaveBeenCalled();
      expect(mockOpenRouterClient.openRouterClient.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple messages in batch', async () => {
      const batchMessages = [
        [{ role: 'user', content: 'Message 1' }] as OpenRouterMessage[],
        [{ role: 'user', content: 'Message 2' }] as OpenRouterMessage[]
      ];
      
      const batchResponses = [
        { ...mockResponse, id: 'batch-1', content: 'Response 1' },
        { ...mockResponse, id: 'batch-2', content: 'Response 2' }
      ];
      
      (batchProcessor.processBatch as jest.Mock).mockResolvedValue({
        successes: batchResponses,
        errors: []
      });
      
      const result = await client.processBatch(batchMessages);
      
      expect(result.successes).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(batchProcessor.processBatch).toHaveBeenCalled();
    });

    test('should handle batch processing with mixed success/failure', async () => {
      const batchMessages = [
        [{ role: 'user', content: 'Valid message' }] as OpenRouterMessage[],
        [{ role: 'user', content: 'Invalid message' }] as OpenRouterMessage[]
      ];
      
      const batchResult = {
        successes: [{ ...mockResponse, content: 'Valid response' }],
        errors: [new ApiError('Processing failed', ErrorCode.AI_ERROR)]
      };
      
      (batchProcessor.processBatch as jest.Mock).mockResolvedValue(batchResult);
      
      const result = await client.processBatch(batchMessages);
      
      expect(result.successes).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(ApiError);
    });
  });

  describe('Error Recovery', () => {
    test('should retry failed requests when retry enabled', async () => {
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      
      // First call fails, second succeeds
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse);
      
      const result = await client.sendMessage(mockMessages, {
        useRetry: true,
        retryConfig: { maxAttempts: 2, baseDelayMs: 100 }
      });
      
      expect(result).toEqual(mockResponse);
      expect(mockOpenRouterClient.openRouterClient.sendMessage).toHaveBeenCalledTimes(2);
    });

    test('should use fallback when all retries exhausted', async () => {
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      const mockFallback = require('../../lib/ai/fallback-summary');
      
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn()
        .mockRejectedValue(new Error('Persistent failure'));
      
      mockFallback.generateFallbackSummary = jest.fn().mockResolvedValue({
        ...mockResponse,
        content: 'Fallback summary due to API failure'
      });
      
      const result = await client.sendMessage(mockMessages, {
        useRetry: true,
        useFallback: true,
        retryConfig: { maxAttempts: 1 }
      });
      
      expect(result.content).toContain('Fallback summary');
      expect(mockFallback.generateFallbackSummary).toHaveBeenCalled();
    });
  });

  describe('Token Estimation', () => {
    test('should estimate input tokens correctly', async () => {
      const longMessages: OpenRouterMessage[] = [
        { 
          role: 'user', 
          content: 'This is a longer message with more content to test token estimation. '.repeat(10)
        }
      ];
      
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn().mockResolvedValue({
        ...mockResponse,
        inputTokens: 200
      });
      
      const result = await client.sendMessage(longMessages);
      
      expect(result.inputTokens).toBeGreaterThan(100);
    });
  });

  describe('Cache Key Generation', () => {
    test('should generate consistent cache keys for same input', () => {
      const client1 = new EnhancedClaudeClient();
      const client2 = new EnhancedClaudeClient();
      
      const options: EnhancedClaudeOptions = {
        model: 'claude-3-haiku-20240307',
        maxTokens: 4000,
        temperature: 0.3
      };
      
      // Access private method through type assertion for testing
      const key1 = (client1 as any).generateCacheKey(mockMessages, options);
      const key2 = (client2 as any).generateCacheKey(mockMessages, options);
      
      expect(key1).toBe(key2);
    });

    test('should generate different cache keys for different input', () => {
      const options1: EnhancedClaudeOptions = { temperature: 0.3 };
      const options2: EnhancedClaudeOptions = { temperature: 0.7 };
      
      const key1 = (client as any).generateCacheKey(mockMessages, options1);
      const key2 = (client as any).generateCacheKey(mockMessages, options2);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Event Emission', () => {
    test('should emit cache hit event', async () => {
      const cachedResponse = { content: 'Cached content' };
      (summaryCache.checkCache as jest.Mock).mockResolvedValue(cachedResponse);
      
      let emittedEvent: any = null;
      client.on('CACHE_HIT', (event) => {
        emittedEvent = event;
      });
      
      await client.sendMessage(mockMessages, { useCache: true });
      
      expect(emittedEvent).toBeTruthy();
      expect(emittedEvent.cacheKey).toBeDefined();
      expect(emittedEvent.response).toEqual(cachedResponse);
    });

    test('should emit error event on failure', async () => {
      const mockOpenRouterClient = require('../../lib/ai/openrouter-client');
      mockOpenRouterClient.openRouterClient.sendMessage = jest.fn()
        .mockRejectedValue(new Error('Test error'));
      
      let emittedError: any = null;
      client.on('ERROR', (event) => {
        emittedError = event;
      });
      
      try {
        await client.sendMessage(mockMessages, { useRetry: false, useFallback: false });
      } catch (error) {
        // Expected to throw
      }
      
      expect(emittedError).toBeTruthy();
      expect(emittedError.error).toBeInstanceOf(Error);
    });
  });

  describe('Memory Management', () => {
    test('should clean up resources properly', () => {
      const client = new EnhancedClaudeClient();
      
      // Mock interval creation
      const mockInterval = setInterval(() => {}, 1000);
      jest.spyOn(global, 'setInterval').mockReturnValue(mockInterval);
      jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
      
      // Trigger cleanup
      client.cleanup();
      
      // Verify cleanup was called
      expect(global.clearInterval).toHaveBeenCalled();
    });
  });
});