import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';
import { stripe, SUBSCRIPTION_PLANS, getPriceIdForPlan } from '@/lib/stripe';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { PaymentLogger } from '@/lib/audit/payment-logger';
import { getPrismaClient } from '@/lib/db/prisma';
import type Stripe from 'stripe';

const DirectCheckoutSchema = z.object({
  email: z.string().email(),
  planType: z.enum(['FREE', 'PRO', 'MAX']), // 3-tier system restored
});

// Apply rate limiting wrapper
const checkoutRateLimit = rateLimit(rateLimitConfigs.checkout);

export async function POST(request: NextRequest) {
  return checkoutRateLimit(request, async (req) => {
  let parsedEmail: string | undefined;
  try {
    const body = await request.json();

    // Parse and validate - this will throw for invalid emails/plan types
    const { email, planType } = DirectCheckoutSchema.parse(body);
    parsedEmail = email;

    // Extract request metadata for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Log checkout attempt
    await PaymentLogger.checkoutStarted({
      email,
      planType,
      amount: SUBSCRIPTION_PLANS[planType].monthlyPrice,
      ipAddress,
      userAgent,
    });

    // Handle FREE plan — check for existing accounts first, then create via magic link
    if (planType === 'FREE') {
      // Check if email is already registered in Clerk
      const existingClerkUsers = await clerkClient.users.getUserList({
        emailAddress: [email],
        limit: 1,
      });

      if (existingClerkUsers.data.length > 0) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in.' },
          { status: 409 }
        );
      }

      // Check if email exists in our database (e.g., from a previous webhook)
      const existingDbUser = await getPrismaClient().user.findFirst({
        where: { email },
        select: { id: true },
      }).catch(() => null);

      if (existingDbUser) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in.' },
          { status: 409 }
        );
      }

      // Create user with email verification required
      const clerkUser = await clerkClient.users.createUser({
        emailAddresses: [{ emailAddress: email }],
        skipPasswordChecks: true,
      });

      return NextResponse.json({
        planType: 'FREE',
        redirectUrl: '/onboarding',
        userId: clerkUser.id
      });
    }

    // Handle PRO and MAX plans
    if (planType === 'PRO' || planType === 'MAX') {
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
      }

      const priceId = getPriceIdForPlan(planType, 'monthly');
      if (!priceId) {
        return NextResponse.json({ error: `Price ID not configured for ${planType}` }, { status: 503 });
      }

      const origin = new URL(request.url).origin || 'http://localhost:3000';

      // R13: Parallelize independent checks with Promise.all
      // R6: DB call wrapped with .catch() for fail-open behavior
      const [openSessions, existingCustomers, dbUser] = await Promise.all([
        // Issue 1: Check for existing open checkout session (race condition prevention)
        stripe.checkout.sessions.list({
          client_reference_id: email,
          status: 'open',
          limit: 1,
        }),
        // Issue 13: Look up existing Stripe customers by email (limit 3)
        stripe.customers.list({ email, limit: 3 }),
        // R6: Look up user in DB by email — fail-open if DB is down
        getPrismaClient().user.findFirst({
          where: { email },
          select: { id: true, authProviderId: true },
        }).catch((dbError: unknown) => {
          console.error('[checkout/direct] DB lookup failed, proceeding without:', dbError);
          return null;
        }),
      ]);

      // Issue 1: Return existing open session if found
      if (openSessions.data.length > 0 && openSessions.data[0].url) {
        return NextResponse.json({
          sessionId: openSessions.data[0].id,
          sessionUrl: openSessions.data[0].url,
        });
      }

      // Check for active subscriptions across all customers (early break on first active)
      let existingCustomerId: string | undefined;
      for (const customer of existingCustomers.data) {
        const activeSubs = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1,
        });
        if (activeSubs.data.length > 0) {
          // R2: Log with correct PaymentLogger.checkoutFailed signature
          await PaymentLogger.checkoutFailed({
            email,
            error: 'active_subscription_exists',
            ipAddress,
          });
          // Q2: Return 409 with sign-in link
          return NextResponse.json(
            {
              error: 'An active subscription already exists for this email. Please sign in to manage your subscription.',
              signInUrl: '/sign-in',
            },
            { status: 409 }
          );
        }
        // Reuse most recent customer if no active sub
        if (!existingCustomerId) {
          existingCustomerId = customer.id;
        }
      }

      // Build metadata with userId if known
      const metadata: Record<string, string> = { planType, source: 'homepage' };
      if (dbUser?.authProviderId) {
        metadata.userId = dbUser.authProviderId;
      } else if (dbUser?.id) {
        metadata.userId = dbUser.id;
      }

      // Build session params — reuse existing customer or use customer_email
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${origin}/onboarding?session_id={CHECKOUT_SESSION_ID}&subscription_success=true`,
        cancel_url: `${origin}/?cancelled=true`,
        metadata,
        client_reference_id: email,
      };

      if (existingCustomerId) {
        sessionParams.customer = existingCustomerId;
      } else {
        sessionParams.customer_email = email;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return NextResponse.json({
        sessionId: session.id,
        sessionUrl: session.url
      });
    }
  } catch (error) {
    // R2: Log checkout failure with correct signature
    if (parsedEmail) {
      await PaymentLogger.checkoutFailed({
        email: parsedEmail,
        error: error instanceof Error ? error.message : 'Unknown error',
      }).catch(() => {}); // Don't let logger failure mask the real error
    }

    console.error('Checkout API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Invalid email or plan type'
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      message: (error as Error).message || 'Unknown error'
    }, { status: 500 });
  }
  });
}
