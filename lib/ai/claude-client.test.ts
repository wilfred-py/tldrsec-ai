import { ClaudeClient, ClaudeMessage } from './claude-client';
import { ClaudeConfig } from './config';

// Mock the error-handling modules
jest.mock('../error-handling/retry', () => ({
  executeWithRetry: jest.fn((fn) => fn()),
  DefaultRetryConfig: {},
  DefaultCircuitBreakerConfig: {},
  TimeoutAbortController: class {
    signal = { addEventListener: jest.fn() };
    abort = jest.fn();
    setTimeout = jest.fn();
    clearTimeout = jest.fn();
  }
}));

// Set up a mock response for Anthropic API
const mockApiResponse = {
  id: 'msg_mock12345',
  model: 'claude-3-sonnet-20240229',
  content: [
    {
      type: 'text',
      text: 'This is a mock response from Claude.',
    },
  ],
  usage: {
    input_tokens: 50,
    output_tokens: 25,
  },
};

jest.mock('../error-handling/model-fallback', () => ({
  executeWithModelFallback: jest.fn((fn) => {
    return Promise.resolve({
      result: mockApiResponse,
      modelUsed: 'claude-3-sonnet-20240229',
      attempts: 1,
      executionTimeMs: 1000
    });
  }),
  DefaultClaudeFallback: { 
    initialModel: 'claude-3-opus-20240229',
    fallbackModels: ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
  },
  BatchClaudeFallback: {
    initialModel: 'claude-3-opus-20240229',
    fallbackModels: ['claude-3-sonnet-20240229']
  },
  PremiumClaudeFallback: {
    initialModel: 'claude-3-opus-20240229',
    fallbackModels: []
  },
  selectModelByCost: jest.fn(() => ({ id: 'claude-3-sonnet-20240229' })),
  ModelCapability: { SUMMARIZATION: 'SUMMARIZATION' }
}));

// Mock the monitoring and logging modules
jest.mock('../monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordTiming: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
  }
}));

jest.mock('../logging', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

// Mock the Anthropic API
jest.mock('@anthropic-ai/sdk', () => {
  // Create a mock constructor function
  const mockCreate = jest.fn().mockImplementation(() => 
    Promise.resolve(mockApiResponse)
  );
  
  const MockAnthropic = function() {
    return {
      messages: {
        create: mockCreate
      },
    };
  };
  
  // Add a default export
  MockAnthropic.default = MockAnthropic;
  
  return MockAnthropic;
});

/**
 * Tests for the Claude client
 * 
 * Note: These tests need to be updated to work with ESM. Currently Jest ESM and module mocking
 * have compatibility issues. When the tests are properly set up, they should verify:
 * 
 * 1. Initializes correctly with API key
 * 2. Sends messages to Claude with proper rate limiting
 * 3. Handles and formats errors appropriately 
 * 4. Calculates token counts and costs accurately
 * 5. Provides usage statistics
 * 
 * For now, the implemented client has been manually tested to work correctly with the Anthropic API.
 */

describe('ClaudeClient', () => {
  let client: ClaudeClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeClient('test-api-key');
  });
  
  test('should initialize correctly', () => {
    expect(client).toBeInstanceOf(ClaudeClient);
  });
  
  test('should send a message and get a response', async () => {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: 'Hello, Claude!' },
    ];
    
    const response = await client.sendMessage(messages, {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 100,
      temperature: 0.7,
    });
    
    expect(response.id).toBe('msg_mock12345');
    expect(response.content).toBe('This is a mock response from Claude.');
    expect(response.model).toBe('claude-3-sonnet-20240229');
    expect(response.usage.inputTokens).toBe(50);
    expect(response.usage.outputTokens).toBe(25);
    
    // Verify cost calculation
    const expectedInputCost = 50 * ClaudeConfig.modelInfo['claude-3-sonnet-20240229'].costPerInputToken;
    const expectedOutputCost = 25 * ClaudeConfig.modelInfo['claude-3-sonnet-20240229'].costPerOutputToken;
    
    expect(response.cost.inputCost).toBeCloseTo(expectedInputCost);
    expect(response.cost.outputCost).toBeCloseTo(expectedOutputCost);
    expect(response.cost.totalCost).toBeCloseTo(expectedInputCost + expectedOutputCost);
  });
  
  test('should provide usage statistics', async () => {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: 'Hello, Claude!' },
    ];
    
    await client.sendMessage(messages);
    const usage = client.getUsage();
    
    expect(usage.totalInputTokens).toBe(50);
    expect(usage.totalOutputTokens).toBe(25);
    expect(usage.totalCost).toBeGreaterThan(0);
  });
  
  test('should reset usage statistics', async () => {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: 'Hello, Claude!' },
    ];
    
    await client.sendMessage(messages);
    client.resetUsage();
    const usage = client.getUsage();
    
    expect(usage.totalInputTokens).toBe(0);
    expect(usage.totalOutputTokens).toBe(0);
    expect(usage.totalCost).toBe(0);
  });
}); 