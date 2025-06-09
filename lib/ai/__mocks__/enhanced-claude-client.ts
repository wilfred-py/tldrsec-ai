/**
 * Mock for enhanced-claude-client.ts
 * This prevents the actual Enhanced Claude client from being loaded in tests
 */

import { jest } from '@jest/globals';
import { ClaudeClient } from './claude-client';

// Export the interface for type checking
export interface EnhancedClaudeOptions {
  summaryId?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
}

// Export a mock implementation
export class EnhancedClaudeClient {
  baseClient: ClaudeClient;
  
  constructor(baseClient?: ClaudeClient) {
    this.baseClient = baseClient || new ClaudeClient();
  }
  
  async summarize(text: string, options?: EnhancedClaudeOptions) {
    return {
      summaryId: options?.summaryId || 'test-id',
      summaryText: `Processed ${text.substring(0, 10)}...`,
      summaryJSON: { key: 'value' },
      modelUsed: options?.modelName || 'claude-3-opus-20240229',
      duration: 100,
      inputTokens: 50,
      outputTokens: 20,
      cost: 0.001,
      isPartial: false
    };
  }
}

// Export the singleton instance
export const enhancedClaudeClient = new EnhancedClaudeClient();
