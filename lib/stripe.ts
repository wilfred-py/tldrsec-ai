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

// Subscription plan configuration
export const SUBSCRIPTION_PLANS = {
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
  PREMIUM: {
    name: 'Premium',
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID || '',
    monthlyFilings: 1000,
    optimizationLevel: 'minimal',
    features: [
      'Premium filing summaries',
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

export interface SubscriptionPlan {
  name: string;
  priceId: string;
  monthlyFilings: number;
  optimizationLevel: string;
  features: string[];
}

// Utility functions
export function isStripeEnabled(): boolean {
  return stripe !== null && webhookSecret !== '';
}

export function getPlanConfig(planType: PlanType): SubscriptionPlan {
  return SUBSCRIPTION_PLANS[planType];
}

export function getAllPlans(): Record<PlanType, SubscriptionPlan> {
  return SUBSCRIPTION_PLANS;
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