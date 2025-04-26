import Stripe from 'stripe';
import { storage } from '../storage';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Missing STRIPE_SECRET_KEY environment variable. Stripe functionality will be disabled.');
}

// Initialize Stripe with the secret key
// Using the latest API version compatible with TypeScript definitions
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' as any })
  : null;

/**
 * Creates a payment intent for a one-time payment
 */
export async function createPaymentIntent(amount: number): Promise<{ clientSecret: string | null }> {
  try {
    if (!stripe) {
      console.error('Stripe not initialized');
      return { clientSecret: null };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
    });

    return { clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return { clientSecret: null };
  }
}

/**
 * Creates or retrieves a subscription for a user
 */
export async function getOrCreateSubscription(userId: number): Promise<{ 
  subscriptionId: string | null;
  clientSecret: string | null;
}> {
  try {
    if (!stripe) {
      console.error('Stripe not initialized');
      return { subscriptionId: null, clientSecret: null };
    }

    // Get the user
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if the user already has a subscription
    if (user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        // Only attempt to get the payment intent if there's a latest invoice
        if (subscription.latest_invoice) {
          try {
            const invoice = await stripe.invoices.retrieve(subscription.latest_invoice as string);
            
            // Check if the invoice has a payment intent using type assertion
            const invoiceWithPaymentIntent = invoice as unknown as { payment_intent?: string };
            if (invoiceWithPaymentIntent.payment_intent) {
              const paymentIntent = invoiceWithPaymentIntent.payment_intent;
              const pi = await stripe.paymentIntents.retrieve(paymentIntent);
              
              if (pi.client_secret) {
                return {
                  subscriptionId: subscription.id,
                  clientSecret: pi.client_secret,
                };
              }
            }
          } catch (error) {
            console.error('Error retrieving invoice or payment intent:', error);
            // Continue to create a new subscription if error occurs
          }
        }
      } catch (error) {
        console.error('Error retrieving subscription:', error);
        // If the subscription retrieval fails, we'll create a new one
        await storage.updateStripeSubscriptionId(userId, null);
      }
    }

    // Create a new customer if needed
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      if (!user.email) {
        throw new Error('User email is required');
      }

      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
      });
      
      customerId = customer.id;
      // Update user with customer ID
      await storage.updateStripeCustomerId(userId, customerId);
    }

    try {
      // Log the Stripe Price ID being used
      console.log('Using STRIPE_PRICE_ID:', process.env.STRIPE_PRICE_ID);
      
      // Create a subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{
          price: process.env.STRIPE_PRICE_ID, // This should be set in the environment variables
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      // Update user with subscription ID
      await storage.updateStripeSubscriptionId(userId, subscription.id);

      // Safely access expanded fields
      let clientSecret = null;
      
      if (subscription.latest_invoice && 
          typeof subscription.latest_invoice !== 'string') {
        // Use type assertion to handle the expanded fields
        const invoice = subscription.latest_invoice;
        const invoiceWithPaymentIntent = invoice as unknown as { 
          payment_intent?: { client_secret?: string } 
        };
        
        if (invoiceWithPaymentIntent.payment_intent) {
          clientSecret = invoiceWithPaymentIntent.payment_intent.client_secret;
        }
      }
      
      if (!clientSecret) {
        console.warn('Failed to get client secret from expanded fields');
      }

      return {
        subscriptionId: subscription.id,
        clientSecret,
      };
    } catch (error) {
      console.error('Error in subscription creation:', error);
      return { subscriptionId: null, clientSecret: null };
    }
  } catch (error) {
    console.error('Error creating subscription:', error);
    return { subscriptionId: null, clientSecret: null };
  }
}

/**
 * Cancels a user's subscription
 */
export async function cancelSubscription(userId: number): Promise<boolean> {
  try {
    if (!stripe) {
      console.error('Stripe not initialized');
      return false;
    }

    // Get the user
    const user = await storage.getUser(userId);
    if (!user || !user.stripeSubscriptionId) {
      return false;
    }

    // Cancel the subscription
    await stripe.subscriptions.cancel(user.stripeSubscriptionId);
    
    // Update user to remove subscription ID
    await storage.updateStripeSubscriptionId(userId, null);
    
    return true;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return false;
  }
}