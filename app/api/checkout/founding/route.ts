/**
 * Founding Lifetime Seat checkout route.
 *
 * Creates a Stripe Checkout Session in `mode: 'payment'` (one-time) for the
 * $499 Lifetime Seat offer. Differs from `/api/checkout` in that:
 *
 *   - No 7-day CC-required trial (paid up front)
 *   - Server-side seat-limit gate (25 seats, accept-overrun under low concurrency)
 *   - Sold-out returns 410 Gone
 *   - The matching webhook branch is `handlePaymentModeCheckout` in
 *     `app/api/webhook/route.ts` (not `handleSubscriptionCreated`)
 *
 * See ADR-0004 for the full design rationale.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stripe } from '@/lib/stripe';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { getPrismaClient } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const FOUNDING_SEAT_LIMIT = 25;
const FOUNDING_AMOUNT_LABEL = '$499 one-time'; // for logs

const FoundingCheckoutSchema = z.object({
  email: z.string().email(),
  batch: z.string().min(1).max(64).optional(), // utm_content / email batch label
});

const checkoutRateLimit = rateLimit(rateLimitConfigs.checkout);

export async function POST(request: NextRequest) {
  return checkoutRateLimit(request, async () => {
    try {
      const body = await request.json().catch(() => null);
      if (!body) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }

      const parsed = FoundingCheckoutSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid email or batch parameter' },
          { status: 400 },
        );
      }
      const { email, batch } = parsed.data;

      if (!stripe) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
      }

      const priceId = process.env.STRIPE_FOUNDING_LIFETIME_PRICE_ID;
      if (!priceId) {
        return NextResponse.json(
          { error: 'Founding Lifetime price not configured' },
          { status: 503 },
        );
      }

      // Seat-limit gate. Accept overrun under low concurrency (see ADR-0004
      // and prior review I3): two simultaneous checkouts at seat 24 may both
      // succeed and we ship 26 seats. Acceptable for one-shot offer at this
      // scale; a stricter SERIALIZABLE transaction is over-engineering.
      const prisma = getPrismaClient();
      const claimedCount = await prisma.user.count({
        where: { foundingMember: true, deletedAt: null },
      });
      if (claimedCount >= FOUNDING_SEAT_LIMIT) {
        console.log(
          `[founding/checkout] Sold out (${claimedCount}/${FOUNDING_SEAT_LIMIT}); rejecting email=${email}`,
        );
        return NextResponse.json(
          { error: 'All Founding Lifetime Seats are claimed.', soldOut: true },
          { status: 410 }, // 410 Gone — semantically correct for sold-out
        );
      }

      // Waitlist allowlist gate. The Founding offer is only available to
      // members of the existing waitlist (newsletter_subscribers in Supabase).
      // Without this, anyone with the URL could pay $499 for someone else's
      // email and the seat would land on the wrong account. The URL is not
      // publicized but it's reachable; this gate makes the offer private in
      // substance, not just in marketing.
      try {
        const { createSupabaseServiceClient } = await import('@/lib/supabase/server-client');
        const supabase = await createSupabaseServiceClient();
        const lowercaseEmail = email.toLowerCase();
        const { data: subscriber, error: subscriberErr } = await supabase
          .from('newsletter_subscribers')
          .select('email')
          .eq('email', lowercaseEmail)
          .maybeSingle();
        if (subscriberErr) {
          console.error('[founding/checkout] Waitlist lookup failed:', subscriberErr);
          return NextResponse.json({ error: 'Unable to verify waitlist membership. Try again shortly.' }, { status: 503 });
        }
        if (!subscriber) {
          console.log(`[founding/checkout] Email not on waitlist: ${lowercaseEmail}`);
          return NextResponse.json(
            { error: 'This offer is private to our waitlist. If you signed up at tldrsec.app, use the same email.' },
            { status: 403 },
          );
        }
      } catch (lookupErr) {
        console.error('[founding/checkout] Waitlist lookup threw:', lookupErr);
        return NextResponse.json({ error: 'Unable to verify waitlist membership. Try again shortly.' }, { status: 503 });
      }

      // Pin origin to NEXT_PUBLIC_SITE_URL rather than the request URL so an
      // attacker cannot use a forged Host header to redirect Stripe's
      // success_url to a phishing domain. Fall back to request origin only if
      // the env var is unset (local dev). In prod, this env var must be set.
      const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
      const origin = envOrigin || new URL(request.url).origin || 'http://localhost:3000';

      // Always create a fresh Stripe Customer for the Founding flow rather
      // than reusing one by email. Reusing risks attaching the Lifetime
      // payment to a Customer that belongs to a different person (e.g., the
      // payer typed someone else's email, or two unrelated Stripe customers
      // share an email). The downside is the customer ends up with two
      // Stripe Customer objects if they later become a PRO/MAX subscriber,
      // which is acceptable for a one-shot lifetime cohort.

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/founding/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/founding?cancelled=true${batch ? `&batch=${encodeURIComponent(batch)}` : ''}`,
        customer_email: email,
        // client_reference_id used by webhook to resolve user when metadata is sparse
        client_reference_id: email.toLowerCase(),
        metadata: {
          source: 'founding_lifetime',
          ...(batch ? { batch } : {}),
        },
        // Founding receipt is the audit trail; allow promotion codes off because
        // the offer is the discount.
        allow_promotion_codes: false,
        billing_address_collection: 'required',
      });

      console.log(
        `[founding/checkout] Session created: ${session.id} for ${email} (${FOUNDING_AMOUNT_LABEL})`,
      );

      return NextResponse.json({
        sessionId: session.id,
        sessionUrl: session.url,
      });
    } catch (error) {
      // Log full details server-side; respond with a generic message so
      // unauthenticated callers don't see Prisma / Stripe internals.
      console.error('[founding/checkout] Error:', error);
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
