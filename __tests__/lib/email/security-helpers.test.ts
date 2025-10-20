/**
 * Security Helpers Test Suite
 * 
 * Comprehensive tests for PII masking, GDPR compliance, and distributed locking
 * These are critical security components that must be thoroughly tested
 */

jest.mock('../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

import {
  maskEmailForLogging,
  maskUserIdForLogging,
  maskEmailContentForLogging,
  createGDPRCompliantLogData,
  SecureEmailLogger,
  EmailQueueLock
} from '../../../lib/email/security-helpers';

describe('PII Masking Functions', () => {
  describe('maskEmailForLogging', () => {
    it('should mask standard email addresses correctly', () => {
      const testCases = [
        { input: 'user@example.com', expected: 'us***r@example.com' },
        { input: 'test@domain.org', expected: 'te***t@domain.org' },
        { input: 'admin@company.co.uk', expected: 'ad***n@company.co.uk' },
        { input: 'support@service.io', expected: 'su***t@service.io' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(maskEmailForLogging(input)).toBe(expected);
      });
    });

    it('should handle short email addresses', () => {
      const testCases = [
        { input: 'a@test.com', expected: 'a***@test.com' },
        { input: 'ab@test.com', expected: 'ab***@test.com' },
        { input: 'abc@test.com', expected: 'ab***c@test.com' },
        { input: 'abcd@test.com', expected: 'ab***d@test.com' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(maskEmailForLogging(input)).toBe(expected);
      });
    });

    it('should handle long email addresses', () => {
      const longLocalPart = 'verylongusernamethatexceedsnormallimits';
      const input = `${longLocalPart}@example.com`;
      const expected = `${longLocalPart.substring(0, 2)}***${longLocalPart[longLocalPart.length - 1]}@example.com`;
      
      expect(maskEmailForLogging(input)).toBe(expected);
    });

    it('should handle invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        'no-at-sign.com',
        '@no-local-part.com',
        'no-domain@',
        '',
        null,
        undefined
      ];

      invalidEmails.forEach(email => {
        const result = maskEmailForLogging(email as any);
        expect(['[INVALID_EMAIL]', '[MALFORMED_EMAIL]']).toContain(result);
      });
    });

    it('should handle special characters in email addresses', () => {
      const testCases = [
        { input: 'user+tag@example.com', expected: 'us***g@example.com' },
        { input: 'user.name@example.com', expected: 'us***e@example.com' },
        { input: 'user_name@example.com', expected: 'us***e@example.com' },
        { input: 'user-name@example.com', expected: 'us***e@example.com' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(maskEmailForLogging(input)).toBe(expected);
      });
    });

    it('should preserve domain information for debugging', () => {
      const testCases = [
        'user@gmail.com',
        'test@yahoo.co.uk', 
        'admin@company.internal',
        'support@subdomain.example.org'
      ];

      testCases.forEach(email => {
        const masked = maskEmailForLogging(email);
        const domain = email.split('@')[1];
        expect(masked).toContain(`@${domain}`);
      });
    });

    it('should handle error cases gracefully', () => {
      // Mock error in string processing
      const originalSplit = String.prototype.split;
      String.prototype.split = jest.fn(() => {
        throw new Error('Simulated error');
      });

      const result = maskEmailForLogging('test@example.com');
      expect(result).toBe('[EMAIL_MASK_ERROR]');

      // Restore original method
      String.prototype.split = originalSplit;
    });
  });

  describe('maskUserIdForLogging', () => {
    it('should mask standard user IDs correctly', () => {
      const testCases = [
        { input: 'user123456', expected: 'user1234****' },
        { input: 'admin789', expected: 'admi****' },
        { input: 'customer_001', expected: 'customer****' },
        { input: 'uuid-12345678-1234-5678-9abc-123456789012', expected: 'uuid-123****' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(maskUserIdForLogging(input)).toBe(expected);
      });
    });

    it('should preserve short user IDs', () => {
      const shortIds = ['usr', 'admin', 'test'];

      shortIds.forEach(id => {
        expect(maskUserIdForLogging(id)).toBe(id);
      });
    });

    it('should handle various user ID formats', () => {
      const testCases = [
        { input: 'user-123456789', expected: 'user-123****' },
        { input: 'AUTH0|user123', expected: 'AUTH0|us****' },
        { input: 'google_oauth_12345', expected: 'google_o****' },
        { input: 'facebook:123456789', expected: 'facebook****' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(maskUserIdForLogging(input)).toBe(expected);
      });
    });

    it('should handle invalid user IDs', () => {
      const invalidIds = ['', null, undefined, 123 as any];

      invalidIds.forEach(id => {
        expect(maskUserIdForLogging(id)).toBe('[INVALID_USER_ID]');
      });
    });

    it('should handle masking errors gracefully', () => {
      // Mock error in string processing
      const originalSubstring = String.prototype.substring;
      String.prototype.substring = jest.fn(() => {
        throw new Error('Simulated error');
      });

      const result = maskUserIdForLogging('test-user-id');
      expect(result).toBe('[USER_ID_MASK_ERROR]');

      // Restore original method
      String.prototype.substring = originalSubstring;
    });
  });

  describe('maskEmailContentForLogging', () => {
    it('should mask PII patterns in email content', () => {
      const content = 'Contact us at support@company.com or call 555-123-4567';
      const masked = maskEmailContentForLogging(content);

      expect(masked).toContain('[EMAIL_REDACTED]');
      expect(masked).toContain('[PHONE_REDACTED]');
      expect(masked).not.toContain('support@company.com');
      expect(masked).not.toContain('555-123-4567');
    });

    it('should mask various PII patterns', () => {
      const testCases = [
        {
          input: 'Email: user@domain.com, Phone: 555-123-4567',
          patterns: ['[EMAIL_REDACTED]', '[PHONE_REDACTED]']
        },
        {
          input: 'SSN: 123-45-6789, Credit Card: 4111-1111-1111-1111',
          patterns: ['[SSN_REDACTED]', '[CC_REDACTED]']
        },
        {
          input: 'Multiple emails: first@test.com, second@example.org',
          patterns: ['[EMAIL_REDACTED]']
        }
      ];

      testCases.forEach(({ input, patterns }) => {
        const masked = maskEmailContentForLogging(input);
        patterns.forEach(pattern => {
          expect(masked).toContain(pattern);
        });
      });
    });

    it('should truncate long content', () => {
      const longContent = 'x'.repeat(200);
      const maxLength = 50;
      const masked = maskEmailContentForLogging(longContent, maxLength);

      expect(masked.length).toBe(maxLength);
      expect(masked.endsWith('...')).toBe(true);
      expect(masked.substring(0, maxLength - 3)).toBe('x'.repeat(maxLength - 3));
    });

    it('should not add ellipsis for content within limit', () => {
      const shortContent = 'Short content';
      const maxLength = 50;
      const masked = maskEmailContentForLogging(shortContent, maxLength);

      expect(masked).toBe(shortContent);
      expect(masked).not.toContain('...');
    });

    it('should handle various phone number formats', () => {
      const phoneFormats = [
        '555-123-4567',
        '555.123.4567',
        '5551234567',
        '(555) 123-4567'
      ];

      phoneFormats.forEach(phone => {
        const content = `Call us at ${phone}`;
        const masked = maskEmailContentForLogging(content);
        expect(masked).toContain('[PHONE_REDACTED]');
        expect(masked).not.toContain(phone.replace(/[^\d]/g, ''));
      });
    });

    it('should handle various credit card formats', () => {
      const ccFormats = [
        '4111-1111-1111-1111',
        '4111 1111 1111 1111',
        '4111111111111111'
      ];

      ccFormats.forEach(cc => {
        const content = `Card number: ${cc}`;
        const masked = maskEmailContentForLogging(content);
        expect(masked).toContain('[CC_REDACTED]');
        expect(masked).not.toContain(cc);
      });
    });

    it('should handle invalid content gracefully', () => {
      const invalidContent = [null, undefined, '', 123 as any];

      invalidContent.forEach(content => {
        expect(maskEmailContentForLogging(content)).toBe('[NO_CONTENT]');
      });
    });

    it('should handle masking errors gracefully', () => {
      // Mock error in regex processing
      const originalReplace = String.prototype.replace;
      String.prototype.replace = jest.fn(() => {
        throw new Error('Simulated error');
      });

      const result = maskEmailContentForLogging('test content');
      expect(result).toBe('[CONTENT_MASK_ERROR]');

      // Restore original method
      String.prototype.replace = originalReplace;
    });
  });
});

describe('GDPR Compliant Logging', () => {
  describe('createGDPRCompliantLogData', () => {
    it('should sanitize all PII fields correctly', () => {
      const sensitiveData = {
        email: 'user@example.com',
        emailAddress: 'admin@company.com',
        to: 'recipient@domain.org',
        from: 'sender@service.io',
        cc: ['cc1@test.com', 'cc2@test.com'],
        bcc: 'bcc@hidden.com',
        userId: 'user123456789',
        user_id: 'admin987654321',
        id: 'record123456',
        subject: 'Confidential: Account Information',
        title: 'Private Document Title',
        phoneNumber: '555-123-4567',
        phone: '555.987.6543',
        body: 'Email body with user@email.com',
        content: 'Content with private info',
        html: '<p>HTML with secret@email.com</p>',
        text: 'Text with 123-45-6789 SSN'
      };

      const sanitized = createGDPRCompliantLogData(sensitiveData);

      // Check email masking
      expect(sanitized.email).toBe('us***r@example.com');
      expect(sanitized.emailAddress).toBe('ad***n@company.com');
      expect(sanitized.to).toBe('re***t@domain.org');
      expect(sanitized.from).toBe('se***r@service.io');
      expect(sanitized.bcc).toBe('bc***c@hidden.com');

      // Check array email masking
      expect(sanitized.cc).toEqual(['cc***1@test.com', 'cc***2@test.com']);

      // Check user ID masking
      expect(sanitized.userId).toBe('user1234****');
      expect(sanitized.user_id).toBe('admin987****');
      expect(sanitized.id).toBe('record12****');

      // Check content masking
      expect(sanitized.subject).toContain('Confidential');
      expect(sanitized.subject.length).toBeLessThanOrEqual(100);
      expect(sanitized.body).toContain('[EMAIL_REDACTED]');
      expect(sanitized.html).toContain('[EMAIL_REDACTED]');
      expect(sanitized.text).toContain('[SSN_REDACTED]');

      // Check phone masking
      expect(sanitized.phoneNumber).toContain('[PHONE_REDACTED]');
      expect(sanitized.phone).toContain('[PHONE_REDACTED]');
    });

    it('should preserve safe fields unchanged', () => {
      const safeData = {
        requestId: 'req-123456',
        jobId: 'job-789012',
        emailId: 'email-345678',
        filingId: 'filing-901234',
        summaryId: 'summary-567890',
        ticker: 'AAPL',
        formType: '10-K',
        priority: 5,
        status: 'PENDING',
        duration: 1500,
        attempts: 2,
        retryable: true,
        timestamp: '2023-12-01T10:00:00Z',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const sanitized = createGDPRCompliantLogData(safeData);

      Object.keys(safeData).forEach(key => {
        expect(sanitized[key]).toEqual(safeData[key]);
      });
    });

    it('should handle nested objects recursively', () => {
      const nestedData = {
        user: {
          email: 'nested@example.com',
          profile: {
            email: 'profile@test.com',
            contact: {
              phone: '555-123-4567',
              address: {
                email: 'deep@nested.com'
              }
            }
          }
        },
        metadata: {
          userEmail: 'meta@example.com',
          settings: {
            notifications: {
              email: 'notify@service.com'
            }
          }
        }
      };

      const sanitized = createGDPRCompliantLogData(nestedData);

      expect(sanitized.user.email).toBe('ne***d@example.com');
      expect(sanitized.user.profile.email).toBe('pr***e@test.com');
      expect(sanitized.user.profile.contact.phone).toContain('[PHONE_REDACTED]');
      expect(sanitized.user.profile.contact.address.email).toBe('de***p@nested.com');
      expect(sanitized.metadata.userEmail).toBe('me***a@example.com');
      expect(sanitized.metadata.settings.notifications.email).toBe('no***y@service.com');
    });

    it('should handle unknown fields conservatively', () => {
      const unknownData = {
        suspiciousEmail: 'secret@hidden.com',
        longString: 'x'.repeat(100),
        shortString: 'safe',
        randomField: 'random@email.com',
        normalField: 'normal value'
      };

      const sanitized = createGDPRCompliantLogData(unknownData);

      // Email-like unknown fields should be masked
      expect(sanitized.suspiciousEmail).toBe('se***t@hidden.com');
      expect(sanitized.randomField).toBe('ra***m@email.com');

      // Long strings should be truncated
      expect(sanitized.longString.length).toBeLessThanOrEqual(53); // 50 + '...'

      // Short safe strings should be preserved
      expect(sanitized.shortString).toBe('safe');
      expect(sanitized.normalField).toBe('normal value');
    });

    it('should handle invalid data types gracefully', () => {
      const invalidData = {
        email: 123 as any,
        emailArray: ['valid@email.com', 123 as any, null],
        userId: null as any,
        subject: false as any,
        metadata: 'not an object' as any,
        unknownArray: [1, 2, 3],
        unknownObject: { nested: 'value' }
      };

      const sanitized = createGDPRCompliantLogData(invalidData);

      expect(sanitized.email).toBe('[INVALID_EMAIL_TYPE]');
      expect(sanitized.emailArray).toEqual([
        'va***d@email.com',
        '[INVALID_EMAIL_ARRAY_ITEM]',
        '[INVALID_EMAIL_ARRAY_ITEM]'
      ]);
      expect(sanitized.userId).toBe('[INVALID_ID_TYPE]');
      expect(sanitized.subject).toBe('[INVALID_SUBJECT_TYPE]');
      expect(sanitized.metadata).toBe('not an object');
      expect(sanitized.unknownArray).toEqual([1, 2, 3]);
      expect(sanitized.unknownObject).toEqual({ nested: 'value' });
    });

    it('should handle circular references safely', () => {
      const circularData: any = {
        name: 'test',
        email: 'circular@test.com'
      };
      circularData.self = circularData;

      // Should not throw an error and should handle the circular reference
      expect(() => createGDPRCompliantLogData(circularData)).not.toThrow();
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

  it('should automatically sanitize data in info logs', () => {
    const sensitiveData = {
      email: 'user@example.com',
      userId: 'user123456',
      content: 'Sensitive content with secret@email.com'
    };

    secureLogger.info('Test message', sensitiveData);

    expect(mockLogger.info).toHaveBeenCalledWith('Test message', {
      email: 'us***r@example.com',
      userId: 'user1234****',
      content: 'Sensitive content with [EMAIL_REDACTED]'
    });
  });

  it('should automatically sanitize data in warn logs', () => {
    const sensitiveData = { email: 'warn@example.com' };

    secureLogger.warn('Warning message', sensitiveData);

    expect(mockLogger.warn).toHaveBeenCalledWith('Warning message', {
      email: 'wa***n@example.com'
    });
  });

  it('should automatically sanitize data in error logs', () => {
    const sensitiveData = { 
      email: 'error@example.com',
      phone: '555-123-4567'
    };

    secureLogger.error('Error message', sensitiveData);

    expect(mockLogger.error).toHaveBeenCalledWith('Error message', {
      email: 'er***r@example.com',
      phone: '[PHONE_REDACTED]'
    });
  });

  it('should automatically sanitize data in debug logs', () => {
    const sensitiveData = { userId: 'debug123456' };

    secureLogger.debug('Debug message', sensitiveData);

    expect(mockLogger.debug).toHaveBeenCalledWith('Debug message', {
      userId: 'debug123****'
    });
  });

  it('should handle logs without data', () => {
    secureLogger.info('Simple message');
    secureLogger.warn('Warning without data');
    secureLogger.error('Error without data');
    secureLogger.debug('Debug without data');

    expect(mockLogger.info).toHaveBeenCalledWith('Simple message', {});
    expect(mockLogger.warn).toHaveBeenCalledWith('Warning without data', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Error without data', {});
    expect(mockLogger.debug).toHaveBeenCalledWith('Debug without data', {});
  });

  it('should handle complex nested data', () => {
    const complexData = {
      user: {
        email: 'complex@example.com',
        settings: {
          notifications: {
            email: 'notify@service.com'
          }
        }
      },
      metadata: {
        requestId: 'req-123',
        timestamp: new Date()
      }
    };

    secureLogger.info('Complex data log', complexData);

    const sanitizedCall = mockLogger.info.mock.calls[0][1];
    expect(sanitizedCall.user.email).toBe('co***x@example.com');
    expect(sanitizedCall.user.settings.notifications.email).toBe('no***y@service.com');
    expect(sanitizedCall.metadata.requestId).toBe('req-123'); // Safe field preserved
  });
});

describe('EmailQueueLock', () => {
  beforeEach(() => {
    // Clear all active locks before each test
    const activeLocks = (EmailQueueLock as any).activeLocks;
    activeLocks.clear();
  });

  describe('Lock Acquisition', () => {
    it('should acquire lock successfully when none exists', () => {
      const result = EmailQueueLock.acquireLock('test-lock', 'process-1');
      expect(result).toBe(true);
    });

    it('should prevent second process from acquiring same lock', () => {
      const result1 = EmailQueueLock.acquireLock('test-lock', 'process-1');
      const result2 = EmailQueueLock.acquireLock('test-lock', 'process-2');

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should allow same process to re-acquire its own lock', () => {
      const result1 = EmailQueueLock.acquireLock('test-lock', 'process-1');
      const result2 = EmailQueueLock.acquireLock('test-lock', 'process-1');

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should acquire different locks independently', () => {
      const result1 = EmailQueueLock.acquireLock('lock-1', 'process-1');
      const result2 = EmailQueueLock.acquireLock('lock-2', 'process-2');

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe('Lock Release', () => {
    it('should release lock successfully', () => {
      EmailQueueLock.acquireLock('test-lock', 'process-1');
      EmailQueueLock.releaseLock('test-lock', 'process-1');

      // Should be able to acquire again
      const result = EmailQueueLock.acquireLock('test-lock', 'process-2');
      expect(result).toBe(true);
    });

    it('should not release lock held by different process', () => {
      EmailQueueLock.acquireLock('test-lock', 'process-1');
      EmailQueueLock.releaseLock('test-lock', 'process-2');

      // Original process should still hold the lock
      const result = EmailQueueLock.acquireLock('test-lock', 'process-2');
      expect(result).toBe(false);
    });

    it('should handle release of non-existent lock gracefully', () => {
      expect(() => {
        EmailQueueLock.releaseLock('non-existent', 'process-1');
      }).not.toThrow();
    });
  });

  describe('Lock Status and Timeout', () => {
    it('should detect locked status correctly', () => {
      EmailQueueLock.acquireLock('test-lock', 'process-1');
      
      expect(EmailQueueLock.isLocked('test-lock')).toBe(true);
      expect(EmailQueueLock.isLocked('non-existent-lock')).toBe(false);
    });

    it('should expire locks after timeout', () => {
      EmailQueueLock.acquireLock('test-lock', 'process-1');
      
      // Mock lock timestamp to be expired
      const activeLocks = (EmailQueueLock as any).activeLocks;
      const lock = activeLocks.get('test-lock');
      if (lock) {
        lock.timestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago (expired)
      }

      // Lock should be considered expired
      expect(EmailQueueLock.isLocked('test-lock')).toBe(false);
      
      // Should be able to acquire expired lock
      const result = EmailQueueLock.acquireLock('test-lock', 'process-2');
      expect(result).toBe(true);
    });

    it('should clean up expired locks during acquisition', () => {
      // Create multiple expired locks
      EmailQueueLock.acquireLock('lock-1', 'process-1');
      EmailQueueLock.acquireLock('lock-2', 'process-2');
      EmailQueueLock.acquireLock('lock-3', 'process-3');

      // Mock all locks to be expired
      const activeLocks = (EmailQueueLock as any).activeLocks;
      const expiredTime = Date.now() - (6 * 60 * 1000);
      
      for (const [key, lock] of activeLocks.entries()) {
        lock.timestamp = expiredTime;
      }

      // Acquiring new lock should clean up expired ones
      EmailQueueLock.acquireLock('new-lock', 'new-process');

      // Expired locks should be cleaned up
      expect(EmailQueueLock.isLocked('lock-1')).toBe(false);
      expect(EmailQueueLock.isLocked('lock-2')).toBe(false);
      expect(EmailQueueLock.isLocked('lock-3')).toBe(false);
      expect(EmailQueueLock.isLocked('new-lock')).toBe(true);
    });

    it('should provide accurate lock status for debugging', () => {
      const timestamp = Date.now();
      EmailQueueLock.acquireLock('debug-lock', 'debug-process');

      const status = EmailQueueLock.getLockStatus();
      
      expect(status['debug-lock']).toBeDefined();
      expect(status['debug-lock'].processId).toBe('debug-process');
      expect(status['debug-lock'].age).toBeGreaterThanOrEqual(0);
      expect(status['debug-lock'].age).toBeLessThan(1000); // Should be very recent
    });

    it('should return empty status when no locks exist', () => {
      const status = EmailQueueLock.getLockStatus();
      expect(status).toEqual({});
    });
  });

  describe('Concurrent Lock Operations', () => {
    it('should handle rapid lock acquisition attempts', () => {
      const results = [];
      const lockKey = 'rapid-test';

      // Simulate rapid attempts from different processes
      for (let i = 0; i < 10; i++) {
        results.push(EmailQueueLock.acquireLock(lockKey, `process-${i}`));
      }

      // Only first should succeed
      expect(results[0]).toBe(true);
      expect(results.slice(1).every(r => r === false)).toBe(true);
    });

    it('should handle lock cycling correctly', () => {
      const lockKey = 'cycle-test';

      // Process 1 acquires
      expect(EmailQueueLock.acquireLock(lockKey, 'process-1')).toBe(true);

      // Process 1 releases
      EmailQueueLock.releaseLock(lockKey, 'process-1');

      // Process 2 should be able to acquire
      expect(EmailQueueLock.acquireLock(lockKey, 'process-2')).toBe(true);

      // Process 2 releases
      EmailQueueLock.releaseLock(lockKey, 'process-2');

      // Process 3 should be able to acquire
      expect(EmailQueueLock.acquireLock(lockKey, 'process-3')).toBe(true);
    });

    it('should maintain lock consistency under stress', () => {
      const lockKey = 'stress-test';
      const processCount = 50;
      const operations = [];

      // Generate many concurrent operations
      for (let i = 0; i < processCount; i++) {
        operations.push({
          type: 'acquire',
          processId: `stress-process-${i}`
        });
      }

      // Execute operations
      const results = operations.map(op => 
        EmailQueueLock.acquireLock(lockKey, op.processId)
      );

      // Only one should succeed
      const successCount = results.filter(r => r === true).length;
      expect(successCount).toBe(1);
    });
  });

  describe('Lock Cleanup and Memory Management', () => {
    it('should not leak memory with many lock operations', () => {
      const activeLocks = (EmailQueueLock as any).activeLocks;
      const initialSize = activeLocks.size;

      // Create and release many locks
      for (let i = 0; i < 100; i++) {
        EmailQueueLock.acquireLock(`temp-lock-${i}`, 'temp-process');
        EmailQueueLock.releaseLock(`temp-lock-${i}`, 'temp-process');
      }

      // Map should not grow indefinitely
      expect(activeLocks.size).toBe(initialSize);
    });

    it('should handle expired lock cleanup efficiently', () => {
      const lockCount = 20;
      
      // Create many locks
      for (let i = 0; i < lockCount; i++) {
        EmailQueueLock.acquireLock(`cleanup-lock-${i}`, `process-${i}`);
      }

      // Expire all locks
      const activeLocks = (EmailQueueLock as any).activeLocks;
      const expiredTime = Date.now() - (6 * 60 * 1000);
      
      for (const [key, lock] of activeLocks.entries()) {
        lock.timestamp = expiredTime;
      }

      // Single lock acquisition should clean up all expired locks
      EmailQueueLock.acquireLock('cleanup-trigger', 'cleanup-process');

      // All expired locks should be cleaned up
      const remainingLocks = Array.from(activeLocks.keys()).filter(key => 
        key.startsWith('cleanup-lock-')
      );
      expect(remainingLocks).toHaveLength(0);
    });
  });
});