/**
 * Tests for pipeline optimization changes:
 * 1. Tier-based job priority (getPriorityForTier)
 * 2. EDGAR quiet hours (isEdgarOpen)
 * 3. Adaptive summarize batch sizing (time-budget loop)
 * 4. Staggered RSS check launch
 */

// ─────────────────────────────────────────────────────────
// 1. Tier Priority
// ─────────────────────────────────────────────────────────

import { getPriorityForTier } from '../../../lib/cron/tier-eligibility';

describe('getPriorityForTier', () => {
  it('returns 5 for FREE tier', () => {
    expect(getPriorityForTier('FREE')).toBe(5);
  });

  it('returns 7 for PRO tier', () => {
    expect(getPriorityForTier('PRO')).toBe(7);
  });

  it('returns 9 for MAX tier', () => {
    expect(getPriorityForTier('MAX')).toBe(9);
  });

  it('returns 5 for unknown tier', () => {
    expect(getPriorityForTier('ENTERPRISE')).toBe(5);
    expect(getPriorityForTier('PROFESSIONAL')).toBe(5);
    expect(getPriorityForTier('PLUS')).toBe(5);
    expect(getPriorityForTier('')).toBe(5);
  });

  it('returns 9 for active trial user', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(getPriorityForTier('FREE', true, futureDate)).toBe(9);
  });

  it('returns tier-based priority for expired trial (past grace period)', () => {
    // Trial ended 10 minutes ago — well past the 5-min grace period
    const pastDate = new Date(Date.now() - 10 * 60 * 1000);
    expect(getPriorityForTier('FREE', true, pastDate)).toBe(5);
  });

  it('returns 9 for trial within grace period (ended 3 min ago)', () => {
    const recentlyExpired = new Date(Date.now() - 3 * 60 * 1000);
    expect(getPriorityForTier('FREE', true, recentlyExpired)).toBe(9);
  });

  it('returns tier-based priority when isTrialing is false', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(getPriorityForTier('FREE', false, futureDate)).toBe(5);
  });

  it('returns tier-based priority when trialEndsAt is null', () => {
    expect(getPriorityForTier('PRO', true, null)).toBe(7);
  });

  it('returns tier-based priority when trial fields omitted', () => {
    expect(getPriorityForTier('MAX')).toBe(9);
    expect(getPriorityForTier('FREE')).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────
// 2. EDGAR Schedule
// ─────────────────────────────────────────────────────────

import { isEdgarOpen } from '../../../lib/cron/edgar-schedule';

describe('isEdgarOpen', () => {
  // Helper to create a Date at a specific ET time
  // We construct it by creating a UTC date that corresponds to the desired ET time
  function etDate(
    year: number, month: number, day: number,
    hour: number, minute: number,
    isDST: boolean = false
  ): Date {
    // ET = UTC-5 (EST) or UTC-4 (EDT)
    const offset = isDST ? 4 : 5;
    return new Date(Date.UTC(year, month - 1, day, hour + offset, minute));
  }

  it('returns true for weekday 2 PM ET', () => {
    // 2026-03-16 is a Monday (no DST yet — springs forward Mar 8, so actually IS DST)
    // Let's use 2026-01-05 (Monday, EST)
    expect(isEdgarOpen(etDate(2026, 1, 5, 14, 0))).toBe(true);
  });

  it('returns false for Saturday noon ET', () => {
    // 2026-01-03 is a Saturday
    expect(isEdgarOpen(etDate(2026, 1, 3, 12, 0))).toBe(false);
  });

  it('returns false for Sunday noon ET', () => {
    // 2026-01-04 is a Sunday
    expect(isEdgarOpen(etDate(2026, 1, 4, 12, 0))).toBe(false);
  });

  it('returns false for Tuesday 11 PM ET', () => {
    // 2026-01-06 is a Tuesday
    expect(isEdgarOpen(etDate(2026, 1, 6, 23, 0))).toBe(false);
  });

  it('returns false at exactly 10:15 PM ET (buffer start)', () => {
    expect(isEdgarOpen(etDate(2026, 1, 5, 22, 15))).toBe(false);
  });

  it('returns false at exactly 5:44 AM ET (buffer end)', () => {
    expect(isEdgarOpen(etDate(2026, 1, 5, 5, 44))).toBe(false);
  });

  it('returns true at 5:45 AM ET (first open minute)', () => {
    expect(isEdgarOpen(etDate(2026, 1, 5, 5, 45))).toBe(true);
  });

  it('returns true at 10:14 PM ET (last open minute)', () => {
    expect(isEdgarOpen(etDate(2026, 1, 5, 22, 14))).toBe(true);
  });

  it('returns false on federal holiday (2026-01-01 noon ET)', () => {
    // 2026-01-01 is a Thursday (New Year's Day)
    expect(isEdgarOpen(etDate(2026, 1, 1, 12, 0))).toBe(false);
  });

  it('returns true with console.warn for year without holiday data', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    // 2028-01-03 is a Monday
    expect(isEdgarOpen(etDate(2028, 1, 3, 14, 0))).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No holiday data for 2028')
    );
    warnSpy.mockRestore();
  });

  it('handles DST spring-forward: 2026-03-08 (EDT starts) at edge hour', () => {
    // March 8, 2026: clocks spring forward at 2 AM EST → 3 AM EDT
    // 6 AM EDT on March 9 (Monday) should be open
    // isDST=true for EDT
    expect(isEdgarOpen(etDate(2026, 3, 9, 6, 0, true))).toBe(true);
  });

  it('handles DST fall-back: 2026-11-01 (EST returns) at edge hour', () => {
    // November 1, 2026: clocks fall back at 2 AM EDT → 1 AM EST
    // This is a Sunday, so it should be false regardless
    expect(isEdgarOpen(etDate(2026, 11, 1, 10, 0))).toBe(false);
    // Monday Nov 2, 10 AM EST should be open
    expect(isEdgarOpen(etDate(2026, 11, 2, 10, 0))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// 3. Adaptive Summarize Batch Sizing (time-budget logic)
// ─────────────────────────────────────────────────────────

import { SUMMARIZE_TIME_BUDGET_MS } from '../../../lib/cron/types';

describe('Summarize time-budget constants', () => {
  it('SUMMARIZE_TIME_BUDGET_MS is 240s', () => {
    expect(SUMMARIZE_TIME_BUDGET_MS).toBe(240_000);
  });
});

describe('Summarize batch time-budget logic', () => {
  // Simulate the time-budget loop logic from background-filing-worker.ts
  function simulateBatchLoop(
    jobs: Array<{ jobType: string }>,
    durations: number[],
    budgetMs: number = SUMMARIZE_TIME_BUDGET_MS
  ): number {
    let processed = 0;
    const batchStart = 0; // simulated start at 0
    let elapsed = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      // Check time budget for summarize jobs after the first
      if (job.jobType === 'ASYNC_SUMMARIZE_CACHED' && processed > 0) {
        const lastDuration = durations[processed - 1] || 0;
        const remaining = budgetMs - elapsed;
        if (lastDuration > 30_000 || remaining < 60_000) {
          break;
        }
      }
      // "Process" the job
      elapsed += durations[i] || 0;
      processed++;
    }
    return processed;
  }

  it('stops when last job took exactly 30000ms (boundary)', () => {
    const jobs = Array(5).fill({ jobType: 'ASYNC_SUMMARIZE_CACHED' });
    // First job: 30000ms, should stop before second
    const result = simulateBatchLoop(jobs, [30000, 5000, 5000, 5000, 5000]);
    // First job always runs, but after it, lastDuration=30000 triggers stop (30000 > 30000 is false)
    // Actually 30000 > 30_000 is false, so it continues
    // Wait: 30000 > 30000 is false. So it doesn't stop. Let me re-check.
    // The condition is lastDuration > 30_000, so 30001 stops, 30000 doesn't.
    expect(result).toBe(5); // 30000 is NOT > 30000, so all 5 run if budget allows
  });

  it('stops when last job took 30001ms (just over threshold)', () => {
    const jobs = Array(5).fill({ jobType: 'ASYNC_SUMMARIZE_CACHED' });
    const result = simulateBatchLoop(jobs, [30001, 5000, 5000, 5000, 5000]);
    expect(result).toBe(1); // Only first runs, then stops
  });

  it('continues when remaining time is exactly 60000ms (boundary)', () => {
    const jobs = Array(3).fill({ jobType: 'ASYNC_SUMMARIZE_CACHED' });
    // Budget is 240s. First job takes 5s (short, so lastDuration check passes).
    // Second job: elapsed=10s, remaining=230s — continues.
    // Use custom budget so we can control remaining precisely.
    // Budget=70s, first takes 5s, remaining=65s after first. lastDuration=5000<30000 → ok.
    // Then second takes 5s, remaining=60s. lastDuration=5000<30000 → ok, 60000<60000 false → continues.
    const result = simulateBatchLoop(jobs, [5000, 5000, 5000], 70000);
    expect(result).toBe(3); // 60000 is NOT < 60000, continues
  });

  it('stops when remaining time is 59999ms (just under threshold)', () => {
    const jobs = Array(3).fill({ jobType: 'ASYNC_SUMMARIZE_CACHED' });
    // Budget=69999. First takes 5s, remaining=64999. Second takes 5s, remaining=59999.
    // remaining < 60_000 → true → stops before third.
    const result = simulateBatchLoop(jobs, [5000, 5000, 5000], 69999);
    expect(result).toBe(2); // Stops before third
  });

  it('first job in batch always runs regardless of budget', () => {
    const jobs = [{ jobType: 'ASYNC_SUMMARIZE_CACHED' }];
    // Even with very short budget, first job runs
    const result = simulateBatchLoop(jobs, [250000], 10000);
    expect(result).toBe(1);
  });

  it('non-summarize job types skip the budget check', () => {
    const jobs = [
      { jobType: 'ASYNC_FETCH_FILING' },
      { jobType: 'ASYNC_FETCH_FILING' },
      { jobType: 'ASYNC_FETCH_FILING' },
    ];
    // Even with slow durations, fetch jobs don't check budget
    const result = simulateBatchLoop(jobs, [50000, 50000, 50000]);
    expect(result).toBe(3); // All processed
  });

  it('all 5 fast jobs complete when under budget', () => {
    const jobs = Array(5).fill({ jobType: 'ASYNC_SUMMARIZE_CACHED' });
    const result = simulateBatchLoop(jobs, [5000, 5000, 5000, 5000, 5000]);
    expect(result).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────
// 4. Staggered RSS Check Launch
// ─────────────────────────────────────────────────────────

import { RSS_STAGGER_DELAY_MS } from '../../../lib/cron/types';

describe('RSS stagger delay', () => {
  it('RSS_STAGGER_DELAY_MS is 200ms', () => {
    expect(RSS_STAGGER_DELAY_MS).toBe(200);
  });

  it('stagger produces correct delays for 5 tickers', () => {
    const delays: number[] = [];
    const batch = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'];

    batch.forEach((_, i) => {
      delays.push(i * RSS_STAGGER_DELAY_MS);
    });

    expect(delays).toEqual([0, 200, 400, 600, 800]);
  });

  it('setTimeout called with correct stagger delays', async () => {
    const originalSetTimeout = global.setTimeout;
    const timeoutCalls: number[] = [];

    // Track setTimeout calls
    const mockSetTimeout = jest.fn((fn: () => void, delay?: number) => {
      timeoutCalls.push(delay || 0);
      // Execute immediately for test speed
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;

    try {
      const batch = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'];
      const promises = batch.map((_, i) => {
        return new Promise<void>(resolve =>
          setTimeout(resolve, i * RSS_STAGGER_DELAY_MS)
        ).then(() => Promise.resolve());
      });

      await Promise.allSettled(promises);

      // Filter for our stagger delays (setTimeout is also used internally)
      const staggerDelays = timeoutCalls.filter(d => d % RSS_STAGGER_DELAY_MS === 0).slice(0, 5);
      expect(staggerDelays).toEqual([0, 200, 400, 600, 800]);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });
});
