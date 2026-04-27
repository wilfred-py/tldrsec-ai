/**
 * X Sentiment eligibility gate.
 *
 * Combines three filters before the (expensive) x_search call fires:
 *   1. Form importance — high-impact form types only (D4=B salience targeting)
 *   2. Strict ticker normalization — exact canonical match, no fuzzy (F2 cashtag collision)
 *   3. Mega-cap allowlist — defense against pump-and-dump on low-float tickers (F2 + F5)
 *
 * Returns `{eligible: false, reason}` for any failure so callers can log
 * the gate decision for telemetry without coupling to the gate internals.
 *
 * The allowlist is intentionally conservative — start with mega-caps where
 * X discussion is dense and pump-and-dump risk is minimal. Expand via
 * `X_SENTIMENT_ALLOWLIST_EXTRA` env var (comma-separated) without code changes.
 *
 * Form set is inlined (rather than read from `form-registry.ts`) because the
 * registry has a stale `.js` shadow that wins jest module resolution. Inlining
 * keeps this gate testable without touching the wider registry surface.
 */

const TICKER_REGEX = /^[A-Z]{1,5}(?:\.[A-Z]{1,2})?$/;

/**
 * Forms whose disclosures move price/sentiment enough to justify an x_search.
 * Mirrors the `importance: 'high'` set in `lib/sec-edgar/form-registry.ts`.
 * Keys are uppercase and trimmed to match the normalization in the gate.
 */
const HIGH_IMPORTANCE_FORMS: ReadonlySet<string> = new Set<string>([
  '10-K', '10-K/A',
  '10-Q', '10-Q/A',
  '8-K',
  '20-F', '40-F',
  'FORM4', '4',
  'FORM 144', '144',
  'SC 13D', 'SC13D',
  'DEF 14A',
  'S-1', 'S-3', 'S-4',
  'F-1', 'F-3', 'F-4',
]);

/**
 * Forms we explicitly recognize but treat as low-signal for sentiment.
 * Used to distinguish "unknown form" from "known but not eligible" so the
 * caller can log a more specific reason.
 */
const KNOWN_LOW_IMPORTANCE_FORMS: ReadonlySet<string> = new Set<string>([
  'NT 10-K', 'NT 10-Q',
  '10-K/A_NT', '10-Q/A_NT',
  '11-K', '15', '15-12B', '15-12G',
  'SD', 'CORRESP', 'UPLOAD',
  'SC 13G', 'SC13G',
  '3', 'FORM3', '5', 'FORM5',
]);

/**
 * Curated mega-cap allowlist (~S&P 100). Any ticker on this list comfortably
 * exceeds $500M market cap and has dense first-party news coverage on X.
 * Sorted alphabetically for diff readability.
 */
const ALLOWLIST_BASE: readonly string[] = [
  'AAPL', 'ABBV', 'ABT', 'ACN', 'ADBE', 'AIG', 'AMD', 'AMGN', 'AMT', 'AMZN',
  'AVGO', 'AXP', 'BA', 'BAC', 'BIIB', 'BK', 'BKNG', 'BLK', 'BMY', 'BRK.A',
  'BRK.B', 'C', 'CAT', 'CHTR', 'CL', 'CMCSA', 'COF', 'COP', 'COST', 'CRM',
  'CSCO', 'CVS', 'CVX', 'DD', 'DE', 'DHR', 'DIS', 'DOW', 'DUK', 'EMR',
  'EXC', 'F', 'FDX', 'GD', 'GE', 'GILD', 'GM', 'GOOG', 'GOOGL', 'GS',
  'HD', 'HON', 'IBM', 'INTC', 'ISRG', 'JNJ', 'JPM', 'KHC', 'KMI', 'KO',
  'LIN', 'LLY', 'LMT', 'LOW', 'MA', 'MCD', 'MDLZ', 'MDT', 'MET', 'META',
  'MMM', 'MO', 'MRK', 'MS', 'MSFT', 'NEE', 'NFLX', 'NKE', 'NVDA', 'ORCL',
  'PEP', 'PFE', 'PG', 'PM', 'PYPL', 'QCOM', 'RTX', 'SBUX', 'SCHW', 'SO',
  'SPG', 'T', 'TGT', 'TMO', 'TMUS', 'TSLA', 'TXN', 'UNH', 'UNP', 'UPS',
  'USB', 'V', 'VZ', 'WBA', 'WFC', 'WMT', 'XOM',
];

let cachedAllowlist: Set<string> | null = null;

function getAllowlist(): Set<string> {
  if (cachedAllowlist) return cachedAllowlist;
  const extra = (process.env.X_SENTIMENT_ALLOWLIST_EXTRA ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  cachedAllowlist = new Set([...ALLOWLIST_BASE, ...extra]);
  return cachedAllowlist;
}

/** Strip leading `$`, normalize to uppercase, trim whitespace. */
export function normalizeTicker(input: string | null | undefined): string {
  if (!input) return '';
  return input.trim().toUpperCase().replace(/^\$+/, '');
}

export interface EligibilityInput {
  ticker: string | null | undefined;
  formType: string | null | undefined;
}

export type EligibilityReason =
  | 'no_ticker'
  | 'invalid_ticker_format'
  | 'unknown_form_type'
  | 'low_importance_form'
  | 'not_in_allowlist';

export interface EligibilityResult {
  eligible: boolean;
  ticker: string;
  reason?: EligibilityReason;
}

export function checkXSentimentEligibility(input: EligibilityInput): EligibilityResult {
  const ticker = normalizeTicker(input.ticker);
  if (!ticker) {
    return { eligible: false, ticker, reason: 'no_ticker' };
  }
  if (!TICKER_REGEX.test(ticker)) {
    return { eligible: false, ticker, reason: 'invalid_ticker_format' };
  }
  const formType = String(input.formType ?? '').toUpperCase().trim();
  if (!formType) {
    return { eligible: false, ticker, reason: 'unknown_form_type' };
  }
  if (HIGH_IMPORTANCE_FORMS.has(formType)) {
    // fall through — eligible on form dimension
  } else if (KNOWN_LOW_IMPORTANCE_FORMS.has(formType)) {
    return { eligible: false, ticker, reason: 'low_importance_form' };
  } else {
    return { eligible: false, ticker, reason: 'unknown_form_type' };
  }
  if (!getAllowlist().has(ticker)) {
    return { eligible: false, ticker, reason: 'not_in_allowlist' };
  }
  return { eligible: true, ticker };
}

/** Test-only: reset env-derived allowlist cache. */
export function _resetAllowlistCache(): void {
  cachedAllowlist = null;
}

export const _internal = {
  ALLOWLIST_BASE,
  TICKER_REGEX,
  HIGH_IMPORTANCE_FORMS,
  KNOWN_LOW_IMPORTANCE_FORMS,
  getAllowlist,
};
