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

  await prisma.userSubscription.upsert({
    where: { userId },
    update: {
      planType,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      isActive: subscription.status === 'active',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    },
    create: {
      userId,
      planType,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      isActive: subscription.status === 'active',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Sync denormalized User.subscriptionTier (R5: userId is always DB User.id)
  await syncUserSubscriptionTier(userId, planType);

  return { planType };
}
