/**
 * Enhanced Summarize Tests
 * 
 * Tests the enhanced summarization module with chunking, streaming,
 * batch processing, and caching capabilities.
 */

import { enhancedSummarize, EnhancedSummaryOptions } from '../enhanced-summarize';
import { EnhancedClaudeClient } from '../enhanced-claude-client';
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import * as tokenCounter from '../token-counter';

// Mock the enhanced Claude client
jest.mock('../enhanced-claude-client');

describe('enhancedSummarize', () => {
  // Mock data
  const mockText = 'This is a test document for summarization.';
  const mockPrompt = 'Summarize the following text:';
  const mockOptions: EnhancedSummaryOptions = {
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    maxTokens: 1000,
    useStreaming: false,
    processAllChunks: true,
    chunkOptions: {
      maxChunkSize: 10000,
      overlapSize: 500
    }
  };
  
  // Mock client response
  const mockClientResponse = {
    id: 'msg_123',
    content: 'This is a test summary.',
    model: 'claude-sonnet-4-20250514',
    inputTokens: 50,
    outputTokens: 10,
    totalTokens: 60,
    estimatedCost: 0.001
  };
  
  // Setup mocks
  let mockClient: jest.Mocked<EnhancedClaudeClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = new EnhancedClaudeClient({
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-20250514'
    }) as jest.Mocked<EnhancedClaudeClient>;
    
    // Mock the complete method
    mockClient.complete = jest.fn().mockResolvedValue(mockClientResponse);
    
    // Setup mock event emitter for streaming
    mockEventEmitter = new EventEmitter();
    mockClient.streamComplete = jest.fn().mockImplementation((params, handler) => {
      // Simulate streaming events
      setTimeout(() => {
        handler.onStart?.({ id: 'msg_123', model: 'claude-sonnet-4-20250514' });
        handler.onContent?.('This is a ');
        handler.onContent?.('test summary.');
        handler.onComplete?.(mockClientResponse);
      }, 0);
      
      return Promise.resolve(mockClientResponse);
    });
    
    // Mock the constructor to return our mock instance
    (EnhancedClaudeClient as jest.MockedClass<typeof EnhancedClaudeClient>).mockImplementation(() => mockClient);
  });
  
  describe('Basic summarization', () => {
    it('should summarize text correctly with default options', async () => {
      const result = await enhancedSummarize(mockText, mockPrompt);
      
      // Verify client was called with correct parameters
      expect(mockClient.complete).toHaveBeenCalledWith({
        messages: [
          { role: 'user', content: expect.stringContaining(mockPrompt) },
          { role: 'user', content: expect.stringContaining(mockText) }
        ],
        temperature: expect.any(Number),
        max_tokens: expect.any(Number)
      });
      
      // Verify result
      expect(result).toEqual({
        summary: 'This is a test summary.',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
        estimatedCost: 0.001,
        processingTimeMs: expect.any(Number),
        chunks: []
      });
    });
    
    it('should use custom options when provided', async () => {
      const customOptions: EnhancedSummaryOptions = {
        model: 'claude-3-sonnet-20240229',
        temperature: 0.5,
        maxTokens: 500,
        systemPrompt: 'You are a helpful assistant.'
      };
      
      await enhancedSummarize(mockText, mockPrompt, customOptions);
      
      // Verify client was created with correct model
      expect(EnhancedClaudeClient).toHaveBeenCalledWith({
        apiKey: expect.any(String),
        model: 'claude-3-sonnet-20240229'
      });
      
      // Verify complete was called with correct parameters
      expect(mockClient.complete).toHaveBeenCalledWith({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: expect.stringContaining(mockPrompt) },
          { role: 'user', content: expect.stringContaining(mockText) }
        ],
        temperature: 0.5,
        max_tokens: 500
      });
    });
  });
  
  describe('Streaming support', () => {
    it('should use streaming when enabled', async () => {
      const streamingOptions: EnhancedSummaryOptions = {
        ...mockOptions,
        useStreaming: true
      };
      
      const mockProgressCallback = jest.fn();
      
      const result = await enhancedSummarize(
        mockText,
        mockPrompt,
        streamingOptions,
        mockProgressCallback
      );
      
      // Verify streamComplete was called instead of complete
      expect(mockClient.streamComplete).toHaveBeenCalled();
      expect(mockClient.complete).not.toHaveBeenCalled();
      
      // Verify progress callback was called
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'start',
        data: { id: 'msg_123', model: 'claude-sonnet-4-20250514' }
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'content',
        content: 'This is a '
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'content',
        content: 'test summary.'
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'complete',
        data: mockClientResponse
      });
      
      // Verify result
      expect(result).toEqual({
        summary: 'This is a test summary.',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
        estimatedCost: 0.001,
        processingTimeMs: expect.any(Number),
        chunks: []
      });
    });
    
    it('should handle streaming errors correctly', async () => {
      const streamingOptions: EnhancedSummaryOptions = {
        ...mockOptions,
        useStreaming: true
      };
      
      // Mock streamComplete to throw an error
      mockClient.streamComplete = jest.fn().mockImplementation((params, handler) => {
        setTimeout(() => {
          handler.onStart?.({ id: 'msg_123', model: 'claude-sonnet-4-20250514' });
          handler.onError?.(new Error('Stream error'));
        }, 0);
        
        return Promise.reject(new Error('Stream error'));
      });
      
      const mockProgressCallback = jest.fn();
      
      // Call should throw
      await expect(enhancedSummarize(
        mockText,
        mockPrompt,
        streamingOptions,
        mockProgressCallback
      )).rejects.toThrow('Stream error');
      
      // Verify error callback was called
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'error',
        error: new Error('Stream error')
      });
    });
  });
  
  describe('Chunking support', () => {
    it('should process text in chunks when it exceeds token limit', async () => {
      // Create a long text that will require chunking
      const longText = 'a'.repeat(50000);
      
      // Mock estimateTokenCount to force chunking
      const originalEstimateTokenCount = tokenCounter.estimateTokenCount;
      (tokenCounter as { estimateTokenCount: jest.Mock }).estimateTokenCount = jest.fn()
        .mockImplementationOnce(() => 20000) // First call for the whole text
        .mockImplementationOnce(() => 9000)  // First chunk
        .mockImplementationOnce(() => 9000)  // Second chunk
        .mockImplementationOnce(() => 4000); // Third chunk
      
      // Mock client responses for each chunk
      mockClient.complete = jest.fn()
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Summary of chunk 1.'
        })
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Summary of chunk 2.'
        })
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Summary of chunk 3.'
        })
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Final combined summary.'
        });
      
      const result = await enhancedSummarize(longText, mockPrompt, {
        ...mockOptions,
        processAllChunks: true,
        chunkOptions: {
          maxChunkSize: 10000,
          overlapSize: 500
        }
      });
      
      // Restore original function
      (tokenCounter as { estimateTokenCount: typeof tokenCounter.estimateTokenCount }).estimateTokenCount = originalEstimateTokenCount;
      
      // Verify client was called for each chunk and for the final summary
      expect(mockClient.complete).toHaveBeenCalledTimes(4);
      
      // Verify result includes chunks and final summary
      expect(result).toEqual({
        summary: 'Final combined summary.',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
        estimatedCost: 0.001,
        processingTimeMs: expect.any(Number),
        chunks: [
          {
            summary: 'Summary of chunk 1.',
            model: 'claude-sonnet-4-20250514',
            inputTokens: 50,
            outputTokens: 10,
            totalTokens: 60,
            estimatedCost: 0.001,
            processingTimeMs: expect.any(Number)
          },
          {
            summary: 'Summary of chunk 2.',
            model: 'claude-sonnet-4-20250514',
            inputTokens: 50,
            outputTokens: 10,
            totalTokens: 60,
            estimatedCost: 0.001,
            processingTimeMs: expect.any(Number)
          },
          {
            summary: 'Summary of chunk 3.',
            model: 'claude-sonnet-4-20250514',
            inputTokens: 50,
            outputTokens: 10,
            totalTokens: 60,
            estimatedCost: 0.001,
            processingTimeMs: expect.any(Number)
          }
        ]
      });
    });
    
    it('should only process the first chunk when processAllChunks is false', async () => {
      // Create a long text that will require chunking
      const longText = 'a'.repeat(50000);
      
      // Mock estimateTokenCount to force chunking
      const originalEstimateTokenCount = tokenCounter.estimateTokenCount;
      (tokenCounter as { estimateTokenCount: jest.Mock }).estimateTokenCount = jest.fn()
        .mockImplementationOnce(() => 20000) // First call for the whole text
        .mockImplementationOnce(() => 9000); // First chunk
      
      // Mock client response
      mockClient.complete = jest.fn().mockResolvedValue({
        ...mockClientResponse,
        content: 'Summary of first chunk only.'
      });
      
      const result = await enhancedSummarize(longText, mockPrompt, {
        ...mockOptions,
        processAllChunks: false
      });
      
      // Restore original function
      (tokenCounter as { estimateTokenCount: typeof tokenCounter.estimateTokenCount }).estimateTokenCount = originalEstimateTokenCount;
      
      // Verify client was called only once
      expect(mockClient.complete).toHaveBeenCalledTimes(1);
      
      // Verify result
      expect(result).toEqual({
        summary: 'Summary of first chunk only.',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
        estimatedCost: 0.001,
        processingTimeMs: expect.any(Number),
        chunks: []
      });
    });
  });
  
  describe('Error handling', () => {
    it('should handle API errors gracefully', async () => {
      // Mock client to throw an error
      mockClient.complete = jest.fn().mockRejectedValue(new Error('API error'));
      
      // Call should throw
      await expect(enhancedSummarize(mockText, mockPrompt)).rejects.toThrow('API error');
    });
    
    it('should retry on rate limit errors when configured', async () => {
      // Create rate limit error
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      
      // Mock client to throw rate limit error then succeed
      mockClient.complete = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockClientResponse);
      
      // Mock setTimeout to execute immediately
      jest.useFakeTimers();
      
      // Call with retry options
      const resultPromise = enhancedSummarize(mockText, mockPrompt, {
        ...mockOptions,
        retry: {
          maxRetries: 3,
          initialDelayMs: 100
        }
      });
      
      // Fast-forward timers to trigger retry
      jest.advanceTimersByTime(100);
      
      // Wait for the promise to resolve
      const result = await resultPromise;
      
      // Verify client was called twice
      expect(mockClient.complete).toHaveBeenCalledTimes(2);
      
      // Verify result
      expect(result.summary).toBe('This is a test summary.');
      
      // Restore timers
      jest.useRealTimers();
    });
  });
  
  describe('Progress tracking', () => {
    it('should call progress callback with appropriate events', async () => {
      const mockProgressCallback = jest.fn();
      
      await enhancedSummarize(mockText, mockPrompt, mockOptions, mockProgressCallback);
      
      // Verify progress callback was called
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'start',
        data: { text: mockText, prompt: mockPrompt, options: mockOptions }
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'complete',
        data: expect.objectContaining({
          summary: 'This is a test summary.',
          model: 'claude-sonnet-4-20250514'
        })
      });
    });
    
    it('should track progress for chunked processing', async () => {
      // Create a long text that will require chunking
      const longText = 'a'.repeat(50000);
      
      // Mock estimateTokenCount to force chunking
      const originalEstimateTokenCount = tokenCounter.estimateTokenCount;
      (tokenCounter as { estimateTokenCount: jest.Mock }).estimateTokenCount = jest.fn()
        .mockImplementationOnce(() => 20000) // First call for the whole text
        .mockImplementationOnce(() => 9000)  // First chunk
        .mockImplementationOnce(() => 9000)  // Second chunk
        .mockImplementationOnce(() => 4000); // Third chunk
      
      // Mock client responses for each chunk
      mockClient.complete = jest.fn()
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Summary of chunk 1.'
        })
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Summary of chunk 2.'
        })
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Summary of chunk 3.'
        })
        .mockResolvedValueOnce({
          ...mockClientResponse,
          content: 'Final combined summary.'
        });
      
      const mockProgressCallback = jest.fn();
      
      await enhancedSummarize(longText, mockPrompt, {
        ...mockOptions,
        processAllChunks: true
      }, mockProgressCallback);
      
      // Restore original function
      (tokenCounter as { estimateTokenCount: typeof tokenCounter.estimateTokenCount }).estimateTokenCount = originalEstimateTokenCount;
      
      // Verify progress callbacks for chunks
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'chunk_start',
        chunkIndex: 0,
        totalChunks: 3
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'chunk_complete',
        chunkIndex: 0,
        totalChunks: 3,
        result: expect.objectContaining({
          summary: 'Summary of chunk 1.'
        })
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'chunk_start',
        chunkIndex: 1,
        totalChunks: 3
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'chunk_complete',
        chunkIndex: 1,
        totalChunks: 3,
        result: expect.objectContaining({
          summary: 'Summary of chunk 2.'
        })
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'chunk_start',
        chunkIndex: 2,
        totalChunks: 3
      });
      
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'chunk_complete',
        chunkIndex: 2,
        totalChunks: 3,
        result: expect.objectContaining({
          summary: 'Summary of chunk 3.'
        })
      });
      
      // Verify final completion callback
      expect(mockProgressCallback).toHaveBeenCalledWith({
        type: 'complete',
        data: expect.objectContaining({
          summary: 'Final combined summary.',
          chunks: expect.arrayContaining([
            expect.objectContaining({ summary: 'Summary of chunk 1.' }),
            expect.objectContaining({ summary: 'Summary of chunk 2.' }),
            expect.objectContaining({ summary: 'Summary of chunk 3.' })
          ])
        })
      });
    });
  });
});
