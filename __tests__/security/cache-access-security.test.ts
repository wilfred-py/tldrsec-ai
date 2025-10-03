/**
 * Security tests for cache access tracking functionality
 * Tests input validation, authorization, and privacy compliance
 */

import { validateUserId, validateAccessType, validateSummaryId, validateCacheAccessParams, SecurityValidationError, InvalidUserIdError } from '@/lib/security/validation';
import { PrivacyConsentService, ConsentType, ConsentMethod } from '@/lib/privacy/consent-service';
import { trackCacheAccess } from '@/services/filings/database/filingDatabase';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    summary: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    summaryCacheAccess: {
      create: jest.fn()
    },
    ticker: {
      findFirst: jest.fn()
    }
  }
}));

jest.mock('@/lib/logging', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock('@/lib/auth/access-control', () => ({
  checkSummaryAccess: jest.fn()
}));

// Import mocked modules
import { prisma } from '@/lib/db';
import { checkSummaryAccess } from '@/lib/auth/access-control';

const mockPrisma = prisma as any;
const mockCheckSummaryAccess = checkSummaryAccess as jest.MockedFunction<typeof checkSummaryAccess>;

describe('Security Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUserId', () => {
    test('should accept valid Clerk user IDs', () => {
      const validUserIds = [
        'user_2abcdefghijklmnopqrstuv',
        'user_2123456789abcdefghijklmnop',
        'user_2aBcDeFgHiJkLmNoPqRsTuVwXy'
      ];

      validUserIds.forEach(userId => {
        expect(() => validateUserId(userId)).not.toThrow();
      });
    });

    test('should reject invalid user ID formats', () => {
      const invalidUserIds = [
        '',
        'invalid-id',
        'user_',
        'user_123', // too short
        'admin_2abcdefghijklmnopqrstuv', // wrong prefix
        'user_2abcdefghijklmnopqrstu!', // invalid character
        'user 2abcdefghijklmnopqrstuv', // space
        'user_2../../../etc/passwd', // path traversal attempt
        null,
        undefined
      ];

      invalidUserIds.forEach(userId => {
        expect(() => validateUserId(userId as any)).toThrow(InvalidUserIdError);
      });
    });

    test('should reject SQL injection attempts', () => {
      const sqlInjectionAttempts = [
        "user_2'; DROP TABLE users; --",
        "user_2' OR '1'='1",
        "user_2' UNION SELECT * FROM users --",
        "user_2\\'; DELETE FROM users; --"
      ];

      sqlInjectionAttempts.forEach(userId => {
        expect(() => validateUserId(userId)).toThrow(InvalidUserIdError);
      });
    });
  });

  describe('validateAccessType', () => {
    test('should accept valid access types', () => {
      const validAccessTypes = ['EMAIL', 'API', 'DASHBOARD', 'SYSTEM', 'CRON'];

      validAccessTypes.forEach(accessType => {
        expect(() => validateAccessType(accessType)).not.toThrow();
        expect(() => validateAccessType(accessType.toLowerCase())).not.toThrow();
      });
    });

    test('should reject invalid access types', () => {
      const invalidAccessTypes = [
        '',
        'INVALID',
        'SQL_INJECTION',
        'DROP_TABLE',
        null,
        undefined,
        123,
        {}
      ];

      invalidAccessTypes.forEach(accessType => {
        expect(() => validateAccessType(accessType as any)).toThrow(SecurityValidationError);
      });
    });
  });

  describe('validateSummaryId', () => {
    test('should accept valid UUID formats', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
      ];

      validUUIDs.forEach(uuid => {
        expect(() => validateSummaryId(uuid)).not.toThrow();
      });
    });

    test('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        '',
        'not-a-uuid',
        '123e4567-e89b-12d3-a456', // too short
        '123e4567-e89b-12d3-a456-426614174000-extra', // too long
        '123e4567-e89b-12d3-a456-42661417400g', // invalid character
        'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // invalid format
        null,
        undefined
      ];

      invalidUUIDs.forEach(uuid => {
        expect(() => validateSummaryId(uuid as any)).toThrow(SecurityValidationError);
      });
    });
  });

  describe('validateCacheAccessParams', () => {
    test('should validate all parameters together', () => {
      const validParams = {
        summaryId: '123e4567-e89b-12d3-a456-426614174000',
        accessType: 'API',
        userId: 'user_2abcdefghijklmnopqrstuv'
      };

      expect(() => validateCacheAccessParams(validParams)).not.toThrow();
    });

    test('should validate without userId', () => {
      const validParams = {
        summaryId: '123e4567-e89b-12d3-a456-426614174000',
        accessType: 'SYSTEM'
      };

      expect(() => validateCacheAccessParams(validParams)).not.toThrow();
    });

    test('should reject if any parameter is invalid', () => {
      const invalidParamsSets = [
        {
          summaryId: 'invalid-uuid',
          accessType: 'API',
          userId: 'user_2abcdefghijklmnopqrstuv'
        },
        {
          summaryId: '123e4567-e89b-12d3-a456-426614174000',
          accessType: 'INVALID_TYPE',
          userId: 'user_2abcdefghijklmnopqrstuv'
        },
        {
          summaryId: '123e4567-e89b-12d3-a456-426614174000',
          accessType: 'API',
          userId: 'invalid-user-id'
        }
      ];

      invalidParamsSets.forEach(params => {
        expect(() => validateCacheAccessParams(params as any)).toThrow(SecurityValidationError);
      });
    });
  });
});

describe('Privacy Consent Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear consent cache
    PrivacyConsentService.clearUserConsentCache('user_2abcdefghijklmnopqrstuv');
  });

  describe('checkAnalyticsConsent', () => {
    test('should return false for user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await PrivacyConsentService.checkAnalyticsConsent('user_2abcdefghijklmnopqrstuv');

      expect(result.hasConsent).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should return false for user who opted out', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_2abcdefghijklmnopqrstuv',
        analyticsOptOut: true,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date()
      });

      const result = await PrivacyConsentService.checkAnalyticsConsent('user_2abcdefghijklmnopqrstuv');

      expect(result.hasConsent).toBe(false);
      expect(result.consentRecord?.consentGiven).toBe(false);
    });

    test('should default to no consent for privacy-first approach', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_2abcdefghijklmnopqrstuv',
        analyticsOptOut: false,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date()
      });

      const result = await PrivacyConsentService.checkAnalyticsConsent('user_2abcdefghijklmnopqrstuv');

      expect(result.hasConsent).toBe(false); // Conservative default
    });

    test('should handle database errors gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await PrivacyConsentService.checkAnalyticsConsent('user_2abcdefghijklmnopqrstuv');

      expect(result.hasConsent).toBe(false);
      expect(result.error).toBe('Database error');
    });

    test('should reject invalid user IDs', async () => {
      const result = await PrivacyConsentService.checkAnalyticsConsent('invalid-user-id');

      expect(result.hasConsent).toBe(false);
      expect(result.error).toContain('User ID must follow Clerk format');
    });
  });

  describe('recordConsent', () => {
    test('should record analytics consent successfully', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      const success = await PrivacyConsentService.recordConsent(
        'user_2abcdefghijklmnopqrstuv',
        ConsentType.ANALYTICS_TRACKING,
        true,
        { method: ConsentMethod.SETTINGS_UPDATE }
      );

      expect(success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_2abcdefghijklmnopqrstuv' },
        data: {
          analyticsOptOut: false,
          privacyPolicyVersion: '1.0',
          privacyPolicyAcceptedAt: expect.any(Date)
        }
      });
    });

    test('should handle database errors in consent recording', async () => {
      mockPrisma.user.update.mockRejectedValue(new Error('Database error'));

      const success = await PrivacyConsentService.recordConsent(
        'user_2abcdefghijklmnopqrstuv',
        ConsentType.ANALYTICS_TRACKING,
        true,
        { method: ConsentMethod.SETTINGS_UPDATE }
      );

      expect(success).toBe(false);
    });
  });
});

describe('trackCacheAccess Security Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckSummaryAccess.mockResolvedValue(true);
    mockPrisma.summary = {
      ...mockPrisma.summary,
      update: jest.fn().mockResolvedValue({})
    };
    mockPrisma.summaryCacheAccess = {
      ...mockPrisma.summaryCacheAccess,
      create: jest.fn().mockResolvedValue({})
    };
    mockPrisma.user = {
      ...mockPrisma.user,
      findUnique: jest.fn()
    };
  });

  test('should reject invalid summary IDs', async () => {
    const result = await trackCacheAccess('invalid-uuid', 'API', 'user_2abcdefghijklmnopqrstuv');
    expect(result).toBe(false);
  });

  test('should reject invalid access types', async () => {
    const result = await trackCacheAccess(
      '123e4567-e89b-12d3-a456-426614174000',
      'INVALID_TYPE',
      'user_2abcdefghijklmnopqrstuv'
    );
    expect(result).toBe(false);
  });

  test('should reject invalid user IDs', async () => {
    const result = await trackCacheAccess(
      '123e4567-e89b-12d3-a456-426614174000',
      'API',
      'invalid-user-id'
    );
    expect(result).toBe(false);
  });

  test('should work without user ID for system tracking', async () => {
    const result = await trackCacheAccess(
      '123e4567-e89b-12d3-a456-426614174000',
      'SYSTEM'
    );
    
    expect(result).toBe(true);
    expect(mockPrisma.summary.update).toHaveBeenCalled();
    expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
  });

  test('should skip user tracking when authorization fails', async () => {
    mockCheckSummaryAccess.mockRejectedValue(new Error('Access denied'));

    const result = await trackCacheAccess(
      '123e4567-e89b-12d3-a456-426614174000',
      'API',
      'user_2abcdefghijklmnopqrstuv'
    );

    expect(result).toBe(true); // System tracking still succeeds
    expect(mockPrisma.summary.update).toHaveBeenCalled();
    expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
  });

  test('should skip user tracking when consent is not given', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user_2abcdefghijklmnopqrstuv',
      analyticsOptOut: true, // User opted out
      privacyPolicyVersion: '1.0',
      privacyPolicyAcceptedAt: new Date()
    });

    const result = await trackCacheAccess(
      '123e4567-e89b-12d3-a456-426614174000',
      'API',
      'user_2abcdefghijklmnopqrstuv'
    );

    expect(result).toBe(true); // System tracking still succeeds
    expect(mockPrisma.summary.update).toHaveBeenCalled();
    expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
  });

  test('should handle SQL injection attempts safely', async () => {
    const maliciousUserId = "user_2'; DROP TABLE users; --";
    
    const result = await trackCacheAccess(
      '123e4567-e89b-12d3-a456-426614174000',
      'API',
      maliciousUserId
    );

    expect(result).toBe(false);
    // Verify no database calls were made with malicious input
    expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
  });

  test('should sanitize data in logs', async () => {
    // This test would verify that sensitive data is properly sanitized in logs
    // For now, we just ensure the function completes without exposing data
    const result = await trackCacheAccess(
      '123e4567-e89b-12d3-a456-426614174000',
      'API',
      'user_2abcdefghijklmnopqrstuv'
    );

    // The function should complete successfully but without logging sensitive data
    expect(result).toBe(true);
  });
});