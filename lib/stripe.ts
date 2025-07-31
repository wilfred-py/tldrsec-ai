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

// Price IDs for different subscription tiers
export const STRIPE_PRICE_IDS = {
  BASIC: process.env.STRIPE_BASIC_PRICE_ID,
  PROFESSIONAL: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
  PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID,
} as const;