/**
 * Stripe Billing Portal API Route
 * Addresses UX issue: missing billing portal integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { 
  getUserSubscription 
} from '../../../../services/filings/enhanced/subscriptionService';
import {
  getAuthenticatedUserId,
  verifyUserExists,
  SubscriptionAuthError
} from '../../../../lib/auth/subscription-auth';

/**
 * POST /api/billing/portal
 * Create Stripe billing portal session
 */
export async function POST(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId();
    await verifyUserExists(userId);

    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    // Get the user's Stripe customer ID from subscription
    const userSubscriptionRecord = await getUserSubscriptionRecord(userId);
    if (!userSubscriptionRecord?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing information found' },
        { status: 404 }
      );
    }

    // Create billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: userSubscriptionRecord.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });

    return NextResponse.json({
      url: portalSession.url
    });

  } catch (error) {
    if (error instanceof SubscriptionAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Failed to create billing portal session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to get the raw subscription record with Stripe data
async function getUserSubscriptionRecord(userId: string) {
  const { prisma } = await import('../../../../lib/db');
  
  return await prisma.userSubscription.findUnique({
    where: { userId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true
    }
  });
}