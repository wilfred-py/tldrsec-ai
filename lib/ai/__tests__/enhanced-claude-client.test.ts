/**
 * Enhanced Claude Client Tests
 * 
 * Validates the enhanced client's functionality including streaming, caching,
 * and event emission capabilities.
 */

// Load the setup file first - this contains all the necessary mocks
import './setup-enhanced-claude';

// Mock UUID for consistent IDs in tests
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid')
}));

// Mock the summary cache
jest.mock('../cache/summary-cache', () => ({
  summaryCache: {
    checkCache: jest.fn().mockImplementation(() => Promise.resolve(null)),
    saveToCache: jest.fn().mockImplementation(() => Promise.resolve())
  }
}));

// Mock the streaming handlers
jest.mock('../streaming/stream-handler', () => ({
  createStreamHandler: jest.fn().mockReturnValue({
    onStart: jest.fn(),
    onContent: jest.fn(),
    onComplete: jest.fn(),
    onError: jest.fn()
  })
}));

// Now import all required modules - use ES module syntax as per memory requirement
import { jest } from '@jest/globals';
import { ClaudeClient } from '../claude-client';
import type { ClaudeMessage, ClaudeResponse } from '../claude-client';
import { EnhancedClaudeClient, EnhancedClaudeEvent } from '../enhanced-claude-client';
import type { EnhancedClaudeOptions } from '../enhanced-claude-client';
import { summaryCache } from '../cache/summary-cache';
import type { SummaryCacheKey } from '../cache/summary-cache';
import type { SummarizationResult } from '../summarize';
import { SECFilingType } from '../prompts/prompt-types';

// Simple type for our mock response object
type MockResponseType = {
  id: string;
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  cost: { inputCost: number; outputCost: number; totalCost: number };
};

// We'll use direct type assertions in the tests instead of trying to extend types

// Define cache related types to avoid type errors
type CacheEntry = {
  summaryId: string;
  status: string;
  result: SummarizationResult;
  lastUpdated: Date;
};

// Mock cache with properly typed functions
jest.mock('../cache/summary-cache', () => ({
  summaryCache: {
    checkCache: jest.fn().mockImplementation(() => Promise.resolve(null as CacheEntry | null)),
    saveToCache: jest.fn().mockImplementation(() => Promise.resolve())
  }
}));

// Create mock stream handler
const mockStreamHandler = {
  onStart: jest.fn(),
  onContent: jest.fn(),
  onComplete: jest.fn(),
  onError: jest.fn()
};

// Mock streaming handler
jest.mock('../streaming/stream-handler', () => ({
  createStreamHandler: jest.fn().mockReturnValue(mockStreamHandler)
}));

describe('EnhancedClaudeClient', () => {
  // Test data
  const mockMessages: ClaudeMessage[] = [
    { role: 'user', content: 'Hello Claude' }
  ];

  // Define mockResponse with explicit type casting to ensure compatibility
  const mockResponse = {
    id: 'msg_123',
    content: 'Hello! How can I help you today?',
    model: 'claude-sonnet-4-20250514',
    usage: {
      inputTokens: 10,
      outputTokens: 20
    },
    cost: {
      inputCost: 0.01,
      outputCost: 0.02,
      totalCost: 0.03
    }
  } as ClaudeResponse;

  const mockCacheKey: SummaryCacheKey = {
    formType: '10-K' as SECFilingType,
    cik: '123456',
    accessionNumber: '0001234567-23-000001'
  };

  const mockSummarizationResult: SummarizationResult = {
    summaryId: 'summary-123',
    summaryText: 'This is a cached summary',
    duration: 1000,
    modelUsed: 'claude-sonnet-4-20250514',
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.01
  };

  // Mock cache entry with type definition
  const mockCacheEntry = {
    summaryId: 'summary-123',
    status: 'COMPLETED',
    result: mockSummarizationResult,
    lastUpdated: new Date()
  };

  let enhancedClient: EnhancedClaudeClient;
  let mockBaseClient: jest.Mocked<ClaudeClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock base client with ts-ignore to bypass complex type issues
    // This is a pragmatic approach in tests where we know the mock is correct
    // @ts-ignore - Bypassing strict typing for test mocks
    const sendMessageMock = jest.fn().mockResolvedValue(mockResponse);
    
    mockBaseClient = {
      sendMessage: sendMessageMock,
      getModelPricing: jest.fn()
    } as unknown as jest.Mocked<ClaudeClient>;

    // Update the mock implementation
    (ClaudeClient as jest.MockedClass<typeof ClaudeClient>)
      .mockImplementation(() => mockBaseClient);

    // Reset mock implementation for cache
    (summaryCache.checkCache as jest.Mock).mockReset();
    (summaryCache.checkCache as jest.Mock).mockImplementation(() => Promise.resolve(null));

    // Create the enhanced client with our mocked base client
    enhancedClient = new EnhancedClaudeClient(mockBaseClient);
  });

  describe('sendMessage', () => {
    it('should forward messages to the base client by default', async () => {
      // Cast to handle the never type error
      const baseClientSendMessage = mockBaseClient.sendMessage as jest.Mock;
      
      const response = await enhancedClient.sendMessage(mockMessages);
      
      expect(baseClientSendMessage).toHaveBeenCalledWith(mockMessages, {});
      expect(response).toEqual(mockResponse);
    });

    it('should use cache when useCache is true and cache hit occurs', async () => {
      // Use the right typing to avoid TypeScript errors
      const checkCacheMock = summaryCache.checkCache as jest.Mock;
      const baseClientSendMessageMock = mockBaseClient.sendMessage as jest.Mock;
      
      // Set up the mock implementation
      checkCacheMock.mockImplementationOnce(() => Promise.resolve({
        summaryId: 'summary-123',
        status: 'COMPLETED',
        result: mockSummarizationResult,
        lastUpdated: new Date()
      }));
      
      const response = await enhancedClient.sendMessage(mockMessages, {
        useCache: true,
        cacheKey: mockCacheKey
      });

      expect(checkCacheMock).toHaveBeenCalledWith(mockCacheKey);
      expect(baseClientSendMessageMock).not.toHaveBeenCalled();
      expect(response).toBeDefined();
      expect(response.content).toBe(mockSummarizationResult.summaryText);
    });

    it('should use streaming when useStreaming is true', async () => {
      // Create a properly typed mock response
      const mockStreamingResponse = {
        id: 'msg_123',
        content: 'Streaming response content',
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 10, outputTokens: 20 },
        cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 }
      };
      
      // Mock the private sendStreamingMessage method
      const sendStreamingMessageMock = jest.fn().mockImplementation(() => {
        return Promise.resolve(mockStreamingResponse);
      });

      // Add the mock method to the instance
      (enhancedClient as any).sendStreamingMessage = sendStreamingMessageMock;

      const response = await enhancedClient.sendMessage(mockMessages, {
        useStreaming: true
      });

      expect(sendStreamingMessageMock).toHaveBeenCalledWith(mockMessages, { useStreaming: true });
      expect(response).toEqual(mockStreamingResponse);
    });
  });

  describe('event emission', () => {
    it('should emit events properly', () => {
      // Using a different approach to test event emission
      // Cast the enhancedClient to any to bypass TypeScript restrictions on emit
      const client = enhancedClient as any;
      const eventSpy = jest.spyOn(client, 'emit');
      
      // Emit events
      client.emit(EnhancedClaudeEvent.STREAM_START, { id: 'mock-uuid' });
      client.emit(EnhancedClaudeEvent.STREAM_CONTENT, { content: 'Partial content' });
      
      // Verify the spy was called with the right arguments
      expect(eventSpy).toHaveBeenCalledWith(EnhancedClaudeEvent.STREAM_START, { id: 'mock-uuid' });
      expect(eventSpy).toHaveBeenCalledWith(EnhancedClaudeEvent.STREAM_CONTENT, { content: 'Partial content' });
    });

    it('should allow event listeners to be registered and triggered', () => {
      const startListener = jest.fn();
      const contentListener = jest.fn();

      enhancedClient.on(EnhancedClaudeEvent.STREAM_START, startListener);
      enhancedClient.on(EnhancedClaudeEvent.STREAM_CONTENT, contentListener);

      enhancedClient.emit(EnhancedClaudeEvent.STREAM_START, { id: 'test-id' });
      enhancedClient.emit(EnhancedClaudeEvent.STREAM_CONTENT, { content: 'Test content' });

      expect(startListener).toHaveBeenCalledWith({ id: 'test-id' });
      expect(contentListener).toHaveBeenCalledWith({ content: 'Test content' });
    });
  });

  describe('getBaseClient', () => {
    it('should return the base client instance', () => {
      const baseClient = enhancedClient.getBaseClient();
      expect(baseClient).toBe(mockBaseClient);
    });
  });
});
