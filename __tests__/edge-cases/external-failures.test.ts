/**
 * External Service Failure Tests for SEC Filing Cron Job
 * 
 * Tests how the system handles failures from external services including
 * SEC EDGAR, Anthropic API, and email delivery services.
 */

import { NextRequest } from 'next/server';
import { GET } from '../../app/api/cron/tier-aware/route';
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

describe('SEC Filing Cron Job - External Service Failures', () => {
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

  describe('SEC EDGAR System Failures', () => {
    it('should handle complete SEC system unavailability', async () => {
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
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      
      // SEC system completely down (connection timeout)
      mockTickerMonitoring.checkTickerForNewFilings.mockRejectedValue(
        new Error('ETIMEDOUT: SEC EDGAR system unavailable')
      );
      
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.stats.tickersChecked).toBe(1);
      expect(result.stats.errors).toBe(1); // SEC failure counted as error
      
      // Should log error but continue with other processing
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to check ticker TSLA',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'ETIMEDOUT: SEC EDGAR system unavailable'
          })
        })
      );
      
      // Should continue with cleanup despite SEC failure
      expect(mockTickerMonitoring.cleanupOldMonitoringData).toHaveBeenCalled();
    });

    it('should handle SEC rate limiting (503 errors)', async () => {
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
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      
      // SEC returns rate limiting error
      mockTickerMonitoring.checkTickerForNewFilings.mockRejectedValue(
        new Error('HTTP 503: Service temporarily unavailable - Rate limit exceeded')
      );
      
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.stats.errors).toBe(1);
      
      // Should handle rate limiting gracefully
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to check ticker TSLA',
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Rate limit exceeded')
          })
        })
      );
    });

    it('should handle filing URL redirect loops', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/redirect-loop',
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
      
      // Filing fetch fails due to redirect loop
      mockEnhancedFetch.enhancedFetch.mockRejectedValue(
        new Error('Maximum redirect attempts exceeded')
      );
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(0);
      expect(result.stats.errors).toBe(1);
      
      // Should mark filing as processed to prevent infinite retry
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process filing 0001628280-24-123456',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Maximum redirect attempts exceeded'
          })
        })
      );
    });

    it('should handle filing content corruption/truncation', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/corrupted-filing',
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
      
      // Return corrupted/incomplete HTML
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('<html><body>Corrupted con');
      
      // Parser fails on corrupted content
      mockFormParser.parseFormContentEnhanced.mockRejectedValue(
        new Error('Unable to parse corrupted filing content')
      );
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(0);
      expect(result.stats.errors).toBe(1);
      
      // Should mark corrupted filing as processed
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
    });

    it('should handle SEC server returning 404 for filed documents', async () => {
      const mockUnprocessedFilings = [{
        id: 'filing1',
        accessionNumber: '0001628280-24-123456',
        filingType: '10-Q',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/missing-filing',
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
      
      // SEC returns 404 for filing URL
      mockEnhancedFetch.enhancedFetch.mockRejectedValue(
        new Error('HTTP 404: Filing not found')
      );
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(0);
      expect(result.stats.errors).toBe(1);
      
      // Should mark 404 filing as processed (avoid infinite retry for permanently missing files)
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalledWith('filing1');
    });
  });

  describe('Anthropic API Failures', () => {
    it('should handle complete Anthropic API outage', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      
      // Anthropic API completely down - should use fallback after retries
      const mockFallbackResult = {
        summary: 'Fallback summary for Tesla 10-Q filing due to AI service outage.',
        keyPoints: ['AI service unavailable', 'Fallback summary generated'],
        error: 'Anthropic API service unavailable'
      };
      
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockFallbackResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: mockFallbackResult.summary });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1); // Should still process with fallback
      expect(result.stats.errors).toBe(0); // Fallback should handle the error
      
      // Should save fallback summary
      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summaryText: mockFallbackResult.summary,
          processingStatus: 'COMPLETED'
        })
      });
    });

    it('should handle Anthropic API rate limiting (429 errors)', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      
      // API rate limited - should retry and eventually fallback
      const mockFallbackResult = {
        summary: 'Fallback summary due to API rate limiting.',
        keyPoints: ['API rate limit exceeded', 'Maximum retries exhausted'],
        error: 'Rate limit exceeded after retries'
      };
      
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockFallbackResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: mockFallbackResult.summary });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      
      // Should use fallback after rate limit retries
      expect(mockSummaryService.generateAISummaryWithRetry).toHaveBeenCalledWith(
        'Content...',
        expect.objectContaining({
          formType: '10-Q',
          accessionNumber: '0001628280-24-123456'
        }),
        expect.objectContaining({
          name: 'Tesla, Inc.',
          ticker: 'TSLA'
        })
      );
    });

    it('should handle Anthropic API authentication failures', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      
      // API key invalid/expired - should fallback immediately
      const mockFallbackResult = {
        summary: 'Fallback summary due to API authentication failure.',
        keyPoints: ['API authentication failed', 'Invalid or expired API key'],
        error: 'Authentication failed'
      };
      
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockFallbackResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: mockFallbackResult.summary });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      
      // Should save fallback summary
      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summaryText: mockFallbackResult.summary
        })
      });
    });

    it('should handle Anthropic model unavailability', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      
      // Model deprecated/unavailable
      const mockFallbackResult = {
        summary: 'Fallback summary due to model unavailability.',
        keyPoints: ['AI model unavailable', 'Model deprecated or removed'],
        error: 'Model claude-3-opus-20240229 not available'
      };
      
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockFallbackResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: mockFallbackResult.summary });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      
      // Should handle model unavailability gracefully
      expect(mockPrisma.summary.create).toHaveBeenCalled();
    });

    it('should handle malformed Anthropic API responses', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      
      // API returns malformed response
      const mockFallbackResult = {
        summary: 'Fallback summary due to malformed API response.',
        keyPoints: ['API response parsing failed', 'Invalid JSON returned'],
        error: 'Failed to parse API response'
      };
      
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockFallbackResult);
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: mockFallbackResult.summary });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      
      // Should handle malformed response gracefully
      expect(mockPrisma.summary.create).toHaveBeenCalled();
    });
  });

  describe('Email Service Failures', () => {
    it('should handle complete email service outage', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Valid summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Valid summary' });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user1', email: 'user1@example.com', name: 'User One' }
      ]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      // Email service completely down
      mockEmailService.sendFilingSummaryEmail.mockResolvedValue({
        success: false,
        error: 'Email service unavailable - connection timeout'
      });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1); // Processing should succeed
      expect(result.stats.emailsSent).toBe(0); // No emails sent due to service outage
      expect(result.stats.errors).toBe(0); // Email failures shouldn't be counted as processing errors
      
      // Summary should still be saved despite email failure
      expect(mockPrisma.summary.create).toHaveBeenCalled();
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalled();
      
      // Email failure should be logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send email notification',
        expect.objectContaining({
          subscriberEmail: 'user1@example.com',
          ticker: 'TSLA'
        })
      );
    });

    it('should handle email service rate limiting', async () => {
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
      
      const mockSubscribers = [
        { id: 'user1', email: 'user1@example.com', name: 'User One' },
        { id: 'user2', email: 'user2@example.com', name: 'User Two' },
        { id: 'user3', email: 'user3@example.com', name: 'User Three' }
      ];
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Valid summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Valid summary' });
      mockPrisma.user.findMany.mockResolvedValue(mockSubscribers);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      // First two emails succeed, third fails due to rate limit
      mockEmailService.sendFilingSummaryEmail
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Rate limit exceeded' });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      expect(result.stats.emailsSent).toBe(2); // Only first two succeeded
      
      // Should attempt all email sends
      expect(mockEmailService.sendFilingSummaryEmail).toHaveBeenCalledTimes(3);
      
      // Should log rate limit error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send email notification',
        expect.objectContaining({
          subscriberEmail: 'user3@example.com',
          ticker: 'TSLA'
        })
      );
    });

    it('should handle invalid email addresses gracefully', async () => {
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
      
      const mockSubscribers = [
        { id: 'user1', email: 'valid@example.com', name: 'Valid User' },
        { id: 'user2', email: 'invalid-email', name: 'Invalid User' },
        { id: 'user3', email: 'another@example.com', name: 'Another Valid User' }
      ];
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Valid summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Valid summary' });
      mockPrisma.user.findMany.mockResolvedValue(mockSubscribers);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      // Valid emails succeed, invalid email fails
      mockEmailService.sendFilingSummaryEmail
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Invalid email address format' })
        .mockResolvedValueOnce({ success: true });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      expect(result.stats.emailsSent).toBe(2); // Only valid emails succeeded
      
      // Should attempt all email sends
      expect(mockEmailService.sendFilingSummaryEmail).toHaveBeenCalledTimes(3);
      
      // Should log invalid email error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send email notification',
        expect.objectContaining({
          subscriberEmail: 'invalid-email',
          ticker: 'TSLA'
        })
      );
    });

    it('should handle email template rendering failures', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Mock filing content...');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content...', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Valid summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Valid summary' });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user1', email: 'user1@example.com', name: 'User One' }
      ]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      // Email template rendering fails
      mockEmailService.sendFilingSummaryEmail.mockResolvedValue({
        success: false,
        error: 'Template rendering failed - missing required data'
      });
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      expect(result.stats.emailsSent).toBe(0);
      
      // Should log template error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send email notification',
        expect.objectContaining({
          subscriberEmail: 'user1@example.com'
        })
      );
    });
  });

  describe('Multiple Service Failures', () => {
    it('should handle cascading failures across all external services', async () => {
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
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      
      // All external services fail
      mockTickerMonitoring.checkTickerForNewFilings.mockRejectedValue(
        new Error('SEC system unavailable')
      );
      
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockRejectedValue(
        new Error('Network unavailable')
      );
      
      const response = await GET(mockRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true); // Should still complete
      expect(result.stats.errors).toBeGreaterThan(0); // Should count all failures
      
      // Should attempt to mark failed filings as processed
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalled();
      
      // Should log multiple errors
      expect(mockLogger.error).toHaveBeenCalledTimes(2); // SEC + Filing fetch errors
    });
  });
});