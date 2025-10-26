/**
 * Stripe Billing Portal API Route
 * Addresses UX issue: missing billing portal integration
 */

import { NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';

/**
 * POST /api/billing/portal
 * Create Stripe billing portal session
 */
export async function POST() {
  try {
    // Dynamic imports to avoid build-time database dependency
    const { 
      getUserSubscription 
    } = await import('../../../../services/filings/enhanced/subscriptionService');
    const {
      getAuthenticatedUserId,
      verifyUserExists
    } = await import('../../../../lib/auth/subscription-auth');

    const userId = await getAuthenticatedUserId();
    await verifyUserExists(userId);

    if (!stripe) {
      return NextResponse.json(
        { error: 'Billing portal not configured' },
        { status: 503 }
      );
    }

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
    // Dynamic import for error handling
    const { SubscriptionAuthError } = await import('../../../../lib/auth/subscription-auth');
    
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
  // Dynamic import to avoid build-time database dependency
  const { getPrismaClient } = await import('../../../../lib/db/prisma');
  const prisma = getPrismaClient();
  
  try {
    return await prisma.userSubscription.findUnique({
      where: { userId },
      select: {
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}