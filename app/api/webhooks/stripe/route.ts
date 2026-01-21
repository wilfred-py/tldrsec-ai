import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { headers } from 'next/headers';
import { PaymentLogger } from '@/lib/audit/payment-logger';

// Helper function to get Stripe instance (lazy initialization)
function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(apiKey, {
    apiVersion: '2024-12-18.acacia',
  });
}

// Helper function to get webhook secret
function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

export async function POST(request: NextRequest) {
  const prisma = getPrismaClient();
  
  try {
    // Initialize Stripe and webhook secret at runtime
    const stripe = getStripeClient();
    const webhookSecret = getWebhookSecret();

    // Get the raw body
    const body = await request.text();
    
    // Get the signature from headers
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');
    
    if (!signature) {
      console.error('[Stripe Webhook] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }
    
    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    
    // Audit log the event
    await PaymentLogger.webhookReceived({
      stripeEventId: event.id,
      type: event.type,
    });
    
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Update user subscription in database
        if (session.customer_email && session.subscription) {
          const user = await prisma.user.findUnique({
            where: { email: session.customer_email },
          });
          
          if (user) {
            // Determine tier based on price
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const priceId = subscription.items.data[0]?.price.id;
            
            let tier: 'PRO' | 'MAX' = 'PRO';
            if (priceId === process.env.STRIPE_PRICE_ID_MAX) {
              tier = 'MAX';
            }
            
            // Update user subscription tier
            await prisma.user.update({
              where: { id: user.id },
              data: { 
                subscriptionTier: tier,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: session.subscription as string,
              },
            });
            
            console.log(`[Stripe Webhook] User ${user.id} upgraded to ${tier}`);
          }
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Handle subscription changes (upgrades/downgrades)
        const user = await prisma.user.findUnique({
          where: { stripeSubscriptionId: subscription.id },
        });
        
        if (user) {
          const priceId = subscription.items.data[0]?.price.id;
          let tier: 'FREE' | 'PRO' | 'MAX' = 'FREE';
          
          if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
            tier = 'PRO';
          } else if (priceId === process.env.STRIPE_PRICE_ID_MAX) {
            tier = 'MAX';
          }
          
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionTier: tier },
          });
          
          console.log(`[Stripe Webhook] User ${user.id} subscription updated to ${tier}`);
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Handle subscription cancellation
        const user = await prisma.user.findUnique({
          where: { stripeSubscriptionId: subscription.id },
        });
        
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              subscriptionTier: 'FREE',
              stripeSubscriptionId: null,
            },
          });
          
          console.log(`[Stripe Webhook] User ${user.id} subscription cancelled, reverted to FREE`);
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        
        // Log payment failure for monitoring
        console.error(`[Stripe Webhook] Payment failed for customer ${invoice.customer}`, {
          invoiceId: invoice.id,
          amountDue: invoice.amount_due,
          attemptCount: invoice.attempt_count,
        });
        
        // Could trigger email notification here
        break;
      }
      
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
    
    // Return success response
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('[Stripe Webhook] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}