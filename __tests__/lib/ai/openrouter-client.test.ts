/**
 * OpenRouter Client Unit Tests
 * Tests the OpenRouter xAI client directly with proper mocks
 */

import { jest } from '@jest/globals';

// Mock monitoring
jest.mock('../../../lib/monitoring', () => ({
  monitoring: {
    startTimer: jest.fn(() => 'mock-timer'),
    stopTimer: jest.fn(),
    recordTiming: jest.fn(),
    incrementCounter: jest.fn(),
    recordMetric: jest.fn(),
    recordValue: jest.fn(),
    recordGauge: jest.fn(),
    recordEmailSent: jest.fn(),
    recordAiApiCall: jest.fn()
  }
}));

jest.mock('../../../lib/logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { OpenRouterClient } from '../../../lib/ai/openrouter-client';

describe('OpenRouter Client', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TLDRSEC_AI_SUMMARIZER = 'test-api-key';
    process.env.DEFAULT_AI_MODEL = 'x-ai/grok-4-fast:free';
    client = new OpenRouterClient();
  });

  afterEach(() => {
    delete process.env.TLDRSEC_AI_SUMMARIZER;
    delete process.env.DEFAULT_AI_MODEL;
  });

  describe('sendMessage', () => {
    it('should send a message and return OpenRouter response', async () => {
      const mockResponse = {
        id: 'test-response',
        choices: [{
          message: {
            content: 'Test AI response'
          }
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.sendMessage([
        { role: 'user', content: 'Hello, world!' }
      ]);

      expect(result).toBeDefined();
      expect(result.content).toBe('Test AI response');
      expect(result.model).toBe('x-ai/grok-4-fast:free');
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
      expect(result.cost.totalCost).toBe(0); // Free model

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });

    it('should handle API errors properly', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded'
      });

      await expect(client.sendMessage([
        { role: 'user', content: 'Hello!' }
      ])).rejects.toThrow('OpenRouter API error: 429');
    });

    it('should calculate costs correctly for paid models', async () => {
      const mockResponse = {
        id: 'test-response',
        choices: [{
          message: {
            content: 'Test response'
          }
        }],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.sendMessage([
        { role: 'user', content: 'Test' }
      ], {
        model: 'x-ai/grok-4'
      });

      expect(result.model).toBe('x-ai/grok-4');
      expect(result.cost.inputCost).toBe(0.003); // 1000 * 0.000003
      expect(result.cost.outputCost).toBe(0.0075); // 500 * 0.000015
      expect(result.cost.totalCost).toBe(0.0105);
    });
  });

  describe('model selection', () => {
    it('should default to free model when no model specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          choices: [{ message: { content: 'response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 }
        })
      });

      const result = await client.sendMessage([
        { role: 'user', content: 'test' }
      ]);

      expect(result.model).toBe('x-ai/grok-4-fast:free');
    });

    it('should use specified model', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          choices: [{ message: { content: 'response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 }
        })
      });

      const result = await client.sendMessage([
        { role: 'user', content: 'test' }
      ], {
        model: 'x-ai/grok-4-fast-reasoning'
      });

      expect(result.model).toBe('x-ai/grok-4-fast-reasoning');
    });
  });
});