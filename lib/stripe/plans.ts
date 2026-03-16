/**
 * Stripe Subscription Plans - Client-Safe Configuration
 *
 * This file contains subscription plan definitions and utility functions
 * that can be safely imported by client components (no server-only env vars).
 */

// =============================================================================
// PREMIUM PRICING TIERS (2026) - $0 Free / $199 Pro / $349 Max
// =============================================================================
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Trial',
    monthlyPriceId: null,
    annualPriceId: null,
    monthlyPrice: 0,
    annualPrice: 0,
    tickerLimit: -1, // unlimited (same as MAX)
    filingTypes: ['ALL'] as const, // Trial users get all filing types to showcase full product
    emailFrequency: 'realtime' as const,
    features: [
      '**Unlimited** companies',
      'Real-time email alerts',
      'All SEC filing types',
      '7-day trial period',
      '**First** priority processing queue',
      'Dedicated support',
    ],
  },
  PRO: {
    name: 'Pro',
    monthlyPriceId: null, // Set at runtime on server
    annualPriceId: null,
    monthlyPrice: 199,
    annualPrice: 1990, // 17% savings (approximately 2 months free)
    tickerLimit: 25,
    filingTypes: ['ALL'] as const, // Upgraded to ALL filing types at $199
    emailFrequency: 'realtime' as const,
    features: [
      '**25** companies to track',
      'Real-time email alerts',
      'Priority processing queue',
      'All SEC filing types',
      'Email support',
    ],
  },
  MAX: {
    name: 'Max',
    monthlyPriceId: null, // Set at runtime on server
    annualPriceId: null,
    monthlyPrice: 349,
    annualPrice: 3490, // 17% savings (approximately 2 months free)
    tickerLimit: -1, // unlimited
    filingTypes: ['ALL'] as const,
    emailFrequency: 'realtime' as const,
    features: [
      '**Unlimited** companies',
      'Real-time email alerts',
      '**First** priority processing queue',
      'All SEC filing types',
      'Dedicated support',
    ],
  },
} as const;

// =============================================================================
// LEGACY PRICING TIERS - Kept for existing subscribers
// =============================================================================
export const LEGACY_SUBSCRIPTION_PLANS = {
  BASIC: {
    name: 'Basic',
    priceId: '',
    monthlyFilings: 50,
    optimizationLevel: 'balanced',
    features: [
      'Basic filing summaries',
      'Standard AI analysis',
      'Email notifications',
      'Balanced token optimization (85% reduction)',
    ],
  },
  PROFESSIONAL: {
    name: 'Professional',
    priceId: '',
    monthlyFilings: 200,
    optimizationLevel: 'conservative',
    features: [
      'Enhanced filing summaries',
      'Advanced AI analysis',
      'Priority email notifications',
      'Conservative token optimization (67% reduction)',
      'Detailed business context',
      'Comprehensive risk analysis',
    ],
  },
  MAX_LEGACY: {
    name: 'Max (Legacy)',
    priceId: '',
    monthlyFilings: 1000,
    optimizationLevel: 'minimal',
    features: [
      'Max filing summaries',
      'Maximum context preservation',
      'Real-time notifications',
      'Minimal token optimization (55% reduction)',
      'Complete financial statements',
      'Full business narratives',
      'Priority support',
    ],
  },
} as const;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
export type PlanType = keyof typeof SUBSCRIPTION_PLANS;
export type LegacyPlanType = keyof typeof LEGACY_SUBSCRIPTION_PLANS;
export type BillingInterval = 'monthly' | 'annual';

export interface NewSubscriptionPlan {
  name: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  monthlyPrice: number;
  annualPrice: number;
  tickerLimit: number;
  filingTypes: readonly string[];
  emailFrequency: 'weekly' | 'realtime';
  features: readonly string[];
}

export interface LegacySubscriptionPlan {
  name: string;
  priceId: string;
  monthlyFilings: number;
  optimizationLevel: string;
  features: readonly string[];
}

// =============================================================================
// CLIENT-SAFE UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate annual savings percentage for a given plan
 * @param planType - The subscription plan type
 * @returns Savings percentage (e.g., 17 for 17% savings)
 */
export function calculateSavingsPercentage(planType: PlanType): number {
  const plan = SUBSCRIPTION_PLANS[planType];
  if (!plan || plan.monthlyPrice === 0) return 0;

  const monthlyTotal = plan.monthlyPrice * 12;
  const annualPrice = plan.annualPrice;
  const savings = monthlyTotal - annualPrice;

  return Math.round((savings / monthlyTotal) * 100);
}

/**
 * Get plan configuration (client-safe - no price IDs)
 */
export function getPlanConfig(planType: PlanType): NewSubscriptionPlan {
  return SUBSCRIPTION_PLANS[planType];
}

/**
 * Get legacy plan configuration (client-safe)
 */
export function getLegacyPlanConfig(planType: LegacyPlanType): LegacySubscriptionPlan {
  return LEGACY_SUBSCRIPTION_PLANS[planType];
}

/**
 * Get all plans (client-safe)
 */
export function getAllPlans(): typeof SUBSCRIPTION_PLANS {
  return SUBSCRIPTION_PLANS;
}

/**
 * Calculate annual savings in dollars
 */
export function calculateAnnualSavings(planType: PlanType): number {
  const plan = SUBSCRIPTION_PLANS[planType];
  const monthlyTotal = plan.monthlyPrice * 12;
  return monthlyTotal - plan.annualPrice;
}
