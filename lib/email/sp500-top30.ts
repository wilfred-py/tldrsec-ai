/**
 * Top 30 S&P 500 ticker pool — single source of truth for campaign fallback
 * samples and `/design-shotgun` examples.
 *
 * Spec: `.claude/tasks/email-campaign-revamp.md` § "Top 30 S&P 500 fixture
 * pool" (line 170) and §M3 (line 678 — "needs to live in code, not plan
 * markdown").
 *
 * Selection rule: campaign code may draw from this pool ONLY when the DB
 * returns no high-score filing for the recipient's tracked tickers. Real
 * production paths (cron-driven sends to filing watchers) must always use
 * `fetchCampaignFilings()` for actual DB data — never hard-code from here.
 *
 * Refresh cadence: quarterly (S&P 500 reshuffles ~4×/year). The fallback
 * is recipient-side cosmetic only, so a stale ticker is non-blocking — at
 * worst a former top-30 name appears in a cold-account demo email.
 *
 * Voice: brand-recognizable + large filing volume + news-verifiable, so the
 * curated fallback `CampaignFiling` examples in `campaign-fallback-filings.ts`
 * read as plausibly current. Tickers ordered by approximate market-cap
 * descending as of 2026-Q1.
 */

export interface SP500Top30Ticker {
  /** SEC ticker symbol (uppercase). */
  ticker: string;
  /** Display name as it appears on EDGAR. */
  companyName: string;
}

export const SP500_TOP_30: readonly SP500Top30Ticker[] = [
  { ticker: 'AAPL', companyName: 'Apple Inc.' },
  { ticker: 'MSFT', companyName: 'Microsoft Corp' },
  { ticker: 'NVDA', companyName: 'NVIDIA Corp' },
  { ticker: 'GOOGL', companyName: 'Alphabet Inc.' },
  { ticker: 'AMZN', companyName: 'Amazon.com Inc.' },
  { ticker: 'META', companyName: 'Meta Platforms Inc.' },
  { ticker: 'TSLA', companyName: 'Tesla Inc' },
  { ticker: 'BRK.B', companyName: 'Berkshire Hathaway Inc.' },
  { ticker: 'JPM', companyName: 'JPMorgan Chase & Co.' },
  { ticker: 'V', companyName: 'Visa Inc.' },
  { ticker: 'UNH', companyName: 'UnitedHealth Group Inc.' },
  { ticker: 'XOM', companyName: 'Exxon Mobil Corp' },
  { ticker: 'JNJ', companyName: 'Johnson & Johnson' },
  { ticker: 'WMT', companyName: 'Walmart Inc.' },
  { ticker: 'MA', companyName: 'Mastercard Inc.' },
  { ticker: 'PG', companyName: 'Procter & Gamble Co' },
  { ticker: 'LLY', companyName: 'Eli Lilly and Co' },
  { ticker: 'HD', companyName: 'Home Depot Inc.' },
  { ticker: 'AVGO', companyName: 'Broadcom Inc.' },
  { ticker: 'CVX', companyName: 'Chevron Corp' },
  { ticker: 'MRK', companyName: 'Merck & Co Inc.' },
  { ticker: 'ABBV', companyName: 'AbbVie Inc.' },
  { ticker: 'COST', companyName: 'Costco Wholesale Corp' },
  { ticker: 'KO', companyName: 'Coca-Cola Co' },
  { ticker: 'PEP', companyName: 'PepsiCo Inc.' },
  { ticker: 'BAC', companyName: 'Bank of America Corp' },
  { ticker: 'AMD', companyName: 'Advanced Micro Devices Inc.' },
  { ticker: 'ADBE', companyName: 'Adobe Inc.' },
  { ticker: 'CRM', companyName: 'Salesforce Inc.' },
  { ticker: 'NFLX', companyName: 'Netflix Inc.' },
];

/** Convenience set for fast `isTop30(ticker)` membership checks. */
export const SP500_TOP_30_TICKERS: ReadonlySet<string> = new Set(
  SP500_TOP_30.map(t => t.ticker),
);

/** Returns true if `ticker` is in the curated top-30 pool (case-insensitive). */
export function isTop30Ticker(ticker: string): boolean {
  return SP500_TOP_30_TICKERS.has(ticker.toUpperCase());
}
