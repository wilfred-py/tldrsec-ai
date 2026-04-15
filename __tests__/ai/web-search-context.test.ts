/**
 * Tests for shared web search enrichment module
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

import {
  isMAFiling,
  isGovernanceFiling,
  counterpartyProvider,
  governanceProvider,
  runEnrichment,
  DEFAULT_PROVIDERS,
} from '../../lib/ai/web-search-context';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.TLDRSEC_AI_SUMMARIZER = 'test-api-key';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ─── Detection Tests ──────────────────────────────────────────────────────────

describe('isMAFiling', () => {
  it('detects M&A filing with Item 1.01 and acquisition keyword', () => {
    expect(isMAFiling('Item 1.01 Entry into Material Agreement for acquisition of XYZ Corp', '8-K')).toBe(true);
  });

  it('detects M&A filing with Item 2.01 and merger keyword', () => {
    expect(isMAFiling('Item 2.01 Completion of Acquisition pursuant to merger agreement', '8-K')).toBe(true);
  });

  it('rejects non-8-K form types', () => {
    expect(isMAFiling('Item 1.01 acquisition', '10-K')).toBe(false);
  });

  it('rejects 8-K without M&A item numbers', () => {
    expect(isMAFiling('Item 5.02 acquisition of new director', '8-K')).toBe(false);
  });

  it('rejects 8-K with M&A item but no keywords', () => {
    expect(isMAFiling('Item 1.01 Entry into Material Agreement for credit facility', '8-K')).toBe(false);
  });
});

describe('isGovernanceFiling', () => {
  it('detects governance filing with Item 5.02 and director keyword', () => {
    expect(isGovernanceFiling('Item 5.02 director Hock E. Tan will not stand for re-election', '8-K')).toBe(true);
  });

  it('detects governance filing with Item 5.07 and board keyword', () => {
    expect(isGovernanceFiling('Item 5.07 Submission of Matters to Vote board election results', '8-K')).toBe(true);
  });

  it('rejects non-8-K form types', () => {
    expect(isGovernanceFiling('Item 5.02 director departure', '10-K')).toBe(false);
  });

  it('rejects 8-K without governance item numbers', () => {
    expect(isGovernanceFiling('Item 1.01 director signed agreement', '8-K')).toBe(false);
  });

  it('rejects 8-K with governance item but no keywords', () => {
    expect(isGovernanceFiling('Item 5.02 quarterly financial results', '8-K')).toBe(false);
  });

  it('handles 8-K/A form type', () => {
    expect(isGovernanceFiling('Item 5.02 director resignation', '8-K/A')).toBe(true);
  });
});

// ─── Provider Tests ───────────────────────────────────────────────────────────

describe('counterpartyProvider', () => {
  it('parses valid response JSON', () => {
    const result = counterpartyProvider.parseResponse(
      '{"counterpartyName": "Globalstar, Inc.", "context": "A satellite communications company with $200M revenue."}'
    );
    expect(result).toEqual({
      label: 'Globalstar, Inc.',
      context: 'A satellite communications company with $200M revenue.',
    });
  });

  it('returns null for incomplete JSON', () => {
    expect(counterpartyProvider.parseResponse('{"counterpartyName": "Test"}')).toBeNull();
  });

  it('truncates long labels', () => {
    const longName = 'A'.repeat(300);
    const result = counterpartyProvider.parseResponse(
      `{"counterpartyName": "${longName}", "context": "test"}`
    );
    expect(result!.label.length).toBeLessThanOrEqual(200);
  });
});

describe('governanceProvider', () => {
  it('parses valid response JSON', () => {
    const result = governanceProvider.parseResponse(
      '{"directorName": "Hock E. Tan", "context": "CEO of Broadcom, one of the most prominent semiconductor executives."}'
    );
    expect(result).toEqual({
      label: 'Hock E. Tan',
      context: 'CEO of Broadcom, one of the most prominent semiconductor executives.',
    });
  });

  it('returns null for incomplete JSON', () => {
    expect(governanceProvider.parseResponse('{"directorName": "Test"}')).toBeNull();
  });
});

// ─── Orchestrator Tests ───────────────────────────────────────────────────────

describe('runEnrichment', () => {
  function mockFetch(response: object, delay = 0): typeof fetch {
    return jest.fn().mockImplementation(() =>
      new Promise(resolve =>
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve(response),
        } as Response), delay)
      )
    );
  }

  it('returns empty array when no providers match', async () => {
    const results = await runEnrichment(
      DEFAULT_PROVIDERS,
      'Some random 10-K content',
      '10-K',
      'Apple Inc.',
      'AAPL',
      { _fetchImpl: mockFetch({}) }
    );
    expect(results).toEqual([]);
  });

  it('runs counterparty provider for M&A filing', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: '{"counterpartyName": "Target Corp", "context": "A retail company."}' } }],
    });

    const results = await runEnrichment(
      [counterpartyProvider],
      'Item 1.01 Entry into Material Agreement for acquisition of Target Corp',
      '8-K',
      'Amazon.com Inc.',
      'AMZN',
      { _fetchImpl: fetchMock }
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('COUNTERPARTY CONTEXT');
    expect(results[0]).toContain('Target Corp');
  });

  it('runs governance provider for director filing', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: '{"directorName": "Hock E. Tan", "context": "CEO of Broadcom."}' } }],
    });

    const results = await runEnrichment(
      [governanceProvider],
      'Item 5.02 director Hock E. Tan will not stand for re-election to the board',
      '8-K',
      'Meta Platforms Inc.',
      'META',
      { _fetchImpl: fetchMock }
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('GOVERNANCE CONTEXT');
    expect(results[0]).toContain('Hock E. Tan');
  });

  it('skips provider when timeout budget exhausted', async () => {
    const slowFetch = mockFetch(
      { choices: [{ message: { content: '{"counterpartyName": "X", "context": "Y"}' } }] },
      100
    );

    const results = await runEnrichment(
      DEFAULT_PROVIDERS,
      'Item 1.01 acquisition and Item 5.02 director departure',
      '8-K',
      'Test Corp',
      'TEST',
      { totalTimeoutMs: 1, _fetchImpl: slowFetch } // 1ms budget = immediate exhaustion
    );

    // Should skip due to budget
    expect(results).toEqual([]);
  });

  it('returns empty when no API key available', async () => {
    delete process.env.TLDRSEC_AI_SUMMARIZER;
    delete process.env.OPENROUTER_API_KEY;

    const results = await runEnrichment(
      [counterpartyProvider],
      'Item 1.01 acquisition of XYZ',
      '8-K',
      'Test Corp',
      'TEST',
    );

    expect(results).toEqual([]);
  });

  it('handles API error gracefully', async () => {
    const errorFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const results = await runEnrichment(
      [counterpartyProvider],
      'Item 1.01 acquisition of XYZ Corp',
      '8-K',
      'Test Corp',
      'TEST',
      { _fetchImpl: errorFetch }
    );

    expect(results).toEqual([]);
  });

  it('handles malformed JSON gracefully', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: 'not valid json' } }],
    });

    const results = await runEnrichment(
      [counterpartyProvider],
      'Item 1.01 acquisition of XYZ Corp',
      '8-K',
      'Test Corp',
      'TEST',
      { _fetchImpl: fetchMock }
    );

    expect(results).toEqual([]);
  });
});
