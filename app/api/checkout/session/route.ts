/**
 * Stripe Checkout Session Creation Endpoint
 * Creates a Stripe Checkout session for subscription purchases
 */

import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { stripe, getPriceId } from '@/lib/stripe';
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

    // Parse request body
    const body = await request.json();
    const { planType, billingPeriod } = body;

    // Validate input
    if (!planType || !['BASIC', 'PROFESSIONAL', 'PREMIUM'].includes(planType)) {
      return NextResponse.json(
        { error: 'Invalid plan type' },
        { status: 400 }
      );
    }

    if (!billingPeriod || !['MONTHLY', 'YEARLY'].includes(billingPeriod)) {
      return NextResponse.json(
        { error: 'Invalid billing period' },
        { status: 400 }
      );
    }

    // Get price ID
    const priceId = getPriceId(planType, billingPeriod);
    if (!priceId) {
      return NextResponse.json(
        { error: `Price ID not configured for ${planType} ${billingPeriod}` },
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

    // Check if user already has an active subscription
    if (dbUser.userSubscription?.isActive && dbUser.userSubscription?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'User already has an active subscription. Please use the billing portal to change plans.' },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = dbUser.userSubscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.emailAddresses[0]?.emailAddress || dbUser.email,
        name: user.fullName || dbUser.name || undefined,
        metadata: {
          userId: dbUser.id,
          clerkId: user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer ID to database
      if (dbUser.userSubscription) {
        await prisma.userSubscription.update({
          where: { userId: dbUser.id },
          data: { stripeCustomerId },
        });
      } else {
        await prisma.userSubscription.create({
          data: {
            userId: dbUser.id,
            planType: 'BASIC',
            billingPeriod: 'MONTHLY',
            isActive: false,
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now (placeholder)
            stripeCustomerId,
          },
        });
      }
    }

    // Get app URL from environment or use default
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
      metadata: {
        userId: dbUser.id,
        clerkId: user.id,
        planType,
        billingPeriod,
      },
      subscription_data: {
        metadata: {
          userId: dbUser.id,
          clerkId: user.id,
          planType,
          billingPeriod,
        },
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error: any) {
    console.error('Checkout session creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
