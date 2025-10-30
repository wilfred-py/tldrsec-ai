/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription lifecycle management
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { validateWebhookSignature } from '../../../../lib/stripe';
import Stripe from 'stripe';

const prisma = getPrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = headers().get('stripe-signature');

    if (!signature) {
      console.error('Missing Stripe signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    // Validate webhook signature
    const event = validateWebhookSignature(body, signature);
    if (!event) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log(`Received Stripe webhook: ${event.type}`);

    // Process the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout completion:', session.id);

  if (session.mode !== 'subscription') {
    console.log('Ignoring non-subscription checkout session');
    return;
  }

  const userId = session.metadata?.userId;
  const planType = session.metadata?.planType;

  if (!userId || !planType) {
    console.error('Missing metadata in checkout session');
    return;
  }

  try {
    // Update subscription record
    await prisma.userSubscription.update({
      where: { userId },
      data: {
        stripeSubscriptionId: session.subscription as string,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Create initial usage period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Get filing limit based on plan type
    const planLimits = {
      BASIC: 50,
      PROFESSIONAL: 200,
      PREMIUM: 1000,
    };

    const filingLimit = planLimits[planType as keyof typeof planLimits] || 50;

    await prisma.usagePeriod.upsert({
      where: {
        userId_periodStart: {
          userId,
          periodStart,
        },
      },
      update: {
        filingLimit,
        planType: planType as 'BASIC' | 'PROFESSIONAL' | 'PREMIUM',
      },
      create: {
        userId,
        periodStart,
        periodEnd,
        planType: planType as 'BASIC' | 'PROFESSIONAL' | 'PREMIUM',
        filingLimit,
        resetAt,
      },
    });

    console.log(`Subscription activated for user ${userId}, plan: ${planType}`);
  } catch (error) {
    console.error('Failed to process checkout completion:', error);
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Processing subscription creation:', subscription.id);

  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Find user by Stripe customer ID
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!userSubscription) {
    console.error('User not found for customer:', customerId);
    return;
  }

  try {
    // Update subscription with Stripe data
    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        isActive: subscription.status === 'active',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

    console.log(`Subscription created for user ${userSubscription.userId}`);
  } catch (error) {
    console.error('Failed to process subscription creation:', error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing subscription update:', subscription.id);

  // Find user by subscription ID
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    console.error('User not found for subscription:', subscription.id);
    return;
  }

  try {
    const priceId = subscription.items.data[0]?.price.id;

    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        stripePriceId: priceId,
        isActive: subscription.status === 'active',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

    console.log(`Subscription updated for user ${userSubscription.userId}`);
  } catch (error) {
    console.error('Failed to process subscription update:', error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing subscription deletion:', subscription.id);

  // Find user by subscription ID
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    console.error('User not found for subscription:', subscription.id);
    return;
  }

  try {
    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        isActive: false,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      },
    });

    console.log(`Subscription cancelled for user ${userSubscription.userId}`);
  } catch (error) {
    console.error('Failed to process subscription deletion:', error);
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Processing successful payment:', invoice.id);

  if (!invoice.subscription) {
    console.log('Ignoring non-subscription invoice');
    return;
  }

  // Find user by subscription ID
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string },
  });

  if (!userSubscription) {
    console.error('User not found for subscription:', invoice.subscription);
    return;
  }

  try {
    // Ensure subscription is active
    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        isActive: true,
        updatedAt: new Date(),
      },
    });

    console.log(`Payment processed for user ${userSubscription.userId}`);
  } catch (error) {
    console.error('Failed to process payment success:', error);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing failed payment:', invoice.id);

  if (!invoice.subscription) {
    console.log('Ignoring non-subscription invoice');
    return;
  }

  // Find user by subscription ID
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string },
  });

  if (!userSubscription) {
    console.error('User not found for subscription:', invoice.subscription);
    return;
  }

  // Note: We might want to send an email notification here
  // or implement a grace period before deactivating

  console.log(`Payment failed for user ${userSubscription.userId}`);
}