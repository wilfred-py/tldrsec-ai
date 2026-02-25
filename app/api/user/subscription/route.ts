/**
 * User Subscription API Routes
 * Fresh implementation for Stripe subscription management
 *
 * Pricing tiers: Free ($0) / Pro ($199) / Max ($349)
 * with monthly and annual billing intervals
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '../../../../lib/db/prisma';
import {
  isStripeEnabled,
  handleStripeError,
  getCustomer,
  SUBSCRIPTION_PLANS,
  getPriceIdForPlan,
} from '../../../../lib/stripe';
import { TrialService } from '../../../../lib/auth/trial-service';

type BillingInterval = 'monthly' | 'annual';
type NewPlanKey = 'FREE' | 'PRO' | 'MAX';

const prisma = getPrismaClient();

/**
 * GET /api/user/subscription
 * Retrieve user's current subscription information
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Resolve Clerk ID → DB user ID (CLAUDE.md #11: Clerk userId stored in authProviderId)
    const dbUser = await prisma.user.findFirst({
      where: { OR: [{ id: clerkId }, { authProviderId: clerkId }] },
      select: { id: true },
    });
    const userId = dbUser?.id ?? clerkId;

    // Fetch trial data for the user (used in all response paths)
    const trialData = await TrialService.checkTrialStatus(clerkId);

    // When Stripe is not configured, return mock Free tier subscription
    // This allows the billing page to render properly in development
    if (!isStripeEnabled()) {
      return NextResponse.json({
        planType: 'FREE',
        isActive: true,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        limits: {
          monthlyFilings: SUBSCRIPTION_PLANS.FREE.tickerLimit,
          usedFilings: 0,
          remainingFilings: SUBSCRIPTION_PLANS.FREE.tickerLimit,
        },
        _stripeDisabled: true, // Indicates Stripe is not configured
        trialEndsAt: trialData.trialEndsAt?.toISOString() ?? null,
        isTrialing: trialData.isActive,
        daysRemaining: trialData.daysRemaining,
        isGrandfathered: trialData.isGrandfathered,
      });
    }

    // Get user's subscription from database using resolved DB user ID
    const userSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!userSubscription) {
      // Return default free tier info if no subscription exists
      return NextResponse.json({
        planType: 'FREE',
        isActive: true,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        limits: {
          monthlyFilings: SUBSCRIPTION_PLANS.FREE.tickerLimit,
          usedFilings: 0,
          remainingFilings: SUBSCRIPTION_PLANS.FREE.tickerLimit,
        },
        trialEndsAt: trialData.trialEndsAt?.toISOString() ?? null,
        isTrialing: trialData.isActive,
        daysRemaining: trialData.daysRemaining,
        isGrandfathered: trialData.isGrandfathered,
      });
    }

    // Get current usage period
    const now = new Date();
    const currentPeriod = await prisma.usagePeriod.findFirst({
      where: {
        userId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
    });

    const remainingFilings = currentPeriod 
      ? Math.max(0, currentPeriod.filingLimit - currentPeriod.filingsUsed)
      : 0;

    return NextResponse.json({
      planType: userSubscription.planType,
      isActive: userSubscription.isActive && new Date() < userSubscription.currentPeriodEnd,
      currentPeriodStart: userSubscription.currentPeriodStart,
      currentPeriodEnd: userSubscription.currentPeriodEnd,
      cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd,
      stripeCustomerId: userSubscription.stripeCustomerId,
      stripeSubscriptionId: userSubscription.stripeSubscriptionId,
      limits: {
        monthlyFilings: currentPeriod?.filingLimit || 0,
        usedFilings: currentPeriod?.filingsUsed || 0,
        remainingFilings,
      },
      trialEndsAt: trialData.trialEndsAt?.toISOString() ?? null,
      isTrialing: trialData.isActive,
      daysRemaining: trialData.daysRemaining,
      isGrandfathered: trialData.isGrandfathered,
    });

  } catch (error) {
    console.error('Failed to get subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/subscription/create-checkout
 * Create Stripe checkout session for subscription
 *
 * Supports both legacy (priceId) and new (planType + billingInterval) modes
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    // Keep clerkId for Stripe metadata, resolve DB user ID below

    if (!isStripeEnabled()) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const {
      planType,
      priceId: legacyPriceId,
      billingInterval = 'monthly',
      cancelUrl: customCancelUrl,
    } = body as {
      planType?: NewPlanKey;
      priceId?: string;
      billingInterval?: BillingInterval;
      cancelUrl?: string;
    };

    // Determine price ID - support both legacy and new modes
    let priceId: string | null = legacyPriceId || null;

    if (!priceId && planType) {
      // Use new SUBSCRIPTION_PLANS to get price ID
      const plan = SUBSCRIPTION_PLANS[planType as keyof typeof SUBSCRIPTION_PLANS];
      if (!plan) {
        return NextResponse.json(
          { error: 'Invalid plan type' },
          { status: 400 }
        );
      }

      // FREE tier doesn't need checkout
      if (planType === 'FREE') {
        return NextResponse.json(
          { error: 'Free tier does not require checkout' },
          { status: 400 }
        );
      }

      // Use server-side function to get price ID from environment variables
      priceId = getPriceIdForPlan(planType as 'PRO' | 'MAX', billingInterval);

      if (!priceId) {
        return NextResponse.json(
          {
            error: `Stripe price ID not configured for ${planType} ${billingInterval}`,
          },
          { status: 503 }
        );
      }
    }

    if (!planType || !priceId) {
      return NextResponse.json(
        { error: 'Plan type and price ID (or billing interval) are required' },
        { status: 400 }
      );
    }

    // Get Clerk user info for auto-creation if needed
    const clerkUser = await currentUser();
    if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
      return NextResponse.json(
        { error: 'Unable to get user email from authentication provider' },
        { status: 400 }
      );
    }

    const primaryEmail = clerkUser.emailAddresses[0].emailAddress;
    const userName = clerkUser.firstName
      ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
      : undefined;

    // Find user by Clerk ID or email (auto-create pattern)
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: clerkId },
          { authProviderId: clerkId },
          { email: primaryEmail }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    // Create user if not found (auto-create pattern from /api/user/tickers)
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: clerkId,
          email: primaryEmail,
          authProvider: 'clerk',
          authProviderId: clerkId,
          name: userName,
          subscriptionTier: 'FREE',
          onboardingCompleted: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
      console.log(`[subscription] Auto-created user ${clerkId} for checkout`);
    }

    // Use resolved DB user ID for all DB operations
    const dbUserId = user.id;

    // Check if user already has a subscription
    const existingSubscription = await prisma.userSubscription.findUnique({
      where: { userId: dbUserId },
    });

    if (existingSubscription && existingSubscription.isActive) {
      return NextResponse.json(
        { error: 'User already has an active subscription' },
        { status: 409 }
      );
    }

    // Create or get Stripe customer
    let stripeCustomerId = existingSubscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      const { createCustomer } = await import('../../../../lib/stripe');
      const customer = await createCustomer({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          userId: clerkId, // Store Clerk ID in Stripe metadata for webhook resolution
          planType,
        },
      });
      stripeCustomerId = customer.id;
    } else {
      // Verify customer exists in Stripe
      const customer = await getCustomer(stripeCustomerId);
      if (!customer) {
        // Customer was deleted in Stripe, create a new one
        const { createCustomer } = await import('../../../../lib/stripe');
        const newCustomer = await createCustomer({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: clerkId,
            planType,
          },
        });
        stripeCustomerId = newCustomer.id;
      }
    }

    // Check Stripe for active subscriptions (source of truth)
    // This catches cases where DB says inactive but Stripe has an active sub
    if (stripeCustomerId) {
      const { listActiveSubscriptions } = await import('../../../../lib/stripe');
      const activeSubs = await listActiveSubscriptions(stripeCustomerId);
      if (activeSubs.length > 0) {
        // Sync DB state from Stripe
        const latestSub = activeSubs[0];
        const { getPlanTypeFromPriceId: getPlan } = await import('../../../../lib/stripe');
        const activePlanType = getPlan(latestSub.items.data[0]?.price.id);
        // Access period fields via cast (available at runtime despite TS API version mismatch)
        const subData = latestSub as unknown as { current_period_start: number; current_period_end: number };
        const periodStart = new Date(subData.current_period_start * 1000);
        const periodEnd = new Date(subData.current_period_end * 1000);
        await prisma.userSubscription.upsert({
          where: { userId: dbUserId },
          update: {
            planType: activePlanType,
            stripeSubscriptionId: latestSub.id,
            stripeCustomerId,
            isActive: true,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            updatedAt: new Date(),
          },
          create: {
            userId: dbUserId,
            planType: activePlanType,
            stripeSubscriptionId: latestSub.id,
            stripeCustomerId,
            isActive: true,
            currentPeriodEnd: periodEnd,
          },
        });
        console.log(`[subscription] Synced existing Stripe sub ${latestSub.id} for user ${dbUserId}`);
        return NextResponse.json(
          {
            error: 'User already has an active subscription in Stripe',
            action: 'use_put',
            currentPlan: activePlanType,
          },
          { status: 409 }
        );
      }
    }

    // Get app URL for checkout redirects
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : null);

    if (!appUrl) {
      console.error('[subscription] NEXT_PUBLIC_APP_URL not configured');
      return NextResponse.json(
        { error: 'Application URL not configured. Set NEXT_PUBLIC_APP_URL in environment.' },
        { status: 503 }
      );
    }

    // Create checkout session
    // Use custom cancel URL if provided (e.g., from /subscribe page), otherwise default to billing page
    const cancelUrl = customCancelUrl
      ? `${appUrl}${customCancelUrl.startsWith('/') ? customCancelUrl : `/${customCancelUrl}`}`
      : `${appUrl}/dashboard/billing?canceled=true`;

    const { createCheckoutSession } = await import('../../../../lib/stripe');
    const session = await createCheckoutSession({
      priceId,
      customerId: stripeCustomerId,
      successUrl: `${appUrl}/dashboard?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl,
      metadata: {
        userId: clerkId, // Store Clerk ID for webhook resolution
        planType,
        billingInterval, // Track whether monthly or annual
      },
    });

    // Update or create subscription record with customer ID
    await prisma.userSubscription.upsert({
      where: { userId: dbUserId },
      update: {
        stripeCustomerId,
        updatedAt: new Date(),
      },
      create: {
        userId: dbUserId,
        planType: 'FREE', // Stays FREE until Stripe webhook confirms payment
        isActive: false, // Will be activated by webhook
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        stripeCustomerId,
      },
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });

  } catch (error) {
    console.error('Failed to create checkout session:', error);
    const stripeError = handleStripeError(error);
    return NextResponse.json(
      { error: stripeError.message },
      { status: stripeError.statusCode }
    );
  }
}

/**
 * PUT /api/user/subscription
 * Update subscription (plan changes, cancellation toggle)
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Resolve Clerk ID → DB user ID
    const dbUser = await prisma.user.findFirst({
      where: { OR: [{ id: clerkId }, { authProviderId: clerkId }] },
      select: { id: true },
    });
    const userId = dbUser?.id ?? clerkId;

    const body = await request.json();
    const { planType, billingInterval: requestedInterval, cancelAtPeriodEnd } = body as {
      planType?: NewPlanKey;
      billingInterval?: BillingInterval;
      cancelAtPeriodEnd?: boolean;
    };

    // Get existing subscription
    const userSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!userSubscription) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    // Handle cancellation toggle
    if (typeof cancelAtPeriodEnd === 'boolean') {
      // If user has a Stripe subscription, update it in Stripe
      if (userSubscription.stripeSubscriptionId && isStripeEnabled()) {
        const { updateSubscription } = await import('../../../../lib/stripe');
        await updateSubscription(userSubscription.stripeSubscriptionId, {
          cancel_at_period_end: cancelAtPeriodEnd,
        });
      }

      // Update database record
      const updated = await prisma.userSubscription.update({
        where: { userId },
        data: {
          cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        planType: updated.planType,
        isActive: updated.isActive,
        currentPeriodEnd: updated.currentPeriodEnd,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        stripeCustomerId: updated.stripeCustomerId,
        stripeSubscriptionId: updated.stripeSubscriptionId,
      });
    }

    // Handle plan change
    if (planType) {
      const currentPlanOrder = { FREE: 0, PRO: 1, MAX: 2 };
      const newPlanOrder = currentPlanOrder[planType];
      const currentOrder = currentPlanOrder[userSubscription.planType as NewPlanKey] ?? 0;

      // Downgrade to FREE
      if (planType === 'FREE') {
        // Cancel Stripe subscription if exists
        if (userSubscription.stripeSubscriptionId && isStripeEnabled()) {
          const { cancelSubscription } = await import('../../../../lib/stripe');
          await cancelSubscription(userSubscription.stripeSubscriptionId, true); // Cancel at period end
        }

        // Update database - mark as canceling at period end
        const updated = await prisma.userSubscription.update({
          where: { userId },
          data: {
            cancelAtPeriodEnd: true,
            updatedAt: new Date(),
          },
        });

        return NextResponse.json({
          planType: updated.planType,
          isActive: updated.isActive,
          currentPeriodEnd: updated.currentPeriodEnd,
          cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
          stripeCustomerId: updated.stripeCustomerId,
          stripeSubscriptionId: updated.stripeSubscriptionId,
          message: 'Subscription will be downgraded to Free at the end of the billing period',
        });
      }

      // Upgrade between paid plans (PRO -> MAX)
      if (newPlanOrder > currentOrder && newPlanOrder > 0) {
        if (!userSubscription.stripeSubscriptionId || !isStripeEnabled()) {
          return NextResponse.json(
            { error: 'No active Stripe subscription to upgrade' },
            { status: 400 }
          );
        }

        const { getSubscription, updateSubscription } = await import('../../../../lib/stripe');

        // Get current subscription to find the item ID and detect billing interval
        const stripeSubscription = await getSubscription(userSubscription.stripeSubscriptionId);
        if (!stripeSubscription || stripeSubscription.items.data.length === 0) {
          return NextResponse.json(
            { error: 'Could not retrieve Stripe subscription' },
            { status: 500 }
          );
        }

        // Use requested interval if provided, otherwise detect from current subscription
        const currentInterval = stripeSubscription.items.data[0].price.recurring?.interval;
        const billingInterval: BillingInterval = requestedInterval
          ?? (currentInterval === 'year' ? 'annual' : 'monthly');

        const priceId = getPriceIdForPlan(planType as 'PRO' | 'MAX', billingInterval);
        if (!priceId) {
          return NextResponse.json(
            { error: `Price ID not configured for ${planType} ${billingInterval}` },
            { status: 503 }
          );
        }

        const itemId = stripeSubscription.items.data[0].id;

        // Update subscription with new price (immediate prorated charge for upgrades)
        await updateSubscription(userSubscription.stripeSubscriptionId, {
          items: [{
            id: itemId,
            price: priceId,
          }],
          proration_behavior: 'always_invoice',
        });

        // Update database
        const updated = await prisma.userSubscription.update({
          where: { userId },
          data: {
            planType,
            cancelAtPeriodEnd: false, // Clear any pending cancellation on upgrade
            updatedAt: new Date(),
          },
        });

        // Also update user's subscription tier
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: planType },
        });

        return NextResponse.json({
          planType: updated.planType,
          isActive: updated.isActive,
          currentPeriodEnd: updated.currentPeriodEnd,
          cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
          stripeCustomerId: updated.stripeCustomerId,
          stripeSubscriptionId: updated.stripeSubscriptionId,
          message: `Successfully upgraded to ${planType}`,
        });
      }

      // Downgrade between paid plans (MAX -> PRO)
      if (newPlanOrder < currentOrder && newPlanOrder > 0) {
        if (userSubscription.stripeSubscriptionId && isStripeEnabled()) {
          const { getSubscription, updateSubscription } = await import('../../../../lib/stripe');

          // Get current subscription to find the item ID and detect billing interval
          const stripeSubscription = await getSubscription(userSubscription.stripeSubscriptionId);
          if (!stripeSubscription || stripeSubscription.items.data.length === 0) {
            return NextResponse.json(
              { error: 'Could not retrieve Stripe subscription' },
              { status: 500 }
            );
          }

          // Use requested interval if provided, otherwise detect from current subscription
          const currentInterval = stripeSubscription.items.data[0].price.recurring?.interval;
          const billingInterval: BillingInterval = requestedInterval
            ?? (currentInterval === 'year' ? 'annual' : 'monthly');

          const priceId = getPriceIdForPlan(planType as 'PRO' | 'MAX', billingInterval);
          if (!priceId) {
            return NextResponse.json(
              { error: `Price ID not configured for ${planType} ${billingInterval}` },
              { status: 503 }
            );
          }

          const itemId = stripeSubscription.items.data[0].id;

          // Update subscription with new price (prorated credit for downgrades)
          await updateSubscription(userSubscription.stripeSubscriptionId, {
            items: [{
              id: itemId,
              price: priceId,
            }],
            proration_behavior: 'create_prorations',
          });
        }

        // Update database
        const updated = await prisma.userSubscription.update({
          where: { userId },
          data: {
            planType,
            updatedAt: new Date(),
          },
        });

        // Also update user's subscription tier
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: planType },
        });

        return NextResponse.json({
          planType: updated.planType,
          isActive: updated.isActive,
          currentPeriodEnd: updated.currentPeriodEnd,
          cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
          stripeCustomerId: updated.stripeCustomerId,
          stripeSubscriptionId: updated.stripeSubscriptionId,
          message: `Successfully changed plan to ${planType}`,
        });
      }
    }

    return NextResponse.json(
      { error: 'No valid update parameters provided' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Failed to update subscription:', error);
    const stripeError = handleStripeError(error);
    return NextResponse.json(
      { error: stripeError.message },
      { status: stripeError.statusCode }
    );
  }
}