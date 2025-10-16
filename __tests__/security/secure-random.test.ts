/**
 * Security Tests for Secure Random Number Generation
 * 
 * Validates that all security-sensitive random number generation
 * uses cryptographically secure methods and meets entropy requirements.
 */

import {
  generateSecureExecutionId,
  generateSecureCorrelationId,
  generateSecureRequestId,
  generateSecureBatchId,
  generateSecureAlertId,
  generateSecureOperationId,
  generateSecureAuditId,
  generateSecureHexString,
  generateSecureSessionToken,
  generateSecureChallenge,
  generateSecureJitter,
  validateSecureId,
  createDeterministicHash,
  auditRandomUsage
} from '../../lib/security/secure-random';

describe('Secure Random Number Generation', () => {
  describe('ID Generation Functions', () => {
    test('generateSecureExecutionId should create secure execution IDs', () => {
      const id1 = generateSecureExecutionId('test');
      const id2 = generateSecureExecutionId('test');
      
      expect(id1).toMatch(/^test-\d+-[a-f0-9]{16}$/);
      expect(id2).toMatch(/^test-\d+-[a-f0-9]{16}$/);
      expect(id1).not.toBe(id2); // Should be unique
      expect(id1.length).toBeGreaterThan(25); // Sufficient length
    });

    test('generateSecureCorrelationId should create secure correlation IDs', () => {
      const id1 = generateSecureCorrelationId('operation');
      const id2 = generateSecureCorrelationId('operation');
      
      expect(id1).toMatch(/^operation_\d+_[a-f0-9]{12}$/);
      expect(id2).toMatch(/^operation_\d+_[a-f0-9]{12}$/);
      expect(id1).not.toBe(id2);
    });

    test('generateSecureRequestId should create secure request IDs', () => {
      const id = generateSecureRequestId('api');
      
      expect(id).toMatch(/^api_\d+_[a-f0-9]{10}$/);
      expect(validateSecureId(id, 'api')).toBe(true);
    });

    test('generateSecureBatchId should create secure batch IDs', () => {
      const id = generateSecureBatchId('batch');
      
      expect(id).toMatch(/^batch-\d+-[a-f0-9]{8}$/);
      expect(validateSecureId(id, 'batch')).toBe(true);
    });

    test('generateSecureAlertId should create secure alert IDs', () => {
      const id = generateSecureAlertId();
      
      expect(id).toMatch(/^alert_\d+_[a-f0-9]{9}$/);
    });

    test('generateSecureOperationId should create secure operation IDs', () => {
      const id = generateSecureOperationId('extract');
      
      expect(id).toMatch(/^extract-\d+-[a-f0-9]{12}$/);
    });

    test('generateSecureAuditId should create secure audit IDs', () => {
      const id = generateSecureAuditId();
      
      expect(id).toMatch(/^audit_[a-f0-9]+_[a-f0-9]{15}_[a-f0-9]{15}$/);
      expect(id.length).toBeGreaterThan(40); // High entropy
    });
  });

  describe('Token and Crypto Functions', () => {
    test('generateSecureHexString should create secure hex strings', () => {
      const hex8 = generateSecureHexString(8);
      const hex16 = generateSecureHexString(16);
      
      expect(hex8).toMatch(/^[a-f0-9]{16}$/); // 8 bytes = 16 hex chars
      expect(hex16).toMatch(/^[a-f0-9]{32}$/); // 16 bytes = 32 hex chars
      expect(hex8).not.toBe(hex16.substring(0, 16)); // Should be different
    });

    test('generateSecureSessionToken should create secure tokens', () => {
      const token1 = generateSecureSessionToken();
      const token2 = generateSecureSessionToken(16);
      
      expect(token1.length).toBeGreaterThan(40); // Base64url encoded 32 bytes
      expect(token2.length).toBeGreaterThan(20); // Base64url encoded 16 bytes
      expect(token1).not.toBe(token2);
      
      // Should be base64url format (no + / = characters)
      expect(token1).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('generateSecureChallenge should create secure challenges', () => {
      const challenge = generateSecureChallenge();
      
      expect(challenge).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
      
      const [timestamp, token] = challenge.split('.');
      expect(parseInt(timestamp)).toBeCloseTo(Date.now(), -3); // Within ~1 second
      expect(token.length).toBeGreaterThan(40); // 32 bytes base64url
    });

    test('generateSecureJitter should add cryptographic jitter', () => {
      const baseDelay = 1000;
      const jitterFactor = 0.1;
      
      const jitteredDelay1 = generateSecureJitter(baseDelay, jitterFactor);
      const jitteredDelay2 = generateSecureJitter(baseDelay, jitterFactor);
      
      expect(jitteredDelay1).toBeGreaterThan(baseDelay);
      expect(jitteredDelay1).toBeLessThan(baseDelay * (1 + jitterFactor));
      expect(jitteredDelay1).not.toBe(jitteredDelay2);
    });

    test('generateSecureJitter should validate jitter factor bounds', () => {
      expect(() => generateSecureJitter(1000, -0.1)).toThrow();
      expect(() => generateSecureJitter(1000, 1.1)).toThrow();
      expect(() => generateSecureJitter(1000, 0.5)).not.toThrow();
    });
  });

  describe('Validation Functions', () => {
    test('validateSecureId should validate ID structure', () => {
      const validId = generateSecureExecutionId('test');
      const invalidIds = [
        'test-123-abc', // Short random part
        'test_123_abc123', // Wrong separators
        'test-notanumber-abc123def456', // Invalid timestamp
        '', // Empty string
        'test-123', // Missing parts
      ];

      expect(validateSecureId(validId, 'test')).toBe(true);
      
      invalidIds.forEach(id => {
        expect(validateSecureId(id)).toBe(false);
      });
    });

    test('createDeterministicHash should create consistent hashes', () => {
      const input = 'test-input-string';
      const hash1 = createDeterministicHash(input);
      const hash2 = createDeterministicHash(input);
      const hash3 = createDeterministicHash('different-input');
      
      expect(hash1).toBe(hash2); // Same input = same hash
      expect(hash1).not.toBe(hash3); // Different input = different hash
      expect(hash1).toMatch(/^[a-f0-9]{8}$/); // 8 hex characters
    });
  });

  describe('Security Audit Functions', () => {
    test('auditRandomUsage should detect weak random patterns', () => {
      const codeWithWeakRandom = `
        const executionId = 'exec-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const correlationId = 'corr_' + Math.random().toString(36).substring(2, 9);
        const delay = Math.random() * 1000; // For jitter
        const testData = Math.random(); // In test file
      `;
      
      const issues = auditRandomUsage(codeWithWeakRandom);
      
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.severity === 'HIGH')).toBe(true);
      expect(issues.some(issue => issue.issue.includes('Math.random()'))).toBe(true);
    });

    test('auditRandomUsage should not flag secure implementations', () => {
      const secureCode = `
        import { generateSecureExecutionId } from './secure-random';
        const executionId = generateSecureExecutionId('test');
        const cryptoBytes = crypto.randomBytes(16);
      `;
      
      const issues = auditRandomUsage(secureCode);
      
      expect(issues.length).toBe(0);
    });
  });

  describe('Entropy and Uniqueness Tests', () => {
    test('should generate unique IDs in rapid succession', () => {
      const ids = new Set();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        const id = generateSecureExecutionId('test');
        expect(ids.has(id)).toBe(false); // No duplicates
        ids.add(id);
      }
      
      expect(ids.size).toBe(iterations);
    });

    test('should have sufficient entropy in random components', () => {
      const ids = [];
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const id = generateSecureExecutionId('test');
        const randomPart = id.split('-')[2];
        ids.push(randomPart);
      }
      
      // Check for entropy - no duplicate random parts
      const uniqueRandomParts = new Set(ids);
      expect(uniqueRandomParts.size).toBe(iterations);
      
      // Check character distribution (basic entropy test)
      const combinedRandom = ids.join('');
      const charCounts = {};
      for (const char of combinedRandom) {
        charCounts[char] = (charCounts[char] || 0) + 1;
      }
      
      // Should have reasonable distribution of hex characters
      const hexChars = '0123456789abcdef';
      for (const char of hexChars) {
        expect(charCounts[char]).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle crypto failures gracefully', () => {
      // Mock crypto failure
      const originalRandomBytes = require('crypto').randomBytes;
      require('crypto').randomBytes = () => {
        throw new Error('Crypto failure');
      };
      
      try {
        expect(() => generateSecureExecutionId('test')).toThrow('Cryptographic random generation failed');
      } finally {
        // Restore original function
        require('crypto').randomBytes = originalRandomBytes;
      }
    });
  });

  describe('Performance Tests', () => {
    test('should generate IDs efficiently', () => {
      const startTime = Date.now();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        generateSecureExecutionId('perf');
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should generate 1000 IDs in less than 1 second
      expect(duration).toBeLessThan(1000);
      
      // Average should be less than 1ms per ID
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(1);
    });
  });
});

describe('Security Integration Tests', () => {
  test('should work with real crypto module', () => {
    // Test that we're actually using Node.js crypto
    const crypto = require('crypto');
    const originalRandomBytes = crypto.randomBytes;
    
    let cryptoWasCalled = false;
    crypto.randomBytes = (size: number) => {
      cryptoWasCalled = true;
      return originalRandomBytes(size);
    };
    
    try {
      generateSecureExecutionId('test');
      expect(cryptoWasCalled).toBe(true);
    } finally {
      crypto.randomBytes = originalRandomBytes;
    }
  });

  test('should be compatible with existing ID patterns', () => {
    // Test that our new IDs work with existing parsing logic
    const executionId = generateSecureExecutionId('async');
    const correlationId = generateSecureCorrelationId('xai_summary');
    const requestId = generateSecureRequestId('opt');
    
    // Should match expected patterns from the codebase
    expect(executionId).toMatch(/^async-\d+-[a-f0-9]+$/);
    expect(correlationId).toMatch(/^xai_summary_\d+_[a-f0-9]+$/);
    expect(requestId).toMatch(/^opt_\d+_[a-f0-9]+$/);
  });
});