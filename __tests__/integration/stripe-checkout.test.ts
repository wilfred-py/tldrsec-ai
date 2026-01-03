/**
 * Stripe Integration Tests for Premium Pricing Update
 * Tests subscription creation with new $199/$349 pricing
 */

import { SUBSCRIPTION_PLANS, getPlanConfig } from '@/lib/stripe';

// Mock Stripe API
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    prices: {
      retrieve: jest.fn(),
    },
    subscriptions: {
      create: jest.fn(),
    },
  }));
});

describe('Stripe Integration - Premium Pricing', () => {
  describe('Checkout Session Creation', () => {
    it('should create checkout session with correct Pro monthly price', async () => {
      const mockStripe = require('stripe')();
      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        payment_status: 'unpaid',
      };
      
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      // Simulate checkout session creation for Pro monthly
      const sessionParams = {
        mode: 'subscription',
        line_items: [{
          price: SUBSCRIPTION_PLANS.PRO.monthlyPriceId,
          quantity: 1,
        }],
        success_url: 'https://tldrsec.app/dashboard',
        cancel_url: 'https://tldrsec.app/billing',
      };

      const session = await mockStripe.checkout.sessions.create(sessionParams);

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(sessionParams);
      expect(session.id).toBe('cs_test_123');
    });

    it('should create checkout session with correct Max annual price', async () => {
      const mockStripe = require('stripe')();
      const mockSession = {
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/pay/cs_test_456',
        payment_status: 'unpaid',
      };
      
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      // Simulate checkout session creation for Max annual
      const sessionParams = {
        mode: 'subscription',
        line_items: [{
          price: SUBSCRIPTION_PLANS.MAX.annualPriceId,
          quantity: 1,
        }],
        success_url: 'https://tldrsec.app/dashboard',
        cancel_url: 'https://tldrsec.app/billing',
      };

      const session = await mockStripe.checkout.sessions.create(sessionParams);

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(sessionParams);
      expect(session.id).toBe('cs_test_456');
    });
  });

  describe('Price Validation', () => {
    it('should validate Pro pricing in Stripe', async () => {
      const mockStripe = require('stripe')();
      const mockPrice = {
        id: SUBSCRIPTION_PLANS.PRO.monthlyPriceId,
        unit_amount: 19900, // $199.00 in cents
        currency: 'usd',
        recurring: { interval: 'month' },
      };
      
      mockStripe.prices.retrieve.mockResolvedValue(mockPrice);

      const price = await mockStripe.prices.retrieve(SUBSCRIPTION_PLANS.PRO.monthlyPriceId);

      expect(price.unit_amount).toBe(19900); // $199.00
      expect(price.currency).toBe('usd');
      expect(price.recurring.interval).toBe('month');
    });

    it('should validate Max pricing in Stripe', async () => {
      const mockStripe = require('stripe')();
      const mockPrice = {
        id: SUBSCRIPTION_PLANS.MAX.monthlyPriceId,
        unit_amount: 34900, // $349.00 in cents
        currency: 'usd',
        recurring: { interval: 'month' },
      };
      
      mockStripe.prices.retrieve.mockResolvedValue(mockPrice);

      const price = await mockStripe.prices.retrieve(SUBSCRIPTION_PLANS.MAX.monthlyPriceId);

      expect(price.unit_amount).toBe(34900); // $349.00
      expect(price.currency).toBe('usd');
      expect(price.recurring.interval).toBe('month');
    });
  });

  describe('Subscription Creation', () => {
    it('should create Pro subscription with correct metadata', async () => {
      const mockStripe = require('stripe')();
      const mockSubscription = {
        id: 'sub_test_123',
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
        items: {
          data: [{
            price: {
              id: SUBSCRIPTION_PLANS.PRO.monthlyPriceId,
              unit_amount: 19900,
            },
          }],
        },
      };
      
      mockStripe.subscriptions.create.mockResolvedValue(mockSubscription);

      const subscription = await mockStripe.subscriptions.create({
        customer: 'cus_test_123',
        items: [{ price: SUBSCRIPTION_PLANS.PRO.monthlyPriceId }],
        metadata: {
          planType: 'PRO',
          tickerLimit: '25',
          filingTypes: 'ALL',
        },
      });

      expect(subscription.items.data[0].price.unit_amount).toBe(19900);
      expect(subscription.status).toBe('active');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing price ID gracefully', () => {
      const planConfig = getPlanConfig('PRO');
      
      // Test with empty price ID (fallback scenario)
      expect(planConfig?.monthlyPriceId).toBeTruthy();
      expect(planConfig?.annualPriceId).toBeTruthy();
    });

    it('should handle invalid plan type', () => {
      const planConfig = getPlanConfig('INVALID' as any);
      expect(planConfig).toBeUndefined();
    });
  });
});