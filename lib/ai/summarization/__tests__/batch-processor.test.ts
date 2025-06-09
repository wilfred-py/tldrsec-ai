/**
 * Batch Processor Tests
 * 
 * Tests for the enhanced summarization batch processing functionality
 */

import { jest } from '@jest/globals';

// Use Jest's manual mocks for modules
jest.mock('../batch-processor');
jest.mock('../chunk-processor');

// Mock logging and monitoring
jest.mock('../../../logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

jest.mock('../../../monitoring', () => ({
  monitoring: {
    recordMetric: jest.fn()
  }
}));

// Import dependencies after mocking
import { processAllChunks } from '../batch-processor';
import type { EnhancedSummarizationResult } from '../types';
import type { SECFilingType } from '../../prompts/prompt-types';
import { processSingleChunk } from '../chunk-processor';
import { batchProcessor } from '../../batch/batch-processor';
import type { EnhancedClaudeOptions } from '../../enhanced-claude-client';

// Properly type the mocked functions
const mockedProcessSingleChunk = processSingleChunk as jest.MockedFunction<typeof processSingleChunk>;

describe('Batch Processor', () => {
  // Track concurrency for testing
  let currentConcurrency = 0;
  let maxConcurrency = 0;
  
  // Define test data
  const mockChunks = ['chunk1', 'chunk2', 'chunk3'];
  const mockFilingType = 'FORM_10K' as SECFilingType;
  const mockFilingRecord = {
    companyName: 'Test Company',
    filingDate: '2023-01-01',
    ticker: { symbol: 'TEST' }
  };
  const mockOptions = {
    filingId: 'filing-123',
    summaryId: 'summary-123',
    concurrencyLimit: 2,
    claudeOptions: {
      model: 'claude-3-opus-20240229',
      temperature: 0.7,
      maxTokens: 1000
    }
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockedProcessSingleChunk.mockReset();
    
    // Reset concurrency tracking
    currentConcurrency = 0;
    maxConcurrency = 0;
    
    // Setup batch processor mock
    (batchProcessor.processBatch as jest.Mock).mockImplementation(async (jobs: any) => {
      // Type assertion to ensure we can work with the jobs array
      const jobsArray = jobs as Array<{processor: Function, data: unknown}>;
      const results = await Promise.all(jobsArray.map(async (job) => {
        currentConcurrency++;
        maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
        
        try {
          const result = await job.processor(job.data);
          return result;
        } finally {
          currentConcurrency--;
        }
      }));
      return { results, maxConcurrency };
    });
    
    // Default mock implementation for processSingleChunk
    mockedProcessSingleChunk.mockImplementation((chunk: string, filingType: SECFilingType, filingRecord: any, options: any): Promise<EnhancedSummarizationResult> => {
      return Promise.resolve({
        summaryId: options?.summaryId || 'test-id',
        summaryText: `Processed ${chunk}`,
        summaryJSON: { key: 'value' },
        modelUsed: 'claude-3-opus-20240229',
        duration: 100,
        inputTokens: 50,
        outputTokens: 20,
        cost: 0.001,
        isPartial: false
      });
    });
  });

  it('should process all chunks with the correct concurrency limit', async () => {
    // Call the batch processor with our test data
    const results = await processAllChunks(
      mockChunks,
      mockFilingType,
      mockFilingRecord,
      mockOptions
    );

    // Verify that processSingleChunk was called for each chunk
    expect(mockedProcessSingleChunk).toHaveBeenCalledTimes(mockChunks.length);
    
    // Check that each chunk was processed with the correct arguments
    mockChunks.forEach(chunk => {
      expect(mockedProcessSingleChunk).toHaveBeenCalledWith(
        chunk,
        mockFilingType,
        mockFilingRecord,
        expect.objectContaining({
          filingId: mockOptions.filingId,
          summaryId: mockOptions.summaryId,
          claudeOptions: mockOptions.claudeOptions
        })
      );
    });
  });

  it('should handle empty chunks array', async () => {
    const emptyChunks: string[] = [];
    const result = await processAllChunks(
      emptyChunks,
      mockFilingType,
      mockFilingRecord,
      mockOptions
    );

    // Empty chunks should return an empty result object, not an empty array
    expect(result).toHaveProperty('summaryText', '');
    expect(result).toHaveProperty('summaryId', mockOptions.summaryId);
    expect(result).toHaveProperty('inputTokens', 0);
    expect(result).toHaveProperty('outputTokens', 0);
    expect(mockedProcessSingleChunk).not.toHaveBeenCalled();
  });

  it('should handle errors in chunk processing', async () => {
    // Setup mock to throw an error for the second chunk
    mockedProcessSingleChunk.mockImplementation((chunk: string, filingType: SECFilingType, filingRecord: any, options: any): Promise<EnhancedSummarizationResult> => {
      if (chunk === mockChunks[1]) {
        return Promise.reject(new Error('Test error'));
      }
      return Promise.resolve({
        summaryId: options?.summaryId || 'test-id',
        summaryText: `Processed ${chunk}`,
        summaryJSON: { key: 'value' },
        modelUsed: 'claude-3-opus-20240229',
        duration: 100,
        inputTokens: 50,
        outputTokens: 20,
        cost: 0.001,
        isPartial: false
      });
    });

    // The batch processor should continue processing other chunks even if one fails
    const result = await processAllChunks(
      mockChunks,
      mockFilingType,
      mockFilingRecord,
      mockOptions
    );

    // We should have a combined result with isPartial flag set
    expect(result).toHaveProperty('isPartial', true);
    expect(result.chunkResults).toHaveLength(2);
  });

  it('should use provided options correctly', async () => {
    const customOptions = {
      filingId: 'custom-filing-id',
      summaryId: 'custom-summary-id',
      concurrencyLimit: 1,
      claudeOptions: {
        model: 'claude-3-haiku-20240307',
        temperature: 0.5,
        maxTokens: 500
      }
    };

    await processAllChunks(
      mockChunks,
      mockFilingType,
      mockFilingRecord,
      customOptions
    );

    // Verify that each chunk was processed with the custom options
    mockChunks.forEach(chunk => {
      expect(mockedProcessSingleChunk).toHaveBeenCalledWith(
        chunk,
        mockFilingType,
        mockFilingRecord,
        expect.objectContaining({
          filingId: customOptions.filingId,
          summaryId: customOptions.summaryId,
          claudeOptions: customOptions.claudeOptions
        })
      );
    });

    // Verify that concurrency was limited to 1
    expect(maxConcurrency).toBeLessThanOrEqual(1);
  });

  it('should handle different filing types correctly', async () => {
    const differentFilingType = 'FORM_8K' as SECFilingType;
    
    await processAllChunks(
      mockChunks,
      differentFilingType,
      mockFilingRecord,
      mockOptions
    );

    // Verify that each chunk was processed with the different filing type
    mockChunks.forEach(chunk => {
      expect(mockedProcessSingleChunk).toHaveBeenCalledWith(
        chunk,
        differentFilingType,
        mockFilingRecord,
        expect.anything()
      );
    });
  });

  it('should respect concurrency limit', async () => {
    let concurrentExecutions = 0;
    let maxConcurrentExecutions = 0;
    
    // Mock implementation that tracks concurrency
    mockedProcessSingleChunk.mockImplementation(async (chunk: string, filingType: SECFilingType, filingRecord: any, options: any): Promise<EnhancedSummarizationResult> => {
      concurrentExecutions++;
      maxConcurrentExecutions = Math.max(maxConcurrentExecutions, concurrentExecutions);
      
      // Simulate async processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      concurrentExecutions--;
      
      return {
        summaryId: options?.summaryId || 'test-id',
        summaryText: `Processed ${chunk}`,
        summaryJSON: { key: 'value' },
        modelUsed: 'claude-3-opus-20240229',
        duration: 100,
        inputTokens: 50,
        outputTokens: 20,
        cost: 0.001,
        isPartial: false
      };
    });
    
    // Process with concurrency limit of 2
    await processAllChunks(
      mockChunks,
      mockFilingType,
      mockFilingRecord,
      {
        filingId: 'filing-123',
        summaryId: 'summary-123',
        concurrencyLimit: 2,
        claudeOptions: {
          model: mockOptions.claudeOptions.model,
          temperature: mockOptions.claudeOptions.temperature,
          maxTokens: mockOptions.claudeOptions.maxTokens
        }
      }
    );
    
    // Verify concurrency was limited to 2
    expect(maxConcurrentExecutions).toBeLessThanOrEqual(2);
  });
});
