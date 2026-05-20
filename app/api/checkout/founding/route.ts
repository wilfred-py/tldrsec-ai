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

      const origin = new URL(request.url).origin || 'http://localhost:3000';

      // Pass through to existing Stripe customer if one exists for this email,
      // so the customer's payment history is unified.
      const existingCustomers = await stripe.customers.list({ email, limit: 1 });
      const existingCustomerId = existingCustomers.data[0]?.id;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/founding/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/founding?cancelled=true${batch ? `&batch=${encodeURIComponent(batch)}` : ''}`,
        customer: existingCustomerId,
        customer_email: existingCustomerId ? undefined : email,
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
      console.error('[founding/checkout] Error:', error);
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }
      return NextResponse.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  });
}
