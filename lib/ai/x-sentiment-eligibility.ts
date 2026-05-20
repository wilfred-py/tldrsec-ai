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
 * Curated large-cap allowlist (S&P 500 + grandfathered names). Any ticker on
 * this list comfortably exceeds $500M market cap and has dense first-party
 * news coverage on X, making it defensible against the pump-and-dump risk
 * the eligibility gate is designed to mitigate.
 *
 * Composition:
 *   - All current S&P 500 constituents (sourced from
 *     github.com/datasets/s-and-p-500-companies, 2026-05)
 *   - Grandfathered: BRK.A (Berkshire A-class, S&P uses B-class only) and
 *     WBA (Walgreens; left the index but remains a household-name mega-cap)
 *
 * Sorted alphabetically for diff readability. The index changes ~25 tickers
 * per year on rebalancing; refresh this list opportunistically.
 *
 * Drift tolerance: a delisted name remaining briefly is harmless (eligibility
 * just falls through to `not_in_allowlist`). A missing new addition means a
 * legitimate ticker doesn't get x_sentiment enrichment until the next refresh.
 */
const ALLOWLIST_BASE: readonly string[] = [
  'A', 'AAPL', 'ABBV', 'ABNB', 'ABT', 'ACGL', 'ACN', 'ADBE', 'ADI', 'ADM',
  'ADP', 'ADSK', 'AEE', 'AEP', 'AES', 'AFL', 'AIG', 'AIZ', 'AJG', 'AKAM',
  'ALB', 'ALGN', 'ALL', 'ALLE', 'AMAT', 'AMCR', 'AMD', 'AME', 'AMGN', 'AMP',
  'AMT', 'AMZN', 'ANET', 'AON', 'AOS', 'APA', 'APD', 'APH', 'APO', 'APP',
  'APTV', 'ARE', 'ARES', 'ATO', 'AVB', 'AVGO', 'AVY', 'AWK', 'AXON', 'AXP',
  'AZO', 'BA', 'BAC', 'BALL', 'BAX', 'BBY', 'BDX', 'BEN', 'BF.B', 'BG',
  'BIIB', 'BK', 'BKNG', 'BKR', 'BLDR', 'BLK', 'BMY', 'BR', 'BRK.A', 'BRK.B',
  'BRO', 'BSX', 'BX', 'BXP', 'C', 'CAG', 'CAH', 'CARR', 'CASY', 'CAT',
  'CB', 'CBOE', 'CBRE', 'CCI', 'CCL', 'CDNS', 'CDW', 'CEG', 'CF', 'CFG',
  'CHD', 'CHRW', 'CHTR', 'CI', 'CIEN', 'CINF', 'CL', 'CLX', 'CMCSA', 'CME',
  'CMG', 'CMI', 'CMS', 'CNC', 'CNP', 'COF', 'COHR', 'COIN', 'COO', 'COP',
  'COR', 'COST', 'CPAY', 'CPB', 'CPRT', 'CPT', 'CRH', 'CRL', 'CRM', 'CRWD',
  'CSCO', 'CSGP', 'CSX', 'CTAS', 'CTSH', 'CTVA', 'CVNA', 'CVS', 'CVX', 'D',
  'DAL', 'DASH', 'DD', 'DDOG', 'DE', 'DECK', 'DELL', 'DG', 'DGX', 'DHI',
  'DHR', 'DIS', 'DLR', 'DLTR', 'DOC', 'DOV', 'DOW', 'DPZ', 'DRI', 'DTE',
  'DUK', 'DVA', 'DVN', 'DXCM', 'EA', 'EBAY', 'ECL', 'ED', 'EFX', 'EG',
  'EIX', 'EL', 'ELV', 'EME', 'EMR', 'EOG', 'EPAM', 'EQIX', 'EQR', 'EQT',
  'ERIE', 'ES', 'ESS', 'ETN', 'ETR', 'EVRG', 'EW', 'EXC', 'EXE', 'EXPD',
  'EXPE', 'EXR', 'F', 'FANG', 'FAST', 'FCX', 'FDS', 'FDX', 'FE', 'FFIV',
  'FICO', 'FIS', 'FISV', 'FITB', 'FIX', 'FOX', 'FOXA', 'FRT', 'FSLR', 'FTNT',
  'FTV', 'GD', 'GDDY', 'GE', 'GEHC', 'GEN', 'GEV', 'GILD', 'GIS', 'GL',
  'GLW', 'GM', 'GNRC', 'GOOG', 'GOOGL', 'GPC', 'GPN', 'GRMN', 'GS', 'GWW',
  'HAL', 'HAS', 'HBAN', 'HCA', 'HD', 'HIG', 'HII', 'HLT', 'HON', 'HOOD',
  'HPE', 'HPQ', 'HRL', 'HSIC', 'HST', 'HSY', 'HUBB', 'HUM', 'HWM', 'IBKR',
  'IBM', 'ICE', 'IDXX', 'IEX', 'IFF', 'INCY', 'INTC', 'INTU', 'INVH', 'IP',
  'IQV', 'IR', 'IRM', 'ISRG', 'IT', 'ITW', 'IVZ', 'J', 'JBHT', 'JBL',
  'JCI', 'JKHY', 'JNJ', 'JPM', 'KDP', 'KEY', 'KEYS', 'KHC', 'KIM', 'KKR',
  'KLAC', 'KMB', 'KMI', 'KO', 'KR', 'KVUE', 'L', 'LDOS', 'LEN', 'LH',
  'LHX', 'LII', 'LIN', 'LITE', 'LLY', 'LMT', 'LNT', 'LOW', 'LRCX', 'LULU',
  'LUV', 'LVS', 'LYB', 'LYV', 'MA', 'MAA', 'MAR', 'MAS', 'MCD', 'MCHP',
  'MCK', 'MCO', 'MDLZ', 'MDT', 'MET', 'META', 'MGM', 'MKC', 'MLM', 'MMM',
  'MNST', 'MO', 'MOS', 'MPC', 'MPWR', 'MRK', 'MRNA', 'MRSH', 'MS', 'MSCI',
  'MSFT', 'MSI', 'MTB', 'MTD', 'MU', 'NCLH', 'NDAQ', 'NDSN', 'NEE', 'NEM',
  'NFLX', 'NI', 'NKE', 'NOC', 'NOW', 'NRG', 'NSC', 'NTAP', 'NTRS', 'NUE',
  'NVDA', 'NVR', 'NWS', 'NWSA', 'NXPI', 'O', 'ODFL', 'OKE', 'OMC', 'ON',
  'ORCL', 'ORLY', 'OTIS', 'OXY', 'PANW', 'PAYX', 'PCAR', 'PCG', 'PEG', 'PEP',
  'PFE', 'PFG', 'PG', 'PGR', 'PH', 'PHM', 'PKG', 'PLD', 'PLTR', 'PM',
  'PNC', 'PNR', 'PNW', 'PODD', 'POOL', 'PPG', 'PPL', 'PRU', 'PSA', 'PSKY',
  'PSX', 'PTC', 'PWR', 'PYPL', 'Q', 'QCOM', 'RCL', 'REG', 'REGN', 'RF',
  'RJF', 'RL', 'RMD', 'ROK', 'ROL', 'ROP', 'ROST', 'RSG', 'RTX', 'RVTY',
  'SATS', 'SBAC', 'SBUX', 'SCHW', 'SHW', 'SJM', 'SLB', 'SMCI', 'SNA', 'SNDK',
  'SNPS', 'SO', 'SOLV', 'SPG', 'SPGI', 'SRE', 'STE', 'STLD', 'STT', 'STX',
  'STZ', 'SW', 'SWK', 'SWKS', 'SYF', 'SYK', 'SYY', 'T', 'TAP', 'TDG',
  'TDY', 'TECH', 'TEL', 'TER', 'TFC', 'TGT', 'TJX', 'TKO', 'TMO', 'TMUS',
  'TPL', 'TPR', 'TRGP', 'TRMB', 'TROW', 'TRV', 'TSCO', 'TSLA', 'TSN', 'TT',
  'TTD', 'TTWO', 'TXN', 'TXT', 'TYL', 'UAL', 'UBER', 'UDR', 'UHS', 'ULTA',
  'UNH', 'UNP', 'UPS', 'URI', 'USB', 'V', 'VEEV', 'VICI', 'VLO', 'VLTO',
  'VMC', 'VRSK', 'VRSN', 'VRT', 'VRTX', 'VST', 'VTR', 'VTRS', 'VZ', 'WAB',
  'WAT', 'WBA', 'WBD', 'WDAY', 'WDC', 'WEC', 'WELL', 'WFC', 'WM', 'WMB',
  'WMT', 'WRB', 'WSM', 'WST', 'WTW', 'WY', 'WYNN', 'XEL', 'XOM', 'XYL',
  'XYZ', 'YUM', 'ZBH', 'ZBRA', 'ZTS',
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
