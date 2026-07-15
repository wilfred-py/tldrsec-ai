/**
 * Security Helpers Test Suite
 * 
 * Tests PII masking functions and race condition prevention for GDPR compliance.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  maskEmailForLogging,
  maskUserIdForLogging,
  maskEmailContentForLogging,
  createGDPRCompliantLogData,
  SecureEmailLogger
} from '../security-helpers';

describe('PII Masking Functions', () => {
  describe('maskEmailForLogging', () => {
    test('should mask email addresses properly', () => {
      expect(maskEmailForLogging('user@example.com')).toBe('us***r@example.com');
      expect(maskEmailForLogging('a@test.com')).toBe('a***@test.com');
      expect(maskEmailForLogging('ab@domain.org')).toBe('ab***@domain.org'); // 2 chars shows both
      expect(maskEmailForLogging('john.doe@company.com')).toBe('jo***e@company.com');
    });

    test('should handle invalid emails', () => {
      expect(maskEmailForLogging('')).toBe('[INVALID_EMAIL]');
      expect(maskEmailForLogging('invalid')).toBe('[MALFORMED_EMAIL]');
      expect(maskEmailForLogging('no-at-sign.com')).toBe('[MALFORMED_EMAIL]');
      expect(maskEmailForLogging(null as any)).toBe('[INVALID_EMAIL]');
      expect(maskEmailForLogging(undefined as any)).toBe('[INVALID_EMAIL]');
    });
  });

  describe('maskUserIdForLogging', () => {
    test('should mask user IDs properly', () => {
      expect(maskUserIdForLogging('abcd1234-5678-9012-3456-789012345678')).toBe('abcd1234****');
      expect(maskUserIdForLogging('short123')).toBe('shor****');
      expect(maskUserIdForLogging('ab')).toBe('ab');
    });

    test('should handle invalid user IDs', () => {
      expect(maskUserIdForLogging('')).toBe('[INVALID_USER_ID]');
      expect(maskUserIdForLogging(null as any)).toBe('[INVALID_USER_ID]');
      expect(maskUserIdForLogging(undefined as any)).toBe('[INVALID_USER_ID]');
    });
  });

  describe('maskEmailContentForLogging', () => {
    test('should mask PII in email content', () => {
      const content = 'Email user@example.com about phone 555-123-4567';
      const masked = maskEmailContentForLogging(content);
      expect(masked).toBe('Email [EMAIL_REDACTED] about phone [PHONE_REDACTED]');
    });

    test('should mask SSNs and credit card numbers', () => {
      const content = 'SSN: 123-45-6789 and CC: 4111-1111-1111-1111';
      const masked = maskEmailContentForLogging(content);
      expect(masked).toBe('SSN: [SSN_REDACTED] and CC: [CC_REDACTED]');
    });

    test('should truncate long content', () => {
      const longContent = 'a'.repeat(100);
      const masked = maskEmailContentForLogging(longContent, 20);
      expect(masked).toBe('a'.repeat(17) + '...');
    });

    test('should handle invalid content', () => {
      expect(maskEmailContentForLogging('')).toBe('[NO_CONTENT]');
      expect(maskEmailContentForLogging(null as any)).toBe('[NO_CONTENT]');
      expect(maskEmailContentForLogging(undefined as any)).toBe('[NO_CONTENT]');
    });
  });

  describe('createGDPRCompliantLogData', () => {
    test('should mask PII fields properly', () => {
      const originalData = {
        email: 'user@example.com',
        subject: 'Important Meeting Tomorrow',
        body: 'Call me at 555-123-4567',
        userId: 'abcd1234-5678-9012-3456-789012345678',
        to: ['user1@example.com', 'user2@example.com'],
        metadata: {
          email: 'nested@example.com',
          content: 'Some content with user@hidden.com'
        }
      };

      const sanitized = createGDPRCompliantLogData(originalData);

      expect(sanitized.email).toBe('us***r@example.com');
      expect(sanitized.subject).toMatch(/Important Meeting Tomorrow/);
      expect(sanitized.body).toMatch(/\[PHONE_REDACTED\]/);
      expect(sanitized.userId).toBe('abcd1234****');
      expect(sanitized.to).toEqual(['us***1@example.com', 'us***2@example.com']);
      expect(sanitized.metadata.email).toBe('ne***d@example.com');
      expect(sanitized.metadata.content).toMatch(/\[EMAIL_REDACTED\]/);
    });

    test('should preserve safe fields', () => {
      const originalData = {
        requestId: 'req-12345',
        jobId: 'job-67890',
        filingId: 'filing-abc123',
        ticker: 'TSLA',
        status: 'completed',
        timestamp: '2025-01-20T12:00:00Z'
      };

      const sanitized = createGDPRCompliantLogData(originalData);

      expect(sanitized.requestId).toBe('req-12345');
      expect(sanitized.jobId).toBe('job-67890');
      expect(sanitized.filingId).toBe('filing-abc123');
      expect(sanitized.ticker).toBe('TSLA');
      expect(sanitized.status).toBe('completed');
      expect(sanitized.timestamp).toBe('2025-01-20T12:00:00Z');
    });

    test('should handle unknown fields conservatively', () => {
      const originalData = {
        unknownEmail: 'user@example.com',
        unknownLongString: 'a'.repeat(100),
        unknownShortString: 'safe',
        unknownNumber: 42
      };

      const sanitized = createGDPRCompliantLogData(originalData);

      expect(sanitized.unknownEmail).toBe('us***r@example.com'); // Contains @
      expect(sanitized.unknownLongString).toMatch(/\.\.\.$/); // Truncated
      expect(sanitized.unknownShortString).toBe('safe'); // Preserved
      expect(sanitized.unknownNumber).toBe(42); // Preserved
    });
  });
});

describe('SecureEmailLogger', () => {
  let mockLogger: any;
  let secureLogger: SecureEmailLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    secureLogger = new SecureEmailLogger(mockLogger);
  });

  test('should mask PII in log calls', () => {
    const logData = {
      email: 'user@example.com',
      subject: 'Test Subject',
      userId: 'user123456789'
    };

    secureLogger.info('Test message', logData);

    expect(mockLogger.info).toHaveBeenCalledWith('Test message', {
      email: 'us***r@example.com',
      subject: 'Test Subject',
      userId: 'user1234****'
    });
  });

  test('should handle all log levels', () => {
    const logData = { email: 'test@example.com' };

    secureLogger.info('Info', logData);
    secureLogger.warn('Warn', logData);
    secureLogger.error('Error', logData);
    secureLogger.debug('Debug', logData);

    expect(mockLogger.info).toHaveBeenCalledWith('Info', { email: 'te***t@example.com' });
    expect(mockLogger.warn).toHaveBeenCalledWith('Warn', { email: 'te***t@example.com' });
    expect(mockLogger.error).toHaveBeenCalledWith('Error', { email: 'te***t@example.com' });
    expect(mockLogger.debug).toHaveBeenCalledWith('Debug', { email: 'te***t@example.com' });
  });

  test('should handle empty or undefined data', () => {
    secureLogger.info('Test message');
    secureLogger.warn('Test message', undefined);
    secureLogger.error('Test message', {});

    expect(mockLogger.info).toHaveBeenCalledWith('Test message', {});
    expect(mockLogger.warn).toHaveBeenCalledWith('Test message', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Test message', {});
  });
});

describe('Integration Tests', () => {
  test('should handle complex PII masking scenarios', () => {
    const complexLogData = {
      emailMessage: {
        to: 'sensitive@company.com',
        subject: 'Meeting with john.doe@partner.org scheduled',
        html: '<p>Please call 555-123-4567 or email backup@server.com</p>',
        text: 'Credit card ending in 4567 was charged.'
      },
      userInfo: {
        id: 'user-abcd1234-5678-9012',
        email: 'user@domain.com',
        phoneNumber: '555-987-6543'
      },
      metadata: {
        timestamp: '2025-01-20T12:00:00Z',
        requestId: 'req-safe-12345',
        nested: {
          email: 'deep@nested.com',
          content: 'SSN: 123-45-6789 detected'
        }
      }
    };

    const sanitized = createGDPRCompliantLogData(complexLogData);

    // Verify all PII is masked
    expect(JSON.stringify(sanitized)).not.toContain('sensitive@company.com');
    expect(JSON.stringify(sanitized)).not.toContain('john.doe@partner.org');
    expect(JSON.stringify(sanitized)).not.toContain('555-123-4567');
    expect(JSON.stringify(sanitized)).not.toContain('backup@server.com');
    expect(JSON.stringify(sanitized)).not.toContain('user@domain.com');
    expect(JSON.stringify(sanitized)).not.toContain('555-987-6543');
    expect(JSON.stringify(sanitized)).not.toContain('deep@nested.com');
    expect(JSON.stringify(sanitized)).not.toContain('123-45-6789');

    // Verify safe fields are preserved
    expect(sanitized.metadata.timestamp).toBe('2025-01-20T12:00:00Z');
    expect(sanitized.metadata.requestId).toBe('req-safe-12345');
  });
});