/**
 * Tier utilities for cron processing
 *
 * Note: Budget tracking has been removed. OpenRouter handles credit limits.
 * This file now only contains tier normalization and batch size utilities.
 * See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md
 */

import { logger } from '../logging';
import type { SubscriptionTier } from './types';
import { TIER_BATCH_SIZES } from './types';

const tierLogger = logger.child('cron-tier-utils');

export class CronBudgetService {
  /**
   * Normalize subscription tiers for backward compatibility with legacy tiers
   * Maps old tier names to new simplified tier structure
   */
  static normalizeTier(tier: string): SubscriptionTier {
    const tierUpper = (tier || '').toUpperCase();

    // Map legacy tiers to new two-tier system (PRO and HOBBY)
    switch (tierUpper) {
      case 'INSTITUTION':
      case 'ENTERPRISE':
      case 'PROFESSIONAL':
        return 'PRO';
      case 'FREE':
        return 'HOBBY'; // Map FREE to HOBBY
      case 'HOBBY':
        return 'HOBBY';
      case 'PRO':
        return 'PRO';
      default:
        // Default unknown tiers to HOBBY for safety
        tierLogger.warn(`Unknown subscription tier: ${tier}, defaulting to HOBBY`);
        return 'HOBBY';
    }
  }

  /**
   * Get batch size limit for a subscription tier
   */
  static getBatchSizeForTier(tier: string): number {
    const normalizedTier = this.normalizeTier(tier);
    return TIER_BATCH_SIZES[normalizedTier] || TIER_BATCH_SIZES.HOBBY;
  }

  /**
   * Get processing limits summary for a tier
   */
  static getTierLimits(tier: string): {
    batchSize: number;
    normalizedTier: SubscriptionTier;
  } {
    const normalizedTier = this.normalizeTier(tier);

    return {
      batchSize: this.getBatchSizeForTier(normalizedTier),
      normalizedTier
    };
  }

  /**
   * Validate subscription tier compatibility
   */
  static validateTierCompatibility(
    expectedTier: string,
    actualTier: string
  ): { isValid: boolean; error?: string } {
    const normalizedExpected = this.normalizeTier(expectedTier);
    const normalizedActual = this.normalizeTier(actualTier);

    if (normalizedExpected !== normalizedActual) {
      return {
        isValid: false,
        error: `Subscription tier mismatch: expected ${normalizedExpected}, got ${normalizedActual}`
      };
    }

    return { isValid: true };
  }
}
