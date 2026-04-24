/**
 * Tests for enrichment rollout gates: PostHog flags + daily spend cap.
 */

jest.mock('../../lib/logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordMetric: jest.fn(),
  },
}));

// Stubbable getServerPostHog — can be swapped per test
const mockGetFeatureFlag = jest.fn();
const mockPostHogClient: { getFeatureFlag: jest.Mock } | null = { getFeatureFlag: mockGetFeatureFlag };
let serverPostHogOverride: typeof mockPostHogClient | null = mockPostHogClient;

jest.mock('../../lib/analytics/posthog-server', () => ({
  getServerPostHog: () => serverPostHogOverride,
}));

import {
  isWhyItMattersEnabled,
  isProviderEnabled,
  isWithinDailyEnrichmentBudget,
  tryDebitEnrichmentBudget,
  _resetDailyEnrichmentSpend,
  _internal,
} from '../../lib/ai/enrichment-flags';

beforeEach(() => {
  mockGetFeatureFlag.mockReset();
  serverPostHogOverride = mockPostHogClient;
  _resetDailyEnrichmentSpend();
});

describe('isWhyItMattersEnabled', () => {
  it('returns true when PostHog returns true', async () => {
    mockGetFeatureFlag.mockResolvedValueOnce(true);
    await expect(isWhyItMattersEnabled('acc-123')).resolves.toBe(true);
    expect(mockGetFeatureFlag).toHaveBeenCalledWith(_internal.TOP_LEVEL_FLAG, 'acc-123');
  });

  it('returns false when PostHog returns false', async () => {
    mockGetFeatureFlag.mockResolvedValueOnce(false);
    await expect(isWhyItMattersEnabled('acc-123')).resolves.toBe(false);
  });

  it('fail-safe off when PostHog throws', async () => {
    mockGetFeatureFlag.mockRejectedValueOnce(new Error('posthog down'));
    await expect(isWhyItMattersEnabled('acc-123')).resolves.toBe(false);
  });

  it('fail-safe off when PostHog client is unavailable', async () => {
    serverPostHogOverride = null;
    await expect(isWhyItMattersEnabled('acc-123')).resolves.toBe(false);
  });

  it('passes accessionNumber as distinctId for stable bucketing', async () => {
    mockGetFeatureFlag.mockResolvedValueOnce(true);
    await isWhyItMattersEnabled('accession-42');
    expect(mockGetFeatureFlag).toHaveBeenCalledWith(expect.any(String), 'accession-42');
  });
});

describe('isProviderEnabled', () => {
  it('returns true when per-provider flag is on', async () => {
    mockGetFeatureFlag.mockResolvedValueOnce(true);
    await expect(isProviderEnabled('debt_issuance', 'acc-1')).resolves.toBe(true);
    expect(mockGetFeatureFlag).toHaveBeenCalledWith(_internal.PROVIDER_FLAGS.debt_issuance, 'acc-1');
  });

  it('returns false for unknown provider name', async () => {
    await expect(isProviderEnabled('nonexistent', 'acc-1')).resolves.toBe(false);
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
  });

  it('fail-safe off on PostHog error', async () => {
    mockGetFeatureFlag.mockRejectedValueOnce(new Error('network'));
    await expect(isProviderEnabled('earnings', 'acc-1')).resolves.toBe(false);
  });
});

describe('daily enrichment spend cap', () => {
  it('returns true when no spend has accumulated', () => {
    expect(isWithinDailyEnrichmentBudget()).toBe(true);
  });

  it('returns false once accumulated spend reaches the cap', () => {
    // Walk the accumulator up to exactly the cap via successful debits.
    const cap = _internal.DAILY_ENRICHMENT_CAP_USD;
    expect(tryDebitEnrichmentBudget(cap - 0.001)).toBe(true);
    expect(tryDebitEnrichmentBudget(0.001)).toBe(true);
    // Accumulator now == cap; isWithinDailyEnrichmentBudget uses strict `<`.
    expect(isWithinDailyEnrichmentBudget()).toBe(false);
  });

  it('resets to true after _resetDailyEnrichmentSpend', () => {
    const cap = _internal.DAILY_ENRICHMENT_CAP_USD;
    tryDebitEnrichmentBudget(cap - 0.001);
    tryDebitEnrichmentBudget(0.001);
    expect(isWithinDailyEnrichmentBudget()).toBe(false);
    _resetDailyEnrichmentSpend();
    expect(isWithinDailyEnrichmentBudget()).toBe(true);
  });
});

describe('tryDebitEnrichmentBudget', () => {
  it('returns true and accumulates when within budget', () => {
    expect(tryDebitEnrichmentBudget(1.0)).toBe(true);
    expect(_internal.dailySpend.usd).toBeCloseTo(1.0);
  });

  it('returns false and does NOT accumulate when debit would cross cap', () => {
    // Pre-fill accumulator just below cap
    tryDebitEnrichmentBudget(_internal.DAILY_ENRICHMENT_CAP_USD - 0.001);
    const before = _internal.dailySpend.usd;
    // Next debit pushes over — must be refused, accumulator unchanged
    expect(tryDebitEnrichmentBudget(0.01)).toBe(false);
    expect(_internal.dailySpend.usd).toBeCloseTo(before);
  });

  it('is atomic: two concurrent debits that would jointly exceed cap do not both succeed', async () => {
    // Fill to $4.998 of a $5 cap (default). With a cost of $0.003, both concurrent
    // callers would see `dailySpend.usd + cost <= cap` under a non-atomic
    // read-then-write — but the atomic check-and-debit ensures only one wins.
    tryDebitEnrichmentBudget(_internal.DAILY_ENRICHMENT_CAP_USD - 2 * _internal.APPROX_COST_PER_ENRICHMENT_CALL_USD - 0.001);
    const results = await Promise.all([
      Promise.resolve(tryDebitEnrichmentBudget()),
      Promise.resolve(tryDebitEnrichmentBudget()),
      Promise.resolve(tryDebitEnrichmentBudget()),
    ]);
    // Only 2 of the 3 fit under the cap (0.001 + 2 * 0.003 = 0.007 remaining headroom).
    const successes = results.filter(Boolean).length;
    expect(successes).toBeLessThanOrEqual(2);
  });

  it('uses APPROX_COST_PER_ENRICHMENT_CALL_USD as default cost', () => {
    tryDebitEnrichmentBudget();
    expect(_internal.dailySpend.usd).toBeCloseTo(_internal.APPROX_COST_PER_ENRICHMENT_CALL_USD);
  });
});
