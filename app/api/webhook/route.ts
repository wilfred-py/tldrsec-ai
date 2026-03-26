/**
 * Unified Webhook Handler
 *
 * POST /api/webhook?provider=clerk  → Clerk user lifecycle events
 * POST /api/webhook?provider=stripe → Stripe billing events
 */

import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { checkIPTrialAbuse } from '@/lib/security/trial-abuse-prevention';
import { validateWebhookSignature, getPlanTypeFromPriceId, stripe } from '@/lib/stripe';
import { syncUserSubscriptionTier, syncSubscriptionFromStripeData } from '@/lib/stripe/sync-subscription';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = getPrismaClient();

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');

  switch (provider) {
    case 'clerk':
      return handleClerkWebhook(req);
    case 'stripe':
      return handleStripeWebhook(req);
    default:
      return NextResponse.json({ error: 'Unknown provider. Use ?provider=clerk or ?provider=stripe' }, { status: 400 });
  }
}

// ─── Clerk Webhook ──────────────────────────────────────────────────────────

async function handleClerkWebhook(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error missing Svix headers', { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const { Webhook } = await import('svix');
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error verifying webhook', { status: 400 });
  }

  const eventType = evt.type;
  console.log(`Webhook event type: ${eventType}`);

  switch (eventType) {
    case 'user.created':
      try {
        const userData = evt.data;
        const primaryEmail = userData.email_addresses?.[0]?.email_address;

        if (primaryEmail && userData.id) {
          const headerPayloadForIP = await headers();
          const ipAddress = headerPayloadForIP.get('x-forwarded-for')?.split(',')[0]?.trim()
            || headerPayloadForIP.get('x-real-ip')
            || 'unknown';

          // IP abuse check — log for monitoring, but trial lifecycle is now
          // managed by Stripe (CC-required trial on checkout session).
          // Legacy trial fields (trialStartedAt, trialEndsAt, isTrialing) are
          // no longer set for new users.
          if (ipAddress !== 'unknown') {
            try {
              const abuseCheck = await checkIPTrialAbuse(ipAddress);
              if (!abuseCheck.allowed) {
                console.warn(`[trial-abuse] IP ${ipAddress} flagged: ${abuseCheck.reason}`);
              }
            } catch (err) {
              console.error('[trial-abuse] Check failed:', err);
            }
          }

          const newUser = await prisma.user.create({
            data: {
              id: userData.id,
              email: primaryEmail,
              authProvider: 'clerk',
              authProviderId: userData.id,
              name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined,
              subscriptionTier: 'FREE',
              onboardingCompleted: false,
              signupIpAddress: ipAddress !== 'unknown' ? ipAddress : undefined,
            }
          });
          console.log(`User created in database: ${newUser.id}`);
        } else {
          console.error('Missing required user data in webhook:', { id: userData.id, email: primaryEmail });
        }
      } catch (error) {
        console.error('Failed to create user in database from webhook:', error);
      }
      break;
    case 'user.updated':
      console.log('User updated:', evt.data);
      break;
    case 'user.deleted':
      try {
        const userData = evt.data;
        if (userData.id) {
          await prisma.user.delete({ where: { id: userData.id } });
          console.log('User deleted from database:', userData.id);
        }
      } catch (error) {
        console.error('Failed to delete user from database:', error);
      }
      break;
    default:
      console.log('Unhandled webhook event type:', eventType);
  }

  return NextResponse.json({ success: true });
}

// ─── Stripe Webhook ─────────────────────────────────────────────────────────

async function handleStripeWebhook(request: Request) {
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const event = validateWebhookSignature(body, signature);
    if (!event) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`Received Stripe webhook: ${event.type}`);

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
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// ─── Stripe Event Handlers ──────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout completion:', session.id);

  if (session.mode !== 'subscription') return;

  let metadataUserId = session.metadata?.userId;
  const planType = session.metadata?.planType as 'FREE' | 'PRO' | 'MAX' | undefined;

  if (!planType) {
    console.error('[webhook] Missing planType in checkout session metadata:', session.id);
    return;
  }

  let resolvedDbUser: { id: string; authProviderId: string | null } | null = null;
  if (!metadataUserId) {
    const customerEmail = session.customer_details?.email || session.customer_email;
    if (customerEmail) {
      try {
        resolvedDbUser = await prisma.user.findFirst({
          where: { email: customerEmail },
          select: { id: true, authProviderId: true },
        });
        if (resolvedDbUser) {
          metadataUserId = resolvedDbUser.authProviderId || resolvedDbUser.id;
        } else {
          import('@/lib/email/trial-emails')
            .then(({ sendCheckoutReminderEmail }) =>
              sendCheckoutReminderEmail({ email: customerEmail, sessionId: session.id, planType: planType || 'PRO' })
            )
            .catch((emailErr) => console.error('[webhook] Failed to send checkout reminder:', emailErr));
          return;
        }
      } catch (dbError) {
        console.error('[webhook] Email fallback DB lookup failed:', dbError);
        return;
      }
    } else {
      console.error('[webhook] No userId or email available in session:', session.id);
      return;
    }
  }

  try {
    let userId: string;
    if (resolvedDbUser) {
      userId = resolvedDbUser.id;
    } else {
      const dbUser = await prisma.user.findFirst({
        where: { OR: [{ id: metadataUserId }, { authProviderId: metadataUserId }] },
        select: { id: true },
      });
      userId = dbUser?.id ?? metadataUserId!;
    }

    await prisma.userSubscription.upsert({
      where: { userId },
      update: {
        planType,
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: session.customer as string,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId,
        planType: planType || 'PRO',
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: session.customer as string,
        isActive: true,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const planLimits: Record<string, number> = { FREE: 50, PRO: 200, MAX: 1000 };
    const filingLimit = planLimits[planType] || 50;

    await prisma.usagePeriod.upsert({
      where: { userId_periodStart: { userId, periodStart } },
      update: { filingLimit, planType },
      create: { userId, periodStart, periodEnd, planType, filingLimit, resetAt },
    });

    await syncUserSubscriptionTier(userId, planType);
    console.log(`Subscription activated for user ${userId}, plan: ${planType}`);
  } catch (error) {
    console.error('Failed to process checkout completion:', error);
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!userSubscription) {
    try {
      if (stripe) {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer && !customer.deleted && 'email' in customer && customer.email) {
          const dbUser = await prisma.user.findFirst({
            where: { email: customer.email },
            select: { id: true },
          });
          if (dbUser) {
            const { planType } = await syncSubscriptionFromStripeData(dbUser.id, subscription, customerId);
            console.log(`[webhook] Subscription created via email fallback: ${planType}`);
            return;
          }
        }
      }
    } catch (error) {
      console.error('[webhook] Email fallback failed for customer:', customerId, error);
    }
    console.error('User not found for customer:', customerId);
    return;
  }

  try {
    const planType = getPlanTypeFromPriceId(priceId);
    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        planType,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        isActive: ['active', 'trialing'].includes(subscription.status),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });
    await syncUserSubscriptionTier(userSubscription.userId, planType);
  } catch (error) {
    console.error('Failed to process subscription creation:', error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!userSubscription) {
    console.error('User not found for subscription:', subscription.id);
    return;
  }

  try {
    const priceId = subscription.items.data[0]?.price.id;
    const planType = getPlanTypeFromPriceId(priceId);
    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        planType,
        stripePriceId: priceId,
        isActive: ['active', 'trialing'].includes(subscription.status),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });
    await syncUserSubscriptionTier(userSubscription.userId, planType);
  } catch (error) {
    console.error('Failed to process subscription update:', error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
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
      data: { planType: 'FREE', isActive: false, cancelAtPeriodEnd: false, updatedAt: new Date() },
    });
    await syncUserSubscriptionTier(userSubscription.userId, 'FREE');
  } catch (error) {
    console.error('Failed to process subscription deletion:', error);
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string },
  });

  if (!userSubscription) return;

  try {
    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: { isActive: true, updatedAt: new Date() },
    });
  } catch (error) {
    console.error('Failed to process payment success:', error);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string },
    select: { userId: true },
  });

  if (!userSubscription) return;

  const user = await prisma.user.findUnique({
    where: { id: userSubscription.userId },
    select: { email: true, name: true },
  });

  console.log(`Payment failed for user ${userSubscription.userId} (${user?.email})`);

  // Send notification email — catch errors so webhook still returns 200
  // Stripe Smart Retries will handle actual retry logic; we just notify the user
  if (user?.email) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'tldrSEC <noreply@tldrsec.app>',
        to: user.email,
        subject: 'Action needed: Update your payment method',
        html: `
          <p>Hi${user.name ? ` ${user.name}` : ''},</p>
          <p>We were unable to process your payment for tldrSEC. Please update your payment method to continue receiving SEC filing summaries.</p>
          <p><a href="https://tldrsec.app/dashboard/billing" style="display:inline-block;padding:12px 24px;background-color:#7C3AED;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Update Payment Method</a></p>
          <p style="color:#6B7280;font-size:14px;">If you don't update your payment method, your subscription will be cancelled after Stripe's retry attempts are exhausted.</p>
          <p style="color:#9CA3AF;font-size:12px;">tldrSEC | AI-Powered SEC Filing Summaries</p>
        `,
      });
      console.log(`[webhook] Payment failed notification sent to ${user.email}`);
    } catch (emailError) {
      console.error(`[webhook] Failed to send payment failed notification to ${user.email}:`, emailError);
    }
  }
}
