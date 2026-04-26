/**
 * Regression tests for campaign-templates.ts after the refactor that
 * extracted `fetchScoredSummariesLast30Days` and `dedupeByTicker` from
 * `fetchCampaignFilings`. The score formula and final-output shape for
 * the email path must remain identical.
 */

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

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(),
}));

import { getPrismaClient } from '../../../lib/db/prisma';
import {
  scoreFiling,
  dedupeByTicker,
  fetchCampaignFilings,
  fetchScoredSummariesLast30Days,
} from '../../../lib/email/campaign-templates';

const mockGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

function row(overrides: Partial<{
  ticker: string;
  companyName: string;
  filingType: string;
  importance: string | null;
  filingDate: Date;
  summaryText: string;
  smartSubject: string | null;
  summaryJSON: unknown;
  tokensUsed: number | null;
}>) {
  const { ticker: tickerSymbol, companyName, ...rest } = overrides;
  return {
    filingType: '10-K',
    filingDate: new Date('2026-04-20'),
    summaryText: 'A sample summary text.',
    summaryJSON: null,
    importance: 'high',
    smartSubject: 'A smart subject',
    tokensUsed: 5000,
    ...rest,
    ticker: typeof tickerSymbol === 'string'
      ? { symbol: tickerSymbol, companyName: companyName ?? `${tickerSymbol} Co` }
      : { symbol: 'AAPL', companyName: 'Apple Inc' },
  };
}

describe('scoreFiling', () => {
  test('formula: importance×3 + rarity×2 + min(tokens/5000, 3)', () => {
    // critical(4)*3 + 8-K(3)*2 + min(15000/5000, 3) = 12 + 6 + 3 = 21
    expect(scoreFiling({ importance: 'critical', filingType: '8-K', tokensUsed: 15000 })).toBe(21);
    // low(1)*3 + Form 4(1)*2 + 0 = 5
    expect(scoreFiling({ importance: 'low', filingType: 'Form 4', tokensUsed: 0 })).toBe(5);
    // null importance falls back to low
    expect(scoreFiling({ importance: null, filingType: '10-Q', tokensUsed: 5000 }))
      .toBe(scoreFiling({ importance: 'low', filingType: '10-Q', tokensUsed: 5000 }));
    // unknown filingType falls back to rarity 2
    expect(scoreFiling({ importance: 'high', filingType: 'UNKNOWN', tokensUsed: 0 }))
      .toBe(3 * 3 + 2 * 2);
  });

  test('size component caps at 3', () => {
    const big = scoreFiling({ importance: 'low', filingType: 'Form 4', tokensUsed: 100000 });
    const cap = scoreFiling({ importance: 'low', filingType: 'Form 4', tokensUsed: 15000 });
    expect(big).toBe(cap);
  });
});

describe('dedupeByTicker', () => {
  test('keeps first occurrence per ticker, preserves order', () => {
    const rows = [
      { ticker: { symbol: 'AAPL' }, n: 1 },
      { ticker: { symbol: 'TSLA' }, n: 2 },
      { ticker: { symbol: 'AAPL' }, n: 3 },
      { ticker: { symbol: 'NVDA' }, n: 4 },
      { ticker: { symbol: 'AAPL' }, n: 5 },
    ];
    expect(dedupeByTicker(rows, 1).map(r => r.n)).toEqual([1, 2, 4]);
  });

  test('respects maxPerTicker', () => {
    const rows = [
      { ticker: { symbol: 'AAPL' }, n: 1 },
      { ticker: { symbol: 'AAPL' }, n: 2 },
      { ticker: { symbol: 'AAPL' }, n: 3 },
      { ticker: { symbol: 'TSLA' }, n: 4 },
    ];
    expect(dedupeByTicker(rows, 2).map(r => r.n)).toEqual([1, 2, 4]);
  });

  test('returns empty for empty input', () => {
    expect(dedupeByTicker([], 1)).toEqual([]);
  });
});

describe('fetchScoredSummariesLast30Days', () => {
  test('queries last 30 days, excludes ERROR/FAILED but allows null status, non-empty summary, non-null importance', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    await fetchScoredSummariesLast30Days(50);

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    // Modern pipeline leaves status null on success — must be allowed.
    const orClauses = args.where.OR;
    expect(orClauses).toContainEqual({ processingStatus: null });
    expect(orClauses).toContainEqual({ processingStatus: { notIn: ['ERROR', 'FAILED'] } });
    expect(args.where.summaryText).toEqual({ not: '' });
    expect(args.where.importance).toEqual({ not: null });
    expect(args.where.filingDate.gte).toBeInstanceOf(Date);
    expect(args.take).toBe(50);
  });

  test('returns scored rows sorted by score descending', async () => {
    const summaries = [
      // low/Form 4/0 → 1*3 + 1*2 + 0 = 5
      row({ ticker: 'TSLA', importance: 'low', filingType: 'Form 4', tokensUsed: 0 }),
      // critical/10-K/15000 → 4*3 + 3*2 + 3 = 21
      row({ ticker: 'AAPL', importance: 'critical', filingType: '10-K', tokensUsed: 15000 }),
      // high/8-K/5000 → 3*3 + 3*2 + 1 = 16
      row({ ticker: 'NVDA', importance: 'high', filingType: '8-K', tokensUsed: 5000 }),
    ];
    const findMany = jest.fn().mockResolvedValue(summaries);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    const result = await fetchScoredSummariesLast30Days();

    expect(result.map(r => r.ticker.symbol)).toEqual(['AAPL', 'NVDA', 'TSLA']);
    expect(result.map(r => r.score)).toEqual([21, 16, 5]);
  });

  test('returns empty array on prisma error', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('db down'));
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    const result = await fetchScoredSummariesLast30Days();
    expect(result).toEqual([]);
  });
});

describe('fetchCampaignFilings (post-refactor regression)', () => {
  test('returns top N deduped by ticker, mapped to CampaignFiling shape', async () => {
    const summaries = [
      // critical 10-K AAPL: score 21
      row({
        ticker: 'AAPL',
        importance: 'critical',
        filingType: '10-K',
        tokensUsed: 15000,
        smartSubject: 'AAPL Q4 results',
        summaryText: 'Apple beat earnings.',
      }),
      // high 8-K AAPL: score 16 (should be dropped — same ticker, lower score)
      row({
        ticker: 'AAPL',
        importance: 'high',
        filingType: '8-K',
        tokensUsed: 5000,
        smartSubject: 'AAPL exec change',
      }),
      // high 8-K NVDA: score 16
      row({
        ticker: 'NVDA',
        importance: 'high',
        filingType: '8-K',
        tokensUsed: 5000,
        smartSubject: 'NVDA chip launch',
      }),
      // medium 10-Q TSLA: score 11
      row({
        ticker: 'TSLA',
        importance: 'medium',
        filingType: '10-Q',
        tokensUsed: 5000,
        smartSubject: 'TSLA Q1',
      }),
    ];
    const findMany = jest.fn().mockResolvedValue(summaries);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    const result = await fetchCampaignFilings(3);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.ticker)).toEqual(['AAPL', 'NVDA', 'TSLA']);
    expect(result[0]).toMatchObject({
      ticker: 'AAPL',
      companyName: 'AAPL Co',
      filingType: '10-K',
      importance: 'critical',
      title: 'AAPL Q4 results',
      summary: 'Apple beat earnings.',
    });
    expect(result[0].filingDate).toBeInstanceOf(Date);
  });

  test('truncates summary text >200 chars with ellipsis', async () => {
    const longText = 'A'.repeat(300);
    const findMany = jest.fn().mockResolvedValue([
      row({ ticker: 'AAPL', summaryText: longText }),
    ]);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    const [filing] = await fetchCampaignFilings(1);
    expect(filing.summary).toHaveLength(200);
    expect(filing.summary.endsWith('...')).toBe(true);
  });

  test('falls back to summaryJSON.eventType when smartSubject missing', async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({
        ticker: 'AAPL',
        smartSubject: null,
        summaryJSON: { eventType: 'Material Agreement' },
      }),
    ]);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    const [filing] = await fetchCampaignFilings(1);
    expect(filing.title).toBe('Material Agreement');
  });

  test('falls back to filingType when no subject sources available', async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ ticker: 'AAPL', smartSubject: null, summaryJSON: null, filingType: '10-K' }),
    ]);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    const [filing] = await fetchCampaignFilings(1);
    expect(filing.title).toBe('10-K');
  });

  test('returns empty array when no summaries exist', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    const result = await fetchCampaignFilings(3);
    expect(result).toEqual([]);
  });

  test('respects count parameter', async () => {
    const summaries = ['AAPL', 'TSLA', 'NVDA', 'GOOGL', 'MSFT'].map(t =>
      row({ ticker: t, importance: 'high', filingType: '10-K', tokensUsed: 5000 })
    );
    const findMany = jest.fn().mockResolvedValue(summaries);
    mockGetPrismaClient.mockReturnValue({ summary: { findMany } } as unknown as ReturnType<typeof getPrismaClient>);

    expect(await fetchCampaignFilings(2)).toHaveLength(2);
    expect(await fetchCampaignFilings(5)).toHaveLength(5);
  });
});
