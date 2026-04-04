/**
 * Stripe subscription reconciliation.
 *
 * Handles the case where a user paid via homepage checkout before
 * creating an account. Called fire-and-forget during onboarding.
 *
 * @module lib/stripe/reconcile
 */

import { stripe, getPlanTypeFromPriceId } from '@/lib/stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { syncSubscriptionFromStripeData } from '@/lib/stripe/sync-subscription';

/**
 * Reconcile Stripe subscription for a user during onboarding.
 *
 * @param userId - DB User.id (NOT Clerk authProviderId)
 * @param email  - User's email for Stripe customer lookup
 */
export async function reconcileStripeSubscription(
  userId: string,
  email: string
): Promise<{ reconciled: boolean; planType?: string }> {
  if (!stripe) return { reconciled: false };

  const prisma = getPrismaClient();

  // 1. Check if user already has active paid subscription in DB
  const existing = await prisma.userSubscription.findUnique({
    where: { userId },
  });
  if (existing && existing.isActive && existing.planType !== 'FREE') {
    return { reconciled: false };
  }

  // 2. Search Stripe by email
  const customers = await stripe.customers.list({ email, limit: 3 });

  for (const customer of customers.data) {
    // Check both 'active' and 'trialing' — CC-required trials create 'trialing' status
    const [activeSubs, trialingSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 }),
      stripe.subscriptions.list({ customer: customer.id, status: 'trialing', limit: 1 }),
    ]);

    const sub = activeSubs.data[0] || trialingSubs.data[0];
    if (sub) {
      const priceId = sub.items.data[0]?.price.id;
      const derivedPlanType = getPlanTypeFromPriceId(priceId);

      if (derivedPlanType === 'FREE') continue;

      // 3. Use shared helper for DB writes
      const { planType } = await syncSubscriptionFromStripeData(userId, sub, customer.id);

      console.log(`[reconcile] Reconciled subscription for user ${userId}: ${planType} (sub ${sub.id})`);
      return { reconciled: true, planType };
    }
  }

  return { reconciled: false };
}
