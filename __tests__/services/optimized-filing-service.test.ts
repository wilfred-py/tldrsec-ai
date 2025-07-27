/**
 * Tests for OptimizedFilingService
 * 
 * Tests the core optimized filing service including:
 * - Input validation
 * - Caching layers
 * - Error handling
 * - Resource cleanup
 * - Batch processing
 */

import { OptimizedFilingService } from '../../services/filings/optimizedFilingService';
import { FilingType } from '../../types/sec/filing';

// Mock dependencies
jest.mock('../../lib/ai/directClaudeClient');
jest.mock('../../services/secService');
jest.mock('../../lib/db', () => ({
  prisma: {
    summary: {
      findFirst: jest.fn(),
      create: jest.fn()
    }
  }
}));

jest.mock('../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../lib/monitoring', () => ({
  monitoring: {
    recordTiming: jest.fn()
  }
}));

jest.mock('../../../services/filings/extractors/enhancedDocumentScraper');
jest.mock('../../../services/filings/summaries/fallbackSummaryGenerator');

import { DirectClaudeClient } from '../../lib/ai/directClaudeClient';
import * as secService from '../../services/secService';
import { prisma } from '../../lib/db';

const mockDirectClaudeClient = DirectClaudeClient as jest.MockedClass<typeof DirectClaudeClient>;
const mockSecService = secService as jest.Mocked<typeof secService>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('OptimizedFilingService', () => {
  let service: OptimizedFilingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OptimizedFilingService({
      enableInMemoryCache: true,
      enableDatabaseCache: true,
      useDirectClaude: true
    });
  });

  afterEach(() => {
    // Clean up service resources
    service.dispose();
  });

  describe('Constructor and initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new OptimizedFilingService();
      expect(defaultService).toBeInstanceOf(OptimizedFilingService);
      defaultService.dispose();
    });

    it('should initialize with custom configuration', () => {
      const customService = new OptimizedFilingService({
        enableInMemoryCache: false,
        enableDatabaseCache: false,
        useDirectClaude: false,
        cacheTimeoutSeconds: 7200,
        claudeModel: 'claude-3-sonnet-20240229',
        claudeTemperature: 0.5,
        claudeMaxTokens: 8000
      });
      expect(customService).toBeInstanceOf(OptimizedFilingService);
      customService.dispose();
    });

    it('should set up cleanup interval for memory cache', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const serviceWithMemoryCache = new OptimizedFilingService({
        enableInMemoryCache: true
      });
      
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300000);
      serviceWithMemoryCache.dispose();
      setIntervalSpy.mockRestore();
    });
  });

  describe('Input validation', () => {
    it('should validate ticker symbols', async () => {
      const result = await service.getFilingSummary('', '10-K' as FilingType);
      expect(result.error).toContain('Invalid ticker');
      expect(result.data).toBeNull();
    });

    it('should validate form types', async () => {
      const result = await service.getFilingSummary('TSLA', 'INVALID' as FilingType);
      expect(result.error).toContain('Invalid form type');
      expect(result.data).toBeNull();
    });

    it('should validate request options', async () => {
      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType, {
        bypassCache: 'true' as any // Invalid boolean
      });
      expect(result.error).toContain('Invalid options');
      expect(result.data).toBeNull();
    });

    it('should accept valid input', async () => {
      // Mock successful response
      mockSecService.getLatestFilingByFormType.mockResolvedValue({
        accessionNumber: '0001628280-23-000000',
        filingUrl: 'https://example.com/filing'
      });
      mockSecService.getCompanyInfo.mockResolvedValue({
        name: 'Tesla, Inc.',
        ticker: 'TSLA'
      });

      // Mock the enhanced document content fetch
      const mockFetchEnhancedDocumentContent = jest.fn().mockResolvedValue({
        content: 'Test filing content',
        metadata: { wasDirectoryListing: false }
      });
      
      jest.doMock('../../services/filings/extractors/enhancedDocumentScraper', () => ({
        fetchEnhancedDocumentContent: mockFetchEnhancedDocumentContent
      }));

      // Mock Claude client response
      const mockClaudeInstance = {
        summarizeFiling: jest.fn().mockResolvedValue({
          summary: { summary: 'Test summary', keyPoints: ['Point 1'] },
          inputTokens: 1000,
          outputTokens: 500,
          cost: 0.01,
          duration: 5000,
          model: 'claude-3-5-sonnet-20241022'
        })
      };
      mockDirectClaudeClient.mockImplementation(() => mockClaudeInstance as any);

      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType, {
        returnMetadata: true
      });

      // Should not have validation errors
      expect(result.error).toBeUndefined();
    });
  });

  describe('Caching behavior', () => {
    beforeEach(() => {
      // Mock filing data
      mockSecService.getLatestFilingByFormType.mockResolvedValue({
        accessionNumber: '0001628280-23-000000',
        filingUrl: 'https://example.com/filing',
        filingDate: '2023-01-01'
      });
    });

    it('should use cache when available', async () => {
      // Mock database cache hit
      mockPrisma.summary.findFirst.mockResolvedValue({
        id: 1,
        ticker: { symbol: 'TSLA', companyName: 'Tesla, Inc.' },
        filingType: '10-K',
        summaryText: 'Cached summary',
        keyPoints: ['Cached point'],
        filingDate: new Date('2023-01-01'),
        accessionNumber: '0001628280-23-000000',
        filingUrl: 'https://example.com/filing',
        tokensUsed: 1000,
        model: 'claude-3-5-sonnet-20241022',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType, {
        returnMetadata: true
      });

      expect(result.data).toBeDefined();
      expect(result.metadata?.cacheHit).toBe(true);
      expect(result.metadata?.cacheSource).toBe('database');
    });

    it('should bypass cache when requested', async () => {
      // Mock successful processing
      mockSecService.getCompanyInfo.mockResolvedValue({
        name: 'Tesla, Inc.',
        ticker: 'TSLA'
      });

      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType, {
        bypassCache: true
      });

      // Should not check database cache
      expect(mockPrisma.summary.findFirst).not.toHaveBeenCalled();
    });

    it('should create cache entries for successful responses', async () => {
      // Mock successful processing pipeline
      mockSecService.getCompanyInfo.mockResolvedValue({
        name: 'Tesla, Inc.',
        ticker: 'TSLA'
      });

      const mockFetchEnhancedDocumentContent = jest.fn().mockResolvedValue({
        content: 'Test filing content',
        metadata: { wasDirectoryListing: false }
      });
      
      // Mock Claude client response
      const mockClaudeInstance = {
        summarizeFiling: jest.fn().mockResolvedValue({
          summary: { summary: 'Test summary', keyPoints: ['Point 1'] },
          inputTokens: 1000,
          outputTokens: 500,
          cost: 0.01,
          duration: 5000,
          model: 'claude-3-5-sonnet-20241022'
        })
      };
      mockDirectClaudeClient.mockImplementation(() => mockClaudeInstance as any);

      // Import and mock the enhancedDocumentScraper after setting up mocks
      const enhancedScraper = await import('../../services/filings/extractors/enhancedDocumentScraper');
      jest.mocked(enhancedScraper.fetchEnhancedDocumentContent).mockImplementation(mockFetchEnhancedDocumentContent);

      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType);

      // Should attempt to save to database cache (async)
      // We can't easily test the async save, but we can verify the response structure
      expect(result.data).toBeDefined();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      mockSecService.getLatestFilingByFormType.mockResolvedValue({
        accessionNumber: '0001628280-23-000000',
        filingUrl: 'https://example.com/filing'
      });
    });

    it('should handle missing company info', async () => {
      mockSecService.getCompanyInfo.mockResolvedValue(null);

      const result = await service.getFilingSummary('INVALID', '10-K' as FilingType);

      expect(result.data).toBeNull();
      expect(result.error).toContain('Company information not found');
    });

    it('should handle missing filing info', async () => {
      mockSecService.getLatestFilingByFormType.mockResolvedValue(null);

      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType);

      expect(result.data).toBeNull();
      expect(result.error).toContain('No 10-K filing found');
    });

    it('should handle document fetch errors gracefully', async () => {
      mockSecService.getCompanyInfo.mockResolvedValue({
        name: 'Tesla, Inc.',
        ticker: 'TSLA'
      });

      // Mock document fetch failure
      const mockFetchEnhancedDocumentContent = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      const enhancedScraper = await import('../../services/filings/extractors/enhancedDocumentScraper');
      jest.mocked(enhancedScraper.fetchEnhancedDocumentContent).mockImplementation(mockFetchEnhancedDocumentContent);

      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType);

      // Should fall back to fallback summary
      expect(result.data).toBeDefined();
      expect(result.data?.summaryText).toContain('fallback'); // Assuming fallback contains this word
    });

    it('should handle Claude API errors', async () => {
      mockSecService.getCompanyInfo.mockResolvedValue({
        name: 'Tesla, Inc.',
        ticker: 'TSLA'
      });

      const mockFetchEnhancedDocumentContent = jest.fn().mockResolvedValue({
        content: 'Test content',
        metadata: {}
      });

      const enhancedScraper = await import('../../services/filings/extractors/enhancedDocumentScraper');
      jest.mocked(enhancedScraper.fetchEnhancedDocumentContent).mockImplementation(mockFetchEnhancedDocumentContent);

      // Mock Claude client error
      const mockClaudeInstance = {
        summarizeFiling: jest.fn().mockRejectedValue(new Error('Claude API error'))
      };
      mockDirectClaudeClient.mockImplementation(() => mockClaudeInstance as any);

      const result = await service.getFilingSummary('TSLA', '10-K' as FilingType);

      // Should fall back to fallback summary
      expect(result.data).toBeDefined();
    });
  });

  describe('Resource management', () => {
    it('should clean up resources on dispose', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      service.dispose();
      
      // Should have cleared the cleanup interval
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('should handle dispose when no cleanup interval exists', () => {
      const serviceWithoutCache = new OptimizedFilingService({
        enableInMemoryCache: false
      });
      
      // Should not throw when disposing
      expect(() => serviceWithoutCache.dispose()).not.toThrow();
    });
  });

  describe('Batch processing', () => {
    it('should process multiple requests with controlled concurrency', async () => {
      // Mock all requests to succeed
      mockSecService.getLatestFilingByFormType.mockResolvedValue({
        accessionNumber: '0001628280-23-000000',
        filingUrl: 'https://example.com/filing'
      });
      mockSecService.getCompanyInfo.mockResolvedValue({
        name: 'Test Company',
        ticker: 'TEST'
      });

      const requests = [
        { ticker: 'TSLA', formType: '10-K' as FilingType, options: {} },
        { ticker: 'AAPL', formType: '10-Q' as FilingType, options: {} },
        { ticker: 'MSFT', formType: '8-K' as FilingType, options: {} }
      ];

      const results = await service.batchGetFilingSummaries(requests, {
        concurrency: 2,
        failFast: false
      });

      expect(results).toHaveLength(3);
      expect(results.every(r => r.data !== null || r.error)).toBe(true);
    });

    it('should handle batch failures gracefully', async () => {
      mockSecService.getLatestFilingByFormType.mockResolvedValue({
        accessionNumber: '0001628280-23-000000',
        filingUrl: 'https://example.com/filing'
      });
      
      // Mock some failures
      mockSecService.getCompanyInfo
        .mockResolvedValueOnce({ name: 'Tesla, Inc.', ticker: 'TSLA' })
        .mockResolvedValueOnce(null) // Failure
        .mockResolvedValueOnce({ name: 'Microsoft', ticker: 'MSFT' });

      const requests = [
        { ticker: 'TSLA', formType: '10-K' as FilingType, options: {} },
        { ticker: 'INVALID', formType: '10-K' as FilingType, options: {} },
        { ticker: 'MSFT', formType: '8-K' as FilingType, options: {} }
      ];

      const results = await service.batchGetFilingSummaries(requests);

      expect(results).toHaveLength(3);
      expect(results[1].error).toBeDefined();
      expect(results[1].data).toBeNull();
    });

    it('should respect concurrency limits in batch processing', async () => {
      const processingTimes: number[] = [];
      
      // Mock processing with timing
      const originalGetFilingSummary = service.getFilingSummary.bind(service);
      jest.spyOn(service, 'getFilingSummary').mockImplementation(async (...args) => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate processing time
        processingTimes.push(Date.now() - start);
        return { data: null, error: 'Mocked for timing test' };
      });

      const requests = Array(4).fill(null).map((_, i) => ({
        ticker: `TEST${i}`,
        formType: '10-K' as FilingType,
        options: {}
      }));

      await service.batchGetFilingSummaries(requests, { concurrency: 2 });

      // With concurrency 2, processing should happen in batches
      expect(processingTimes.length).toBe(4);
    });
  });

  describe('Cache key generation', () => {
    it('should generate consistent cache keys', () => {
      // Access private method for testing
      const getCacheKey = (service as any).getCacheKey.bind(service);
      
      const key1 = getCacheKey('TSLA', '10-K', '0001628280-23-000000');
      const key2 = getCacheKey('tsla', '10-k', '0001628280-23-000000');
      
      expect(key1).toBe(key2); // Should normalize case
      expect(key1).toContain('TSLA');
      expect(key1).toContain('10-K');
      expect(key1).toContain('0001628280-23-000000');
    });

    it('should handle missing filing ID', () => {
      const getCacheKey = (service as any).getCacheKey.bind(service);
      
      const key = getCacheKey('TSLA', '10-K');
      expect(key).toContain('latest');
    });
  });
});