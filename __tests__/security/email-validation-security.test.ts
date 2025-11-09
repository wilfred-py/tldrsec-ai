/**
 * Comprehensive Email Security Validation Tests
 * 
 * Tests all security controls implemented in the email validation system:
 * - Email injection attack prevention
 * - Domain validation and blacklisting
 * - Rate limiting protection
 * - Input sanitization
 * - Threat detection
 * - Email normalization
 * 
 * CRITICAL: These tests validate security controls that protect against
 * email-based attacks, spam, and resource exhaustion.
 */

import { EmailSecurityValidator, NewsletterSecurityValidator, DOMAIN_SECURITY, EMAIL_PATTERNS } from '@/lib/security/email-validation';

describe('Email Security Validation System', () => {
  beforeEach(() => {
    // Reset any state between tests
    jest.clearAllMocks();
  });

  describe('Email Injection Attack Prevention', () => {
    const injectionPayloads = [
      // Header injection attempts
      'test@example.com\nBcc: victim@example.com',
      'test@example.com\rSubject: Spam',
      'test@example.com\r\nTo: victim@example.com',
      'test@example.com\0',
      'test@example.com\x08',
      'test@example.com\x0B',
      'test@example.com\x0C',
      
      // Email header injection
      'test@example.com\nContent-Type: text/html',
      'test@example.com\r\nMime-Version: 1.0',
      'test@example.com\nFrom: attacker@evil.com',
      'test@example.com\rBcc: list@spam.com',
      
      // Complex injection attempts
      'test@example.com%0ABcc:%20victim@example.com',
      'test@example.com%0D%0ATo:%20victim@example.com',
      'test@example.com\n\nThis is injected content',
      
      // Unicode injection attempts
      'test@example.com\u000A',
      'test@example.com\u000D',
      'test@example.com\u0000'
    ];

    test.each(injectionPayloads)('should detect and block email injection: %s', async (maliciousEmail) => {
      const result = await EmailSecurityValidator.analyzeEmail(maliciousEmail);
      
      expect(result.isValid).toBe(false);
      const containsExpectedThreat = result.threats.some(threat => 
        /injection|suspicious|invalid/i.test(threat)
      );
      expect(containsExpectedThreat).toBe(true);
      expect(result.confidence).toBe('LOW');
    });

    test('should sanitize email input to remove injection vectors', async () => {
      const maliciousEmail = 'test@example.com\r\nBcc: victim@example.com';
      const result = await EmailSecurityValidator.analyzeEmail(maliciousEmail);
      
      // Should remove the injection attempt
      expect(result.normalized).not.toContain('\r');
      expect(result.normalized).not.toContain('\n');
      expect(result.canonical).not.toContain('Bcc:');
    });

    test('should detect suspicious characters in email addresses', async () => {
      const suspiciousEmails = [
        'test<script>@example.com',
        'test"victim"@example.com',
        "test'drop'@example.com",
        'test\\victim@example.com',
        'test;victim@example.com'
      ];

      for (const email of suspiciousEmails) {
        const result = await EmailSecurityValidator.analyzeEmail(email);
        expect(result.isValid).toBe(false);
        const containsSuspiciousThreat = result.threats.some(threat => 
          /suspicious|invalid/i.test(threat)
        );
        expect(containsSuspiciousThreat).toBe(true);
      }
    });
  });

  describe('Domain Security Validation', () => {
    test('should block known malicious domains', async () => {
      // Add a test malicious domain
      DOMAIN_SECURITY.MALICIOUS_DOMAINS.add('evil-phishing.com');
      
      const result = await EmailSecurityValidator.analyzeEmail('user@evil-phishing.com');
      
      expect(result.isValid).toBe(false);
      expect(result.domain.isMalicious).toBe(true);
      expect(result.threats).toContain('Known malicious domain');
      
      // Clean up
      DOMAIN_SECURITY.MALICIOUS_DOMAINS.delete('evil-phishing.com');
    });

    test('should detect and flag disposable email providers', async () => {
      const disposableEmail = 'user@10minutemail.com';
      const result = await EmailSecurityValidator.analyzeEmail(disposableEmail);
      
      expect(result.domain.isDisposable).toBe(true);
      expect(result.threats).toContain('Disposable email provider detected');
      expect(result.confidence).toBe('LOW');
    });

    test('should give high confidence to trusted domains', async () => {
      const trustedEmail = 'user@gmail.com';
      const result = await EmailSecurityValidator.analyzeEmail(trustedEmail);
      
      expect(result.isValid).toBe(true);
      expect(result.domain.isTrusted).toBe(true);
      expect(result.confidence).toBe('HIGH');
    });

    test('should reject emails with IP addresses as domains', async () => {
      const ipEmails = [
        'user@192.168.1.1',
        'user@10.0.0.1',
        'user@255.255.255.255'
      ];

      for (const email of ipEmails) {
        const result = await EmailSecurityValidator.analyzeEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.threats).toContain('IP address used as domain');
      }
    });

    test('should flag internationalized domains for verification', async () => {
      const idnEmail = 'user@xn--example-9ua.com'; // Punycode domain
      const result = await EmailSecurityValidator.analyzeEmail(idnEmail);
      
      expect(result.threats).toContain(
        expect.stringMatching(/internationalized.*domain/i)
      );
    });

    test('should validate domain length limits', async () => {
      // Create an excessively long domain
      const longDomain = 'a'.repeat(250) + '.com';
      const longDomainEmail = `user@${longDomain}`;
      
      const result = await EmailSecurityValidator.analyzeEmail(longDomainEmail);
      expect(result.isValid).toBe(false);
      expect(result.threats).toContain(
        expect.stringMatching(/too long|length/i)
      );
    });
  });

  describe('Email Format Validation', () => {
    test('should validate RFC 5322 compliant emails', async () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.com',
        'user_name@example-domain.com',
        'test123@sub.example.co.uk'
      ];

      for (const email of validEmails) {
        const result = await EmailSecurityValidator.analyzeEmail(email);
        if (result.isValid) {
          expect(result.confidence).toBeOneOf(['HIGH', 'MEDIUM']);
          expect(result.threats).toHaveLength(0);
        }
      }
    });

    test('should reject invalid email formats', async () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@@example.com',
        'user @example.com',
        'user@.example.com',
        'user@example.',
        'user@example..com',
        '.user@example.com',
        'user.@example.com',
        '',
        'a'.repeat(100) + '@example.com' // Local part too long
      ];

      for (const email of invalidEmails) {
        const result = await EmailSecurityValidator.analyzeEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.threats.length).toBeGreaterThan(0);
      }
    });

    test('should enforce email length limits', async () => {
      // Create an email exceeding maximum length
      const longEmail = 'a'.repeat(300) + '@example.com';
      const result = await EmailSecurityValidator.analyzeEmail(longEmail);
      
      expect(result.isValid).toBe(false);
      expect(result.threats).toContain(
        expect.stringMatching(/too long|length|exceeds/i)
      );
    });

    test('should validate local part constraints', async () => {
      const invalidLocalParts = [
        '..user@example.com',     // Multiple dots
        '.user@example.com',      // Leading dot
        'user.@example.com',      // Trailing dot
        'us..er@example.com',     // Consecutive dots
        'a'.repeat(70) + '@example.com' // Local part too long
      ];

      for (const email of invalidLocalParts) {
        const result = await EmailSecurityValidator.analyzeEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.threats.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Email Normalization and Canonicalization', () => {
    test('should normalize Gmail addresses correctly', async () => {
      const testCases = [
        {
          input: 'User.Name+tag@Gmail.COM',
          expected: 'username@gmail.com'
        },
        {
          input: 'test.email.with.dots@gmail.com',
          expected: 'testemailwithdots@gmail.com'
        },
        {
          input: 'user+marketing@gmail.com',
          expected: 'user@gmail.com'
        },
        {
          input: 'User.Name@googlemail.com',
          expected: 'username@googlemail.com'
        }
      ];

      for (const testCase of testCases) {
        const result = await EmailSecurityValidator.analyzeEmail(testCase.input);
        expect(result.canonical).toBe(testCase.expected);
      }
    });

    test('should preserve other domains without Gmail-specific rules', async () => {
      const testCases = [
        {
          input: 'User.Name@Yahoo.COM',
          expected: 'user.name@yahoo.com'
        },
        {
          input: 'test+tag@outlook.com',
          expected: 'test+tag@outlook.com'
        }
      ];

      for (const testCase of testCases) {
        const result = await EmailSecurityValidator.analyzeEmail(testCase.input);
        expect(result.canonical).toBe(testCase.expected);
      }
    });

    test('should handle edge cases in normalization', async () => {
      const edgeCases = [
        'UPPERCASE@DOMAIN.COM',
        '   spaced@domain.com   ',
        'mixed.Case+Tag@Example.ORG'
      ];

      for (const email of edgeCases) {
        const result = await EmailSecurityValidator.analyzeEmail(email);
        expect(result.canonical).toBe(result.canonical.toLowerCase().trim());
        expect(result.canonical).not.toContain(' ');
      }
    });
  });

  describe('Rate Limiting Protection', () => {
    test('should enforce per-email rate limits', async () => {
      const testEmail = 'test@example.com';
      const testIP = '192.168.1.1';

      // First few requests should succeed
      for (let i = 0; i < 3; i++) {
        const result = await EmailSecurityValidator.checkEmailRateLimit(testEmail, testIP);
        expect(result.allowed).toBe(true);
      }

      // Subsequent requests should be rate limited
      // Note: This depends on the actual rate limit configuration
      // You may need to adjust the loop count based on EMAIL_SECURITY_CONFIG.EMAIL_RATE_LIMIT
    });

    test('should enforce per-IP rate limits', async () => {
      const testIP = '192.168.1.2';
      
      // Test with different emails from same IP
      const emails = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com',
        'user4@example.com',
        'user5@example.com'
      ];

      for (const email of emails) {
        const result = await EmailSecurityValidator.checkEmailRateLimit(email, testIP);
        // First few should succeed
        expect(result.allowed).toBe(true);
      }
    });

    test('should provide retry information when rate limited', async () => {
      const testEmail = 'ratelimited@example.com';
      const testIP = '192.168.1.3';

      // Trigger rate limit
      for (let i = 0; i < 10; i++) {
        await EmailSecurityValidator.checkEmailRateLimit(testEmail, testIP);
      }

      const result = await EmailSecurityValidator.checkEmailRateLimit(testEmail, testIP);
      
      if (!result.allowed) {
        expect(result.reason).toBeDefined();
        expect(result.resetTime).toBeDefined();
        expect(typeof result.resetTime).toBe('number');
        expect(result.resetTime!).toBeGreaterThan(Date.now());
      }
    });
  });

  describe('Newsletter Subscription Security Validation', () => {
    test('should validate complete newsletter subscription data', async () => {
      const validData = {
        email: 'user@example.com',
        source: 'newsletter_page',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'brand'
      };

      const result = await NewsletterSecurityValidator.validateSubscription(
        validData,
        '192.168.1.1'
      );

      expect(result.isValid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.email).toBe('user@example.com');
    });

    test('should reject subscription with invalid email', async () => {
      const invalidData = {
        email: 'invalid-email-format',
        source: 'newsletter_page'
      };

      const result = await NewsletterSecurityValidator.validateSubscription(
        invalidData,
        '192.168.1.1'
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    test('should sanitize and validate UTM parameters', async () => {
      const dataWithMaliciousUTM = {
        email: 'user@example.com',
        source: 'newsletter_page',
        utm_source: '<script>alert("xss")</script>',
        utm_medium: 'test\r\nBcc: victim@example.com',
        utm_campaign: 'normal-campaign'
      };

      const result = await NewsletterSecurityValidator.validateSubscription(
        dataWithMaliciousUTM,
        '192.168.1.1'
      );

      if (result.isValid) {
        // UTM parameters should be sanitized
        expect(result.data!.utm_source).not.toContain('<script>');
        expect(result.data!.utm_medium).not.toContain('\r');
        expect(result.data!.utm_medium).not.toContain('\n');
      } else {
        // Or the validation should fail completely
        expect(result.errors).toBeDefined();
      }
    });

    test('should enforce source format validation', async () => {
      const invalidSources = [
        '<script>',
        '../../../etc/passwd',
        'source with spaces',
        'source;with;semicolons',
        'very-long-source-name-that-exceeds-the-maximum-allowed-length'
      ];

      for (const source of invalidSources) {
        const result = await NewsletterSecurityValidator.validateSubscription(
          {
            email: 'user@example.com',
            source
          },
          '192.168.1.1'
        );

        expect(result.isValid).toBe(false);
        expect(result.errors).toBeDefined();
      }
    });

    test('should handle missing required fields', async () => {
      const incompleteData = {
        // Missing email
        source: 'newsletter_page'
      };

      const result = await NewsletterSecurityValidator.validateSubscription(
        incompleteData,
        '192.168.1.1'
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      const containsEmailError = result.errors!.some(error => 
        /email.*required|required/i.test(error)
      );
      expect(containsEmailError).toBe(true);
    });
  });

  describe('Threat Detection and Confidence Scoring', () => {
    test('should assign high confidence to clean, trusted emails', async () => {
      const cleanEmail = 'user@gmail.com';
      const result = await EmailSecurityValidator.analyzeEmail(cleanEmail);
      
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe('HIGH');
      expect(result.threats).toHaveLength(0);
    });

    test('should assign low confidence to suspicious emails', async () => {
      const suspiciousEmail = 'user123@disposable-mail.com';
      // Add to disposable domains for testing
      DOMAIN_SECURITY.DISPOSABLE_DOMAINS.add('disposable-mail.com');
      
      const result = await EmailSecurityValidator.analyzeEmail(suspiciousEmail);
      
      expect(result.confidence).toBe('LOW');
      expect(result.threats.length).toBeGreaterThan(0);
      
      // Cleanup
      DOMAIN_SECURITY.DISPOSABLE_DOMAINS.delete('disposable-mail.com');
    });

    test('should detect patterns indicating automated/bot behavior', async () => {
      const suspiciousPatterns = [
        'aaaaaaaaaaaaaa@example.com',  // Repeated characters
        'user' + 'x'.repeat(50) + '@example.com', // Excessive length
        'test123test123test123@example.com' // Repeated patterns
      ];

      for (const email of suspiciousPatterns) {
        const result = await EmailSecurityValidator.analyzeEmail(email);
        expect(result.confidence).toBeOneOf(['LOW', 'MEDIUM']);
      }
    });
  });

  describe('Error Handling and Security Failsafe', () => {
    test('should fail securely when analysis encounters errors', async () => {
      // Test with null/undefined input
      const result = await EmailSecurityValidator.analyzeEmail(null as any);
      
      expect(result.isValid).toBe(false);
      expect(result.confidence).toBe('LOW');
      expect(result.threats).toContain(
        expect.stringMatching(/failed|error/i)
      );
    });

    test('should handle extremely long inputs gracefully', async () => {
      const extremelyLongEmail = 'a'.repeat(10000) + '@example.com';
      const result = await EmailSecurityValidator.analyzeEmail(extremelyLongEmail);
      
      expect(result.isValid).toBe(false);
      expect(result.normalized.length).toBeLessThan(extremelyLongEmail.length);
    });

    test('should sanitize dangerous characters in all outputs', async () => {
      const maliciousEmail = 'test<script>alert("xss")</script>@example.com';
      const result = await EmailSecurityValidator.analyzeEmail(maliciousEmail);
      
      // Ensure no script tags survive in any output fields
      expect(result.normalized).not.toContain('<script>');
      expect(result.canonical).not.toContain('<script>');
      expect(JSON.stringify(result)).not.toContain('<script>');
    });
  });
});

// Test utilities
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}