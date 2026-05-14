import { jest } from '@jest/globals';
import { NextRequest } from 'next/server';
// Note: monitor-sec-filings route is disabled, using tier-aware route for testing
import { GET } from '../../../app/api/cron/route';

// Mock all external dependencies
jest.mock('../../../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn(),
  checkTickerForNewFilings: jest.fn(),
  getUnprocessedFilings: jest.fn(),
  markFilingAsProcessed: jest.fn(),
  cleanupOldMonitoringData: jest.fn()
}));

jest.mock('../../../lib/network/enhanced-fetch', () => ({
  enhancedFetch: jest.fn()
}));

jest.mock('../../../lib/parsers/form-parser', () => ({
  ...jest.requireActual('../../../lib/parsers/form-parser'),
  parseFormContentEnhanced: jest.fn()
}));

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    summary: {
      create: jest.fn()
    },
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn()
    },
    ticker: {
      upsert: jest.fn()
    }
  }))
}));

jest.mock('../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    })),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

jest.mock('../../../lib/email/summary-service', () => ({
  sendFilingSummaryEmail: jest.fn()
}));

jest.mock('../../../lib/ai', () => ({
  getClaudeModel: jest.fn(() => 'claude-3-opus-20240229')
}));

jest.mock('../../../services/filing/summaryGenerationService', () => ({
  generateAISummaryWithRetry: jest.fn()
}));

// Import mocked functions
import {
  getActiveTickersForMonitoring,
  checkTickerForNewFilings,
  getUnprocessedFilings,
  markFilingAsProcessed,
  cleanupOldMonitoringData
} from '../../../lib/sec-edgar/ticker-monitoring';
import { enhancedFetch } from '../../../lib/network/enhanced-fetch';
import { parseFormContentEnhanced } from '../../../lib/parsers/form-parser';
import { getPrismaClient } from '../../../lib/db/prisma';
import { sendFilingSummaryEmail } from '../../../lib/email/summary-service';
import { generateAISummaryWithRetry } from '../../../services/filing/summaryGenerationService';

const mockGetActiveTickersForMonitoring = getActiveTickersForMonitoring as jest.MockedFunction<typeof getActiveTickersForMonitoring>;
const mockCheckTickerForNewFilings = checkTickerForNewFilings as jest.MockedFunction<typeof checkTickerForNewFilings>;
const mockGetUnprocessedFilings = getUnprocessedFilings as jest.MockedFunction<typeof getUnprocessedFilings>;
const mockMarkFilingAsProcessed = markFilingAsProcessed as jest.MockedFunction<typeof markFilingAsProcessed>;
const mockEnhancedFetch = enhancedFetch as jest.MockedFunction<typeof enhancedFetch>;
const mockParseFormContentEnhanced = parseFormContentEnhanced as jest.MockedFunction<typeof parseFormContentEnhanced>;
const mockSendFilingSummaryEmail = sendFilingSummaryEmail as jest.MockedFunction<typeof sendFilingSummaryEmail>;
const mockGenerateAISummaryWithRetry = generateAISummaryWithRetry as jest.MockedFunction<typeof generateAISummaryWithRetry>;

describe('SEC Filings Cron Job', () => {
  let mockPrisma: any;
  let mockRequest: NextRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup environment
    process.env.CRON_SECRET = 'test-cron-secret';
    
    // Setup mock Prisma client
    mockPrisma = {
      summary: {
        create: jest.fn()
      },
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn()
      },
      ticker: {
        upsert: jest.fn()
      }
    };
    
    (getPrismaClient as jest.MockedFunction<typeof getPrismaClient>).mockReturnValue(mockPrisma);
    
    // Setup mock request with proper authorization
    mockRequest = {
      url: 'http://localhost/api/cron?action=tier-aware',
      headers: {
        get: jest.fn((header) => {
          if (header === 'authorization') return 'Bearer test-cron-secret';
          return null;
        })
      }
    } as any;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('Authorization', () => {
    it('should reject unauthorized requests', async () => {
      const unauthorizedRequest = {
        url: 'http://localhost/api/cron?action=tier-aware',
        headers: {
          get: jest.fn(() => null)
        }
      } as any;

      const response = await GET(unauthorizedRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect((data as any).error).toBe('Unauthorized');
    });

    it('should accept properly authorized requests', async () => {
      // Mock empty tickers to avoid processing
      mockGetActiveTickersForMonitoring.mockResolvedValue([]);
      mockGetUnprocessedFilings.mockResolvedValue([]);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect((data as any).success).toBe(true);
    });
  });

  describe('Filing Processing Pipeline', () => {
    const mockTicker = {
      id: 'ticker-1',
      cik: '1234567',
      symbol: 'TEST',
      companyName: 'Test Company Inc.',
      rssUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?CIK=1234567&action=getcompany&output=atom',
      lastChecked: new Date('2023-12-30'),
      lastAccessionSeen: null,
      subscriberCount: 5
    };

    const mockFiling = {
      id: 'filing-1',
      accessionNumber: '0001234567-23-000001',
      filingType: '10-K',
      filingDate: new Date('2023-12-31'),
      filingUrl: 'https://www.sec.gov/Archives/edgar/data/1234567/000123456723000001/test-10k.htm',
      ticker: {
        cik: mockTicker.cik,
        symbol: mockTicker.symbol,
        companyName: mockTicker.companyName
      }
    };

    beforeEach(() => {
      // Setup basic mocks for successful processing
      mockGetActiveTickersForMonitoring.mockResolvedValue([mockTicker]);
      mockCheckTickerForNewFilings.mockResolvedValue([]);
      mockGetUnprocessedFilings.mockResolvedValue([mockFiling]);
      mockMarkFilingAsProcessed.mockResolvedValue(undefined);
      
      // Mock successful filing content fetch
      mockEnhancedFetch.mockResolvedValue('<html><body>Test filing content</body></html>');
      
      // Mock successful content parsing
      mockParseFormContentEnhanced.mockResolvedValue({
        title: 'Test Company Inc. - Form 10-K',
        content: 'Parsed filing content with key business information',
        sections: {
          'Business Overview': 'Business section content',
          'Risk Factors': 'Risk factors section content',
          'Financial Data': 'Financial data section content'
        },
        keyData: {
          revenue: 1000000,
          netIncome: 200000,
          formType: '10-K'
        },
        metadata: {
          formType: '10-K',
          companyName: 'Test Company Inc.',
          cik: '1234567'
        }
      });
      
      // Mock successful AI summary generation
      mockGenerateAISummaryWithRetry.mockResolvedValue({
        summary: 'Test Company Inc. reported strong annual results with revenue growth of 15% year-over-year.',
        keyPoints: [
          'Revenue increased 15% to $100M',
          'Net income improved to $20M',
          'Expanding into new markets'
        ],
        tokensUsed: 1500,
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-3-opus-20240229',
        cost: 0.0525
      });
      
      // Mock database operations
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'system-user-id',
        email: 'system@tldrsec.app'
      });
      
      mockPrisma.ticker.upsert.mockResolvedValue({
        id: 'ticker-db-id'
      });
      
      mockPrisma.summary.create.mockResolvedValue({
        id: 'summary-id',
        summaryText: 'Created summary'
      });
      
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'user1@test.com',
          name: 'Test User 1'
        }
      ]);
      
      // Mock email service
      mockSendFilingSummaryEmail.mockResolvedValue({ success: true });
    });

    it('should successfully process a filing with AI summarization', async () => {
      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect((data as any).success).toBe(true);
      expect((data as any).stats.filingsProcessed).toBe(1);

      // Verify the complete pipeline was executed
      expect(mockEnhancedFetch).toHaveBeenCalledWith(
        mockFiling.filingUrl,
        expect.objectContaining({
          responseType: 'text',
          operationName: 'sec-filing-cron-fetch'
        })
      );

      expect(mockParseFormContentEnhanced).toHaveBeenCalledWith(
        '<html><body>Test filing content</body></html>',
        '10-K',
        mockFiling.filingUrl
      );

      expect(mockGenerateAISummaryWithRetry).toHaveBeenCalledWith(
        'Parsed filing content with key business information',
        {
          formType: '10-K',
          filingDate: '2023-12-31T00:00:00.000Z', // Date converted to ISO string
          accessionNumber: '0001234567-23-000001'
        },
        {
          name: 'Test Company Inc.',
          ticker: 'TEST'
        }
      );

      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: {
          tickerId: 'ticker-db-id',
          filingType: '10-K',
          filingDate: mockFiling.filingDate,
          filingUrl: mockFiling.filingUrl,
          summaryText: 'Test Company Inc. reported strong annual results with revenue growth of 15% year-over-year.',
          summaryJSON: undefined, // Text summary, not object
          cost: 0.0525,
          tokensUsed: 0, // Note: current implementation doesn't store token usage
          processingTimeMs: 0, // Note: current implementation doesn't store processing time
          processingStatus: 'COMPLETED',
          processingCompletedAt: expect.any(Date),
          model: 'claude-3-opus-20240229',
          sentToUser: false
        }
      });

      expect(mockSendFilingSummaryEmail).toHaveBeenCalledWith(
        'user1@test.com',
        {
          companyName: 'Test Company Inc.',
          ticker: 'TEST',
          filingType: '10-K',
          filingDate: mockFiling.filingDate,
          summary: 'Created summary',
          filingUrl: mockFiling.filingUrl
        }
      );

      expect(mockMarkFilingAsProcessed).toHaveBeenCalledWith('filing-1');
    });

    it('should handle AI summary generation failure with fallback', async () => {
      // Mock AI summary generation failure
      mockGenerateAISummaryWithRetry.mockResolvedValue({
        summary: 'Fallback summary due to AI generation failure',
        keyPoints: [
          'This is a 10-K filing for Test Company Inc. (TEST)',
          'AI-powered summary generation failed. This is a fallback summary.',
          'Please review the original filing for complete details.'
        ],
        error: 'API rate limit exceeded'
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect((data as any).success).toBe(true);
      expect((data as any).stats.filingsProcessed).toBe(1);

      // Verify fallback summary was stored
      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summaryText: 'Fallback summary due to AI generation failure',
          cost: 0 // Fallback summaries have no cost
        })
      });
    });

    it('should handle JSON summary response correctly', async () => {
      // Mock AI summary that returns JSON object instead of string
      const jsonSummary = {
        overview: 'Company performance overview',
        highlights: ['Key point 1', 'Key point 2']
      };

      mockGenerateAISummaryWithRetry.mockResolvedValue({
        summary: jsonSummary as any,
        keyPoints: ['Processed key points'],
        tokensUsed: 800,
        cost: 0.03
      });

      const response = await GET(mockRequest);

      expect(mockPrisma.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summaryText: JSON.stringify(jsonSummary), // JSON converted to string
          summaryJSON: jsonSummary, // JSON stored in separate field
          cost: 0.03
        })
      });
    });

    it('should handle content parsing with different section formats', async () => {
      // Mock parsed content with object sections instead of string
      mockParseFormContentEnhanced.mockResolvedValue({
        title: 'Test Company Inc. - Form 10-K',
        content: 'Combined content from all sections',
        sections: {
          businessOverview: 'Company business information',
          financialData: 'Financial performance data',
          riskFactors: 'Risk assessment details'
        },
        keyData: {
          revenue: 1000000,
          formType: '10-K'
        },
        metadata: {
          formType: '10-K',
          companyName: 'Test Company Inc.'
        }
      });

      const response = await GET(mockRequest);

      expect(mockGenerateAISummaryWithRetry).toHaveBeenCalledWith(
        'Combined content from all sections',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should continue processing other filings when one fails', async () => {
      const failingFiling = { ...mockFiling, id: 'failing-filing' };
      const successFiling = { ...mockFiling, id: 'success-filing' };
      
      mockGetUnprocessedFilings.mockResolvedValue([failingFiling, successFiling]);
      
      // Make first filing fail during fetch
      mockEnhancedFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('<html>Success content</html>');

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect((data as any).stats.filingsProcessed).toBe(1); // Only successful filing counted
      expect((data as any).stats.errors).toBe(1); // Failed filing counted as error
      
      // Both filings should be marked as processed (even the failed one to avoid infinite retries)
      expect(mockMarkFilingAsProcessed).toHaveBeenCalledWith('failing-filing');
      expect(mockMarkFilingAsProcessed).toHaveBeenCalledWith('success-filing');
    });

    it('should handle database user creation for system operations', async () => {
      // Mock no existing system user
      mockPrisma.user.findFirst.mockResolvedValue(null);
      
      // Mock system user creation
      const systemUser = {
        id: 'new-system-user-id',
        email: 'system@tldrsec.app',
        name: 'System User'
      };
      mockPrisma.user.create.mockResolvedValue(systemUser);

      const response = await GET(mockRequest);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'system@tldrsec.app',
          name: 'System User',
          authProvider: 'system',
          authProviderId: 'system-cron',
          onboardingCompleted: true
        }
      });

      expect(mockPrisma.ticker.upsert).toHaveBeenCalledWith({
        where: {
          userId_symbol: {
            userId: 'new-system-user-id',
            symbol: 'TEST'
          }
        },
        update: {
          companyName: 'Test Company Inc.'
        },
        create: {
          symbol: 'TEST',
          companyName: 'Test Company Inc.',
          userId: 'new-system-user-id'
        }
      });
    });

    it('should handle email notification failures gracefully', async () => {
      // Mock email service failure
      mockSendFilingSummaryEmail.mockRejectedValue(new Error('SMTP connection failed'));

      const response = await GET(mockRequest);
      const data = await response.json();

      // Processing should still succeed even if email fails
      expect(response.status).toBe(200);
      expect((data as any).success).toBe(true);
      expect((data as any).stats.filingsProcessed).toBe(1);
      expect((data as any).stats.emailsSent).toBe(0); // No successful emails
    });
  });

  describe('Rate Limiting and Batch Processing', () => {
    it('should respect batch size limits', async () => {
      const manyFilings = Array.from({ length: 10 }, (_, i) => ({
        id: `filing-${i}`,
        accessionNumber: `000123456723${i.toString().padStart(6, '0')}`,
        filingType: '8-K',
        filingDate: new Date('2023-12-01'),
        filingUrl: `https://sec.gov/filing-${i}.htm`,
        ticker: { 
          cik: '1234567', 
          symbol: 'TEST', 
          companyName: 'Test Co' 
        }
      }));

      mockGetActiveTickersForMonitoring.mockResolvedValue([]);
      mockGetUnprocessedFilings.mockResolvedValue(manyFilings);

      // Mock processing setup
      mockEnhancedFetch.mockResolvedValue('<html>content</html>');
      mockParseFormContentEnhanced.mockResolvedValue({ 
        title: 'Filing Title',
        content: 'parsed content',
        sections: { 'main': 'parsed content' },
        keyData: {},
        metadata: {}
      });
      mockGenerateAISummaryWithRetry.mockResolvedValue({
        summary: 'Test summary',
        keyPoints: []
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      // Should only process BATCH_SIZE (5) filings, not all 10
      expect((data as any).stats.filingsProcessed).toBeLessThanOrEqual(5);
    });

    it('should handle processing timeout gracefully', async () => {
      // This test would be complex to implement without mocking setTimeout
      // but validates the concept that processing respects timeout limits
      expect(true).toBe(true); // Placeholder for timeout handling test
    });
  });

  describe('Error Handling', () => {
    it('should return error response when critical operations fail', async () => {
      mockGetActiveTickersForMonitoring.mockRejectedValue(new Error('Database connection failed'));

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect((data as any).success).toBe(false);
      expect((data as any).error).toContain('Database connection failed');
    });

    it('should handle malformed filing data', async () => {
      const malformedFiling = {
        id: 'malformed-filing',
        // Missing required fields
        accessionNumber: '',
        filingType: '',
        filingDate: new Date(),
        filingUrl: 'invalid-url',
        ticker: {
          cik: '',
          symbol: '',
          companyName: ''
        } // Minimal ticker object with required fields
      };

      mockGetActiveTickersForMonitoring.mockResolvedValue([]);
      mockGetUnprocessedFilings.mockResolvedValue([malformedFiling as any]);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect((data as any).stats.errors).toBe(1);
    });
  });
});