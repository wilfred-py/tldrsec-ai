/**
 * Security Test Suite for Cron Endpoints
 * Tests authentication, authorization, and input validation
 */

import { NextRequest } from 'next/server';
import { GET } from '../../app/api/cron/tier-aware/route';

// Mock dependencies
jest.mock('../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 })
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({})
    }
  }))
}));

jest.mock('../../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn().mockResolvedValue({
      complete: jest.fn().mockResolvedValue({ executionId: 'test', duration: 100 }),
      recordMetric: jest.fn().mockResolvedValue(undefined),
      updateMetrics: jest.fn().mockResolvedValue(undefined)
    })
  }
}));

jest.mock('../../lib/cron/market-hours', () => ({
  getMarketHoursContext: jest.fn().mockReturnValue({
    isMarketHours: false,
    isMarketDay: true,
    isHoliday: false,
    currentTime: new Date()
  }),
  getUserProcessingStatuses: jest.fn().mockReturnValue([]),
  getEligibleUsers: jest.fn().mockReturnValue([])
}));

jest.mock('../../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn().mockResolvedValue([]),
  checkTickerForNewFilings: jest.fn().mockResolvedValue([]),
  markFilingAsProcessed: jest.fn(),
  validateUserTickers: jest.fn().mockResolvedValue([])
}));

// Mock rate limiter properly to match the singleton export pattern
jest.mock('../../lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn().mockResolvedValue({ 
      allowed: true, 
      remaining: 100, 
      resetTime: Date.now() + 60000 
    })
  }
}));

jest.mock('../../services/filing/summaryGenerationService', () => ({
  generateAISummaryWithRetry: jest.fn().mockResolvedValue({
    summary: 'Test summary',
    cost: 0.02,
    keyPoints: [],
    tokensUsed: 800,
    inputTokens: 600,
    outputTokens: 200
  })
}));

jest.mock('../../services/filing/sendEmailSummary', () => ({
  sendEmailSummary: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'email-123'
  })
}));

jest.mock('../../lib/db/concurrency', () => ({
  updateUserBudgetWithLock: jest.fn().mockResolvedValue({
    previousBudget: 0,
    newBudget: 0.02,
    updated: true
  }),
  isConcurrencyError: jest.fn().mockReturnValue(false)
}));

describe('Cron Endpoint Security Tests', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = 'test-secret-key';
    process.env.CRON_SIGNATURE_SECRET = 'test-signature-secret';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.NODE_ENV = 'test';
    // Ensure JEST_WORKER_ID is set for test environment detection
    process.env.JEST_WORKER_ID = '1';
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Authentication Security', () => {
    test('CRITICAL: Must reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      // Debug: Log the response for troubleshooting
      if (response.status !== 401) {
        console.log('Expected 401 but got:', response.status, 'Error:', data.error);
      }

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    test('CRITICAL: Must reject requests with invalid authorization token', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer invalid-token',
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    test('CRITICAL: Must reject requests with malformed authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': 'invalid-format-token',
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    test('CRITICAL: Must reject requests when CRON_SECRET is missing', async () => {
      delete process.env.CRON_SECRET;
      
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer any-token',
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Server configuration error');
    });

    test('SECURITY: Must accept valid authorization token', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-secret-key',
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('SECURITY: Development localhost bypass must NOT exist', async () => {
      process.env.NODE_ENV = 'development';
      
      // Test with localhost IP
      const localhostRequest = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '127.0.0.1'
          // NO authorization header
        }
      });

      const response = await GET(localhostRequest);
      expect(response.status).toBe(401); // Must be unauthorized, no bypass

      // Test with development NODE_ENV but no auth
      const devRequest = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.1'
          // NO authorization header
        }
      });

      const devResponse = await GET(devRequest);
      expect(devResponse.status).toBe(401); // Must be unauthorized, no bypass
    });
  });

  describe('Timing Attack Prevention', () => {
    test('SECURITY: Must use timing-safe comparison for authorization', async () => {
      const validToken = 'Bearer test-secret-key';
      const invalidToken = 'Bearer test-secret-keyX'; // One character different
      
      // Both requests should take similar time and return same error
      const request1 = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': validToken,
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const request2 = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': invalidToken,
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const start1 = Date.now();
      const response1 = await GET(request1);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      const response2 = await GET(request2);
      const time2 = Date.now() - start2;

      // Valid token should succeed, invalid should fail
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(401);
      
      // Both should handle authorization check quickly (timing-safe)
      expect(Math.abs(time1 - time2)).toBeLessThan(100); // Within 100ms difference
    });
  });

  describe('Rate Limiting Security', () => {
    test('SECURITY: Must enforce rate limiting', async () => {
      // Mock rate limiter to deny requests
      const { rateLimiter } = require('../../lib/security/rate-limiter');
      rateLimiter.checkLimit.mockResolvedValueOnce({ 
        allowed: false, 
        remaining: 0, 
        resetTime: Date.now() + 60000 
      });

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-secret-key',
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Rate limit exceeded');
    });
  });

  describe('IP Allowlist Security', () => {
    test('SECURITY: Must enforce IP allowlist when configured', async () => {
      process.env.CRON_ALLOWED_IPS = '192.168.1.100,10.0.0.1';

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-secret-key',
          'x-forwarded-for': '127.0.0.1' // Not in allowlist
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    test('SECURITY: Must allow IPs in allowlist', async () => {
      process.env.CRON_ALLOWED_IPS = '192.168.1.100,127.0.0.1';

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-secret-key',
          'x-forwarded-for': '127.0.0.1' // In allowlist
        }
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Security Headers', () => {
    test('SECURITY: Must handle various IP header formats', async () => {
      const tests = [
        { header: 'x-forwarded-for', value: '127.0.0.1' },
        { header: 'x-real-ip', value: '192.168.1.1' },
        { header: 'cf-connecting-ip', value: '10.0.0.1' }
      ];

      for (const test of tests) {
        const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-secret-key',
            [test.header]: test.value
          }
        });

        const response = await GET(request);
        expect(response.status).toBe(200);
      }
    });
  });
});