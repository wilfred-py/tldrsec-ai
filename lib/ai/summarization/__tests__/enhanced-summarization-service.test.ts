/**
 * Enhanced Summarization Service Tests
 * 
 * Tests for the enhanced summarization service
 */

// Import the EnhancedSummarizationResult type first to use in mock values
import { EnhancedSummarizationResult } from '../types';

// Create mock result for tests with proper typing
const mockResultValue: EnhancedSummarizationResult = {
  summaryId: 'test-summary-id',
  summaryText: 'Test summary',
  summaryJSON: { key: 'value' },
  modelUsed: 'claude-sonnet-4-20250514', // Required non-optional property
  duration: 1000,
  inputTokens: 500,
  outputTokens: 200,
  cost: 0.05,
  isPartial: false
};

// Mock chunking function
jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/chunking/enhanced-chunker', () => ({
  processDocumentContent: jest.fn().mockImplementation(() => ({
    chunks: ['Small chunk']
  }))
}));

// Mock dependencies before importing the module under test
jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }))
}));

jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/claude-client', () => ({
  claudeClient: {
    sendMessage: jest.fn()
  }
}));

jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/enhanced-claude-client', () => ({
  enhancedClaudeClient: {
    sendMessage: jest.fn()
  }
}));

// Use a more explicit mock implementation with proper typing
jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/summarization/chunk-processor', () => ({
  processSingleChunk: jest.fn().mockImplementation(() => Promise.resolve(mockResultValue))
}));

// Use a more explicit mock implementation with proper typing
jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/summarization/batch-processor', () => ({
  processAllChunks: jest.fn().mockImplementation(() => Promise.resolve(mockResultValue))
}));

jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/summarization/db-utils', () => ({
  updateSummaryWithPartialResult: jest.fn(),
  updateSummaryWithResult: jest.fn()
}));

jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/cache/summary-cache', () => ({
  summaryCache: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

// Mock filing extractor with proper typing
jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/parsers/filing-extractor', () => ({
  extractFilingContent: jest.fn().mockImplementation(() => Promise.resolve('Mock filing content'))
}));

// Mock prisma with proper typing
jest.mock('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/db/prisma', () => ({
  prisma: {
    filing: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve({
        id: 'mock-filing-id',
        companyName: 'Mock Company',
        filingDate: '2023-01-01',
        ticker: { symbol: 'MOCK' }
      }))
    },
    summary: {
      update: jest.fn().mockImplementation(() => Promise.resolve({}))
    }
  }
}));

import { jest } from '@jest/globals';
import { EnhancedSummarizationService, SummarizationEvent, EnhancedSummarizationOptions } from '../enhanced-summarization-service';
// Import the SECFilingType as a type only
import type { SECFilingType } from '../../prompts/prompt-types';

// Import mocked functions - these are already mocked in setup-mocks.ts
// Import mocked functions
import { processSingleChunk } from '../chunk-processor';
import { processAllChunks } from '../batch-processor';
import { updateSummaryWithPartialResult, updateSummaryWithResult } from '../db-utils';
import { summaryCache } from '../../cache/summary-cache';

// Create properly typed mock functions
type MockFunction<T extends (...args: unknown[]) => unknown> = jest.MockedFunction<T>;

const mockedProcessSingleChunk = processSingleChunk as MockFunction<typeof processSingleChunk>;
const mockedProcessAllChunks = processAllChunks as MockFunction<typeof processAllChunks>;
const mockedUpdateSummaryWithPartialResult = updateSummaryWithPartialResult as MockFunction<typeof updateSummaryWithPartialResult>;
const mockedUpdateSummaryWithResult = updateSummaryWithResult as MockFunction<typeof updateSummaryWithResult>;
// mockedExtractFilingContent is defined but not used in current tests
// const mockedExtractFilingContent = extractFilingContent as MockFunction<typeof extractFilingContent>;

// Cast the mock to the right type
// mockedSummaryCache is defined but not used in current tests
// const mockedSummaryCache = {
//   get: summaryCache.get as MockFunction<typeof summaryCache.get>,
//   set: summaryCache.set as MockFunction<typeof summaryCache.set>
// };

describe('EnhancedSummarizationService', () => {
  // Test data
  const mockFilingId = 'test-filing-id';
  const mockOptions: EnhancedSummarizationOptions = {
    filingId: mockFilingId,
    summaryId: 'test-summary-id',
    useCache: true,
    filingType: '10-K' as SECFilingType, // Use string literal type as defined in prompt-types.ts
    processAllChunks: true,
    chunkMaxTokens: 10000, // Use the correct property name from the interface
    concurrencyLimit: 2 // Add concurrency limit from the interface
  };

  // Mock result objects
  const mockSummaryResult: EnhancedSummarizationResult = {
    summaryId: mockOptions.summaryId,
    summaryText: 'Test summary',
    summaryJSON: { key: 'value' },
    modelUsed: 'claude-sonnet-4-20250514', // Required non-optional property
    model: 'claude-sonnet-4-20250514',
    duration: 1000,
    inputTokens: 500,
    outputTokens: 200,
    cost: 0.05,
    isPartial: false
  };

  const mockCachedResult: EnhancedSummarizationResult = {
    summaryId: mockOptions.summaryId,
    summaryText: 'Cached summary result',
    summaryJSON: { key: 'cached value' },
    modelUsed: 'claude-sonnet-4-20250514', // Required non-optional property
    model: 'claude-sonnet-4-20250514',
    duration: 500,
    inputTokens: 300,
    outputTokens: 100,
    cost: 0.02,
    isPartial: false
  };

  // Setup service instance and mocks
  let service: EnhancedSummarizationService;
  let eventSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks for chunk and batch processors
    mockedProcessSingleChunk.mockReset();
    mockedProcessAllChunks.mockReset();

    // Setup default mock behaviors
    mockedProcessSingleChunk.mockResolvedValue(mockSummaryResult);
    mockedProcessAllChunks.mockResolvedValue(mockSummaryResult);
    (summaryCache.get as jest.MockedFunction<typeof summaryCache.get>).mockResolvedValue(null);
    mockedUpdateSummaryWithPartialResult.mockResolvedValue(undefined);
    mockedUpdateSummaryWithResult.mockResolvedValue(undefined);

    // Create service instance
    service = new EnhancedSummarizationService();

    // Spy on event emitter
    eventSpy = jest.spyOn(service, 'emit');

    // Mock internal methods to avoid external dependencies
    // These methods are private, so we need to access them via 'as any'
    // Use proper typing for the mock functions with mockImplementation
    (service as any)._getFilingContent = jest.fn().mockImplementation(() => Promise.resolve('Mock filing content'));
    (service as any)._getFilingRecord = jest.fn().mockImplementation(() => Promise.resolve({
      id: mockFilingId,
      companyName: 'Mock Company',
      filingDate: '2023-01-01',
      ticker: { symbol: 'MOCK' }
    }));
    
    // Mock _shouldUseChunking method that might be called
    (service as any)._shouldUseChunking = jest.fn().mockReturnValue(false);

    // Reset the chunking mock to default value
    const { processDocumentContent } = require('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/chunking/enhanced-chunker');
    (processDocumentContent as jest.Mock).mockReturnValue({
      chunks: ['Single chunk']
    });
  });

  describe('summarize method', () => {
    it('should use cached result when available', async () => {
      // Mock cache hit with proper typing
      (summaryCache.get as jest.MockedFunction<typeof summaryCache.get>).mockResolvedValueOnce(mockCachedResult);

      const result = await service.summarize(mockFilingId, mockOptions);

      expect(result).toEqual(mockCachedResult);
      expect(eventSpy).toHaveBeenCalledWith(SummarizationEvent.CACHED_RESULT, expect.any(Object));
      expect(mockedProcessSingleChunk).not.toHaveBeenCalled();
      expect(mockedProcessAllChunks).not.toHaveBeenCalled();
    });

    it('should emit PROCESSING event when processing begins', async () => {
      await service.summarize(mockFilingId, mockOptions);

      expect(eventSpy).toHaveBeenCalledWith(
        SummarizationEvent.PROCESSING,
        expect.objectContaining({
          filingId: mockFilingId
        })
      );
    });

    it('should emit COMPLETE event when summarization completes', async () => {
      await service.summarize(mockFilingId, mockOptions);

      expect(eventSpy).toHaveBeenCalledWith(
        SummarizationEvent.COMPLETE,
        expect.objectContaining({
          filingId: mockFilingId,
          result: expect.any(Object)
        })
      );
    });

    it('should process single chunk when text is small', async () => {
      // Mock to simulate small text
      // Update mock implementations with proper typing
      (service as any)._getFilingContent = jest.fn().mockImplementation(() => Promise.resolve('Small text'));
      (service as any)._shouldUseChunking = jest.fn().mockImplementation(() => false);

      const mockSingleChunkResult: EnhancedSummarizationResult = {
        summaryId: mockOptions.summaryId,
        summaryText: 'Single chunk summary',
        summaryJSON: { key: 'single chunk value' },
        modelUsed: 'claude-sonnet-4-20250514', // Required non-optional property
        model: 'claude-sonnet-4-20250514',
        duration: 800,
        inputTokens: 400,
        outputTokens: 150,
        cost: 0.04,
        isPartial: false
      };
      mockedProcessSingleChunk.mockResolvedValue(mockSingleChunkResult);

      const result = await service.summarize(mockFilingId, { ...mockOptions, processAllChunks: false });

      expect(mockedProcessSingleChunk).toHaveBeenCalled();
      expect(mockedProcessAllChunks).not.toHaveBeenCalled();
      expect(result).toEqual(mockSingleChunkResult);

      // Verify events
      expect(eventSpy).toHaveBeenCalledWith(
        SummarizationEvent.PROCESSING,
        expect.objectContaining({
          filingId: mockFilingId
        })
      );
      expect(eventSpy).toHaveBeenCalledWith(
        SummarizationEvent.COMPLETE,
        expect.objectContaining({
          filingId: mockFilingId,
          result: expect.any(Object)
        })
      );
    });

    it('should process multiple chunks when text is large', async () => {
      // Mock to simulate large text that needs chunking
      (service as any)._getFilingContent = jest.fn().mockImplementation(() => Promise.resolve('Large text that needs chunking'));
      
      // Import the chunking module to mock it for this specific test
      const { processDocumentContent } = require('/Users/wilf/Software/Windsurf Projects/tldrsec-ai/lib/ai/chunking/enhanced-chunker');
      
      // Override the mock for this test to return multiple chunks
      (processDocumentContent as jest.Mock).mockReturnValue({
        chunks: ['Chunk 1', 'Chunk 2']
      });
      

      const mockBatchResult: EnhancedSummarizationResult = {
        summaryId: mockOptions.summaryId,
        summaryText: 'Batch processed summary',
        summaryJSON: { key: 'batch processed value' },
        modelUsed: 'claude-sonnet-4-20250514', // Required non-optional property
        model: 'claude-sonnet-4-20250514',
        duration: 2000,
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.04,
        isPartial: false,
        chunkResults: [
          {
            isPartial: false,
            inputTokens: 100,
            outputTokens: 50,
            cost: 0.02
          },
          {
            isPartial: false,
            inputTokens: 100,
            outputTokens: 50,
            cost: 0.02
          }
        ]
      };
      mockedProcessAllChunks.mockResolvedValue(mockBatchResult);

      const result = await service.summarize(mockFilingId, { ...mockOptions, processAllChunks: true });

      expect(mockedProcessSingleChunk).not.toHaveBeenCalled();
      expect(mockedProcessAllChunks).toHaveBeenCalled();
      expect(result).toEqual(mockBatchResult);

      // Verify events
      expect(eventSpy).toHaveBeenCalledWith(
        SummarizationEvent.PROCESSING,
        expect.objectContaining({
          filingId: mockFilingId
        })
      );
      expect(eventSpy).toHaveBeenCalledWith(
        SummarizationEvent.COMPLETE,
        expect.objectContaining({
          filingId: mockFilingId,
          result: expect.any(Object)
        })
      );
    });

    it('should handle errors and emit error event', async () => {
      // Mock error in processing
      const testError = new Error('Test error');
      mockedProcessSingleChunk.mockRejectedValue(testError);

      await expect(service.summarize(mockFilingId, { ...mockOptions, processAllChunks: false }))
        .rejects.toThrow();

      expect(eventSpy).toHaveBeenCalledWith(
        SummarizationEvent.ERROR,
        expect.objectContaining({
          filingId: mockFilingId,
          error: testError
        })
      );
    });
  });

  describe('event subscription', () => {
    it('should allow subscribing to events', () => {
      const mockHandler = jest.fn();

      service.on(SummarizationEvent.START, mockHandler);
      service.emit(SummarizationEvent.START, { filingId: mockFilingId });

      expect(mockHandler).toHaveBeenCalledWith({ filingId: mockFilingId });
    });
    
    it('should allow unsubscribing from events', () => {
      const mockHandler = jest.fn();
      
      service.on(SummarizationEvent.START, mockHandler);
      service.off(SummarizationEvent.START, mockHandler);
      service.emit(SummarizationEvent.START, { filingId: mockFilingId });
      
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});
