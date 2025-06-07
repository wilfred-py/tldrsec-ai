/**
 * Enhanced Filing Service Integration Tests
 * 
 * Tests the enhanced filing service with a focus on:
 * - Caching to prevent redundant API calls for the same filing
 * - Streaming support for partial results
 * - Enhanced chunking for large documents
 * - Batch processing with concurrency control
 */

import { enhancedFilingService, EnhancedFilingEvent } from '../enhancedFilingService';
import { summaryCache } from '../../lib/ai/cache/summary-cache';
import { enhancedSummarizer } from '../../lib/ai/enhanced-summarize';
import * as secService from '../secService';
import { prisma } from '../../lib/db';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
jest.mock('../../lib/ai/enhanced-summarize');
jest.mock('../../lib/ai/cache/summary-cache');
jest.mock('../secService');
jest.mock('../../lib/db');

describe('Enhanced Filing Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock secService methods
    (secService.getCompanyInfo as jest.Mock).mockResolvedValue({
      ticker: 'TSLA',
      name: 'Tesla, Inc.',
      cik: '0001318605'
    });
    
    (secService.getFilings as jest.Mock).mockResolvedValue([
      {
        accessionNumber: '0001318605-23-000012',
        filingDate: '2023-02-15',
        form: '10-K',
        htmlUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000131860523000012/tsla-10k_20221231.htm',
        txtUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000131860523000012/tsla-10k_20221231.txt'
      }
    ]);
    
    (secService.getFilingContent as jest.Mock).mockResolvedValue('Mock filing content for Tesla 10-K');
    
    // Mock prisma methods
    (prisma.ticker.upsert as jest.Mock).mockResolvedValue({
      id: 'ticker-1',
      symbol: 'TSLA',
      companyName: 'Tesla, Inc.',
      cik: '0001318605'
    });
    
    (prisma.secFiling.findFirst as jest.Mock).mockResolvedValue(null);
    
    (prisma.secFiling.create as jest.Mock).mockResolvedValue({
      id: 'filing-1',
      tickerId: 'ticker-1',
      formType: '10-K',
      filingDate: new Date('2023-02-15'),
      accessionNumber: '0001318605-23-000012',
      htmlUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000131860523000012/tsla-10k_20221231.htm',
      txtUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000131860523000012/tsla-10k_20221231.txt',
      rawContent: 'Mock filing content for Tesla 10-K',
      cik: '0001318605',
      ticker: {
        symbol: 'TSLA',
        companyName: 'Tesla, Inc.'
      }
    });
    
    (prisma.summary.create as jest.Mock).mockResolvedValue({
      id: 'summary-1',
      secFilingId: 'filing-1',
      processingStatus: 'QUEUED'
    });
    
    // Mock enhancedSummarizer
    (enhancedSummarizer.summarizeFiling as jest.Mock).mockResolvedValue({
      summaryId: 'summary-1',
      summaryText: 'Tesla had a strong fiscal year with record revenue and profits.',
      duration: 2500,
      modelUsed: 'claude-3-opus-20240229',
      inputTokens: 50000,
      outputTokens: 2000,
      cost: 1.25
    });
    
    // Mock summaryCache
    (summaryCache.checkCache as jest.Mock).mockResolvedValue(null);
  });
  
  test('should get filing summary with enhanced features', async () => {
    // Arrange
    const ticker = 'TSLA';
    const formType = '10-K';
    
    // Act
    const result = await enhancedFilingService.getFilingSummary(ticker, formType, {
      useStreaming: true,
      useCache: true,
      processAllChunks: true
    });
    
    // Assert
    expect(result.data).not.toBeNull();
    expect(result.data?.ticker).toBe(ticker);
    expect(result.data?.filingType).toBe(formType);
    expect(result.data?.summaryText).toBe('Tesla had a strong fiscal year with record revenue and profits.');
    
    // Verify cache was checked
    expect(summaryCache.checkCache).toHaveBeenCalledWith({
      formType,
      cik: '0001318605',
      accessionNumber: '0001318605-23-000012'
    });
    
    // Verify summarizer was called with correct options
    expect(enhancedSummarizer.summarizeFiling).toHaveBeenCalledWith(
      expect.objectContaining({
        filingId: 'filing-1',
        summaryId: 'summary-1',
        useStreaming: true,
        useCache: true,
        processAllChunks: true,
        filingType: formType
      })
    );
  });
  
  test('should return cached result when available', async () => {
    // Arrange
    const ticker = 'TSLA';
    const formType = '10-K';
    
    // Mock cache hit
    (summaryCache.checkCache as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      result: {
        summaryId: 'cached-summary',
        summaryText: 'Cached Tesla summary from previous request',
        duration: 2000,
        modelUsed: 'claude-3-opus-20240229',
        inputTokens: 50000,
        outputTokens: 2000,
        cost: 1.25
      }
    });
    
    // Act
    const result = await enhancedFilingService.getFilingSummary(ticker, formType, {
      useCache: true
    });
    
    // Assert
    expect(result.data).not.toBeNull();
    expect(result.data?.ticker).toBe(ticker);
    expect(result.data?.filingType).toBe(formType);
    expect(result.data?.summaryText).toBe('Cached Tesla summary from previous request');
    
    // Verify cache was checked
    expect(summaryCache.checkCache).toHaveBeenCalledWith({
      formType,
      cik: '0001318605',
      accessionNumber: '0001318605-23-000012'
    });
    
    // Verify summarizer was NOT called (used cache instead)
    expect(enhancedSummarizer.summarizeFiling).not.toHaveBeenCalled();
  });
  
  test('should prevent redundant API calls when multiple users request the same filing', async () => {
    // Arrange
    const ticker = 'TSLA';
    const formType = '10-K';
    
    // First user requests the filing (cache miss)
    (summaryCache.checkCache as jest.Mock).mockResolvedValueOnce(null);
    
    // Second user requests the same filing (cache hit)
    (summaryCache.checkCache as jest.Mock).mockResolvedValueOnce({
      status: 'COMPLETED',
      result: {
        summaryId: 'summary-1',
        summaryText: 'Tesla had a strong fiscal year with record revenue and profits.',
        duration: 2500,
        modelUsed: 'claude-3-opus-20240229',
        inputTokens: 50000,
        outputTokens: 2000,
        cost: 1.25
      }
    });
    
    // Act - First user request
    const result1 = await enhancedFilingService.getFilingSummary(ticker, formType, {
      userId: 'user-1',
      useCache: true
    });
    
    // Act - Second user request for the same filing
    const result2 = await enhancedFilingService.getFilingSummary(ticker, formType, {
      userId: 'user-2',
      useCache: true
    });
    
    // Assert - Both users get the summary
    expect(result1.data).not.toBeNull();
    expect(result2.data).not.toBeNull();
    
    // Verify cache was checked twice
    expect(summaryCache.checkCache).toHaveBeenCalledTimes(2);
    
    // Verify summarizer was called ONLY ONCE (for the first user)
    expect(enhancedSummarizer.summarizeFiling).toHaveBeenCalledTimes(1);
    
    // Verify both users got the same summary content
    expect(result1.data?.summaryText).toBe('Tesla had a strong fiscal year with record revenue and profits.');
    expect(result2.data?.summaryText).toBe('Tesla had a strong fiscal year with record revenue and profits.');
  });
  
  test('should handle pending summaries to prevent duplicate processing', async () => {
    // Arrange
    const ticker = 'TSLA';
    const formType = '10-K';
    
    // First user request - cache returns PENDING status
    (summaryCache.checkCache as jest.Mock).mockResolvedValueOnce({
      status: 'PENDING',
      summaryId: 'summary-1'
    });
    
    // Mock the summary lookup
    (prisma.summary.findUnique as jest.Mock).mockResolvedValue({
      id: 'summary-1',
      secFilingId: 'filing-1',
      processingStatus: 'PROCESSING',
      processingStartedAt: new Date()
    });
    
    // Act
    const eventPromise = new Promise<any>((resolve) => {
      enhancedFilingService.once(EnhancedFilingEvent.SUMMARY_PROGRESS, resolve);
    });
    
    const result = await enhancedFilingService.getFilingSummary(ticker, formType, {
      userId: 'user-2',
      useCache: true
    });
    
    // Assert
    expect(result.data).not.toBeNull();
    expect(result.data?.processingStatus).toBe('PENDING');
    
    // Verify cache was checked
    expect(summaryCache.checkCache).toHaveBeenCalledTimes(1);
    
    // Verify summarizer was NOT called (pending summary)
    expect(enhancedSummarizer.summarizeFiling).not.toHaveBeenCalled();
  });
  
  test('should process batch filing summaries with concurrency control', async () => {
    // Arrange
    const requests = [
      { ticker: 'TSLA', formType: '10-K' as const },
      { ticker: 'AAPL', formType: '10-Q' as const },
      { ticker: 'MSFT', formType: '8-K' as const }
    ];
    
    // Mock getFilingSummary to track calls
    const getFilingSummarySpy = jest.spyOn(enhancedFilingService, 'getFilingSummary');
    getFilingSummarySpy.mockImplementation(async (ticker) => {
      return {
        data: {
          ticker,
          companyName: `${ticker} Inc.`,
          filingType: requests.find(r => r.ticker === ticker)?.formType || '10-K',
          filingDate: '2023-02-15',
          accessionNumber: `${ticker}-123456`,
          summaryText: `Summary for ${ticker}`,
          keyPoints: [`Key point for ${ticker}`],
          url: `https://example.com/${ticker}`,
          processingTimeMs: 1000
        }
      };
    });
    
    // Act
    const result = await enhancedFilingService.getBatchFilingSummaries(requests, {
      concurrencyLimit: 2
    });
    
    // Assert
    expect(result.results).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    
    // Verify concurrency control (should process in batches)
    const calls = getFilingSummarySpy.mock.calls;
    expect(calls).toHaveLength(3);
    
    // Verify results contain all requested filings
    expect(result.results.map(r => r.ticker).sort()).toEqual(['AAPL', 'MSFT', 'TSLA']);
  });
});
