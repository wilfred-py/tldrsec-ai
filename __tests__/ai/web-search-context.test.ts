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

// Enrichment budget is covered by its own test file; don't couple these tests
// to the process-wide spend accumulator.
jest.mock('../../lib/ai/enrichment-flags', () => ({
  tryDebitEnrichmentBudget: jest.fn(() => true),
  isWhyItMattersEnabled: jest.fn(async () => true),
  isProviderEnabled: jest.fn(async () => true),
  isWithinDailyEnrichmentBudget: jest.fn(() => true),
}));

import {
  isMAFiling,
  isGovernanceFiling,
  counterpartyProvider,
  governanceProvider,
  debtIssuanceProvider,
  earningsProvider,
  capitalReturnProvider,
  createItemBasedProvider,
  runEnrichment,
  DEFAULT_PROVIDERS,
  _clearEnrichmentCache,
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
  it('parses valid response JSON with standardized {label, context}', () => {
    const result = counterpartyProvider.parseResponse(
      '{"label": "Globalstar, Inc.", "context": "A satellite communications company with $200M revenue."}'
    );
    expect(result).toEqual({
      label: 'Globalstar, Inc.',
      context: 'A satellite communications company with $200M revenue.',
    });
  });

  it('returns null for incomplete JSON', () => {
    expect(counterpartyProvider.parseResponse('{"label": "Test"}')).toBeNull();
  });

  it('truncates long labels', () => {
    const longName = 'A'.repeat(300);
    const result = counterpartyProvider.parseResponse(
      `{"label": "${longName}", "context": "test"}`
    );
    expect(result!.label.length).toBeLessThanOrEqual(200);
  });
});

describe('governanceProvider', () => {
  it('parses valid response JSON with standardized {label, context}', () => {
    const result = governanceProvider.parseResponse(
      '{"label": "Hock E. Tan", "context": "CEO of Broadcom, one of the most prominent semiconductor executives."}'
    );
    expect(result).toEqual({
      label: 'Hock E. Tan',
      context: 'CEO of Broadcom, one of the most prominent semiconductor executives.',
    });
  });

  it('returns null for incomplete JSON', () => {
    expect(governanceProvider.parseResponse('{"label": "Test"}')).toBeNull();
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
      choices: [{ message: { content: '{"label": "Target Corp", "context": "A retail company."}' } }],
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
      choices: [{ message: { content: '{"label": "Hock E. Tan", "context": "CEO of Broadcom."}' } }],
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
      { choices: [{ message: { content: '{"label": "X", "context": "Y"}' } }] },
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

// ─── New Provider Detection (W3.4) ────────────────────────────────────────────

describe('debtIssuanceProvider.detect', () => {
  it('detects senior notes in 424B2', () => {
    expect(
      debtIssuanceProvider.detect(
        'Pricing supplement for 5.25% senior notes due 2036 indenture',
        '424B2',
      ),
    ).toBe(true);
  });

  it('detects 424B3 pricing supplement', () => {
    expect(
      debtIssuanceProvider.detect('Pricing supplement for senior notes due 2030', '424B3'),
    ).toBe(true);
  });

  it('rejects non-debt form types', () => {
    expect(debtIssuanceProvider.detect('Pricing supplement for senior notes', '10-K')).toBe(false);
  });

  it('rejects 424B2 without debt keywords', () => {
    expect(debtIssuanceProvider.detect('Common stock offering supplement', '424B2')).toBe(false);
  });
});

describe('earningsProvider.detect', () => {
  it('detects earnings 8-K with Item 2.02 and revenue', () => {
    expect(
      earningsProvider.detect('Item 2.02 Results of Operations revenue and EPS', '8-K'),
    ).toBe(true);
  });

  it('rejects non-earnings item', () => {
    expect(earningsProvider.detect('Item 1.01 financial results', '8-K')).toBe(false);
  });
});

describe('capitalReturnProvider.detect', () => {
  it('detects buyback auth under Item 8.01', () => {
    expect(
      capitalReturnProvider.detect(
        'Item 8.01 Other Events $2B share repurchase authorization',
        '8-K',
      ),
    ).toBe(true);
  });

  it('rejects buyback language outside Item 8.01', () => {
    expect(
      capitalReturnProvider.detect('Item 5.02 executive departure share repurchase', '8-K'),
    ).toBe(false);
  });
});

// ─── Factory Contract (W3.3) ──────────────────────────────────────────────────

describe('createItemBasedProvider', () => {
  const custom = createItemBasedProvider({
    name: 'custom',
    sectionHeader: 'CUSTOM CONTEXT',
    formTypes: ['8-K'],
    itemPattern: /Item\s+9\.99/i,
    keywords: ['sentinel-keyword'],
    maxExcerptLength: 100,
    systemPrompt: 'Test system prompt.',
    buildUserPrompt: (excerpt, companyName, ticker) =>
      `Analyze ${companyName} (${ticker}): ${excerpt}`,
  });

  it('parses standardized {label, context} response', () => {
    expect(custom.parseResponse('{"label": "X", "context": "Y"}')).toEqual({
      label: 'X',
      context: 'Y',
    });
  });

  it('rejects missing label field', () => {
    expect(custom.parseResponse('{"context": "Y"}')).toBeNull();
  });

  it('rejects missing context field', () => {
    expect(custom.parseResponse('{"label": "X"}')).toBeNull();
  });

  it('truncates label over 200 chars', () => {
    const result = custom.parseResponse(`{"label": "${'X'.repeat(300)}", "context": "Y"}`);
    expect(result!.label.length).toBeLessThanOrEqual(200);
  });

  it('detect enforces formType + item + keywords together', () => {
    expect(custom.detect('Item 9.99 sentinel-keyword here', '8-K')).toBe(true);
    expect(custom.detect('Item 9.99 sentinel-keyword', '10-K')).toBe(false);
    expect(custom.detect('Item 1.01 sentinel-keyword', '8-K')).toBe(false);
    expect(custom.detect('Item 9.99 no-match', '8-K')).toBe(false);
  });
});

// ─── Concurrency Failure Isolation (W3.2) ─────────────────────────────────────

describe('runEnrichment — concurrency failure isolation', () => {
  beforeEach(() => {
    _clearEnrichmentCache();
  });

  /**
   * Returns a fetch impl that routes by keyword in the request body. Lets us
   * make one provider fail while another succeeds in the same run.
   */
  function routedFetch(behaviors: Array<{
    matchBody: RegExp;
    result:
      | { kind: 'ok'; content: string }
      | { kind: 'status'; status: number; statusText: string }
      | { kind: 'timeout'; delayMs: number }
      | { kind: 'malformed' }
      | { kind: 'network-error'; message: string };
  }>): typeof fetch {
    return jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      const matched = behaviors.find(b => b.matchBody.test(body));
      if (!matched) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: '{"label": "default", "context": "default"}' } }],
            }),
        } as Response);
      }
      const r = matched.result;
      if (r.kind === 'ok') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ choices: [{ message: { content: r.content } }] }),
        } as Response);
      }
      if (r.kind === 'status') {
        return Promise.resolve({
          ok: false,
          status: r.status,
          statusText: r.statusText,
        } as Response);
      }
      if (r.kind === 'malformed') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ choices: [{ message: { content: 'not-json' } }] }),
        } as Response);
      }
      if (r.kind === 'timeout') {
        return new Promise((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal })?.signal;
          const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
          signal?.addEventListener('abort', onAbort, { once: true });
          // Never resolve within test timeline unless aborted
          setTimeout(() => {
            // fallback — if not aborted after delay, resolve OK
            if (!signal?.aborted) {
              _resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: '{}' } }] }),
              } as Response);
            }
          }, r.delayMs);
        });
      }
      return Promise.reject(new Error(r.message));
    });
  }

  it('keeps successes when counterparty returns 429 (governance succeeds)', async () => {
    const content =
      'Item 1.01 acquisition of Target Corp. Item 5.02 director Jane Doe will not stand for re-election board.';
    const fetchMock = routedFetch([
      { matchBody: /Extract counterparty information/, result: { kind: 'status', status: 429, statusText: 'Too Many Requests' } },
      { matchBody: /corporate governance research/, result: { kind: 'ok', content: '{"label": "Jane Doe", "context": "Director context."}' } },
    ]);

    const results = await runEnrichment(
      [counterpartyProvider, governanceProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock },
    );

    expect(results.length).toBe(1);
    expect(results[0]).toContain('GOVERNANCE CONTEXT');
    expect(results[0]).toContain('Jane Doe');
  });

  it('keeps successes when counterparty returns 500 (governance succeeds)', async () => {
    const content =
      'Item 1.01 acquisition of Target Corp. Item 5.02 director Jane Doe will not stand for re-election board.';
    const fetchMock = routedFetch([
      { matchBody: /Extract counterparty information/, result: { kind: 'status', status: 500, statusText: 'Server Error' } },
      { matchBody: /corporate governance research/, result: { kind: 'ok', content: '{"label": "Jane Doe", "context": "Ctx."}' } },
    ]);

    const results = await runEnrichment(
      [counterpartyProvider, governanceProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock },
    );

    expect(results.length).toBe(1);
    expect(results[0]).toContain('GOVERNANCE CONTEXT');
  });

  it('keeps successes when one provider returns malformed JSON', async () => {
    const content =
      'Item 1.01 acquisition of Target Corp. Item 5.02 director Jane Doe will not stand for re-election board.';
    const fetchMock = routedFetch([
      { matchBody: /Extract counterparty information/, result: { kind: 'malformed' } },
      { matchBody: /corporate governance research/, result: { kind: 'ok', content: '{"label": "Jane Doe", "context": "Ctx."}' } },
    ]);

    const results = await runEnrichment(
      [counterpartyProvider, governanceProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock },
    );

    expect(results.length).toBe(1);
    expect(results[0]).toContain('GOVERNANCE CONTEXT');
  });

  it('keeps successes when one provider throws a network error', async () => {
    const content =
      'Item 1.01 acquisition of Target Corp. Item 5.02 director Jane Doe will not stand for re-election board.';
    const fetchMock = routedFetch([
      { matchBody: /Extract counterparty information/, result: { kind: 'network-error', message: 'ECONNRESET' } },
      { matchBody: /corporate governance research/, result: { kind: 'ok', content: '{"label": "Jane Doe", "context": "Ctx."}' } },
    ]);

    const results = await runEnrichment(
      [counterpartyProvider, governanceProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock },
    );

    expect(results.length).toBe(1);
    expect(results[0]).toContain('GOVERNANCE CONTEXT');
  });

  it('respects per-provider timeout cap without blocking siblings', async () => {
    const content =
      'Item 1.01 acquisition of Target Corp. Item 5.02 director Jane Doe will not stand for re-election board.';
    const fetchMock = routedFetch([
      { matchBody: /Extract counterparty information/, result: { kind: 'timeout', delayMs: 10_000 } },
      { matchBody: /corporate governance research/, result: { kind: 'ok', content: '{"label": "Jane Doe", "context": "Ctx."}' } },
    ]);

    const results = await runEnrichment(
      [counterpartyProvider, governanceProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock, perProviderTimeoutMs: 50, totalTimeoutMs: 10_000 },
    );

    expect(results.length).toBe(1);
    expect(results[0]).toContain('GOVERNANCE CONTEXT');
  });
});

// ─── Total Char Cap (W3.7) ────────────────────────────────────────────────────

describe('runEnrichment — 2000-char total cap', () => {
  beforeEach(() => {
    _clearEnrichmentCache();
  });

  it('drops later provider result when next result would exceed 2000 chars', async () => {
    const bigLabel = 'A'.repeat(200); // 200 chars
    const bigContext = 'B'.repeat(500); // 500 chars — clipped to 500 anyway, but fine
    const bigContent = `{"label": "${bigLabel}", "context": "${bigContext}"}`;

    const fetchMock = jest.fn().mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: bigContent } }],
          }),
      } as Response),
    );

    // Force both providers to detect against the same rich content
    const content =
      'Item 1.01 acquisition of Target Corp. Item 5.02 director Jane Doe will not stand for re-election board.';

    // Each result formats as "--- HEADER ---\n{label}: {context}" ~ ~730 chars
    // Two fit (~1460). Add third clone for overflow check.
    const extraProvider = createItemBasedProvider({
      name: 'extra',
      sectionHeader: 'EXTRA CONTEXT '.repeat(80).trim(), // pad header to force cap exceed
      formTypes: ['8-K'],
      itemPattern: /Item\s+1\.01/i,
      keywords: ['acquisition'],
      maxExcerptLength: 500,
      systemPrompt: 'Test',
      buildUserPrompt: () => 'Test',
    });

    const results = await runEnrichment(
      [counterpartyProvider, governanceProvider, extraProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock },
    );

    // All three detect; cap causes last (extra) to be dropped once joined length > 2000
    const joined = results.join('\n');
    expect(joined.length).toBeLessThanOrEqual(2000);
    // And we should have at least one result (cap is not zero'ing the output)
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Cache Hit (W3.6) ─────────────────────────────────────────────────────────

describe('runEnrichment — cache', () => {
  beforeEach(() => {
    _clearEnrichmentCache();
  });

  it('reuses cached results on repeat accessionNumber within TTL', async () => {
    const fetchMock = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"label": "Target", "context": "Ctx."}' } }],
          }),
      } as Response),
    );

    const content = 'Item 1.01 acquisition of Target Corp';

    const first = await runEnrichment(
      [counterpartyProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock, cacheKey: 'acc-001' },
    );
    const fetchCountAfterFirst = fetchMock.mock.calls.length;

    const second = await runEnrichment(
      [counterpartyProvider],
      content,
      '8-K',
      'Acme',
      'ACME',
      { _fetchImpl: fetchMock, cacheKey: 'acc-001' },
    );

    expect(first).toEqual(second);
    expect(fetchMock.mock.calls.length).toBe(fetchCountAfterFirst); // no additional fetches
  });

  it('does not cross-contaminate across different accessionNumbers', async () => {
    const fetchMock = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"label": "T", "context": "C"}' } }],
          }),
      } as Response),
    );
    const content = 'Item 1.01 acquisition of Target Corp';

    await runEnrichment([counterpartyProvider], content, '8-K', 'Acme', 'ACME', {
      _fetchImpl: fetchMock,
      cacheKey: 'acc-A',
    });
    const countAfterA = fetchMock.mock.calls.length;

    await runEnrichment([counterpartyProvider], content, '8-K', 'Acme', 'ACME', {
      _fetchImpl: fetchMock,
      cacheKey: 'acc-B',
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(countAfterA);
  });
});
