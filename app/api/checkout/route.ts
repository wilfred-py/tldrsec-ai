import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stripe, SUBSCRIPTION_PLANS, getPriceIdForPlan, createCheckoutSession } from '@/lib/stripe';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { getPrismaClient } from '@/lib/db/prisma';
import { TRIAL_CONFIG } from '@/lib/auth/trial-config';

export const dynamic = 'force-dynamic';

const DirectCheckoutSchema = z.object({
  email: z.string().email(),
  planType: z.enum(['PRO', 'MAX']),
});

// Audit-log a checkout attempt to SecurityAuditLog. Failures are swallowed
// so audit-write outages can't break the checkout flow.
async function logCheckoutStarted(data: {
  email: string;
  planType: string;
  amount?: number;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    console.log('[Payment Audit] checkout_started', {
      timestamp: new Date().toISOString(),
      email: data.email,
      amount: data.amount,
    });
    await getPrismaClient().securityAuditLog.create({
      data: {
        eventType: 'checkout_started',
        details: JSON.stringify({
          email: data.email,
          amount: data.amount,
          currency: 'USD',
          metadata: { planType: data.planType },
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        }),
        severity: 'LOW',
        source: 'PAYMENT_SYSTEM',
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Payment Audit] Failed to log checkout_started:', error);
  }
}

async function logCheckoutFailed(data: {
  email: string;
  error: string;
  amount?: number;
  ipAddress?: string;
}): Promise<void> {
  try {
    console.log('[Payment Audit] checkout_failed', {
      timestamp: new Date().toISOString(),
      email: data.email,
      error: data.error,
    });
    await getPrismaClient().securityAuditLog.create({
      data: {
        eventType: 'checkout_failed',
        details: JSON.stringify({
          email: data.email,
          amount: data.amount,
          currency: 'USD',
          ipAddress: data.ipAddress,
          error: data.error,
        }),
        severity: 'HIGH',
        source: 'PAYMENT_SYSTEM',
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Payment Audit] Failed to log checkout_failed:', error);
  }
}

// Apply rate limiting wrapper
const checkoutRateLimit = rateLimit(rateLimitConfigs.checkout);

export async function POST(request: NextRequest) {
  return checkoutRateLimit(request, async (req) => {
  let parsedEmail: string | undefined;
  try {
    const body = await request.json();

    // Parse and validate - rejects FREE planType (only PRO/MAX accepted)
    const { email, planType } = DirectCheckoutSchema.parse(body);
    parsedEmail = email;

    // Extract request metadata for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Log checkout attempt
    await logCheckoutStarted({
      email,
      planType,
      amount: SUBSCRIPTION_PLANS[planType].monthlyPrice,
      ipAddress,
      userAgent,
    });

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const priceId = getPriceIdForPlan(planType, 'monthly');
    if (!priceId) {
      return NextResponse.json({ error: `Price ID not configured for ${planType}` }, { status: 503 });
    }

    const origin = new URL(request.url).origin || 'http://localhost:3000';

    // Parallelize independent checks
    const [openSessions, existingCustomers, dbUser] = await Promise.all([
      // Check for existing open checkout session (race condition prevention)
      stripe.checkout.sessions.list({
        client_reference_id: email,
        status: 'open',
        limit: 1,
      }),
      // Look up existing Stripe customers by email
      stripe.customers.list({ email, limit: 3 }),
      // Look up user in DB by email — fail-open if DB is down
      getPrismaClient().user.findFirst({
        where: { email },
        select: { id: true, authProviderId: true },
      }).catch((dbError: unknown) => {
        console.error('[checkout/direct] DB lookup failed, proceeding without:', dbError);
        return null;
      }),
    ]);

    // Return existing open session if found
    if (openSessions.data.length > 0 && openSessions.data[0].url) {
      return NextResponse.json({
        sessionId: openSessions.data[0].id,
        sessionUrl: openSessions.data[0].url,
      });
    }

    // Check for active/trialing subscriptions across all customers (early break)
    let existingCustomerId: string | undefined;
    for (const customer of existingCustomers.data) {
      // Check both 'active' and 'trialing' to prevent duplicate subscriptions
      const [activeSubs, trialingSubs] = await Promise.all([
        stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 }),
        stripe.subscriptions.list({ customer: customer.id, status: 'trialing', limit: 1 }),
      ]);
      if (activeSubs.data.length > 0 || trialingSubs.data.length > 0) {
        await logCheckoutFailed({
          email,
          error: 'active_subscription_exists',
          ipAddress,
        });
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

    // Create checkout session with CC-required 7-day trial
    const session = await createCheckoutSession({
      priceId,
      customerId: existingCustomerId,
      customerEmail: existingCustomerId ? undefined : email,
      successUrl: `${origin}/onboarding?session_id={CHECKOUT_SESSION_ID}&subscription_success=true`,
      cancelUrl: `${origin}/?cancelled=true`,
      metadata,
      clientReferenceId: email,
      trialPeriodDays: TRIAL_CONFIG.TRIAL_DURATION_DAYS,
      paymentMethodCollection: 'always',
    });

    return NextResponse.json({
      sessionId: session.id,
      sessionUrl: session.url
    });
  } catch (error) {
    // Log checkout failure
    if (parsedEmail) {
      await logCheckoutFailed({
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
