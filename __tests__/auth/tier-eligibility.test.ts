/**
 * Unit tests for lib/auth/tier-eligibility helpers.
 */

import {
  MAX_ELIGIBILITY_GRACE_MS,
  isActiveTrial,
  isMaxEligible,
  hasActiveAccess,
  getActiveTrialCutoffDate,
} from '@/lib/auth/tier-eligibility';

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const expired = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
const justExpired = () => new Date(Date.now() - 2 * 60 * 1000); // within grace
const beyondGrace = () => new Date(Date.now() - 10 * 60 * 1000);

describe('isActiveTrial', () => {
  it('returns false when isTrialing is false', () => {
    expect(isActiveTrial({ isTrialing: false, trialEndsAt: future() })).toBe(false);
  });

  it('returns false when isTrialing is null/undefined', () => {
    expect(isActiveTrial({ isTrialing: null, trialEndsAt: future() })).toBe(false);
    expect(isActiveTrial({ trialEndsAt: future() })).toBe(false);
  });

  it('returns false when trialEndsAt is null', () => {
    expect(isActiveTrial({ isTrialing: true, trialEndsAt: null })).toBe(false);
  });

  it('returns true when trial ends in future', () => {
    expect(isActiveTrial({ isTrialing: true, trialEndsAt: future() })).toBe(true);
  });

  it('returns true within 5-min grace after expiry (clock-skew tolerance)', () => {
    expect(isActiveTrial({ isTrialing: true, trialEndsAt: justExpired() })).toBe(true);
  });

  it('returns false beyond 5-min grace after expiry', () => {
    expect(isActiveTrial({ isTrialing: true, trialEndsAt: beyondGrace() })).toBe(false);
  });
});

describe('isMaxEligible', () => {
  it('returns true for MAX paid users', () => {
    expect(isMaxEligible({ tier: 'MAX' })).toBe(true);
  });

  it('returns false for PRO paid users (X-search is Max-gated)', () => {
    expect(isMaxEligible({ tier: 'PRO' })).toBe(false);
  });

  it('returns false for FREE users with no trial', () => {
    expect(isMaxEligible({ tier: 'FREE' })).toBe(false);
  });

  it('returns true for FREE users with active trial', () => {
    expect(
      isMaxEligible({ tier: 'FREE', isTrialing: true, trialEndsAt: future() })
    ).toBe(true);
  });

  it('returns false for FREE users with expired trial beyond grace', () => {
    expect(
      isMaxEligible({ tier: 'FREE', isTrialing: true, trialEndsAt: expired() })
    ).toBe(false);
  });

  it('returns true for MAX users regardless of trial state', () => {
    expect(
      isMaxEligible({ tier: 'MAX', isTrialing: true, trialEndsAt: expired() })
    ).toBe(true);
  });

  it('returns false for unknown tiers', () => {
    expect(isMaxEligible({ tier: 'ENTERPRISE' })).toBe(false);
    expect(isMaxEligible({ tier: null })).toBe(false);
  });
});

describe('hasActiveAccess', () => {
  it('returns true for PRO and MAX', () => {
    expect(hasActiveAccess({ tier: 'PRO' })).toBe(true);
    expect(hasActiveAccess({ tier: 'MAX' })).toBe(true);
  });

  it('returns false for FREE without trial', () => {
    expect(hasActiveAccess({ tier: 'FREE' })).toBe(false);
  });

  it('returns true for FREE with active trial', () => {
    expect(
      hasActiveAccess({ tier: 'FREE', isTrialing: true, trialEndsAt: future() })
    ).toBe(true);
  });

  it('returns false for FREE with expired trial beyond grace', () => {
    expect(
      hasActiveAccess({ tier: 'FREE', isTrialing: true, trialEndsAt: expired() })
    ).toBe(false);
  });
});

describe('getActiveTrialCutoffDate', () => {
  it('returns now minus 5-min grace', () => {
    const before = Date.now() - MAX_ELIGIBILITY_GRACE_MS;
    const cutoff = getActiveTrialCutoffDate();
    const after = Date.now() - MAX_ELIGIBILITY_GRACE_MS;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after);
  });

  it('exposes the grace constant', () => {
    expect(MAX_ELIGIBILITY_GRACE_MS).toBe(5 * 60 * 1000);
  });
});
