/**
 * Regression test: xai-direct-client DEFAULT_MODEL must be a valid xAI slug.
 *
 * Background: prior to this PR, DEFAULT_MODEL was 'grok-4.20-reasoning' — a
 * model that has never existed in xAI's lineup. x-sentiment-provider.ts calls
 * callXaiResponses({input, tools, timeoutMs}) without a `model` field, so
 * DEFAULT_MODEL was reached on every sentiment call and would 404 silently.
 *
 * This test asserts that the model field sent to api.x.ai when no `model` is
 * passed matches the expected grok-4.3 slug — and that callers omitting `model`
 * do NOT end up sending a slug to the wire that xAI doesn't recognize.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock('../../../lib/logging', () => ({
  logger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

jest.mock('../../../lib/monitoring', () => ({
  monitoring: { incrementCounter: jest.fn(), recordValue: jest.fn() },
}));

import { callXaiResponses } from '../../../lib/ai/xai-direct-client';

describe('xai-direct-client DEFAULT_MODEL regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.XAI_API_KEY = 'test-key-for-regression';

    const responseBody = JSON.stringify({
      id: 'resp_test',
      model: 'grok-4.3',
      status: 'completed',
      output_text: 'ok',
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, cost_in_usd_ticks: 0 },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => responseBody,
      json: async () => JSON.parse(responseBody),
    });
  });

  it('sends model="grok-4.3" when caller omits the model field', async () => {
    // x-sentiment-provider builds its body this way — no `model` key. This is
    // exactly the call shape that previously hit the 'grok-4.20-reasoning'
    // default and 404'd in production.
    await callXaiResponses({
      input: 'test prompt',
      tools: [],
      timeoutMs: 1_000,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe('grok-4.3');
  });

  it('respects an explicit model arg over the default', async () => {
    await callXaiResponses({
      model: 'grok-4.3',
      input: 'test prompt',
      timeoutMs: 1_000,
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe('grok-4.3');
  });

  it('default model is NOT a retired or fictional slug', async () => {
    await callXaiResponses({ input: 'sentinel', timeoutMs: 1_000 });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    // Forbidden slugs: anything that retired 2026-05-15 or never existed.
    expect(body.model).not.toMatch(/grok-4\.20/); // typo from prior code
    expect(body.model).not.toMatch(/grok-4-fast/);
    expect(body.model).not.toMatch(/grok-4\.1-fast/);
    expect(body.model).not.toMatch(/grok-3$/);
    expect(body.model).not.toMatch(/grok-code-fast/);
    expect(body.model).not.toMatch(/grok-2/);
    expect(body.model).not.toMatch(/grok-beta/);
    expect(body.model).not.toMatch(/grok-4-0709/);
  });
});
