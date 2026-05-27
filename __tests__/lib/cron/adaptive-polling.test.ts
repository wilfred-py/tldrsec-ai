/**
 * Tests for adaptive polling intervals and filing priority
 *
 * Covers:
 * - getAdaptivePollingIntervalMs: market hours, pre/post, off-hours, weekends, holidays
 * - shouldPollNow: elapsed time checks, null lastPollTime
 * - getFilingMaterialityBonus: form type priorities
 * - getCompositePriority: tier × materiality with Math.min(10, ...) clamping
 */

import {
  getAdaptivePollingIntervalMs,
  shouldPollNow,
} from '@/lib/cron/edgar-schedule';

import {
  getFilingMaterialityBonus,
  getCompositePriority,
} from '@/lib/cron/tier-eligibility';

// ── Adaptive Polling Intervals ───────────────────────────────────────

describe('getAdaptivePollingIntervalMs', () => {
  // Market hours: 9:30 AM - 4:00 PM ET → 30 seconds
  it('returns 30s during market hours (10 AM ET)', () => {
    // 10:00 AM ET = 14:00 UTC (EST) or 15:00 UTC (EDT)
    const marketHours = new Date('2026-03-25T14:00:00Z'); // Wednesday 10 AM ET
    expect(getAdaptivePollingIntervalMs(marketHours)).toBe(30_000);
  });

  it('returns 30s at market open (9:30 AM ET)', () => {
    const marketOpen = new Date('2026-03-25T13:30:00Z'); // Wednesday 9:30 AM ET
    expect(getAdaptivePollingIntervalMs(marketOpen)).toBe(30_000);
  });

  // Pre-market: 5:45 AM - 9:30 AM ET → 60 seconds
  it('returns 60s during pre-market (8 AM ET)', () => {
    const preMarket = new Date('2026-03-25T12:00:00Z'); // Wednesday 8 AM ET
    expect(getAdaptivePollingIntervalMs(preMarket)).toBe(60_000);
  });

  // Post-market: 4:00 PM - 10:15 PM ET → 60 seconds
  it('returns 60s during post-market (5 PM ET)', () => {
    const postMarket = new Date('2026-03-25T21:00:00Z'); // Wednesday 5 PM ET
    expect(getAdaptivePollingIntervalMs(postMarket)).toBe(60_000);
  });

  // Off-hours: 10:15 PM - 5:45 AM ET → 5 minutes
  it('returns 5min during off-hours (11 PM ET)', () => {
    const offHours = new Date('2026-03-26T03:00:00Z'); // Wednesday 11 PM ET
    expect(getAdaptivePollingIntervalMs(offHours)).toBe(5 * 60_000);
  });

  it('returns 5min during off-hours (3 AM ET)', () => {
    const lateNight = new Date('2026-03-26T07:00:00Z'); // Thursday 3 AM ET
    expect(getAdaptivePollingIntervalMs(lateNight)).toBe(5 * 60_000);
  });

  // Weekends → 15 minutes
  it('returns 15min on Saturday', () => {
    const saturday = new Date('2026-03-28T14:00:00Z'); // Saturday
    expect(getAdaptivePollingIntervalMs(saturday)).toBe(15 * 60_000);
  });

  it('returns 15min on Sunday', () => {
    const sunday = new Date('2026-03-29T14:00:00Z'); // Sunday
    expect(getAdaptivePollingIntervalMs(sunday)).toBe(15 * 60_000);
  });

  // Holidays → 15 minutes
  it('returns 15min on a federal holiday', () => {
    // 2026-12-25 is Christmas (Friday)
    const christmas = new Date('2026-12-25T14:00:00Z');
    expect(getAdaptivePollingIntervalMs(christmas)).toBe(15 * 60_000);
  });
});

// ── shouldPollNow ────────────────────────────────────────────────────

describe('shouldPollNow', () => {
  it('returns true when lastPollTime is null (first run)', () => {
    expect(shouldPollNow(null)).toBe(true);
  });

  it('returns true when enough time has elapsed', () => {
    const now = new Date('2026-03-25T14:00:00Z'); // Market hours → 30s interval
    const lastPoll = new Date('2026-03-25T13:59:00Z'); // 60s ago
    expect(shouldPollNow(lastPoll, now)).toBe(true);
  });

  it('returns false when not enough time has elapsed', () => {
    const now = new Date('2026-03-25T14:00:00Z'); // Market hours → 30s interval
    const lastPoll = new Date('2026-03-25T13:59:45Z'); // 15s ago (< 30s)
    expect(shouldPollNow(lastPoll, now)).toBe(false);
  });

  it('respects off-hours interval (5 min)', () => {
    const now = new Date('2026-03-26T03:00:00Z'); // 11 PM ET → 5 min interval
    const lastPoll = new Date('2026-03-26T02:57:00Z'); // 3 min ago (< 5 min)
    expect(shouldPollNow(lastPoll, now)).toBe(false);
  });
});

// ── Filing Materiality Bonus ─────────────────────────────────────────

describe('getFilingMaterialityBonus', () => {
  it('returns 3 for 8-K (material events)', () => {
    expect(getFilingMaterialityBonus('8-K')).toBe(3);
  });

  it('returns 2 for 10-K (annual report)', () => {
    expect(getFilingMaterialityBonus('10-K')).toBe(2);
  });

  it('returns 2 for 10-Q (quarterly report)', () => {
    expect(getFilingMaterialityBonus('10-Q')).toBe(2);
  });

  it('returns 1 for Form 4 (insider trading)', () => {
    expect(getFilingMaterialityBonus('4')).toBe(1);
  });

  it('returns 0 for amendments', () => {
    expect(getFilingMaterialityBonus('4/A')).toBe(0);
    expect(getFilingMaterialityBonus('8-K/A')).toBe(0);
  });

  it('returns 0 for unknown form types', () => {
    expect(getFilingMaterialityBonus('UNKNOWN-FORM')).toBe(0);
  });
});

// ── Composite Priority ───────────────────────────────────────────────

describe('getCompositePriority', () => {
  it('combines tier and materiality (PRO + 8-K = 10)', () => {
    expect(getCompositePriority('PRO', '8-K')).toBe(10); // 7 + 3 = 10
  });

  it('clamps to 10 when sum exceeds max (MAX + 8-K = 10, not 12)', () => {
    expect(getCompositePriority('MAX', '8-K')).toBe(10); // min(10, 9+3) = 10
  });

  it('returns tier priority when materiality is 0', () => {
    expect(getCompositePriority('MAX', '4/A')).toBe(9); // 9 + 0 = 9
  });

  it('returns FREE + 8-K = 8', () => {
    expect(getCompositePriority('FREE', '8-K')).toBe(8); // 5 + 3 = 8
  });

  it('returns FREE + unknown = 5', () => {
    expect(getCompositePriority('FREE', 'UNKNOWN')).toBe(5); // 5 + 0 = 5
  });
});
