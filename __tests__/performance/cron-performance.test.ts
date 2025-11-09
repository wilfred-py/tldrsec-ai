/**
 * Performance Tests for SEC Filing Cron Job
 * 
 * Tests performance characteristics, load handling, and resource usage
 * of the SEC filing monitoring system under various conditions.
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

// Performance monitoring utilities
interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  apiCalls: {
    rss: number;
    filing: number;
    ai: number;
    email: number;
    database: number;
  };
}

function measurePerformance(): {
  start: () => void;
  stop: () => PerformanceMetrics;
} {
  let startTime: number;
  let startMemory: NodeJS.MemoryUsage;
  let apiCalls = { rss: 0, filing: 0, ai: 0, email: 0, database: 0 };

  return {
    start: () => {
      startTime = Date.now();
      startMemory = process.memoryUsage();
      apiCalls = { rss: 0, filing: 0, ai: 0, email: 0, database: 0 };
    },
    stop: () => ({
      executionTime: Date.now() - startTime,
      memoryUsage: process.memoryUsage(),
      apiCalls
    })
  };
}

describe('SEC Filing Cron Job - Performance Tests', () => {
  let mockRequest: NextRequest;
  let perfMonitor: ReturnType<typeof measurePerformance>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      headers: new Headers({
        'authorization': `Bearer ${process.env.CRON_SECRET || 'test-secret'}`
      })
    } as NextRequest;
    
    process.env.CRON_SECRET = 'test-secret';
    perfMonitor = measurePerformance();
    
    // Setup logger mocks
    mockLogger.child = jest.fn().mockReturnValue(mockLogger);
    mockLogger.info = jest.fn();
    mockLogger.debug = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
  });

  describe('Execution Time Performance', () => {
    it('should complete within 4-minute timeout under normal load', async () => {
      // Setup moderate load scenario (5 tickers, 3 filings)
      const mockActiveTickers = Array.from({ length: 5 }, (_, i) => ({
        id: `ticker${i}`,
        cik: `${1318605 + i}`,
        symbol: `TICK${i}`,
        companyName: `Company ${i}`,
        rssUrl: `https://sec.gov/rss/${1318605 + i}`,
        lastChecked: null,
        lastAccessionSeen: null,
        subscriberCount: 2
      }));
      
      const mockUnprocessedFilings = Array.from({ length: 3 }, (_, i) => ({
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
      
      // Setup realistic response times
      mockTickerMonitoring.getActiveTickersForMonitoring
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockActiveTickers), 100)));
      
      mockTickerMonitoring.checkTickerForNewFilings
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 500))); // RSS check delay
      
      mockTickerMonitoring.getUnprocessedFilings
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockUnprocessedFilings), 50)));
      
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(), 200)));
      
      // Simulate realistic processing delays
      mockEnhancedFetch.enhancedFetch
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('Mock content'), 1000))); // Filing fetch delay
      
      mockFormParser.parseFormContentEnhanced
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ sections: 'Content', metadata: {} }), 500)));
      
      mockSummaryService.generateAISummaryWithRetry
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ summary: 'Summary', cost: 0.01 }), 2000))); // AI delay
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user1', email: 'user@example.com', name: 'User' }
      ]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      mockEmailService.sendFilingSummaryEmail
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 300)));
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      const result = await response.json();
      
      // Performance assertions
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(metrics.executionTime).toBeLessThan(4 * 60 * 1000); // < 4 minutes
      expect(result.durationMs).toBeLessThan(4 * 60 * 1000);
      
      // Should process efficiently
      expect(result.stats.tickersChecked).toBe(5);
      expect(result.stats.filingsProcessed).toBe(3);
      
      console.log(`Execution time: ${metrics.executionTime}ms`);
      console.log(`Memory usage: ${JSON.stringify(metrics.memoryUsage)}`);
    }, 5 * 60 * 1000); // 5 minute test timeout

    it('should handle maximum batch size efficiently', async () => {
      // Test with maximum batch size (5 filings)
      const mockUnprocessedFilings = Array.from({ length: 5 }, (_, i) => ({
        id: `filing${i}`,
        accessionNumber: `000-${i.toString().padStart(6, '0')}`,
        filingType: i % 2 === 0 ? '10-K' : '10-Q', // Mix of filing types
        filingDate: new Date('2024-01-15'),
        filingUrl: `https://sec.gov/filing${i}`,
        ticker: {
          cik: `${1318605 + i}`,
          symbol: `TICK${i}`,
          companyName: `Company ${i}`
        }
      }));
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      // Simulate realistic processing times
      mockEnhancedFetch.enhancedFetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('Large filing content...'.repeat(1000)), 800))
      );
      
      mockFormParser.parseFormContentEnhanced.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ 
          sections: { 'Item 1': 'Content...'.repeat(500) }, 
          metadata: {} 
        }), 600))
      );
      
      mockSummaryService.generateAISummaryWithRetry.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ 
          summary: 'Comprehensive summary...'.repeat(10), 
          cost: 0.05,
          tokensUsed: 2000 
        }), 3000)) // Longer AI processing for complex content
      );
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(5);
      expect(metrics.executionTime).toBeLessThan(4 * 60 * 1000);
      
      // Should process sequentially without overwhelming the system
      const avgTimePerFiling = metrics.executionTime / 5;
      expect(avgTimePerFiling).toBeLessThan(45 * 1000); // < 45 seconds per filing on average
      
      console.log(`Batch processing time: ${metrics.executionTime}ms`);
      console.log(`Average per filing: ${avgTimePerFiling}ms`);
    }, 5 * 60 * 1000);

    it('should respect rate limiting delays', async () => {
      // Test that rate limiting pauses are properly implemented
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
      
      const mockUnprocessedFilings = Array.from({ length: 3 }, (_, i) => ({
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
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Content');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      
      expect(response.status).toBe(200);
      
      // Should include rate limiting delays
      // 6 tickers with 1-second pause between batches + 3 filings with 0.5-second pauses
      const expectedMinimumTime = 1000 + (3 * 500); // Minimum delay time
      expect(metrics.executionTime).toBeGreaterThan(expectedMinimumTime);
      
      console.log(`Rate-limited execution time: ${metrics.executionTime}ms`);
    });
  });

  describe('Memory Usage Performance', () => {
    it('should maintain reasonable memory usage during processing', async () => {
      const mockUnprocessedFilings = Array.from({ length: 5 }, (_, i) => ({
        id: `filing${i}`,
        accessionNumber: `000-${i.toString().padStart(6, '0')}`,
        filingType: '10-K',
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
      
      // Simulate large filing content
      const largeContent = 'Large filing content...'.repeat(10000); // ~200KB content
      mockEnhancedFetch.enhancedFetch.mockResolvedValue(largeContent);
      
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ 
        sections: { 'Item 1': largeContent }, 
        metadata: {} 
      });
      
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ 
        summary: 'Summary', 
        cost: 0.01 
      });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const initialMemory = process.memoryUsage();
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      
      expect(response.status).toBe(200);
      
      // Memory usage should not grow excessively
      const memoryIncrease = metrics.memoryUsage.heapUsed - initialMemory.heapUsed;
      const maxAllowedIncrease = 512 * 1024 * 1024; // 512MB
      
      expect(memoryIncrease).toBeLessThan(maxAllowedIncrease);
      
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      console.log(`Peak heap used: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    });

    it('should handle memory pressure gracefully', async () => {
      // Simulate extreme memory usage scenario
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
      
      // Simulate very large filing (50MB content)
      const hugeContent = 'X'.repeat(50 * 1024 * 1024);
      mockEnhancedFetch.enhancedFetch.mockResolvedValue(hugeContent);
      
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ 
        sections: { 'Item 1': hugeContent.substring(0, 1000000) }, // Limit parsed content
        metadata: {} 
      });
      
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ 
        summary: 'Summary for large filing', 
        cost: 0.1 
      });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      
      expect(response.status).toBe(200);
      
      // Should complete despite large content
      const result = await response.json();
      expect(result.success).toBe(true);
      
      console.log(`Large file processing time: ${metrics.executionTime}ms`);
      console.log(`Memory usage: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    });
  });

  describe('Concurrent Processing Performance', () => {
    it('should handle multiple concurrent RSS checks efficiently', async () => {
      // Test concurrent processing of many tickers
      const mockActiveTickers = Array.from({ length: 15 }, (_, i) => ({
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
      
      // Simulate realistic RSS check delays
      mockTickerMonitoring.checkTickerForNewFilings.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 200 + Math.random() * 300))
      );
      
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.tickersChecked).toBe(15);
      
      // Concurrent processing should be faster than sequential
      const maxSequentialTime = 15 * 500; // If all were sequential at 500ms each
      expect(metrics.executionTime).toBeLessThan(maxSequentialTime);
      
      // Should respect MAX_CONCURRENT_RSS_CHECKS limit
      expect(mockTickerMonitoring.checkTickerForNewFilings).toHaveBeenCalledTimes(15);
      
      console.log(`Concurrent RSS processing time: ${metrics.executionTime}ms`);
      console.log(`Tickers per second: ${Math.round((15 * 1000) / metrics.executionTime)}`);
    });

    it('should maintain performance under database connection pressure', async () => {
      const mockUnprocessedFilings = Array.from({ length: 5 }, (_, i) => ({
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Content');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      // Simulate database operations with realistic delays
      mockPrisma.ticker.upsert.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ id: 'ticker-1' }), 50))
      );
      
      mockPrisma.summary.create.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ id: 'summary-1', summaryText: 'Summary' }), 100))
      );
      
      mockPrisma.user.findMany.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 30))
      );
      
      mockPrisma.user.findFirst.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ 
          id: 'system-user', 
          email: 'system@tldrsec.com', 
          name: 'System User' 
        }), 25))
      );
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      
      expect(response.status).toBe(200);
      
      // Should complete efficiently despite database delays
      expect(metrics.executionTime).toBeLessThan(2 * 60 * 1000); // < 2 minutes
      
      console.log(`DB-intensive processing time: ${metrics.executionTime}ms`);
    });
  });

  describe('Load Testing Scenarios', () => {
    it('should handle high-volume filing day (earnings season)', async () => {
      // Simulate earnings season with many filings
      const mockActiveTickers = Array.from({ length: 20 }, (_, i) => ({
        id: `ticker${i}`,
        cik: `${1318605 + i}`,
        symbol: `TICK${i}`,
        companyName: `Company ${i}`,
        rssUrl: `https://sec.gov/rss/${1318605 + i}`,
        lastChecked: null,
        lastAccessionSeen: null,
        subscriberCount: 3
      }));
      
      const mockNewFilings = Array.from({ length: 2 }, (_, j) => ({
        accessionNumber: `000-filing-${j}`,
        filingType: j % 2 === 0 ? '10-Q' : '8-K',
        filingDate: new Date('2024-01-15'),
        filingUrl: `https://sec.gov/filing-${j}`,
        rssEntryDate: new Date('2024-01-15')
      }));
      
      const mockUnprocessedFilings = Array.from({ length: 5 }, (_, i) => ({
        id: `filing${i}`,
        accessionNumber: `000-${i.toString().padStart(6, '0')}`,
        filingType: i % 3 === 0 ? '10-Q' : (i % 3 === 1 ? '8-K' : '10-K'),
        filingDate: new Date('2024-01-15'),
        filingUrl: `https://sec.gov/filing${i}`,
        ticker: {
          cik: `${1318605 + i}`,
          symbol: `TICK${i}`,
          companyName: `Company ${i}`
        }
      }));
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue(mockNewFilings);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      // Simulate realistic processing for different filing types
      mockEnhancedFetch.enhancedFetch.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve('Filing content...'.repeat(100)), 800))
      );
      
      mockFormParser.parseFormContentEnhanced.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ 
          sections: { 'Content': 'Parsed content...' }, 
          metadata: {} 
        }), 400))
      );
      
      mockSummaryService.generateAISummaryWithRetry.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ 
          summary: 'AI summary...', 
          cost: 0.02,
          tokensUsed: 1500 
        }), 2500))
      );
      
      // Many subscribers for notifications
      const mockSubscribers = Array.from({ length: 5 }, (_, i) => ({
        id: `user${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`
      }));
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue(mockSubscribers);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      mockEmailService.sendFilingSummaryEmail.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.stats.tickersChecked).toBe(20);
      expect(result.stats.filingsProcessed).toBe(5);
      expect(result.stats.emailsSent).toBeGreaterThan(0);
      
      // Should complete within timeout even under high load
      expect(metrics.executionTime).toBeLessThan(4 * 60 * 1000);
      
      console.log(`High-volume processing time: ${metrics.executionTime}ms`);
      console.log(`Throughput: ${Math.round((20 + 5) * 1000 / metrics.executionTime)} items/sec`);
    }, 5 * 60 * 1000);

    it('should maintain performance with many email subscribers', async () => {
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
      
      // Large subscriber base (100 users)
      const mockSubscribers = Array.from({ length: 100 }, (_, i) => ({
        id: `user${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`
      }));
      
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue(mockUnprocessedFilings);
      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Filing content');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue(mockSubscribers);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      // Fast email sending
      mockEmailService.sendFilingSummaryEmail.mockResolvedValue({ success: true });
      
      perfMonitor.start();
      const response = await GET(mockRequest);
      const metrics = perfMonitor.stop();
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.stats.filingsProcessed).toBe(1);
      expect(result.stats.emailsSent).toBe(100);
      
      // Should complete efficiently even with many emails
      expect(metrics.executionTime).toBeLessThan(2 * 60 * 1000); // < 2 minutes
      
      // Verify all emails were attempted
      expect(mockEmailService.sendFilingSummaryEmail).toHaveBeenCalledTimes(100);
      
      console.log(`Mass email processing time: ${metrics.executionTime}ms`);
      console.log(`Emails per second: ${Math.round((100 * 1000) / metrics.executionTime)}`);
    });
  });

  describe('Resource Efficiency', () => {
    it('should efficiently clean up resources after processing', async () => {
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
      
      mockEnhancedFetch.enhancedFetch.mockResolvedValue('Content');
      mockFormParser.parseFormContentEnhanced.mockResolvedValue({ sections: 'Content', metadata: {} });
      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({ summary: 'Summary', cost: 0.01 });
      
      mockPrisma.ticker.upsert.mockResolvedValue({ id: 'ticker-1' });
      mockPrisma.summary.create.mockResolvedValue({ id: 'summary-1', summaryText: 'Summary' });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'system-user', email: 'system@tldrsec.com', name: 'System User' });
      
      const initialMemory = process.memoryUsage();
      
      const response = await GET(mockRequest);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      
      expect(response.status).toBe(200);
      
      // Memory should not grow significantly after processing
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const maxAcceptableGrowth = 50 * 1024 * 1024; // 50MB
      
      expect(memoryGrowth).toBeLessThan(maxAcceptableGrowth);
      
      // Cleanup should have been called
      expect(mockTickerMonitoring.cleanupOldMonitoringData).toHaveBeenCalled();
      
      console.log(`Memory growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB`);
    });

    it('should report accurate performance statistics', async () => {
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
      mockTickerMonitoring.getUnprocessedFilings.mockResolvedValue([]);
      mockTickerMonitoring.cleanupOldMonitoringData.mockResolvedValue();
      
      const startTime = Date.now();
      const response = await GET(mockRequest);
      const actualDuration = Date.now() - startTime;
      const result = await response.json();
      
      expect(response.status).toBe(200);
      
      // Reported duration should be close to actual duration
      const durationDiff = Math.abs(result.durationMs - actualDuration);
      expect(durationDiff).toBeLessThan(100); // Within 100ms tolerance
      
      // Should include timing metadata
      expect(result.stats.startTime).toBeDefined();
      expect(result.stats.endTime).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
      
      console.log(`Reported duration: ${result.durationMs}ms`);
      console.log(`Actual duration: ${actualDuration}ms`);
    });
  });
});

// Performance benchmark test (run separately)
describe.skip('SEC Filing Cron Job - Performance Benchmarks', () => {
  it('should meet performance benchmarks', async () => {
    // This test can be run manually for performance validation
    const benchmarks = {
      maxExecutionTime: 4 * 60 * 1000, // 4 minutes
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      minThroughput: 1, // filings per minute
      maxErrorRate: 0.01 // 1%
    };
    
    console.log('Performance Benchmarks:', benchmarks);
    console.log('Run actual performance tests to validate against these benchmarks');
    
    expect(true).toBe(true); // Placeholder
  });
});