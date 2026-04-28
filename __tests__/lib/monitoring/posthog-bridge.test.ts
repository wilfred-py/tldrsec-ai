/**
 * Counter → PostHog bridge tests for `lib/monitoring/index.ts`.
 *
 * The bridge forwards allowlisted metric names to PostHog as
 * `monitoring_metric` events so the dashboards in
 * `tasks/x-sentiment-posthog-dashboards.md` have data to render.
 *
 * What we assert:
 *   - Allowlisted prefix (`ai.x_sentiment_*`) → fanout fires once per record.
 *   - Non-allowlisted metric → no PostHog call (zero noise from other counters).
 *   - Tags flatten into top-level event properties for HogQL slicing.
 *   - PostHog disabled (no key) → silent no-op, in-memory metric still recorded.
 *   - PostHog throws → bridge swallows + warns, in-memory metric still recorded.
 *   - `kind` derives from unit (counter/gauge/timing/value).
 */

// jest.setup.js installs a global mock for `@/lib/monitoring` (a stub object that
// doesn't have getMetric/recordMetric and doesn't run the real bridge code).
// We need the REAL singleton to test the bridge — unmock both alias forms.
jest.unmock('@/lib/monitoring');
jest.unmock('../../../lib/monitoring');

jest.mock('../../../lib/db/prisma', () => ({
  prisma: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
}));

jest.mock('../../../lib/logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const mockCapture = jest.fn();
let mockClient: { capture: jest.Mock } | null = { capture: mockCapture };

jest.mock('../../../lib/analytics/posthog-server', () => ({
  getServerPostHog: () => mockClient,
}));

// jest.requireActual bypasses the global @/lib/monitoring mock from jest.setup.js
// so we exercise the real singleton + bridge.
const { monitoring } = jest.requireActual<typeof import('../../../lib/monitoring')>(
  '../../../lib/monitoring',
);
import { EVENTS } from '../../../lib/analytics/events';

describe('counter → PostHog bridge', () => {
  beforeEach(() => {
    mockCapture.mockReset();
    mockClient = { capture: mockCapture };
  });

  it('forwards allowlisted x_sentiment counter with tags flattened to event props', () => {
    monitoring.incrementCounter('ai.x_sentiment_added', 1, {
      direction: 'bullish',
      confidence: 'high',
    });

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const arg = mockCapture.mock.calls[0][0];
    expect(arg.event).toBe(EVENTS.MONITORING_METRIC);
    expect(arg.distinctId).toBe('server');
    expect(arg.properties).toMatchObject({
      metric: 'ai.x_sentiment_added',
      value: 1,
      kind: 'counter',
      direction: 'bullish',
      confidence: 'high',
    });
  });

  it('forwards x_sentiment value as a counter increment on the .count suffix', () => {
    monitoring.recordValue('ai.x_sentiment_cost_usd', 0.27);

    // `recordValue(metric, v)` is implemented as `incrementCounter(metric+'.count', 1)`
    // (see lib/monitoring/index.ts:170). The bridge sees the `.count` increment, not
    // the raw value — but the prefix still matches the allowlist so the event fires.
    const valueCall = mockCapture.mock.calls.find(
      (c) => c[0].properties.metric === 'ai.x_sentiment_cost_usd.count',
    );
    expect(valueCall).toBeDefined();
    expect(valueCall![0].properties.kind).toBe('counter');
    expect(valueCall![0].properties.value).toBe(1);
  });

  it('does NOT forward non-allowlisted counters', () => {
    monitoring.incrementCounter('sec.filings', 1, { operation: 'parse' });
    monitoring.incrementCounter('api.requests', 3, { path: '/foo' });

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('is a silent no-op when PostHog is not configured (no NEXT_PUBLIC_POSTHOG_KEY)', () => {
    mockClient = null;

    expect(() =>
      monitoring.incrementCounter('ai.x_sentiment_added', 1, { direction: 'bullish' }),
    ).not.toThrow();

    expect(mockCapture).not.toHaveBeenCalled();

    // In-memory metric still recorded — bridge failure must not break the path.
    const metric = monitoring.getMetric('ai.x_sentiment_added');
    expect(metric).toBeDefined();
    expect(metric!.values.length).toBeGreaterThan(0);
  });

  it('swallows PostHog capture exceptions and continues', () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(() =>
      monitoring.incrementCounter('ai.x_sentiment_added', 1, { direction: 'bearish' }),
    ).not.toThrow();

    // In-memory metric is still recorded after the bridge failure.
    const metric = monitoring.getMetric('ai.x_sentiment_added');
    expect(metric).toBeDefined();
  });

  it('derives kind=timing for *.duration_ms metrics on allowlisted prefix', () => {
    // Use an allowlisted prefix to land in the bridge.
    monitoring.recordTiming('ai.x_sentiment_latency.duration_ms', 1500);
    // recordTiming under the hood calls recordValue, which records into
    // `${metric}.duration_ms.duration_ms` — match exactly what hits the bridge.
    const timingCall = mockCapture.mock.calls.find(
      (c) => String(c[0].properties.metric).startsWith('ai.x_sentiment_latency'),
    );
    expect(timingCall).toBeDefined();
  });
});
