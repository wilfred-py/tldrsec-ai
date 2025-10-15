/**
 * Comprehensive Cron Integration Test Suite
 * 
 * This test suite validates the entire cron functionality based on the debugging
 * findings from Railway deployment issues. It covers all critical failure points
 * and ensures robust operation in production environments.
 * 
 * Test Categories:
 * 1. Railway Configuration Tests - URL construction, environment variables, authentication
 * 2. Cron Endpoint Integration Tests - routing, market hours, RSS monitoring
 * 3. Database Consistency Tests - TickerMonitoring records, filing tracking
 * 4. End-to-End Workflow Tests - complete RSS → summarization → email pipeline
 * 5. Regression Prevention Tests - authentication, middleware security, concurrency
 */

// Set up test environment variables BEFORE any imports
process.env.CRON_SECRET = 'test-cron-secret-for-comprehensive-testing-min-32-chars';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { NextRequest, NextResponse } from 'next/server';
import { CronJobMonitor } from '../../lib/monitoring/cron-monitor';
import * as tickerMonitoring from '../../lib/sec-edgar/ticker-monitoring';
import * as rssParser from '../../lib/sec-edgar/rss-parser';
import * as summaryService from '../../services/filing/summaryGenerationService';
import * as emailService from '../../services/filing/sendEmailSummary';
import { getMarketHoursContext, getUserProcessingStatuses, getEligibleUsers } from '../../lib/cron/market-hours';
import { updateUserBudgetWithLock } from '../../lib/db/concurrency';
import { rateLimiter } from '../../lib/security/rate-limiter';

// Mock all external dependencies
jest.mock('../../lib/db/prisma', () => {
  const mockPrismaInstance = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    ticker: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    summary: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    rssFilingCheck: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    cikMapping: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    tickerMonitoring: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  
  return {
    getPrismaClient: jest.fn(() => mockPrismaInstance),
    prisma: mockPrismaInstance
  };
});
jest.mock('../../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn()
  }
}));
jest.mock('../../lib/sec-edgar/ticker-monitoring');
jest.mock('../../lib/sec-edgar/rss-parser');
jest.mock('../../services/filing/summaryGenerationService');
jest.mock('../../services/filing/sendEmailSummary');
jest.mock('../../lib/cron/market-hours');
jest.mock('../../lib/db/concurrency');
jest.mock('../../lib/security/rate-limiter');
jest.mock('../../lib/logging', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));
jest.mock('../../lib/db/cost-validation', () => ({
  validateCostUpdate: jest.fn().mockReturnValue({ 
    valid: true, 
    sanitizedCost: 0.5 
  })
}));
jest.mock('../../lib/db/transaction-manager', () => ({
  FilingTransactionManager: {
    processFilingWithTransaction: jest.fn().mockResolvedValue({
      success: true,
      data: { cost: 0.5 },
      transactionId: 'test-transaction-id'
    })
  }
}));
jest.mock('../../lib/db/async-audit', () => ({
  createAsyncAuditLog: jest.fn().mockResolvedValue(undefined)
}));

// Mock the cron service classes that the route depends on
jest.mock('../../lib/cron/auth-service', () => ({
  CronAuthService: {
    validateCronRequest: jest.fn().mockResolvedValue({ 
      isValid: true, 
      clientIP: '127.0.0.1' 
    }),
    detectPlatform: jest.fn().mockReturnValue('test')
  }
}));

jest.mock('../../lib/cron/user-processing-service', () => ({
  CronUserProcessingService: {
    getEligibleUsersForProcessing: jest.fn().mockResolvedValue({
      allUsers: [],
      eligibleUsers: []
    }),
    processEligibleUsers: jest.fn().mockResolvedValue({
      usersProcessed: 0,
      filingsProcessed: 0,
      emailsSent: 0,
      totalCostUSD: 0,
      errorBreakdown: {
        budgetExceeded: 0,
        costValidationFailed: 0,
        concurrencyConflicts: 0
      }
    })
  }
}));

jest.mock('../../lib/cron/sec-filing-service', () => ({
  CronSecFilingService: {
    runSecFilingMonitoring: jest.fn().mockResolvedValue({
      tickersChecked: 0,
      newFilingsFound: 0,
      errorCount: 0
    })
  }
}));

jest.mock('../../lib/cron/filing-processor', () => ({
  CronFilingProcessor: {
    processSingleFiling: jest.fn().mockResolvedValue({
      success: true,
      cost: 0.5
    }),
    processUserWithDeduplicatedFilings: jest.fn().mockResolvedValue({
      success: true,
      cost: 0.5
    }),
    processUserTierFilings: jest.fn().mockResolvedValue({
      success: true,
      cost: 0.5
    })
  }
}));

jest.mock('../../lib/security/secure-random', () => ({
  generateSecureExecutionId: jest.fn().mockReturnValue('test-execution-id-123')
}));

jest.mock('../../lib/sec-edgar/ticker-monitoring', () => ({
  getUnprocessedFilings: jest.fn().mockResolvedValue([]),
  markFilingAsProcessedByAccession: jest.fn().mockResolvedValue(true),
  getActiveTickersForMonitoring: jest.fn().mockResolvedValue([]),
  checkTickerForNewFilings: jest.fn().mockResolvedValue([]),
  validateUserTickers: jest.fn().mockResolvedValue([]),
  markFilingAsProcessed: jest.fn().mockResolvedValue(undefined),
  getTickerMonitoringRecord: jest.fn().mockResolvedValue(null),
  updateTickerLastChecked: jest.fn().mockResolvedValue(undefined),
  getUnprocessedFilingsForTicker: jest.fn().mockResolvedValue([]),
  createTickerMonitoringRecord: jest.fn().mockResolvedValue(undefined),
  getNewFilingsForUser: jest.fn().mockResolvedValue([]),
  updateFilingProcessingStatus: jest.fn().mockResolvedValue(undefined)
}));

// Mock companyService to prevent real HTTP calls to SEC.gov
jest.mock('../../services/companyService', () => ({
  findCompanyByTicker: jest.fn().mockImplementation((ticker: string) => {
    // Return mock company data for common test tickers
    const mockCompanies: { [key: string]: any } = {
      'AAPL': { ticker: 'AAPL', cik: '320193', companyName: 'Apple Inc.' },
      'TSLA': { ticker: 'TSLA', cik: '1318605', companyName: 'Tesla, Inc.' },
      'MSFT': { ticker: 'MSFT', cik: '789019', companyName: 'Microsoft Corporation' }
    };
    return Promise.resolve(mockCompanies[ticker.toUpperCase()] || null);
  })
}));

// Mock company filings service to prevent real HTTP calls to SEC.gov
jest.mock('../../services/company/filings', () => ({
  getCompanyFilings: jest.fn().mockResolvedValue([
    {
      id: 'mock-filing-1',
      accessionNumber: '0000320193-24-000001',
      formType: '10-K',
      filedAt: '2024-01-01',
      reportDate: '2023-12-31',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      url: 'https://www.sec.gov/Archives/edgar/mock-filing-1.html'
    }
  ])
}));

// Simplify Prisma Client mock to avoid conflicts
// Comment out the complex PrismaClient mock that might be causing issues
// jest.mock('@prisma/client', () => ({
//   PrismaClient: jest.fn().mockImplementation(() => ({
//     user: {
//       findMany: jest.fn().mockResolvedValue([]),
//       findUnique: jest.fn().mockResolvedValue(null),
//       updateMany: jest.fn().mockResolvedValue({ count: 0 })
//     },
//     auditLog: {
//       create: jest.fn().mockResolvedValue({})
//     },
//     $connect: jest.fn().mockResolvedValue(undefined),
//     $disconnect: jest.fn().mockResolvedValue(undefined),
//     $transaction: jest.fn().mockImplementation((callback: Function) => callback({}))
//   }))
// }));


// Import after mocks are set up
import { getPrismaClient } from '../../lib/db/prisma';
import { GET as tierAwareRoute } from '../../app/api/cron/tier-aware/route';
import { CronAuthService } from '../../lib/cron/auth-service';
import { CronUserProcessingService } from '../../lib/cron/user-processing-service';
import { CronSecFilingService } from '../../lib/cron/sec-filing-service';
import { CronFilingProcessor } from '../../lib/cron/filing-processor';

// Get reference to the mocked Prisma instance
const mockPrismaInstance = (getPrismaClient as jest.Mock)();

// Set up proper mock implementations
mockPrismaInstance.$transaction.mockImplementation(async (callback: Function) => {
  // For transactions, just execute the callback with the mock prisma
  return await callback(mockPrismaInstance);
});

mockPrismaInstance.$connect.mockResolvedValue(undefined);
mockPrismaInstance.$disconnect.mockResolvedValue(undefined);
const mockTickerMonitoring = tickerMonitoring as jest.Mocked<typeof tickerMonitoring>;
const mockRssParser = rssParser as jest.Mocked<typeof rssParser>;
const mockSummaryService = summaryService as jest.Mocked<typeof summaryService>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;
const mockMarketHours = {
  getMarketHoursContext: getMarketHoursContext as jest.MockedFunction<typeof getMarketHoursContext>,
  getUserProcessingStatuses: getUserProcessingStatuses as jest.MockedFunction<typeof getUserProcessingStatuses>,
  getEligibleUsers: getEligibleUsers as jest.MockedFunction<typeof getEligibleUsers>
};
const mockConcurrency = {
  updateUserBudgetWithLock: updateUserBudgetWithLock as jest.MockedFunction<typeof updateUserBudgetWithLock>
};
const mockRateLimiter = rateLimiter as jest.Mocked<typeof rateLimiter>;

// Mock service references
const mockCronAuthService = CronAuthService as jest.Mocked<typeof CronAuthService>;
const mockCronUserProcessingService = CronUserProcessingService as jest.Mocked<typeof CronUserProcessingService>;
const mockCronSecFilingService = CronSecFilingService as jest.Mocked<typeof CronSecFilingService>;
const mockCronFilingProcessor = CronFilingProcessor as jest.Mocked<typeof CronFilingProcessor>;


// Mock CronJobMonitor
const mockMonitor = {
  recordMetric: jest.fn(),
  updateMetrics: jest.fn(),
  complete: jest.fn()
};

describe('Comprehensive Cron Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Set up required environment variables (with proper lengths for security validation)
    process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
    process.env.CRON_SIGNATURE_SECRET = process.env.TEST_CRON_SIGNATURE_SECRET || 'test-signature-secret-1234567890123456789012';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.NODE_ENV = 'test';
    
    // Setup default mock implementations
    (CronJobMonitor.create as jest.Mock).mockResolvedValue(mockMonitor);
    mockMonitor.complete.mockResolvedValue({
      executionId: 'test-execution-123',
      duration: 5000
    });
    mockMonitor.recordMetric.mockResolvedValue(undefined);
    mockMonitor.updateMetrics.mockResolvedValue(undefined);
    
    // Setup default rate limiter
    mockRateLimiter.checkLimit.mockResolvedValue({
      allowed: true,
      remaining: 100,
      resetTime: Date.now() + 60000
    });

    // Setup default market hours context
    mockMarketHours.getMarketHoursContext.mockReturnValue({
      isMarketHours: true,
      isMarketDay: true,
      isHoliday: false,
      currentTime: new Date().toISOString()
    });

    // Setup default user processing statuses - matching the actual return structure
    const mockUserProcessingStatuses = [
      {
        userId: 'user1',
        tier: 'FREE',
        lastProcessedAt: null,
        eligibility: {
          isEligible: true,
          nextEligibleTime: null,
          frequency: 120,
          reason: 'Test user'
        },
        priority: 1,
        budgetStatus: {
          monthlyBudget: 2.0,
          budgetUsed: 0,
          budgetRemaining: 2.0,
          budgetUtilization: 0
        }
      }
    ];
    mockMarketHours.getUserProcessingStatuses.mockReturnValue(mockUserProcessingStatuses);
    mockMarketHours.getEligibleUsers.mockReturnValue([
      {
        tier: 'FREE',
        userId: 'user1'
      }
    ]);

    // Setup default ticker monitoring with more comprehensive responses
    mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([
      { symbol: 'AAPL', cik: '320193' }
    ]);
    mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);
    mockTickerMonitoring.validateUserTickers.mockResolvedValue([
      { symbol: 'AAPL', valid: true, cik: '320193' }
    ]);
    mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue(undefined);
    mockTickerMonitoring.getUnprocessedFilingsForTicker.mockResolvedValue([]);
    mockTickerMonitoring.markFilingAsProcessedByAccession.mockResolvedValue(undefined);
    
    // Setup default prisma responses with realistic user data
    const mockUsers = [
      {
        id: 'user1',
        email: 'test@example.com',
        subscriptionTier: 'FREE',
        lastCronProcessed: null,
        processingBudget: 2.0,
        budgetUsed: 0,
        tickers: [
          {
            id: 'ticker1',
            symbol: 'AAPL',
            companyName: 'Apple Inc.'
          }
        ]
      }
    ];
    
    mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
    mockPrismaInstance.user.findUnique.mockResolvedValue(mockUsers[0]);
    mockPrismaInstance.user.findFirst.mockResolvedValue(mockUsers[0]);
    mockPrismaInstance.user.updateMany.mockResolvedValue({ count: 1 });
    
    // Mock Prisma transaction with comprehensive mock
    const mockTransactionUser = {
      findUnique: jest.fn().mockResolvedValue({
        budgetUsed: 0,
        subscriptionTier: 'FREE',
        budgetResetAt: new Date()
      }),
      update: jest.fn().mockResolvedValue({
        id: 'user1',
        budgetUsed: 0.5
      })
    };
    
    const mockTransactionSummary = {
      create: jest.fn().mockResolvedValue({ id: 'summary-123' }),
      update: jest.fn().mockResolvedValue({ id: 'summary-123' })
    };
    
    const mockTransactionRssFiling = {
      upsert: jest.fn().mockResolvedValue({ id: 'rss-filing-123' }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'rss-filing-123' })
    };

    const mockTransactionTicker = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ticker-123',
        symbol: 'AAPL',
        companyName: 'Apple Inc.'
      }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'ticker-123' })
    };
    
    mockPrismaInstance.$transaction.mockImplementation(async (callback) => {
      // Create a comprehensive mock transaction object with all needed properties
      const tx = {
        user: mockTransactionUser,
        ticker: mockTransactionTicker,
        summary: mockTransactionSummary,
        rssFilingCheck: mockTransactionRssFiling,
        secFiling: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'sec-filing-123' })
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-123' })
        }
      };
      return await callback(tx);
    });
    mockPrismaInstance.ticker.findFirst.mockResolvedValue({
      id: 'ticker-123',
      symbol: 'AAPL',
      companyName: 'Apple Inc.'
    });
    mockPrismaInstance.ticker.groupBy.mockResolvedValue([
      { 
        symbol: 'AAPL',
        _count: { id: 2 }
      },
      {
        symbol: 'TSLA', 
        _count: { id: 1 }
      }
    ]);
    mockPrismaInstance.summary.create.mockResolvedValue({ id: 'summary-123' });
    mockPrismaInstance.auditLog.create.mockResolvedValue({
      id: 'audit-123',
      userId: 'user-123',
      action: 'TEST',
      details: '{}',
      success: true,
      createdAt: new Date()
    });
    
    // Setup default summary service mocks
    mockSummaryService.generateAISummaryWithRetry = jest.fn().mockResolvedValue({
      summary: 'Test summary',
      cost: 0.02,
      keyPoints: [],
      tokensUsed: 800,
      inputTokens: 600,
      outputTokens: 200
    });
    
    // Setup default email service mocks
    mockEmailService.sendEmailSummary = jest.fn().mockResolvedValue({
      success: true,
      messageId: 'email-123'
    });
    
    // Setup default concurrency mocks
    mockConcurrency.updateUserBudgetWithLock.mockResolvedValue({
      previousBudget: 0,
      newBudget: 0.02,
      updated: true
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('1. Railway Configuration Tests', () => {
    describe('Environment Variable Validation', () => {
      it('should detect Railway environment correctly', async () => {
        // Test Railway environment detection
        process.env.RAILWAY_ENVIRONMENT = 'production';
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
        
        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          'x-forwarded-for': '10.0.0.1'
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        // Debug logging
        if (response.status !== 200) {
          console.log('Railway test failed. Status:', response.status);
          console.log('Error response:', JSON.stringify(result, null, 2));
          console.log('getPrismaClient mock calls:', (getPrismaClient as jest.Mock).mock.calls);
          console.log('mockPrismaInstance user methods available:', Object.keys(mockPrismaInstance.user));
        }

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(CronJobMonitor.create).toHaveBeenCalledWith('tier-aware-sec-monitor', 'MANUAL_TRIGGER');
      });

      it('should detect Vercel environment when Railway env is not set', async () => {
        // Test Vercel environment detection (default)
        delete process.env.RAILWAY_ENVIRONMENT;
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
        
        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(CronJobMonitor.create).toHaveBeenCalledWith('tier-aware-sec-monitor', 'VERCEL_CRON');
      });

      it('should validate CRON_SECRET environment variable', async () => {
        // Test missing CRON_SECRET
        delete process.env.CRON_SECRET;
        
        const request = createMockRequest({
          authorization: 'Bearer invalid-secret'
        });

        const response = await tierAwareRoute(request);

        expect(response.status).toBe(500);
        expect(mockMonitor.complete).toHaveBeenCalledWith('FAILED', 'Server configuration error');
      });

      it('should validate tier configuration environment variables', async () => {
        // Test custom tier configuration
        process.env.INSTITUTION_BATCH_SIZE = '15';
        process.env.ENTERPRISE_BATCH_SIZE = '12';
        process.env.PROFESSIONAL_BATCH_SIZE = '8';
        process.env.FREE_BATCH_SIZE = '5';
        process.env.INSTITUTION_COST_LIMIT = '5.00';
        process.env.ENTERPRISE_COST_LIMIT = '2.50';
        process.env.PROFESSIONAL_COST_LIMIT = '1.20';
        process.env.FREE_COST_LIMIT = '0.40';
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';

        // Mock eligible users to test tier processing
        mockMarketHours.getEligibleUsers.mockReturnValue([
          { tier: 'INSTITUTION', userId: 'user-1' },
          { tier: 'ENTERPRISE', userId: 'user-2' }
        ]);

        mockPrismaInstance.user.findMany.mockResolvedValue([
          {
            id: 'user-1',
            email: 'user1@test.com',
            subscriptionTier: 'INSTITUTION',
            lastCronProcessed: null,
            processingBudget: 5.00,
            budgetUsed: 0,
            tickers: [{ id: 'tick-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
          },
          {
            id: 'user-2',
            email: 'user2@test.com',
            subscriptionTier: 'ENTERPRISE',
            lastCronProcessed: null,
            processingBudget: 2.50,
            budgetUsed: 0,
            tickers: [{ id: 'tick-2', symbol: 'TSLA', companyName: 'Tesla Inc.' }]
          }
        ]);

        // Mock validation and processing
        mockTickerMonitoring.validateUserTickers.mockResolvedValue([
          { symbol: 'AAPL', cik: '320193', valid: true },
          { symbol: 'TSLA', cik: '1318605', valid: true }
        ]);
        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);
        mockConcurrency.updateUserBudgetWithLock.mockResolvedValue({
          previousBudget: 0,
          newBudget: 0.05,
          updated: true
        });

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(result.results.tierBreakdown).toEqual({
          'INSTITUTION': expect.any(Number),
          'ENTERPRISE': expect.any(Number)
        });
      });
    });

    describe('Authentication Security', () => {
      it('should use timing-safe string comparison for secrets', async () => {
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
        
        // Test with similar but incorrect secret (timing attack protection)
        const incorrectSecret = process.env.CRON_SECRET.slice(0, -1) + 'x'; // One character off
        const request = createMockRequest({
          authorization: `Bearer ${incorrectSecret}`
        });

        const response = await tierAwareRoute(request);

        expect(response.status).toBe(401);
        expect(mockMonitor.complete).toHaveBeenCalledWith('FAILED', 'Unauthorized access attempt');
      });

      it('should NOT allow localhost bypass in any environment', async () => {
        process.env.NODE_ENV = 'development';
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
        
        const request = createMockRequest({
          // No authorization header - should fail
          'x-forwarded-for': '127.0.0.1'
        });

        const response = await tierAwareRoute(request);

        // Should be unauthorized - no bypasses allowed
        expect(response.status).toBe(401);
        expect(mockMonitor.complete).toHaveBeenCalledWith('FAILED', 'Unauthorized access attempt');
      });

      it('should enforce authentication in production even for localhost', async () => {
        process.env.NODE_ENV = 'production';
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
        
        const request = createMockRequest({
          // No authorization header
          'x-forwarded-for': '127.0.0.1'
        });

        const response = await tierAwareRoute(request);

        expect(response.status).toBe(401);
      });
    });

    describe('IP Allowlist Configuration', () => {
      it('should respect IP allowlist when configured', async () => {
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
        process.env.CRON_ALLOWED_IPS = '10.0.0.1,192.168.1.100';
        
        // Test allowed IP
        const allowedRequest = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          'x-forwarded-for': '10.0.0.1'
        });

        const allowedResponse = await tierAwareRoute(allowedRequest);
        expect(allowedResponse.status).toBe(200);

        // Clear mocks for second test but re-setup essential mocks
        jest.clearAllMocks();
        setupDefaultMocks(); // This ensures all mocks are properly reset
        mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 100, resetTime: Date.now() + 60000 });

        // Test disallowed IP
        const disallowedRequest = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          'x-forwarded-for': '192.168.1.101'
        });

        const disallowedResponse = await tierAwareRoute(disallowedRequest);
        expect(disallowedResponse.status).toBe(403);
      });

      it('should allow all IPs when allowlist is empty', async () => {
        process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
        delete process.env.CRON_ALLOWED_IPS;
        
        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          'x-forwarded-for': '192.168.1.101'
        });

        const response = await tierAwareRoute(request);
        expect(response.status).toBe(200);
      });
    });
  });

  describe('2. Cron Endpoint Integration Tests', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
    });

    describe('Market Hours Context', () => {
      it('should process during market hours with full user eligibility', async () => {
        // Setup market hours context
        mockMarketHours.getMarketHoursContext.mockReturnValue({
          isMarketHours: true,
          isMarketDay: true,
          isHoliday: false,
          currentTime: new Date('2024-01-15T14:30:00Z').toISOString() // 2:30 PM UTC (market hours)
        });

        mockMarketHours.getUserProcessingStatuses.mockReturnValue([
          { 
            userId: 'user-1', 
            tier: 'PROFESSIONAL', 
            lastProcessedAt: null,
            eligibility: { isEligible: true, nextEligibleTime: null, frequency: 30 },
            priority: 2,
            budgetStatus: { monthlyBudget: 10.0, budgetUsed: 0, budgetRemaining: 10.0, budgetUtilization: 0 }
          }
        ]);

        mockMarketHours.getEligibleUsers.mockReturnValue([
          { tier: 'PROFESSIONAL', userId: 'user-1' }
        ]);

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(mockMonitor.recordMetric).toHaveBeenCalledWith('market_context', {
          isMarketHours: true,
          isMarketDay: true,
          isHoliday: false,
          currentTime: expect.any(String)
        });
      });

      it('should process during off-market hours with reduced frequency', async () => {
        // Setup off-market hours context
        mockMarketHours.getMarketHoursContext.mockReturnValue({
          isMarketHours: false,
          isMarketDay: true,
          isHoliday: false,
          currentTime: new Date('2024-01-15T22:30:00Z').toISOString() // 10:30 PM UTC (after hours)
        });

        mockMarketHours.getUserProcessingStatuses.mockReturnValue([
          { 
            userId: 'user-1', 
            tier: 'PROFESSIONAL', 
            lastProcessedAt: new Date(),
            eligibility: { isEligible: false, nextEligibleTime: new Date(), frequency: 120 },
            priority: 2,
            budgetStatus: { monthlyBudget: 10.0, budgetUsed: 0, budgetRemaining: 10.0, budgetUtilization: 0 }
          }
        ]);

        mockMarketHours.getEligibleUsers.mockReturnValue([]);

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.results.usersProcessed).toBe(0);
        expect(mockMonitor.recordMetric).toHaveBeenCalledWith('market_context', {
          isMarketHours: false,
          isMarketDay: true,
          isHoliday: false,
          currentTime: expect.any(String)
        });
      });

      it('should process during holidays/weekends (SEC filings can be published 24/7)', async () => {
        mockMarketHours.getMarketHoursContext.mockReturnValue({
          isMarketHours: false,
          isMarketDay: false,
          isHoliday: true,
          currentTime: new Date('2024-07-04T10:00:00Z').toISOString() // July 4th holiday
        });

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        // Should still process RSS monitoring (Phase 1) even during holidays
        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(mockTickerMonitoring.getActiveTickersForMonitoring).toHaveBeenCalled();
      });
    });

    describe('RSS Monitoring Phase', () => {
      it('should execute RSS monitoring regardless of market hours', async () => {
        const mockActiveTickers = [
          {
            id: 'ticker-1',
            cik: '1318605',
            symbol: 'TSLA',
            companyName: 'Tesla, Inc.',
            rssUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1318605&type=10&dateb=&count=100&output=atom',
            lastChecked: null,
            lastAccessionSeen: null,
            subscriberCount: 5
          }
        ];

        const mockNewFilings = [
          {
            accessionNumber: '0001628280-24-007006',
            filingType: '10-Q',
            filingDate: new Date('2024-01-15'),
            filingUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/0001628280-24-007006.htm',
            rssEntryDate: new Date('2024-01-15')
          }
        ];

        mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue(mockNewFilings);

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(mockTickerMonitoring.getActiveTickersForMonitoring).toHaveBeenCalled();
        expect(mockTickerMonitoring.checkTickerForNewFilings).toHaveBeenCalledWith(mockActiveTickers[0]);
        expect(mockMonitor.updateMetrics).toHaveBeenCalledWith({
          tickersChecked: 1,
          newFilingsFound: 1
        });
      });

      it('should handle RSS check failures gracefully', async () => {
        const mockActiveTickers = [
          {
            id: 'ticker-1',
            cik: '1318605',
            symbol: 'TSLA',
            companyName: 'Tesla, Inc.',
            rssUrl: 'https://www.sec.gov/rss/1318605',
            lastChecked: null,
            lastAccessionSeen: null,
            subscriberCount: 1
          }
        ];

        mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
        mockTickerMonitoring.checkTickerForNewFilings.mockRejectedValue(new Error('SEC server timeout'));

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        // Should continue processing despite RSS failures
        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(mockMonitor.updateMetrics).toHaveBeenCalledWith({ errorCount: 1 });
      });

      it('should respect concurrent RSS check limits', async () => {
        // Create 10 tickers to test batching (limit is 3 concurrent)
        const mockActiveTickers = Array.from({ length: 10 }, (_, i) => ({
          id: `ticker-${i}`,
          cik: `${1318605 + i}`,
          symbol: `TICK${i}`,
          companyName: `Company ${i}`,
          rssUrl: `https://www.sec.gov/rss/${1318605 + i}`,
          lastChecked: null,
          lastAccessionSeen: null,
          subscriberCount: 1
        }));

        mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(mockTickerMonitoring.checkTickerForNewFilings).toHaveBeenCalledTimes(10);
        expect(mockMonitor.updateMetrics).toHaveBeenCalledWith({
          tickersChecked: 10,
          newFilingsFound: 0
        });
      });
    });

    describe('User Processing Phase', () => {
      it('should process users by tier with correct batch sizes', async () => {
        const mockUsers = [
          {
            id: 'user-1',
            email: 'institution@test.com',
            subscriptionTier: 'INSTITUTION',
            lastCronProcessed: null,
            processingBudget: 2.50,
            budgetUsed: 0,
            tickers: [{ id: 'tick-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
          },
          {
            id: 'user-2',
            email: 'free@test.com',
            subscriptionTier: 'FREE',
            lastCronProcessed: null,
            processingBudget: 0.20,
            budgetUsed: 0,
            tickers: [{ id: 'tick-2', symbol: 'TSLA', companyName: 'Tesla Inc.' }]
          }
        ];

        mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
        
        mockMarketHours.getUserProcessingStatuses.mockReturnValue([
          { 
            userId: 'user-1', 
            tier: 'INSTITUTION', 
            lastProcessedAt: null,
            eligibility: { isEligible: true, nextEligibleTime: null, frequency: 5 },
            priority: 4,
            budgetStatus: { monthlyBudget: 100.0, budgetUsed: 0, budgetRemaining: 100.0, budgetUtilization: 0 }
          },
          { 
            userId: 'user-2', 
            tier: 'FREE', 
            lastProcessedAt: null,
            eligibility: { isEligible: true, nextEligibleTime: null, frequency: 120 },
            priority: 1,
            budgetStatus: { monthlyBudget: 2.0, budgetUsed: 0, budgetRemaining: 2.0, budgetUtilization: 0 }
          }
        ]);

        mockMarketHours.getEligibleUsers.mockReturnValue([
          { tier: 'INSTITUTION', userId: 'user-1' },
          { tier: 'FREE', userId: 'user-2' }
        ]);

        // Mock user ticker validation
        mockTickerMonitoring.validateUserTickers.mockResolvedValue([
          { symbol: 'AAPL', cik: '320193', valid: true }
        ]);
        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);

        mockPrismaInstance.user.findUnique.mockResolvedValue({
          budgetUsed: 0,
          subscriptionTier: 'INSTITUTION'
        });

        mockConcurrency.updateUserBudgetWithLock.mockResolvedValue({
          previousBudget: 0,
          newBudget: 0,
          updated: true
        });

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.results.tierBreakdown).toEqual({
          'INSTITUTION': expect.any(Number),
          'FREE': expect.any(Number)
        });
      });
    });
  });

  describe('3. Database Consistency Tests', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
    });

    describe('TickerMonitoring Record Validation', () => {
      it('should ensure all user subscriptions have corresponding TickerMonitoring records', async () => {
        const mockUsers = [
          {
            id: 'user-1',
            email: 'test@example.com',
            subscriptionTier: 'PROFESSIONAL',
            lastCronProcessed: null,
            processingBudget: 0.60,
            budgetUsed: 0,
            tickers: [
              { id: 'tick-1', symbol: 'AAPL', companyName: 'Apple Inc.' },
              { id: 'tick-2', symbol: 'TSLA', companyName: 'Tesla Inc.' }
            ]
          }
        ];

        // Mock CIK mappings exist
        mockPrismaInstance.cikMapping.findFirst
          .mockResolvedValueOnce({ ticker: 'AAPL', cik: '320193', companyName: 'Apple Inc.' })
          .mockResolvedValueOnce({ ticker: 'TSLA', cik: '1318605', companyName: 'Tesla, Inc.' });

        // Mock TickerMonitoring creation
        mockTickerMonitoring.getActiveTickersForMonitoring.mockImplementation(async () => {
          // This should trigger the TickerMonitoring record creation
          return [
            {
              id: 'tm-1',
              cik: '320193',
              symbol: 'AAPL',
              companyName: 'Apple Inc.',
              rssUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=320193&type=10&dateb=&count=100&output=atom',
              lastChecked: null,
              lastAccessionSeen: null,
              subscriberCount: 1
            },
            {
              id: 'tm-2',
              cik: '1318605',
              symbol: 'TSLA',
              companyName: 'Tesla, Inc.',
              rssUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1318605&type=10&dateb=&count=100&output=atom',
              lastChecked: null,
              lastAccessionSeen: null,
              subscriberCount: 1
            }
          ];
        });

        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]);

        mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
        mockMarketHours.getEligibleUsers.mockReturnValue([]);

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(mockTickerMonitoring.getActiveTickersForMonitoring).toHaveBeenCalled();
        // Verify both tickers are being monitored
        expect(mockTickerMonitoring.checkTickerForNewFilings).toHaveBeenCalledTimes(2);
      });

      it('should handle missing CIK mappings gracefully', async () => {
        const mockUsers = [
          {
            id: 'user-1',
            email: 'test@example.com',
            subscriptionTier: 'FREE',
            lastCronProcessed: null,
            processingBudget: 0.20,
            budgetUsed: 0,
            tickers: [
              { id: 'tick-1', symbol: 'INVALID', companyName: 'Invalid Company' }
            ]
          }
        ];

        // Mock missing CIK mapping
        mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
        mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
        mockMarketHours.getEligibleUsers.mockReturnValue([
          { tier: 'FREE', userId: 'user-1' }
        ]);

        // Mock validation returns invalid ticker
        mockTickerMonitoring.validateUserTickers.mockResolvedValue([
          { symbol: 'INVALID', cik: null, valid: false }
        ]);

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        // Should continue processing despite invalid tickers
        expect(result.success).toBe(true);
        expect(mockTickerMonitoring.validateUserTickers).toHaveBeenCalledWith('user-1', [
          { id: 'tick-1', symbol: 'INVALID', companyName: 'Invalid Company' }
        ]);
      });
    });

    describe('Filing Tracking Logic', () => {
      it('should prevent duplicate filing processing', async () => {
        const mockActiveTickers = [
          {
            id: 'ticker-1',
            cik: '1318605',
            symbol: 'TSLA',
            companyName: 'Tesla, Inc.',
            rssUrl: 'https://www.sec.gov/rss/1318605',
            lastChecked: null,
            lastAccessionSeen: null,
            subscriberCount: 1
          }
        ];

        // Mock the same filing appearing multiple times
        const duplicateFiling = {
          accessionNumber: '0001628280-24-007006',
          filingType: '10-Q',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://www.sec.gov/filing123',
          rssEntryDate: new Date('2024-01-15')
        };

        mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
        mockTickerMonitoring.checkTickerForNewFilings
          .mockResolvedValueOnce([duplicateFiling])  // First check finds filing
          .mockResolvedValueOnce([]);                // Second check finds no new filings (already processed)

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        // First execution
        const response1 = await tierAwareRoute(request);
        const result1 = await response1.json();

        expect(response1.status).toBe(200);
        expect(mockMonitor.updateMetrics).toHaveBeenCalledWith({
          tickersChecked: 1,
          newFilingsFound: 1
        });

        // Clear mocks for second execution
        jest.clearAllMocks();
        setupDefaultMocks();
        
        // Re-setup ticker monitoring mocks for second execution
        mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([]); // No new filings found

        // Second execution should not find the same filing again
        const response2 = await tierAwareRoute(request);
        const result2 = await response2.json();

        expect(response2.status).toBe(200);
        expect(mockMonitor.updateMetrics).toHaveBeenCalledWith({
          tickersChecked: 1,
          newFilingsFound: 0
        });
      });
    });

    describe('Budget Tracking and Limits', () => {
      it('should enforce tier-based cost limits', async () => {
        const mockUsers = [
          {
            id: 'user-1',
            email: 'free@test.com',
            subscriptionTier: 'FREE',
            lastCronProcessed: null,
            processingBudget: 0.20,
            budgetUsed: 0.18,  // Close to limit
            tickers: [{ id: 'tick-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
          }
        ];

        mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
        mockMarketHours.getEligibleUsers.mockReturnValue([
          { tier: 'FREE', userId: 'user-1' }
        ]);

        mockTickerMonitoring.validateUserTickers.mockResolvedValue([
          { symbol: 'AAPL', cik: '320193', valid: true }
        ]);

        // Mock a filing that would exceed budget
        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([
          {
            accessionNumber: '0001628280-24-007006',
            filingType: '10-K',  // Expensive filing type
            filingDate: new Date('2024-01-15'),
            filingUrl: 'https://www.sec.gov/filing123',
            rssEntryDate: new Date('2024-01-15')
          }
        ]);

        // Mock summary generation with high cost
        mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({
          summary: 'High cost summary',
          cost: 0.05,  // This would exceed the remaining budget (0.20 - 0.18 = 0.02)
          keyPoints: [],
          tokensUsed: 1000,
          inputTokens: 800,
          outputTokens: 200
        });

        mockPrismaInstance.user.findUnique.mockResolvedValue({
          budgetUsed: 0.18,
          subscriptionTier: 'FREE'
        });

        // Mock budget validation failure
        mockConcurrency.updateUserBudgetWithLock.mockRejectedValue(
          new Error('Budget limit exceeded')
        );

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.results.errorBreakdown.budgetExceeded).toBeGreaterThan(0);
      });

      it('should track cost validation failures', async () => {
        const mockUsers = [
          {
            id: 'user-1',
            email: 'test@test.com',
            subscriptionTier: 'PROFESSIONAL',
            lastCronProcessed: null,
            processingBudget: 0.60,
            budgetUsed: 0,
            tickers: [{ id: 'tick-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
          }
        ];

        mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
        mockMarketHours.getEligibleUsers.mockReturnValue([
          { tier: 'PROFESSIONAL', userId: 'user-1' }
        ]);

        mockTickerMonitoring.validateUserTickers.mockResolvedValue([
          { symbol: 'AAPL', cik: '320193', valid: true }
        ]);

        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([
          {
            accessionNumber: '0001628280-24-007006',
            filingType: '10-Q',
            filingDate: new Date('2024-01-15'),
            filingUrl: 'https://www.sec.gov/filing123',
            rssEntryDate: new Date('2024-01-15')
          }
        ]);

        // Also mock Phase 2: Unprocessed filings for cost validation test
        mockTickerMonitoring.getUnprocessedFilingsForTicker.mockResolvedValue([
          {
            id: 'filing-db-id-456',
            accessionNumber: '0001628280-24-007006',
            filingType: '10-Q',
            filingDate: new Date('2024-01-15'),
            filingUrl: 'https://www.sec.gov/filing123',
            rssEntryDate: new Date('2024-01-15'),
            title: 'Quarterly Report - Q4 2023'
          }
        ]);

        // Mock invalid cost (negative)
        mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({
          summary: 'Test summary',
          cost: -0.01,  // Invalid negative cost
          keyPoints: [],
          tokensUsed: 1000,
          inputTokens: 800,
          outputTokens: 200
        });

        mockPrismaInstance.user.findUnique.mockResolvedValue({
          budgetUsed: 0,
          subscriptionTier: 'PROFESSIONAL'
        });

        // Mock cost validation to fail for this test
        const { validateCostUpdate } = require('../../lib/db/cost-validation');
        (validateCostUpdate as jest.Mock).mockReturnValue({
          valid: false,
          error: 'Cost is negative'
        });

        // Override FilingTransactionManager for this test to return the negative cost
        const { FilingTransactionManager } = require('../../lib/db/transaction-manager');
        (FilingTransactionManager.processFilingWithTransaction as jest.Mock).mockResolvedValueOnce({
          success: true,
          data: { cost: -0.01 }, // This will trigger cost validation failure
          transactionId: 'test-transaction-id'
        });
        
        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.results.errorBreakdown.costValidationFailed).toBeGreaterThan(0);
        expect(mockPrismaInstance.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'BUDGET_UPDATE_FAILED',
            success: false
          })
        });
      });
    });
  });

  describe('4. End-to-End Workflow Tests', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
    });

    it('should complete full RSS → filing detection → summarization → email pipeline', async () => {
      // Setup complete workflow data
      const mockActiveTickers = [
        {
          id: 'ticker-1',
          cik: '1318605',
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.',
          rssUrl: 'https://www.sec.gov/rss/1318605',
          lastChecked: null,
          lastAccessionSeen: null,
          subscriberCount: 1
        }
      ];

      const mockNewFilings = [
        {
          accessionNumber: '0001628280-24-007006',
          filingType: '10-Q',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/0001628280-24-007006.htm',
          rssEntryDate: new Date('2024-01-15')
        }
      ];

      const mockUsers = [
        {
          id: 'user-1',
          email: 'investor@test.com',
          subscriptionTier: 'PROFESSIONAL',
          lastCronProcessed: null,
          processingBudget: 0.60,
          budgetUsed: 0,
          tickers: [{ id: 'tick-1', symbol: 'TSLA', companyName: 'Tesla Inc.' }]
        }
      ];

      const mockSummaryResult = {
        summary: 'Tesla reported Q4 2023 results with record delivery numbers...',
        keyPoints: ['Record deliveries', 'Strong margins', 'Cybertruck production ramp'],
        cost: 0.03,
        tokensUsed: 1200,
        inputTokens: 1000,
        outputTokens: 200,
        model: 'claude-3-sonnet-20240229'
      };

      // Setup all mocks for complete workflow
      mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue(mockActiveTickers);
      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue(mockNewFilings);
      
      mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
      mockMarketHours.getEligibleUsers.mockReturnValue([
        { tier: 'PROFESSIONAL', userId: 'user-1' }
      ]);

      mockTickerMonitoring.validateUserTickers.mockResolvedValue([
        { symbol: 'TSLA', cik: '1318605', valid: true }
      ]);

      // Mock getUnprocessedFilingsForTicker to return filings for processing in Phase 2
      mockTickerMonitoring.getUnprocessedFilingsForTicker.mockResolvedValue([
        {
          id: 'filing-db-id-123',
          accessionNumber: '0001628280-24-007006',
          filingType: '10-Q',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/0001628280-24-007006.htm',
          rssEntryDate: new Date('2024-01-15'),
          title: 'Quarterly Report - Q4 2023'
        }
      ]);

      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue(mockSummaryResult);
      
      mockPrismaInstance.ticker.findFirst.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrismaInstance.summary.create.mockResolvedValue({
        id: 'summary-1',
        summaryText: mockSummaryResult.summary
      });
      
      mockPrismaInstance.user.findUnique.mockResolvedValue({
        budgetUsed: 0,
        subscriptionTier: 'PROFESSIONAL'
      });

      mockConcurrency.updateUserBudgetWithLock.mockResolvedValue({
        previousBudget: 0,
        newBudget: 0.03,
        updated: true
      });

      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();
      
      mockEmailService.sendEmailSummary.mockResolvedValue({
        success: true,
        messageId: 'email-123'
      });

      // Override FilingTransactionManager to actually call the callback for this test
      const { FilingTransactionManager } = require('../../lib/db/transaction-manager');
      (FilingTransactionManager.processFilingWithTransaction as jest.Mock).mockImplementation(
        async (filingId: string, userId: string, callback: Function) => {
          // Call the actual callback to trigger summarization
          const result = await callback(mockPrismaInstance as any);
          return {
            success: true,
            data: result,
            transactionId: 'test-transaction-id'
          };
        }
      );

      const request = createMockRequest({
        authorization: `Bearer ${process.env.CRON_SECRET}`
      });

      const response = await tierAwareRoute(request);
      const result = await response.json();

      // Verify complete workflow execution
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      // Verify RSS monitoring phase
      expect(mockTickerMonitoring.getActiveTickersForMonitoring).toHaveBeenCalled();
      expect(mockTickerMonitoring.checkTickerForNewFilings).toHaveBeenCalledWith(mockActiveTickers[0]);

      // Verify user processing phase
      expect(mockTickerMonitoring.validateUserTickers).toHaveBeenCalledWith('user-1', mockUsers[0].tickers);

      // Verify summarization phase
      expect(mockSummaryService.generateAISummaryWithRetry).toHaveBeenCalled();

      // Verify database storage
      expect(mockPrismaInstance.summary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          summaryText: mockSummaryResult.summary,
          cost: mockSummaryResult.cost
        })
      });

      // Verify email sending
      expect(mockEmailService.sendEmailSummary).toHaveBeenCalledWith(
        'investor@test.com',
        ['TSLA'],
        false
      );

      // Verify filing marked as processed
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalled();

      // Verify metrics
      expect(result.results.usersProcessed).toBe(1);
      expect(result.results.filingsProcessed).toBe(1);
      expect(result.results.totalCost).toBe(0.03);
    });

    it('should handle partial workflow failures with proper error tracking', async () => {
      // Setup workflow that fails at email stage
      const mockUsers = [
        {
          id: 'user-1',
          email: 'test@test.com',
          subscriptionTier: 'FREE',
          lastCronProcessed: null,
          processingBudget: 0.20,
          budgetUsed: 0,
          tickers: [{ id: 'tick-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
        }
      ];

      mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
      mockMarketHours.getEligibleUsers.mockReturnValue([
        { tier: 'FREE', userId: 'user-1' }
      ]);

      mockTickerMonitoring.validateUserTickers.mockResolvedValue([
        { symbol: 'AAPL', cik: '320193', valid: true }
      ]);

      mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([
        {
          accessionNumber: '0001628280-24-007006',
          filingType: '10-Q',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://www.sec.gov/filing123',
          rssEntryDate: new Date('2024-01-15')
        }
      ]);

      // Mock getUnprocessedFilingsForTicker to return filings for processing in Phase 2
      mockTickerMonitoring.getUnprocessedFilingsForTicker.mockResolvedValue([
        {
          id: 'filing-db-id-456',
          accessionNumber: '0001628280-24-007006',
          filingType: '10-Q',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://www.sec.gov/filing123',
          rssEntryDate: new Date('2024-01-15'),
          title: 'Quarterly Report - Q4 2023'
        }
      ]);

      mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({
        summary: 'Test summary',
        cost: 0.02,
        keyPoints: [],
        tokensUsed: 800,
        inputTokens: 600,
        outputTokens: 200
      });

      mockPrismaInstance.ticker.findFirst.mockResolvedValue({ id: 'db-ticker-1' });
      mockPrismaInstance.summary.create.mockResolvedValue({ id: 'summary-1' });
      mockPrismaInstance.user.findUnique.mockResolvedValue({
        budgetUsed: 0,
        subscriptionTier: 'FREE'
      });

      mockConcurrency.updateUserBudgetWithLock.mockResolvedValue({
        previousBudget: 0,
        newBudget: 0.02,
        updated: true
      });

      // Email fails
      mockEmailService.sendEmailSummary.mockResolvedValue({
        success: false,
        error: 'Email service temporarily unavailable'
      });

      mockTickerMonitoring.markFilingAsProcessed.mockResolvedValue();

      // Override FilingTransactionManager to actually call the callback for this test
      const { FilingTransactionManager } = require('../../lib/db/transaction-manager');
      (FilingTransactionManager.processFilingWithTransaction as jest.Mock).mockImplementation(
        async (filingId: string, userId: string, callback: Function) => {
          // Call the actual callback to trigger summarization
          const result = await callback(mockPrismaInstance as any);
          return {
            success: true,
            data: result,
            transactionId: 'test-transaction-id'
          };
        }
      );

      const request = createMockRequest({
        authorization: `Bearer ${process.env.CRON_SECRET}`
      });

      const response = await tierAwareRoute(request);
      const result = await response.json();

      // Should still be successful overall despite email failure
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results.filingsProcessed).toBe(1);
      
      // Filing should still be marked as processed to prevent retry
      expect(mockTickerMonitoring.markFilingAsProcessed).toHaveBeenCalled();
    });
  });

  describe('5. Regression Prevention Tests', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = process.env.TEST_CRON_SECRET || 'test-cron-secret-key-minimum-32-chars-long-for-security-validation';
    });

    describe('Authentication Regression Tests', () => {
      it('should maintain secure authentication in production', async () => {
        process.env.NODE_ENV = 'production';
        
        // Test various invalid authentication attempts
        const invalidAttempts = [
          { headers: {}, expectedStatus: 401 },
          { headers: { 'authorization': 'Bearer wrong-secret' }, expectedStatus: 401 },
          { headers: { 'authorization': 'Basic dGVzdDp0ZXN0' }, expectedStatus: 401 },
          { headers: { 'authorization': 'Bearer ' }, expectedStatus: 401 },
          { headers: { 'x-api-key': 'test-secret' }, expectedStatus: 401 }
        ];

        for (const attempt of invalidAttempts) {
          const request = createMockRequest(attempt.headers);
          const response = await tierAwareRoute(request);
          
          expect(response.status).toBe(attempt.expectedStatus);
        }
      });

      it('should enforce authentication in all environments', async () => {
        // Test development environment - should NOT bypass
        process.env.NODE_ENV = 'development';
        
        const devRequest = createMockRequest({
          'x-forwarded-for': '127.0.0.1'
          // No authorization header
        });

        const devResponse = await tierAwareRoute(devRequest);
        expect(devResponse.status).toBe(401);

        // Test production environment (clear mocks first)
        jest.clearAllMocks();
        setupDefaultMocks();
        process.env.NODE_ENV = 'production';

        const prodRequest = createMockRequest({
          'x-forwarded-for': '127.0.0.1'
          // No authorization header
        });

        const prodResponse = await tierAwareRoute(prodRequest);
        expect(prodResponse.status).toBe(401);
      });
    });

    describe('Middleware Security Tests', () => {
      it('should not be blocked by rate limiting for legitimate cron requests', async () => {
        // Test rate limiting allows cron requests
        mockRateLimiter.checkLimit.mockResolvedValue({
          allowed: true,
          remaining: 50,
          resetTime: Date.now() + 60000
        });

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          'x-forwarded-for': '10.0.0.1'
        });

        const response = await tierAwareRoute(request);
        expect(response.status).toBe(200);
        expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('cron-endpoint', '10.0.0.1');
      });

      it('should respect rate limiting when configured', async () => {
        mockRateLimiter.checkLimit.mockResolvedValue({
          allowed: false,
          remaining: 0,
          resetTime: Date.now() + 60000
        });

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          'x-forwarded-for': '10.0.0.1'
        });

        const response = await tierAwareRoute(request);
        expect(response.status).toBe(429);
        expect(mockMonitor.complete).toHaveBeenCalledWith('FAILED', 'Rate limit exceeded');
      });
    });

    describe('Database Concurrency Tests', () => {
      it('should handle concurrency conflicts gracefully', async () => {
        const mockUsers = [
          {
            id: 'user-1',
            email: 'test@test.com',
            subscriptionTier: 'PROFESSIONAL',
            lastCronProcessed: null,
            processingBudget: 0.60,
            budgetUsed: 0,
            tickers: [{ id: 'tick-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
          }
        ];

        mockPrismaInstance.user.findMany.mockResolvedValue(mockUsers);
        mockMarketHours.getEligibleUsers.mockReturnValue([
          { tier: 'PROFESSIONAL', userId: 'user-1' }
        ]);

        mockTickerMonitoring.validateUserTickers.mockResolvedValue([
          { symbol: 'AAPL', cik: '320193', valid: true }
        ]);

        mockTickerMonitoring.checkTickerForNewFilings.mockResolvedValue([
          {
            accessionNumber: '0001628280-24-007006',
            filingType: '10-Q',
            filingDate: new Date('2024-01-15'),
            filingUrl: 'https://www.sec.gov/filing123',
            rssEntryDate: new Date('2024-01-15')
          }
        ]);

        // Mock getUnprocessedFilingsForTicker to return filings for processing in Phase 2
        mockTickerMonitoring.getUnprocessedFilingsForTicker.mockResolvedValue([
          {
            id: 'filing-db-id-789',
            accessionNumber: '0001628280-24-007006',
            filingType: '10-Q',
            filingDate: new Date('2024-01-15'),
            filingUrl: 'https://www.sec.gov/filing123',
            rssEntryDate: new Date('2024-01-15'),
            title: 'Quarterly Report - Q4 2023'
          }
        ]);

        mockSummaryService.generateAISummaryWithRetry.mockResolvedValue({
          summary: 'Test summary',
          cost: 0.03,
          keyPoints: [],
          tokensUsed: 1000,
          inputTokens: 800,
          outputTokens: 200
        });

        mockPrismaInstance.user.findUnique.mockResolvedValue({
          budgetUsed: 0,
          subscriptionTier: 'PROFESSIONAL'
        });

        // Mock concurrency conflict
        const concurrencyError = new Error('P2034: Transaction failed due to a write conflict or a deadlock');
        concurrencyError.name = 'PrismaClientKnownRequestError';
        (concurrencyError as any).code = 'P2034';

        mockConcurrency.updateUserBudgetWithLock.mockRejectedValue(concurrencyError);

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.results.errorBreakdown.concurrencyConflicts).toBeGreaterThan(0);
      });
    });

    describe('Error Handling Regression Tests', () => {
      it('should not crash on unexpected errors', async () => {
        // Mock unexpected error in monitoring
        mockTickerMonitoring.getActiveTickersForMonitoring.mockRejectedValue(
          new Error('Unexpected database error')
        );

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(500);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Unexpected database error');
        expect(mockMonitor.complete).toHaveBeenCalledWith('FAILED', 'Unexpected database error');
      });

      it('should handle monitor initialization failures', async () => {
        (CronJobMonitor.create as jest.Mock).mockRejectedValue(
          new Error('Failed to initialize monitoring')
        );

        const request = createMockRequest({
          authorization: `Bearer ${process.env.CRON_SECRET}`
        });

        const response = await tierAwareRoute(request);
        const result = await response.json();

        expect(response.status).toBe(500);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to initialize monitoring');
      });
    });
  });

  // Helper functions
  function createMockRequest(headers: Record<string, string>): NextRequest {
    // Create a mock Headers object that works in the test environment
    const mockHeaders = {
      get: jest.fn((key: string) => headers[key.toLowerCase()] || null),
      has: jest.fn((key: string) => key.toLowerCase() in headers),
      set: jest.fn(),
      forEach: jest.fn(),
      entries: jest.fn(),
      keys: jest.fn(),
      values: jest.fn()
    };

    return {
      headers: mockHeaders
    } as NextRequest;
  }

  function setupDefaultMocks() {
    // Reset all mocks to default states
    (CronJobMonitor.create as jest.Mock).mockResolvedValue(mockMonitor);
    mockMonitor.complete.mockResolvedValue({
      executionId: 'test-execution-123',
      duration: 5000
    });
    mockMonitor.recordMetric.mockResolvedValue(undefined);
    mockMonitor.updateMetrics.mockResolvedValue(undefined);
    
    mockRateLimiter.checkLimit.mockResolvedValue({
      allowed: true,
      remaining: 100,
      resetTime: Date.now() + 60000
    });

    mockMarketHours.getMarketHoursContext.mockReturnValue({
      isMarketHours: true,
      isMarketDay: true,
      isHoliday: false,
      currentTime: new Date().toISOString()
    });

    mockMarketHours.getUserProcessingStatuses.mockReturnValue([]);
    mockMarketHours.getEligibleUsers.mockReturnValue([]);
    mockTickerMonitoring.getActiveTickersForMonitoring.mockResolvedValue([]);
    
    mockPrismaInstance.user.findMany.mockResolvedValue([]);
    mockPrismaInstance.auditLog.create.mockResolvedValue({
      id: 'audit-123',
      userId: 'user-123',
      action: 'TEST',
      details: '{}',
      success: true,
      createdAt: new Date()
    });
    
    // Setup service mocks
    mockCronAuthService.validateCronRequest.mockResolvedValue({ 
      isValid: true, 
      clientIP: '127.0.0.1' 
    });
    mockCronAuthService.detectPlatform.mockReturnValue('test');
    
    mockCronUserProcessingService.getEligibleUsersForProcessing.mockResolvedValue({
      allUsers: [],
      eligibleUsers: []
    });
    mockCronUserProcessingService.processEligibleUsers.mockResolvedValue({
      usersProcessed: 0,
      filingsProcessed: 0,
      emailsSent: 0,
      totalCostUSD: 0,
      errorBreakdown: {
        budgetExceeded: 0,
        costValidationFailed: 0,
        concurrencyConflicts: 0
      }
    });
    
    mockCronSecFilingService.runSecFilingMonitoring.mockResolvedValue({
      tickersChecked: 0,
      newFilingsFound: 0,
      errorCount: 0
    });
    
    mockCronFilingProcessor.processSingleFiling.mockResolvedValue({
      success: true,
      cost: 0.5
    });
    mockCronFilingProcessor.processUserWithDeduplicatedFilings.mockResolvedValue({
      success: true,
      cost: 0.5
    });
    mockCronFilingProcessor.processUserTierFilings.mockResolvedValue({
      success: true,
      cost: 0.5
    });
  }
});