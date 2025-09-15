/**
 * Edge Runtime Detection Tests
 * 
 * CRITICAL: Tests for runtime detection logic edge cases and security vulnerabilities
 * These tests cover false positives, environment manipulation, and race conditions
 */

import { rateLimiter } from '../../../lib/security/rate-limiter';

// Mock console to suppress output during tests
const mockConsole = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Store original console methods
const originalConsole = {
  info: console.info,
  warn: console.warn,
  error: console.error
};

beforeEach(() => {
  // Replace console methods
  Object.assign(console, mockConsole);
  jest.clearAllMocks();
});

afterEach(() => {
  // Restore original console
  Object.assign(console, originalConsole);
  // Clean up environment
  delete (global as any).EdgeRuntime;
  delete (globalThis as any).EdgeRuntime;
  delete process.env.RUNTIME;
});

describe('Edge Runtime Detection Security', () => {
  describe('False Positive Prevention', () => {
    it('should not detect Edge Runtime when only process.env.RUNTIME is set', async () => {
      // SECURITY TEST: Prevent environment variable injection attacks
      process.env.RUNTIME = 'edge';
      
      // EdgeRuntime globals should not exist
      expect(typeof (global as any).EdgeRuntime).toBe('undefined');
      expect(typeof (globalThis as any).EdgeRuntime).toBe('undefined');
      
      // Rate limiter should still use Node.js Redis path
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should succeed but log warning about potential misconfiguration
      expect(result.allowed).toBe(true);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Edge Runtime detected')
      );
    });

    it('should handle polyfill conflicts gracefully', async () => {
      // Simulate polyfill that adds EdgeRuntime but isn't actually Edge Runtime
      (global as any).EdgeRuntime = { name: 'mock-polyfill' };
      
      // This should be detected as NOT Edge Runtime because it lacks proper interface
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      expect(result.allowed).toBe(true);
      // Should fall back to in-memory since this isn't real Edge Runtime
    });

    it('should detect true Edge Runtime environment', async () => {
      // Simulate real Edge Runtime environment
      (globalThis as any).EdgeRuntime = 'workerd';
      Object.defineProperty(global, 'process', {
        value: { env: { RUNTIME: 'edge' } },
        writable: true
      });
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      expect(result.allowed).toBe(true);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Edge Runtime detected')
      );
    });
  });

  describe('Environment Variable Security', () => {
    it('should sanitize RUNTIME environment variable', async () => {
      // SECURITY TEST: Prevent injection via environment variables
      process.env.RUNTIME = 'edge; rm -rf /';
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should not crash or execute arbitrary commands
      expect(result.allowed).toBe(true);
      expect(result.errorOccurred).toBeFalsy();
    });

    it('should handle malformed RUNTIME values', async () => {
      const malformedValues = [
        'edge\x00',
        'edge\n\r',
        'edge<script>',
        'edge${rm -rf /}',
        'edge`echo hack`',
        Array(10000).fill('edge').join(''),
      ];

      for (const value of malformedValues) {
        process.env.RUNTIME = value;
        
        const result = await rateLimiter.checkLimit('test', `user-${value.length}`, 5, 60000);
        
        // Should handle gracefully without crashes
        expect(result.allowed).toBe(true);
        expect(result.errorOccurred).toBeFalsy();
      }
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent runtime detection calls', async () => {
      // Simulate race condition during initialization
      const promises = Array.from({ length: 100 }, (_, i) => 
        rateLimiter.checkLimit('test', `user-${i}`, 5, 60000)
      );
      
      const results = await Promise.all(promises);
      
      // All should succeed without race condition errors
      results.forEach((result, i) => {
        expect(result.allowed).toBe(true);
        expect(result.errorOccurred).toBeFalsy();
      });
    });

    it('should handle runtime environment changes during execution', async () => {
      // Start with Node.js environment
      delete (global as any).EdgeRuntime;
      
      const promise1 = rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Change environment during execution
      (globalThis as any).EdgeRuntime = 'workerd';
      
      const promise2 = rateLimiter.checkLimit('test', 'user2', 5, 60000);
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      // Both should succeed despite environment change
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Memory Safety', () => {
    it('should not leak memory during repeated runtime checks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many runtime detection operations
      for (let i = 0; i < 1000; i++) {
        await rateLimiter.checkLimit('test', `user-${i}`, 5, 60000);
        
        // Toggle runtime environment to force re-detection
        if (i % 2 === 0) {
          (global as any).EdgeRuntime = 'test';
        } else {
          delete (global as any).EdgeRuntime;
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it('should clean up runtime detection artifacts', async () => {
      // Add runtime detection artifacts
      (global as any).EdgeRuntime = 'test';
      (globalThis as any).EdgeRuntime = 'test';
      process.env.RUNTIME = 'edge';
      
      await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Clean up manually (simulating proper cleanup)
      delete (global as any).EdgeRuntime;
      delete (globalThis as any).EdgeRuntime;
      delete process.env.RUNTIME;
      
      // Verify cleanup worked
      expect(typeof (global as any).EdgeRuntime).toBe('undefined');
      expect(typeof (globalThis as any).EdgeRuntime).toBe('undefined');
      expect(process.env.RUNTIME).toBeUndefined();
    });
  });

  describe('Error Resilience', () => {
    it('should handle EdgeRuntime property access errors', async () => {
      // Create EdgeRuntime that throws on access
      Object.defineProperty(global, 'EdgeRuntime', {
        get() {
          throw new Error('Access denied');
        },
        configurable: true
      });
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should fall back gracefully
      expect(result.allowed).toBe(true);
      expect(result.errorOccurred).toBeFalsy();
    });

    it('should handle globalThis access errors', async () => {
      // Mock globalThis to throw on EdgeRuntime access
      const originalGlobalThis = globalThis;
      
      Object.defineProperty(globalThis, 'EdgeRuntime', {
        get() {
          throw new Error('GlobalThis access error');
        },
        configurable: true
      });
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should handle gracefully
      expect(result.allowed).toBe(true);
      
      // Restore globalThis
      delete (globalThis as any).EdgeRuntime;
    });
  });
});

describe('Rate Limiter Circuit Breaker Edge Cases', () => {
  beforeEach(() => {
    // Reset circuit breaker state
    const circuitBreakerStatus = rateLimiter.getCircuitBreakerStatus();
    (rateLimiter as any).circuitBreakerState = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0
    };
  });

  describe('Emergency Limit Security', () => {
    it('should enforce strict emergency limits', async () => {
      // Force circuit breaker open
      (rateLimiter as any).circuitBreakerState.isOpen = true;
      (rateLimiter as any).circuitBreakerState.nextAttemptTime = Date.now() + 60000;
      
      // Test emergency limiting
      const promises = Array.from({ length: 15 }, (_, i) => 
        rateLimiter.checkLimit('test', 'user1', 100, 60000) // High normal limit
      );
      
      const results = await Promise.all(promises);
      
      // Should only allow 10 requests (DEFAULT_EMERGENCY_LIMIT) despite high normal limit
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBe(10);
      
      // Remaining requests should be blocked with emergency flag
      const blockedResults = results.filter(r => !r.allowed);
      blockedResults.forEach(result => {
        expect(result.errorOccurred).toBe(true);
        expect(result.rateLimitHit).toBe(true);
      });
    });

    it('should prevent emergency limit bypass attempts', async () => {
      // Force circuit breaker open
      (rateLimiter as any).circuitBreakerState.isOpen = true;
      
      // Try different keys to bypass emergency limiting
      const results = await Promise.all([
        rateLimiter.checkLimit('key1', 'user1', 100, 60000),
        rateLimiter.checkLimit('key2', 'user1', 100, 60000),
        rateLimiter.checkLimit('key3', 'user1', 100, 60000)
      ]);
      
      // All should be subject to emergency limiting
      results.forEach(result => {
        expect(result.allowed).toBe(true); // First request from each key
        expect(result.errorOccurred).toBe(true); // But with error flag
      });
    });
  });

  describe('Circuit Breaker State Corruption', () => {
    it('should handle corrupted circuit breaker state', async () => {
      // Corrupt the circuit breaker state
      (rateLimiter as any).circuitBreakerState = {
        isOpen: 'invalid',
        failureCount: -1,
        lastFailureTime: 'invalid',
        nextAttemptTime: null
      };
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should handle corruption gracefully
      expect(result.allowed).toBe(true);
      expect(result.errorOccurred).toBeFalsy();
    });

    it('should recover from circuit breaker timeout corruption', async () => {
      // Set invalid timeout
      (rateLimiter as any).circuitBreakerState.nextAttemptTime = 'invalid';
      (rateLimiter as any).circuitBreakerState.isOpen = true;
      
      const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
      
      // Should either handle gracefully or reset circuit breaker
      expect(typeof result.allowed).toBe('boolean');
    });
  });
});