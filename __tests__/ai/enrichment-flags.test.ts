/**
 * Tests for enrichment rollout gates: PostHog flag evaluation only.
 *
 * Daily-spend cap moved to `lib/ai/enrichment-spend.ts` (Postgres-backed,
 * multi-isolate-safe) and is exercised by `lib/ai/__tests__/enrichment-spend.test.ts`.
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
  _internal,
} from '../../lib/ai/enrichment-flags';

beforeEach(() => {
  mockGetFeatureFlag.mockReset();
  serverPostHogOverride = mockPostHogClient;
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

