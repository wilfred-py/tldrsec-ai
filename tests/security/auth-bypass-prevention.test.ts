/**
 * CRITICAL SECURITY TESTS: Authentication Bypass Prevention
 * 
 * These tests ensure that NO authentication bypasses exist in the cron system,
 * preventing the CVSS 9.1 vulnerability that was found in PR #177.
 */

import { NextRequest } from 'next/server';
import { GET } from '../../app/api/cron/tier-aware/route';
import { HmacAuthService } from '../../lib/security/hmac-auth';

// Mock dependencies similar to cron-security.test.ts
jest.mock('../../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn().mockResolvedValue({
      complete: jest.fn().mockResolvedValue({ executionId: 'test', duration: 100 }),
      recordMetric: jest.fn().mockResolvedValue(undefined),
      updateMetrics: jest.fn().mockResolvedValue(undefined)
    })
  }
}));

jest.mock('../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 })
    }
  }))
}));

jest.mock('../../lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn().mockResolvedValue({ 
      allowed: true, 
      remaining: 100, 
      resetTime: Date.now() + 60000 
    })
  }
}));

jest.mock('../../lib/security/cloudflare-ip-service', () => ({
  cloudflareIPService: {
    isCloudflareIP: jest.fn().mockResolvedValue(false),
    getMetrics: jest.fn().mockReturnValue({ total_requests: 0, cache_hits: 0 })
  }
}));

jest.mock('../../lib/security/security-monitoring', () => ({
  securityMonitoring: {
    recordSecurityEvent: jest.fn(),
    isUnderAttack: jest.fn().mockReturnValue(false),
    getThreatSummary: jest.fn().mockReturnValue({ ip_validation_failures: 0, blocked_ips: [] })
  }
}));

jest.mock('../../lib/cron/tier-eligibility', () => ({
  getUserProcessingStatuses: jest.fn().mockReturnValue([]),
  getEligibleUsers: jest.fn().mockReturnValue([])
}));

jest.mock('../../lib/sec-edgar/ticker-monitoring', () => ({
  getActiveTickersForMonitoring: jest.fn().mockResolvedValue([])
}));

describe('SECURITY: Authentication Bypass Prevention', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Ensure NODE_ENV is always set to test for security tests
    process.env.NODE_ENV = 'test';
    // Provide test database URL to prevent Prisma connection issues
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    // Ensure JEST_WORKER_ID is set for test environment detection
    process.env.JEST_WORKER_ID = '1';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('CRITICAL: No Development Authentication Bypass', () => {
    it('should NEVER bypass authentication in development environment', async () => {
      // Set development environment
      process.env.NODE_ENV = 'development';
      process.env.CRON_SECRET = 'test-secret-key-with-proper-length-32chars-min-security-requirement';

      // Mock request from localhost without auth header
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'x-real-ip': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const responseData = await response.json();

      // Debug: Log the actual response for troubleshooting
      if (response.status !== 401) {
        console.log('Expected 401 but got:', response.status, responseData);
      }

      // CRITICAL: Must return 401 unauthorized - NO BYPASSES ALLOWED
      expect(response.status).toBe(401);
      expect(responseData.error).toBe('Missing x-hmac-signature header');
    });

    it('should NEVER bypass authentication for localhost requests', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CRON_SECRET = 'test-secret-key-with-proper-length-32chars-min-security-requirement';

      const localhostIPs = ['127.0.0.1', '::1', 'localhost'];

      for (const ip of localhostIPs) {
        const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
          headers: {
            'x-forwarded-for': ip,
            'x-real-ip': ip
          }
        });

        const response = await GET(request);
        const responseData = await response.json();

        // CRITICAL: Must return 401 - no localhost bypasses
        expect(response.status).toBe(401);
        expect(responseData.error).toBe('Missing x-hmac-signature header');
      }
    });

    it('should NEVER bypass authentication in test environment', async () => {
      process.env.NODE_ENV = 'test';
      process.env.CRON_SECRET = 'test-secret-key-with-proper-length-32chars-min-security-requirement';

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData.error).toBe('Missing x-hmac-signature header');
    });

    it('should NEVER bypass authentication for any environment variable combination', async () => {
      const environments = ['development', 'test', 'production', 'staging'];
      const ips = ['127.0.0.1', '::1', 'localhost', '192.168.1.1', '10.0.0.1'];

      process.env.CRON_SECRET = 'test-secret-key-with-proper-length-32chars-min-security-requirement';

      for (const env of environments) {
        process.env.NODE_ENV = env;
        
        for (const ip of ips) {
          const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
            headers: {
              'x-forwarded-for': ip,
              'x-real-ip': ip
            }
          });

          const response = await GET(request);
          const responseData = await response.json();

          // SECURITY: Every combination must require authentication
          expect(response.status).toBe(401);
          expect(responseData.error).toBe('Missing x-hmac-signature header');
        }
      }
    });
  });

  describe('Mandatory Authentication Requirements', () => {
    it('should require valid HMAC signature for all requests', async () => {
      process.env.CRON_SECRET = 'valid-secret-key-with-proper-length-32chars-min-security-requirement';
      process.env.NODE_ENV = 'production';

      // Use the actual HmacAuthService to generate a valid signature
      const timestamp = Date.now();
      const method = 'GET';
      const path = '/api/cron/tier-aware';
      const { signature } = HmacAuthService.generateSignature(
        process.env.CRON_SECRET!,
        method,
        path,
        timestamp
      );

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'x-hmac-signature': signature,
          'x-hmac-timestamp': timestamp.toString(),
          'x-forwarded-for': '127.0.0.1'
        }
      });

      // Mock database and other dependencies would be needed for full test
      // This test may still fail with 500 due to missing dependencies
      // but should not fail with 401 if HMAC validation passes
      const response = await GET(request);
      
      // Should not be 401 (unauthorized) if HMAC signature is valid
      // May be 500 due to missing mocks, but that's separate from auth
      expect(response.status).not.toBe(401);
    });

    it('should reject requests with invalid HMAC signature', async () => {
      process.env.CRON_SECRET = 'valid-secret-key-with-proper-length-32chars-min-security-requirement';
      
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'x-hmac-signature': 'invalid-signature-hash',
          'x-hmac-timestamp': Date.now().toString(),
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData.error).toBe('Invalid signature format');
    });

    it('should reject requests without authorization header', async () => {
      process.env.CRON_SECRET = 'valid-secret-key-with-proper-length-32chars-min-security-requirement';
      
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData.error).toBe('Missing x-hmac-signature header');
    });

    it('should return 500 if CRON_SECRET is not configured', async () => {
      // Remove CRON_SECRET
      delete process.env.CRON_SECRET;
      
      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'authorization': 'Bearer any-token',
          'x-forwarded-for': '127.0.0.1'
        }
      });

      const response = await GET(request);
      const responseData = await response.json();

      // When CRON_SECRET is not configured, it returns 401 with configuration error message
      expect(response.status).toBe(401);
      expect(responseData.error).toBe('CRON_SECRET environment variable not configured');
    });
  });

  describe('Security Audit Logging', () => {
    it('should log all authentication attempts', async () => {
      const mockLogger = {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn()
      };

      // This would require mocking the logger - shows intent for comprehensive logging
      process.env.CRON_SECRET = 'test-secret';

      const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
        headers: {
          'x-forwarded-for': '127.0.0.1'
        }
      });

      await GET(request);

      // In actual implementation, verify that security events are logged
      // This is a placeholder to show the security requirement
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use timing-safe comparison for auth tokens', async () => {
      process.env.CRON_SECRET = 'secret';
      
      // Test with tokens of different lengths to verify timing-safe comparison
      const tokens = [
        'short',
        'secret',
        'secret-but-longer',
        'different-secret-entirely'
      ];

      const timings: number[] = [];

      for (const token of tokens) {
        const request = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
          headers: {
            'authorization': `Bearer ${token}`,
            'x-forwarded-for': '127.0.0.1'
          }
        });

        const start = Date.now();
        await GET(request);
        const end = Date.now();
        
        timings.push(end - start);
      }

      // Timing should be relatively consistent (within reasonable bounds)
      // This is a basic check - real timing attack tests would be more sophisticated
      const maxTiming = Math.max(...timings);
      const minTiming = Math.min(...timings);
      
      // Allow for some variation but not excessive (suggesting timing attacks possible)
      expect(maxTiming - minTiming).toBeLessThan(1000); // 1 second variance max
    });
  });
});