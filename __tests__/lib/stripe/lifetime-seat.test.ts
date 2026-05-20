/**
 * Unit tests for syncLifetimeSeat + revokeLifetimeSeat
 * (lib/stripe/sync-subscription.ts, Lifetime Seat additions per ADR-0004).
 *
 * Covers the atomicity contract: both functions wrap their multi-table
 * writes in prisma.$transaction so partial failure cannot leave a user
 * with mismatched flag + tier state.
 */

// --- Mock setup (hoisted) ---

const mockTxUserUpdate = jest.fn();
const mockTxUserSubscriptionUpsert = jest.fn();
const mockTxUserSubscriptionUpdateMany = jest.fn();
const mockTxAuditLogCreate = jest.fn();

const mockTransaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    user: { update: mockTxUserUpdate },
    userSubscription: {
      upsert: mockTxUserSubscriptionUpsert,
      updateMany: mockTxUserSubscriptionUpdateMany,
    },
    auditLog: { create: mockTxAuditLogCreate },
  };
  return callback(tx);
});

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    $transaction: mockTransaction,
  })),
}));

jest.mock('@/lib/stripe', () => ({
  getPlanTypeFromPriceId: jest.fn(() => 'MAX'),
}));

// --- Imports (after mocks) ---

import { syncLifetimeSeat, revokeLifetimeSeat } from '@/lib/stripe/sync-subscription';
import { LIFETIME_NEVER_EXPIRES } from '@/lib/stripe/constants';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('syncLifetimeSeat', () => {
  it('writes UserSubscription with sentinel end date + null stripeSubscriptionId', async () => {
    mockTxUserSubscriptionUpsert.mockResolvedValueOnce({ id: 'sub_1' });
    mockTxUserUpdate.mockResolvedValueOnce({ id: 'user_1' });

    await syncLifetimeSeat('user_1', 'price_founding', 'cus_1');

    expect(mockTxUserSubscriptionUpsert).toHaveBeenCalledTimes(1);
    const call = mockTxUserSubscriptionUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'user_1' });
    expect(call.create.planType).toBe('MAX');
    expect(call.create.stripeSubscriptionId).toBeNull();
    expect(call.create.stripePriceId).toBe('price_founding');
    expect(call.create.stripeCustomerId).toBe('cus_1');
    expect(call.create.isActive).toBe(true);
    expect(call.create.cancelAtPeriodEnd).toBe(false);
    expect(call.create.currentPeriodEnd).toEqual(LIFETIME_NEVER_EXPIRES);
    expect(call.update.currentPeriodEnd).toEqual(LIFETIME_NEVER_EXPIRES);
    expect(call.update.stripeSubscriptionId).toBeNull();
  });

  it('flips foundingMember=true and subscriptionTier=MAX on User', async () => {
    mockTxUserSubscriptionUpsert.mockResolvedValueOnce({ id: 'sub_1' });
    mockTxUserUpdate.mockResolvedValueOnce({ id: 'user_1' });

    await syncLifetimeSeat('user_1', 'price_founding', 'cus_1');

    expect(mockTxUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {
        foundingMember: true,
        subscriptionTier: 'MAX',
      },
    });
  });

  it('wraps writes in a single prisma.$transaction', async () => {
    mockTxUserSubscriptionUpsert.mockResolvedValueOnce({ id: 'sub_1' });
    mockTxUserUpdate.mockResolvedValueOnce({ id: 'user_1' });

    await syncLifetimeSeat('user_1', 'price_founding', 'cus_1');

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from the transaction', async () => {
    mockTxUserSubscriptionUpsert.mockRejectedValueOnce(new Error('upsert blew up'));

    await expect(syncLifetimeSeat('user_1', 'price_founding', 'cus_1')).rejects.toThrow('upsert blew up');
  });
});

describe('revokeLifetimeSeat', () => {
  it('atomically flips User flags, deactivates subscription, writes audit log', async () => {
    mockTxUserUpdate.mockResolvedValueOnce({ id: 'user_1' });
    mockTxUserSubscriptionUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockTxAuditLogCreate.mockResolvedValueOnce({ id: 'log_1' });

    await revokeLifetimeSeat('user_1', 'charge.refunded');

    expect(mockTransaction).toHaveBeenCalledTimes(1);

    expect(mockTxUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {
        foundingMember: false,
        subscriptionTier: 'FREE',
      },
    });

    const updateManyCall = mockTxUserSubscriptionUpdateMany.mock.calls[0][0];
    expect(updateManyCall.where).toEqual({ userId: 'user_1' });
    expect(updateManyCall.data.isActive).toBe(false);

    const auditCall = mockTxAuditLogCreate.mock.calls[0][0];
    expect(auditCall.data.userId).toBe('user_1');
    expect(auditCall.data.action).toBe('lifetime_seat_revoked');
    expect(auditCall.data.details).toEqual({ reason: 'charge.refunded' });
    expect(auditCall.data.success).toBe(true);
  });

  it('passes through arbitrary reason strings for manual revocations', async () => {
    mockTxUserUpdate.mockResolvedValueOnce({ id: 'user_1' });
    mockTxUserSubscriptionUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockTxAuditLogCreate.mockResolvedValueOnce({ id: 'log_1' });

    await revokeLifetimeSeat('user_1', 'support_request_2026_05_19');

    const auditCall = mockTxAuditLogCreate.mock.calls[0][0];
    expect(auditCall.data.details).toEqual({ reason: 'support_request_2026_05_19' });
  });

  it('propagates errors from the transaction', async () => {
    mockTxUserUpdate.mockRejectedValueOnce(new Error('user update blew up'));

    await expect(revokeLifetimeSeat('user_1', 'charge.refunded')).rejects.toThrow('user update blew up');
  });

  it('is idempotent in shape: revoking again hits same writes (caller decides if duplicate audit is OK)', async () => {
    mockTxUserUpdate.mockResolvedValue({ id: 'user_1' });
    mockTxUserSubscriptionUpdateMany.mockResolvedValue({ count: 1 });
    mockTxAuditLogCreate.mockResolvedValue({ id: 'log_1' });

    await revokeLifetimeSeat('user_1', 'first_call');
    await revokeLifetimeSeat('user_1', 'second_call');

    expect(mockTxUserUpdate).toHaveBeenCalledTimes(2);
    expect(mockTxAuditLogCreate).toHaveBeenCalledTimes(2);
  });
});
