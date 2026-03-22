/**
 * Tests for TrialService.checkTrialStatus grandfathered logic
 *
 * Regression test: FREE users with trialEndsAt set but trialStartedAt null
 * were incorrectly classified as "grandfathered" (always active, no banner).
 */

const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => ({
    user: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
    },
  }),
}));

import { TrialService } from '@/lib/auth/trial-service';

describe('TrialService.checkTrialStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns grandfathered for FREE user with no trial dates at all', async () => {
    mockFindFirst.mockResolvedValue({
      subscriptionTier: 'FREE',
      trialStartedAt: null,
      trialEndsAt: null,
      isTrialing: false,
    });

    const result = await TrialService.checkTrialStatus('user-1');

    expect(result.isGrandfathered).toBe(true);
    expect(result.isActive).toBe(true);
  });

  it('returns expired (not grandfathered) for FREE user with trialEndsAt in past but trialStartedAt null', async () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    mockFindFirst.mockResolvedValue({
      subscriptionTier: 'FREE',
      trialStartedAt: null,
      trialEndsAt: pastDate,
      isTrialing: false,
    });

    const result = await TrialService.checkTrialStatus('user-1');

    expect(result.isGrandfathered).toBe(false);
    expect(result.isActive).toBe(false);
    expect(result.daysRemaining).toBeLessThanOrEqual(0);
  });

  it('returns active trial for FREE user with trialEndsAt in future', async () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
    mockFindFirst.mockResolvedValue({
      subscriptionTier: 'FREE',
      trialStartedAt: new Date(),
      trialEndsAt: futureDate,
      isTrialing: true,
    });

    const result = await TrialService.checkTrialStatus('user-1');

    expect(result.isGrandfathered).toBe(false);
    expect(result.isActive).toBe(true);
    expect(result.daysRemaining).toBeGreaterThan(0);
  });

  it('returns always active for PRO users', async () => {
    mockFindFirst.mockResolvedValue({
      subscriptionTier: 'PRO',
      trialStartedAt: null,
      trialEndsAt: null,
      isTrialing: false,
    });

    const result = await TrialService.checkTrialStatus('user-1');

    expect(result.isGrandfathered).toBe(false);
    expect(result.isActive).toBe(true);
  });
});

describe('TrialService.batchCheckTrialStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('correctly classifies mixed user types including trialEndsAt-only users', async () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    mockFindMany.mockResolvedValue([
      {
        id: 'grandfathered',
        subscriptionTier: 'FREE',
        trialStartedAt: null,
        trialEndsAt: null,
        isTrialing: false,
      },
      {
        id: 'expired-no-start',
        subscriptionTier: 'FREE',
        trialStartedAt: null,
        trialEndsAt: pastDate,
        isTrialing: false,
      },
      {
        id: 'pro-user',
        subscriptionTier: 'PRO',
        trialStartedAt: null,
        trialEndsAt: null,
        isTrialing: false,
      },
    ]);

    const result = await TrialService.batchCheckTrialStatus([
      'grandfathered',
      'expired-no-start',
      'pro-user',
    ]);

    // Grandfathered: no trial dates at all
    expect(result.get('grandfathered')!.isGrandfathered).toBe(true);
    expect(result.get('grandfathered')!.isActive).toBe(true);

    // Expired with trialEndsAt but no trialStartedAt: NOT grandfathered
    expect(result.get('expired-no-start')!.isGrandfathered).toBe(false);
    expect(result.get('expired-no-start')!.isActive).toBe(false);

    // PRO: always active
    expect(result.get('pro-user')!.isActive).toBe(true);
    expect(result.get('pro-user')!.isGrandfathered).toBe(false);
  });
});
