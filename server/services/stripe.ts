import Stripe from 'stripe';
import { storage } from '../storage';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Missing STRIPE_SECRET_KEY environment variable. Stripe functionality will be disabled.');
}

// Initialize Stripe with the secret key
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
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
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      
      // Get the payment intent client secret
      const invoice = await stripe.invoices.retrieve(subscription.latest_invoice as string);
      const paymentIntent = invoice.payment_intent as string;
      const pi = await stripe.paymentIntents.retrieve(paymentIntent);

      return {
        subscriptionId: subscription.id,
        clientSecret: pi.client_secret,
      };
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

    // @ts-ignore - Expanded fields
    const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;

    return {
      subscriptionId: subscription.id,
      clientSecret,
    };
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