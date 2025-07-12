/**
 * Setup mocks for tests
 * This file should be imported before any other imports in test files
 */

import { jest } from '@jest/globals';

// Mock Anthropic client
jest.mock('@anthropic-ai/sdk', () => {
  const mockAnthropicInstance = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: 'Mock response' }],
        usage: { input_tokens: 10, output_tokens: 20 }
      })
    }
  };
  
  return {
    Anthropic: jest.fn().mockImplementation(() => mockAnthropicInstance)
  };
});

// Mock Claude client
jest.mock('../../claude-client', () => {
  const mockResponse = {
    content: 'Mock response',
    usage: { inputTokens: 10, outputTokens: 20 },
    model: 'claude-sonnet-4-20250514',
    cost: { totalCost: 0.01 }
  };
  
  return {
    claudeClient: {
      sendMessage: jest.fn().mockResolvedValue(mockResponse)
    }
  };
});

// Mock Enhanced Claude client
jest.mock('../../enhanced-claude-client', () => {
  const mockResponse = {
    content: 'Mock response',
    usage: { inputTokens: 10, outputTokens: 20 },
    model: 'claude-sonnet-4-20250514',
    cost: { totalCost: 0.01 }
  };
  
  return {
    enhancedClaudeClient: {
      sendMessage: jest.fn().mockResolvedValue(mockResponse)
    }
  };
});

// Mock other dependencies
jest.mock('../chunk-processor', () => ({
  processSingleChunk: jest.fn()
}));

jest.mock('../batch-processor', () => ({
  processAllChunks: jest.fn()
}));

jest.mock('../db-utils', () => ({
  updateSummaryWithPartialResult: jest.fn(),
  updateSummaryWithResult: jest.fn()
}));

jest.mock('../../cache/summary-cache', () => ({
  summaryCache: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

jest.mock('../../parsers/filing-extractor', () => ({
  extractFilingContent: jest.fn()
}));

jest.mock('../../db/prisma', () => ({
  prisma: {
    filing: {
      findUnique: jest.fn()
    }
  }
}));
