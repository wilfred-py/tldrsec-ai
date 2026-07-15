/**
 * TrialService - LEGACY: Trial status for grandfathered users only
 *
 * As of the CC-required trial launch, NEW users' trial lifecycle is managed
 * entirely by Stripe (trial_period_days on the checkout session). Stripe
 * handles trial start, expiry, card charging, and subscription activation.
 *
 * This service remains for users who signed up BEFORE the CC-trial launch:
 * - Grandfathered FREE users (NULL trial dates) - always active
 * - Legacy trial users (isTrialing + trialEndsAt) - active until expiry
 * - Paid users (PRO/MAX) - always active (handled here for completeness)
 *
 * Do NOT add new trial logic here. New trial features should use Stripe's
 * subscription lifecycle (status: 'trialing' → 'active' → 'past_due').
 */

import { getPrismaClient } from '@/lib/db/prisma';
import { isActiveTrial } from './tier-eligibility';

/**
 * Single source of truth for trial-related configuration.
 * Referenced by: Clerk webhook (IP abuse gate), checkout route (Stripe
 * trial_period_days), and this module's own calculateTrialEnd.
 */
export const TRIAL_CONFIG = {
  /** Duration of trial period in days */
  TRIAL_DURATION_DAYS: 7,

  /** Maximum trial signups allowed per IP address within the window */
  MAX_TRIALS_PER_IP: 3,

  /** IP abuse prevention window in days */
  IP_WINDOW_DAYS: 30,
} as const;

export interface TrialStatus {
  isActive: boolean;
  daysRemaining: number;
  trialEndsAt: Date | null;
  isGrandfathered: boolean;
}

export class TrialService {
  /**
   * Compute trial status from already-fetched user data (no DB call).
   * Use this when the caller already has the user row to avoid a duplicate query.
   */
  static checkTrialStatusFromUser(user: {
    subscriptionTier: string | null;
    trialEndsAt: Date | null;
    trialStartedAt: Date | null;
    isTrialing: boolean | null;
  } | null): TrialStatus {
    if (!user) {
      // User exists in Clerk but not yet in DB (created on first tickers fetch).
      // Return active/grandfathered so the subscription endpoint doesn't 500.
      return {
        isActive: true,
        daysRemaining: Infinity,
        trialEndsAt: null,
        isGrandfathered: true,
      };
    }

    // Paid users (PRO/MAX) - always active
    if (user.subscriptionTier === 'PRO' || user.subscriptionTier === 'MAX') {
      return {
        isActive: true,
        daysRemaining: Infinity,
        trialEndsAt: null,
        isGrandfathered: false,
      };
    }

    // Grandfathered free users (no trial dates at all) - always active
    if (user.subscriptionTier === 'FREE' && !user.trialStartedAt && !user.trialEndsAt) {
      return {
        isActive: true,
        daysRemaining: Infinity,
        trialEndsAt: null,
        isGrandfathered: true,
      };
    }

    // Trial users - check expiration
    if (user.trialEndsAt) {
      const now = new Date();
      const daysRemaining = Math.ceil(
        (user.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        // Legacy semantics: presence of trialEndsAt was treated as "in trial",
        // ignoring user.isTrialing. Preserve that here, but gain the 5-min grace.
        isActive: isActiveTrial({ isTrialing: true, trialEndsAt: user.trialEndsAt }),
        daysRemaining,
        trialEndsAt: user.trialEndsAt,
        isGrandfathered: false,
      };
    }

    // Fallback: FREE user with trialStartedAt but no trialEndsAt (shouldn't happen)
    return {
      isActive: false,
      daysRemaining: 0,
      trialEndsAt: null,
      isGrandfathered: false,
    };
  }

  /**
   * Check trial status for a user by querying the database.
   * Returns status for trial users, grandfathered users, and paid users.
   */
  static async checkTrialStatus(userId: string): Promise<TrialStatus> {
    const prisma = getPrismaClient();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { authProviderId: userId },
        ],
      },
      select: {
        subscriptionTier: true,
        trialEndsAt: true,
        trialStartedAt: true,
        isTrialing: true,
      },
    });

    return TrialService.checkTrialStatusFromUser(user);
  }

  /**
   * Calculate trial end date from a start date.
   */
  static calculateTrialEnd(startDate: Date): Date {
    return new Date(
      startDate.getTime() + TRIAL_CONFIG.TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000
    );
  }

  /**
   * Batch check trial status for multiple users.
   * Used by email delivery gate to pre-fetch status.
   */
  static async batchCheckTrialStatus(
    userIds: string[]
  ): Promise<Map<string, TrialStatus>> {
    const prisma = getPrismaClient();

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        subscriptionTier: true,
        trialEndsAt: true,
        trialStartedAt: true,
        isTrialing: true,
      },
    });

    const statusMap = new Map<string, TrialStatus>();
    const now = new Date();

    for (const user of users) {
      if (user.subscriptionTier === 'PRO' || user.subscriptionTier === 'MAX') {
        statusMap.set(user.id, {
          isActive: true,
          daysRemaining: Infinity,
          trialEndsAt: null,
          isGrandfathered: false,
        });
      } else if (user.subscriptionTier === 'FREE' && !user.trialStartedAt && !user.trialEndsAt) {
        statusMap.set(user.id, {
          isActive: true,
          daysRemaining: Infinity,
          trialEndsAt: null,
          isGrandfathered: true,
        });
      } else if (user.trialEndsAt) {
        const daysRemaining = Math.ceil(
          (user.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        statusMap.set(user.id, {
          isActive: isActiveTrial({ isTrialing: true, trialEndsAt: user.trialEndsAt }),
          daysRemaining,
          trialEndsAt: user.trialEndsAt,
          isGrandfathered: false,
        });
      } else {
        statusMap.set(user.id, {
          isActive: false,
          daysRemaining: 0,
          trialEndsAt: null,
          isGrandfathered: false,
        });
      }
    }

    return statusMap;
  }
}
