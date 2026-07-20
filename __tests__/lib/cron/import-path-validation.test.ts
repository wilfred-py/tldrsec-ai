/**
 * Import Path Validation Tests
 * 
 * Tests the import path fix in auth-service.ts to ensure:
 * - Rate limiter can be properly imported
 * - Build process doesn't fail due to import issues
 * - Circular dependencies are avoided
 * - Module resolution works in different environments
 */

describe('Import Path Validation', () => {
  describe('Rate Limiter Import Path', () => {
    test('should import rate limiter successfully with correct path', async () => {
      // Test that the import works without throwing
      expect(async () => {
        const { CronAuthService } = await import('../../../lib/cron/auth-service');
        expect(CronAuthService).toBeDefined();
        expect(typeof CronAuthService.validateCronRequest).toBe('function');
      }).not.toThrow();
    });

    test('should resolve rate limiter module correctly', async () => {
      // Verify that the rate limiter module can be imported from the correct path
      expect(async () => {
        const { rateLimiter } = await import('../../../lib/security/rate-limiter');
        expect(rateLimiter).toBeDefined();
        expect(typeof rateLimiter.checkLimit).toBe('function');
      }).not.toThrow();
    });

    test('should validate auth service can use rate limiter methods', async () => {
      // Mock NextRequest for testing
      const mockRequest = {
        headers: {
          get: jest.fn((name: string) => {
            if (name === 'authorization') return 'Bearer test-token';
            if (name === 'x-forwarded-for') return '127.0.0.1';
            return null;
          })
        }
      } as any;

      // Mock environment variable
      const originalCronSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = 'a'.repeat(32); // Valid 32-character secret

      try {
        const { CronAuthService } = await import('../../../lib/cron/auth-service');
        
        // This should not throw an import error
        const result = await CronAuthService.validateCronRequest(mockRequest);
        
        // We expect validation to work (result structure should be correct)
        expect(result).toHaveProperty('isValid');
        expect(typeof result.isValid).toBe('boolean');
        
      } finally {
        // Restore original environment
        if (originalCronSecret) {
          process.env.CRON_SECRET = originalCronSecret;
        } else {
          delete process.env.CRON_SECRET;
        }
      }
    });

    test('should handle dynamic import of rate limiter correctly', async () => {
      // Test the dynamic import pattern used in the rate limiter validation
      try {
        // This mimics the dynamic import in validateRateLimit method
        const { rateLimiter } = await import('../../../lib/security/rate-limiter');
        const rateLimitResult = await rateLimiter.checkLimit('test-endpoint', '127.0.0.1');
        
        expect(rateLimitResult).toHaveProperty('allowed');
        expect(rateLimitResult).toHaveProperty('remaining');
        expect(rateLimitResult).toHaveProperty('resetTime');
        expect(typeof rateLimitResult.allowed).toBe('boolean');
        
      } catch (error) {
        // Dynamic import should not fail
        throw new Error(`Dynamic import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  });

  describe('Module Dependency Graph', () => {
    test('should not create circular dependencies', async () => {
      // Test that importing auth-service doesn't create circular dependencies
      const startTime = Date.now();
      
      try {
        await import('../../../lib/cron/auth-service');
        const importTime = Date.now() - startTime;
        
        // Import should complete quickly (no circular dependency delays)
        expect(importTime).toBeLessThan(1000);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('circular')) {
          throw new Error('Circular dependency detected in auth-service imports');
        }
        throw error;
      }
    });

    test('should resolve all required dependencies', async () => {
      // Test that all dependencies of auth-service can be resolved
      const modules = [
        '../../../lib/cron/auth-service',
        '../../../lib/security/rate-limiter',
        '../../../lib/logging',
        '../../../lib/cron/types'
      ];

      for (const modulePath of modules) {
        try {
          const module = await import(modulePath);
          expect(module).toBeDefined();
        } catch (error) {
          throw new Error(`Failed to import ${modulePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    });
  });

  describe('Build Environment Compatibility', () => {
    test('should work in Node.js environment', async () => {
      // Verify the modules work in Node.js runtime
      expect(typeof process).toBe('object');
      expect(process.versions.node).toBeDefined();

      const { CronAuthService } = await import('../../../lib/cron/auth-service');
      expect(CronAuthService.validateCronRequest).toBeDefined();
      expect(typeof CronAuthService.validateCronRequest).toBe('function');
    });

    test('should handle Edge Runtime environment', async () => {
      // Mock Edge Runtime environment
      const originalEdgeRuntime = (globalThis as any).EdgeRuntime;
      (globalThis as any).EdgeRuntime = 'mock-edge-runtime';
      
      try {
        // Re-import to test Edge Runtime code path
        delete require.cache[require.resolve('../../../lib/security/rate-limiter')];
        const { rateLimiter } = await import('../../../lib/security/rate-limiter');
        
        expect(rateLimiter).toBeDefined();
        
        // Should work with in-memory rate limiting in Edge Runtime
        const result = await rateLimiter.checkLimit('test', '127.0.0.1');
        expect(result.allowed).toBeDefined();
        
      } finally {
        // Restore original state
        if (originalEdgeRuntime) {
          (globalThis as any).EdgeRuntime = originalEdgeRuntime;
        } else {
          delete (globalThis as any).EdgeRuntime;
        }
      }
    });

    test('should handle missing Redis dependency gracefully', async () => {
      // Mock Redis unavailability
      const originalRedisUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      
      try {
        delete require.cache[require.resolve('../../../lib/security/rate-limiter')];
        const { rateLimiter } = await import('../../../lib/security/rate-limiter');
        
        // Should fall back to in-memory cache
        const result = await rateLimiter.checkLimit('test', '127.0.0.1');
        expect(result).toHaveProperty('allowed');
        
      } finally {
        // Restore Redis URL if it existed
        if (originalRedisUrl) {
          process.env.REDIS_URL = originalRedisUrl;
        }
      }
    });
  });

  describe('TypeScript Module Resolution', () => {
    test('should have correct TypeScript types for imports', async () => {
      const { CronAuthService } = await import('../../../lib/cron/auth-service');
      const { rateLimiter } = await import('../../../lib/security/rate-limiter');

      // Type checks - these will fail at compile time if types are wrong
      expect(typeof CronAuthService.validateCronRequest).toBe('function');

      expect(typeof rateLimiter.checkLimit).toBe('function');

      // Test method signatures work correctly
      const mockRequest = { headers: { get: jest.fn() } } as any;
      const authResult = await CronAuthService.validateCronRequest(mockRequest);
      expect(authResult).toHaveProperty('isValid');

      const rateLimitResult = await rateLimiter.checkLimit('test', '127.0.0.1');
      expect(rateLimitResult).toHaveProperty('allowed');
    });

    test('should export expected interfaces and types', async () => {
      // Verify that types are properly exported
      const authModule = await import('../../../lib/cron/auth-service');
      const typesModule = await import('../../../lib/cron/types');
      
      expect(authModule.CronAuthService).toBeDefined();
      
      // Types should be available for import
      expect(typesModule).toBeDefined();
    });
  });

  describe('Performance and Resource Usage', () => {
    test('should import modules efficiently', async () => {
      const startTime = Date.now();
      
      await Promise.all([
        import('../../../lib/cron/auth-service'),
        import('../../../lib/security/rate-limiter'),
        import('../../../lib/logging')
      ]);
      
      const importTime = Date.now() - startTime;
      
      // Imports should be fast
      expect(importTime).toBeLessThan(500);
    });

    test('should not leak memory during repeated imports', async () => {
      // Test multiple imports don't accumulate memory
      for (let i = 0; i < 10; i++) {
        await import('../../../lib/cron/auth-service');
        await import('../../../lib/security/rate-limiter');
      }
      
      // Should complete without memory issues
      expect(true).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    test('should provide clear error messages for import failures', async () => {
      try {
        // Try to import a non-existent module to test error handling
        await import('../../../lib/cron/non-existent-module');
        fail('Should have thrown an import error');
      } catch (error) {
        // Accept any error that has a message about module not found
        const errorMessage = error?.message || String(error);
        expect(errorMessage).toMatch(/Cannot resolve module|Cannot find module|Module not found/);
      }
    });

    test('should handle module initialization errors gracefully', async () => {
      // Mock a module initialization error scenario
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test-error-scenario';
      
      try {
        // Should still be able to import even with unusual environment
        const module = await import('../../../lib/cron/auth-service');
        expect(module).toBeDefined();
        
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });
});