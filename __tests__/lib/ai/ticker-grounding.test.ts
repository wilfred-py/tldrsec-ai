/**
 * Tests for the ticker grounding check.
 *
 * Triggered by a real failure: a JPM S-3 fresh summary's whyItMatters
 * read "This $5B shelf provides TSLA flexible, low-cost capital..." -
 * the model cross-contaminated tickers mid-sentence. The grounding
 * check is the last line of defense before that ships to a user.
 */

import {
  findForeignTickers,
  validateTickerGrounding,
} from '../../../lib/ai/parsers/ticker-grounding';

describe('findForeignTickers', () => {
  describe('flags foreign tickers', () => {
    it.each([
      ['bare TSLA in JPM context', 'This $5B shelf provides TSLA flexible capital.', 'JPM', ['TSLA']],
      ['$AAPL prefix in NVDA context', 'Outperformed $AAPL by 12% on guidance.', 'NVDA', ['AAPL']],
      ['multiple foreign tickers', 'Compares favorably to TSLA, RIVN, and NIO.', 'F', ['TSLA', 'RIVN', 'NIO']],
      ['lowercase expected with uppercase foreign', 'AAPL Services growth dwarfs MSFT cloud.', 'aapl', ['MSFT']],
    ])('%s', (_label, text, expected, expectedForeign) => {
      const result = findForeignTickers(text, expected);
      expect([...result].sort()).toEqual(expectedForeign.sort());
    });
  });

  describe('passes through grounded text', () => {
    it.each([
      ['expected ticker only', 'AAPL Services revenue rose 15%.', 'AAPL'],
      ['$expected dollar prefix', '$NVDA Data Center +94% YoY.', 'NVDA'],
      ['no tickers at all', 'Quarterly results exceeded analyst expectations.', 'JPM'],
      ['mixed case expected with bare match', 'aapl shipped 50M iPhones.', 'AAPL'], // case-insensitive expected
    ])('%s', (_label, text, expected) => {
      expect(findForeignTickers(text, expected)).toEqual([]);
    });
  });

  describe('ignores common acronyms', () => {
    it.each([
      ['CEO + EPS + ROI in JPM context', 'CEO Dimon noted EPS growth and improving ROI.', 'JPM'],
      ['USD + EBITDA', 'Reported $5.2B in USD revenue with $1.8B EBITDA.', 'KO'],
      ['SEC + IPO + GAAP', 'SEC review of IPO timing under GAAP rules.', 'STRP'],
      ['Q1 (digit, not a ticker)', 'Q1 was strong; AI investments scaled.', 'NVDA'],
      ['NYSE + NASDAQ + ETF', 'Listed on NYSE; pulls capital from NASDAQ ETF flows.', 'JPM'],
      ['FDA + R&D', 'FDA approved phase 3; R&D spend up 22%.', 'PFE'],
    ])('%s does not flag false positives', (_label, text, expected) => {
      expect(findForeignTickers(text, expected)).toEqual([]);
    });
  });

  describe('flags foreign company names (not just ticker tokens)', () => {
    it.each([
      ['"Tesla" in JPM context', 'Tesla registered $5B shelf for equity and debt issuances.', 'JPM', ['TSLA']],
      ['"Apple" in NVDA context', 'Apple Services growth dwarfs the chip story.', 'NVDA', ['AAPL']],
      ['"Microsoft" in AAPL context', 'Microsoft cloud spend continues to compound.', 'AAPL', ['MSFT']],
      ['"jpmorgan" lowercased in TSLA context', 'jpmorgan analyst lifted PT to 850.', 'TSLA', ['JPM']],
      ['"Berkshire Hathaway" in BRK-B is grounded', 'Berkshire Hathaway expanded its Apple stake.', 'BRK-B', ['AAPL']],
    ])('%s', (_label, text, expected, expectedForeign) => {
      const result = findForeignTickers(text, expected);
      expect([...result].sort()).toEqual(expectedForeign.sort());
    });
  });

  describe('edge cases', () => {
    it.each([
      ['empty text', '', 'JPM'],
      ['empty expected', 'TSLA outperformed.', ''],
    ])('%s returns empty', (_label, text, expected) => {
      expect(findForeignTickers(text, expected)).toEqual([]);
    });
  });
});

describe('validateTickerGrounding', () => {
  it('returns rejected with foreign tickers list on contamination', () => {
    const result = validateTickerGrounding('This $5B shelf provides TSLA capital.', 'JPM');
    expect(result.rejected).toBe(true);
    expect(result.foreignTickers).toEqual(['TSLA']);
    expect(result.value).toBe('');
  });

  it('returns the original value when grounded', () => {
    const text = 'JPM CEO Dimon noted strong Q1 EPS.';
    const result = validateTickerGrounding(text, 'JPM');
    expect(result.rejected).toBe(false);
    expect(result.value).toBe(text);
    expect(result.foreignTickers).toBeUndefined();
  });

  it('passes through null/undefined as not-rejected with empty value', () => {
    expect(validateTickerGrounding(null, 'JPM').rejected).toBe(false);
    expect(validateTickerGrounding(undefined, 'JPM').rejected).toBe(false);
  });

  it('passes through non-string types as not-rejected', () => {
    expect(validateTickerGrounding(42, 'JPM').rejected).toBe(false);
    expect(validateTickerGrounding({ wrong: 'shape' }, 'JPM').rejected).toBe(false);
  });

  it('passes through whitespace-only strings as not-rejected (preserves shape)', () => {
    const result = validateTickerGrounding('   ', 'JPM');
    expect(result.rejected).toBe(false);
    expect(result.value).toBe('   ');
  });
});
