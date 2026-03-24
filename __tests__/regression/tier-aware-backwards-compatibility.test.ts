/**
 * Regression Tests for Tier-Aware System Backwards Compatibility
 * 
 * Ensures that new tier-aware features don't break existing functionality
 * and that system maintains backwards compatibility with previous data structures.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
jest.mock('../../../lib/db/prisma', () => {
  const mockPrismaInstance = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    auditLog: {
      create: jest.fn()
    },
    $transaction: jest.fn()
  };
  
  return {
    getPrismaClient: jest.fn(() => mockPrismaInstance)
  };
});

jest.mock('../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../../lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetTime: Date.now() + 60000
    })
  }
}));

jest.mock('../../../lib/cron/tier-eligibility', () => ({
  getUserProcessingStatuses: jest.fn(),
  getEligibleUsers: jest.fn()
}));

jest.mock('../../../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn().mockResolvedValue({
      recordMetric: jest.fn(),
      updateMetrics: jest.fn(),
      complete: jest.fn().mockResolvedValue({ executionId: 'test-exec', duration: 1000 })
    })
  }
}));

jest.mock('../../../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn(),
  checkTickerForNewFilings: jest.fn(),
  markFilingAsProcessed: jest.fn()
}));

// Import after mocking
import { GET } from '../../../app/api/cron/route';
import { getPrismaClient } from '../../../lib/db/prisma';

const mockPrisma = (getPrismaClient as jest.Mock)();

describe('Tier-Aware Backwards Compatibility Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    process.env.CRON_SECRET = 'test-secret';
    
    // Setup default transaction mock
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      const mockTx = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'test-user',
            budgetUsed: 0,
            subscriptionTier: 'FREE',
            budgetResetAt: new Date()
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 })
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-1' })
        }
      };
      
      return await callback(mockTx);
    });
    
    // Setup tier eligibility mocks (24/7 processing - no market hours)
    const { getUserProcessingStatuses, getEligibleUsers } = require('../../../lib/cron/tier-eligibility');
    const { getActiveTickersForMonitoring, checkTickerForNewFilings } = require('../../../lib/sec-edgar/ticker-monitoring');

    getUserProcessingStatuses.mockReturnValue([]);
    getEligibleUsers.mockReturnValue([]);
    getActiveTickersForMonitoring.mockResolvedValue([]);
    checkTickerForNewFilings.mockResolvedValue([]);
  });

  describe('Legacy User Data Compatibility', () => {
    it('should handle users without subscription tier (legacy data)', async () => {
      const legacyUsers = [
        {
          id: 'legacy-user-1',
          subscriptionTier: null, // Legacy user without tier
          lastCronProcessed: null,
          processingBudget: null,
          budgetUsed: null,
          budgetResetAt: null,
          tickers: []
        },
        {
          id: 'legacy-user-2',
          // subscriptionTier undefined (pre-tier system)
          lastCronProcessed: new Date('2023-12-01'),
          processingBudget: 0,
          budgetUsed: 0,
          budgetResetAt: null,
          tickers: []
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(legacyUsers);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      
      // System should handle legacy users gracefully
      expect(result.results.usersProcessed).toBe(0);
      expect(result.results.errors).toBe(0);
    });

    it('should handle users with old budget field names', async () => {
      const usersWithOldFields = [
        {
          id: 'old-field-user',
          subscriptionTier: 'PROFESSIONAL',
          lastCronProcessed: null,
          processingBudget: 0.60,
          budgetUsed: 0.30,
          budgetResetAt: new Date(),
          // Old field names that might exist
          monthlyBudget: 0.60, // Legacy field
          monthlyBudgetUsed: 0.30, // Legacy field
          tickers: []
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(usersWithOldFields);
      
      const { getUserProcessingStatuses } = require('../../../lib/cron/market-hours');
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'old-field-user', tier: 'PROFESSIONAL', eligible: false, reason: 'budget_exceeded' }
      ]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
    });

    it('should handle migration from old tier enum values', async () => {
      const usersWithOldTiers = [
        {
          id: 'old-tier-user-1',
          subscriptionTier: 'BASIC', // Old tier name
          lastCronProcessed: null,
          processingBudget: 0.20,
          budgetUsed: 0,
          budgetResetAt: new Date(),
          tickers: []
        },
        {
          id: 'old-tier-user-2',
          subscriptionTier: 'PREMIUM', // Another old tier name
          lastCronProcessed: null,
          processingBudget: 1.25,
          budgetUsed: 0,
          budgetResetAt: new Date(),
          tickers: []
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(usersWithOldTiers);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // System should handle unknown tiers gracefully without crashing
    });
  });

  describe('Legacy Processing Behavior', () => {
    it('should maintain processing for users who had different processing frequency', async () => {
      const usersWithLegacyProcessing = [
        {
          id: 'legacy-freq-user',
          subscriptionTier: 'FREE',
          lastCronProcessed: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          processingBudget: 0.20,
          budgetUsed: 0,
          budgetResetAt: new Date(),
          // Legacy processing fields
          dailyProcessingCount: 5,
          lastDailyReset: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
          tickers: [{ id: 'ticker-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(usersWithLegacyProcessing);
      
      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../lib/cron/market-hours');
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'legacy-freq-user', tier: 'FREE', eligible: true, reason: 'eligible' }
      ]);
      getEligibleUsers.mockReturnValue([
        { userId: 'legacy-freq-user', tier: 'FREE' }
      ]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
    });

    it('should handle users without budget reset dates', async () => {
      const usersWithoutResetDates = [
        {
          id: 'no-reset-date-user',
          subscriptionTier: 'ENTERPRISE',
          lastCronProcessed: new Date(),
          processingBudget: 1.25,
          budgetUsed: 0.50,
          budgetResetAt: null, // No reset date
          tickers: []
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(usersWithoutResetDates);
      
      const { getUserProcessingStatuses } = require('../../../lib/cron/market-hours');
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'no-reset-date-user', tier: 'ENTERPRISE', eligible: false, reason: 'no_reset_date' }
      ]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      // Should not crash on null reset dates
    });
  });

  describe('Environment Variable Backwards Compatibility', () => {
    it('should use default values when new tier environment variables are missing', async () => {
      // Remove tier-specific env vars to simulate old environment
      delete process.env.INSTITUTION_BATCH_SIZE;
      delete process.env.ENTERPRISE_BATCH_SIZE;
      delete process.env.PROFESSIONAL_BATCH_SIZE;
      delete process.env.FREE_BATCH_SIZE;
      
      delete process.env.INSTITUTION_COST_LIMIT;
      delete process.env.ENTERPRISE_COST_LIMIT;
      delete process.env.PROFESSIONAL_COST_LIMIT;
      delete process.env.FREE_COST_LIMIT;

      mockPrisma.user.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // Should use hard-coded defaults
    });

    it('should handle missing new security environment variables', async () => {
      delete process.env.CRON_ALLOWED_IPS;
      delete process.env.MAX_COST_PER_OPERATION;

      mockPrisma.user.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      // Should work without IP restrictions and with default cost limits
    });
  });

  describe('API Response Format Compatibility', () => {
    it('should maintain response format for monitoring systems', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      
      // Required fields for backwards compatibility
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executionId');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('marketContext');
      expect(result).toHaveProperty('results');
      
      // Market context format
      expect(result.marketContext).toHaveProperty('isMarketHours');
      expect(result.marketContext).toHaveProperty('isMarketDay');
      
      // Results format
      expect(result.results).toHaveProperty('usersProcessed');
      expect(result.results).toHaveProperty('filingsProcessed');
      expect(result.results).toHaveProperty('totalCost');
      expect(result.results).toHaveProperty('tierBreakdown');
      expect(result.results).toHaveProperty('errors');
    });

    it('should include new error breakdown while maintaining old error count', async () => {
      // Setup a scenario with errors
      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'error-user',
          subscriptionTier: 'FREE',
          lastCronProcessed: null,
          processingBudget: 0.20,
          budgetUsed: 0,
          budgetResetAt: new Date(),
          tickers: [{ id: 'ticker-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
        }
      ]);
      
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'error-user', tier: 'FREE', eligible: true, reason: 'eligible' }
      ]);
      getEligibleUsers.mockReturnValue([
        { userId: 'error-user', tier: 'FREE' }
      ]);

      // Mock a processing error
      mockPrisma.$transaction.mockRejectedValue(new Error('Processing failed'));

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      
      // Old error field (backwards compatibility)
      expect(result.results).toHaveProperty('errors');
      expect(typeof result.results.errors).toBe('number');
      
      // New error breakdown (enhanced functionality)
      expect(result.results).toHaveProperty('errorBreakdown');
      expect(result.results.errorBreakdown).toHaveProperty('concurrencyConflicts');
      expect(result.results.errorBreakdown).toHaveProperty('budgetExceeded');
      expect(result.results.errorBreakdown).toHaveProperty('costValidationFailed');
      expect(result.results.errorBreakdown).toHaveProperty('tierMismatch');
      expect(result.results.errorBreakdown).toHaveProperty('unknownErrors');
    });
  });

  describe('Database Schema Evolution', () => {
    it('should handle missing new database fields gracefully', async () => {
      // Simulate old database schema with missing fields
      const usersWithMissingFields = [
        {
          id: 'old-schema-user',
          email: 'user@example.com',
          name: 'Old Schema User',
          // Missing new tier-aware fields
          subscriptionTier: undefined,
          lastCronProcessed: undefined,
          processingBudget: undefined,
          budgetUsed: undefined,
          budgetResetAt: undefined,
          tickers: []
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(usersWithMissingFields);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // Should not crash on missing fields
    });

    it('should handle old audit log format', async () => {
      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'audit-user',
          subscriptionTier: 'PROFESSIONAL',
          lastCronProcessed: null,
          processingBudget: 0.60,
          budgetUsed: 0,
          budgetResetAt: new Date(),
          tickers: [{ id: 'ticker-1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
        }
      ]);
      
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'audit-user', tier: 'PROFESSIONAL', eligible: true, reason: 'eligible' }
      ]);
      getEligibleUsers.mockReturnValue([
        { userId: 'audit-user', tier: 'PROFESSIONAL' }
      ]);

      // Mock audit log creation that might fail due to schema changes
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'audit-user',
              budgetUsed: 0,
              subscriptionTier: 'PROFESSIONAL',
              budgetResetAt: new Date()
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 })
          },
          auditLog: {
            create: jest.fn().mockRejectedValue(new Error('Unknown column in audit log'))
          }
        };
        
        return await callback(mockTx);
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      // Should continue processing even if audit logging fails
    });
  });

  describe('Feature Flag Compatibility', () => {
    it('should work without tier-aware features enabled', async () => {
      // Simulate scenario where tier-aware features are disabled
      const users = [
        {
          id: 'regular-user',
          subscriptionTier: 'FREE',
          lastCronProcessed: null,
          processingBudget: 0,
          budgetUsed: 0,
          budgetResetAt: new Date(),
          tickers: []
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(users);
      
      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../lib/cron/market-hours');
      // Return empty eligible users (simulating feature being disabled)
      getUserProcessingStatuses.mockReturnValue([]);
      getEligibleUsers.mockReturnValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results.usersProcessed).toBe(0);
    });
  });

  describe('Monitoring and Alerting Compatibility', () => {
    it('should maintain monitoring metrics format for existing dashboards', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer test-secret'
        }
      });

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      
      // Essential monitoring fields that external systems depend on
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.executionId).toBe('string');
      expect(typeof result.duration).toBe('number');
      
      // Performance metrics
      expect(typeof result.results.usersProcessed).toBe('number');
      expect(typeof result.results.filingsProcessed).toBe('number');
      expect(typeof result.results.totalCost).toBe('number');
      expect(typeof result.results.errors).toBe('number');
    });
  });
});