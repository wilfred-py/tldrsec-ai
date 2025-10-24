/**
 * Stripe Webhook Handler
 * Handles Stripe events to sync subscription state with database
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { stripe, webhookSecret } from '@/lib/stripe';
import { prisma } from '@/lib/db/prisma/client';
import { PlanType, BillingPeriod, SubscriptionTier } from '@prisma/client';

// Disable body parsing to get raw body for signature verification
export const runtime = 'nodejs';

// Store processed event IDs for idempotency (in-memory cache)
const processedEvents = new Set<string>();

// Map plan types to subscription tiers
function mapPlanTypeToTier(planType: PlanType): SubscriptionTier {
  switch (planType) {
    case 'BASIC':
      return 'HOBBY';
    case 'PROFESSIONAL':
      return 'PROFESSIONAL';
    case 'PREMIUM':
      return 'PRO';
    default:
      return 'FREE';
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if Stripe is configured
    if (!stripe || !webhookSecret) {
      console.error('Stripe webhook: Stripe not configured');
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    // Get raw body for signature verification
    const body = await request.text();
    const signature = headers().get('stripe-signature');

    if (!signature) {
      console.error('Stripe webhook: Missing signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err.message}` },
        { status: 400 }
      );
    }

    // Check for duplicate events (idempotency)
    if (processedEvents.has(event.id)) {
      console.log(`Stripe webhook: Event ${event.id} already processed, skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    console.log(`Stripe webhook: Processing event ${event.type} (${event.id})`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
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

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Stripe webhook: Unhandled event type ${event.type}`);
    }

    // Mark event as processed
    processedEvents.add(event.id);

    // Clean up old events (keep last 1000)
    if (processedEvents.size > 1000) {
      const eventsArray = Array.from(processedEvents);
      processedEvents.clear();
      eventsArray.slice(-500).forEach(id => processedEvents.add(id));
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle checkout.session.completed event
 * Creates or updates user subscription after successful checkout
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout.session.completed:', session.id);

  const userId = session.metadata?.userId;
  const planType = session.metadata?.planType as PlanType;
  const billingPeriod = session.metadata?.billingPeriod as BillingPeriod;

  if (!userId || !planType || !billingPeriod) {
    console.error('Missing metadata in checkout session:', session.metadata);
    return;
  }

  // Get subscription details from Stripe
  const subscriptionId = session.subscription as string;
  if (!subscriptionId) {
    console.error('No subscription ID in checkout session');
    return;
  }

  const subscription = await stripe!.subscriptions.retrieve(subscriptionId);

  // Update or create user subscription
  await prisma.$transaction(async (tx) => {
    // Update user subscription
    await tx.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        planType,
        billingPeriod,
        isActive: subscription.status === 'active',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.items.data[0]?.price.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      update: {
        planType,
        billingPeriod,
        isActive: subscription.status === 'active',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.items.data[0]?.price.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });

    // Update user's subscription tier
    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: mapPlanTypeToTier(planType),
      },
    });
  });

  console.log(`Subscription created for user ${userId}: ${planType} ${billingPeriod}`);
}

/**
 * Handle customer.subscription.created event
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.created:', subscription.id);

  const userId = subscription.metadata?.userId;
  const planType = subscription.metadata?.planType as PlanType;
  const billingPeriod = subscription.metadata?.billingPeriod as BillingPeriod;

  if (!userId || !planType || !billingPeriod) {
    console.error('Missing metadata in subscription:', subscription.metadata);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        planType,
        billingPeriod,
        isActive: subscription.status === 'active',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.items.data[0]?.price.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      update: {
        planType,
        billingPeriod,
        isActive: subscription.status === 'active',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.items.data[0]?.price.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: mapPlanTypeToTier(planType),
      },
    });
  });
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.updated:', subscription.id);

  // Find user by Stripe subscription ID
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    console.error('User subscription not found for Stripe subscription:', subscription.id);
    return;
  }

  // Determine plan type and billing period from price ID
  let planType = userSubscription.planType;
  let billingPeriod = userSubscription.billingPeriod;

  // If metadata includes plan info, use it
  if (subscription.metadata?.planType) {
    planType = subscription.metadata.planType as PlanType;
  }
  if (subscription.metadata?.billingPeriod) {
    billingPeriod = subscription.metadata.billingPeriod as BillingPeriod;
  }

  await prisma.$transaction(async (tx) => {
    await tx.userSubscription.update({
      where: { id: userSubscription.id },
      data: {
        planType,
        billingPeriod,
        isActive: subscription.status === 'active' || subscription.status === 'trialing',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        stripePriceId: subscription.items.data[0]?.price.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });

    await tx.user.update({
      where: { id: userSubscription.userId },
      data: {
        subscriptionTier: mapPlanTypeToTier(planType),
      },
    });
  });

  console.log(`Subscription updated for user ${userSubscription.userId}`);
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.deleted:', subscription.id);

  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    console.error('User subscription not found for Stripe subscription:', subscription.id);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Mark subscription as inactive
    await tx.userSubscription.update({
      where: { id: userSubscription.id },
      data: {
        isActive: false,
        cancelAtPeriodEnd: false,
      },
    });

    // Downgrade user to free tier
    await tx.user.update({
      where: { id: userSubscription.userId },
      data: {
        subscriptionTier: 'FREE',
      },
    });
  });

  console.log(`Subscription deleted for user ${userSubscription.userId}`);
}

/**
 * Handle invoice.paid event
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log('Processing invoice.paid:', invoice.id);

  if (!invoice.subscription) {
    return;
  }

  const subscription = await stripe!.subscriptions.retrieve(invoice.subscription as string);

  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    console.error('User subscription not found for invoice:', invoice.id);
    return;
  }

  // Update subscription to active
  await prisma.userSubscription.update({
    where: { id: userSubscription.id },
    data: {
      isActive: true,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  console.log(`Invoice paid for user ${userSubscription.userId}`);
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing invoice.payment_failed:', invoice.id);

  if (!invoice.subscription) {
    return;
  }

  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string },
  });

  if (!userSubscription) {
    console.error('User subscription not found for invoice:', invoice.id);
    return;
  }

  // Log payment failure (could trigger email notification here)
  console.error(`Payment failed for user ${userSubscription.userId}, subscription ${invoice.subscription}`);

  // Note: Stripe will automatically retry failed payments
  // After multiple failures, Stripe will cancel the subscription and trigger customer.subscription.deleted
}
