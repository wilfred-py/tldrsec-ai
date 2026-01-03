/**
 * Stripe Configuration and Client
 * Fresh implementation for subscription management
 */

import Stripe from 'stripe';

// Environment validation
const requiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
} as const;

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.warn(`Missing Stripe environment variables: ${missingVars.join(', ')}`);
  console.warn('Stripe features will be disabled');
}

// Initialize Stripe client
export const stripe = requiredEnvVars.STRIPE_SECRET_KEY
  ? new Stripe(requiredEnvVars.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia', // Latest stable API version
      typescript: true,
      telemetry: false, // Disable telemetry for production
      maxNetworkRetries: 3,
      timeout: 10000, // 10 second timeout
    })
  : null;

// Webhook configuration
export const webhookSecret = requiredEnvVars.STRIPE_WEBHOOK_SECRET || '';

// =============================================================================
// PREMIUM PRICING TIERS (2026) - $0 Free / $199 Pro / $349 Max
// =============================================================================
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    monthlyPriceId: null,
    annualPriceId: null,
    monthlyPrice: 0,
    annualPrice: 0,
    tickerLimit: 3,
    filingTypes: ['10-K', '10-Q'] as const, // Only annual/quarterly reports
    emailFrequency: 'weekly' as const,
    features: [
      '3 companies to track',
      'Weekly digest emails',
      '10-K and 10-Q summaries only',
      'Basic filing alerts',
    ],
  },
  PRO: {
    name: 'Pro',
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
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
    monthlyPriceId: process.env.STRIPE_MAX_MONTHLY_PRICE_ID || '',
    annualPriceId: process.env.STRIPE_MAX_ANNUAL_PRICE_ID || '',
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
    priceId: process.env.STRIPE_BASIC_PRICE_ID || '',
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
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
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
    priceId: process.env.STRIPE_MAX_PRICE_ID || '',
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

// Type definitions
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

// Utility functions
export function isStripeEnabled(): boolean {
  return stripe !== null && webhookSecret !== '';
}

export function getPlanConfig(planType: PlanType): NewSubscriptionPlan {
  return SUBSCRIPTION_PLANS[planType];
}

export function getLegacyPlanConfig(planType: LegacyPlanType): LegacySubscriptionPlan {
  return LEGACY_SUBSCRIPTION_PLANS[planType];
}

export function getAllPlans(): typeof SUBSCRIPTION_PLANS {
  return SUBSCRIPTION_PLANS;
}

export function getPriceIdForPlan(planType: PlanType, billingInterval: BillingInterval): string | null {
  const plan = SUBSCRIPTION_PLANS[planType];
  return billingInterval === 'annual' ? plan.annualPriceId : plan.monthlyPriceId;
}

export function calculateAnnualSavings(planType: PlanType): number {
  const plan = SUBSCRIPTION_PLANS[planType];
  const monthlyTotal = plan.monthlyPrice * 12;
  return monthlyTotal - plan.annualPrice;
}

export function calculateSavingsPercentage(planType: PlanType): number {
  const plan = SUBSCRIPTION_PLANS[planType];
  if (plan.monthlyPrice === 0) return 0;
  const monthlyTotal = plan.monthlyPrice * 12;
  return Math.round(((monthlyTotal - plan.annualPrice) / monthlyTotal) * 100);
}

// Stripe error handling
export function handleStripeError(error: unknown): {
  message: string;
  code?: string;
  statusCode: number;
} {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode || 500,
    };
  }

  return {
    message: 'An unexpected error occurred',
    statusCode: 500,
  };
}

// Validate webhook signature
export function validateWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event | null {
  if (!stripe || !webhookSecret) {
    console.error('Stripe or webhook secret not configured');
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error('Webhook signature validation failed:', error);
    return null;
  }
}

// Create checkout session
export async function createCheckoutSession({
  priceId,
  customerId,
  successUrl,
  cancelUrl,
  metadata = {},
}: {
  priceId: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    customer_update: customerId ? { address: 'auto' } : undefined,
  });

  return session;
}

// Create billing portal session
export async function createBillingPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}

// Create customer
export async function createCustomer({
  email,
  name,
  metadata = {},
}: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata,
  });

  return customer;
}

// Get customer
export async function getCustomer(customerId: string): Promise<Stripe.Customer | null> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer as Stripe.Customer;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
      return null;
    }
    throw error;
  }
}

// Get subscription
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
      return null;
    }
    throw error;
  }
}

// Cancel subscription
export async function cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<Stripe.Subscription> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  if (atPeriodEnd) {
    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  } else {
    return await stripe.subscriptions.cancel(subscriptionId);
  }
}

// Update subscription
export async function updateSubscription(
  subscriptionId: string,
  updates: Stripe.SubscriptionUpdateParams
): Promise<Stripe.Subscription> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  return await stripe.subscriptions.update(subscriptionId, updates);
}