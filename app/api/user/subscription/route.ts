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

type BillingInterval = 'monthly' | 'annual';
type NewPlanKey = 'FREE' | 'PRO' | 'MAX';

const prisma = getPrismaClient();

/**
 * GET /api/user/subscription
 * Retrieve user's current subscription information
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

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
      });
    }

    // Get user's subscription from database
    const userSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
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
    const { userId } = await auth();
    if (!userId) {
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
    } = body as {
      planType?: NewPlanKey;
      priceId?: string;
      billingInterval?: BillingInterval;
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
          { id: userId },
          { authProviderId: userId },
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
          id: userId,
          email: primaryEmail,
          authProvider: 'clerk',
          authProviderId: userId,
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
      console.log(`[subscription] Auto-created user ${userId} for checkout`);
    }

    // Check if user already has a subscription
    const existingSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
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
          userId,
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
            userId,
            planType,
          },
        });
        stripeCustomerId = newCustomer.id;
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
    const { createCheckoutSession } = await import('../../../../lib/stripe');
    const session = await createCheckoutSession({
      priceId,
      customerId: stripeCustomerId,
      successUrl: `${appUrl}/dashboard?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/dashboard/billing?canceled=true`,
      metadata: {
        userId,
        planType,
        billingInterval, // Track whether monthly or annual
      },
    });

    // Update or create subscription record with customer ID
    await prisma.userSubscription.upsert({
      where: { userId },
      update: {
        stripeCustomerId,
        updatedAt: new Date(),
      },
      create: {
        userId,
        planType: planType as 'FREE' | 'PRO' | 'MAX',
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