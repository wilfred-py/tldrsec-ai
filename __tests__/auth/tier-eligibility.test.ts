/**
 * Unit tests for lib/auth/tier-eligibility helpers.
 */

import {
  MAX_ELIGIBILITY_GRACE_MS,
  isActiveTrial,
  isMaxEligible,
  hasActiveAccess,
  getActiveTrialCutoffDate,
  isSubscriptionActive,
  TICKER_LIMIT_BY_TIER,
  isTickerLimitReached,
  getTickerLimitInfo,
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

describe('isSubscriptionActive', () => {
  it('returns false for null / undefined', () => {
    expect(isSubscriptionActive(null)).toBe(false);
    expect(isSubscriptionActive(undefined)).toBe(false);
  });

  it('returns false when isActive=false even with future period end', () => {
    expect(
      isSubscriptionActive({ isActive: false, currentPeriodEnd: future() })
    ).toBe(false);
  });

  it('returns true when isActive=true and period end is in the future', () => {
    expect(
      isSubscriptionActive({ isActive: true, currentPeriodEnd: future() })
    ).toBe(true);
  });

  it('returns false when period end is in the past, even with isActive=true', () => {
    expect(
      isSubscriptionActive({ isActive: true, currentPeriodEnd: expired() })
    ).toBe(false);
  });

  it('treats the Lifetime Seat sentinel (9999-12-31) as active', () => {
    // ADR-0004: Lifetime Seat holders carry currentPeriodEnd = 9999-12-31.
    // Should compose cleanly with the active predicate.
    expect(
      isSubscriptionActive({
        isActive: true,
        currentPeriodEnd: new Date('9999-12-31T00:00:00.000Z'),
      })
    ).toBe(true);
  });

  it('uses strict greater-than: period end == now is reported inactive', () => {
    // 1ms edge case: a subscription expiring at exactly the current instant
    // is inactive. Chosen for symmetry with the two `<` call sites the
    // predicate replaces (app/api/user, services subscription-service).
    const now = new Date();
    expect(
      isSubscriptionActive({ isActive: true, currentPeriodEnd: now })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ticker-tracking limit — absorbed from lib/subscription/three-tier-limits.ts
// ---------------------------------------------------------------------------

describe('TICKER_LIMIT_BY_TIER', () => {
  it('FREE is unlimited (sentinel -1)', () => {
    expect(TICKER_LIMIT_BY_TIER.FREE).toBe(-1);
  });

  it('PRO caps at 25', () => {
    expect(TICKER_LIMIT_BY_TIER.PRO).toBe(25);
  });

  it('MAX is unlimited (sentinel -1)', () => {
    expect(TICKER_LIMIT_BY_TIER.MAX).toBe(-1);
  });
});

describe('isTickerLimitReached', () => {
  it('returns false for FREE regardless of count (unlimited)', () => {
    expect(isTickerLimitReached(0, 'FREE')).toBe(false);
    expect(isTickerLimitReached(1000, 'FREE')).toBe(false);
  });

  it('returns false for MAX regardless of count (unlimited)', () => {
    expect(isTickerLimitReached(0, 'MAX')).toBe(false);
    expect(isTickerLimitReached(1000, 'MAX')).toBe(false);
  });

  it('returns false below PRO cap', () => {
    expect(isTickerLimitReached(0, 'PRO')).toBe(false);
    expect(isTickerLimitReached(24, 'PRO')).toBe(false);
  });

  it('returns true at PRO cap (>=)', () => {
    expect(isTickerLimitReached(25, 'PRO')).toBe(true);
    expect(isTickerLimitReached(100, 'PRO')).toBe(true);
  });
});

describe('getTickerLimitInfo', () => {
  it('returns the unlimited triple for FREE', () => {
    expect(getTickerLimitInfo('FREE')).toEqual({ limit: -1, tier: 'FREE', unlimited: true });
  });

  it('returns the 25-cap triple for PRO', () => {
    expect(getTickerLimitInfo('PRO')).toEqual({ limit: 25, tier: 'PRO', unlimited: false });
  });

  it('returns the unlimited triple for MAX', () => {
    expect(getTickerLimitInfo('MAX')).toEqual({ limit: -1, tier: 'MAX', unlimited: true });
  });
});
