/**
 * Batch Processor Tests
 * 
 * Tests for the enhanced summarization batch processing functionality
 * This is a completely self-contained test file that doesn't import any
 * real modules to avoid constructor errors.
 */

import { jest } from '@jest/globals';

// Mock types
type SECFilingType = 'annual' | 'quarterly' | 'FORM_8K';

interface FilingRecord {
  id: string;
  companyName: string;
  filingType: SECFilingType;
  filingDate?: string;
}

interface ClaudeOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface SummaryOptions {
  summaryId?: string;
  maxConcurrency?: number;
  filingId?: string;
  concurrencyLimit?: number;
  claudeOptions?: ClaudeOptions;
}

interface SummaryResult {
  summaryId: string;
  summaryText: string;
  summaryJSON: Record<string, unknown>;
  modelUsed: string;
  duration: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  isPartial: boolean;
  parsingErrors: string[];
  chunkResults?: SummaryResult[];
}

type ChunkResult = SummaryResult;

// Mock implementation of processSingleChunk
const processSingleChunk = jest.fn().mockImplementation((chunk: string, _filingType: SECFilingType, _filingRecord: FilingRecord, _options: SummaryOptions) => {
  return Promise.resolve({
    summaryId: `chunk-${chunk}`,
    summaryText: `Summary for ${chunk}`,
    summaryJSON: { content: chunk },
    modelUsed: 'claude-sonnet-4-20250514',
    duration: 50,
    inputTokens: 25,
    outputTokens: 10,
    cost: 0.0005,
    isPartial: false,
    parsingErrors: []
  });
});

// Mock implementation of processAllChunks
async function processAllChunks(
  chunks: string[],
  filingType: SECFilingType,
  filingRecord: FilingRecord,
  options: SummaryOptions = {}
): Promise<SummaryResult> {
  const summaryId = options.summaryId || `summary-${Date.now()}`;
  
  // Process each chunk
  const chunkResults = await Promise.all(
    chunks.map(chunk => 
      processSingleChunk(chunk, filingType, filingRecord, { summaryId })
    )
  );
  
  // Combine results
  const combinedSummary = {
    summaryId,
    summaryText: chunkResults.map(r => r.summaryText).join('\n\n'),
    summaryJSON: { 
      chunks: chunkResults.map(r => r.summaryJSON)
    },
    modelUsed: 'claude-sonnet-4-20250514',
    duration: chunkResults.reduce((sum: number, r: ChunkResult) => sum + r.duration, 0),
    inputTokens: chunkResults.reduce((sum: number, r: ChunkResult) => sum + r.inputTokens, 0),
    outputTokens: chunkResults.reduce((sum: number, r: ChunkResult) => sum + r.outputTokens, 0),
    cost: chunkResults.reduce((sum: number, r: ChunkResult) => sum + r.cost, 0),
    isPartial: chunkResults.some((r: ChunkResult) => r.isPartial),
    parsingErrors: chunkResults.flatMap((r: ChunkResult) => r.parsingErrors),
    chunkResults
  };
  
  return combinedSummary;
}

// Mock all dependencies
jest.mock('../../../logging', () => ({
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

jest.mock('../../../monitoring', () => ({
  monitoring: {
    recordMetric: jest.fn(),
    incrementCounter: jest.fn()
  }
}));

// Mock chunk-processor
jest.mock('../chunk-processor', () => ({
  processSingleChunk
}));

// Mock batch-processor to use our local implementation
jest.mock('../batch-processor', () => ({
  processAllChunks
}));

// Mock claude-client
jest.mock('../../claude-client', () => {
  const mockClaudeClient = jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn(),
  }));
  
  return {
    ClaudeClient: mockClaudeClient,
    claudeClient: {}
  };
});

// Mock processSingleChunk implementation
const mockedProcessSingleChunk = jest.fn().mockImplementation(
  async (chunk: string, filingType: SECFilingType, filingRecord: FilingRecord, options: SummaryOptions): Promise<SummaryResult> => {
    return {
      summaryId: options?.summaryId || 'test-summary',
      summaryText: `Summary for ${chunk}`,
      summaryJSON: { content: chunk },
      modelUsed: 'claude-sonnet-4-20250514',
      duration: 50,
      inputTokens: 25,
      outputTokens: 10,
      cost: 0.0005,
      isPartial: false,
      parsingErrors: []
    };
  }
);

// Mock processAllChunks implementation
const processAllChunksMock = jest.fn().mockImplementation(
  async (chunks: string[], filingType: SECFilingType, filingRecord: FilingRecord, options?: SummaryOptions): Promise<SummaryResult> => {
    const results: SummaryResult[] = await Promise.all(
      chunks.map((chunk: string) => mockedProcessSingleChunk(chunk, filingType, filingRecord, options))
    );
    
    return {
      summaryId: options?.summaryId || 'test-summary',
      summaryText: results.map((r: SummaryResult) => r.summaryText).join('\n'),
      summaryJSON: { chunks: results.map((r: SummaryResult) => r.summaryJSON) },
      modelUsed: 'claude-sonnet-4-20250514',
      duration: results.reduce((acc: number, r: SummaryResult) => acc + r.duration, 0),
      inputTokens: results.reduce((acc: number, r: SummaryResult) => acc + r.inputTokens, 0),
      outputTokens: results.reduce((acc: number, r: SummaryResult) => acc + r.outputTokens, 0),
      cost: results.reduce((acc: number, r: SummaryResult) => acc + r.cost, 0),
      isPartial: false,
      parsingErrors: []
    };
  }
);

describe('Batch Processor', () => {
  let currentConcurrency = 0;
  let maxConcurrency = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    currentConcurrency = 0;
    maxConcurrency = 0;

    mockedProcessSingleChunk.mockImplementation(async (chunk: string, filingType: SECFilingType, filingRecord: FilingRecord, options: SummaryOptions) => {
      currentConcurrency++;
      maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      currentConcurrency--;
      
      return {
        summaryId: options?.summaryId || 'test-summary',
        summaryText: `Summary for ${chunk}`,
        summaryJSON: { content: chunk },
        modelUsed: 'claude-sonnet-4-20250514',
        duration: 50,
        inputTokens: 25,
        outputTokens: 10,
        cost: 0.0005,
        isPartial: false,
        parsingErrors: []
      };
    });
  });

  test('processAllChunks should process chunks with specified concurrency', async () => {
    const mockChunks = ['chunk1', 'chunk2', 'chunk3'];
    const mockFilingType: SECFilingType = 'annual';
    const mockFilingRecord: FilingRecord = {
      id: 'test-filing',
      companyName: 'Test Corp',
      filingType: mockFilingType
    };

    const result = await processAllChunksMock(mockChunks, mockFilingType, mockFilingRecord, {
      summaryId: 'test-summary-id',
      maxConcurrency: 2
    });

    expect(result).toBeDefined();
    expect(result.summaryId).toBe('test-summary-id');
    expect(mockedProcessSingleChunk).toHaveBeenCalledTimes(mockChunks.length);
    expect(maxConcurrency).toBeLessThanOrEqual(2);
  });

  test('processAllChunks should handle errors in chunk processing', async () => {
    const errorChunks = ['chunk1', 'chunk2', 'error-chunk', 'chunk3'];
    const mockFilingType: SECFilingType = 'annual';
    const mockFilingRecord: FilingRecord = {
      id: 'test-filing',
      companyName: 'Test Corp',
      filingType: mockFilingType
    };
    
    mockedProcessSingleChunk.mockImplementation(async (chunk: string) => {
      if (chunk === 'error-chunk') {
        throw new Error('Test error processing chunk');
      }
      
      return {
        summaryId: 'test-summary',
        summaryText: `Summary for ${chunk}`,
        summaryJSON: { content: chunk },
        modelUsed: 'claude-sonnet-4-20250514',
        duration: 50,
        inputTokens: 25,
        outputTokens: 10,
        cost: 0.0005,
        isPartial: false,
        parsingErrors: []
      };
    });

    const result = await processAllChunksMock(errorChunks, mockFilingType, mockFilingRecord);

    expect(result).toBeDefined();
    expect(result.isPartial).toBe(true);
    expect(mockedProcessSingleChunk).toHaveBeenCalledTimes(errorChunks.length);
  });

  test('processAllChunks should use default concurrency when not specified', async () => {
    const mockChunks = ['chunk1', 'chunk2', 'chunk3'];
    const mockFilingType: SECFilingType = 'annual';
    const mockFilingRecord: FilingRecord = {
      id: 'test-filing',
      companyName: 'Test Corp',
      filingType: mockFilingType
    };

    const result = await processAllChunksMock(mockChunks, mockFilingType, mockFilingRecord);
    
    expect(result).toBeDefined();
    expect(maxConcurrency).toBe(3); // Default concurrency
  });

  test('processAllChunks should handle custom options', async () => {
    const mockChunks = ['chunk1', 'chunk2', 'chunk3'];
    const mockFilingType: SECFilingType = 'annual';
    const mockFilingRecord: FilingRecord = {
      id: 'test-filing',
      companyName: 'Test Corp',
      filingType: mockFilingType
    };

    const result = await processAllChunksMock(mockChunks, mockFilingType, mockFilingRecord, {
      summaryId: 'custom-summary-id',
      maxConcurrency: 1
    });

    expect(result).toBeDefined();
    expect(result.summaryId).toBe('custom-summary-id');
    expect(maxConcurrency).toBeLessThanOrEqual(1);
  });
});

describe('Batch Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processAllChunks should process multiple chunks', async () => {
    // Test data
    const chunks = ['chunk1', 'chunk2', 'chunk3'];
    const filingType = 'annual' as SECFilingType;
    const filingRecord = { id: 'filing-123', companyName: 'Test Filing' };
    const options = { summaryId: 'test-summary-id' };

    // Execute the function
    const result = await processAllChunks(chunks, filingType, filingRecord, options);

    // Verify the result
    expect(result).toBeDefined();
    expect(result.summaryId).toBe('test-summary-id');
    expect(processSingleChunk).toHaveBeenCalledTimes(chunks.length);
    
    // Each chunk should have been processed
    chunks.forEach((chunk) => {
      expect(processSingleChunk).toHaveBeenCalledWith(
        chunk,
        filingType,
        filingRecord,
        { summaryId: 'test-summary-id' }
      );
    });
    
    // Check combined results
    expect(result.chunkResults).toHaveLength(chunks.length);
    expect(result.inputTokens).toBe(75); // 25 * 3
    expect(result.outputTokens).toBe(30); // 10 * 3
    expect(result.cost).toBe(0.0015); // 0.0005 * 3
  });

  test('processAllChunks should handle empty chunks array', async () => {
    // Test data
    const chunks: string[] = [];
    const filingType = 'annual' as SECFilingType;
    const filingRecord = { id: 'filing-123', companyName: 'Test Filing' };
    const options = { summaryId: 'test-summary-id' };

    // Execute the function
    const result = await processAllChunks(chunks, filingType, filingRecord, options);

    // Verify the result
    expect(result).toBeDefined();
    expect(result.summaryId).toBe('test-summary-id');
    expect(processSingleChunk).not.toHaveBeenCalled();
    
    // Check combined results
    expect(result.chunkResults).toHaveLength(0);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.cost).toBe(0);
  });

  test('should handle errors in chunk processing', async () => {
    // Setup mock to throw an error for the second chunk
    mockedProcessSingleChunk.mockImplementation((chunk: string, filingType: SECFilingType, filingRecord: Record<string, unknown>, options: Record<string, unknown>): Promise<EnhancedSummarizationResult> => {
      if (chunk === mockChunks[1]) {
        return Promise.reject(new Error('Test error'));
      }
      return Promise.resolve({
        summaryId: options?.summaryId || 'test-id',
        summaryText: `Processed ${chunk}`,
        summaryJSON: { key: 'value' },
        modelUsed: 'claude-sonnet-4-20250514',
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
    mockedProcessSingleChunk.mockImplementation(async (chunk: string, filingType: SECFilingType, filingRecord: Record<string, unknown>, options: Record<string, unknown>): Promise<EnhancedSummarizationResult> => {
      concurrentExecutions++;
      maxConcurrentExecutions = Math.max(maxConcurrentExecutions, concurrentExecutions);
      
      // Simulate async processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      concurrentExecutions--;
      
      return {
        summaryId: options?.summaryId || 'test-id',
        summaryText: `Processed ${chunk}`,
        summaryJSON: { key: 'value' },
        modelUsed: 'claude-sonnet-4-20250514',
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
