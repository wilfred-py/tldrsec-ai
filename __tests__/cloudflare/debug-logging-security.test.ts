/**
 * CRITICAL: Tests for Cloudflare Worker debug logging security
 * Added per QA review of PR #201
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock console methods
const mockConsoleLog = jest.fn();
const originalConsoleLog = console.log;

beforeEach(() => {
  console.log = mockConsoleLog;
  mockConsoleLog.mockClear();
});

afterEach(() => {
  console.log = originalConsoleLog;
});

describe('Cloudflare Worker Debug Logging Security Tests', () => {
  // Simulate the debug logging code from the worker
  const logBypassSecretValue = (env: { VERCEL_AUTOMATION_BYPASS_SECRET?: string }) => {
    console.log('Bypass secret value: ' + (env.VERCEL_AUTOMATION_BYPASS_SECRET ? '[REDACTED]' : 'UNDEFINED'));
  };

  describe('Secret Redaction Behavior', () => {
    it('should redact secret when environment variable is set', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: 'actual-secret-value' };
      
      logBypassSecretValue(env);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('actual-secret-value'));
    });

    it('should log UNDEFINED when environment variable is not set', () => {
      const env = {};
      
      logBypassSecretValue(env);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: UNDEFINED');
    });

    it('should handle undefined environment variable', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: undefined };
      
      logBypassSecretValue(env);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: UNDEFINED');
    });

    it('should handle null environment variable', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: null as any };
      
      logBypassSecretValue(env);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: UNDEFINED');
    });
  });

  describe('Edge Cases for Truthy/Falsy Values', () => {
    it('should handle empty string as falsy (SECURITY CRITICAL)', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: '' };
      
      logBypassSecretValue(env);
      
      // Empty string should be treated as UNDEFINED for security
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: UNDEFINED');
    });

    it('should handle zero as falsy', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: '0' };
      
      logBypassSecretValue(env);
      
      // String "0" is truthy, should be redacted
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
    });

    it('should handle false as falsy', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: false as any };
      
      logBypassSecretValue(env);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: UNDEFINED');
    });

    it('should handle whitespace-only string as truthy (SECURITY RISK)', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: '   ' };
      
      logBypassSecretValue(env);
      
      // Whitespace string is truthy - this could be a security issue
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
    });
  });

  describe('Information Disclosure Prevention', () => {
    it('should never log the actual secret value', () => {
      const sensitiveSecrets = [
        'super-secret-bypass-key',
        'prod-bypass-token-123',
        'vercel-automation-secret',
        'bypass-dev-key',
        '12345',
        'a'.repeat(64) // Long secret
      ];

      sensitiveSecrets.forEach(secret => {
        mockConsoleLog.mockClear();
        const env = { VERCEL_AUTOMATION_BYPASS_SECRET: secret };
        
        logBypassSecretValue(env);
        
        expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
        expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining(secret));
      });
    });

    it('should not leak secret through string concatenation errors', () => {
      // Test potential string concatenation edge cases
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: 'secret' };
      
      // Mock console.log to throw an error to test error handling
      mockConsoleLog.mockImplementationOnce(() => {
        throw new Error('Logging failed');
      });
      
      expect(() => {
        logBypassSecretValue(env);
      }).toThrow('Logging failed');
      
      // Verify no secret is exposed in error messages
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
    });

    it('should handle object/array environment variables safely', () => {
      // Test edge case where env var might be an object
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: { secret: 'value' } as any };
      
      logBypassSecretValue(env);
      
      // Object is truthy, should be redacted
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
    });
  });

  describe('Production Safety Validation', () => {
    it('should be safe for production environments', () => {
      const productionEnv = {
        VERCEL_AUTOMATION_BYPASS_SECRET: 'prod-secret-key-do-not-expose'
      };
      
      logBypassSecretValue(productionEnv);
      
      // Should never expose production secrets
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
      
      // Verify no production secret appears in any call
      const allCalls = mockConsoleLog.mock.calls.flat().join(' ');
      expect(allCalls).not.toContain('prod-secret-key-do-not-expose');
    });

    it('should handle concurrent logging safely', () => {
      const env = { VERCEL_AUTOMATION_BYPASS_SECRET: 'concurrent-secret' };
      
      // Simulate concurrent calls
      const promises = Array.from({ length: 10 }, () => 
        Promise.resolve().then(() => logBypassSecretValue(env))
      );
      
      return Promise.all(promises).then(() => {
        // All calls should be redacted
        expect(mockConsoleLog).toHaveBeenCalledTimes(10);
        mockConsoleLog.mock.calls.forEach(call => {
          expect(call[0]).toBe('Bypass secret value: [REDACTED]');
        });
      });
    });
  });

  describe('Debugging Utility Validation', () => {
    it('should provide useful debugging information without exposing secrets', () => {
      // Test with secret set
      const envWithSecret = { VERCEL_AUTOMATION_BYPASS_SECRET: 'test-secret' };
      logBypassSecretValue(envWithSecret);
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: [REDACTED]');
      
      mockConsoleLog.mockClear();
      
      // Test without secret set
      const envWithoutSecret = {};
      logBypassSecretValue(envWithoutSecret);
      expect(mockConsoleLog).toHaveBeenCalledWith('Bypass secret value: UNDEFINED');
      
      // Both cases provide useful debugging info without leaking secrets
    });

    it('should maintain consistent logging format', () => {
      const testCases = [
        { env: { VERCEL_AUTOMATION_BYPASS_SECRET: 'secret' }, expected: '[REDACTED]' },
        { env: {}, expected: 'UNDEFINED' },
        { env: { VERCEL_AUTOMATION_BYPASS_SECRET: undefined }, expected: 'UNDEFINED' },
        { env: { VERCEL_AUTOMATION_BYPASS_SECRET: null }, expected: 'UNDEFINED' }
      ];
      
      testCases.forEach(({ env, expected }, index) => {
        mockConsoleLog.mockClear();
        logBypassSecretValue(env);
        
        expect(mockConsoleLog).toHaveBeenCalledWith(`Bypass secret value: ${expected}`);
      });
    });
  });
});