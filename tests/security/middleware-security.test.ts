/**
 * Comprehensive security tests for middleware protection
 * Tests all security controls and attack vectors
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { 
  MiddlewareSecurity, 
  IPValidator, 
  SignatureValidator, 
  APIKeyValidator,
  SecurityAuditor 
} from '../../lib/security/middleware-security';

// Mock the dependencies
jest.mock('../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn()
  }
}));

describe('Middleware Security System', () => {
  let mockRateLimiter: any;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock rate limiter
    mockRateLimiter = require('../../lib/security/rate-limiter').rateLimiter;
    mockRateLimiter.checkLimit.mockResolvedValue({
      allowed: true,
      remaining: 50,
      resetTime: Date.now() + 60000
    });

    // Set test environment variables
    process.env.CRON_ALLOWED_IPS = '203.0.113.1,198.51.100.0/24';
    process.env.CRON_SECRET = 'test-secret-key';
    process.env.CRON_SIGNATURE_SECRET = 'test-signature-secret';
    process.env.CRON_API_KEYS = 'tldr_test123456789012345678901234,tldr_test987654321098765432109876';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.CRON_ALLOWED_IPS;
    delete process.env.CRON_SECRET;
    delete process.env.CRON_SIGNATURE_SECRET;
    delete process.env.CRON_API_KEYS;
  });

  describe('IP Validation', () => {
    it('should allow requests from Railway platform IPs', () => {
      expect(IPValidator.isAllowed('172.16.10.5')).toBe(true);
      expect(IPValidator.isAllowed('10.0.0.100')).toBe(true);
      expect(IPValidator.isAllowed('192.168.1.50')).toBe(true);
    });

    it('should allow requests from Vercel platform IPs', () => {
      expect(IPValidator.isAllowed('76.76.19.100')).toBe(true);
      expect(IPValidator.isAllowed('76.76.21.200')).toBe(true);
    });

    it('should allow localhost requests', () => {
      expect(IPValidator.isAllowed('127.0.0.1')).toBe(true);
      expect(IPValidator.isAllowed('::1')).toBe(true);
    });

    it('should allow custom configured IPs', () => {
      expect(IPValidator.isAllowed('203.0.113.1')).toBe(true);
      expect(IPValidator.isAllowed('198.51.100.50')).toBe(true);
    });

    it('should block unauthorized IPs', () => {
      expect(IPValidator.isAllowed('8.8.8.8')).toBe(false);
      expect(IPValidator.isAllowed('1.1.1.1')).toBe(false);
      expect(IPValidator.isAllowed('malicious.com')).toBe(false);
    });

    it('should handle CIDR notation correctly', () => {
      expect(IPValidator.isAllowed('198.51.100.1')).toBe(true);
      expect(IPValidator.isAllowed('198.51.100.255')).toBe(true);
      expect(IPValidator.isAllowed('198.51.101.1')).toBe(false);
    });

    it('should extract client IP from various headers', () => {
      const createRequest = (headers: Record<string, string>) => 
        new NextRequest('https://test.com/api/cron/test', { headers });

      expect(IPValidator.extractClientIP(
        createRequest({ 'cf-connecting-ip': '203.0.113.1' })
      )).toBe('203.0.113.1');

      expect(IPValidator.extractClientIP(
        createRequest({ 'x-forwarded-for': '203.0.113.1,192.168.1.1' })
      )).toBe('203.0.113.1');

      expect(IPValidator.extractClientIP(
        createRequest({ 'x-real-ip': '203.0.113.1' })
      )).toBe('203.0.113.1');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limits', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const result = await MiddlewareSecurity.validateRequest(request, 'CRON');
      expect(result.allowed).toBe(true);
      expect(mockRateLimiter.checkLimit).toHaveBeenCalled();
    });

    it('should block requests exceeding rate limits', async () => {
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000
      });

      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const result = await MiddlewareSecurity.validateRequest(request, 'CRON');
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(429);
      expect(result.responseHeaders?.['X-RateLimit-Remaining']).toBe('0');
    });

    it('should apply different rate limits for different endpoint types', async () => {
      const cronRequest = new NextRequest('https://test.com/api/cron/test', {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });
      
      const healthRequest = new NextRequest('https://test.com/api/health/test', {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      await MiddlewareSecurity.validateRequest(cronRequest, 'CRON');
      await MiddlewareSecurity.validateRequest(healthRequest, 'HEALTH');

      // Verify different limits were applied
      const calls = mockRateLimiter.checkLimit.mock.calls;
      expect(calls[0][2]).toBe(10);  // CRON limit
      expect(calls[1][2]).toBe(100); // HEALTH limit
    });
  });

  describe('Signature Validation', () => {
    it('should validate correct HMAC signatures', async () => {
      const request = new NextRequest('https://test.com/api/cron/test');
      const { headers } = SignatureValidator.generateSignature('GET', '/api/cron/test');
      
      // Add signature headers to request
      Object.entries(headers).forEach(([key, value]) => {
        request.headers.set(key, value);
      });

      const result = await SignatureValidator.validateSignature(request);
      expect(result.valid).toBe(true);
    });

    it('should reject requests with missing signatures', async () => {
      const request = new NextRequest('https://test.com/api/cron/test');
      
      const result = await SignatureValidator.validateSignature(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing signature header');
    });

    it('should reject requests with invalid signatures', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'X-Signature-SHA256': 'sha256=invalid_signature',
          'X-Timestamp': Math.floor(Date.now() / 1000).toString()
        }
      });
      
      const result = await SignatureValidator.validateSignature(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Signature verification failed');
    });

    it('should reject requests with stale timestamps', async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'X-Signature-SHA256': 'sha256=test_signature',
          'X-Timestamp': staleTimestamp.toString()
        }
      });
      
      const result = await SignatureValidator.validateSignature(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('timestamp outside tolerance window');
    });

    it('should generate valid signatures for testing', () => {
      const { signature, timestamp, headers } = SignatureValidator.generateSignature(
        'GET', 
        '/api/cron/test',
        { param1: 'value1' }
      );

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(parseInt(timestamp)).toBeGreaterThan(0);
      expect(headers['X-Signature-SHA256']).toBe(signature);
      expect(headers['X-Timestamp']).toBe(timestamp);
    });
  });

  describe('API Key Validation', () => {
    it('should validate correct API keys from Authorization header', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'Authorization': 'Bearer tldr_test123456789012345678901234'
        }
      });

      const result = await APIKeyValidator.validateAPIKey(request);
      expect(result.valid).toBe(true);
      expect(result.keyId).toBeDefined();
    });

    it('should validate correct API keys from X-API-Key header', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'X-API-Key': 'tldr_test987654321098765432109876'
        }
      });

      const result = await APIKeyValidator.validateAPIKey(request);
      expect(result.valid).toBe(true);
      expect(result.keyId).toBeDefined();
    });

    it('should reject requests with missing API keys', async () => {
      const request = new NextRequest('https://test.com/api/cron/test');

      const result = await APIKeyValidator.validateAPIKey(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Missing API key');
    });

    it('should reject requests with invalid API key format', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'Authorization': 'Bearer invalid_key_format'
        }
      });

      const result = await APIKeyValidator.validateAPIKey(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid API key format');
    });

    it('should reject requests with unknown API keys', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'Authorization': 'Bearer tldr_unknown123456789012345678901'
        }
      });

      const result = await APIKeyValidator.validateAPIKey(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid API key');
    });
  });

  describe('Suspicious Activity Detection', () => {
    it('should detect suspicious user agents', () => {
      const suspiciousUAs = [
        'curl/7.68.0',
        'wget/1.20.3',
        'sqlmap/1.5.2',
        'nmap scripting engine',
        'hackbot v2.0'
      ];

      suspiciousUAs.forEach(userAgent => {
        const request = new NextRequest('https://test.com/api/test', {
          headers: { 'User-Agent': userAgent }
        });

        const result = SecurityAuditor.detectSuspiciousActivity(request);
        expect(result.suspicious).toBe(true);
        expect(result.reasons.length).toBeGreaterThan(0);
      });
    });

    it('should detect suspicious query parameters', () => {
      const suspiciousUrls = [
        'https://test.com/api/test?admin=true',
        'https://test.com/api/test?debug=1',
        'https://test.com/api/test?config=show',
        'https://test.com/api/test?backup=download'
      ];

      suspiciousUrls.forEach(url => {
        const request = new NextRequest(url);
        const result = SecurityAuditor.detectSuspiciousActivity(request);
        expect(result.suspicious).toBe(true);
        expect(result.reasons.some(r => r.includes('Suspicious query parameter'))).toBe(true);
      });
    });

    it('should detect potential SQL injection attempts', () => {
      const sqlInjectionUrls = [
        "https://test.com/api/test?id=1' OR '1'='1",
        "https://test.com/api/test?search='; DROP TABLE users--",
        "https://test.com/api/test?filter=UNION SELECT * FROM admin"
      ];

      sqlInjectionUrls.forEach(url => {
        const request = new NextRequest(url);
        const result = SecurityAuditor.detectSuspiciousActivity(request);
        expect(result.suspicious).toBe(true);
        expect(result.reasons.some(r => r.includes('SQL injection'))).toBe(true);
      });
    });

    it('should allow legitimate requests', () => {
      const request = new NextRequest('https://test.com/api/test?page=1&limit=10', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const result = SecurityAuditor.detectSuspiciousActivity(request);
      expect(result.suspicious).toBe(false);
      expect(result.reasons.length).toBe(0);
    });
  });

  describe('Comprehensive Security Validation', () => {
    it('should allow legitimate cron requests with all security checks', async () => {
      // Set up a legitimate request from Railway
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'x-forwarded-for': '172.16.10.5', // Railway IP
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          'User-Agent': 'Railway-Cron/1.0'
        }
      });

      const result = await MiddlewareSecurity.validateRequest(request, 'CRON');
      expect(result.allowed).toBe(true);
      expect(result.responseHeaders).toBeDefined();
      expect(result.responseHeaders?.['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should block requests from unauthorized IPs', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'x-forwarded-for': '8.8.8.8', // Unauthorized IP
          'Authorization': `Bearer ${process.env.CRON_SECRET}`
        }
      });

      const result = await MiddlewareSecurity.validateRequest(request, 'CRON');
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toBe('IP not allowed');
    });

    it('should apply security headers to all responses', async () => {
      const request = new NextRequest('https://test.com/api/health/test', {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const result = await MiddlewareSecurity.validateRequest(request, 'HEALTH');
      expect(result.allowed).toBe(true);
      
      const headers = result.responseHeaders;
      expect(headers?.['X-Content-Type-Options']).toBe('nosniff');
      expect(headers?.['X-Frame-Options']).toBe('DENY');
      expect(headers?.['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers?.['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
      expect(headers?.['Cache-Control']).toBe('no-store, no-cache, must-revalidate, max-age=0');
    });

    it('should fail secure on validation errors', async () => {
      // Mock rate limiter to throw an error
      mockRateLimiter.checkLimit.mockRejectedValue(new Error('Rate limiter failure'));

      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const result = await MiddlewareSecurity.validateRequest(request, 'CRON');
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.reason).toBe('Security validation error');
    });

    it('should handle multiple authentication methods', async () => {
      // Test fallback from signature to API key
      process.env.CRON_SIGNATURE_SECRET = 'test-sig-secret';
      
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'X-Signature-SHA256': 'sha256=invalid_signature',
          'X-Timestamp': Math.floor(Date.now() / 1000).toString(),
          'X-API-Key': 'tldr_test123456789012345678901234'
        }
      });

      const result = await MiddlewareSecurity.validateRequest(request, 'CRON');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Security Performance', () => {
    it('should complete security validation within performance threshold', async () => {
      const request = new NextRequest('https://test.com/api/cron/test', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`
        }
      });

      const startTime = Date.now();
      await MiddlewareSecurity.validateRequest(request, 'CRON');
      const duration = Date.now() - startTime;

      // Security validation should complete within 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => 
        new NextRequest(`https://test.com/api/health/test?id=${i}`, {
          headers: { 'x-forwarded-for': '127.0.0.1' }
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(
        requests.map(req => MiddlewareSecurity.validateRequest(req, 'HEALTH'))
      );
      const duration = Date.now() - startTime;

      // All requests should be allowed
      expect(results.every(r => r.allowed)).toBe(true);
      
      // Concurrent processing should be efficient
      expect(duration).toBeLessThan(500);
    });
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    process.env.CRON_ALLOWED_IPS = '203.0.113.1';
    process.env.CRON_SECRET = 'integration-test-secret';
  });

  afterEach(() => {
    delete process.env.CRON_ALLOWED_IPS;
    delete process.env.CRON_SECRET;
  });

  it('should simulate a complete attack scenario and verify defenses', async () => {
    const attackRequests = [
      // IP-based attack
      new NextRequest('https://test.com/api/cron/test', {
        headers: { 'x-forwarded-for': '8.8.8.8' }
      }),
      
      // SQL injection attack  
      new NextRequest("https://test.com/api/health?id=1' OR '1'='1", {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      }),
      
      // Suspicious user agent attack
      new NextRequest('https://test.com/api/health', {
        headers: { 
          'x-forwarded-for': '127.0.0.1',
          'User-Agent': 'sqlmap/1.5.2'
        }
      })
    ];

    const results = await Promise.all(
      attackRequests.map(req => {
        const endpointType = req.url.includes('/cron/') ? 'CRON' : 'HEALTH';
        return MiddlewareSecurity.validateRequest(req, endpointType);
      })
    );

    // All attacks should be blocked
    expect(results.every(r => !r.allowed)).toBe(true);
    
    // Verify different blocking reasons
    expect(results[0].reason).toBe('IP not allowed');
    expect(results[1].reason).toBe('Suspicious activity detected');
    expect(results[2].reason).toBe('Suspicious activity detected');
  });
});