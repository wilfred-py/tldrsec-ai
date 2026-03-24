/**
 * Debug test to see what's causing the 500 errors in cron tests
 */

import { NextRequest } from 'next/server';
import { GET as tierAwareRoute } from '../app/api/cron/route';

// Mock the Prisma client properly
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
      ])
    },
    ticker: {
      groupBy: jest.fn().mockResolvedValue([
        { symbol: 'AAPL', _count: { id: 2 } },
        { symbol: 'TSLA', _count: { id: 1 } }
      ])
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

// Mock all other dependencies
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

jest.mock('../lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 100,
      resetTime: Date.now() + 60000
    })
  }
}));

// Mock other required modules
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

describe('Debug Cron Route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should debug the cron route error', async () => {
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

    console.log('Starting debug test...');
    
    try {
      const response = await tierAwareRoute(mockRequest);
      const result = await response.json();
      
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(result, null, 2));
      
      if (response.status !== 200) {
        console.log('Test failed - investigating error...');
      }
    } catch (error) {
      console.log('Caught error during route execution:');
      console.log(error);
    }
  });
});