/**
 * Jest setup file for summarization tests
 * Mocks all external dependencies to avoid issues with
 * browser environment detection and missing modules
 * 
 * @jest-environment node
 * @jest-environment-options {"testEnvironment": "node"}
 */

// This file is not a test file

// Mock the Anthropic client
jest.mock('@anthropic-ai/sdk', () => {
  const mockAnthropicInstance = {
    messages: {
      create: jest.fn().mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Mocked Anthropic response'
          }
        ],
        model: 'claude-sonnet-4-20250514',
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      })
    }
  };
  
  // Create a proper constructor function that can be instantiated with 'new'
  function MockAnthropic() {
    return mockAnthropicInstance;
  }
  
  // Make it work with both default and named exports
  MockAnthropic.default = MockAnthropic;
  
  return MockAnthropic;
});

// Mock the Claude client
jest.mock('../../../ai/claude-client', () => {
  // Create mock methods
  const mockMethods = {
    sendMessage: jest.fn().mockResolvedValue({
      id: 'msg_123',
      content: 'Mocked response',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 50,
      outputTokens: 10,
      totalTokens: 60,
      estimatedCost: 0.001
    }),
    streamMessage: jest.fn().mockImplementation((params, handler) => {
      setTimeout(() => {
        handler.onStart?.({ id: 'msg_123', model: 'claude-sonnet-4-20250514' });
        handler.onContent?.('Mocked response');
        handler.onComplete?.({});
      }, 0);
      return Promise.resolve({});
    }),
    estimateTokenCount: jest.fn().mockReturnValue(100)
  };
  
  // Create a proper constructor function
  function MockClaudeClient() {
    return mockMethods;
  }
  
  // Make it work with both default and named exports
  MockClaudeClient.default = MockClaudeClient;
  
  return { ClaudeClient: MockClaudeClient };
});

// Mock the EnhancedClaudeClient
jest.mock('../../../ai/enhanced-claude-client', () => {
  // Create mock methods
  const mockMethods = {
    sendMessage: jest.fn().mockResolvedValue({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summaryText: 'Test summary',
            keyInsights: ['Insight 1', 'Insight 2'],
            risks: ['Risk 1', 'Risk 2'],
            opportunities: ['Opportunity 1', 'Opportunity 2']
          })
        }
      ],
      model: 'claude-sonnet-4-20250514',
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    })
  };

  // Create a proper constructor function that extends EventEmitter
  function MockEnhancedClaudeClient() {
    this.on = jest.fn();
    this.emit = jest.fn();
    Object.assign(this, mockMethods);
    return this;
  }
  
  // Make it work with both default and named exports
  MockEnhancedClaudeClient.default = MockEnhancedClaudeClient;
  
  return {
    EnhancedClaudeClient: MockEnhancedClaudeClient
  };
});

// Mock the Prisma client
jest.mock('../../../db/prisma', () => {
  return {
    prisma: {
      summary: {
        update: jest.fn().mockResolvedValue({})
      },
      filing: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'filing-123',
          ticker: 'TEST',
          companyName: 'Test Company',
          filingDate: new Date(),
          filingType: '10-K',
          content: 'Test filing content'
        })
      }
    }
  };
});

// Mock the monitoring singleton
jest.mock('../../../monitoring', () => {
  return {
    monitoring: {
      incrementCounter: jest.fn(),
      recordValue: jest.fn(),
      recordTiming: jest.fn(),
      startTimer: jest.fn().mockReturnValue({
        end: jest.fn()
      })
    }
  };
});

// Mock the logger
jest.mock('../../../logging', () => {
  return {
    logger: {
      child: jest.fn().mockReturnValue({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      })
    }
  };
});

// Mock the cache
jest.mock('../../cache/summary-cache', () => {
  return {
    getSummaryFromCache: jest.fn().mockResolvedValue(null),
    saveSummaryToCache: jest.fn().mockResolvedValue(undefined)
  };
});

// Mock token utilities
jest.mock('../../../ai/token-counter', () => {
  return {
    estimateTokenCount: jest.fn().mockReturnValue(100),
    calculateCost: jest.fn().mockReturnValue(0.001)
  };
});
