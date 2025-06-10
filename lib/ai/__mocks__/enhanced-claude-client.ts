/**
 * Mock for enhanced-claude-client.ts
 * This prevents the actual enhanced Claude client from being loaded in tests
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { ClaudeClient } from './claude-client';

// Define types that may be imported by other modules
export type EnhancedClaudeOptions = {
  summaryId?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  useStreaming?: boolean;
  useCache?: boolean;
  cacheKey?: any;
};

export type ClaudeMessage = any;
export type ClaudeResponse = any;
export type ClaudeRequestOptions = any;

// Create a mock for EnhancedClaudeClient
export class EnhancedClaudeClient extends EventEmitter {
  // Store the base client
  private baseClient: any;
  
  constructor(baseClient?: any) {
    super();
    // Create a new ClaudeClient if none provided
    this.baseClient = baseClient || new ClaudeClient();
  }
  
  // Mock methods with jest functions
  sendMessage = jest.fn().mockImplementation(() => {
    return Promise.resolve({
      id: 'msg_123',
      content: 'Mock enhanced response',
      model: 'claude-3-opus-20240229',
      usage: { inputTokens: 10, outputTokens: 20 },
      cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 }
    });
  });
  
  sendStreamingMessage = jest.fn().mockImplementation(() => {
    return Promise.resolve({
      id: 'msg_123',
      content: 'Mock streaming response',
      model: 'claude-3-opus-20240229',
      usage: { inputTokens: 10, outputTokens: 20 },
      cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 }
    });
  });
  
  summarize = jest.fn().mockImplementation(() => {
    return Promise.resolve({
      summaryId: 'mock-summary-id',
      summaryText: 'Mock summary',
      summaryJSON: { key: 'value' },
      modelUsed: 'claude-3-opus-20240229',
      duration: 100,
      inputTokens: 50,
      outputTokens: 20,
      cost: 0.001,
      isPartial: false,
      parsingErrors: []
    });
  });
  
  processDocument = jest.fn().mockImplementation(() => {
    return Promise.resolve({
      summaryId: 'mock-doc-id',
      summaryText: 'Mock document summary',
      summaryJSON: { key: 'value' },
      modelUsed: 'claude-3-opus-20240229',
      duration: 200,
      inputTokens: 100,
      outputTokens: 40,
      cost: 0.002,
      isPartial: false,
      parsingErrors: []
    });
  });
  
  processBatch = jest.fn().mockImplementation(() => {
    return Promise.resolve({
      summaryId: 'mock-batch-id',
      summaryText: 'Mock batch summary',
      summaryJSON: { key: 'value' },
      modelUsed: 'claude-3-opus-20240229',
      duration: 500,
      inputTokens: 250,
      outputTokens: 100,
      cost: 0.005,
      isPartial: false,
      parsingErrors: [],
      chunkResults: []
    });
  });
  
  getBaseClient = jest.fn().mockImplementation(() => {
    return this.baseClient;
  });
  
  // Add EventEmitter methods as jest mocks
  on = jest.fn().mockImplementation(() => this);
  emit = jest.fn().mockImplementation(() => true);
  once = jest.fn().mockImplementation(() => this);
  removeListener = jest.fn().mockImplementation(() => this);
}

// Create a singleton instance
const enhancedClientInstance = new EnhancedClaudeClient();

// Export the singleton as both default and named export to support different import styles
export const enhancedClaudeClient = enhancedClientInstance;
export default enhancedClientInstance;
