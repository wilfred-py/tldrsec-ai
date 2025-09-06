// Mock implementation for ClaudeClient
// This avoids the need to import the actual @anthropic-ai/sdk

// Create a mock response
const mockResponse = {
  id: 'msg_123',
  content: 'Hello! How can I help you today?',
  model: 'claude-sonnet-4-20250514',
  usage: { inputTokens: 10, outputTokens: 20 },
  cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 }
};

// Export a mock implementation
export class ClaudeClient {
  constructor() {
    // No Anthropic initialization
  }
   
  async sendMessage() {
    return mockResponse;
  }
  
  getModelPricing() {
    return {
      inputPricePerToken: 0.0001,
      outputPricePerToken: 0.0003
    };
  }
}

// Export the mockResponse for use in tests
export const testResponse = mockResponse;
