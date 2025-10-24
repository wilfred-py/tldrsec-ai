/**
 * Subscription Reactivation Endpoint
 * Allows users to reactivate a canceled subscription before it expires
 */

import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db/prisma/client';

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

    // Check if user has a subscription
    if (!subscription || !subscription.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 400 }
      );
    }

    // Check if subscription is scheduled for cancellation
    if (!subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: 'Subscription is not scheduled for cancellation' },
        { status: 400 }
      );
    }

    // Retrieve Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    // Check if subscription is still active
    if (stripeSubscription.status !== 'active') {
      return NextResponse.json(
        { error: 'Subscription is no longer active and cannot be reactivated. Please create a new subscription.' },
        { status: 400 }
      );
    }

    // Reactivate subscription by removing cancel_at_period_end
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    // Update database
    await prisma.userSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription reactivated successfully. Your subscription will continue and renew automatically.',
      nextBillingDate: new Date(updatedSubscription.current_period_end * 1000),
    });

  } catch (error: any) {
    console.error('Subscription reactivation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reactivate subscription' },
      { status: 500 }
    );
  }
}
