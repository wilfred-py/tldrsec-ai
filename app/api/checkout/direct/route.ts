import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';
import { stripe, SUBSCRIPTION_PLANS } from '@/lib/stripe';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { PaymentLogger } from '@/lib/audit/payment-logger';

const DirectCheckoutSchema = z.object({
  email: z.string().email(),
  planType: z.enum(['FREE', 'PRO', 'MAX']), // 3-tier system restored
});

// Apply rate limiting wrapper
const checkoutRateLimit = rateLimit(rateLimitConfigs.checkout);

export async function POST(request: NextRequest) {
  return checkoutRateLimit(request, async (req) => {
  try {
    const body = await request.json();
    
    // Parse and validate - this will throw for invalid emails/plan types
    const { email, planType } = DirectCheckoutSchema.parse(body);
    
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
    
    // Handle FREE plan - create account immediately
    if (planType === 'FREE') {
      const clerkUser = await clerkClient.users.createUser({
        emailAddresses: [{ emailAddress: email }],
        skipPasswordChecks: true
      });

      return NextResponse.json({
        planType: 'FREE',
        redirectUrl: '/onboarding',
        userId: clerkUser.id
      });
    }
    
    // Handle PRO and MAX plans
    if (planType === 'PRO' || planType === 'MAX') {
      const plan = SUBSCRIPTION_PLANS[planType];
      const priceId = plan.monthlyPriceId; // Default monthly only
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${request.nextUrl?.origin || 'http://localhost:3000'}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${request.nextUrl?.origin || 'http://localhost:3000'}/?cancelled=true`,
        customer_email: email,
        metadata: { planType, source: 'homepage' }
      });

      return NextResponse.json({
        sessionId: session.id,
        sessionUrl: session.url
      });
    }
  } catch (error) {
    console.error('Checkout API error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Invalid email or plan type' 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    }, { status: 500 });
  }
  });
}