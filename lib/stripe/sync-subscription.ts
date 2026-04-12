/**
 * Shared subscription sync helpers.
 *
 * Single source of truth for:
 * - Upserting UserSubscription from Stripe data
 * - Syncing the denormalized User.subscriptionTier field
 *
 * Used by: webhook handlers, reconciliation, cleanup script, authenticated checkout recovery.
 */

import type Stripe from 'stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { getPlanTypeFromPriceId } from '@/lib/stripe';

/**
 * Extract billing period dates from a Stripe subscription.
 *
 * In Stripe API `basil` (2025-07-30), `current_period_start` and
 * `current_period_end` moved from `Subscription` to `SubscriptionItem`.
 */
export function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    start: new Date((item?.current_period_start ?? subscription.start_date) * 1000),
    end: new Date((item?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400) * 1000),
  };
}

/**
 * Sync User.subscriptionTier to match the given plan.
 *
 * Extracted from the webhook route so every call site uses
 * the same logic. Swallows errors so callers can fire-and-forget.
 *
 * @param userId - DB User.id (NOT Clerk authProviderId)
 */
export async function syncUserSubscriptionTier(
  userId: string,
  planType: 'FREE' | 'PRO' | 'MAX'
): Promise<void> {
  const prisma = getPrismaClient();
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: planType },
    });
    console.log(`[sync] User.subscriptionTier -> ${planType} for ${userId}`);
  } catch (error) {
    console.error(`[sync] Failed to sync User.subscriptionTier for ${userId}:`, error);
  }
}

/**
 * Upsert a UserSubscription record from Stripe subscription data
 * and sync User.subscriptionTier.
 *
 * @param userId       - DB User.id (NOT Clerk authProviderId)
 * @param subscription - Stripe Subscription object
 * @param customerId   - Stripe Customer ID
 */
export async function syncSubscriptionFromStripeData(
  userId: string,
  subscription: Stripe.Subscription,
  customerId: string
): Promise<{ planType: 'FREE' | 'PRO' | 'MAX' }> {
  const prisma = getPrismaClient();
  const priceId = subscription.items.data[0]?.price.id;
  const planType = getPlanTypeFromPriceId(priceId);
  const period = getSubscriptionPeriod(subscription);

  await prisma.userSubscription.upsert({
    where: { userId },
    update: {
      planType,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      isActive: ['active', 'trialing'].includes(subscription.status),
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    },
    create: {
      userId,
      planType,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      isActive: ['active', 'trialing'].includes(subscription.status),
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Sync denormalized User.subscriptionTier (R5: userId is always DB User.id)
  await syncUserSubscriptionTier(userId, planType);

  return { planType };
}
