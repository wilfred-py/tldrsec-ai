// Mock Anthropic SDK to avoid browser environment errors
jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          id: 'mock-message-id',
          content: [{ type: 'text', text: 'Mock response from Claude' }],
          model: 'claude-3-opus-20240229'
        })
      }
    }))
  };
});

// Mock the enhanced-claude-client
jest.mock('../../claude-client', () => {
  return {
    claudeClient: {
      complete: jest.fn().mockResolvedValue({
        id: 'mock-completion-id',
        completion: 'Mock completion from Claude',
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn'
      }),
      completeStreaming: jest.fn().mockImplementation(() => {
        const mockEmitter = {
          on: jest.fn().mockReturnThis(),
          once: jest.fn().mockReturnThis()
        };
        return mockEmitter;
      })
    },
    ClaudeClient: jest.fn().mockImplementation(() => ({
      complete: jest.fn().mockResolvedValue({
        id: 'mock-completion-id',
        completion: 'Mock completion from Claude',
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn'
      })
    }))
  };
});

// Set environment variables
process.env.ANTHROPIC_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
