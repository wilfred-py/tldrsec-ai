/**
 * Minimal test to isolate the .user property access error
 */

import { NextRequest } from 'next/server';
import { GET as tierAwareRoute } from '../app/api/cron/tier-aware/route';

// Mock all external dependencies
jest.mock('../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null)
    },
    $connect: jest.fn(),
    $disconnect: jest.fn()
  }))
}));

jest.mock('../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn().mockResolvedValue({
      recordMetric: jest.fn(),
      updateMetrics: jest.fn(),
      complete: jest.fn().mockResolvedValue({
        executionId: 'test-123',
        duration: 1000
      })
    })
  }
}));

jest.mock('../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn().mockResolvedValue([]),
  checkTickerForNewFilings: jest.fn().mockResolvedValue([]),
  validateUserTickers: jest.fn().mockResolvedValue([]),
  markFilingAsProcessed: jest.fn().mockResolvedValue(undefined),
  getUnprocessedFilingsForTicker: jest.fn().mockResolvedValue([]),
  markFilingAsProcessedByAccession: jest.fn().mockResolvedValue(undefined)
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

jest.mock('../lib/logging');
jest.mock('../lib/db/cost-validation', () => ({
  validateCostUpdate: jest.fn().mockReturnValue({ valid: true })
}));
jest.mock('../lib/db/transaction-manager', () => ({
  FilingTransactionManager: {
    processFilingWithTransaction: jest.fn().mockResolvedValue({
      success: true,
      data: { cost: 0 }
    })
  }
}));
jest.mock('../lib/db/concurrency', () => ({
  updateUserBudgetWithLock: jest.fn().mockResolvedValue({
    previousBudget: 0,
    newBudget: 0,
    updated: true
  })
}));
jest.mock('../lib/db/async-audit', () => ({
  createAsyncAuditLog: jest.fn().mockResolvedValue(undefined)
}));

describe('Minimal Cron Test - Isolate Error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
  });

  it('should make a basic authenticated request without error', async () => {
    const mockHeaders = {
      get: jest.fn((key: string) => {
        if (key === 'authorization') return 'Bearer test-secret';
        return null;
      })
    };

    const mockRequest = {
      headers: mockHeaders
    } as NextRequest;

    try {
      const response = await tierAwareRoute(mockRequest);
      const result = await response.json();
      
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(result, null, 2));
      
      // Test should not crash with .user error
      expect(response.status).not.toBe(500);
      
    } catch (error) {
      console.error('Error occurred:', error);
      throw error;
    }
  });
});