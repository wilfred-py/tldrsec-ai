/**
 * Stripe Configuration and Client - Server Only
 *
 * This file contains server-only Stripe client initialization and functions.
 * For client-safe plan constants, import from '@/lib/stripe/plans' instead.
 */

import Stripe from 'stripe';

// Re-export client-safe plan constants and types
export {
  SUBSCRIPTION_PLANS,
  LEGACY_SUBSCRIPTION_PLANS,
  calculateSavingsPercentage,
  getPlanConfig,
  getLegacyPlanConfig,
  getAllPlans,
  calculateAnnualSavings,
  type PlanType,
  type LegacyPlanType,
  type BillingInterval,
  type NewSubscriptionPlan,
  type LegacySubscriptionPlan,
} from './plans';

// =============================================================================
// SERVER-ONLY: Environment Validation
// =============================================================================

// Only validate and warn on server side
const isServer = typeof window === 'undefined';

const requiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  STRIPE_MAX_MONTHLY_PRICE_ID: process.env.STRIPE_MAX_MONTHLY_PRICE_ID,
} as const;

// Check for missing environment variables (server-side only)
if (isServer) {
  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.warn(`Missing Stripe environment variables: ${missingVars.join(', ')}`);
    console.warn('Stripe features will be disabled');
  }
}

// =============================================================================
// SERVER-ONLY: Stripe Client Initialization
// =============================================================================

// Initialize Stripe client (server-side only)
export const stripe = (isServer && requiredEnvVars.STRIPE_SECRET_KEY)
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
// SERVER-ONLY: Utility Functions
// =============================================================================

/**
 * Check if Stripe is properly configured (server-side only)
 */
export function isStripeEnabled(): boolean {
  return stripe !== null && webhookSecret !== '';
}

/**
 * Get price ID for a plan (requires server-side env vars)
 */
export function getPriceIdForPlan(
  planType: 'FREE' | 'PRO' | 'MAX',
  billingInterval: 'monthly' | 'annual'
): string | null {
  if (planType === 'FREE') return null;

  const priceIds: Record<string, Record<string, string | undefined>> = {
    PRO: {
      monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    },
    MAX: {
      monthly: process.env.STRIPE_MAX_MONTHLY_PRICE_ID,
      annual: process.env.STRIPE_MAX_ANNUAL_PRICE_ID,
    },
  };

  return priceIds[planType]?.[billingInterval] || null;
}

// =============================================================================
// SERVER-ONLY: Stripe API Functions
// =============================================================================

/**
 * Handle Stripe errors with proper typing
 */
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

/**
 * Validate webhook signature
 */
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

/**
 * Create checkout session
 */
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

/**
 * Create billing portal session
 */
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

/**
 * Create customer
 */
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

/**
 * Get customer
 */
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

/**
 * Get subscription
 */
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

/**
 * Cancel subscription
 */
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

/**
 * Retrieve a checkout session by ID (for post-redirect verification)
 */
export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
      return null;
    }
    throw error;
  }
}

/**
 * Update subscription
 */
export async function updateSubscription(
  subscriptionId: string,
  updates: Stripe.SubscriptionUpdateParams
): Promise<Stripe.Subscription> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  return await stripe.subscriptions.update(subscriptionId, updates);
}
