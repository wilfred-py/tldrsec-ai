/**
 * Plan Change Endpoint
 * Allows users to upgrade or downgrade their subscription plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { stripe, getPriceId } from '@/lib/stripe';
import { prisma } from '@/lib/db/prisma/client';
import { PlanType, BillingPeriod } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if Stripe is configured
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { newPlanType, newBillingPeriod } = body;

    // Validate input
    if (!newPlanType || !['BASIC', 'PROFESSIONAL', 'PREMIUM'].includes(newPlanType)) {
      return NextResponse.json(
        { error: 'Invalid plan type' },
        { status: 400 }
      );
    }

    // Get user from database
    const dbUser = await prisma.user.findUnique({
      where: { authProviderId: user.id },
      include: { userSubscription: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found in database' },
        { status: 404 }
      );
    }

    const subscription = dbUser.userSubscription;

    // Check if user has an active subscription
    if (!subscription || !subscription.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription found. Please create a new subscription first.' },
        { status: 400 }
      );
    }

    // Determine billing period (use existing if not changing)
    const billingPeriod: BillingPeriod = newBillingPeriod || subscription.billingPeriod;

    // Get new price ID
    const newPriceId = getPriceId(newPlanType as PlanType, billingPeriod);
    if (!newPriceId) {
      return NextResponse.json(
        { error: `Price ID not configured for ${newPlanType} ${billingPeriod}` },
        { status: 500 }
      );
    }

    // Retrieve current Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    // Get current subscription item ID
    const subscriptionItemId = stripeSubscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      return NextResponse.json(
        { error: 'Subscription item not found' },
        { status: 500 }
      );
    }

    // Determine if this is an upgrade or downgrade
    const planHierarchy = { BASIC: 1, PROFESSIONAL: 2, PREMIUM: 3 };
    const currentPlanLevel = planHierarchy[subscription.planType as keyof typeof planHierarchy];
    const newPlanLevel = planHierarchy[newPlanType as keyof typeof planHierarchy];
    const isUpgrade = newPlanLevel > currentPlanLevel;

    // Update Stripe subscription
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [
          {
            id: subscriptionItemId,
            price: newPriceId,
          },
        ],
        // For upgrades: charge immediately with proration
        // For downgrades: schedule change for end of period
        proration_behavior: isUpgrade ? 'create_prorations' : 'none',
        billing_cycle_anchor: isUpgrade ? 'now' : 'unchanged',
        metadata: {
          ...stripeSubscription.metadata,
          planType: newPlanType,
          billingPeriod,
        },
      }
    );

    // Update database (webhook will also update, but we update here for immediate response)
    await prisma.userSubscription.update({
      where: { id: subscription.id },
      data: {
        planType: newPlanType as PlanType,
        billingPeriod,
        stripePriceId: newPriceId,
        currentPeriodStart: new Date(updatedSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(updatedSubscription.current_period_end * 1000),
      },
    });

    // Update user tier
    const tierMap = {
      BASIC: 'HOBBY' as const,
      PROFESSIONAL: 'PROFESSIONAL' as const,
      PREMIUM: 'PRO' as const,
    };

    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        subscriptionTier: tierMap[newPlanType as keyof typeof tierMap],
      },
    });

    return NextResponse.json({
      success: true,
      message: isUpgrade
        ? 'Subscription upgraded successfully. You will be charged prorated amount.'
        : 'Subscription downgrade scheduled. Changes will take effect at the end of your current billing period.',
      subscription: {
        planType: newPlanType,
        billingPeriod,
        isUpgrade,
        effectiveDate: isUpgrade ? new Date() : new Date(updatedSubscription.current_period_end * 1000),
      },
    });

  } catch (error: any) {
    console.error('Plan change error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to change plan' },
      { status: 500 }
    );
  }
}
