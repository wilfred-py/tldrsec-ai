/**
 * Tests for /api/checkout/direct — duplicate subscription prevention (Phase 1)
 *
 * Covers: R2, R6, R13, Issue 1, Issue 5, Issue 13, Q2
 */

// --- Mock setup (hoisted before imports) ---
// Per CLAUDE.md #14: use inline jest.fn() in factories, then import+cast after

jest.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: { create: jest.fn(), list: jest.fn() },
    },
    customers: { list: jest.fn() },
    subscriptions: { list: jest.fn() },
  },
  SUBSCRIPTION_PLANS: {
    FREE: { monthlyPrice: 0 },
    PRO: { monthlyPrice: 29 },
    MAX: { monthlyPrice: 79 },
  },
  getPriceIdForPlan: jest.fn((plan: string) =>
    plan === 'PRO' ? 'price_pro_monthly' : plan === 'MAX' ? 'price_max_monthly' : null
  ),
}));

jest.mock('@/lib/db/prisma', () => {
  const mockPrismaInstance = {
    user: { findFirst: jest.fn() },
  };
  return {
    getPrismaClient: jest.fn(() => mockPrismaInstance),
  };
});

jest.mock('@clerk/nextjs/server', () => ({
  clerkClient: {
    users: { createUser: jest.fn().mockResolvedValue({ id: 'clerk_123' }) },
  },
}));

jest.mock('@/lib/audit/payment-logger', () => ({
  PaymentLogger: {
    checkoutStarted: jest.fn().mockResolvedValue(undefined),
    checkoutFailed: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => (req: any, handler: any) => handler(req),
  rateLimitConfigs: { checkout: {} },
}));

// --- Imports (after mocks) ---

import { POST } from '@/app/api/checkout/direct/route';
import { NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { PaymentLogger } from '@/lib/audit/payment-logger';

// --- Extract mock references ---

const mockStripe = stripe as any;
const mockSessionsCreate = mockStripe.checkout.sessions.create as jest.Mock;
const mockSessionsList = mockStripe.checkout.sessions.list as jest.Mock;
const mockCustomersList = mockStripe.customers.list as jest.Mock;
const mockSubscriptionsList = mockStripe.subscriptions.list as jest.Mock;
const mockPrisma = (getPrismaClient as jest.Mock)();
const mockUserFindFirst = mockPrisma.user.findFirst as jest.Mock;
const mockCheckoutFailed = PaymentLogger.checkoutFailed as jest.Mock;

// --- Helpers ---

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/checkout/direct', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'test-agent',
    },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe('/api/checkout/direct — duplicate prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no open sessions, no customers, no DB user
    mockSessionsList.mockResolvedValue({ data: [] });
    mockCustomersList.mockResolvedValue({ data: [] });
    mockUserFindFirst.mockResolvedValue(null);
    mockSubscriptionsList.mockResolvedValue({ data: [] });
    mockSessionsCreate.mockResolvedValue({
      id: 'cs_new_123',
      url: 'https://checkout.stripe.com/new',
    });
  });

  // 1.12: Brand-new email works normally (existing behavior preserved)
  it('should create checkout session for brand-new email', async () => {
    const res = await POST(makeRequest({ email: 'new@example.com', planType: 'PRO' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sessionId).toBe('cs_new_123');
    expect(json.sessionUrl).toBe('https://checkout.stripe.com/new');
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });

  // 1.9: Rejects checkout when email has active Stripe subscription (409)
  it('should return 409 when email has active subscription', async () => {
    mockCustomersList.mockResolvedValue({
      data: [{ id: 'cus_existing' }],
    });
    mockSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_active', status: 'active' }],
    });

    const res = await POST(makeRequest({ email: 'existing@example.com', planType: 'PRO' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toContain('active subscription');
    expect(json.signInUrl).toBe('/sign-in');
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  // 1.18: PaymentLogger.checkoutFailed called on 409
  it('should log checkoutFailed on 409 duplicate detection', async () => {
    mockCustomersList.mockResolvedValue({
      data: [{ id: 'cus_existing' }],
    });
    mockSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_active', status: 'active' }],
    });

    await POST(makeRequest({ email: 'existing@example.com', planType: 'PRO' }));

    expect(mockCheckoutFailed).toHaveBeenCalledWith({
      email: 'existing@example.com',
      error: 'active_subscription_exists',
      ipAddress: '127.0.0.1',
    });
  });

  // 1.10: Reuses existing Stripe customer when no active sub
  it('should reuse existing customer ID when no active sub', async () => {
    mockCustomersList.mockResolvedValue({
      data: [{ id: 'cus_reuse' }],
    });
    mockSubscriptionsList.mockResolvedValue({ data: [] });

    await POST(makeRequest({ email: 'returning@example.com', planType: 'PRO' }));

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockSessionsCreate.mock.calls[0][0];
    expect(createArgs.customer).toBe('cus_reuse');
    expect(createArgs.customer_email).toBeUndefined();
  });

  // 1.11: Includes userId in metadata when user exists in DB
  it('should include userId in metadata when DB user found', async () => {
    mockUserFindFirst.mockResolvedValue({
      id: 'db_user_1',
      authProviderId: 'clerk_user_1',
    });

    await POST(makeRequest({ email: 'known@example.com', planType: 'PRO' }));

    const createArgs = mockSessionsCreate.mock.calls[0][0];
    expect(createArgs.metadata.userId).toBe('clerk_user_1');
  });

  // 1.13: Success URL includes subscription_success=true
  it('should include subscription_success=true in success URL', async () => {
    await POST(makeRequest({ email: 'new@example.com', planType: 'PRO' }));

    const createArgs = mockSessionsCreate.mock.calls[0][0];
    expect(createArgs.success_url).toContain('subscription_success=true');
  });

  // 1.14: Returns existing open session instead of creating duplicate
  it('should return existing open session URL if found', async () => {
    mockSessionsList.mockResolvedValue({
      data: [{ id: 'cs_open_existing', url: 'https://checkout.stripe.com/existing' }],
    });

    const res = await POST(makeRequest({ email: 'pending@example.com', planType: 'PRO' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sessionId).toBe('cs_open_existing');
    expect(json.sessionUrl).toBe('https://checkout.stripe.com/existing');
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  // 1.15: Sets client_reference_id on created session
  it('should set client_reference_id=email on new session', async () => {
    await POST(makeRequest({ email: 'ref@example.com', planType: 'PRO' }));

    const createArgs = mockSessionsCreate.mock.calls[0][0];
    expect(createArgs.client_reference_id).toBe('ref@example.com');
  });

  // 1.17: Handles empty customer list
  it('should handle empty customer list and use customer_email', async () => {
    mockCustomersList.mockResolvedValue({ data: [] });

    await POST(makeRequest({ email: 'brand-new@example.com', planType: 'PRO' }));

    const createArgs = mockSessionsCreate.mock.calls[0][0];
    expect(createArgs.customer).toBeUndefined();
    expect(createArgs.customer_email).toBe('brand-new@example.com');
  });

  // 1.19: Checkout proceeds when DB is unavailable (R6 fail-open)
  it('should proceed with checkout when DB lookup fails (fail-open)', async () => {
    mockUserFindFirst.mockRejectedValue(new Error('Connection refused'));

    const res = await POST(makeRequest({ email: 'dbdown@example.com', planType: 'PRO' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sessionId).toBe('cs_new_123');
    const createArgs = mockSessionsCreate.mock.calls[0][0];
    expect(createArgs.metadata.userId).toBeUndefined();
  });

  // 1.16: Stripe API error is handled gracefully
  it('should return 500 when Stripe API fails', async () => {
    mockSessionsList.mockRejectedValue(new Error('Stripe rate limited'));

    const res = await POST(makeRequest({ email: 'error@example.com', planType: 'PRO' }));

    expect(res.status).toBe(500);
    expect(mockCheckoutFailed).toHaveBeenCalled();
  });

  // Verify userId uses authProviderId when available, falls back to id
  it('should use DB id as userId when authProviderId is null', async () => {
    mockUserFindFirst.mockResolvedValue({
      id: 'db_user_2',
      authProviderId: null,
    });

    await POST(makeRequest({ email: 'noclerk@example.com', planType: 'PRO' }));

    const createArgs = mockSessionsCreate.mock.calls[0][0];
    expect(createArgs.metadata.userId).toBe('db_user_2');
  });
});
