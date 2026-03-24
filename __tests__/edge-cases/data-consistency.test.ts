/**
 * Edge Cases and Data Consistency Tests for SEC Filing Cron Job
 * 
 * Tests critical edge cases that could cause data corruption, race conditions,
 * or system failures in the SEC filing monitoring system.
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

describe('SEC Filing Cron Job - Edge Cases & Data Consistency', () => {
  let mockRequest: NextRequest;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      headers: new Headers({
        'authorization': `Bearer ${process.env.CRON_SECRET || 'test-secret'}`
      })
    } as NextRequest;
    
    process.env.CRON_SECRET = 'test-secret';
    
    // Setup logger mocks
    mockLogger.child = jest.fn().mockReturnValue(mockLogger);
    mockLogger.info = jest.fn();
    mockLogger.debug = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
  });

  describe('Concurrent Processing Edge Cases', () => {
    it('should handle duplicate filing processing attempts gracefully', async () => {
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
      
      // Setup successful processing
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.app', name: 'System User' });
      
      // First summary creation succeeds
      mockPrisma.summary.create.mockResolvedValueOnce({ id: 'summary-1', summaryText: 'Summary' });
      
      // Second attempt fails with unique constraint violation (simulating concurrent processing)
      mockPrisma.summary.create.mockRejectedValueOnce(
        new Error('Unique constraint failed on the fields: (`tickerId`,`accessionNumber`)')
      );
      
      mockPrisma.user.findMany.mockResolvedValue([]);
      
      // Run two concurrent requests
      const [response1, response2] = await Promise.all([
        GET(mockRequest),
        GET(mockRequest)
      ]);
      
      const result1 = await response1.json();
      const result2 = await response2.json();
      
      // Both should complete successfully
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // One should succeed, one should fail but handle gracefully
      const totalProcessed = result1.stats.filingsProcessed + result2.stats.filingsProcessed;
      const totalErrors = result1.stats.errors + result2.stats.errors;
      
      expect(totalProcessed).toBeGreaterThan(0);
      expect(totalErrors).toBeLessThanOrEqual(1); // At most one should fail
      
      // Both filings should be marked as processed to prevent infinite retry
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledTimes(2);
    });

    it('should handle race conditions in ticker monitoring updates', async () => {
      const mockActiveTickers = [
        {
          id: 'ticker1',
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.',
          rssUrl: 'https://sec.gov/rss/1318605',
          lastChecked: null,
          lastAccessionSeen: null,
          subscriberCount: 1
        }
      ];
      
      // First call succeeds
      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValueOnce([]);
      
      // Second call fails due to concurrent update
      mockTickerMonitoring.checkTickerForNewFilings.mockRejectedValueOnce(
        new Error('UPDATE failed due to concurrent modification')
      );
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      // Execute multiple concurrent cron jobs
      const results = await Promise.allSettled([
        GET(mockRequest),
        GET(mockRequest)
      ]);
      
      // At least one should succeed
      const successfulResults = results.filter(r => r.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);
      
      // Errors should be handled gracefully without crashing
      const errors = results.filter(r => r.status === 'rejected');
      expect(errors.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Data Integrity Edge Cases', () => {
    it('should handle orphaned filing records correctly', async () => {
      // Filing with missing ticker reference
      const mockOrphanedFiling = {
        id: 'orphaned-filing',
        accessionNumber: '0001628280-24-999999',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/orphaned-filing',
        ticker: null // Orphaned record
      };
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([mockOrphanedFiling]);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.errors).toBe(1); // Should count as error
      expect(result.stats.filingsProcessed).toBe(0); // Should not process orphaned filing
      
      // Should still mark as processed to clean up orphaned record
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('orphaned-filing');
      
      // Should log error for orphaned filing
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process filing'),
        expect.any(Object)
      );
    });

    it('should handle missing user subscriptions gracefully', async () => {
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
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.app', name: 'System User' });
      
      // No subscribers found for this ticker
      mockPrisma.user.findMany.mockResolvedValue([]);
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      expect(result.stats.emailsSent).toBe(0); // No emails sent due to no subscribers
      expect(result.stats.errors).toBe(0); // Should not be an error condition
      
      // Summary should still be saved even without subscribers
      expect(mockPrisma.summary.create).toHaveBeenCalled();
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalled();
    });

    it('should handle invalid ticker/company mappings', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/filing123',
        ticker: {
          cik: '9999999999', // Invalid CIK
          symbol: 'INVALID',
          companyName: 'Unknown Company'
        }
      }];
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      // Ticker creation fails due to invalid data
      mockPrisma.ticker.upsert.mockRejectedValue(new Error('Invalid ticker symbol format'));
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.app', name: 'System User' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(0);
      expect(result.stats.errors).toBe(1);
      
      // Should mark as processed to avoid infinite retry
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
    });
  });

  describe('System Resource Limits', () => {
    it('should handle memory exhaustion during large filing processing', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-K',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/huge-filing',
        ticker: {
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.'
        }
      }];
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      // Simulate memory exhaustion during large file fetch
      mockEnhancedFetch.enhancedFetch.mockRejectedValue(
        new Error('ENOMEM: not enough memory')
      );
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(0);
      expect(result.stats.errors).toBe(1);
      
      // Should handle memory error gracefully and mark filing as processed
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process filing'),
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'ENOMEM: not enough memory'
          })
        })
      );
    });

    it('should handle database connection pool exhaustion', async () => {
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
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.app', name: 'System User' });
      
      // Database operations fail due to connection pool exhaustion
      mockPrisma.ticker.upsert.mockRejectedValue(
        new Error('Connection pool timeout')
      );
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.errors).toBe(1);
      
      // Should attempt to mark as processed despite connection issues
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalled();
    });

    it('should handle file descriptor limits during concurrent operations', async () => {
      // Create many concurrent RSS checks to simulate FD exhaustion
      const mockActiveTickers = Array.from({ length: 20 }, (_, i) => ({
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
      
      // Some RSS checks fail due to FD limits
      mockTickerMonitoring.checkTickerForNewFilings
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('EMFILE: too many open files'))
        .mockResolvedValue([]);
      
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.tickersChecked).toBe(20);
      expect(result.stats.errors).toBeGreaterThan(0);
      
      // Should continue processing despite FD errors
      expect(result.success).toBe(true);
    });
  });

  describe('Data Corruption Prevention', () => {
    it('should prevent processing of malformed filing data', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: null, // Malformed data
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/filing123',
        ticker: {
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.'
        }
      }];
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(0);
      expect(result.stats.errors).toBe(1);
      
      // Should mark malformed filing as processed to prevent infinite retry
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
    });

    it('should handle circular references in filing data', async () => {
      // Create circular reference in mock data
      const circularTicker: any = {
        cik: '1318605',
        symbol: 'TSLA',
        companyName: 'Tesla, Inc.'
      };
      circularTicker.self = circularTicker; // Circular reference
      
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/filing123',
        ticker: circularTicker
      }];
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      
      // JSON stringify will fail on circular reference
      mockSummaryService.generateAISummaryWithRetry.mockImplementation(() => {
        JSON.stringify(circularTicker); // This will throw
        return Promise.resolve({ summary: 'Summary', cost: 0.01 });
      });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.errors).toBe(1);
      
      // Should handle circular reference error gracefully
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
    });

    it('should validate critical data fields before processing', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '', // Empty filing type
        filingDate: new Date('invalid-date'), // Invalid date
        filingUrl: 'not-a-url', // Invalid URL
        ticker: {
          cik: '', // Empty CIK
          symbol: '',  // Empty symbol
          companyName: 'Tesla, Inc.'
        }
      }];
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(0);
      expect(result.stats.errors).toBe(1);
      
      // Should not attempt to fetch content with invalid URL
      expect(mockEnhancedFetch.enhancedFetch).not.toHaveBeenCalled();
      
      // Should mark invalid filing as processed
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
    });
  });

  describe('Cleanup and Recovery', () => {
    it('should continue cleanup even if main processing fails', async () => {
      // Force error during main processing
      mockTickerMonitoring.getActiveTickersForMonitoring.mockRejectedValue(
        new Error('Critical database failure')
      );
      
      // Cleanup should still succeed
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(500); // Should fail due to critical error
      expect(result.success).toBe(false);
      
      // Cleanup should still be attempted despite failure
      expect(mockTickerMonitoring.cleanupOldMonitoringData).toHaveBeenCalled();
    });

    it('should handle cleanup failures gracefully', async () => {
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      
      // Cleanup fails
      mockTickerMonitoring.cleanupOldMonitoringData.mockRejectedValue(
        new Error('Cleanup operation failed')
      );
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      // Main job should still succeed even if cleanup fails
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      
      // Cleanup failure should be logged but not propagate
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('cleanup'),
        expect.any(Object)
      );
    });
  });
});