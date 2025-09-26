/**
 * OpenRouter Client Comprehensive Test Suite
 * 
 * Tests all functionality of the OpenRouter client including:
 * - Model selection logic
 * - Cost calculation and tracking
 * - Error handling and normalization
 * - Retry mechanisms with exponential backoff
 * - Fallback chain (Grok-4 → Grok-2 → Llama → Gemini)
 * - Rate limiting integration
 * - API integration with mocked responses
 * - Usage tracking and statistics
 * 
 * Designed for >90% code coverage
 */

import { jest } from '@jest/globals';
import { OpenRouterClient, OpenRouterMessage } from '../openrouter-client';
import { ApiError } from '../../error-handling';

// Mock all dependencies at module level
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockMonitoring = {
  startTimer: jest.fn(),
  stopTimer: jest.fn(),
  recordTiming: jest.fn(),
  incrementCounter: jest.fn()
};

const mockExecuteWithRetry = jest.fn();
const mockTimeoutAbortController = jest.fn().mockImplementation(() => ({
  signal: new AbortController().signal,
  setTimeout: jest.fn(),
  clearTimeout: jest.fn(),
  abort: jest.fn()
}));

const mockBottleneck = jest.fn().mockImplementation(() => ({
  schedule: jest.fn().mockImplementation((fn) => fn())
}));

const mockUuid = jest.fn().mockReturnValue('test-request-id');

// Apply all mocks
jest.mock('../../logging', () => ({ logger: mockLogger }));
jest.mock('../../monitoring', () => ({ default: mockMonitoring }));
jest.mock('../../error-handling/retry', () => ({
  executeWithRetry: mockExecuteWithRetry,
  DefaultRetryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000, exponentialBase: 2 },
  DefaultCircuitBreakerConfig: { failureThreshold: 5, resetTimeout: 60000 },
  TimeoutAbortController: mockTimeoutAbortController
}));
jest.mock('bottleneck', () => mockBottleneck);
jest.mock('uuid', () => ({ v4: mockUuid }));

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('OpenRouterClient Comprehensive Tests', () => {
  let client: OpenRouterClient;
  
  const mockMessages: OpenRouterMessage[] = [
    { role: 'user', content: 'Test message' }
  ];

  const mockOpenRouterResponse = {
    id: 'chatcmpl-test',
    choices: [{ message: { content: 'Test response content' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    process.env.TLDRSEC_AI_SUMMARIZER = 'test-api-key';
    process.env.DEFAULT_AI_MODEL = 'x-ai/grok-4-fast:free';
    
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
      json: jest.fn().mockResolvedValue(mockOpenRouterResponse)
    } as any);

    mockExecuteWithRetry.mockImplementation(async (fn) => await fn());
    
    client = new OpenRouterClient();
  });

  describe('Constructor & Configuration', () => {
    it('should initialize successfully with API key', () => {
      expect(client).toBeInstanceOf(OpenRouterClient);
      expect(client.getUsage()).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0
      });
    });

    it('should warn when no API key provided', () => {
      delete process.env.TLDRSEC_AI_SUMMARIZER;
      delete process.env.OPENROUTER_API_KEY;
      
      mockLogger.warn.mockClear();
      new OpenRouterClient();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No OpenRouter API key provided. Set TLDRSEC_AI_SUMMARIZER or OPENROUTER_API_KEY in environment variables.'
      );
    });

    it('should initialize Bottleneck rate limiter', () => {
      expect(mockBottleneck).toHaveBeenCalledWith({
        maxConcurrent: 5,
        minTime: 200
      });
    });

    it('should return available xAI models', () => {
      const models = client.getAvailableModels();
      expect(models).toHaveProperty('x-ai/grok-4-fast:free');
      expect(models).toHaveProperty('x-ai/grok-4');
      expect(models).toHaveProperty('x-ai/grok-3');
      
      const freeModel = models['x-ai/grok-4-fast:free'];
      expect(freeModel).toMatchObject({
        id: 'x-ai/grok-4-fast:free',
        name: expect.any(String),
        contextWindow: expect.any(Number),
        costPerInputToken: 0,
        costPerOutputToken: 0,
        capabilities: expect.arrayContaining(['reasoning', 'multimodal', 'tools']),
        available: true
      });
    });
  });

  describe('Model Selection Logic', () => {
    it('should select preferred model when suitable', () => {
      const model = (client as any).modelAgent.selectModel({
        preferredModel: 'x-ai/grok-4-fast:free',
        maxCost: 1.0,
        requiredContextWindow: 100000,
        requiredCapabilities: ['reasoning']
      });
      
      expect(model).toBe('x-ai/grok-4-fast:free');
    });

    it('should fallback when preferred model unsuitable', () => {
      const model = (client as any).modelAgent.selectModel({
        preferredModel: 'non-existent-model',
        maxCost: 0.1,
        requiredContextWindow: 50000
      });
      
      expect(model).toBe('x-ai/grok-4-fast:free');
    });

    it('should respect context window constraints', () => {
      const model = (client as any).modelAgent.selectModel({
        requiredContextWindow: 5000000 // Exceeds all models
      });
      
      expect(model).toBe('x-ai/grok-4-fast:free'); // Default fallback
    });

    it('should respect capability requirements', () => {
      const model = (client as any).modelAgent.selectModel({
        requiredCapabilities: ['reasoning', 'impossible-capability']
      });
      
      expect(model).toBe('x-ai/grok-4-fast:free'); // Default fallback
    });

    it('should get next model in fallback chain', () => {
      const agent = (client as any).modelAgent;
      expect(agent.getNextModel('x-ai/grok-4-fast:free')).toBe('x-ai/grok-4');
      expect(agent.getNextModel('x-ai/grok-4')).toBe('x-ai/grok-3');
      expect(agent.getNextModel('x-ai/grok-3')).toBeNull();
      expect(agent.getNextModel('unknown-model')).toBeNull();
    });

    it('should return model info correctly', () => {
      const agent = (client as any).modelAgent;
      const info = agent.getModelInfo('x-ai/grok-4-fast:free');
      
      expect(info).toMatchObject({
        id: 'x-ai/grok-4-fast:free',
        contextWindow: 2000000,
        costPerInputToken: 0,
        costPerOutputToken: 0
      });
      
      expect(agent.getModelInfo('invalid-model')).toBeNull();
    });
  });

  describe('Core API Functionality', () => {
    it('should send message successfully', async () => {
      const response = await client.sendMessage(mockMessages);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          })
        })
      );
      
      expect(response).toMatchObject({
        id: expect.any(String),
        content: 'Test response content',
        model: 'x-ai/grok-4-fast:free',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { totalCost: 0 }
      });
    });

    it('should handle system messages correctly', async () => {
      await client.sendMessage(mockMessages, {
        system: 'You are a helpful assistant'
      });
      
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant'
      });
    });

    it('should use custom parameters', async () => {
      await client.sendMessage(mockMessages, {
        model: 'x-ai/grok-4',
        temperature: 0.7,
        maxTokens: 2000
      });
      
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      
      expect(body.model).toBe('x-ai/grok-4');
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(2000);
    });

    it('should track usage statistics', async () => {
      await client.sendMessage(mockMessages);
      
      const usage = client.getUsage();
      expect(usage.totalInputTokens).toBe(100);
      expect(usage.totalOutputTokens).toBe(50);
      expect(usage.totalCost).toBe(0);
    });

    it('should reset usage statistics', () => {
      client.resetUsage();
      expect(client.getUsage()).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0
      });
    });
  });

  describe('Cost Calculations', () => {
    it('should calculate costs for paid models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ...mockOpenRouterResponse,
          usage: { prompt_tokens: 1000, completion_tokens: 500 }
        })
      } as any);

      const response = await client.sendMessage(mockMessages, {
        model: 'x-ai/grok-4' // Paid model: $3/M input, $15/M output
      });
      
      expect(response.cost.inputCost).toBeCloseTo(0.003); // 1000 * 0.000003
      expect(response.cost.outputCost).toBeCloseTo(0.0075); // 500 * 0.000015
      expect(response.cost.totalCost).toBeCloseTo(0.0105);
    });

    it('should handle zero costs for free models', async () => {
      const response = await client.sendMessage(mockMessages, {
        model: 'x-ai/grok-4-fast:free'
      });
      
      expect(response.cost).toEqual({
        inputCost: 0,
        outputCost: 0,
        totalCost: 0
      });
    });
  });

  describe('Error Handling & Normalization', () => {
    it('should normalize different error types', () => {
      const normalizeError = (client as any).normalizeError.bind(client);
      
      // Rate limit error
      let error = new Error('rate limit exceeded');
      let normalized = normalizeError(error, 'test-id');
      expect(normalized).toBeInstanceOf(ApiError);
      expect(normalized.message).toContain('rate limit');
      
      // Context window error
      error = new Error('context window exceeded');
      normalized = normalizeError(error, 'test-id');
      expect(normalized.message).toContain('context window');
      
      // Content filtering error
      error = new Error('content policy violation');
      normalized = normalizeError(error, 'test-id');
      expect(normalized.message).toContain('content filtered');
      
      // Service unavailable error
      error = new Error('503 service unavailable');
      normalized = normalizeError(error, 'test-id');
      expect(normalized.message).toContain('service unavailable');
      
      // Authentication error
      error = new Error('401 unauthorized');
      normalized = normalizeError(error, 'test-id');
      expect(normalized.message).toContain('authentication error');
      
      // Abort error
      error = new Error('Request was aborted');
      error.name = 'AbortError';
      normalized = normalizeError(error, 'test-id');
      expect(normalized.message).toContain('aborted');
      
      // Generic error
      error = new Error('Unknown error');
      normalized = normalizeError(error, 'test-id');
      expect(normalized.message).toContain('OpenRouter API error');
    });

    it('should handle API response errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn().mockResolvedValue('Rate limit exceeded')
      } as any);

      await expect(client.sendMessage(mockMessages)).rejects.toThrow();
    });

    it('should handle missing API key in request', async () => {
      const clientWithoutKey = new OpenRouterClient('');
      await expect(clientWithoutKey.sendMessage(mockMessages)).rejects.toThrow(
        'OpenRouter API key not configured'
      );
    });
  });

  describe('Content Extraction', () => {
    it('should extract different content formats', () => {
      const extractContent = (client as any).extractContent.bind(client);
      
      // String content
      expect(extractContent('Simple string')).toBe('Simple string');
      
      // Array content
      expect(extractContent([
        'First block',
        { text: 'Second block' },
        'Third block'
      ])).toBe('First block\nSecond block\nThird block');
      
      // Empty/null content
      expect(extractContent('')).toBe('');
      expect(extractContent(null)).toBe('');
      expect(extractContent(undefined)).toBe('');
      
      // Non-string content
      expect(extractContent(123)).toBe('123');
      expect(extractContent({ key: 'value' })).toBe('[object Object]');
    });
  });

  describe('Rate Limiting & Retry Logic', () => {
    it('should use Bottleneck for rate limiting', async () => {
      const mockSchedule = jest.fn().mockImplementation((fn) => fn());
      (mockBottleneck as any).mockReturnValue({ schedule: mockSchedule });
      
      const newClient = new OpenRouterClient();
      await newClient.sendMessage(mockMessages);
      
      expect(mockSchedule).toHaveBeenCalled();
    });

    it('should use retry mechanism', async () => {
      await client.sendMessage(mockMessages);
      
      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        'openrouter-xai-x-ai/grok-4-fast:free',
        expect.objectContaining({
          maxRetries: expect.any(Number)
        }),
        expect.any(Object)
      );
    });

    it('should configure retry with custom options', async () => {
      const customRetryConfig = { maxRetries: 5, baseDelay: 2000 };
      
      await client.sendMessage(mockMessages, {
        retryConfig: customRetryConfig
      });
      
      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(String),
        expect.objectContaining(customRetryConfig),
        expect.any(Object)
      );
    });
  });

  describe('Performance & Monitoring', () => {
    it('should record performance metrics', async () => {
      await client.sendMessage(mockMessages);
      
      expect(mockMonitoring.startTimer).toHaveBeenCalledWith('openrouter.request.standard');
      expect(mockMonitoring.stopTimer).toHaveBeenCalledWith('openrouter.request.standard');
      expect(mockMonitoring.recordTiming).toHaveBeenCalledWith(
        'openrouter.request.duration',
        expect.any(Number)
      );
      expect(mockMonitoring.recordTiming).toHaveBeenCalledWith(
        'openrouter.cost',
        expect.any(Number)
      );
    });

    it('should record retry metrics', async () => {
      mockExecuteWithRetry.mockImplementation(async (fn, serviceName, retryConfig) => {
        if (retryConfig.onRetry) {
          retryConfig.onRetry(new Error('Test retry'), 1, 1000);
        }
        return await fn();
      });

      await client.sendMessage(mockMessages);
      
      expect(mockMonitoring.incrementCounter).toHaveBeenCalledWith('openrouter.retry', 1);
    });

    it('should record error metrics on failures', async () => {
      mockFetch.mockRejectedValue(new Error('Test error'));
      
      await expect(client.sendMessage(mockMessages)).rejects.toThrow();
      
      expect(mockMonitoring.incrementCounter).toHaveBeenCalledWith('openrouter.error', 1);
    });

    it('should use different circuit breaker settings for premium requests', async () => {
      await client.sendMessage(mockMessages, { requestType: 'premium' });
      
      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          failureThreshold: 8 // Premium gets higher threshold
        })
      );
    });
  });

  describe('Edge Cases & Robustness', () => {
    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}) // Empty response
      } as any);

      const response = await client.sendMessage(mockMessages);
      expect(response.content).toBe('');
      expect(response.usage.inputTokens).toBe(0);
      expect(response.usage.outputTokens).toBe(0);
    });

    it('should handle missing usage data in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'test',
          choices: [{ message: { content: 'test' } }]
          // Missing usage data
        })
      } as any);

      const response = await client.sendMessage(mockMessages);
      expect(response.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    });

    it('should handle empty message arrays', async () => {
      await expect(client.sendMessage([])).resolves.toBeDefined();
    });

    it('should handle abort signals', async () => {
      const abortController = new AbortController();
      abortController.abort();
      
      mockFetch.mockRejectedValue(new Error('The user aborted a request.'));
      
      await expect(client.sendMessage(mockMessages, {
        abortSignal: abortController.signal
      })).rejects.toThrow();
    });

    it('should handle timeout configuration', async () => {
      const mockController = {
        signal: new AbortController().signal,
        setTimeout: jest.fn(),
        clearTimeout: jest.fn(),
        abort: jest.fn()
      };
      
      mockTimeoutAbortController.mockReturnValue(mockController);
      
      await client.sendMessage(mockMessages, { timeout: 5000 });
      
      expect(mockController.setTimeout).toHaveBeenCalledWith(5000);
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(3).fill(0).map(() => 
        client.sendMessage(mockMessages)
      );
      
      const responses = await Promise.all(promises);
      
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.content).toBe('Test response content');
      });
    });
  });

  describe('Model Fallback Chain', () => {
    it('should attempt fallback on model failure', async () => {
      let attemptCount = 0;
      mockExecuteWithRetry.mockImplementation(async (fn) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('First model failed');
        }
        return await fn();
      });

      const response = await client.sendMessage(mockMessages);
      expect(response).toBeDefined();
    });

    it('should exhaust all models before final failure', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('All models failed'));
      
      await expect(client.sendMessage(mockMessages)).rejects.toThrow();
    });

    it('should indicate when fallback was used', async () => {
      const originalSelectModel = (client as any).modelAgent.selectModel;
      (client as any).modelAgent.selectModel = jest.fn().mockReturnValue('x-ai/grok-4');
      
      const response = await client.sendMessage(mockMessages, {
        model: 'x-ai/grok-4-fast:free'
      });
      
      expect(response.fallbackUsed).toBe(true);
      expect(response.originalModel).toBe('x-ai/grok-4-fast:free');
      
      // Restore
      (client as any).modelAgent.selectModel = originalSelectModel;
    });
  });
});