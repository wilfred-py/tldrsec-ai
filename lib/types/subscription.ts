import type { PlanType } from '@/lib/stripe/plans';

/**
 * Shared UserSubscription type used across subscribe page, billing page,
 * and other components that consume the /api/user/subscription endpoint.
 */
export interface UserSubscription {
  planType: PlanType;
  isActive: boolean;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  isTrialing: boolean;
  daysRemaining: number;
  trialEndsAt: string | null;
  isGrandfathered: boolean;
}
