/**
 * Rate Limiter Tests
 *
 * Tests for Slack webhook rate limiting functionality including
 * edge cases, concurrent requests, and DoS protection.
 */

import { checkRateLimit, getRateLimitHeaders, cleanupExpiredEntries, getRateLimitStats } from '../../lib/slack/rate-limiter';

// Mock logger to prevent test noise
jest.mock('../../lib/logging', () => ({
  logger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Clean up any existing entries before each test
    cleanupExpiredEntries();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', () => {
      const identifier = 'test-client-1';
      
      // First request should be allowed
      const result1 = checkRateLimit('slack_webhook', identifier);
      expect(result1.allowed).toBe(true);
      expect(result1.remainingRequests).toBe(99); // 100 - 1
      
      // Second request should also be allowed
      const result2 = checkRateLimit('slack_webhook', identifier);
      expect(result2.allowed).toBe(true);
      expect(result2.remainingRequests).toBe(98); // 100 - 2
    });

    it('should block requests when limit exceeded', () => {
      const identifier = 'test-client-2';
      
      // Make 100 requests (the limit)
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit('slack_webhook', identifier);
        expect(result.allowed).toBe(true);
      }
      
      // 101st request should be blocked
      const blockedResult = checkRateLimit('slack_webhook', identifier);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remainingRequests).toBe(0);
    });

    it('should track different clients separately', () => {
      const client1 = 'test-client-3';
      const client2 = 'test-client-4';
      
      // Both clients should be allowed independently
      const result1 = checkRateLimit('slack_webhook', client1);
      const result2 = checkRateLimit('slack_webhook', client2);
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remainingRequests).toBe(99);
      expect(result2.remainingRequests).toBe(99);
    });
  });

  describe('Different Rate Limit Types', () => {
    it('should apply different limits for different types', () => {
      const identifier = 'test-user-1';
      
      // slack_user has 20 req/min limit
      const result = checkRateLimit('slack_user', identifier);
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(19); // 20 - 1
    });

    it('should handle unknown rate limit types gracefully', () => {
      const identifier = 'test-unknown';
      
      // @ts-ignore - Testing unknown type
      const result = checkRateLimit('unknown_type', identifier);
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(999);
    });
  });

  describe('Time Window Behavior', () => {
    it('should reset rate limit after window expires', async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let mockTime = 1000000000; // Start time
      Date.now = jest.fn(() => mockTime);

      const identifier = 'test-client-5';
      
      // Make a request
      const result1 = checkRateLimit('slack_webhook', identifier);
      expect(result1.allowed).toBe(true);
      expect(result1.remainingRequests).toBe(99);
      
      // Move time forward by 61 seconds (past the 60-second window)
      mockTime += 61 * 1000;
      
      // Request should be allowed again with reset counter
      const result2 = checkRateLimit('slack_webhook', identifier);
      expect(result2.allowed).toBe(true);
      expect(result2.remainingRequests).toBe(99); // Reset to max - 1
      
      // Restore original Date.now
      Date.now = originalDateNow;
    });

    it('should maintain rate limit within time window', async () => {
      const originalDateNow = Date.now;
      let mockTime = 1000000000;
      Date.now = jest.fn(() => mockTime);

      const identifier = 'test-client-6';
      
      // Make a request
      const result1 = checkRateLimit('slack_webhook', identifier);
      expect(result1.remainingRequests).toBe(99);
      
      // Move time forward by 30 seconds (within window)
      mockTime += 30 * 1000;
      
      // Counter should not reset
      const result2 = checkRateLimit('slack_webhook', identifier);
      expect(result2.remainingRequests).toBe(98); // Continues counting
      
      Date.now = originalDateNow;
    });
  });

  describe('Rate Limit Headers', () => {
    it('should return correct headers', () => {
      const identifier = 'test-client-7';
      
      // Make a request first to establish state
      checkRateLimit('slack_webhook', identifier);
      
      const headers = getRateLimitHeaders('slack_webhook', identifier);
      
      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('99');
      expect(headers['X-RateLimit-Reset']).toMatch(/^\d+$/); // Should be a timestamp
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests correctly', () => {
      const identifier = 'test-client-8';
      const results: boolean[] = [];
      
      // Simulate 10 concurrent requests
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit('slack_webhook', identifier);
        results.push(result.allowed);
      }
      
      // All should be allowed
      expect(results.every(allowed => allowed)).toBe(true);
      
      // Final state check
      const finalResult = checkRateLimit('slack_webhook', identifier);
      expect(finalResult.remainingRequests).toBe(89); // 100 - 11
    });
  });

  describe('DoS Protection', () => {
    it('should block rapid successive requests from same client', () => {
      const identifier = 'dos-client';
      let allowedCount = 0;
      let blockedCount = 0;
      
      // Attempt 150 requests (50 over the limit)
      for (let i = 0; i < 150; i++) {
        const result = checkRateLimit('slack_webhook', identifier);
        if (result.allowed) {
          allowedCount++;
        } else {
          blockedCount++;
        }
      }
      
      expect(allowedCount).toBe(100); // Only 100 should be allowed
      expect(blockedCount).toBe(50);  // 50 should be blocked
    });
  });

  describe('Cleanup and Statistics', () => {
    it('should track statistics correctly', () => {
      const originalDateNow = Date.now;
      let mockTime = 1000000000;
      Date.now = jest.fn(() => mockTime);

      // Create some active entries
      checkRateLimit('slack_webhook', 'active-1');
      checkRateLimit('slack_webhook', 'active-2');
      
      // Create some entries that will expire
      checkRateLimit('slack_webhook', 'expired-1');
      checkRateLimit('slack_webhook', 'expired-2');
      
      // Move time forward to expire some entries
      mockTime += 65 * 1000; // 65 seconds later
      
      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.expiredEntries).toBeGreaterThan(0);
      
      Date.now = originalDateNow;
    });

    it('should clean up expired entries', () => {
      const originalDateNow = Date.now;
      let mockTime = 1000000000;
      Date.now = jest.fn(() => mockTime);

      // Create entries
      checkRateLimit('slack_webhook', 'cleanup-1');
      checkRateLimit('slack_webhook', 'cleanup-2');
      
      const statsBefore = getRateLimitStats();
      
      // Move time forward to expire entries
      mockTime += 65 * 1000;
      
      // Run cleanup
      cleanupExpiredEntries();
      
      const statsAfter = getRateLimitStats();
      expect(statsAfter.totalEntries).toBeLessThan(statsBefore.totalEntries);
      
      Date.now = originalDateNow;
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid identifiers gracefully', () => {
      const result1 = checkRateLimit('slack_webhook', '');
      const result2 = checkRateLimit('slack_webhook', null as any);
      const result3 = checkRateLimit('slack_webhook', undefined as any);
      
      // Should not crash and should provide reasonable defaults
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
    });

    it('should handle very long identifiers', () => {
      const longIdentifier = 'a'.repeat(1000);
      const result = checkRateLimit('slack_webhook', longIdentifier);
      
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(99);
    });
  });
});