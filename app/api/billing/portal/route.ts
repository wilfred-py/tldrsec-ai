/**
 * Stripe Billing Portal API Route
 * Fresh implementation for customer self-service billing
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { isStripeEnabled, handleStripeError, createBillingPortalSession } from '../../../../lib/stripe';

const prisma = getPrismaClient();

/**
 * POST /api/billing/portal
 * Create Stripe billing portal session for customer self-service
 */
export async function POST() {
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

    // Get user's subscription to find Stripe customer ID
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

    // Create billing portal session
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