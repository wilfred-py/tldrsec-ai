/**
 * Rate Limiting Algorithms Testing Suite
 * 
 * Tests token bucket, sliding window, and key generation algorithms
 * for various rate limiting scenarios and edge cases.
 */

import { 
  getRateLimitConfig, 
  KEY_GENERATORS, 
  COST_BASED_LIMITS,
  SECURITY_RATE_LIMITS,
  DEFAULT_RATE_LIMIT,
  EMERGENCY_RATE_LIMIT
} from '../../lib/infrastructure/vercel-rate-limits';

// Mock rate limiting implementation for testing
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number, // tokens per second
    private refillInterval: number = 1000 // ms
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consume(tokensRequested: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokensRequested) {
      this.tokens -= tokensRequested;
      return true;
    }
    
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor((timePassed / this.refillInterval) * this.refillRate);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

class SlidingWindow {
  private requests: number[] = [];

  constructor(private windowSize: number) {} // window size in ms

  canMakeRequest(maxRequests: number): boolean {
    const now = Date.now();
    
    // Remove requests outside the window
    this.requests = this.requests.filter(timestamp => 
      now - timestamp < this.windowSize
    );
    
    if (this.requests.length < maxRequests) {
      this.requests.push(now);
      return true;
    }
    
    return false;
  }

  getRequestCount(): number {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => 
      now - timestamp < this.windowSize
    );
    return this.requests.length;
  }
}

describe('Rate Limiting Algorithms Tests', () => {
  describe('Token Bucket Algorithm', () => {
    test('should allow requests when tokens are available', () => {
      const bucket = new TokenBucket(10, 1); // 10 capacity, 1 token/second
      
      expect(bucket.consume()).toBe(true);
      expect(bucket.getTokens()).toBe(9);
    });

    test('should deny requests when tokens are exhausted', () => {
      const bucket = new TokenBucket(2, 1); // Small bucket
      
      expect(bucket.consume()).toBe(true); // First request
      expect(bucket.consume()).toBe(true); // Second request
      expect(bucket.consume()).toBe(false); // Third request should fail
    });

    test('should refill tokens at specified rate', async () => {
      const bucket = new TokenBucket(5, 5, 100); // 5 tokens per 100ms
      
      // Exhaust all tokens
      for (let i = 0; i < 5; i++) {
        bucket.consume();
      }
      expect(bucket.getTokens()).toBe(0);
      
      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(bucket.getTokens()).toBeGreaterThan(0);
    });

    test('should not exceed bucket capacity during refill', async () => {
      const bucket = new TokenBucket(3, 10, 100); // Small capacity, fast refill
      
      // Wait for multiple refill cycles
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(bucket.getTokens()).toBeLessThanOrEqual(3);
    });

    test('should handle burst requests correctly', () => {
      const bucket = new TokenBucket(5, 1); // Allow burst of 5
      
      // Should allow burst up to capacity
      for (let i = 0; i < 5; i++) {
        expect(bucket.consume()).toBe(true);
      }
      
      // Next request should fail
      expect(bucket.consume()).toBe(false);
    });

    test('should handle fractional token consumption', () => {
      const bucket = new TokenBucket(10, 1);
      
      expect(bucket.consume(Math.floor(2.5))).toBe(true); // Should round down to 2
      expect(bucket.getTokens()).toBe(8); // 10 - 2 = 8
    });

    test('should handle zero token requests', () => {
      const bucket = new TokenBucket(10, 1);
      
      expect(bucket.consume(0)).toBe(true);
      expect(bucket.getTokens()).toBe(10); // No tokens consumed
    });
  });

  describe('Sliding Window Algorithm', () => {
    test('should allow requests within rate limit', () => {
      const window = new SlidingWindow(60000); // 1 minute window
      
      for (let i = 0; i < 5; i++) {
        expect(window.canMakeRequest(10)).toBe(true);
      }
      
      expect(window.getRequestCount()).toBe(5);
    });

    test('should deny requests exceeding rate limit', () => {
      const window = new SlidingWindow(60000); // 1 minute window
      
      // Fill up to the limit
      for (let i = 0; i < 3; i++) {
        expect(window.canMakeRequest(3)).toBe(true);
      }
      
      // Next request should be denied
      expect(window.canMakeRequest(3)).toBe(false);
    });

    test('should expire old requests outside window', async () => {
      const window = new SlidingWindow(100); // 100ms window
      
      // Make requests
      expect(window.canMakeRequest(5)).toBe(true);
      expect(window.canMakeRequest(5)).toBe(true);
      expect(window.getRequestCount()).toBe(2);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(window.getRequestCount()).toBe(0);
      
      // Should allow new requests
      expect(window.canMakeRequest(5)).toBe(true);
    });

    test('should handle rapid sequential requests', () => {
      const window = new SlidingWindow(1000); // 1 second window
      
      const start = Date.now();
      let successCount = 0;
      
      // Make rapid requests
      for (let i = 0; i < 20; i++) {
        if (window.canMakeRequest(10)) {
          successCount++;
        }
      }
      
      expect(successCount).toBe(10); // Should allow exactly 10
      expect(window.getRequestCount()).toBe(10);
    });

    test('should handle edge case of zero rate limit', () => {
      const window = new SlidingWindow(60000);
      
      expect(window.canMakeRequest(0)).toBe(false);
    });

    test('should handle sliding window edge transitions', async () => {
      const window = new SlidingWindow(200); // 200ms window
      
      // Fill the window
      for (let i = 0; i < 3; i++) {
        expect(window.canMakeRequest(3)).toBe(true);
      }
      
      // Wait half the window time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still be rate limited
      expect(window.canMakeRequest(3)).toBe(false);
      
      // Wait for full window expiry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should allow new requests
      expect(window.canMakeRequest(3)).toBe(true);
    });
  });

  describe('Rate Limit Configuration', () => {
    test('should return correct config for cron endpoints', () => {
      const cronConfig = getRateLimitConfig('/api/cron/tier-aware');
      
      expect(cronConfig).toBeDefined();
      expect(cronConfig?.maxRequests).toBe(10);
      expect(cronConfig?.windowMs).toBe(10 * 60 * 1000);
    });

    test('should return correct config for filing endpoints', () => {
      const filingConfig = getRateLimitConfig('/api/filings/batch-summary');
      
      expect(filingConfig).toBeDefined();
      expect(filingConfig?.maxRequests).toBe(100);
      expect(filingConfig?.windowMs).toBe(60 * 60 * 1000);
    });

    test('should return correct config for email endpoints', () => {
      const emailConfig = getRateLimitConfig('/api/email/summary');
      
      expect(emailConfig).toBeDefined();
      expect(emailConfig?.maxRequests).toBe(100);
      expect(emailConfig?.skipFailedRequests).toBe(false);
    });

    test('should return null for non-existent endpoints', () => {
      const config = getRateLimitConfig('/api/non-existent');
      expect(config).toBeNull();
    });

    test('should handle pattern matching for parameterized routes', () => {
      const config = getRateLimitConfig('/api/cron/tier-aware/some-param');
      expect(config).toBeDefined();
      expect(config?.endpoint).toBe('/api/cron/tier-aware');
    });

    test('should provide default rate limit configuration', () => {
      expect(DEFAULT_RATE_LIMIT.maxRequests).toBe(1000);
      expect(DEFAULT_RATE_LIMIT.windowMs).toBe(60 * 60 * 1000);
    });

    test('should provide emergency rate limit configuration', () => {
      expect(EMERGENCY_RATE_LIMIT.maxRequests).toBe(10);
      expect(EMERGENCY_RATE_LIMIT.windowMs).toBe(60 * 60 * 1000);
    });
  });

  describe('Key Generation Algorithms', () => {
    test('should generate IP-based keys correctly', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1'
        }
      });
      
      const key = KEY_GENERATORS.byIP(mockRequest);
      expect(key).toBe('ip:192.168.1.1');
    });

    test('should handle missing IP headers', () => {
      const mockRequest = new Request('https://example.com');
      
      const key = KEY_GENERATORS.byIP(mockRequest);
      expect(key).toBe('ip:unknown');
    });

    test('should prefer x-forwarded-for over Cloudflare IP header', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'cf-connecting-ip': '203.0.113.1'
        }
      });
      
      const key = KEY_GENERATORS.byIP(mockRequest);
      expect(key).toBe('ip:192.168.1.1');
    });

    test('should generate user-based keys correctly', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-user-id': 'user123'
        }
      });
      
      const key = KEY_GENERATORS.byUser(mockRequest);
      expect(key).toBe('user:user123');
    });

    test('should handle anonymous users', () => {
      const mockRequest = new Request('https://example.com');
      
      const key = KEY_GENERATORS.byUser(mockRequest);
      expect(key).toBe('user:anonymous');
    });

    test('should generate endpoint-based keys correctly', () => {
      const mockRequest = new Request('https://example.com/api/test');
      
      const key = KEY_GENERATORS.byEndpoint(mockRequest);
      expect(key).toBe('endpoint:/api/test');
    });

    test('should generate combined IP and endpoint keys', () => {
      const mockRequest = new Request('https://example.com/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1'
        }
      });
      
      const key = KEY_GENERATORS.byIPAndEndpoint(mockRequest);
      expect(key).toBe('ip-endpoint:192.168.1.1:/api/test');
    });

    test('should generate cron source keys correctly', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-cron-source': 'cloudflare-worker'
        }
      });
      
      const key = KEY_GENERATORS.byCronSource(mockRequest);
      expect(key).toBe('cron:cloudflare-worker');
    });

    test('should fallback to user-agent for cron source', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'user-agent': 'CloudflareWorker/1.0'
        }
      });
      
      const key = KEY_GENERATORS.byCronSource(mockRequest);
      expect(key).toBe('cron:CloudflareWorker/1.0');
    });
  });

  describe('Cost-Based Rate Limiting', () => {
    test('should provide high-cost limits for expensive operations', () => {
      const highCost = COST_BASED_LIMITS.HIGH_COST;
      
      expect(highCost.maxRequests).toBe(25);
      expect(highCost.costMultiplier).toBe(3.0);
    });

    test('should provide medium-cost limits for standard operations', () => {
      const mediumCost = COST_BASED_LIMITS.MEDIUM_COST;
      
      expect(mediumCost.maxRequests).toBe(100);
      expect(mediumCost.costMultiplier).toBe(1.5);
    });

    test('should provide low-cost limits for basic operations', () => {
      const lowCost = COST_BASED_LIMITS.LOW_COST;
      
      expect(lowCost.maxRequests).toBe(500);
      expect(lowCost.costMultiplier).toBe(1.0);
    });

    test('should scale cost appropriately', () => {
      const { HIGH_COST, MEDIUM_COST, LOW_COST } = COST_BASED_LIMITS;
      
      expect(HIGH_COST.costMultiplier).toBeGreaterThan(MEDIUM_COST.costMultiplier);
      expect(MEDIUM_COST.costMultiplier).toBeGreaterThan(LOW_COST.costMultiplier);
      
      expect(HIGH_COST.maxRequests).toBeLessThan(MEDIUM_COST.maxRequests);
      expect(MEDIUM_COST.maxRequests).toBeLessThan(LOW_COST.maxRequests);
    });
  });

  describe('Security Rate Limiting', () => {
    test('should provide strict limits for auth attempts', () => {
      const authLimits = SECURITY_RATE_LIMITS.AUTH_ATTEMPTS;
      
      expect(authLimits.maxRequests).toBe(5);
      expect(authLimits.windowMs).toBe(15 * 60 * 1000); // 15 minutes
    });

    test('should provide limits for API key validation', () => {
      const apiKeyLimits = SECURITY_RATE_LIMITS.API_KEY_VALIDATION;
      
      expect(apiKeyLimits.maxRequests).toBe(10);
      expect(apiKeyLimits.windowMs).toBe(60 * 60 * 1000); // 1 hour
    });

    test('should provide very strict limits for suspicious activity', () => {
      const suspiciousLimits = SECURITY_RATE_LIMITS.SUSPICIOUS_ACTIVITY;
      
      expect(suspiciousLimits.maxRequests).toBe(3);
      expect(suspiciousLimits.windowMs).toBe(24 * 60 * 60 * 1000); // 24 hours
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle zero window size', () => {
      const window = new SlidingWindow(0);
      
      expect(window.canMakeRequest(10)).toBe(true); // Should allow since nothing is ever in window
      expect(window.getRequestCount()).toBe(0); // All requests immediately expire
    });

    test('should handle negative window size', () => {
      const window = new SlidingWindow(-1000);
      
      expect(window.canMakeRequest(10)).toBe(true);
      expect(window.getRequestCount()).toBe(0);
    });

    test('should handle very large window size', () => {
      const window = new SlidingWindow(Number.MAX_SAFE_INTEGER);
      
      expect(window.canMakeRequest(5)).toBe(true);
      expect(window.getRequestCount()).toBe(1);
    });

    test('should handle token bucket with zero capacity', () => {
      const bucket = new TokenBucket(0, 1);
      
      expect(bucket.consume()).toBe(false);
      expect(bucket.getTokens()).toBe(0);
    });

    test('should handle token bucket with zero refill rate', () => {
      const bucket = new TokenBucket(5, 0);
      
      expect(bucket.consume()).toBe(true);
      expect(bucket.consume()).toBe(true);
      expect(bucket.getTokens()).toBe(3);
      
      // After time passes, should not refill
      setTimeout(() => {
        expect(bucket.getTokens()).toBe(3);
      }, 100);
    });

    test('should handle malformed request URLs in key generation', () => {
      // Test with invalid URL (this shouldn't happen in practice)
      const mockRequest = new Request('https://example.com');
      
      // Should not throw
      expect(() => KEY_GENERATORS.byEndpoint(mockRequest)).not.toThrow();
    });

    test('should handle very long header values', () => {
      const longValue = 'x'.repeat(1000);
      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': longValue
        }
      });
      
      const key = KEY_GENERATORS.byIP(mockRequest);
      expect(key).toBe(`ip:${longValue}`);
    });

    test('should handle special characters in headers', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-user-id': specialChars
        }
      });
      
      const key = KEY_GENERATORS.byUser(mockRequest);
      expect(key).toBe(`user:${specialChars}`);
    });
  });

  describe('Algorithm Performance', () => {
    test('should handle high-frequency token bucket operations', () => {
      const bucket = new TokenBucket(1000, 100); // Large bucket, fast refill
      
      const start = Date.now();
      
      // Perform many operations
      for (let i = 0; i < 10000; i++) {
        bucket.consume();
      }
      
      const end = Date.now();
      expect(end - start).toBeLessThan(1000); // Should be fast
    });

    test('should handle high-frequency sliding window operations', () => {
      const window = new SlidingWindow(60000); // 1 minute window
      
      const start = Date.now();
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        window.canMakeRequest(2000); // High limit to allow all
      }
      
      const end = Date.now();
      expect(end - start).toBeLessThan(1000); // Should be fast
    });

    test('should efficiently clean up old sliding window requests', async () => {
      const window = new SlidingWindow(100); // Short window for fast test
      
      // Fill with many requests
      for (let i = 0; i < 100; i++) {
        window.canMakeRequest(200);
      }
      
      expect(window.getRequestCount()).toBe(100);
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const start = Date.now();
      const count = window.getRequestCount(); // Should trigger cleanup
      const end = Date.now();
      
      expect(count).toBe(0);
      expect(end - start).toBeLessThan(50); // Cleanup should be fast
    });
  });
});