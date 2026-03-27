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
 *
 * Supports CC-required trials via trialPeriodDays + paymentMethodCollection.
 * When trialPeriodDays is set, Stripe creates a subscription in 'trialing'
 * status and charges the card after the trial period ends.
 */
export async function createCheckoutSession({
  priceId,
  customerId,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
  trialPeriodDays,
  paymentMethodCollection,
  clientReferenceId,
}: {
  priceId: string;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  trialPeriodDays?: number;
  paymentMethodCollection?: 'always' | 'if_required';
  clientReferenceId?: string;
}): Promise<Stripe.Checkout.Session> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
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
  };

  if (customerId) {
    sessionParams.customer = customerId;
    sessionParams.customer_update = { address: 'auto' };
  } else if (customerEmail) {
    sessionParams.customer_email = customerEmail;
  }

  if (clientReferenceId) {
    sessionParams.client_reference_id = clientReferenceId;
  }

  if (trialPeriodDays) {
    sessionParams.subscription_data = {
      trial_period_days: trialPeriodDays,
    };
  }

  if (paymentMethodCollection) {
    sessionParams.payment_method_collection = paymentMethodCollection;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

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

/**
 * List active or trialing subscriptions for a Stripe customer.
 * Checks both statuses to prevent duplicate subscriptions when
 * CC-required trials create subs in 'trialing' status.
 */
export async function listActiveSubscriptions(
  customerId: string
): Promise<Stripe.Subscription[]> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const [active, trialing] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: 'active' }),
    stripe.subscriptions.list({ customer: customerId, status: 'trialing' }),
  ]);

  return [...active.data, ...trialing.data];
}

/**
 * Derive plan type from Stripe price ID.
 * Returns FREE if price ID doesn't match any configured plan.
 */
export function getPlanTypeFromPriceId(priceId: string | undefined): 'FREE' | 'PRO' | 'MAX' {
  if (!priceId) return 'FREE';

  const proMonthlyPriceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnualPriceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
  const maxMonthlyPriceId = process.env.STRIPE_MAX_MONTHLY_PRICE_ID;
  const maxAnnualPriceId = process.env.STRIPE_MAX_ANNUAL_PRICE_ID;

  if (priceId === proMonthlyPriceId || priceId === proAnnualPriceId) {
    return 'PRO';
  }
  if (priceId === maxMonthlyPriceId || priceId === maxAnnualPriceId) {
    return 'MAX';
  }

  return 'FREE';
}
