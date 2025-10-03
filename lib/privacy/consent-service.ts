/**
 * Privacy consent service for managing user analytics and data processing preferences
 * Provides GDPR-compliant consent management with graceful fallbacks
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logging';
import { validateUserId, sanitizeForLogging } from '@/lib/security/validation';

// Consent types for different data processing activities
export enum ConsentType {
  ANALYTICS_TRACKING = 'ANALYTICS_TRACKING',
  EMAIL_MARKETING = 'EMAIL_MARKETING',
  DATA_PROCESSING = 'DATA_PROCESSING',
  PERFORMANCE_MONITORING = 'PERFORMANCE_MONITORING'
}

// Consent collection methods for audit trail
export enum ConsentMethod {
  ONBOARDING = 'ONBOARDING',
  SETTINGS_UPDATE = 'SETTINGS_UPDATE',
  EXPLICIT_PROMPT = 'EXPLICIT_PROMPT',
  MIGRATION_DEFAULT = 'MIGRATION_DEFAULT'
}

export interface ConsentRecord {
  userId: string;
  consentType: ConsentType;
  consentGiven: boolean;
  consentDate: Date;
  consentMethod: ConsentMethod;
  consentVersion: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConsentCheckResult {
  hasConsent: boolean;
  consentRecord?: ConsentRecord;
  error?: string;
}

/**
 * Privacy consent service class
 * Manages user consent for analytics and data processing activities
 */
export class PrivacyConsentService {
  private static readonly DEFAULT_CONSENT_VERSION = '1.0';
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly consentCache = new Map<string, { result: ConsentCheckResult; expiry: number }>();

  /**
   * Check if user has given consent for analytics tracking
   * Returns false by default for privacy-first approach
   * @param userId The user ID to check consent for
   * @returns Promise<ConsentCheckResult> with consent status and details
   */
  static async checkAnalyticsConsent(userId: string): Promise<ConsentCheckResult> {
    try {
      // Validate user ID first
      validateUserId(userId);

      // Check cache first for performance
      const cacheKey = `${userId}:${ConsentType.ANALYTICS_TRACKING}`;
      const cached = this.consentCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        logger.debug('Analytics consent served from cache', {
          userId: sanitizeForLogging(userId),
          hasConsent: cached.result.hasConsent
        });
        return cached.result;
      }

      // Query database for consent record
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          analyticsOptOut: true,
          privacyPolicyVersion: true,
          privacyPolicyAcceptedAt: true
        }
      });

      if (!user) {
        const result: ConsentCheckResult = {
          hasConsent: false,
          error: 'User not found'
        };
        return result;
      }

      // Check if user has explicitly opted out of analytics
      if (user.analyticsOptOut === true) {
        const result: ConsentCheckResult = {
          hasConsent: false,
          consentRecord: {
            userId,
            consentType: ConsentType.ANALYTICS_TRACKING,
            consentGiven: false,
            consentDate: new Date(),
            consentMethod: ConsentMethod.SETTINGS_UPDATE,
            consentVersion: user.privacyPolicyVersion || this.DEFAULT_CONSENT_VERSION
          }
        };

        // Cache the result
        this.consentCache.set(cacheKey, {
          result,
          expiry: Date.now() + this.CACHE_TTL_MS
        });

        return result;
      }

      // For now, default to no consent for privacy-first approach
      // In the future, this will check a proper consent table
      const hasConsent = false; // Conservative default
      
      const result: ConsentCheckResult = {
        hasConsent,
        consentRecord: {
          userId,
          consentType: ConsentType.ANALYTICS_TRACKING,
          consentGiven: hasConsent,
          consentDate: user.privacyPolicyAcceptedAt || new Date(),
          consentMethod: ConsentMethod.MIGRATION_DEFAULT,
          consentVersion: user.privacyPolicyVersion || this.DEFAULT_CONSENT_VERSION
        }
      };

      // Cache the result
      this.consentCache.set(cacheKey, {
        result,
        expiry: Date.now() + this.CACHE_TTL_MS
      });

      logger.debug('Analytics consent check completed', {
        userId: sanitizeForLogging(userId),
        hasConsent,
        method: 'database_query'
      });

      return result;

    } catch (error) {
      logger.error('Analytics consent check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userId ? sanitizeForLogging(userId) : undefined
      });

      // Fail safe - no consent if we can't determine it
      return {
        hasConsent: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Record user consent for a specific type of data processing
   * @param userId The user ID
   * @param consentType The type of consent being recorded
   * @param consentGiven Whether consent was given or revoked
   * @param metadata Additional metadata about the consent collection
   * @returns Promise<boolean> indicating success
   */
  static async recordConsent(
    userId: string,
    consentType: ConsentType,
    consentGiven: boolean,
    metadata: {
      method: ConsentMethod;
      ipAddress?: string;
      userAgent?: string;
      consentVersion?: string;
    }
  ): Promise<boolean> {
    try {
      validateUserId(userId);

      // Update user record for analytics opt-out
      if (consentType === ConsentType.ANALYTICS_TRACKING) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            analyticsOptOut: !consentGiven,
            privacyPolicyVersion: metadata.consentVersion || this.DEFAULT_CONSENT_VERSION,
            privacyPolicyAcceptedAt: new Date()
          }
        });
      }

      // Clear cache for this user and consent type
      const cacheKey = `${userId}:${consentType}`;
      this.consentCache.delete(cacheKey);

      logger.info('User consent recorded successfully', {
        userId: sanitizeForLogging(userId),
        consentType,
        consentGiven,
        method: metadata.method,
        consentVersion: metadata.consentVersion || this.DEFAULT_CONSENT_VERSION
      });

      return true;

    } catch (error) {
      logger.error('Failed to record user consent', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userId ? sanitizeForLogging(userId) : undefined,
        consentType,
        consentGiven
      });

      return false;
    }
  }

  /**
   * Check if user has opted out of analytics entirely
   * @param userId The user ID to check
   * @returns Promise<boolean> true if user has opted out
   */
  static async hasOptedOutOfAnalytics(userId: string): Promise<boolean> {
    try {
      const consentResult = await this.checkAnalyticsConsent(userId);
      return !consentResult.hasConsent;
    } catch (error) {
      logger.warn('Failed to check analytics opt-out status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: sanitizeForLogging(userId)
      });
      
      // Fail safe - assume opted out if we can't determine
      return true;
    }
  }

  /**
   * Get user's privacy preferences summary
   * @param userId The user ID
   * @returns Promise with user's current privacy settings
   */
  static async getUserPrivacyPreferences(userId: string): Promise<{
    analyticsConsent: boolean;
    privacyPolicyVersion: string;
    privacyPolicyAcceptedAt: Date | null;
    error?: string;
  }> {
    try {
      validateUserId(userId);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          analyticsOptOut: true,
          privacyPolicyVersion: true,
          privacyPolicyAcceptedAt: true
        }
      });

      if (!user) {
        return {
          analyticsConsent: false,
          privacyPolicyVersion: this.DEFAULT_CONSENT_VERSION,
          privacyPolicyAcceptedAt: null,
          error: 'User not found'
        };
      }

      return {
        analyticsConsent: !user.analyticsOptOut,
        privacyPolicyVersion: user.privacyPolicyVersion || this.DEFAULT_CONSENT_VERSION,
        privacyPolicyAcceptedAt: user.privacyPolicyAcceptedAt
      };

    } catch (error) {
      logger.error('Failed to get user privacy preferences', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: sanitizeForLogging(userId)
      });

      return {
        analyticsConsent: false,
        privacyPolicyVersion: this.DEFAULT_CONSENT_VERSION,
        privacyPolicyAcceptedAt: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clear consent cache for a specific user
   * Useful when user updates their preferences
   * @param userId The user ID to clear cache for
   */
  static clearUserConsentCache(userId: string): void {
    try {
      const keysToDelete = Array.from(this.consentCache.keys()).filter(key => 
        key.startsWith(`${userId}:`)
      );
      
      keysToDelete.forEach(key => this.consentCache.delete(key));
      
      logger.debug('Cleared consent cache for user', {
        userId: sanitizeForLogging(userId),
        keysCleared: keysToDelete.length
      });
    } catch (error) {
      logger.warn('Failed to clear consent cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: sanitizeForLogging(userId)
      });
    }
  }

  /**
   * Clear all expired entries from the consent cache
   * Should be called periodically to prevent memory leaks
   */
  static cleanupExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.consentCache.entries()) {
      if (value.expiry <= now) {
        this.consentCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired consent cache entries', { cleaned });
    }
  }
}