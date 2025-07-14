/**
 * Mock for batch-processor.ts
 * This prevents the actual implementation from being loaded in tests
 */

import { jest } from '@jest/globals';
import type { EnhancedSummarizationResult } from '../../types';

// Create a mock implementation of processAllChunks
export const processAllChunks = jest.fn((...args: any[]): Promise<EnhancedSummarizationResult> => {
  // Extract chunks from args if available
  const chunks = Array.isArray(args[0]) ? args[0] : [];
  
  return Promise.resolve({
    summaryId: 'mock-summary-id',
    summaryText: 'Mock batch summary',
    summaryJSON: { key: 'value' },
    modelUsed: 'claude-sonnet-4-20250514',
    duration: 200,
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.002,
    chunkResults: chunks.map(() => ({
      summaryText: 'Mock chunk result',
      modelUsed: 'claude-sonnet-4-20250514',
      duration: 50,
      inputTokens: 25,
      outputTokens: 10,
      cost: 0.0005,
      isPartial: false,
      parsingErrors: []
    })),
    isPartial: false,
    parsingErrors: []
  });
});
