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
import { isSubscriptionActive } from '@/lib/auth/tier-eligibility';

type BillingInterval = 'monthly' | 'annual';

/** Infinity is not valid JSON — clamp to a safe sentinel that the client treats as "unlimited". */
function safeDaysRemaining(days: number): number {
  return Number.isFinite(days) ? days : 9999;
}
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
    case 'reconcile':
      return handleReconcile();
    case 'verify-checkout':
      return handleVerifyCheckout(request);
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

async function resolveDbUserId(clerkId: string): Promise<string | null> {
  // Excludes soft-deleted (deletedAt) users so a stale Clerk session can't
  // touch a deleted account. Intentionally does NOT exclude `deleteScheduledFor`
  // users — they may still need to adjust preferences (e.g. lower email frequency)
  // before the purge runs.
  const dbUser = await prisma.user.findFirst({
    where: {
      OR: [{ id: clerkId }, { authProviderId: clerkId }],
      deletedAt: null,
    },
    select: { id: true },
  });
  return dbUser?.id ?? null;
}

async function handleGetPreferences() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    const dbUserId = await resolveDbUserId(clerkId);
    if (!dbUserId) {
      // Authenticated at Clerk but no DB row — provisioning race (webhook
      // hasn't fired) or soft-deleted account. Surface to logs so prod
      // incidents are visible; the client still gets a clean 404.
      logger.warn('Preferences GET: authenticated Clerk user has no DB row', { clerkId });
      return NextResponse.json({
        success: false,
        message: 'User not found'
      }, { status: 404 });
    }

    const preferences = await PreferenceService.getUserPreferences(dbUserId);

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
    const { userId: clerkId } = await auth();

    if (!clerkId) {
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

    const dbUserId = await resolveDbUserId(clerkId);
    if (!dbUserId) {
      logger.warn('Preferences PATCH: authenticated Clerk user has no DB row', { clerkId });
      return NextResponse.json({
        success: false,
        message: 'User not found'
      }, { status: 404 });
    }

    const result = await PreferenceService.updateUserPreferences(dbUserId, updates);

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

    // Resolve Clerk ID -> DB user ID AND fetch trial fields in one query (eliminates duplicate)
    const dbUser = await prisma.user.findFirst({
      where: { OR: [{ id: clerkId }, { authProviderId: clerkId }] },
      select: {
        id: true,
        subscriptionTier: true,
        trialEndsAt: true,
        trialStartedAt: true,
        isTrialing: true,
      },
    });
    const userId = dbUser?.id ?? clerkId;

    // Compute trial status from already-fetched user data (no extra DB call)
    const trialData = TrialService.checkTrialStatusFromUser(dbUser);

    // When Stripe is not configured, return mock Free tier subscription
    if (!isStripeEnabled()) {
      return NextResponse.json({
        planType: 'FREE',
        isActive: true,
        currentPeriodStart: new Date().toISOString(),
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
        daysRemaining: safeDaysRemaining(trialData.daysRemaining),
        isGrandfathered: trialData.isGrandfathered,
      });
    }

    // Parallelize subscription + usage queries for speed
    const now = new Date();
    const [subResult, periodResult] = await Promise.allSettled([
      prisma.userSubscription.findUnique({ where: { userId } }),
      prisma.usagePeriod.findFirst({
        where: {
          userId,
          periodStart: { lte: now },
          periodEnd: { gte: now },
        },
      }),
    ]);
    const userSubscription = subResult.status === 'fulfilled' ? subResult.value : null;
    const currentPeriod = periodResult.status === 'fulfilled' ? periodResult.value : null;

    // Fire-and-forget Stripe reconciliation (don't block the response)
    if (
      (!userSubscription || (userSubscription.planType === 'FREE' && userSubscription.stripeCustomerId)) &&
      isStripeEnabled()
    ) {
      // Capture email NOW while request context is alive (currentUser() may fail after response sent)
      const clerkUser = await currentUser();
      const reconcileEmail = clerkUser?.emailAddresses?.[0]?.emailAddress;
      if (reconcileEmail) {
        // Background reconciliation — SWR revalidation picks up reconciled data
        reconcileInBackground(userId, reconcileEmail).catch((err) =>
          console.error('[subscription GET] Background reconciliation failed:', err)
        );
      }
    }

    if (!userSubscription) {
      return NextResponse.json({
        planType: 'FREE',
        isActive: true,
        currentPeriodStart: new Date().toISOString(),
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
        daysRemaining: safeDaysRemaining(trialData.daysRemaining),
        isGrandfathered: trialData.isGrandfathered,
      });
    }

    const remainingFilings = currentPeriod
      ? Math.max(0, currentPeriod.filingLimit - currentPeriod.filingsUsed)
      : 0;

    return NextResponse.json({
      planType: userSubscription.planType,
      isActive: isSubscriptionActive(userSubscription),
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
      daysRemaining: safeDaysRemaining(trialData.daysRemaining),
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

/** Fire-and-forget Stripe reconciliation helper (email pre-resolved from request context) */
async function reconcileInBackground(userId: string, email: string) {
  const { reconcileStripeSubscription } = await import('@/lib/stripe/reconcile');
  const result = await reconcileStripeSubscription(userId, email);
  if (result.reconciled) {
    console.log(`[subscription GET] Background reconciled: ${result.planType}`);
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

    // Lifetime Seat guard: holders have an inactive sentinel UserSubscription
    // row (currentPeriodEnd=9999) when they're refunded, or an active one
    // when they're current. Either way, do NOT let them start a new paid
    // subscription via this route. Their MAX entitlement is already covered
    // by the sentinel row. Without this guard, /subscribe would treat
    // stripeSubscriptionId=null as "first-time customer" and grant a free
    // trial, AND handleSubscriptionCreated would later overwrite the
    // sentinel (now guarded webhook-side too). See ADR-0004.
    const { isLifetimeSentinel } = await import('@/lib/stripe/constants');
    if (
      existingSubscription &&
      isLifetimeSentinel(existingSubscription.currentPeriodEnd)
    ) {
      return NextResponse.json(
        {
          error:
            'You hold a Lifetime Seat with permanent MAX access. Contact support if you need to make billing changes.',
          isLifetimeSeat: true,
        },
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
        const { getSubscriptionPeriod } = await import('@/lib/stripe/sync-subscription');
        const activePlanType = getPlan(latestSub.items.data[0]?.price.id);
        const { start: periodStart, end: periodEnd } = getSubscriptionPeriod(latestSub);
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
    const { TRIAL_CONFIG } = await import('@/lib/auth/trial-service');

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
    const { userId: clerkId } = await auth();
    if (!clerkId) {
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

    // UserSubscription.userId is FK to User.id (UUID), not the Clerk id.
    // Resolve to the DB id first — same pattern as preferences and subscription handlers.
    const dbUserId = await resolveDbUserId(clerkId);
    if (!dbUserId) {
      // Distinguish "user not provisioned" from "user provisioned but no Stripe
      // customer yet" (the existing branch below). Different root cause, different
      // triage path — don't conflate in either the response or the logs.
      logger.warn('Billing portal: authenticated Clerk user has no DB row', { clerkId });
      return NextResponse.json(
        { error: 'Account not fully provisioned yet. Please try again in a moment.' },
        { status: 404 }
      );
    }

    const userSubscription = await prisma.userSubscription.findUnique({
      where: { userId: dbUserId },
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

// ===========================================================================
// Background Stripe reconciliation (moved from page.tsx to avoid blocking render)
// ===========================================================================

async function handleReconcile() {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const email = user.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ reconciled: false });
    }

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, subscriptionTier: true },
    });
    if (!dbUser || dbUser.subscriptionTier !== 'FREE') {
      return NextResponse.json({ reconciled: false });
    }

    const existingSub = await prisma.userSubscription.findUnique({
      where: { userId: dbUser.id },
      select: { stripeCustomerId: true, planType: true },
    });
    if (!existingSub?.stripeCustomerId || existingSub.planType !== 'FREE') {
      return NextResponse.json({ reconciled: false });
    }

    if (!isStripeEnabled()) {
      return NextResponse.json({ reconciled: false });
    }

    const { reconcileStripeSubscription } = await import('@/lib/stripe/reconcile');
    const result = await reconcileStripeSubscription(dbUser.id, email);
    if (result.reconciled && result.planType) {
      return NextResponse.json({ reconciled: true, planType: result.planType });
    }

    return NextResponse.json({ reconciled: false });
  } catch (error) {
    console.error('[api/user] Stripe reconciliation failed:', error);
    return NextResponse.json({ reconciled: false });
  }
}

async function handleVerifyCheckout(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const email = user.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ reconciled: false });
    }

    const body = await request.json();
    const sessionId = body?.sessionId;
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ reconciled: false });
    }

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, subscriptionTier: true },
    });
    if (!dbUser || dbUser.subscriptionTier !== 'FREE') {
      return NextResponse.json({ reconciled: false });
    }

    if (!isStripeEnabled()) {
      return NextResponse.json({ reconciled: false });
    }

    const { retrieveCheckoutSession } = await import('@/lib/stripe');
    const session = await retrieveCheckoutSession(sessionId);
    if (session && session.payment_status === 'paid' && session.metadata?.planType) {
      // Security: verify checkout session belongs to this user
      const sessionEmail = session.customer_details?.email || session.customer_email;
      if (sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase()) {
        console.warn('[api/user] Checkout session email mismatch', { sessionEmail, userEmail: email });
        return NextResponse.json({ reconciled: false });
      }

      // Validate planType is an expected value
      const planType = session.metadata.planType;
      if (planType !== 'PRO' && planType !== 'MAX') {
        console.warn('[api/user] Unexpected planType in checkout session', { planType });
        return NextResponse.json({ reconciled: false });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: dbUser.id },
          data: { subscriptionTier: planType },
        }),
        prisma.userSubscription.upsert({
          where: { userId: dbUser.id },
          update: {
            planType,
            stripeSubscriptionId: session.subscription as string || undefined,
            stripeCustomerId: session.customer as string || undefined,
            isActive: true,
            updatedAt: new Date(),
          },
          create: {
            userId: dbUser.id,
            planType,
            stripeSubscriptionId: session.subscription as string || undefined,
            stripeCustomerId: session.customer as string || undefined,
            isActive: true,
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);
      return NextResponse.json({ reconciled: true, planType });
    }

    return NextResponse.json({ reconciled: false });
  } catch (error) {
    console.error('[api/user] Checkout verification failed:', error);
    return NextResponse.json({ reconciled: false });
  }
}
