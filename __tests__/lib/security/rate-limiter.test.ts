import { rateLimiter } from '../../../lib/security/rate-limiter';

// Mock Redis
jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => ({
      pipeline: jest.fn().mockReturnValue({
        incr: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 'OK']])
      })
    }))
  };
});

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Clear in-memory cache between tests
    (rateLimiter as any).inMemoryCache.clear();
    jest.clearAllMocks();
  });

  describe('In-Memory Rate Limiting', () => {
    beforeEach(() => {
      // Ensure Redis is not available for these tests
      delete process.env.REDIS_URL;
    });

    it('should allow requests under the limit', async () => {
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it('should track multiple requests from same identifier', async () => {
      // First request
      const result1 = await rateLimiter.checkLimit('test', 'user1', 3, 60000);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      // Second request
      const result2 = await rateLimiter.checkLimit('test', 'user1', 3, 60000);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      // Third request
      const result3 = await rateLimiter.checkLimit('test', 'user1', 3, 60000);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);

      // Fourth request (should be blocked)
      const result4 = await rateLimiter.checkLimit('test', 'user1', 3, 60000);
      expect(result4.allowed).toBe(false);
      expect(result4.remaining).toBe(0);
    });

    it('should handle different identifiers separately', async () => {
      // User1 makes requests
      const result1 = await rateLimiter.checkLimit('test', 'user1', 2, 60000);
      const result2 = await rateLimiter.checkLimit('test', 'user1', 2, 60000);
      const result3 = await rateLimiter.checkLimit('test', 'user1', 2, 60000);
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(false); // Third request blocked

      // User2 should still be allowed
      const result4 = await rateLimiter.checkLimit('test', 'user2', 2, 60000);
      expect(result4.allowed).toBe(true);
    });

    it('should handle different keys separately', async () => {
      // Same user, different endpoints
      const result1 = await rateLimiter.checkLimit('endpoint1', 'user1', 1, 60000);
      const result2 = await rateLimiter.checkLimit('endpoint2', 'user1', 1, 60000);
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);

      // Both should block further requests
      const result3 = await rateLimiter.checkLimit('endpoint1', 'user1', 1, 60000);
      const result4 = await rateLimiter.checkLimit('endpoint2', 'user1', 1, 60000);
      
      expect(result3.allowed).toBe(false);
      expect(result4.allowed).toBe(false);
    });

    it('should reset window after expiration', async () => {
      jest.useFakeTimers();
      
      // Make requests up to limit
      const result1 = await rateLimiter.checkLimit('test', 'user1', 2, 1000);
      const result2 = await rateLimiter.checkLimit('test', 'user1', 2, 1000);
      const result3 = await rateLimiter.checkLimit('test', 'user1', 2, 1000);
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(false);

      // Advance time past window
      jest.advanceTimersByTime(1100);

      // Should allow requests again
      const result4 = await rateLimiter.checkLimit('test', 'user1', 2, 1000);
      expect(result4.allowed).toBe(true);
      expect(result4.remaining).toBe(1);
      
      jest.useRealTimers();
    });

    it('should cleanup expired entries', async () => {
      jest.useFakeTimers();
      
      // Create entries
      await rateLimiter.checkLimit('test', 'user1', 5, 1000);
      await rateLimiter.checkLimit('test', 'user2', 5, 1000);
      
      // Advance time past cleanup threshold
      jest.advanceTimersByTime(601000); // 10+ minutes
      
      // Next request should trigger cleanup
      await rateLimiter.checkLimit('test', 'user3', 5, 1000);
      
      // Previous entries should be cleaned up
      const cacheSize = (rateLimiter as any).inMemoryCache.size;
      expect(cacheSize).toBe(1); // Only user3 entry remains
      
      jest.useRealTimers();
    });
  });

  describe('Redis Rate Limiting', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      // Reset the rate limiter to pick up Redis
      (rateLimiter as any).redis = new (require('ioredis').Redis)();
    });

    afterEach(() => {
      delete process.env.REDIS_URL;
      (rateLimiter as any).redis = null;
    });

    it('should use Redis when available', async () => {
      const mockRedis = (rateLimiter as any).redis;
      mockRedis.pipeline.mockReturnValue({
        incr: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 'OK']])
      });

      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should handle Redis pipeline results correctly', async () => {
      const mockRedis = (rateLimiter as any).redis;
      
      // Simulate 3rd request (count = 3)
      mockRedis.pipeline.mockReturnValue({
        incr: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([[null, 3], [null, 'OK']])
      });

      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should block when Redis count exceeds limit', async () => {
      const mockRedis = (rateLimiter as any).redis;
      
      // Simulate 6th request when limit is 5
      mockRedis.pipeline.mockReturnValue({
        incr: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([[null, 6], [null, 'OK']])
      });

      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should fail open when Redis throws error', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      
      const mockRedis = (rateLimiter as any).redis;
      mockRedis.pipeline.mockReturnValue({
        incr: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockRejectedValue(new Error('Redis connection failed'))
      });

      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should allow request when Redis fails
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      
      delete process.env.REDIS_URL;
    });

    it('should handle invalid Redis response gracefully', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      
      const mockRedis = (rateLimiter as any).redis;
      mockRedis.pipeline.mockReturnValue({
        incr: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue(null) // Invalid response
      });

      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should allow request when response is invalid
      expect(result.allowed).toBe(true);
      
      delete process.env.REDIS_URL;
    });

    it('should handle in-memory cache errors gracefully', async () => {
      // Force an error in in-memory processing
      const originalGet = Map.prototype.get;
      Map.prototype.get = jest.fn().mockImplementation(() => {
        throw new Error('Memory error');
      });

      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should fail open
      expect(result.allowed).toBe(true);
      
      // Restore original method
      Map.prototype.get = originalGet;
    });
  });

  describe('Configuration', () => {
    it('should use default values when not specified', async () => {
      const result = await rateLimiter.checkLimit('test', 'user1');
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // Default limit is 60
    });

    it('should handle custom limits and windows', async () => {
      // Custom limit: 2 requests per 30 seconds
      const result1 = await rateLimiter.checkLimit('test', 'user1', 2, 30000);
      const result2 = await rateLimiter.checkLimit('test', 'user1', 2, 30000);
      const result3 = await rateLimiter.checkLimit('test', 'user1', 2, 30000);
      
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(1);
      
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(0);
      
      expect(result3.allowed).toBe(false);
      expect(result3.remaining).toBe(0);
    });

    it('should handle edge case limits', async () => {
      // Zero limit
      const result1 = await rateLimiter.checkLimit('test', 'user1', 0, 60000);
      expect(result1.allowed).toBe(false);
      
      // Very high limit
      const result2 = await rateLimiter.checkLimit('test', 'user2', 999999, 60000);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(999998);
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent requests correctly', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        rateLimiter.checkLimit('test', 'user1', 5, 60000)
      );
      
      const results = await Promise.all(promises);
      
      // Should allow exactly 5 requests
      const allowedCount = results.filter(r => r.allowed).length;
      const blockedCount = results.filter(r => !r.allowed).length;
      
      expect(allowedCount).toBe(5);
      expect(blockedCount).toBe(5);
    });

    it('should handle concurrent requests from different users', async () => {
      const user1Promises = Array.from({ length: 3 }, () => 
        rateLimiter.checkLimit('test', 'user1', 2, 60000)
      );
      
      const user2Promises = Array.from({ length: 3 }, () => 
        rateLimiter.checkLimit('test', 'user2', 2, 60000)
      );
      
      const allResults = await Promise.all([...user1Promises, ...user2Promises]);
      
      // Each user should be rate limited independently
      const user1Results = allResults.slice(0, 3);
      const user2Results = allResults.slice(3, 6);
      
      expect(user1Results.filter(r => r.allowed).length).toBe(2);
      expect(user2Results.filter(r => r.allowed).length).toBe(2);
    });
  });
});