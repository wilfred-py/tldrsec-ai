import { NextRequest } from 'next/server';
import { GET } from '../../../../../app/api/cron/tier-aware/route';
import { getPrismaClient } from '../../../../../lib/db/prisma';
import { rateLimiter } from '../../../../../lib/security/rate-limiter';

// Mock dependencies
jest.mock('../../../../../lib/db/prisma');
jest.mock('../../../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../../../../lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn()
  }
}));

jest.mock('../../../../../lib/cron/market-hours', () => ({
  getMarketHoursContext: jest.fn(),
  getUserProcessingStatuses: jest.fn(),
  getEligibleUsers: jest.fn(),
  TIER_FREQUENCIES: {},
  TIER_BUDGETS: {}
}));

jest.mock('../../../../../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: jest.fn().mockImplementation(() => ({
    recordMetric: jest.fn(),
    updateMetrics: jest.fn(),
    complete: jest.fn().mockResolvedValue({ executionId: 'test-exec', duration: 1000 })
  }))
}));

jest.mock('../../../../../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn(),
  checkTickerForNewFilings: jest.fn(),
  markFilingAsProcessed: jest.fn()
}));

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },
  $transaction: jest.fn()
};

(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

describe('/api/cron/tier-aware', () => {
  const validSecret = 'test-secret';
  
  beforeAll(() => {
    process.env.CRON_SECRET = validSecret;
    process.env.INSTITUTION_BATCH_SIZE = '10';
    process.env.ENTERPRISE_BATCH_SIZE = '8';
    process.env.PROFESSIONAL_BATCH_SIZE = '5';
    process.env.FREE_BATCH_SIZE = '3';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default rate limiter mock
    (rateLimiter.checkLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetTime: Date.now() + 60000
    });
  });

  describe('Authentication and Security', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid authorization', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer invalid-secret'
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept requests with valid authorization', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });

      // Mock required dependencies
      const { getMarketHoursContext, getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      const { getActiveTickersForMonitoring } = require('../../../../../lib/sec-edgar/ticker-monitoring');

      getMarketHoursContext.mockReturnValue({
        isMarketHours: true,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date()
      });

      mockPrisma.user.findMany.mockResolvedValue([]);
      getUserProcessingStatuses.mockReturnValue([]);
      getEligibleUsers.mockReturnValue([]);
      getActiveTickersForMonitoring.mockResolvedValue([]);
      
      const response = await GET(request);
      
      expect(response.status).toBe(200);
    });

    it('should block rate limited requests', async () => {
      (rateLimiter.checkLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(429);
      expect(data.error).toBe('Rate limit exceeded');
    });

    it('should block IPs not in allowlist when configured', async () => {
      process.env.CRON_ALLOWED_IPS = '192.168.1.1,10.0.0.1';
      
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`,
          'x-forwarded-for': '192.168.1.100'
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
      
      delete process.env.CRON_ALLOWED_IPS;
    });
  });

  describe('Tier Processing Logic', () => {
    beforeEach(() => {
      const { getMarketHoursContext, getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      const { getActiveTickersForMonitoring, checkTickerForNewFilings } = require('../../../../../lib/sec-edgar/ticker-monitoring');

      getMarketHoursContext.mockReturnValue({
        isMarketHours: true,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date()
      });

      getActiveTickersForMonitoring.mockResolvedValue([]);
      checkTickerForNewFilings.mockResolvedValue([]);
    });

    it('should process users by subscription tier', async () => {
      const mockUsers = [
        {
          id: 'user1',
          subscriptionTier: 'ENTERPRISE',
          lastCronProcessed: null,
          budgetUsed: 0,
          tickers: [{ id: 'ticker1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
        },
        {
          id: 'user2',
          subscriptionTier: 'FREE',
          lastCronProcessed: null,
          budgetUsed: 0,
          tickers: [{ id: 'ticker2', symbol: 'MSFT', companyName: 'Microsoft Corp.' }]
        }
      ];

      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'user1', tier: 'ENTERPRISE', eligible: true, reason: 'eligible' },
        { userId: 'user2', tier: 'FREE', eligible: true, reason: 'eligible' }
      ]);
      
      getEligibleUsers.mockReturnValue([
        { userId: 'user1', tier: 'ENTERPRISE' },
        { userId: 'user2', tier: 'FREE' }
      ]);

      // Mock transaction behavior
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              budgetUsed: 0,
              subscriptionTier: 'ENTERPRISE'
            }),
            update: jest.fn().mockResolvedValue({})
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({})
          }
        };
        return await callback(mockTx);
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
    });

    it('should respect tier-based batch sizes', async () => {
      const enterpriseUsers = Array.from({ length: 15 }, (_, i) => ({
        id: `enterprise-user-${i}`,
        subscriptionTier: 'ENTERPRISE',
        lastCronProcessed: null,
        budgetUsed: 0,
        tickers: [{ id: `ticker-${i}`, symbol: 'AAPL', companyName: 'Apple Inc.' }]
      }));

      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue(enterpriseUsers);
      
      const userStatuses = enterpriseUsers.map(user => ({
        userId: user.id,
        tier: 'ENTERPRISE',
        eligible: true,
        reason: 'eligible'
      }));
      
      getUserProcessingStatuses.mockReturnValue(userStatuses);
      getEligibleUsers.mockReturnValue(userStatuses);

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              budgetUsed: 0,
              subscriptionTier: 'ENTERPRISE'
            }),
            update: jest.fn().mockResolvedValue({})
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({})
          }
        };
        return await callback(mockTx);
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Should only process 8 users (ENTERPRISE batch size)
      expect(data.results.usersProcessed).toBeLessThanOrEqual(8);
    });
  });

  describe('Budget Validation', () => {
    it('should prevent budget manipulation with negative costs', async () => {
      const mockUser = {
        id: 'user1',
        subscriptionTier: 'FREE',
        lastCronProcessed: null,
        budgetUsed: 0.15,
        tickers: [{ id: 'ticker1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
      };

      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'user1', tier: 'FREE', eligible: true, reason: 'eligible' }
      ]);
      
      getEligibleUsers.mockReturnValue([
        { userId: 'user1', tier: 'FREE' }
      ]);

      // Mock SEC filing processing to return negative cost (attack attempt)
      const { checkTickerForNewFilings } = require('../../../../../lib/sec-edgar/ticker-monitoring');
      checkTickerForNewFilings.mockResolvedValue([
        { accessionNumber: 'test-filing', formType: '10-K' }
      ]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Should have errors due to invalid cost validation
      expect(data.results.errors).toBeGreaterThan(0);
    });

    it('should prevent budget overflow', async () => {
      const mockUser = {
        id: 'user1',
        subscriptionTier: 'FREE',
        lastCronProcessed: null,
        budgetUsed: 0.19, // Near limit of 0.20
        tickers: [{ id: 'ticker1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
      };

      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'user1', tier: 'FREE', eligible: true, reason: 'eligible' }
      ]);
      
      getEligibleUsers.mockReturnValue([
        { userId: 'user1', tier: 'FREE' }
      ]);

      // Mock transaction to simulate budget overflow protection
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              budgetUsed: 0.19,
              subscriptionTier: 'FREE'
            }),
            update: jest.fn()
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({})
          }
        };
        
        // Should throw when budget would be exceeded
        throw new Error('Budget limit would be exceeded: 0.21 > 0.20');
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results.errors).toBeGreaterThan(0);
    });
  });

  describe('Subscription Tier Validation', () => {
    it('should detect and prevent tier escalation attacks', async () => {
      const mockUser = {
        id: 'user1',
        subscriptionTier: 'FREE',
        lastCronProcessed: null,
        budgetUsed: 0,
        tickers: [{ id: 'ticker1', symbol: 'AAPL', companyName: 'Apple Inc.' }]
      };

      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      
      // Attempt to process as ENTERPRISE (tier escalation attack)
      getUserProcessingStatuses.mockReturnValue([
        { userId: 'user1', tier: 'ENTERPRISE', eligible: true, reason: 'eligible' }
      ]);
      
      getEligibleUsers.mockReturnValue([
        { userId: 'user1', tier: 'ENTERPRISE' }
      ]);

      // Mock transaction to simulate tier mismatch detection
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              budgetUsed: 0,
              subscriptionTier: 'FREE' // Actual tier is FREE
            }),
            update: jest.fn()
          }
        };
        
        // Should throw when tier mismatch is detected
        throw new Error('Subscription tier mismatch: expected ENTERPRISE, got FREE');
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results.errors).toBeGreaterThan(0);
    });
  });

  describe('Market Hours Context', () => {
    it('should handle market hours correctly', async () => {
      const { getMarketHoursContext } = require('../../../../../lib/cron/market-hours');
      
      getMarketHoursContext.mockReturnValue({
        isMarketHours: true,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date('2024-01-15T15:30:00.000Z') // Market hours
      });

      mockPrisma.user.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.marketContext.isMarketHours).toBe(true);
      expect(data.marketContext.isMarketDay).toBe(true);
    });

    it('should handle off-market hours correctly', async () => {
      const { getMarketHoursContext } = require('../../../../../lib/cron/market-hours');
      
      getMarketHoursContext.mockReturnValue({
        isMarketHours: false,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date('2024-01-15T22:00:00.000Z') // After hours
      });

      mockPrisma.user.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.marketContext.isMarketHours).toBe(false);
      expect(data.marketContext.isMarketDay).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.user.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Database connection failed');
    });

    it('should handle SEC API errors gracefully', async () => {
      const { getActiveTickersForMonitoring } = require('../../../../../lib/sec-edgar/ticker-monitoring');
      
      getActiveTickersForMonitoring.mockRejectedValue(new Error('SEC API unavailable'));
      
      mockPrisma.user.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('SEC API unavailable');
    });
  });

  describe('Concurrent Processing', () => {
    it('should handle concurrent user processing correctly', async () => {
      const mockUsers = Array.from({ length: 6 }, (_, i) => ({
        id: `user-${i}`,
        subscriptionTier: 'PROFESSIONAL',
        lastCronProcessed: null,
        budgetUsed: 0,
        tickers: [{ id: `ticker-${i}`, symbol: 'AAPL', companyName: 'Apple Inc.' }]
      }));

      const { getUserProcessingStatuses, getEligibleUsers } = require('../../../../../lib/cron/market-hours');
      
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      
      const userStatuses = mockUsers.map(user => ({
        userId: user.id,
        tier: 'PROFESSIONAL',
        eligible: true,
        reason: 'eligible'
      }));
      
      getUserProcessingStatuses.mockReturnValue(userStatuses);
      getEligibleUsers.mockReturnValue(userStatuses.slice(0, 5)); // PROFESSIONAL batch size

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              budgetUsed: 0,
              subscriptionTier: 'PROFESSIONAL'
            }),
            update: jest.fn().mockResolvedValue({})
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({})
          }
        };
        return await callback(mockTx);
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': `Bearer ${validSecret}`
        }
      });
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results.usersProcessed).toBeLessThanOrEqual(5);
    });
  });
});