/**
 * Interface tests for the Tier Scheduling module's cadence axis.
 *
 * These functions (calculateProcessingEligibility, getUserProcessingStatuses,
 * getEligibleUsers, getTierDistribution) previously had NO interface tests —
 * every consumer mocked them, so their behaviour was only ever asserted at the
 * mock boundary. After absorbing the priority axis into this module, the cadence
 * axis is exercised through its real interface here.
 *
 * Defaults (no env override in test setup): PRO frequency = 5min, HOBBY = 120min,
 * cadence sort priorities PRO = 2, HOBBY = 1.
 */

import {
  calculateProcessingEligibility,
  getUserProcessingStatuses,
  getEligibleUsers,
  getTierDistribution,
  getPriorityForTier,
} from '@/lib/cron/tier-eligibility';

const PRO_FREQ_MS = 5 * 60 * 1000;
const HOBBY_FREQ_MS = 120 * 60 * 1000;

describe('calculateProcessingEligibility (cadence axis)', () => {
  it('is immediately eligible when never processed', () => {
    const r = calculateProcessingEligibility('PRO', null);
    expect(r.isEligible).toBe(true);
    expect(r.timeSinceLastProcess).toBeNull();
    expect(r.nextEligibleTime).toBeNull();
  });

  it('uses the PRO frequency for PRO tier', () => {
    expect(calculateProcessingEligibility('PRO', null).frequencyMs).toBe(PRO_FREQ_MS);
  });

  it('buckets MAX into the PRO processing frequency (cadence axis ignores MAX/PRO split)', () => {
    const max = calculateProcessingEligibility('MAX', null);
    expect(max.tier).toBe('PRO');
    expect(max.frequencyMs).toBe(PRO_FREQ_MS);
  });

  it('uses the slower HOBBY frequency for FREE/unknown tiers', () => {
    expect(calculateProcessingEligibility('FREE', null).frequencyMs).toBe(HOBBY_FREQ_MS);
    expect(calculateProcessingEligibility('something-else', null).frequencyMs).toBe(HOBBY_FREQ_MS);
    expect(calculateProcessingEligibility('FREE', null).tier).toBe('HOBBY');
  });

  it('maps legacy paid tiers to PRO cadence', () => {
    expect(calculateProcessingEligibility('PROFESSIONAL', null).tier).toBe('PRO');
    expect(calculateProcessingEligibility('ENTERPRISE', null).tier).toBe('PRO');
    expect(calculateProcessingEligibility('INSTITUTION', null).tier).toBe('PRO');
  });

  it('is not eligible until the frequency window elapses, and reports nextEligibleTime', () => {
    const justNow = new Date(Date.now() - 60 * 1000); // 1 minute ago, < 5min PRO window
    const r = calculateProcessingEligibility('PRO', justNow);
    expect(r.isEligible).toBe(false);
    expect(r.nextEligibleTime).toBeInstanceOf(Date);
    expect(r.nextEligibleTime!.getTime()).toBe(justNow.getTime() + PRO_FREQ_MS);
  });

  it('is eligible again once the window has elapsed', () => {
    const longAgo = new Date(Date.now() - (PRO_FREQ_MS + 1000));
    const r = calculateProcessingEligibility('PRO', longAgo);
    expect(r.isEligible).toBe(true);
    expect(r.nextEligibleTime).toBeNull();
  });
});

describe('getUserProcessingStatuses (cadence-axis ordering)', () => {
  it('orders paid (PRO cadence) users ahead of FREE (HOBBY cadence) users', () => {
    const statuses = getUserProcessingStatuses([
      { id: 'free', subscriptionTier: 'FREE', lastProcessedAt: null },
      { id: 'pro', subscriptionTier: 'PRO', lastProcessedAt: null },
    ]);
    expect(statuses[0].userId).toBe('pro');
    expect(statuses[0].priority).toBe(2);
    expect(statuses[1].userId).toBe('free');
    expect(statuses[1].priority).toBe(1);
  });

  it('within the same cadence tier, the longest-waiting user goes first', () => {
    const older = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const statuses = getUserProcessingStatuses([
      { id: 'newer', subscriptionTier: 'FREE', lastProcessedAt: newer },
      { id: 'older', subscriptionTier: 'FREE', lastProcessedAt: older },
    ]);
    expect(statuses[0].userId).toBe('older');
  });

  it('puts never-processed users ahead of recently-processed peers in the same tier', () => {
    const recent = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const statuses = getUserProcessingStatuses([
      { id: 'recent', subscriptionTier: 'FREE', lastProcessedAt: recent },
      { id: 'never', subscriptionTier: 'FREE', lastProcessedAt: null },
    ]);
    expect(statuses[0].userId).toBe('never');
  });
});

describe('getEligibleUsers (cadence filter)', () => {
  it('drops users that are not yet due', () => {
    const statuses = getUserProcessingStatuses([
      { id: 'due', subscriptionTier: 'PRO', lastProcessedAt: null },
      { id: 'notDue', subscriptionTier: 'PRO', lastProcessedAt: new Date() },
    ]);
    const eligible = getEligibleUsers(statuses);
    expect(eligible.map(u => u.userId)).toEqual(['due']);
  });

  it('caps the batch at maxUsersPerCycle', () => {
    const users = Array.from({ length: 10 }, (_, i) => ({
      id: `u${i}`,
      subscriptionTier: 'PRO',
      lastProcessedAt: null,
    }));
    const eligible = getEligibleUsers(getUserProcessingStatuses(users), { maxUsersPerCycle: 3 });
    expect(eligible).toHaveLength(3);
  });
});

describe('getTierDistribution (monitoring)', () => {
  it('counts total and eligible per cadence tier', () => {
    const statuses = getUserProcessingStatuses([
      { id: 'p1', subscriptionTier: 'PRO', lastProcessedAt: null },
      { id: 'p2', subscriptionTier: 'PRO', lastProcessedAt: new Date() },
      { id: 'f1', subscriptionTier: 'FREE', lastProcessedAt: null },
    ]);
    const dist = getTierDistribution(statuses);
    expect(dist.PRO.total).toBe(2);
    expect(dist.PRO.eligible).toBe(1);
    expect(dist.HOBBY.total).toBe(1);
    expect(dist.HOBBY.eligible).toBe(1);
  });
});

describe('priority axis and cadence axis intentionally disagree on MAX', () => {
  it('MAX outranks PRO on the queue-priority axis', () => {
    expect(getPriorityForTier('MAX')).toBe(9);
    expect(getPriorityForTier('PRO')).toBe(7);
  });

  it('MAX shares PRO cadence on the frequency axis', () => {
    expect(calculateProcessingEligibility('MAX', null).tier).toBe('PRO');
    expect(calculateProcessingEligibility('PRO', null).tier).toBe('PRO');
  });
});
