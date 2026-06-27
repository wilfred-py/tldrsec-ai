/**
 * Debug single cron test to isolate the remaining errors
 */

import { NextRequest } from 'next/server';
import { GET as tierAwareRoute } from '../app/api/cron/route';

// Mock external dependencies more comprehensively
jest.mock('../lib/db/prisma', () => {
  const mockPrisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'user1',
          email: 'test@example.com',
          subscriptionTier: 'FREE',
          lastCronProcessed: null,
          processingBudget: 1.00,
          budgetUsed: 0.00,
          tickers: [
            { id: 'ticker1', symbol: 'AAPL', cik: '0000320193' }
          ]
        }
      ]),
      update: jest.fn()
    },
    ticker: {
      groupBy: jest.fn().mockResolvedValue([
        { symbol: 'AAPL', _count: { id: 2 } }
      ]),
      findFirst: jest.fn()
    },
    summary: {
      create: jest.fn()
    },
    tickerMonitoring: {
      findMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn()
    },
    rssFilingCheck: {
      findMany: jest.fn(),
      create: jest.fn()
    },
    auditLog: {
      create: jest.fn()
    },
    $transaction: jest.fn().mockImplementation(async (callback: Function) => {
      return await callback(mockPrisma);
    }),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined)
  };
  
  return {
    getPrismaClient: jest.fn().mockReturnValue(mockPrisma),
    prisma: mockPrisma
  };
});

// Mock all required dependencies
jest.mock('../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn().mockResolvedValue({
      recordMetric: jest.fn(),
      updateMetrics: jest.fn(),
      complete: jest.fn().mockResolvedValue({ executionId: 'test', duration: 1000 })
    })
  }
}));

jest.mock('../lib/cron/tier-eligibility', () => ({
  getUserProcessingStatuses: jest.fn().mockReturnValue([]),
  getEligibleUsers: jest.fn().mockReturnValue([])
}));

jest.mock('../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn().mockResolvedValue([]),
  checkTickerForNewFilings: jest.fn().mockResolvedValue([]),
  validateUserTickers: jest.fn().mockResolvedValue([]),
  getUnprocessedFilingsForTicker: jest.fn().mockResolvedValue([]),
  markFilingAsProcessedByAccession: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 100,
      resetTime: Date.now() + 60000
    })
  }
}));

jest.mock('../lib/logging', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }
}));

jest.mock('../lib/db/concurrency', () => ({
  updateUserBudgetWithLock: jest.fn().mockResolvedValue({
    previousBudget: 0,
    newBudget: 0.02,
    updated: true
  })
}));

jest.mock('../lib/db/cost-validation', () => ({
  validateCostUpdate: jest.fn().mockReturnValue({ valid: true })
}));

jest.mock('../lib/db/async-audit', () => ({
  createAsyncAuditLog: jest.fn()
}));

describe('Debug Single Cron Test', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    // Add Railway environment to test Railway detection
    process.env.RAILWAY_ENVIRONMENT = 'production';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should debug railway environment detection', async () => {
    const mockHeaders = {
      'authorization': 'Bearer test-secret',
      'x-forwarded-for': '10.0.0.1'
    };

    const mockRequest = {
      headers: {
        get: jest.fn((key: string) => mockHeaders[key.toLowerCase()] || null),
        has: jest.fn((key: string) => key.toLowerCase() in mockHeaders)
      }
    } as unknown as NextRequest;

    console.log('Testing Railway environment detection...');
    
    try {
      const response = await tierAwareRoute(mockRequest);
      const result = await response.json();
      
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(result, null, 2));
      
      if (response.status === 500) {
        console.log('Error occurred, analyzing...');
        console.log('Error message:', result.error);
      }
      
    } catch (error) {
      console.log('Caught error during route execution:');
      console.log(error);
    }
  });
});