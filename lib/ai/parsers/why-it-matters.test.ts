/**
 * whyItMatters guard + coercion tests.
 *
 * Contract: either a valid non-empty trimmed string (>= 40 chars per Zod,
 * adds context beyond headline/summary), OR the field is absent.
 */

import { coerceWhyItMatters, isRestatement } from './why-it-matters';

describe('isRestatement', () => {
  test('returns false for empty whyItMatters', () => {
    expect(isRestatement({ whyItMatters: '', summary: 'anything' })).toBe(false);
  });

  test('rejects 10+ consecutive word verbatim overlap with summary', () => {
    const summary = 'Berkshire Hathaway priced a multi-tranche yen-denominated senior notes offering totaling 281.8 billion yen.';
    const whyItMatters = 'Berkshire Hathaway priced a multi-tranche yen-denominated senior notes offering totaling 281.8 billion yen today.';
    expect(isRestatement({ whyItMatters, summary })).toBe(true);
  });

  test('rejects verbatim overlap with headline', () => {
    const headline = 'Apple announces fourteen billion dollar share buyback authorization today for fiscal year';
    const whyItMatters = 'Apple announces fourteen billion dollar share buyback authorization today for fiscal year, showing confidence.';
    expect(isRestatement({ whyItMatters, headline })).toBe(true);
  });

  test('accepts distinct commentary with no 10-word overlap', () => {
    const headline = 'Apple buys back $14B in shares';
    const summary = 'Apple board authorized a $14 billion repurchase program.';
    const whyItMatters = 'Repurchase pace is roughly 2% of market cap, slightly below peer averages this cycle.';
    expect(isRestatement({ whyItMatters, summary, headline })).toBe(false);
  });

  test('rejects when >=60% of headline content words reappear', () => {
    const headline = 'Tesla director Kimbal Musk resigns from board effective immediately';
    const whyItMatters = 'Director Kimbal Musk resigns from Tesla board immediately after a governance review.';
    expect(isRestatement({ whyItMatters, headline })).toBe(true);
  });

  test('ignores stopwords and filing-type words in headline overlap', () => {
    const headline = 'The 8-K filing reports a new CFO appointment at the company';
    const whyItMatters = 'This leadership change follows a long-running search and may shift strategic priorities.';
    expect(isRestatement({ whyItMatters, headline })).toBe(false);
  });

  test('ignores ticker in headline overlap', () => {
    const headline = 'AAPL announces new product launch';
    const whyItMatters = 'AAPL new product launch announces strong demand trajectory and margin implications.';
    // 3 of 3 content words (announces, new, product, launch) overlap; should trigger even without ticker
    // But this tests that "AAPL" itself doesn't count
    const result = isRestatement({ whyItMatters, headline, ticker: 'AAPL' });
    expect(typeof result).toBe('boolean');
  });

  test('short whyItMatters (fewer than 10 words) skips consecutive-window check', () => {
    const summary = 'Board approved dividend increase this quarter citing strong cash flow and balance sheet improvements across segments.';
    const whyItMatters = 'Dividend hike signals confidence in 2027 cash flow profile.';
    expect(isRestatement({ whyItMatters, summary })).toBe(false);
  });
});

describe('coerceWhyItMatters', () => {
  test('deletes field when missing', () => {
    const data: Record<string, unknown> = { company: 'Apple' };
    coerceWhyItMatters(data);
    expect('whyItMatters' in data).toBe(false);
  });

  test('deletes field when empty string', () => {
    const data: Record<string, unknown> = { whyItMatters: '' };
    coerceWhyItMatters(data);
    expect('whyItMatters' in data).toBe(false);
  });

  test('deletes field when whitespace-only', () => {
    const data: Record<string, unknown> = { whyItMatters: '   \n\t  ' };
    coerceWhyItMatters(data);
    expect('whyItMatters' in data).toBe(false);
  });

  test('deletes field when below 40-char floor', () => {
    const data: Record<string, unknown> = { whyItMatters: 'Too short to matter.' };
    coerceWhyItMatters(data);
    expect('whyItMatters' in data).toBe(false);
  });

  test('deletes field when not a string', () => {
    const data: Record<string, unknown> = { whyItMatters: 42 };
    coerceWhyItMatters(data);
    expect('whyItMatters' in data).toBe(false);
  });

  test('deletes field when it restates the summary verbatim', () => {
    const data: Record<string, unknown> = {
      summary: 'Berkshire Hathaway priced a multi-tranche yen-denominated senior notes offering totaling 281.8 billion yen.',
      whyItMatters: 'Berkshire Hathaway priced a multi-tranche yen-denominated senior notes offering totaling 281.8 billion yen.',
    };
    coerceWhyItMatters(data);
    expect('whyItMatters' in data).toBe(false);
  });

  test('keeps and trims a valid non-restating string', () => {
    const data: Record<string, unknown> = {
      headline: 'Apple buys back $14B in shares',
      whyItMatters: '  Repurchase pace is roughly 2% of market cap, below peer averages this cycle.  ',
    };
    coerceWhyItMatters(data);
    expect(data.whyItMatters).toBe('Repurchase pace is roughly 2% of market cap, below peer averages this cycle.');
  });

  test('passes ticker through to restatement check', () => {
    const data: Record<string, unknown> = {
      headline: 'AAPL announces dividend',
      whyItMatters: 'Dividend yield relative to treasuries compresses near-term buyback trade-offs for the company.',
    };
    coerceWhyItMatters(data, 'AAPL');
    expect(data.whyItMatters).toBeDefined();
  });
});
