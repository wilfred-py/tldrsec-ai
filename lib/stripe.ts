/**
 * Stripe configuration and client
 * Addresses infrastructure issue: missing Stripe integration
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not configured - Stripe features will be disabled');
}

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true,
}) : null;

// Stripe webhook configuration
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Price IDs for different subscription tiers (monthly and yearly)
export const STRIPE_PRICE_IDS = {
  BASIC_MONTHLY: process.env.STRIPE_BASIC_MONTHLY_PRICE_ID,
  BASIC_YEARLY: process.env.STRIPE_BASIC_YEARLY_PRICE_ID,
  PROFESSIONAL_MONTHLY: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID,
  PROFESSIONAL_YEARLY: process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
  PREMIUM_MONTHLY: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
  PREMIUM_YEARLY: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID,
} as const;

// Helper function to get price ID based on plan type and billing period
export function getPriceId(planType: 'BASIC' | 'PROFESSIONAL' | 'PREMIUM', billingPeriod: 'MONTHLY' | 'YEARLY'): string | undefined {
  const key = `${planType}_${billingPeriod}` as keyof typeof STRIPE_PRICE_IDS;
  return STRIPE_PRICE_IDS[key];
}