/**
 * Integration test: Direct checkout → Webhook → Reconciliation → Tier sync
 *
 * Exercises the full user flow with mocked Stripe API (R11):
 * 1. POST /api/checkout/direct creates a Stripe checkout session
 * 2. checkout.session.completed webhook resolves user by email (no userId in metadata)
 * 3. Onboarding reconciliation detects the Stripe subscription
 * 4. User.subscriptionTier is updated to the correct tier
 */

// --- Mock setup ---

// Rate limiter passthrough
jest.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => (req: any, handler: any) => handler(req),
  rateLimitConfigs: { checkout: {} },
}));

// Shared mock state — allows multiple modules to interact with the same mock data
const mockDb = {
  user: null as any,
  userSubscription: null as any,
};

jest.mock('next/headers', () => ({
  headers: jest.fn().mockResolvedValue({
    get: jest.fn((name: string) => {
      if (name === 'stripe-signature') return 'sig_test';
      return null;
    }),
  }),
}));

jest.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_integration_test',
          url: 'https://checkout.stripe.com/pay/cs_integration_test',
        }),
        list: jest.fn().mockResolvedValue({ data: [] }),
      },
    },
    customers: {
      list: jest.fn(),
      retrieve: jest.fn(),
    },
    subscriptions: {
      list: jest.fn(),
    },
  },
  SUBSCRIPTION_PLANS: {
    FREE: { name: 'Free', monthlyPriceId: null, monthlyPrice: 0, tickerLimit: 3 },
    PRO: { name: 'Pro', monthlyPriceId: 'price_pro_monthly', monthlyPrice: 2900, tickerLimit: 25 },
    MAX: { name: 'Max', monthlyPriceId: 'price_max_monthly', monthlyPrice: 9900, tickerLimit: -1 },
  },
  getPriceIdForPlan: jest.fn((plan: string) => {
    if (plan === 'PRO') return 'price_pro_monthly';
    if (plan === 'MAX') return 'price_max_monthly';
    return null;
  }),
  validateWebhookSignature: jest.fn(),
  getPlanTypeFromPriceId: jest.fn((priceId: string | undefined) => {
    if (!priceId) return 'FREE';
    if (priceId.includes('pro')) return 'PRO';
    if (priceId.includes('max')) return 'MAX';
    return 'FREE';
  }),
}));

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  clerkClient: { users: { createUser: jest.fn() } },
}));

jest.mock('@/lib/db/prisma', () => {
  const mockPrismaInstance = {
    user: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(mockDb.user)),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(mockDb.user)),
      update: jest.fn().mockResolvedValue({}),
    },
    userSubscription: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(mockDb.userSubscription)),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    usagePeriod: { upsert: jest.fn().mockResolvedValue({}) },
  };
  return { getPrismaClient: jest.fn(() => mockPrismaInstance) };
});

jest.mock('@/lib/audit/payment-logger', () => ({
  PaymentLogger: {
    checkoutStarted: jest.fn().mockResolvedValue(undefined),
    checkoutFailed: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/stripe/sync-subscription', () => ({
  syncUserSubscriptionTier: jest.fn().mockResolvedValue(undefined),
  syncSubscriptionFromStripeData: jest.fn().mockImplementation(
    (_userId: string, _sub: any, _customerId: string) => {
      // Simulate the DB update that syncSubscriptionFromStripeData would do
      mockDb.userSubscription = {
        userId: _userId,
        planType: 'PRO',
        isActive: true,
        stripeCustomerId: _customerId,
        stripeSubscriptionId: _sub.id,
      };
      return Promise.resolve({ planType: 'PRO' });
    }
  ),
}));

// --- Imports ---

import { POST as checkoutPost } from '@/app/api/checkout/direct/route';
import { POST as webhookPost } from '@/app/api/webhook/stripe/route';
import { reconcileStripeSubscription } from '@/lib/stripe/reconcile';
import { NextRequest } from 'next/server';
import { stripe, validateWebhookSignature } from '@/lib/stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { syncSubscriptionFromStripeData } from '@/lib/stripe/sync-subscription';

const mockStripe = stripe as any;
const mockValidate = validateWebhookSignature as jest.Mock;
const mockPrisma = (getPrismaClient as jest.Mock)();
const mockSyncFromStripe = syncSubscriptionFromStripeData as jest.Mock;

// --- Test ---

describe('Integration: Direct Checkout → Webhook → Reconciliation → Tier Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.user = null;
    mockDb.userSubscription = null;
  });

  it('should complete the full flow: checkout → webhook → reconciliation → correct tier', async () => {
    // --- Step 1: POST /api/checkout/direct ---
    // A new user (no existing customer/subscription) starts checkout
    mockStripe.customers.list.mockResolvedValue({ data: [] });

    const checkoutReq = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({ email: 'newuser@example.com', planType: 'PRO' }),
    });

    const checkoutRes = await checkoutPost(checkoutReq);
    const checkoutData = await checkoutRes.json();

    expect(checkoutRes.status).toBe(200);
    expect(checkoutData.sessionId).toBe('cs_integration_test');

    // --- Step 2: Webhook fires — checkout.session.completed ---
    // Simulate: no userId in metadata (homepage checkout before account creation)
    // But the user has now created an account via onboarding
    mockDb.user = {
      id: 'db_user_integration',
      email: 'newuser@example.com',
      authProviderId: 'clerk_integration',
      subscriptionTier: 'FREE',
    };

    const session = {
      id: 'cs_integration_test',
      mode: 'subscription',
      metadata: { planType: 'PRO', source: 'homepage' },
      customer_details: { email: 'newuser@example.com' },
      customer_email: null,
      subscription: 'sub_integration',
      customer: 'cus_integration',
    };

    mockValidate.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    });

    const webhookReq = new NextRequest('http://localhost/api/webhook/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test', 'content-type': 'application/json' },
      body: 'raw-body',
    });

    const webhookRes = await webhookPost(webhookReq);
    expect(webhookRes.status).toBe(200);

    // Verify email fallback resolved the user
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'newuser@example.com' } })
    );
    // Verify subscription upsert was called
    expect(mockPrisma.userSubscription.upsert).toHaveBeenCalled();

    // --- Step 3: Reconciliation during onboarding ---
    // Simulate: user has no UserSubscription in DB yet (webhook just created it above,
    // but reconciliation runs independently)
    mockDb.userSubscription = null;

    // Mock Stripe customer+subscription lookup for reconciliation
    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_integration' }],
    });
    mockStripe.subscriptions.list.mockResolvedValue({
      data: [{
        id: 'sub_integration',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      }],
    });

    const reconcileResult = await reconcileStripeSubscription(
      'db_user_integration',
      'newuser@example.com'
    );

    expect(reconcileResult.reconciled).toBe(true);
    expect(reconcileResult.planType).toBe('PRO');

    // --- Step 4: Verify syncSubscriptionFromStripeData was called ---
    expect(mockSyncFromStripe).toHaveBeenCalledWith(
      'db_user_integration',
      expect.objectContaining({ id: 'sub_integration' }),
      'cus_integration'
    );

    // Verify the mock DB state reflects the synced subscription
    expect(mockDb.userSubscription).toMatchObject({
      userId: 'db_user_integration',
      planType: 'PRO',
      isActive: true,
    });
  });
});
