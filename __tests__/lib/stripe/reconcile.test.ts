/**
 * Tests for lib/stripe/reconcile.ts — Stripe subscription reconciliation
 * Phase 3: Reconciliation during onboarding
 */

// --- Mock setup ---

jest.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { list: jest.fn() },
    subscriptions: { list: jest.fn() },
  },
  getPlanTypeFromPriceId: jest.fn((priceId: string | undefined) => {
    if (!priceId) return 'FREE';
    if (priceId.includes('pro')) return 'PRO';
    if (priceId.includes('max')) return 'MAX';
    return 'FREE';
  }),
}));

jest.mock('@/lib/db/prisma', () => {
  const mockPrisma = {
    userSubscription: { findUnique: jest.fn() },
  };
  return { getPrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('@/lib/stripe/sync-subscription', () => ({
  syncSubscriptionFromStripeData: jest.fn().mockResolvedValue({ planType: 'PRO' }),
}));

// --- Imports ---

import { reconcileStripeSubscription } from '@/lib/stripe/reconcile';
import { stripe } from '@/lib/stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { syncSubscriptionFromStripeData } from '@/lib/stripe/sync-subscription';
import { makeStripeSubscription } from '@/__tests__/fixtures/subscription-fixtures';

const mockStripe = stripe as any;
const mockPrisma = (getPrismaClient as jest.Mock)();
const mockSyncFromStripe = syncSubscriptionFromStripeData as jest.Mock;

// --- Tests ---

describe('reconcileStripeSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 3.9: Creates UserSubscription when Stripe has active sub but DB does not
  it('should reconcile when Stripe has active sub but DB does not', async () => {
    mockPrisma.userSubscription.findUnique.mockResolvedValue(null);
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly' });
    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_found' }],
    });
    mockStripe.subscriptions.list.mockResolvedValue({
      data: [sub],
    });

    const result = await reconcileStripeSubscription('user_1', 'test@example.com');

    expect(result.reconciled).toBe(true);
    expect(result.planType).toBe('PRO');
    expect(mockSyncFromStripe).toHaveBeenCalledWith('user_1', sub, 'cus_found');
  });

  // 3.10: Skips when user already has active UserSubscription
  it('should skip when user already has active paid subscription', async () => {
    mockPrisma.userSubscription.findUnique.mockResolvedValue({
      userId: 'user_1',
      planType: 'PRO',
      isActive: true,
    });

    const result = await reconcileStripeSubscription('user_1', 'test@example.com');

    expect(result.reconciled).toBe(false);
    expect(mockStripe.customers.list).not.toHaveBeenCalled();
  });

  // 3.11: Skips when no Stripe customer found for email
  it('should return not reconciled when no Stripe customer found', async () => {
    mockPrisma.userSubscription.findUnique.mockResolvedValue(null);
    mockStripe.customers.list.mockResolvedValue({ data: [] });

    const result = await reconcileStripeSubscription('user_1', 'nostripe@example.com');

    expect(result.reconciled).toBe(false);
    expect(mockSyncFromStripe).not.toHaveBeenCalled();
  });

  // 3.12: Syncs User.subscriptionTier via shared helper
  it('should call syncSubscriptionFromStripeData for DB writes', async () => {
    mockPrisma.userSubscription.findUnique.mockResolvedValue(null);
    const sub = makeStripeSubscription({ priceId: 'price_max_monthly' });
    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_max' }],
    });
    mockStripe.subscriptions.list.mockResolvedValue({ data: [sub] });
    mockSyncFromStripe.mockResolvedValue({ planType: 'MAX' });

    const result = await reconcileStripeSubscription('user_2', 'max@example.com');

    expect(result.planType).toBe('MAX');
    expect(mockSyncFromStripe).toHaveBeenCalledWith('user_2', sub, 'cus_max');
  });

  // 3.13: Handles Stripe not configured
  it('should return not reconciled when stripe is null', async () => {
    // Temporarily replace stripe with null
    const originalStripe = jest.requireMock('@/lib/stripe').stripe;
    jest.requireMock('@/lib/stripe').stripe = null;

    const result = await reconcileStripeSubscription('user_1', 'test@example.com');

    expect(result.reconciled).toBe(false);

    // Restore
    jest.requireMock('@/lib/stripe').stripe = originalStripe;
  });

  // 3.15: Handles DB failure in findUnique gracefully
  it('should throw when DB lookup fails (caller handles via .catch)', async () => {
    mockPrisma.userSubscription.findUnique.mockRejectedValue(new Error('DB down'));

    await expect(
      reconcileStripeSubscription('user_1', 'test@example.com')
    ).rejects.toThrow('DB down');
  });

  // Reconciles existing FREE sub (upgrades from FREE)
  it('should reconcile when user has inactive/FREE subscription in DB', async () => {
    mockPrisma.userSubscription.findUnique.mockResolvedValue({
      userId: 'user_1',
      planType: 'FREE',
      isActive: true,
    });
    const sub = makeStripeSubscription({ priceId: 'price_pro_monthly' });
    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_upgrade' }],
    });
    mockStripe.subscriptions.list.mockResolvedValue({ data: [sub] });

    const result = await reconcileStripeSubscription('user_1', 'test@example.com');

    expect(result.reconciled).toBe(true);
  });
});
