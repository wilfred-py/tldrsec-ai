/**
 * Tests for Stripe webhook — checkout.session.completed + subscription.created
 * Phase 2: Email fallback, syncSubscriptionFromStripeData, R1/R8
 */

// --- Mock setup ---

jest.mock('next/headers', () => ({
  headers: jest.fn().mockResolvedValue({
    get: jest.fn((name: string) => {
      if (name === 'stripe-signature') return 'sig_test';
      return null;
    }),
  }),
}));

jest.mock('@/lib/stripe', () => ({
  validateWebhookSignature: jest.fn(),
  getPlanTypeFromPriceId: jest.fn((priceId: string | undefined) => {
    if (!priceId) return 'FREE';
    if (priceId.includes('pro')) return 'PRO';
    if (priceId.includes('max')) return 'MAX';
    return 'FREE';
  }),
  stripe: {
    customers: { retrieve: jest.fn() },
  },
}));

jest.mock('@/lib/db/prisma', () => {
  const mockPrisma = {
    user: { findFirst: jest.fn(), update: jest.fn() },
    userSubscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    usagePeriod: { upsert: jest.fn() },
  };
  return { getPrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('@/lib/stripe/sync-subscription', () => ({
  syncUserSubscriptionTier: jest.fn().mockResolvedValue(undefined),
  syncSubscriptionFromStripeData: jest.fn().mockResolvedValue({ planType: 'PRO' }),
}));

// --- Imports ---

import { POST } from '@/app/api/webhook/stripe/route';
import { NextRequest } from 'next/server';
import { validateWebhookSignature, stripe } from '@/lib/stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import {
  syncUserSubscriptionTier,
  syncSubscriptionFromStripeData,
} from '@/lib/stripe/sync-subscription';
import { makeCheckoutSession, makeStripeSubscription } from '@/__tests__/fixtures/subscription-fixtures';

// --- Extract mock references ---

const mockValidate = validateWebhookSignature as jest.Mock;
const mockStripe = stripe as any;
const mockPrisma = (getPrismaClient as jest.Mock)();
const mockSyncTier = syncUserSubscriptionTier as jest.Mock;
const mockSyncFromStripe = syncSubscriptionFromStripeData as jest.Mock;

// --- Helpers ---

function makeWebhookRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/webhook/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test', 'content-type': 'application/json' },
    body: 'raw-body',
  });
}

function makeEvent(type: string, data: any) {
  return { type, data: { object: data } };
}

// --- Tests ---

describe('Stripe webhook — handleCheckoutCompleted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.userSubscription.upsert.mockResolvedValue({});
    mockPrisma.usagePeriod.upsert.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
  });

  // 2.7: Existing behavior preserved — userId in metadata works
  it('should process checkout when userId is in metadata', async () => {
    const session = makeCheckoutSession({
      metadata: { userId: 'user_123', planType: 'PRO', source: 'homepage' },
      subscription: 'sub_123',
      customer: 'cus_123',
    });
    mockValidate.mockReturnValue(makeEvent('checkout.session.completed', session));
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'db_user_123', authProviderId: 'user_123' });

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.userSubscription.upsert).toHaveBeenCalled();
    expect(mockSyncTier).toHaveBeenCalledWith(expect.any(String), 'PRO');
  });

  // 2.8: Resolves user by email when userId missing from metadata
  it('should resolve user by email when userId missing from metadata', async () => {
    const session = makeCheckoutSession({
      metadata: { planType: 'PRO', source: 'homepage' },
      customer_details: { email: 'test@example.com' },
      subscription: 'sub_123',
      customer: 'cus_123',
    });
    delete session.metadata.userId;
    mockValidate.mockReturnValue(makeEvent('checkout.session.completed', session));
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'db_user_by_email', authProviderId: 'clerk_by_email' });

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'test@example.com' },
      })
    );
    expect(mockPrisma.userSubscription.upsert).toHaveBeenCalled();
  });

  // 2.9: Logs warning and returns when no user found by email
  it('should return gracefully when no user found by email', async () => {
    const session = makeCheckoutSession({
      metadata: { planType: 'PRO', source: 'homepage' },
      customer_details: { email: 'unknown@example.com' },
    });
    delete session.metadata.userId;
    mockValidate.mockReturnValue(makeEvent('checkout.session.completed', session));
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.userSubscription.upsert).not.toHaveBeenCalled();
  });

  // 2.10: Returns early when planType missing
  it('should return early when planType missing from metadata', async () => {
    const session = makeCheckoutSession({
      metadata: { userId: 'user_123', source: 'homepage' },
    });
    delete session.metadata.planType;
    mockValidate.mockReturnValue(makeEvent('checkout.session.completed', session));

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.userSubscription.upsert).not.toHaveBeenCalled();
  });

  // 2.14: Handles DB lookup failure gracefully
  it('should handle DB lookup failure gracefully in email fallback', async () => {
    const session = makeCheckoutSession({
      metadata: { planType: 'PRO', source: 'homepage' },
      customer_details: { email: 'dbfail@example.com' },
    });
    delete session.metadata.userId;
    mockValidate.mockReturnValue(makeEvent('checkout.session.completed', session));
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB connection lost'));

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.userSubscription.upsert).not.toHaveBeenCalled();
  });
});

describe('Stripe webhook — handleSubscriptionCreated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
  });

  // 2.12: Works normally when customer ID found
  it('should update subscription when found by customer ID', async () => {
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly' });
    mockValidate.mockReturnValue(makeEvent('customer.subscription.created', sub));
    mockPrisma.userSubscription.findUnique.mockResolvedValue({
      userId: 'user_existing',
      stripeCustomerId: 'cus_test_mock',
    });
    mockPrisma.userSubscription.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.userSubscription.update).toHaveBeenCalled();
    expect(mockSyncTier).toHaveBeenCalledWith('user_existing', 'PRO');
  });

  // 2.11: Resolves user by email when customer ID not found (Issue 2)
  it('should resolve user by email via Stripe customer when not found by customer ID', async () => {
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly' });
    mockValidate.mockReturnValue(makeEvent('customer.subscription.created', sub));
    mockPrisma.userSubscription.findUnique.mockResolvedValue(null);
    mockStripe.customers.retrieve.mockResolvedValue({
      id: 'cus_test_mock',
      email: 'found@example.com',
      deleted: false,
    });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'db_user_found' });

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockSyncFromStripe).toHaveBeenCalledWith(
      'db_user_found',
      sub,
      'cus_test_mock'
    );
  });

  // 2.13: Logs error when email fallback also fails
  it('should log error when both customer ID and email fallback fail', async () => {
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly' });
    mockValidate.mockReturnValue(makeEvent('customer.subscription.created', sub));
    mockPrisma.userSubscription.findUnique.mockResolvedValue(null);
    mockStripe.customers.retrieve.mockResolvedValue({
      id: 'cus_test_mock',
      email: 'notfound@example.com',
      deleted: false,
    });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockSyncFromStripe).not.toHaveBeenCalled();
  });

  // 2.15: Existing handlers still work after tier sync extraction (R1)
  it('should use imported syncUserSubscriptionTier for subscription updates', async () => {
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly' });
    mockValidate.mockReturnValue(makeEvent('customer.subscription.updated', sub));
    mockPrisma.userSubscription.findUnique.mockResolvedValue({
      userId: 'user_for_update',
    });
    mockPrisma.userSubscription.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest());

    expect(res.status).toBe(200);
    expect(mockSyncTier).toHaveBeenCalledWith('user_for_update', 'PRO');
  });
});
