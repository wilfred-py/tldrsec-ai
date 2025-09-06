// Mock setup for Anthropic SDK and ClaudeClient
// This file needs to be loaded before any tests that use Anthropic

// Mock Anthropic SDK to ensure it works with ES module imports
const AnthropicMock = function() {
  this.messages = {
    create: jest.fn().mockResolvedValue({
      id: 'msg_mock',
      content: [{ type: 'text', text: 'Mock response from Anthropic SDK' }],
      model: 'claude-sonnet-4-20250514'
    })
  };
  this.dangerouslyAllowBrowser = true;
};

// Mock Claude client response
const mockClaudeResponse = {
  id: 'msg_123',
  content: 'Hello! How can I help you today?',
  model: 'claude-sonnet-4-20250514',
  usage: { inputTokens: 10, outputTokens: 20 },
  cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 }
};

// Mock ClaudeClient class
const ClaudeClientMock = function() {
  this.sendMessage = jest.fn().mockResolvedValue(mockClaudeResponse);
  this.getModelPricing = jest.fn();
};

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: AnthropicMock
  };
}, { virtual: true });

// Mock ClaudeClient module
jest.mock('../claude-client', () => {
  return {
    ClaudeClient: ClaudeClientMock
  };
}, { virtual: true });

// Make mocks available globally 
global.Anthropic = AnthropicMock;
global.ClaudeClient = ClaudeClientMock;
