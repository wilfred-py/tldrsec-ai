/**
 * End-to-End Integration Tests for SEC Filing Cron Job
 * 
 * Tests the complete flow from RSS monitoring through email notification
 * Covers happy paths, partial failures, and recovery scenarios
 */

import { NextRequest } from 'next/server';
import { GET } from '../../app/api/cron/monitor-sec-filings/route';
import { getPrismaClient } from '../../lib/db/prisma';
import * as tickerMonitoring from '../../lib/sec-edgar/ticker-monitoring';
import * as enhancedFetch from '../../lib/network/enhanced-fetch';
import * as formParser from '../../lib/parsers/enhanced-form-parser';
import * as summaryService from '../../services/filing/summaryGenerationService';
import * as emailService from '../../lib/email/summary-service';
import { logger } from '../../lib/logging';

// Mock external dependencies
jest.mock('../../lib/db/prisma');
jest.mock('../../lib/sec-edgar/ticker-monitoring');
jest.mock('../../lib/network/enhanced-fetch');
jest.mock('../../lib/parsers/enhanced-form-parser');
jest.mock('../../services/filing/summaryGenerationService');
jest.mock('../../lib/email/summary-service');
jest.mock('../../lib/logging');

const mockPrisma = getPrismaClient() as jest.Mocked<ReturnType<typeof getPrismaClient>>;
const mockTickerMonitoring = tickerMonitoring as jest.Mocked<typeof tickerMonitoring>;
const mockEnhancedFetch = enhancedFetch as jest.Mocked<typeof enhancedFetch>;
const mockFormParser = formParser as jest.Mocked<typeof formParser>;
const mockSummaryService = summaryService as jest.Mocked<typeof summaryService>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('SEC Filing Cron Job - End-to-End Integration', () => {
  let mockRequest: NextRequest;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock request with proper authorization
    mockRequest = {
      headers: new Headers({
        'authorization': `Bearer ${process.env.CRON_SECRET || 'test-secret'}`
      })
    } as NextRequest;
    
    // Setup environment
    process.env.CRON_SECRET = 'test-secret';
    
    // Setup default mock implementations
    mockLogger.child = jest.fn().mockReturnValue(mockLogger);
    mockLogger.info = jest.fn();
    mockLogger.debug = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
  });

  describe('Happy Path - Complete Flow', () => {
    it('should successfully process new filings end-to-end', async () => {
      // Setup test data
      const mockActiveTickers = [
        {
          id: 'ticker1',
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.',
          rssUrl: 'https://sec.gov/rss/1318605',
          lastChecked: null,
          lastAccessionSeen: null,
          subscriberCount: 2
        }
      ];
      
      const mockNewFilings = [
        {
          accessionNumber: '0001628280-24-123456',
          filingType: '10-Q',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://sec.gov/filing123',
          rssEntryDate: new Date('2024-01-15')
        }
      ];
      
      const mockUnprocessedFilings = [
        {
          id: 'filing1',
          accessionNumber: '0001628280-24-123456',
          filingType: '10-Q',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://sec.gov/filing123',
          ticker: {
            cik: '1318605',
            symbol: 'TSLA',
            companyName: 'Tesla, Inc.'
          }
        }
      ];
      
      const mockParsedContent = {
        sections: {
          'Item 1': 'Financial statements content...',
          'Item 2': 'Management discussion content...'
        },
        metadata: {
          filingType: '10-Q',
          extractionMethod: 'enhanced'
        }
      };
      
      const mockSummaryResult = {
        summary: 'Tesla reported strong Q1 results with revenue growth of 15%...',
        keyPoints: ['Revenue up 15%', 'Net income improved', 'Guidance raised'],
        tokensUsed: 1500,
        inputTokens: 1200,
        outputTokens: 300,
        model: 'claude-3-opus-20240229',
        cost: 0.025
      };
      
      const mockDbTicker = { id: 'db-ticker-1' };
      const mockSavedSummary = { id: 'summary-1', summaryText: mockSummaryResult.summary };
      const mockSubscribers = [
        { id: 'user1', email: 'user1@example.com', name: 'User One' },
        { id: 'user2', email: 'user2@example.com', name: 'User Two' }
      ];
      
      // Setup mocks
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue(mockNewFilings);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing HTML content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue(mockParsedContent);
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockSummaryResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue(mockDbTicker);
      mockPrisma.summary.create.mockResolvedValue(mockSavedSummary);
      mockPrisma.user.findMany.mockResolvedValue(mockSubscribers);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      mockEmailService.sendFilingSummaryEmail.mockResolvedValue({ success: true });
      
      // Execute the cron job
      const response = await GET(mockRequest);
      const result = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        tickersChecked: 1,
        newFilingsFound: 1,
        filingsProcessed: 1,
        emailsSent: 2,
        errors: 0,
        startTime: expect.any(String),
        endTime: expect.any(String)
      });
      
      // Verify all components were called correctly
      expect(mockTickerMonitoring.getActiveTickersForMonitoring).toHaveBeenCalledTimes(1);
      expect(mockTickerMonitoring.checkTickerForNewFilings).toHaveBeenCalledWith(mockActiveTickers[0]);
      expect(mockTickerMonitoring.getUnprocessedFilings).toHaveBeenCalledWith(5);
      
      expect(mockEnhancedFetch.enhancedFetch).toHaveBeenCalledWith(
        mockUnprocessedFilings[0].filingUrl,
        expect.objectContaining({
          responseType: 'text',
          headers: expect.objectContaining({
            'User-Agent': 'tldrSEC-AI Cron Monitor (contact@tldrsec.com)'
          }),
          operationName: 'sec-filing-cron-fetch'
        })
      );
      
      expect(mockFormParser.parseFormContentEnhanced).toHaveBeenCalledWith(
        'Mock filing HTML content...',
        '10-Q',
        mockUnprocessedFilings[0].filingUrl
      );
      
      expect(mockSummaryService.generateAISummaryWithRetry).toHaveBeenCalledWith(
        JSON.stringify(mockParsedContent.sections),
        {
          formType: '10-Q',
          filingDate: mockUnprocessedFilings[0].filingDate.toISOString(),
          accessionNumber: mockUnprocessedFilings[0].accessionNumber
        },
        {
          name: 'Tesla, Inc.',
          ticker: 'TSLA'
        }
      );
      
      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tickerId: mockDbTicker.id,
          filingType: '10-Q',
          filingDate: mockUnprocessedFilings[0].filingDate,
          filingUrl: mockUnprocessedFilings[0].filingUrl,
          summaryText: mockSummaryResult.summary,
          cost: mockSummaryResult.cost,
          processingStatus: 'COMPLETED'
        })
      });
      
      expect(mockEmailService.sendFilingSummaryEmail).toHaveBeenCalledTimes(2);
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
      expect(mockTickerMonitoring.cleanupOldMonitoringData).toHaveBeenCalledTimes(1);
    });
  });

  describe('Partial Failure Recovery', () => {
    it('should handle AI summarization failure with fallback', async () => {
      // Setup test data similar to happy path
      const mockActiveTickers = [{
        id: 'ticker1',
        cik: '1318605',
        symbol: 'TSLA',
        companyName: 'Tesla, Inc.',
        rssUrl: 'https://sec.gov/rss/1318605',
        lastChecked: null,
        lastAccessionSeen: null,
        subscriberCount: 1
      }];
      
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/filing123',
        ticker: {
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.'
        }
      }];
      
      const mockParsedContent = {
        sections: { 'Item 1': 'Content...' },
        metadata: {}
      };
      
      // AI summarization returns fallback result
      const mockFallbackResult = {
        summary: 'This is a fallback summary for Tesla 10-Q filing.',
        keyPoints: ['Fallback summary generated', 'AI service unavailable'],
        error: 'Anthropic API rate limit exceeded'
      };
      
      // Setup mocks
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue(mockParsedContent);
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockFallbackResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: mockFallbackResult.summary });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user1', email: 'user1@example.com', name: 'User One' }]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      mockEmailService.sendFilingSummaryEmail.mockResolvedValue({ success: true });
      
      // Execute the cron job
      const response = await GET(mockRequest);
      const result = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.stats.filingsProcessed).toBe(1);
      expect(result.stats.emailsSent).toBe(1);
      expect(result.stats.errors).toBe(0); // Should be 0 because fallback handled the failure
      
      // Verify fallback summary was used
      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summaryText: mockFallbackResult.summary,
          processingStatus: 'COMPLETED'
        })
      });
      
      // Verify email was sent with fallback summary
      expect(mockEmailService.sendFilingSummaryEmail).toHaveBeenCalledWith(
        'user1@example.com',
        expect.objectContaining({
          summary: mockFallbackResult.summary
        })
      );
    });

    it('should handle email failure while preserving summary storage', async () => {
      // Setup similar to happy path but email fails
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/filing123',
        ticker: {
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.'
        }
      }];
      
      const mockSummaryResult = {
        summary: 'Valid AI summary content',
        keyPoints: ['Point 1', 'Point 2'],
        cost: 0.025
      };
      
      // Setup mocks - happy path until email
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockSummaryResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: mockSummaryResult.summary });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user1', email: 'user1@example.com', name: 'User One' }]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      // Email fails
      mockEmailService.sendFilingSummaryEmail.mockResolvedValue({ 
        success: false, 
        error: 'Email service unavailable' 
      });
      
      // Execute the cron job
      const response = await GET(mockRequest);
      const result = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.stats.filingsProcessed).toBe(1);
      expect(result.stats.emailsSent).toBe(0); // Email failed
      expect(result.stats.errors).toBe(0); // Email failure shouldn't be counted as processing error
      
      // Verify summary was still saved
      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summaryText: mockSummaryResult.summary,
          processingStatus: 'COMPLETED'
        })
      });
      
      // Verify filing was marked as processed despite email failure
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
      
      // Verify error was logged but not propagated
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send email notification',
        expect.objectContaining({
          subscriberEmail: 'user1@example.com',
          ticker: 'TSLA'
        })
      );
    });

    it('should handle database failure and mark filing as processed', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/filing123',
        ticker: {
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.'
        }
      }];
      
      // Setup mocks - everything succeeds until database save
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue(); // Should be called even on error
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      // Database save fails
      mockPrisma.summary.create.mockRejectedValue(new Error('Database connection timeout'));
      
      // Execute the cron job
      const response = await GET(mockRequest);
      const result = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.stats.filingsProcessed).toBe(0); // Failed to process
      expect(result.stats.errors).toBe(1); // Database error counted
      
      // Verify filing was marked as processed even on error (to prevent infinite retry)
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process filing 0001628280-24-123456',
        expect.objectContaining({
          ticker: 'TSLA',
          filingType: '10-Q'
        })
      );
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without valid authorization', async () => {
      const unauthorizedRequest = {
        headers: new Headers({
          'authorization': 'Bearer invalid-secret'
        })
      } as NextRequest;
      
      const response = await GET(unauthorizedRequest);
      const result = await response.json();
      
      expect(response.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
      
      // Verify no processing occurred
      expect(mockTickerMonitoring.getActiveTickersForMonitoring).not.toHaveBeenCalled();
    });

    it('should reject requests without authorization header', async () => {
      const noAuthRequest = {
        headers: new Headers({})
      } as NextRequest;
      
      const response = await GET(noAuthRequest);
      const result = await response.json();
      
      expect(response.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('Rate Limiting & Batch Processing', () => {
    it('should respect batch size limits', async () => {
      // Create more unprocessed filings than batch size (5)
      const mockUnprocessedFilings = Array.from({ length: 10 }, (_, i) => ({
        id: `filing${i}`,
        accessionNumber: `000-${i.toString().padStart(6, '0')}`,
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: `https://sec.gov/filing${i}`,
        ticker: {
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.'
        }
      }));
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      // Mock successful processing
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      // Should request only 5 filings (batch size)
      expect(mockTickerMonitoring.getUnprocessedFilings).toHaveBeenCalledWith(5);
      
      // Should process only the returned 5 filings, not all 10
      expect(result.stats.filingsProcessed).toBe(5); // Assuming all 5 succeed
    });

    it('should respect concurrent RSS check limits', async () => {
      // Create more tickers than concurrent limit (3)
      const mockActiveTickers = Array.from({ length: 6 }, (_, i) => ({
        id: `ticker${i}`,
        cik: `${1318605 + i}`,
        symbol: `TICK${i}`,
        companyName: `Company ${i}`,
        rssUrl: `https://sec.gov/rss/${1318605 + i}`,
        lastChecked: null,
        lastAccessionSeen: null,
        subscriberCount: 1
      }));
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.tickersChecked).toBe(6);
      
      // Verify all tickers were checked (batching handled internally)
      expect(mockTickerMonitoring.checkTickerForNewFilings).toHaveBeenCalledTimes(6);
    });
  });

  describe('Timeout and Performance', () => {
    it('should complete within timeout limits', async () => {
      const startTime = Date.now();
      
      // Setup minimal successful flow
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(4 * 60 * 1000); // Should complete within 4 minutes
      expect(result.durationMs).toBeLessThan(4 * 60 * 1000);
    });
  });
});