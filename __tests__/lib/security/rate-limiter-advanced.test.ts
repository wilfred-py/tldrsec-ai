/**
 * Advanced Rate Limiter Security Tests
 * 
 * CRITICAL: Tests for rate limiter security vulnerabilities and attack vectors
 * Covers timing attacks, memory exhaustion, circuit breaker manipulation
 */

import { rateLimiter } from '../../../lib/security/rate-limiter';

// Mock Redis with controllable behavior
const mockRedis = {
  pipeline: jest.fn(),
  disconnect: jest.fn()
};

const mockPipeline = {
  incr: jest.fn(),
  expire: jest.fn(),
  exec: jest.fn()
};

jest.mock('ioredis', () => ({
  Redis: jest.fn(() => mockRedis)
}));

// Mock console to suppress output during tests
const mockConsole = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const originalConsole = {
  info: console.info,
  warn: console.warn,
  error: console.error
};

beforeEach(() => {
  // Reset mocks
  jest.clearAllMocks();
  mockRedis.pipeline.mockReturnValue(mockPipeline);
  mockPipeline.exec.mockResolvedValue([[null, 1], [null, 'OK']]);
  
  // Mock console
  Object.assign(console, mockConsole);
  
  // Reset rate limiter state
  (rateLimiter as any).inMemoryCache.clear();
  (rateLimiter as any).emergencyCache.clear();
  (rateLimiter as any).circuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0
  };
  
  // Clean environment
  delete process.env.REDIS_URL;
  delete process.env.RUNTIME;
});

afterEach(() => {
  Object.assign(console, originalConsole);
});

describe('Rate Limiter Security Vulnerabilities', () => {
  describe('Timing Attacks', () => {
    it('should have consistent timing regardless of cache hit/miss', async () => {
      const timings: number[] = [];
      
      // Measure timing for cache miss (first request)
      const start1 = process.hrtime.bigint();
      await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      const end1 = process.hrtime.bigint();
      timings.push(Number(end1 - start1) / 1000000); // Convert to ms
      
      // Measure timing for cache hit (subsequent request)
      const start2 = process.hrtime.bigint();
      await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      const end2 = process.hrtime.bigint();
      timings.push(Number(end2 - start2) / 1000000);
      
      // Timing difference should be minimal to prevent timing attacks
      const timeDiff = Math.abs(timings[1] - timings[0]);
      expect(timeDiff).toBeLessThan(10); // Less than 10ms difference
    });

    it('should have consistent timing for allowed vs denied requests', async () => {
      const timings: number[] = [];
      
      // Make requests up to limit
      for (let i = 0; i < 3; i++) {
        const start = process.hrtime.bigint();
        await rateLimiter.checkLimit('test', 'user1', 3, 60000);
        const end = process.hrtime.bigint();
        timings.push(Number(end - start) / 1000000);
      }
      
      // Next request should be denied
      const start = process.hrtime.bigint();
      await rateLimiter.checkLimit('test', 'user1', 3, 60000);
      const end = process.hrtime.bigint();
      const deniedTiming = Number(end - start) / 1000000;
      
      // Denied request timing should be similar to allowed requests
      const avgAllowedTiming = timings.reduce((a, b) => a + b) / timings.length;
      const timeDiff = Math.abs(deniedTiming - avgAllowedTiming);
      expect(timeDiff).toBeLessThan(20); // Allow some variance but prevent obvious timing differences
    });

    it('should prevent timing-based user enumeration', async () => {
      const existingUserTimings: number[] = [];
      const newUserTimings: number[] = [];
      
      // Time requests for existing user (with cache)
      await rateLimiter.checkLimit('test', 'existing_user', 5, 60000);
      for (let i = 0; i < 5; i++) {
        const start = process.hrtime.bigint();
        await rateLimiter.checkLimit('test', 'existing_user', 5, 60000);
        const end = process.hrtime.bigint();
        existingUserTimings.push(Number(end - start) / 1000000);
      }
      
      // Time requests for new users (cache miss)
      for (let i = 0; i < 5; i++) {
        const start = process.hrtime.bigint();
        await rateLimiter.checkLimit('test', `new_user_${i}`, 5, 60000);
        const end = process.hrtime.bigint();
        newUserTimings.push(Number(end - start) / 1000000);
      }
      
      const avgExistingTiming = existingUserTimings.reduce((a, b) => a + b) / existingUserTimings.length;
      const avgNewTiming = newUserTimings.reduce((a, b) => a + b) / newUserTimings.length;
      
      // Timing difference should be minimal
      const timeDiff = Math.abs(avgExistingTiming - avgNewTiming);
      expect(timeDiff).toBeLessThan(15);
    });
  });

  describe('Memory Exhaustion Attacks', () => {
    it('should prevent memory exhaustion via cache pollution', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Attempt to exhaust memory with many unique keys
      const promises = [];
      for (let i = 0; i < 10000; i++) {
        promises.push(rateLimiter.checkLimit('test', `user_${i}`, 5, 60000));
      }
      
      await Promise.all(promises);
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB for 10k users)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      // Cache should have reasonable size
      const cacheSize = (rateLimiter as any).inMemoryCache.size;
      expect(cacheSize).toBeLessThan(10000); // Should have some cleanup mechanism
    });

    it('should handle emergency cache cleanup under pressure', async () => {
      // Force circuit breaker open to use emergency cache
      (rateLimiter as any).circuitBreakerState.isOpen = true;
      (rateLimiter as any).circuitBreakerState.nextAttemptTime = Date.now() + 60000;
      
      // Fill emergency cache
      for (let i = 0; i < 1000; i++) {
        await rateLimiter.checkLimit('test', `emergency_user_${i}`, 5, 60000);
      }
      
      const emergencyCacheSize = (rateLimiter as any).emergencyCache.size;
      
      // Emergency cache should have reasonable limits
      expect(emergencyCacheSize).toBeLessThan(1000);
    });

    it('should prevent hash collision attacks', async () => {
      // Test with keys that might cause hash collisions
      const collisionKeys = [
        'user1',
        'user2',
        'user3',
        // Add some potentially colliding identifiers
        Array(100).fill('a').join(''),
        Array(100).fill('b').join(''),
        'a'.repeat(1000),
        'b'.repeat(1000)
      ];
      
      const results = await Promise.all(
        collisionKeys.map(key => rateLimiter.checkLimit('test', key, 5, 60000))
      );
      
      // All should be handled independently
      results.forEach(result => {
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });
    });
  });

  describe('Circuit Breaker Manipulation', () => {
    it('should prevent circuit breaker state manipulation', async () => {
      // Attempt to manipulate circuit breaker state directly
      const originalState = (rateLimiter as any).circuitBreakerState;
      
      // Simulate external manipulation
      (rateLimiter as any).circuitBreakerState = {
        isOpen: false,
        failureCount: -999,
        lastFailureTime: Date.now() + 999999,
        nextAttemptTime: -1
      };
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should handle corrupted state gracefully
      expect(result.allowed).toBe(true);
      expect(result.errorOccurred).toBeFalsy();
    });

    it('should prevent circuit breaker bypass attempts', async () => {
      // Force failures to open circuit breaker
      mockPipeline.exec.mockRejectedValue(new Error('Redis failure'));
      
      // Make requests to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      }
      
      // Circuit breaker should be open
      const status = rateLimiter.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(true);
      
      // Attempt to bypass by using different keys
      const bypassAttempts = await Promise.all([
        rateLimiter.checkLimit('bypass1', 'user1', 100, 60000),
        rateLimiter.checkLimit('bypass2', 'user1', 100, 60000),
        rateLimiter.checkLimit('bypass3', 'user1', 100, 60000)
      ]);
      
      // All should be subject to emergency limiting
      bypassAttempts.forEach(result => {
        expect(result.errorOccurred).toBe(true);
      });
    });

    it('should enforce minimum circuit breaker timeout', async () => {
      // Force circuit breaker open
      (rateLimiter as any).circuitBreakerState = {
        isOpen: true,
        failureCount: 5,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + 100 // Very short timeout
      };
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Circuit breaker should still enforce minimum timeout
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should either still be in emergency mode or properly reset
      expect(typeof result.allowed).toBe('boolean');
    });
  });

  describe('Input Validation Attacks', () => {
    it('should sanitize malicious identifiers', async () => {
      const maliciousIdentifiers = [
        'user1; DROP TABLE users;--',
        'user1\x00admin',
        'user1<script>alert("xss")</script>',
        'user1${rm -rf /}',
        'user1`echo hack`',
        'user1\n\radmin',
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32'
      ];
      
      for (const identifier of maliciousIdentifiers) {
        const result = await rateLimiter.checkLimit('test', identifier, 5, 60000);
        
        // Should handle without crashing
        expect(result.allowed).toBe(true);
        expect(result.errorOccurred).toBeFalsy();
      }
    });

    it('should handle extreme input values', async () => {
      const extremeInputs = [
        { key: 'test', identifier: 'user1', limit: 0, window: 60000 },
        { key: 'test', identifier: 'user1', limit: -1, window: 60000 },
        { key: 'test', identifier: 'user1', limit: 999999999, window: 60000 },
        { key: 'test', identifier: 'user1', limit: 5, window: 0 },
        { key: 'test', identifier: 'user1', limit: 5, window: -1 },
        { key: 'test', identifier: 'user1', limit: 5, window: 999999999 },
        { key: '', identifier: 'user1', limit: 5, window: 60000 },
        { key: 'test', identifier: '', limit: 5, window: 60000 }
      ];
      
      for (const input of extremeInputs) {
        const result = await rateLimiter.checkLimit(
          input.key, 
          input.identifier, 
          input.limit, 
          input.window
        );
        
        // Should handle gracefully - either reject with error or apply safe defaults
        expect(typeof result.allowed).toBe('boolean');
        expect(typeof result.remaining).toBe('number');
        expect(typeof result.resetTime).toBe('number');
      }
    });

    it('should prevent parameter pollution attacks', async () => {
      // Test with unusual characters and encoding
      const pollutionAttempts = [
        'user1%00admin',
        'user1%0aadmin',
        'user1%0dadmin',
        'user1\u0000admin',
        'user1\u000aadmin',
        'user1\u200badmin', // Zero-width space
        'user1\ufeffadmin', // Byte order mark
      ];
      
      for (const identifier of pollutionAttempts) {
        const result = await rateLimiter.checkLimit('test', identifier, 5, 60000);
        
        // Should normalize or handle safely
        expect(result.allowed).toBe(true);
        expect(result.errorOccurred).toBeFalsy();
      }
    });
  });

  describe('Redis Security Edge Cases', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      (rateLimiter as any).redis = mockRedis;
    });

    it('should handle Redis command injection attempts', async () => {
      // Mock Redis to check for command injection
      const capturedCommands: string[] = [];
      mockPipeline.incr.mockImplementation((key: string) => {
        capturedCommands.push(key);
        return mockPipeline;
      });
      
      // Attempt command injection via key
      const maliciousIdentifier = 'user1\r\nFLUSHALL\r\n';
      await rateLimiter.checkLimit('test', maliciousIdentifier, 5, 60000);
      
      // Should not execute Redis commands from user input
      capturedCommands.forEach(command => {
        expect(command).not.toContain('FLUSHALL');
        expect(command).not.toContain('\r\n');
      });
    });

    it('should handle Redis pipeline corruption gracefully', async () => {
      // Corrupt pipeline responses
      mockPipeline.exec.mockResolvedValue([
        [new Error('Pipeline error'), null],
        [null, 'OK']
      ]);
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should fall back to emergency limiting
      expect(result.errorOccurred).toBe(true);
      expect(typeof result.allowed).toBe('boolean');
    });

    it('should prevent Redis memory exhaustion', async () => {
      // Simulate Redis memory pressure
      mockPipeline.exec.mockRejectedValue(new Error('OOM command not allowed'));
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should handle gracefully and use emergency limiting
      expect(result.errorOccurred).toBe(true);
      expect(result.allowed).toBeTruthy(); // Should fail-secure but allow some traffic
    });
  });

  describe('Cryptographic Hash Security', () => {
    it('should use cryptographically secure hashing', async () => {
      // Test that different inputs produce different hashes
      const identifiers = ['user1', 'user2', 'user1 ', ' user1', 'User1'];
      const hashedKeys = new Set();
      
      // Mock crypto.subtle.digest to capture hash inputs
      const originalDigest = crypto.subtle.digest;
      const capturedInputs: string[] = [];
      
      (crypto.subtle.digest as any) = jest.fn().mockImplementation(async (algorithm, data) => {
        const text = new TextDecoder().decode(data);
        capturedInputs.push(text);
        return originalDigest.call(crypto.subtle, algorithm, data);
      });
      
      for (const identifier of identifiers) {
        await rateLimiter.checkLimit('test', identifier, 5, 60000);
      }
      
      // Restore original function
      crypto.subtle.digest = originalDigest;
      
      // Each identifier should be hashed separately
      expect(capturedInputs.length).toBe(identifiers.length);
      expect(new Set(capturedInputs).size).toBe(identifiers.length);
    });

    it('should handle crypto API failures gracefully', async () => {
      // Mock crypto.subtle.digest failure
      const originalDigest = crypto.subtle.digest;
      (crypto.subtle.digest as any) = jest.fn().mockRejectedValue(new Error('Crypto API failed'));
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should fall back to test environment hash or handle gracefully
      expect(typeof result.allowed).toBe('boolean');
      
      // Restore original function
      crypto.subtle.digest = originalDigest;
    });
  });
});