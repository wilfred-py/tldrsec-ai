/**
 * Unit tests for lib/stripe/sync-subscription.ts (R9)
 *
 * Tests: syncUserSubscriptionTier, syncSubscriptionFromStripeData
 */

// --- Mock setup (hoisted before imports) ---

const mockUserUpdate = jest.fn();
const mockUserSubscriptionUpsert = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    user: { update: mockUserUpdate },
    userSubscription: { upsert: mockUserSubscriptionUpsert },
  })),
}));

jest.mock('@/lib/stripe', () => ({
  getPlanTypeFromPriceId: jest.fn((priceId: string | undefined) => {
    if (!priceId) return 'FREE';
    if (priceId.includes('pro')) return 'PRO';
    if (priceId.includes('max')) return 'MAX';
    return 'FREE';
  }),
}));

// --- Imports (after mocks) ---

import {
  syncUserSubscriptionTier,
  syncSubscriptionFromStripeData,
} from '@/lib/stripe/sync-subscription';
import { makeStripeSubscription } from '@/__tests__/fixtures/subscription-fixtures';

// --- Tests ---

describe('syncUserSubscriptionTier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update User.subscriptionTier to PRO', async () => {
    mockUserUpdate.mockResolvedValueOnce({ id: 'user_1', subscriptionTier: 'PRO' });

    await syncUserSubscriptionTier('user_1', 'PRO');

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { subscriptionTier: 'PRO' },
    });
  });

  it('should swallow errors without throwing', async () => {
    mockUserUpdate.mockRejectedValueOnce(new Error('User not found'));

    // Should NOT throw
    await expect(syncUserSubscriptionTier('user_missing', 'MAX')).resolves.toBeUndefined();

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_missing' },
      data: { subscriptionTier: 'MAX' },
    });
  });
});

describe('syncSubscriptionFromStripeData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserUpdate.mockResolvedValue({ id: 'user_1' });
    mockUserSubscriptionUpsert.mockResolvedValue({ userId: 'user_1' });
  });

  it('should upsert subscription and sync tier for PRO plan', async () => {
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly_test' });

    const result = await syncSubscriptionFromStripeData('user_1', sub, 'cus_test_mock');

    expect(result).toEqual({ planType: 'PRO' });

    // Verify upsert was called with correct shape
    expect(mockUserSubscriptionUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockUserSubscriptionUpsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ userId: 'user_1' });
    expect(upsertCall.update.planType).toBe('PRO');
    expect(upsertCall.update.stripeSubscriptionId).toBe('sub_test_mock');
    expect(upsertCall.update.stripeCustomerId).toBe('cus_test_mock');
    expect(upsertCall.update.isActive).toBe(true);
    expect(upsertCall.create.userId).toBe('user_1');

    // Verify tier sync was also called
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { subscriptionTier: 'PRO' },
    });
  });

  it('should return FREE when subscription has no price ID', async () => {
    const sub = makeStripeSubscription();
    // Override items to have no price
    sub.items = { data: [{ price: { id: undefined } }] };

    const result = await syncSubscriptionFromStripeData('user_1', sub, 'cus_test_mock');

    expect(result).toEqual({ planType: 'FREE' });
  });

  it('should set isActive=false for non-active subscription', async () => {
    const sub = makeStripeSubscription({
      status: 'past_due',
      priceId: 'price_pro_monthly_test',
    });

    await syncSubscriptionFromStripeData('user_1', sub, 'cus_test_mock');

    const upsertCall = mockUserSubscriptionUpsert.mock.calls[0][0];
    expect(upsertCall.update.isActive).toBe(false);
    expect(upsertCall.create.isActive).toBe(false);
  });

  it('should be idempotent — second call produces same upsert shape', async () => {
    // Freeze time so both calls get the same updatedAt timestamp
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const sub = makeStripeSubscription({ priceId: 'price_max_monthly_test' });

    await syncSubscriptionFromStripeData('user_1', sub, 'cus_test_mock');
    await syncSubscriptionFromStripeData('user_1', sub, 'cus_test_mock');

    expect(mockUserSubscriptionUpsert).toHaveBeenCalledTimes(2);
    // Both calls should have identical arguments
    expect(mockUserSubscriptionUpsert.mock.calls[0]).toEqual(
      mockUserSubscriptionUpsert.mock.calls[1]
    );
    jest.useRealTimers();
  });

  it('should propagate upsert errors (not swallowed)', async () => {
    mockUserSubscriptionUpsert.mockRejectedValueOnce(new Error('DB constraint'));
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly_test' });

    await expect(
      syncSubscriptionFromStripeData('user_1', sub, 'cus_test_mock')
    ).rejects.toThrow('DB constraint');
  });
});
