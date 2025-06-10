/**
 * Batch Processor Tests with doMock
 * 
 * Using jest.doMock to mock modules before they are imported
 */

// Import jest first
import { jest } from '@jest/globals';

// Mock ClaudeClient before any imports
jest.doMock('../../claude-client', () => {
  const mockClaudeClient = jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue({
      id: 'msg_123',
      content: 'Mock response',
      model: 'claude-3-opus-20240229',
      usage: { inputTokens: 10, outputTokens: 20 },
      cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 }
    }),
    getModelPricing: jest.fn().mockReturnValue({
      inputPricePerToken: 0.0001,
      outputPricePerToken: 0.0003
    }),
    summarize: jest.fn().mockResolvedValue({
      summaryText: 'Mock summary',
      summaryJSON: { key: 'value' }
    })
  }));

  return {
    ClaudeClient: mockClaudeClient,
    claudeClient: {
      sendMessage: jest.fn(),
      getModelPricing: jest.fn(),
      summarize: jest.fn()
    }
  };
});

// Mock enhanced-claude-client
jest.doMock('../../enhanced-claude-client', () => {
  const mockClient = {
    on: jest.fn(),
    emit: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({
      content: 'Mock enhanced response'
    }),
    summarize: jest.fn().mockResolvedValue({
      summaryId: 'mock-id',
      summaryText: 'Mock summary',
      summaryJSON: { key: 'value' },
      modelUsed: 'claude-3-opus-20240229',
      duration: 100,
      inputTokens: 50,
      outputTokens: 20,
      cost: 0.001,
      isPartial: false,
      parsingErrors: []
    }),
    getBaseClient: jest.fn().mockReturnValue({})
  };

  const MockEnhancedClaudeClient = jest.fn().mockImplementation(() => mockClient);

  return {
    EnhancedClaudeClient: MockEnhancedClaudeClient,
    enhancedClaudeClient: mockClient,
    default: mockClient
  };
});

// Mock chunk-processor
jest.doMock('../chunk-processor', () => ({
  processSingleChunk: jest.fn().mockResolvedValue({
    summaryId: 'mock-chunk-id',
    summaryText: 'Mock chunk summary',
    summaryJSON: { key: 'chunk-value' },
    modelUsed: 'claude-3-opus-20240229',
    duration: 50,
    inputTokens: 25,
    outputTokens: 10,
    cost: 0.0005,
    isPartial: false,
    parsingErrors: []
  })
}));

// Mock logging and monitoring
jest.doMock('../../../logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }
}));

jest.doMock('../../../monitoring', () => ({
  monitoring: {
    recordMetric: jest.fn(),
    incrementCounter: jest.fn()
  }
}));

// Now import the module under test AFTER all mocks are set up
import { processAllChunks } from '../batch-processor';
import { processSingleChunk } from '../chunk-processor';
import type { SECFilingType } from '../../prompts/prompt-types';

describe('Batch Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processAllChunks should process multiple chunks', async () => {
    // Mock implementation for processSingleChunk
    (processSingleChunk as jest.Mock).mockImplementation((chunk) => {
      return Promise.resolve({
        summaryId: `chunk-${chunk}`,
        summaryText: `Summary for ${chunk}`,
        summaryJSON: { content: chunk },
        modelUsed: 'claude-3-opus-20240229',
        duration: 50,
        inputTokens: 25,
        outputTokens: 10,
        cost: 0.0005,
        isPartial: false,
        parsingErrors: []
      });
    });

    // Test data
    const chunks = ['chunk1', 'chunk2', 'chunk3'];
    const filingType = 'annual' as SECFilingType;
    const filingRecord = { id: 'filing-123', name: 'Test Filing' };
    const options = { summaryId: 'test-summary-id' };

    // Execute the function
    const result = await processAllChunks(chunks, filingType, filingRecord, options);

    // Verify the result
    expect(result).toBeDefined();
    expect(processSingleChunk).toHaveBeenCalledTimes(chunks.length);
    
    // Each chunk should have been processed
    chunks.forEach((chunk, index) => {
      expect(processSingleChunk).toHaveBeenCalledWith(
        chunk,
        filingType,
        filingRecord,
        expect.objectContaining({
          summaryId: expect.any(String)
        })
      );
    });
  });
});
