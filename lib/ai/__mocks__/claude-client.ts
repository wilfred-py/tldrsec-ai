/**
 * Mock for claude-client.ts
 * This prevents the actual Claude client from being loaded in tests
 */

import { jest } from '@jest/globals';

// Create a mock response
const mockResponse = {
  id: 'msg_123',
  content: 'Mock summary',
  model: 'claude-sonnet-4-20250514',
  usage: { inputTokens: 10, outputTokens: 20 },
  cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 }
};

// Define a proper class constructor that can be instantiated with 'new'
export class ClaudeClient {
  constructor() {
    // Constructor implementation
  }
  
  sendMessage = jest.fn().mockResolvedValue(mockResponse);
  
  getModelPricing = jest.fn().mockReturnValue({
    inputPricePerToken: 0.0001,
    outputPricePerToken: 0.0003
  });
  
  summarize = jest.fn().mockResolvedValue({
    summaryId: 'mock-summary-id',
    summaryText: 'Mock summary',
    summaryJSON: { key: 'value' },
    modelUsed: 'claude-sonnet-4-20250514',
    duration: 100,
    inputTokens: 50,
    outputTokens: 20,
    cost: 0.001,
    isPartial: false,
    parsingErrors: []
  });
}

// Export the singleton instance
export const claudeClient = new ClaudeClient();

// Export types needed by importing modules
export type ClaudeMessage = {
  role: string;
  content: string;
};

export type ClaudeResponse = {
  id: string;
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  cost: { inputCost: number; outputCost: number; totalCost: number };
};

export type ClaudeRequestOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
};

// Export the mockResponse for use in tests
export const testResponse = mockResponse;
