/**
 * Top-30 S&P 500 fixture-pool contract.
 *
 * Pins the shape and invariants of `lib/email/sp500-top30.ts` so future
 * refreshes (S&P reshuffles quarterly) preserve the campaign-fallback
 * contract: 30 tickers, brand-recognizable, news-verifiable, deduplicated.
 */

import {
  SP500_TOP_30,
  SP500_TOP_30_TICKERS,
  isTop30Ticker,
} from '@/lib/email/sp500-top30';
import { CAMPAIGN_FALLBACK_HERO } from '@/lib/email/__fixtures__/campaign-fallback-filings';

describe('SP500_TOP_30 fixture pool', () => {
  it('contains exactly 30 tickers', () => {
    expect(SP500_TOP_30).toHaveLength(30);
  });

  it('all tickers are uppercase non-empty strings', () => {
    for (const t of SP500_TOP_30) {
      expect(t.ticker).toMatch(/^[A-Z][A-Z0-9.]{0,5}$/);
      expect(t.companyName.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate tickers', () => {
    expect(SP500_TOP_30_TICKERS.size).toBe(SP500_TOP_30.length);
  });

  it('exposes the campaign-fallback hero ticker (NVDA must remain in pool)', () => {
    // CAMPAIGN_FALLBACK_HERO is drawn from this pool; if NVDA is reshuffled
    // out, update the hero fixture too.
    expect(isTop30Ticker(CAMPAIGN_FALLBACK_HERO.ticker)).toBe(true);
  });

  it('exposes the digest fallback tickers (TSLA, AAPL, MSFT)', () => {
    // CAMPAIGN_FALLBACK_DIGEST uses these three; reshuffles must not drop them
    // without also updating the digest fixture.
    expect(isTop30Ticker('TSLA')).toBe(true);
    expect(isTop30Ticker('AAPL')).toBe(true);
    expect(isTop30Ticker('MSFT')).toBe(true);
  });

  it('isTop30Ticker is case-insensitive on input', () => {
    expect(isTop30Ticker('aapl')).toBe(true);
    expect(isTop30Ticker('AAPL')).toBe(true);
    expect(isTop30Ticker('AaPl')).toBe(true);
  });

  it('rejects non-pool tickers', () => {
    expect(isTop30Ticker('FAKE')).toBe(false);
    expect(isTop30Ticker('ZZZZ')).toBe(false);
  });
});
