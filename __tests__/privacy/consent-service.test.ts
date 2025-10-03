/**
 * Tests for privacy consent service functionality
 * Tests GDPR compliance, consent management, and data protection
 */

import { PrivacyConsentService, ConsentType, ConsentMethod } from '@/lib/privacy/consent-service';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn()
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

jest.mock('@/lib/security/validation', () => ({
  validateUserId: jest.fn(),
  sanitizeForLogging: jest.fn((input) => `${input.substring(0, 8)}...`)
}));

// Import mocked modules
import { prisma } from '@/lib/db';
import { validateUserId } from '@/lib/security/validation';

const mockPrisma = prisma as any;
const mockValidateUserId = validateUserId as jest.MockedFunction<typeof validateUserId>;

describe('PrivacyConsentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cache before each test
    PrivacyConsentService.cleanupExpiredCache();
  });

  describe('checkAnalyticsConsent', () => {
    const validUserId = 'user_2abcdefghijklmnopqrstuv';

    test('should return false for non-existent user', async () => {
      mockValidateUserId.mockImplementation(() => {}); // Valid user ID
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await PrivacyConsentService.checkAnalyticsConsent(validUserId);

      expect(result.hasConsent).toBe(false);
      expect(result.error).toBe('User not found');
      expect(result.consentRecord).toBeUndefined();
    });

    test('should return false for user who explicitly opted out', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: validUserId,
        analyticsOptOut: true,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date('2024-01-01')
      });

      const result = await PrivacyConsentService.checkAnalyticsConsent(validUserId);

      expect(result.hasConsent).toBe(false);
      expect(result.consentRecord).toBeDefined();
      expect(result.consentRecord?.consentGiven).toBe(false);
      expect(result.consentRecord?.consentType).toBe(ConsentType.ANALYTICS_TRACKING);
      expect(result.consentRecord?.consentMethod).toBe(ConsentMethod.SETTINGS_UPDATE);
    });

    test('should return false by default for privacy-first approach', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: validUserId,
        analyticsOptOut: false,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date('2024-01-01')
      });

      const result = await PrivacyConsentService.checkAnalyticsConsent(validUserId);

      expect(result.hasConsent).toBe(false); // Conservative default
      expect(result.consentRecord).toBeDefined();
      expect(result.consentRecord?.consentMethod).toBe(ConsentMethod.MIGRATION_DEFAULT);
    });

    test('should cache consent results for performance', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: validUserId,
        analyticsOptOut: false,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date()
      });

      // First call
      await PrivacyConsentService.checkAnalyticsConsent(validUserId);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await PrivacyConsentService.checkAnalyticsConsent(validUserId);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    test('should handle database errors gracefully', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const result = await PrivacyConsentService.checkAnalyticsConsent(validUserId);

      expect(result.hasConsent).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    test('should handle invalid user ID errors', async () => {
      mockValidateUserId.mockImplementation(() => {
        throw new Error('Invalid user ID format');
      });

      const result = await PrivacyConsentService.checkAnalyticsConsent('invalid-id');

      expect(result.hasConsent).toBe(false);
      expect(result.error).toBe('Invalid user ID format');
    });

    test('should handle missing privacy policy version gracefully', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: validUserId,
        analyticsOptOut: false,
        privacyPolicyVersion: null,
        privacyPolicyAcceptedAt: null
      });

      const result = await PrivacyConsentService.checkAnalyticsConsent(validUserId);

      expect(result.hasConsent).toBe(false);
      expect(result.consentRecord?.consentVersion).toBe('1.0'); // Default version
    });
  });

  describe('recordConsent', () => {
    const validUserId = 'user_2abcdefghijklmnopqrstuv';

    test('should record analytics consent successfully', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.update.mockResolvedValue({});

      const success = await PrivacyConsentService.recordConsent(
        validUserId,
        ConsentType.ANALYTICS_TRACKING,
        true,
        {
          method: ConsentMethod.ONBOARDING,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          consentVersion: '1.1'
        }
      );

      expect(success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUserId },
        data: {
          analyticsOptOut: false, // Consent given = not opted out
          privacyPolicyVersion: '1.1',
          privacyPolicyAcceptedAt: expect.any(Date)
        }
      });
    });

    test('should record consent revocation successfully', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.update.mockResolvedValue({});

      const success = await PrivacyConsentService.recordConsent(
        validUserId,
        ConsentType.ANALYTICS_TRACKING,
        false,
        {
          method: ConsentMethod.SETTINGS_UPDATE
        }
      );

      expect(success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUserId },
        data: {
          analyticsOptOut: true, // Consent revoked = opted out
          privacyPolicyVersion: '1.0', // Default version
          privacyPolicyAcceptedAt: expect.any(Date)
        }
      });
    });

    test('should clear cache when recording consent', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: validUserId,
        analyticsOptOut: false,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date()
      });
      mockPrisma.user.update.mockResolvedValue({});

      // Prime the cache
      await PrivacyConsentService.checkAnalyticsConsent(validUserId);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);

      // Record consent (should clear cache)
      await PrivacyConsentService.recordConsent(
        validUserId,
        ConsentType.ANALYTICS_TRACKING,
        true,
        { method: ConsentMethod.SETTINGS_UPDATE }
      );

      // Next check should hit database again
      await PrivacyConsentService.checkAnalyticsConsent(validUserId);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    test('should handle database errors in consent recording', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.update.mockRejectedValue(new Error('Database error'));

      const success = await PrivacyConsentService.recordConsent(
        validUserId,
        ConsentType.ANALYTICS_TRACKING,
        true,
        { method: ConsentMethod.SETTINGS_UPDATE }
      );

      expect(success).toBe(false);
    });

    test('should handle invalid user ID in consent recording', async () => {
      mockValidateUserId.mockImplementation(() => {
        throw new Error('Invalid user ID format');
      });

      const success = await PrivacyConsentService.recordConsent(
        'invalid-id',
        ConsentType.ANALYTICS_TRACKING,
        true,
        { method: ConsentMethod.SETTINGS_UPDATE }
      );

      expect(success).toBe(false);
    });
  });

  describe('hasOptedOutOfAnalytics', () => {
    test('should return true when user has no consent', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_2abcdefghijklmnopqrstuv',
        analyticsOptOut: true,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date()
      });

      const hasOptedOut = await PrivacyConsentService.hasOptedOutOfAnalytics('user_2abcdefghijklmnopqrstuv');

      expect(hasOptedOut).toBe(true);
    });

    test('should return true by default for privacy-first approach', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_2abcdefghijklmnopqrstuv',
        analyticsOptOut: false,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: new Date()
      });

      const hasOptedOut = await PrivacyConsentService.hasOptedOutOfAnalytics('user_2abcdefghijklmnopqrstuv');

      expect(hasOptedOut).toBe(true); // Conservative default
    });

    test('should return true on errors for safety', async () => {
      mockValidateUserId.mockImplementation(() => {
        throw new Error('Invalid user ID');
      });

      const hasOptedOut = await PrivacyConsentService.hasOptedOutOfAnalytics('invalid-id');

      expect(hasOptedOut).toBe(true);
    });
  });

  describe('getUserPrivacyPreferences', () => {
    test('should return user privacy preferences', async () => {
      mockValidateUserId.mockImplementation(() => {});
      const acceptedAt = new Date('2024-01-01');
      mockPrisma.user.findUnique.mockResolvedValue({
        analyticsOptOut: false,
        privacyPolicyVersion: '1.1',
        privacyPolicyAcceptedAt: acceptedAt
      });

      const preferences = await PrivacyConsentService.getUserPrivacyPreferences('user_2abcdefghijklmnopqrstuv');

      expect(preferences).toEqual({
        analyticsConsent: true, // not opted out
        privacyPolicyVersion: '1.1',
        privacyPolicyAcceptedAt: acceptedAt
      });
    });

    test('should return defaults for non-existent user', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const preferences = await PrivacyConsentService.getUserPrivacyPreferences('user_2abcdefghijklmnopqrstuv');

      expect(preferences).toEqual({
        analyticsConsent: false,
        privacyPolicyVersion: '1.0',
        privacyPolicyAcceptedAt: null,
        error: 'User not found'
      });
    });

    test('should handle missing privacy policy data', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        analyticsOptOut: false,
        privacyPolicyVersion: null,
        privacyPolicyAcceptedAt: null
      });

      const preferences = await PrivacyConsentService.getUserPrivacyPreferences('user_2abcdefghijklmnopqrstuv');

      expect(preferences).toEqual({
        analyticsConsent: true,
        privacyPolicyVersion: '1.0', // Default
        privacyPolicyAcceptedAt: null
      });
    });
  });

  describe('Cache Management', () => {
    test('should clear user consent cache', () => {
      // This test verifies that cache clearing doesn't throw errors
      expect(() => {
        PrivacyConsentService.clearUserConsentCache('user_2abcdefghijklmnopqrstuv');
      }).not.toThrow();
    });

    test('should cleanup expired cache entries', () => {
      // This test verifies that cache cleanup doesn't throw errors
      expect(() => {
        PrivacyConsentService.cleanupExpiredCache();
      }).not.toThrow();
    });
  });

  describe('GDPR Compliance', () => {
    test('should default to no consent for new users', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_2abcdefghijklmnopqrstuv',
        analyticsOptOut: false, // Not explicitly opted out
        privacyPolicyVersion: null, // No policy accepted yet
        privacyPolicyAcceptedAt: null
      });

      const result = await PrivacyConsentService.checkAnalyticsConsent('user_2abcdefghijklmnopqrstuv');

      expect(result.hasConsent).toBe(false); // GDPR requires explicit consent
    });

    test('should respect explicit opt-out decisions', async () => {
      mockValidateUserId.mockImplementation(() => {});
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

    test('should handle consent version tracking', async () => {
      mockValidateUserId.mockImplementation(() => {});
      mockPrisma.user.update.mockResolvedValue({});

      await PrivacyConsentService.recordConsent(
        'user_2abcdefghijklmnopqrstuv',
        ConsentType.ANALYTICS_TRACKING,
        true,
        {
          method: ConsentMethod.ONBOARDING,
          consentVersion: '2.0'
        }
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_2abcdefghijklmnopqrstuv' },
        data: {
          analyticsOptOut: false,
          privacyPolicyVersion: '2.0',
          privacyPolicyAcceptedAt: expect.any(Date)
        }
      });
    });
  });
});