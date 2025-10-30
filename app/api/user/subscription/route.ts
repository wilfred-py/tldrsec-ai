/**
 * User Subscription API Routes
 * Fresh implementation for Stripe subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { isStripeEnabled, handleStripeError, getCustomer } from '../../../../lib/stripe';

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

    if (!isStripeEnabled()) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 503 }
      );
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
        planType: 'BASIC',
        isActive: false,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        limits: {
          monthlyFilings: 0,
          usedFilings: 0,
          remainingFilings: 0,
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
    const { planType, priceId } = body;

    if (!planType || !priceId) {
      return NextResponse.json(
        { error: 'Plan type and price ID are required' },
        { status: 400 }
      );
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
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

    // Create checkout session
    const { createCheckoutSession } = await import('../../../../lib/stripe');
    const session = await createCheckoutSession({
      priceId,
      customerId: stripeCustomerId,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
      metadata: {
        userId,
        planType,
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
        planType: planType as 'BASIC' | 'PROFESSIONAL' | 'PREMIUM',
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