/**
 * Consolidated User API Route
 * Handles preferences, subscription, and billing-portal via ?type= query parameter
 *
 * Routes:
 *   GET  /api/user?type=preferences    → user preferences
 *   PATCH /api/user?type=preferences   → update user preferences
 *   GET  /api/user?type=subscription   → subscription info
 *   POST /api/user?type=subscription   → create checkout session
 *   POST /api/user?type=billing-portal → create billing portal session
 *   PUT  /api/user?type=subscription   → update subscription (plan change, cancel toggle)
 */

import { NextRequest, NextResponse } from 'next/server';
import { currentUser, auth } from '@clerk/nextjs/server';
import { PreferenceService } from '@/lib/user/preference-service';

export const dynamic = 'force-dynamic';
import { logger } from '@/lib/logging';
import { getPrismaClient } from '@/lib/db/prisma';
import {
  isStripeEnabled,
  handleStripeError,
  getCustomer,
  SUBSCRIPTION_PLANS,
  getPriceIdForPlan,
  createBillingPortalSession,
} from '@/lib/stripe';
import { TrialService } from '@/lib/auth/trial-service';

type BillingInterval = 'monthly' | 'annual';
type NewPlanKey = 'FREE' | 'PRO' | 'MAX';

const prisma = getPrismaClient();

// ---------------------------------------------------------------------------
// Helpers to extract query param
// ---------------------------------------------------------------------------

function getType(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('type');
}

function badType(type: string | null) {
  return NextResponse.json(
    { error: `Invalid or missing type parameter: ${type}` },
    { status: 400 }
  );
}

// ===========================================================================
// GET handler
// ===========================================================================

export async function GET(request: NextRequest) {
  const type = getType(request);

  switch (type) {
    case 'preferences':
      return handleGetPreferences();
    case 'subscription':
      return handleGetSubscription();
    default:
      return badType(type);
  }
}

// ===========================================================================
// PATCH handler (preferences only)
// ===========================================================================

export async function PATCH(request: NextRequest) {
  const type = getType(request);

  if (type !== 'preferences') {
    return badType(type);
  }

  return handlePatchPreferences(request);
}

// ===========================================================================
// POST handler
// ===========================================================================

export async function POST(request: NextRequest) {
  const type = getType(request);

  switch (type) {
    case 'subscription':
      return handlePostSubscription(request);
    case 'billing-portal':
      return handlePostBillingPortal();
    default:
      return badType(type);
  }
}

// ===========================================================================
// PUT handler (subscription only)
// ===========================================================================

export async function PUT(request: NextRequest) {
  const type = getType(request);

  if (type !== 'subscription') {
    return badType(type);
  }

  return handlePutSubscription(request);
}

// ===========================================================================
// Preferences sub-handlers
// ===========================================================================

async function handleGetPreferences() {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    const preferences = await PreferenceService.getUserPreferences(user.id);

    return NextResponse.json({
      success: true,
      preferences
    });
  } catch (error) {
    logger.error('Error retrieving user preferences', error);

    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error retrieving preferences'
    }, { status: 500 });
  }
}

async function handlePatchPreferences(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    let updates;
    try {
      updates = await request.json();
    } catch {
      return NextResponse.json({
        success: false,
        message: 'Invalid JSON in request body'
      }, { status: 400 });
    }

    const result = await PreferenceService.updateUserPreferences(user.id, updates);

    return NextResponse.json(result, {
      status: result.success ? 200 : 400
    });
  } catch (error) {
    logger.error('Error updating user preferences', error);

    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error updating preferences'
    }, { status: 500 });
  }
}

// ===========================================================================
// Subscription sub-handlers
// ===========================================================================

async function handleGetSubscription() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Resolve Clerk ID -> DB user ID (CLAUDE.md #11: Clerk userId stored in authProviderId)
    const dbUser = await prisma.user.findFirst({
      where: { OR: [{ id: clerkId }, { authProviderId: clerkId }] },
      select: { id: true },
    });
    const userId = dbUser?.id ?? clerkId;

    // Fetch trial data for the user (used in all response paths)
    const trialData = await TrialService.checkTrialStatus(clerkId);

    // When Stripe is not configured, return mock Free tier subscription
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
        _stripeDisabled: true,
        trialEndsAt: trialData.trialEndsAt?.toISOString() ?? null,
        isTrialing: trialData.isActive,
        daysRemaining: trialData.daysRemaining,
        isGrandfathered: trialData.isGrandfathered,
      });
    }

    // Get user's subscription from database using resolved DB user ID
    let userSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
    });

    // Safety net: if no subscription or FREE with a stripeCustomerId, reconcile from Stripe
    if (
      (!userSubscription || (userSubscription.planType === 'FREE' && userSubscription.stripeCustomerId)) &&
      isStripeEnabled()
    ) {
      try {
        const clerkUser = await currentUser();
        const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
        if (email) {
          const { reconcileStripeSubscription } = await import('@/lib/stripe/reconcile');
          const result = await reconcileStripeSubscription(userId, email);
          if (result.reconciled) {
            console.log(`[subscription GET] Reconciled Stripe subscription: ${result.planType}`);
            userSubscription = await prisma.userSubscription.findUnique({
              where: { userId },
            });
          }
        }
      } catch (reconcileError) {
        console.error('[subscription GET] Reconciliation failed:', reconcileError);
      }
    }

    if (!userSubscription) {
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

async function handlePostSubscription(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

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
      const plan = SUBSCRIPTION_PLANS[planType as keyof typeof SUBSCRIPTION_PLANS];
      if (!plan) {
        return NextResponse.json(
          { error: 'Invalid plan type' },
          { status: 400 }
        );
      }

      if (planType === 'FREE') {
        return NextResponse.json(
          { error: 'Trial tier does not require checkout' },
          { status: 400 }
        );
      }

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

    // Create user if not found
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
      const { createCustomer } = await import('@/lib/stripe');
      const customer = await createCustomer({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          userId: clerkId,
          planType,
        },
      });
      stripeCustomerId = customer.id;
    } else {
      const customer = await getCustomer(stripeCustomerId);
      if (!customer) {
        const { createCustomer } = await import('@/lib/stripe');
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
    if (stripeCustomerId) {
      const { listActiveSubscriptions } = await import('@/lib/stripe');
      const activeSubs = await listActiveSubscriptions(stripeCustomerId);
      if (activeSubs.length > 0) {
        const latestSub = activeSubs[0];
        const { getPlanTypeFromPriceId: getPlan } = await import('@/lib/stripe');
        const activePlanType = getPlan(latestSub.items.data[0]?.price.id);
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
    const cancelUrl = customCancelUrl
      ? `${appUrl}${customCancelUrl.startsWith('/') ? customCancelUrl : `/${customCancelUrl}`}`
      : `${appUrl}/dashboard/billing?canceled=true`;

    const { createCheckoutSession } = await import('@/lib/stripe');
    const { TRIAL_CONFIG } = await import('@/lib/auth/trial-config');

    // Only grant trial to users who have never had a paid subscription.
    // Prevents trial cycling: cancel → resubscribe → free trial again.
    const existingSub = await prisma.userSubscription.findUnique({
      where: { userId: dbUserId },
      select: { stripeSubscriptionId: true },
    });
    const isFirstSubscription = !existingSub?.stripeSubscriptionId;

    const session = await createCheckoutSession({
      priceId,
      customerId: stripeCustomerId,
      successUrl: `${appUrl}/dashboard?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl,
      metadata: {
        userId: clerkId,
        planType,
        billingInterval,
      },
      trialPeriodDays: isFirstSubscription ? TRIAL_CONFIG.TRIAL_DURATION_DAYS : undefined,
      paymentMethodCollection: 'always',
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
        planType: 'FREE',
        isActive: false,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

async function handlePutSubscription(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Resolve Clerk ID -> DB user ID
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
      if (userSubscription.stripeSubscriptionId && isStripeEnabled()) {
        const { updateSubscription } = await import('@/lib/stripe');
        await updateSubscription(userSubscription.stripeSubscriptionId, {
          cancel_at_period_end: cancelAtPeriodEnd,
        });
      }

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
        if (userSubscription.stripeSubscriptionId && isStripeEnabled()) {
          const { cancelSubscription } = await import('@/lib/stripe');
          await cancelSubscription(userSubscription.stripeSubscriptionId, true);
        }

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
          message: 'Subscription will be downgraded to Trial at the end of the billing period',
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

        const { getSubscription, updateSubscription } = await import('@/lib/stripe');

        const stripeSubscription = await getSubscription(userSubscription.stripeSubscriptionId);
        if (!stripeSubscription || stripeSubscription.items.data.length === 0) {
          return NextResponse.json(
            { error: 'Could not retrieve Stripe subscription' },
            { status: 500 }
          );
        }

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

        await updateSubscription(userSubscription.stripeSubscriptionId, {
          items: [{
            id: itemId,
            price: priceId,
          }],
          proration_behavior: 'always_invoice',
        });

        const updated = await prisma.userSubscription.update({
          where: { userId },
          data: {
            planType,
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          },
        });

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
          const { getSubscription, updateSubscription } = await import('@/lib/stripe');

          const stripeSubscription = await getSubscription(userSubscription.stripeSubscriptionId);
          if (!stripeSubscription || stripeSubscription.items.data.length === 0) {
            return NextResponse.json(
              { error: 'Could not retrieve Stripe subscription' },
              { status: 500 }
            );
          }

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

          await updateSubscription(userSubscription.stripeSubscriptionId, {
            items: [{
              id: itemId,
              price: priceId,
            }],
            proration_behavior: 'create_prorations',
          });
        }

        const updated = await prisma.userSubscription.update({
          where: { userId },
          data: {
            planType,
            updatedAt: new Date(),
          },
        });

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

// ===========================================================================
// Billing portal sub-handler
// ===========================================================================

async function handlePostBillingPortal() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!isStripeEnabled()) {
      return NextResponse.json(
        { error: 'Billing portal not configured' },
        { status: 503 }
      );
    }

    const userSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
      select: {
        stripeCustomerId: true,
        isActive: true,
      },
    });

    if (!userSubscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing information found. Please create a subscription first.' },
        { status: 404 }
      );
    }

    const session = await createBillingPortalSession({
      customerId: userSubscription.stripeCustomerId,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });

    return NextResponse.json({
      url: session.url,
    });

  } catch (error) {
    console.error('Failed to create billing portal session:', error);
    const stripeError = handleStripeError(error);
    return NextResponse.json(
      { error: stripeError.message },
      { status: stripeError.statusCode }
    );
  }
}
