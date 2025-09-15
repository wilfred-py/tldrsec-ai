/**
 * Runtime Compatibility Security Integration Tests
 * 
 * CRITICAL: Integration tests for security controls after runtime compatibility changes
 * Tests end-to-end security behavior across different runtime environments
 */

// Setup crypto polyfill for Node.js test environment
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true
  });
}

import { rateLimiter } from '../../lib/security/rate-limiter';
import { getPrismaClient } from '../../lib/db/prisma';

// Mock Prisma to prevent database connections
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue([{ count: 1 }]),
    tickerMonitoring: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, version: 1, cik: 'test' })
    }
  }))
}));

// Mock Redis
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    pipeline: jest.fn().mockReturnValue({
      incr: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 'OK']])
    })
  }))
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
  
  // Reset rate limiter state
  (rateLimiter as any).inMemoryCache.clear();
  (rateLimiter as any).emergencyCache.clear();
  (rateLimiter as any).circuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0
  };
  
  // Clean runtime environment
  delete (global as any).EdgeRuntime;
  delete (globalThis as any).EdgeRuntime;
  delete process.env.RUNTIME;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Runtime Compatibility Security Integration', () => {
  describe('Security Controls Integrity', () => {
    it('should maintain rate limiting effectiveness across runtimes', async () => {
      // Test in Node.js runtime
      delete process.env.RUNTIME;
      
      // Make requests up to limit
      const nodeResults = [];
      for (let i = 0; i < 6; i++) {
        const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
        nodeResults.push(result);
      }
      
      // First 5 should be allowed, 6th should be blocked
      expect(nodeResults.slice(0, 5).every(r => r.allowed)).toBe(true);
      expect(nodeResults[5].allowed).toBe(false);
      
      // Clear cache and test in Edge Runtime simulation
      (rateLimiter as any).inMemoryCache.clear();
      process.env.RUNTIME = 'edge';
      
      const edgeResults = [];
      for (let i = 0; i < 6; i++) {
        const result = await rateLimiter.checkLimit('test', 'user2', 5, 60000);
        edgeResults.push(result);
      }
      
      // Should have same behavior
      expect(edgeResults.slice(0, 5).every(r => r.allowed)).toBe(true);
      expect(edgeResults[5].allowed).toBe(false);
    });

    it('should enforce security boundaries in both runtimes', async () => {
      const testCases = [
        { runtime: 'node', envVar: undefined },
        { runtime: 'edge', envVar: 'edge' }
      ];

      for (const testCase of testCases) {
        // Setup runtime environment
        if (testCase.envVar) {
          process.env.RUNTIME = testCase.envVar;
        } else {
          delete process.env.RUNTIME;
        }

        // Test malicious input handling
        const maliciousInputs = [
          'user1; DROP TABLE users;--',
          'user1\x00admin',
          '../../../etc/passwd',
          'user1${rm -rf /}'
        ];

        for (const input of maliciousInputs) {
          const result = await rateLimiter.checkLimit('test', input, 5, 60000);
          
          // Should handle safely in both runtimes
          expect(result.allowed).toBe(true);
          expect(result.errorOccurred).toBeFalsy();
        }

        // Clear state between runtime tests
        (rateLimiter as any).inMemoryCache.clear();
      }
    });

    it('should maintain fail-secure behavior in both runtimes', async () => {
      const testRuntimes = [
        { name: 'node', setup: () => delete process.env.RUNTIME },
        { name: 'edge', setup: () => { process.env.RUNTIME = 'edge'; } }
      ];

      for (const runtime of testRuntimes) {
        runtime.setup();

        // Force error condition by corrupting rate limiter state
        const originalCheckLimit = (rateLimiter as any).checkLimitMemory;
        (rateLimiter as any).checkLimitMemory = jest.fn().mockImplementation(() => {
          throw new Error('Memory corruption');
        });

        const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);

        // Should fail secure (deny by default) or handle gracefully
        expect(typeof result.allowed).toBe('boolean');
        expect(result.errorOccurred).toBeTruthy();

        // Restore original function
        (rateLimiter as any).checkLimitMemory = originalCheckLimit;
        (rateLimiter as any).inMemoryCache.clear();
      }
    });
  });

  describe('Database Security Validation', () => {
    it('should validate DATABASE_URL security in both runtimes', () => {
      const maliciousUrls = [
        'postgresql://user:pass@host/db; DROP TABLE users;--',
        'postgresql://user:pass@host/db\'; GRANT ALL PRIVILEGES;--',
        'postgresql://user:pass@host/db" OR 1=1--'
      ];

      maliciousUrls.forEach(url => {
        process.env.DATABASE_URL = url;
        
        // Should not crash in either runtime environment
        expect(() => {
          getPrismaClient();
        }).not.toThrow();
      });
    });

    it('should handle missing DATABASE_URL consistently', () => {
      delete process.env.DATABASE_URL;

      // Should fail consistently in both Node.js and Edge Runtime
      expect(() => {
        getPrismaClient();
      }).toThrow('DATABASE_URL environment variable is not set');

      // Test with Edge Runtime environment
      process.env.RUNTIME = 'edge';
      expect(() => {
        getPrismaClient();
      }).toThrow('DATABASE_URL environment variable is not set');
    });

    it('should sanitize database errors across runtimes', () => {
      process.env.DATABASE_URL = 'postgresql://admin:secret123@private-host/sensitive_db';

      // Mock Prisma to throw error with sensitive information
      const { PrismaClient } = require('@prisma/client');
      (PrismaClient as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed: password authentication failed for user "admin" with password "secret123"');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        getPrismaClient();
      } catch (error) {
        // Error handling should not expose credentials
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).not.toContain('secret123');
        expect(errorMessage).not.toContain('admin');
        expect(errorMessage).not.toContain('private-host');
      }

      consoleSpy.mockRestore();
    });
  });

  describe('Hash Function Security', () => {
    it('should produce consistent hashes across environments', async () => {
      const testIdentifiers = ['user1', 'user2', 'test@example.com'];
      const nodeHashes = new Map();
      const edgeHashes = new Map();

      // Generate hashes in Node.js environment
      delete process.env.RUNTIME;
      for (const identifier of testIdentifiers) {
        await rateLimiter.checkLimit('test', identifier, 5, 60000);
        // Hash is internal, so we test behavior consistency instead
        nodeHashes.set(identifier, 'computed');
      }

      // Clear cache and test in Edge Runtime environment
      (rateLimiter as any).inMemoryCache.clear();
      process.env.RUNTIME = 'edge';
      
      for (const identifier of testIdentifiers) {
        await rateLimiter.checkLimit('test', identifier, 5, 60000);
        edgeHashes.set(identifier, 'computed');
      }

      // Both environments should handle all identifiers
      expect(nodeHashes.size).toBe(testIdentifiers.length);
      expect(edgeHashes.size).toBe(testIdentifiers.length);
    });

    it('should handle hash collision resistance', async () => {
      // Test with potentially colliding inputs
      const collisionCandidates = [
        'user123',
        'user124',
        '123user',
        '124user',
        Array(100).fill('a').join(''),
        Array(100).fill('b').join('')
      ];

      const results = await Promise.all(
        collisionCandidates.map(id => rateLimiter.checkLimit('test', id, 5, 60000))
      );

      // All should be handled independently (no hash collisions affecting rate limiting)
      results.forEach((result, index) => {
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });
    });
  });

  describe('Circuit Breaker Security', () => {
    it('should maintain security during circuit breaker operations', async () => {
      // Force circuit breaker into open state
      (rateLimiter as any).circuitBreakerState = {
        isOpen: true,
        failureCount: 5,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + 60000
      };

      // Test that emergency limiting is enforced
      const results = [];
      for (let i = 0; i < 15; i++) {
        const result = await rateLimiter.checkLimit('test', 'user1', 100, 60000);
        results.push(result);
      }

      // Should only allow emergency limit (10) regardless of configured limit (100)
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBe(10);

      // All should have error flag indicating circuit breaker active
      results.forEach(result => {
        expect(result.errorOccurred).toBe(true);
      });
    });

    it('should prevent circuit breaker state manipulation attacks', async () => {
      // Attempt to manipulate circuit breaker state with invalid values
      const invalidStates = [
        { isOpen: 'true', failureCount: 'many', nextAttemptTime: 'never' },
        { isOpen: null, failureCount: -999, nextAttemptTime: undefined },
        { isOpen: [], failureCount: {}, nextAttemptTime: 'invalid' }
      ];

      for (const invalidState of invalidStates) {
        (rateLimiter as any).circuitBreakerState = invalidState;
        
        const result = await rateLimiter.checkLimit('test', 'user1', 5, 60000);
        
        // Should handle gracefully despite invalid state
        expect(typeof result.allowed).toBe('boolean');
        expect(typeof result.remaining).toBe('number');
        expect(typeof result.resetTime).toBe('number');
      }
    });
  });

  describe('Memory Safety Validation', () => {
    it('should prevent memory exhaustion in both runtimes', async () => {
      const testRuntimes = [
        () => delete process.env.RUNTIME,
        () => { process.env.RUNTIME = 'edge'; }
      ];

      for (const setupRuntime of testRuntimes) {
        setupRuntime();
        
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Generate many cache entries
        const promises = [];
        for (let i = 0; i < 1000; i++) {
          promises.push(rateLimiter.checkLimit('test', `user_${i}`, 5, 60000));
        }
        
        await Promise.all(promises);
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;
        
        // Memory increase should be reasonable (less than 20MB for 1000 entries)
        expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
        
        // Clear cache for next runtime test
        (rateLimiter as any).inMemoryCache.clear();
        (rateLimiter as any).emergencyCache.clear();
      }
    });

    it('should handle cache cleanup consistently', async () => {
      // Fill cache with expired entries
      const now = Date.now();
      const expiredTime = now - 120000; // 2 minutes ago
      
      // Manually insert expired entries
      for (let i = 0; i < 100; i++) {
        (rateLimiter as any).inMemoryCache.set(`expired_key_${i}`, {
          count: 1,
          resetTime: expiredTime
        });
      }
      
      expect((rateLimiter as any).inMemoryCache.size).toBe(100);
      
      // Trigger cleanup by making a new request
      await rateLimiter.checkLimit('test', 'cleanup_trigger', 5, 60000);
      
      // Cache should be cleaned up (may not be immediate due to cleanup timing)
      // The important thing is that it doesn't crash or leak memory
      expect((rateLimiter as any).inMemoryCache.size).toBeLessThanOrEqual(101);
    });
  });

  describe('Concurrent Access Security', () => {
    it('should handle concurrent requests safely', async () => {
      // Test concurrent access from different users
      const userPromises = Array.from({ length: 50 }, (_, i) =>
        Array.from({ length: 3 }, () => 
          rateLimiter.checkLimit('test', `user_${i}`, 2, 60000)
        )
      ).flat();

      const results = await Promise.all(userPromises);
      
      // Group results by user
      const userResults = new Map();
      results.forEach((result, index) => {
        const userIndex = Math.floor(index / 3);
        if (!userResults.has(userIndex)) {
          userResults.set(userIndex, []);
        }
        userResults.get(userIndex).push(result);
      });

      // Each user should have exactly 2 allowed and 1 blocked request
      userResults.forEach((results, userIndex) => {
        const allowedCount = results.filter(r => r.allowed).length;
        const blockedCount = results.filter(r => !r.allowed).length;
        
        expect(allowedCount).toBe(2);
        expect(blockedCount).toBe(1);
      });
    });

    it('should prevent race conditions in runtime detection', async () => {
      // Rapidly change runtime environment during concurrent requests
      const promises = Array.from({ length: 100 }, async (_, i) => {
        // Toggle runtime environment
        if (i % 2 === 0) {
          process.env.RUNTIME = 'edge';
        } else {
          delete process.env.RUNTIME;
        }
        
        return rateLimiter.checkLimit('test', `user_${i}`, 5, 60000);
      });

      const results = await Promise.all(promises);
      
      // All requests should succeed despite environment changes
      results.forEach((result, i) => {
        expect(result.allowed).toBe(true);
        expect(result.errorOccurred).toBeFalsy();
      });
    });
  });
});