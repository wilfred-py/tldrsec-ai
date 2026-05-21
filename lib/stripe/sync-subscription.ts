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
import { LIFETIME_NEVER_EXPIRES, isLifetimeSentinel } from '@/lib/stripe/constants';

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

  // Lifetime Seat guard: a holder's existing UserSubscription row carries
  // the sentinel currentPeriodEnd (9999). Overwriting it with a regular
  // subscription would silently destroy their lifetime entitlement.
  // ADR-0004: Lifetime supersedes any later subscription event.
  const existing = await prisma.userSubscription.findUnique({
    where: { userId },
    select: { currentPeriodEnd: true },
  });
  if (existing && isLifetimeSentinel(existing.currentPeriodEnd)) {
    console.error(
      `[sync] Refusing to sync new subscription ${subscription.id} onto Lifetime Seat row for user ${userId}. Lifetime preserved.`,
    );
    return { planType: 'MAX' };
  }

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

/**
 * Apply a Lifetime Seat purchase atomically.
 *
 * Triggered from the webhook's `checkout.session.completed` handler when
 * `session.mode === 'payment'` and the priceId matches the Founding lifetime
 * price. Differs from `syncSubscriptionFromStripeData` in three ways:
 *
 *   1. No Stripe `Subscription` object exists (one-time payment), so
 *      `stripeSubscriptionId` is null and we cannot read period dates from
 *      Stripe. We synthesize `currentPeriodStart = now` and
 *      `currentPeriodEnd = LIFETIME_NEVER_EXPIRES`.
 *   2. Sets `User.foundingMember = true` in the same Prisma transaction so
 *      entitlement and identity flip atomically. The flag remains true
 *      forever unless `revokeLifetimeSeat` runs (refund window).
 *   3. Always entitles MAX tier. The Lifetime Seat feature set is identical
 *      to MAX (see ADR-0004).
 *
 * @param userId         DB User.id (NOT Clerk authProviderId)
 * @param priceId        Stripe Price ID (must be the Founding lifetime price)
 * @param stripeCustomerId  Stripe Customer ID from the checkout session
 */
export async function syncLifetimeSeat(
  userId: string,
  priceId: string,
  stripeCustomerId: string,
): Promise<void> {
  const prisma = getPrismaClient();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.userSubscription.upsert({
      where: { userId },
      update: {
        planType: 'MAX',
        stripeSubscriptionId: null,
        stripeCustomerId,
        stripePriceId: priceId,
        isActive: true,
        currentPeriodStart: now,
        currentPeriodEnd: LIFETIME_NEVER_EXPIRES,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      },
      create: {
        userId,
        planType: 'MAX',
        stripeSubscriptionId: null,
        stripeCustomerId,
        stripePriceId: priceId,
        isActive: true,
        currentPeriodStart: now,
        currentPeriodEnd: LIFETIME_NEVER_EXPIRES,
        cancelAtPeriodEnd: false,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        foundingMember: true,
        subscriptionTier: 'MAX',
      },
    });
  });

  console.log(`[sync] Lifetime Seat granted to user ${userId} (priceId ${priceId})`);
}

/**
 * Revoke a Lifetime Seat atomically.
 *
 * Triggered from the webhook's `charge.refunded` handler when the refunded
 * charge corresponds to a Founding lifetime payment. Also callable directly
 * via `scripts/revoke-lifetime-seat.ts` as a manual escape hatch.
 *
 * Resets the user to FREE tier and clears the founding flag. Existing
 * UserSubscription row is marked inactive (kept for audit, not deleted).
 *
 * @param userId   DB User.id
 * @param reason   Short string for audit log (e.g., 'charge.refunded',
 *                 'manual_revoke', 'support_request')
 */
export async function revokeLifetimeSeat(
  userId: string,
  reason: string,
): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        foundingMember: false,
        subscriptionTier: 'FREE',
      },
    });

    await tx.userSubscription.updateMany({
      where: { userId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'lifetime_seat_revoked',
        details: { reason },
        success: true,
      },
    });
  });

  console.log(`[sync] Lifetime Seat revoked for user ${userId} (reason: ${reason})`);
}
