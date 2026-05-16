/**
 * Regression test for the Clerk-id → DB user.id resolution in
 * handlePostBillingPortal. UserSubscription.userId is a foreign key to
 * User.id (a UUID), but Clerk's auth() returns the Clerk id (e.g.
 * "user_xxx"). For users created via the onboarding flow, those two ids
 * are different, so passing the Clerk id directly to
 * prisma.userSubscription.findUnique({ where: { userId: clerkId } })
 * returns null even when the user has an active subscription, and the
 * caller sees a misleading 404 "No billing information found".
 *
 * This file is a minimal sibling of preferences.test.ts — same mock setup,
 * focused only on proving the resolution happens for the billing-portal
 * endpoint.
 */
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { POST } from '@/app/api/user/route';
import { getPrismaClient } from '@/lib/db/prisma';
import { createBillingPortalSession } from '@/lib/stripe';

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn(),
}));

jest.mock('@/lib/db/prisma', () => {
  const mockPrismaClient = {
    user: { findFirst: jest.fn() },
    userSubscription: { findUnique: jest.fn() },
  };
  return {
    getPrismaClient: () => mockPrismaClient,
  };
});

jest.mock('@/lib/stripe', () => ({
  isStripeEnabled: () => true,
  handleStripeError: (e: unknown) => ({ message: String(e), statusCode: 500 }),
  getCustomer: jest.fn(),
  SUBSCRIPTION_PLANS: {},
  getPriceIdForPlan: jest.fn(),
  createBillingPortalSession: jest.fn(),
}));

jest.mock('@/lib/auth/trial-service', () => ({
  TrialService: { checkTrialStatusFromUser: jest.fn() },
}));

jest.mock('@/lib/logging', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), child: jest.fn().mockReturnValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

describe('POST /api/user?type=billing-portal — Clerk id → DB id resolution', () => {
  // Same realistic id mismatch as the preferences test: onboarding creates
  // users with UUID `id` and stores the Clerk id in `authProviderId`.
  const clerkId = 'user_2abc123xyz';
  const dbUserId = '550e8400-e29b-41d4-a716-446655440000';

  const prismaClient = getPrismaClient() as unknown as {
    user: { findFirst: jest.Mock };
    userSubscription: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    jest.resetAllMocks();
    (auth as unknown as jest.Mock).mockResolvedValue({ userId: clerkId });
    prismaClient.user.findFirst.mockResolvedValue({ id: dbUserId });
    prismaClient.userSubscription.findUnique.mockResolvedValue({
      stripeCustomerId: 'cus_test_123',
      isActive: true,
    });
    (createBillingPortalSession as jest.Mock).mockResolvedValue({
      url: 'https://billing.example.com/portal/session_123',
    });
  });

  function makeRequest() {
    return new NextRequest(new Request('https://example.com/api/user?type=billing-portal', {
      method: 'POST',
    }));
  }

  it('resolves Clerk id to DB user id before querying UserSubscription', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    // The actual regression: UserSubscription must be queried with the
    // resolved DB id, not the Clerk id.
    expect(prismaClient.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: clerkId }, { authProviderId: clerkId }],
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(prismaClient.userSubscription.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaClient.userSubscription.findUnique).toHaveBeenCalledWith({
      where: { userId: dbUserId },
      select: { stripeCustomerId: true, isActive: true },
    });
    // Belt-and-braces: prove the call did not use the Clerk id, even though
    // toHaveBeenCalledWith above already proves it used the DB id. Together
    // these catch a regression that passes both ids in different calls.
    const firstCall = prismaClient.userSubscription.findUnique.mock.calls[0][0];
    expect(firstCall.where.userId).toBe(dbUserId);
    expect(firstCall.where.userId).not.toBe(clerkId);
  });

  it('returns 401 when Clerk auth has no userId', async () => {
    (auth as unknown as jest.Mock).mockResolvedValue({ userId: null });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(prismaClient.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when Clerk user has no matching DB row (or is soft-deleted)', async () => {
    prismaClient.user.findFirst.mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
    expect(prismaClient.userSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when DB user exists but has no Stripe customer yet', async () => {
    prismaClient.userSubscription.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
    expect(createBillingPortalSession).not.toHaveBeenCalled();
  });
});
