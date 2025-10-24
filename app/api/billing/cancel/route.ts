/**
 * Subscription Cancellation Endpoint
 * Allows users to cancel their subscription
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

    // Parse request body (optional: immediate cancellation)
    const body = await request.json().catch(() => ({}));
    const { cancelImmediately = false } = body;

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
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // Check if already canceled
    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: 'Subscription is already scheduled for cancellation' },
        { status: 400 }
      );
    }

    if (cancelImmediately) {
      // Cancel immediately
      const canceledSubscription = await stripe.subscriptions.cancel(
        subscription.stripeSubscriptionId
      );

      // Update database
      await prisma.$transaction(async (tx) => {
        await tx.userSubscription.update({
          where: { id: subscription.id },
          data: {
            isActive: false,
            cancelAtPeriodEnd: false,
          },
        });

        await tx.user.update({
          where: { id: dbUser.id },
          data: {
            subscriptionTier: 'FREE',
          },
        });
      });

      return NextResponse.json({
        success: true,
        message: 'Subscription canceled immediately. You no longer have access to premium features.',
        canceledAt: new Date(),
        refundIssued: false,
      });

    } else {
      // Cancel at period end (default)
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

      // Update database
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Subscription will be canceled at the end of your current billing period. You will retain access until then.',
        cancelAt: new Date(updatedSubscription.current_period_end * 1000),
        accessUntil: new Date(updatedSubscription.current_period_end * 1000),
      });
    }

  } catch (error: any) {
    console.error('Subscription cancellation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
