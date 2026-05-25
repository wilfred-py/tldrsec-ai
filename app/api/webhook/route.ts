/**
 * Unified Webhook Handler
 *
 * POST /api/webhook?provider=clerk  → Clerk user lifecycle events
 * POST /api/webhook?provider=stripe → Stripe billing events
 * POST /api/webhook?provider=resend → Resend email engagement events (open/click)
 */

import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { checkIPTrialAbuse } from '@/lib/security/trial-abuse-prevention';
import { validateWebhookSignature, getPlanTypeFromPriceId, isFoundingLifetimePriceId, stripe } from '@/lib/stripe';
import { syncUserSubscriptionTier, syncSubscriptionFromStripeData, getSubscriptionPeriod, syncLifetimeSeat, revokeLifetimeSeat } from '@/lib/stripe/sync-subscription';
import { isLifetimeSentinel } from '@/lib/stripe/constants';
import Stripe from 'stripe';
import { waitUntil } from '@vercel/functions';
import { captureServerEvent, shutdownServerPostHog } from '@/lib/analytics/posthog-server';
import { EVENTS, type PlanTier, type BillingPeriod } from '@/lib/analytics/events';

function mapPlanType(planType: string | null | undefined): PlanTier {
  const lower = (planType || 'free').toLowerCase();
  if (lower === 'pro' || lower === 'max' || lower === 'starter') return lower;
  return 'free';
}

function inferBillingPeriod(session: Stripe.Checkout.Session | Stripe.Subscription): BillingPeriod {
  // Checkout session carries this on the line_items; subscription on items.data[0].price.recurring.interval
  if ('items' in session) {
    const interval = session.items?.data?.[0]?.price?.recurring?.interval;
    return interval === 'year' ? 'annual' : 'monthly';
  }
  return 'monthly';
}

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
    case 'resend':
      return handleResendWebhook(req);
    default:
      return NextResponse.json({ error: 'Unknown provider. Use ?provider=clerk, ?provider=stripe, or ?provider=resend' }, { status: 400 });
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

          // Pre-populated waitlist users (created by
          // scripts/founding/pre-populate-waitlist-users.ts OR auto-created in
          // handlePaymentModeCheckout) already have a User row keyed on email
          // with `authProvider='pending'`. When the real Clerk signup arrives,
          // link the Clerk identity to THAT row only. We deliberately do NOT
          // change `User.id` because existing FK relations (UserSubscription,
          // Ticker, AuditLog, anything created by the Founding payment
          // webhook) point at it.
          //
          // SECURITY: Only link to rows with authProvider='pending'. Linking
          // to an existing authProvider='clerk' row would let a fresh Clerk
          // signup overwrite an established account's Clerk identity, which
          // is an account-takeover primitive. If we encounter a non-pending
          // row, log+abort and let Clerk's email-uniqueness fail loudly.
          //
          // Email lookup is lowercased to match how all other code paths
          // (handlePaymentModeCheckout, pre-populate script) store the email.
          // Clerk does not guarantee primaryEmail case.
          const normalizedEmail = primaryEmail.toLowerCase();
          const existing = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, authProvider: true },
          });
          const computedName = userData.first_name
            ? `${userData.first_name} ${userData.last_name || ''}`.trim()
            : undefined;
          let resolvedUserId: string;
          if (existing && existing.authProvider === 'pending') {
            await prisma.user.update({
              where: { id: existing.id },
              data: {
                authProvider: 'clerk',
                authProviderId: userData.id,
                ...(computedName ? { name: computedName } : {}),
                ...(ipAddress !== 'unknown' ? { signupIpAddress: ipAddress } : {}),
              },
            });
            resolvedUserId = existing.id;
            console.log(
              `[clerk-webhook] Linked Clerk identity ${userData.id} to placeholder User ${existing.id}`,
            );
          } else if (existing) {
            // Existing row already has a real auth provider. Do NOT overwrite
            // (account-takeover guard). Let the create below fail on the
            // email unique constraint so Clerk retries / surfaces the conflict.
            console.error(
              `[clerk-webhook] Refusing to link Clerk identity ${userData.id} onto existing User ${existing.id} ` +
                `with authProvider=${existing.authProvider}. Possible account-takeover attempt or stale Clerk webhook.`,
            );
            return NextResponse.json({ success: false, error: 'email already linked' }, { status: 409 });
          } else {
            const newUser = await prisma.user.create({
              data: {
                id: userData.id,
                email: normalizedEmail,
                authProvider: 'clerk',
                authProviderId: userData.id,
                name: computedName,
                subscriptionTier: 'FREE',
                onboardingCompleted: false,
                signupIpAddress: ipAddress !== 'unknown' ? ipAddress : undefined,
              },
            });
            resolvedUserId = newUser.id;
            console.log(`User created in database: ${newUser.id}`);
          }
          void resolvedUserId;
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
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Flush any queued PostHog server events before the serverless fn terminates.
    // Non-blocking for the HTTP response; Vercel keeps the fn alive until the promise settles.
    waitUntil(shutdownServerPostHog());

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    waitUntil(shutdownServerPostHog());
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// ─── Stripe Event Handlers ──────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout completion:', session.id);

  // Lifetime Seat purchases use mode: 'payment' (one-time), not 'subscription'.
  // Branch here because line_items must be fetched separately for payment-mode
  // sessions (Stripe doesn't include them on the session object by default) and
  // the entitlement write differs from the recurring path. See ADR-0004.
  if (session.mode === 'payment') {
    await handlePaymentModeCheckout(session);
    return;
  }

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

    // Server-side analytics: the *real* checkout_completed event (client-side
    // checkout_initiated fires before the Stripe redirect, so this is the
    // ground-truth conversion).
    try {
      const amountCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
      const currency = session.currency?.toUpperCase() || 'USD';
      captureServerEvent(userId, EVENTS.CHECKOUT_COMPLETED, {
        plan: mapPlanType(planType),
        // Checkout session doesn't always carry interval explicitly; default to monthly.
        // (handleSubscriptionCreated below has the recurring.interval and will fire TRIAL_STARTED if needed.)
        billing_period: 'monthly',
        amount_cents: amountCents,
        currency,
      });
    } catch (analyticsErr) {
      console.error('[webhook] PostHog capture failed (non-fatal):', analyticsErr);
    }
  } catch (error) {
    console.error('Failed to process checkout completion:', error);
  }
}

/**
 * Handle `checkout.session.completed` for `mode: 'payment'` sessions.
 *
 * Currently only the Founding Lifetime Seat purchase flows through here.
 * Any other payment-mode checkout is logged and ignored. When new
 * one-time products are added, extend the priceId-routing logic below.
 *
 * Differs from the subscription-mode handler (above) in three ways:
 *   1. Line items must be fetched separately (Stripe doesn't include them
 *      on the session object by default for payment-mode sessions).
 *   2. There is no `session.subscription`; entitlement is anchored on the
 *      Founding flag + sentinel UserSubscription row written by
 *      `syncLifetimeSeat`.
 *   3. User resolution prefers `client_reference_id` (set by the founding
 *      checkout route to the email) over the email fields, because the
 *      founding flow always populates it.
 */
async function handlePaymentModeCheckout(session: Stripe.Checkout.Session) {
  if (!stripe) {
    console.error('[webhook] Stripe client not configured; cannot process payment-mode checkout');
    return;
  }

  let priceId: string | undefined;
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    priceId = lineItems.data[0]?.price?.id;
  } catch (err) {
    console.error('[webhook] Failed to list payment-mode line items:', err);
    return;
  }

  if (!priceId) {
    console.error('[webhook] Payment-mode session missing priceId:', session.id);
    return;
  }

  if (!isFoundingLifetimePriceId(priceId)) {
    console.log(`[webhook] Payment-mode checkout with non-Founding priceId ${priceId}; ignoring`);
    return;
  }

  // Resolve user. Prefer client_reference_id (always email for founding flow),
  // fall back to customer_details.email, then session.customer_email.
  const candidateEmail =
    session.client_reference_id ||
    session.customer_details?.email ||
    session.customer_email ||
    null;

  if (!candidateEmail) {
    console.error('[webhook] No email found on payment-mode session:', session.id);
    return;
  }

  // Resolve OR auto-create the User. Most waitlist members (122/124 today)
  // do not have a User row because they never completed Clerk signup. When
  // they pay, we create a placeholder User keyed on email with sentinel
  // `authProvider='pending'`. Later, when they complete Clerk signup using
  // the same email, the patched Clerk webhook (`handleClerkWebhook`,
  // `user.created` branch) finds this row by email and links the real
  // Clerk identity onto it without disturbing FK relations.
  let dbUser = await prisma.user.findFirst({
    where: { email: candidateEmail.toLowerCase(), deletedAt: null },
    select: { id: true, authProvider: true },
  });

  if (!dbUser) {
    try {
      const created = await prisma.user.create({
        data: {
          email: candidateEmail.toLowerCase(),
          authProvider: 'pending',
          authProviderId: `pending-lifetime-${session.id}`,
          subscriptionTier: 'FREE', // syncLifetimeSeat below flips to MAX in the same write
          foundingMember: false,
          onboardingCompleted: false,
        },
        select: { id: true, authProvider: true },
      });
      dbUser = created;
      console.log(
        `[webhook] Auto-created placeholder User for Lifetime payment: id=${created.id} email=${candidateEmail}`,
      );
    } catch (createErr) {
      console.error(
        `[webhook] Failed to auto-create User for Lifetime payment ${candidateEmail}; ` +
          `session ${session.id}. Manual reconciliation required.`,
        createErr,
      );
      return;
    }
  }

  const customerId = session.customer as string;
  try {
    await syncLifetimeSeat(dbUser.id, priceId, customerId);
    console.log(`[webhook] Lifetime Seat granted: user=${dbUser.id} session=${session.id}`);

    try {
      const amountCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
      const currency = session.currency?.toUpperCase() || 'USD';
      const batch = session.metadata?.batch || undefined;
      captureServerEvent(dbUser.id, EVENTS.LIFETIME_SEAT_CLAIMED, {
        amount_cents: amountCents,
        currency,
        ...(batch ? { batch } : {}),
      });
    } catch (analyticsErr) {
      console.error('[webhook] PostHog capture failed (non-fatal):', analyticsErr);
    }
  } catch (syncErr) {
    console.error('[webhook] syncLifetimeSeat failed:', syncErr);
  }
}

/**
 * Handle `charge.refunded` for Lifetime Seat refunds.
 *
 * Within the 30-day refund window, any refund issued against a Founding
 * Lifetime payment triggers `revokeLifetimeSeat`, which atomically clears
 * the founding flag, downgrades the tier to FREE, deactivates the sentinel
 * UserSubscription row, and writes an AuditLog entry.
 *
 * Refunds against non-Founding charges (e.g., a subscription invoice refund)
 * are logged and ignored. Those flows are owned by the existing
 * subscription handlers.
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!stripe) {
    console.error('[webhook] Stripe client not configured; cannot process charge.refunded');
    return;
  }

  // Only act on FULL refunds. Partial refunds (e.g., a $50 goodwill refund
  // on a $499 charge) also fire `charge.refunded` but the customer still
  // holds 90% of the value and we should not revoke their access.
  // `charge.refunded === true` and `amount_refunded >= amount` both signal
  // full refund; we check both for defense-in-depth against Stripe API
  // inconsistencies.
  const fullyRefunded =
    charge.refunded === true || (typeof charge.amount_refunded === 'number' && charge.amount_refunded >= charge.amount);
  if (!fullyRefunded) {
    console.log(
      `[webhook] charge.refunded for partial refund (refunded ${charge.amount_refunded}/${charge.amount}); not revoking`,
    );
    return;
  }

  // Charges from payment-mode checkouts have a payment_intent we can trace
  // back to the original checkout session. We look up that session's line
  // items to determine if the refunded charge corresponds to a Founding price.
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;

  if (!paymentIntentId) {
    console.log('[webhook] charge.refunded without payment_intent; ignoring');
    return;
  }

  let priceId: string | undefined;
  let sessionId: string | undefined;
  let sessionCustomerId: string | undefined;
  let sessionClientReference: string | undefined;
  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    const session = sessions.data[0];
    sessionId = session?.id;
    sessionCustomerId =
      typeof session?.customer === 'string'
        ? (session?.customer as string)
        : session?.customer?.id;
    sessionClientReference = session?.client_reference_id ?? undefined;
    if (!sessionId) {
      console.log(`[webhook] No checkout session found for refunded payment_intent ${paymentIntentId}; ignoring`);
      return;
    }
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 1 });
    priceId = lineItems.data[0]?.price?.id;
  } catch (err) {
    console.error('[webhook] Failed to trace refunded charge to session:', err);
    return;
  }

  if (!isFoundingLifetimePriceId(priceId)) {
    console.log(`[webhook] charge.refunded for non-Founding priceId ${priceId}; ignoring`);
    return;
  }

  // Three resolution paths to find the affected User:
  //   1. charge.customer (the production happy path)
  //   2. session.customer (production edge: charge object missing it)
  //   3. session.client_reference_id, which our checkout route always sets to the
  //      lowercased email (legacy data, manual refunds, or test fixtures where
  //      the Customer object never got created).
  // Only one path needs to succeed.
  const chargeCustomerId =
    typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
  const customerId = chargeCustomerId || sessionCustomerId;

  let userId: string | undefined;
  if (customerId) {
    const userSub = await prisma.userSubscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { userId: true },
    });
    userId = userSub?.userId;
  }
  if (!userId && sessionClientReference) {
    const userByEmail = await prisma.user.findFirst({
      where: { email: sessionClientReference.toLowerCase(), foundingMember: true },
      select: { id: true },
    });
    userId = userByEmail?.id;
  }
  if (!userId) {
    console.error(
      `[webhook] charge.refunded for Founding price; could not resolve user. ` +
        `charge=${charge.id} session=${sessionId} chargeCustomer=${chargeCustomerId} ` +
        `sessionCustomer=${sessionCustomerId} clientReference=${sessionClientReference}`,
    );
    return;
  }

  const userSub = { userId };

  try {
    await revokeLifetimeSeat(userSub.userId, 'charge.refunded');
    console.log(`[webhook] Lifetime Seat revoked via charge.refunded: user=${userSub.userId} charge=${charge.id}`);

    try {
      const created = charge.created ? new Date(charge.created * 1000) : null;
      const daysSince = created ? Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000)) : undefined;
      captureServerEvent(userSub.userId, EVENTS.LIFETIME_SEAT_REVOKED, {
        reason: 'charge.refunded',
        ...(daysSince !== undefined ? { days_since_purchase: daysSince } : {}),
      });
    } catch (analyticsErr) {
      console.error('[webhook] PostHog capture failed (non-fatal):', analyticsErr);
    }
  } catch (revokeErr) {
    console.error('[webhook] revokeLifetimeSeat failed:', revokeErr);
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

  // Lifetime Seat guard: a Lifetime holder's UserSubscription row carries
  // the sentinel currentPeriodEnd (year 9999) and stripeSubscriptionId=null.
  // If they ever go through a regular checkout, overwriting that row would
  // silently destroy their lifetime entitlement. Refuse to overwrite.
  // ADR-0004 documents that Lifetime tier supersedes any later subscription.
  if (isLifetimeSentinel(userSubscription.currentPeriodEnd)) {
    console.error(
      `[webhook] Refusing to overwrite Lifetime Seat row for user ${userSubscription.userId} ` +
        `with new subscription ${subscription.id}. The Lifetime entitlement is preserved.`,
    );
    return;
  }

  try {
    const planType = getPlanTypeFromPriceId(priceId);
    const period = getSubscriptionPeriod(subscription);
    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        planType,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        isActive: ['active', 'trialing'].includes(subscription.status),
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });
    await syncUserSubscriptionTier(userSubscription.userId, planType);

    // Server-side analytics: TRIAL_STARTED fires when the subscription enters
    // trialing status (Stripe creates subscription with status=trialing when
    // checkout uses trial_period_days).
    try {
      if (subscription.status === 'trialing') {
        captureServerEvent(userSubscription.userId, EVENTS.TRIAL_STARTED, {
          plan: mapPlanType(planType),
        });
      }
    } catch (analyticsErr) {
      console.error('[webhook] PostHog capture failed (non-fatal):', analyticsErr);
    }
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
    const period = getSubscriptionPeriod(subscription);

    // Detect trial -> paid conversion: prior status was trialing, new is active.
    const wasTrialing = userSubscription.isActive && userSubscription.planType !== 'FREE';
    const nowActive = subscription.status === 'active';
    const shouldFireTrialConverted = nowActive && wasTrialing;

    await prisma.userSubscription.update({
      where: { userId: userSubscription.userId },
      data: {
        planType,
        stripePriceId: priceId,
        isActive: ['active', 'trialing'].includes(subscription.status),
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });
    await syncUserSubscriptionTier(userSubscription.userId, planType);

    try {
      if (shouldFireTrialConverted) {
        captureServerEvent(userSubscription.userId, EVENTS.TRIAL_CONVERTED, {
          plan: mapPlanType(planType),
          billing_period: inferBillingPeriod(subscription),
        });
      }
    } catch (analyticsErr) {
      console.error('[webhook] PostHog capture failed (non-fatal):', analyticsErr);
    }
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

// ─── Resend Webhook ─────────────────────────────────────────────────────────

/**
 * Resend posts engagement events (sent, delivered, opened, clicked, bounced,
 * complained, delivery_delayed) signed with Svix. We only forward the two
 * engagement events that aren't already covered by client-side autocapture:
 * email.opened and email.clicked.
 *
 * Outbound tags are written by lib/email/summary-service.ts as {name, value}
 * pairs (template, userId, filingId, formType, ticker). Resend hands them back
 * on the event payload as a flat Record<string,string>, which we lift onto the
 * PostHog event so each engagement is fully attributable.
 */

type ResendTag = { name: string; value: string };

interface ResendEmailEventData {
  email_id?: string;
  to?: string[] | string;
  from?: string;
  subject?: string;
  created_at?: string;
  tags?: Record<string, string> | ResendTag[];
  click?: { link?: string };
}

interface ResendEvent {
  type: string;
  created_at?: string;
  data: ResendEmailEventData;
}

function normalizeResendTags(tags: ResendEmailEventData['tags']): Record<string, string> {
  if (!tags) return {};
  if (Array.isArray(tags)) {
    return tags.reduce<Record<string, string>>((acc, t) => {
      if (t && typeof t.name === 'string') acc[t.name] = String(t.value ?? '');
      return acc;
    }, {});
  }
  return tags;
}

async function handleResendWebhook(req: Request) {
  const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[webhook][resend] RESEND_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read svix headers directly from the incoming Request. Next's headers()
  // helper requires an app-router request context and breaks in unit tests;
  // the Request object is the same shape in prod and tests.
  const svix_id = req.headers.get('svix-id');
  const svix_timestamp = req.headers.get('svix-timestamp');
  const svix_signature = req.headers.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing Svix headers', { status: 400 });
  }

  const body = await req.text();

  let evt: ResendEvent;
  try {
    const { Webhook } = await import('svix');
    const wh = new Webhook(WEBHOOK_SECRET);
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ResendEvent;
  } catch (err) {
    console.error('[webhook][resend] Signature verification failed:', err);
    return new Response('Signature verification failed', { status: 400 });
  }

  try {
    if (evt.type === 'email.sent' || evt.type === 'email.opened' || evt.type === 'email.clicked') {
      const tagMap = normalizeResendTags(evt.data.tags);

      // Dual-key fallback (camelCase + snake_case) — matches the existing
      // pattern documented in wiki/product/resend-webhook.md. Guards against
      // Resend payload format flips.
      const subscriberIdTag = tagMap.subscriberId || tagMap.subscriber_id;
      const campaignIdTag   = tagMap.campaignId   || tagMap.campaign_id;
      const emailIdTag      = tagMap.emailId      || tagMap.email_id;
      const cohortIdTag     = tagMap.cohortId     || tagMap.cohort_id;

      // Transactional emails carry userId; campaign emails carry subscriberId.
      // Either is a valid PostHog distinct_id. Subscriber ids are prefixed
      // `sub_<uuid>` so they never collide with Clerk user cuids when the
      // landing-page identify call later aliases them together.
      const userId = tagMap.userId || tagMap.user_id;
      const distinctId = userId || (subscriberIdTag ? `sub_${subscriberIdTag}` : undefined);
      const isSubscriber = !userId && !!subscriberIdTag;

      if (!distinctId) {
        // No attribution — skip silently. Resend still gets a 200 so it
        // doesn't retry, but we don't pollute PostHog with anonymous events.
        console.warn(`[webhook][resend] ${evt.type} missing distinct_id (userId or subscriberId) tag for email ${evt.data.email_id}`);
      } else {
        const baseProps = {
          email_id: evt.data.email_id || '',
          template: tagMap.template,
          form_type: tagMap.formType || tagMap.form_type,
          ticker: tagMap.ticker,
          filing_id: tagMap.filingId || tagMap.filing_id,
          // Campaign attribution (only set for newsletter campaign emails)
          campaign_id: campaignIdTag,
          email_position: emailIdTag,           // 'e1' | 'e2' | 'e3'
          cohort_id: cohortIdTag,               // 'c1' | 'c2' | 'c3'
          is_subscriber: isSubscriber,
        };

        if (evt.type === 'email.sent') {
          captureServerEvent(distinctId, EVENTS.EMAIL_SENT, baseProps);
        } else if (evt.type === 'email.opened') {
          captureServerEvent(distinctId, EVENTS.EMAIL_OPENED, baseProps);
        } else {
          captureServerEvent(distinctId, EVENTS.EMAIL_CLICKED, {
            ...baseProps,
            link: evt.data.click?.link,
          });
        }
      }
    } else if (evt.type === 'email.bounced' || evt.type === 'email.complained') {
      // Suppression-list updates. Mark the subscriber's row in Supabase so
      // the campaign send route stops shipping to dead/spam-complaining
      // addresses. Also forward to PostHog so the funnel-failure investigation
      // has the recipient + bounce_type without needing to query Resend.
      await handleResendSuppressionEvent(evt);

      const recipient = Array.isArray(evt.data.to) ? evt.data.to[0] : evt.data.to;
      if (recipient) {
        const tagMap = normalizeResendTags(evt.data.tags);
        const subscriberIdTag = tagMap.subscriberId || tagMap.subscriber_id;
        const userId = tagMap.userId || tagMap.user_id;
        const distinctId = userId || (subscriberIdTag ? `sub_${subscriberIdTag}` : recipient);
        if (evt.type === 'email.bounced') {
          const bounceType = (evt.data as ResendEmailEventData & { bounce?: { type?: string } }).bounce?.type ?? 'undetermined';
          captureServerEvent(distinctId, EVENTS.EMAIL_BOUNCED, {
            email_id: evt.data.email_id || '',
            recipient,
            bounce_type: bounceType,
          });
        } else {
          captureServerEvent(distinctId, EVENTS.EMAIL_COMPLAINED, {
            email_id: evt.data.email_id || '',
            recipient,
          });
        }
      }
    }
    // delivered / delivery_delayed: acknowledged but not forwarded —
    // these don't move the funnel and don't affect deliverability state.
  } catch (err) {
    console.error('[webhook][resend] Handler error (non-fatal, returning 200):', err);
  }

  waitUntil(shutdownServerPostHog());
  return NextResponse.json({ received: true });
}

/**
 * Handle Resend `email.bounced` and `email.complained` events.
 *
 * Looks up the subscriber by recipient email and writes the event timestamp
 * (and bounce_type, for bounces) onto the row. The campaign send route's
 * SELECT filter excludes any row with bounced_at OR complained_at set, so
 * this naturally suppresses follow-up emails to the same address.
 *
 * Errors are logged but don't propagate — Resend gets a 200 either way.
 * If a webhook event arrives for an address we don't have a row for (e.g.
 * a transactional User who isn't a newsletter subscriber), the UPDATE
 * affects 0 rows and we move on.
 */
async function handleResendSuppressionEvent(evt: ResendEvent): Promise<void> {
  const recipient = Array.isArray(evt.data.to) ? evt.data.to[0] : evt.data.to;
  if (!recipient || typeof recipient !== 'string') {
    console.warn(`[webhook][resend] ${evt.type} missing recipient address`);
    return;
  }

  const { createSupabaseServiceClient } = await import('@/lib/supabase/server-client');
  const supabase = createSupabaseServiceClient();

  if (evt.type === 'email.bounced') {
    // Resend's bounce payload includes a `bounce` object with `type` (hard|soft|undetermined).
    const bounceData = (evt.data as ResendEmailEventData & { bounce?: { type?: string } }).bounce;
    const bounceType = bounceData?.type ?? 'undetermined';
    const { error, count } = await supabase
      .from('newsletter_subscribers')
      .update({ bounced_at: new Date().toISOString(), bounce_type: bounceType }, { count: 'exact' })
      .eq('email', recipient)
      .is('bounced_at', null);  // don't overwrite an earlier bounce timestamp

    if (error) {
      console.error(`[webhook][resend] Failed to mark bounce for ${recipient}:`, error.message);
    } else if ((count ?? 0) > 0) {
      console.log(`[webhook][resend] Marked ${recipient} as bounced (${bounceType})`);
    }
  } else {
    // email.complained
    const { error, count } = await supabase
      .from('newsletter_subscribers')
      .update({ complained_at: new Date().toISOString() }, { count: 'exact' })
      .eq('email', recipient)
      .is('complained_at', null);

    if (error) {
      console.error(`[webhook][resend] Failed to mark complaint for ${recipient}:`, error.message);
    } else if ((count ?? 0) > 0) {
      console.log(`[webhook][resend] Marked ${recipient} as complained`);
    }
  }
}
