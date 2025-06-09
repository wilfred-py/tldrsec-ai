/**
 * Mock for claude-client.js
 * This prevents the actual Claude client from being loaded in tests
 */

import { jest } from '@jest/globals';

// Create a mock response
const mockResponse = {
  id: 'msg_123',
  content: 'Mock summary',
  model: 'claude-3-opus-20240229',
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
  
  async summarize() {
    return {
      summaryText: 'Mock summary',
      summaryJSON: { key: 'value' },
      modelUsed: 'claude-3-opus-20240229',
      duration: 100,
      inputTokens: 50,
      outputTokens: 20,
      cost: 0.001
    };
  }
}

// Export the singleton instance
export const claudeClient = new ClaudeClient();

// Export the mockResponse for use in tests
export const testResponse = mockResponse;
