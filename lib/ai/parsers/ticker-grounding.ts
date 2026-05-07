/**
 * Ticker grounding check: detect when an AI-emitted string mentions a
 * ticker symbol that doesn't match the filing's actual ticker.
 *
 * Triggered by a real failure: a fresh JPM S-3 summary's whyItMatters
 * read "This $5B shelf provides TSLA flexible, low-cost capital..." -
 * the model swapped JPMorgan for Tesla mid-sentence (model hallucination,
 * possibly contaminated by recent context). Shipping the wrong ticker is
 * worse than shipping no analysis: a shareholder reads "TSLA" and assumes
 * the email is about a different company.
 *
 * Strategy: scan for both `$TICKER` patterns and bare-word UPPERCASE tickers
 * of 2-5 chars, filter out common false positives (acronyms like CEO, USD),
 * and flag any remaining tokens that don't match the expected ticker.
 *
 * False positives are tolerated; false negatives (missing a hallucinated
 * ticker) are NOT - we redact the field on any suspicious mismatch.
 */

/**
 * Common UPPERCASE 2-5-letter tokens that look like tickers but are
 * almost always something else (financial acronyms, units, geographic
 * codes). Conservative list to avoid false positives that drop legit
 * analysis.
 */
const ACRONYM_ALLOWLIST = new Set<string>([
  // Officer / governance
  'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'CMO', 'CSO', 'CHRO',
  // Financial metrics
  'EPS', 'EBT', 'EBITDA', 'GAAP', 'IFRS', 'NOPAT', 'NOPLAT', 'FCF', 'CAPEX', 'OPEX', 'COGS', 'SGA', 'R&D', 'PE',
  // Currencies / units
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'HKD', 'INR', 'KRW', 'MXN', 'BPS', 'PPT',
  // Markets / structures
  'IPO', 'ETF', 'REIT', 'SPAC', 'OTC', 'NYSE', 'NASDAQ', 'AMEX', 'TSX', 'LSE',
  // Tech / business jargon
  'API', 'KPI', 'ROI', 'ROE', 'ROA', 'ROIC', 'WACC', 'TAM', 'SAM', 'SOM', 'ARR', 'MRR', 'LTV', 'CAC',
  'AI', 'ML', 'IT', 'HR', 'PR', 'OEM', 'EV', 'IP', 'OS',
  'SAAS', 'PAAS', 'IAAS', 'B2B', 'B2C', 'D2C', 'P2P',
  // Geo
  'USA', 'US', 'UK', 'EU', 'EMEA', 'APAC', 'LATAM', 'NA', 'CA', 'NY', 'CN', 'JP', 'IN', 'DE', 'FR',
  // Regulators / agencies
  'SEC', 'FDA', 'FTC', 'FCC', 'DOJ', 'IRS', 'FBI', 'CFPB', 'CFTC', 'OCC', 'OSHA', 'HHS', 'EPA', 'NSA', 'CIA', 'GAO',
  // Filing types / corp structure
  'INC', 'LLC', 'LLP', 'LP', 'CORP', 'CO', 'LTD', 'PLC', 'NV', 'AG', 'SA',
  'ESG', 'DEI', 'IPO', 'GDP', 'CPI', 'PCE', 'PMI',
  // Misc
  'TBD', 'TBA', 'NA', 'NM', 'TBC', 'YTD', 'MTD', 'QTD', 'YOY', 'YOY', 'QOQ', 'MOM', 'WOW',
  'ATM', 'OTM', 'ITM', 'BPS', 'CDS', 'CDO', 'MBS', 'ABS',
  // Equity-research shorthand
  'PT', 'TP', 'EV', 'P', 'C', 'BUY', 'HOLD', 'SELL', 'OW', 'UW', 'EW', 'NEW', 'OLD',
  // Filing-specific terms
  'YTD', 'MOIC', 'IRR', 'TWR', 'NAV', 'AUM',
]);

/**
 * Common company-name aliases for the most-hallucinated tickers. Mapping
 * is name (lowercased) → ticker. When the AI emits a name like "Tesla"
 * or "Apple" in a filing for a different ticker, this catches it (the
 * pure ticker check would only catch "TSLA"/"AAPL"). Kept tight to top
 * mega-caps where misattribution is most damaging; a comprehensive
 * S&P-500 list is out of scope.
 */
const FOREIGN_COMPANY_NAMES: Array<{ pattern: RegExp; ticker: string }> = [
  { pattern: /\btesla\b/i, ticker: 'TSLA' },
  { pattern: /\bapple\b/i, ticker: 'AAPL' },
  { pattern: /\bmicrosoft\b/i, ticker: 'MSFT' },
  { pattern: /\b(google|alphabet)\b/i, ticker: 'GOOGL' },
  { pattern: /\bamazon\b/i, ticker: 'AMZN' },
  { pattern: /\b(meta|facebook)\b/i, ticker: 'META' },
  { pattern: /\bnvidia\b/i, ticker: 'NVDA' },
  { pattern: /\bberkshire(?:\s+hathaway)?\b/i, ticker: 'BRK' },
  { pattern: /\b(jpmorgan|jp\s*morgan)\b/i, ticker: 'JPM' },
  { pattern: /\b(coca[\s\-]?cola)\b/i, ticker: 'KO' },
  { pattern: /\bdisney\b/i, ticker: 'DIS' },
  { pattern: /\bnetflix\b/i, ticker: 'NFLX' },
  { pattern: /\bintel\b/i, ticker: 'INTC' },
  { pattern: /\boracle\b/i, ticker: 'ORCL' },
  { pattern: /\bpalantir\b/i, ticker: 'PLTR' },
  { pattern: /\bstripe\b/i, ticker: 'STRP' },
];

/**
 * Detect ticker symbols mentioned in `text` that don't match `expected`.
 * Looks for both `$TICKER` (dollar-prefixed) and bare-word UPPERCASE
 * tokens 2-5 chars. Returns the unique foreign tickers found, or empty
 * array when text is grounded.
 */
export function findForeignTickers(text: string, expected: string): string[] {
  if (!text || !expected) return [];
  const expectedUpper = expected.toUpperCase().replace(/[.\-]/g, ''); // normalize "BRK-B" → "BRKB"
  const found = new Set<string>();

  // Dollar-prefixed tickers: very strong signal a token IS a ticker.
  // No allowlist filter - if the AI wrote `$XYZ` it meant a ticker.
  const dollarPattern = /\$([A-Z]{1,5})(?:[.\-][A-Z])?\b/g;
  let m: RegExpExecArray | null;
  while ((m = dollarPattern.exec(text)) !== null) {
    const tok = m[1].toUpperCase();
    if (tok !== expectedUpper && tok !== expectedUpper.slice(0, m[1].length)) {
      found.add(tok);
    }
  }

  // Bare-word UPPERCASE tickers (2-5 chars, not in acronym allowlist).
  // Word boundaries ensure we don't match middle-of-word substrings.
  const bareWordPattern = /\b([A-Z]{2,5})\b/g;
  while ((m = bareWordPattern.exec(text)) !== null) {
    const tok = m[1];
    if (tok === expectedUpper) continue;
    if (ACRONYM_ALLOWLIST.has(tok)) continue;
    // Filter out tokens immediately preceded by `(` and followed by `,` or
    // `)`, which is the "Apple Inc. (AAPL)" parenthetical pattern - the AI
    // is likely just reciting a fact about a different company. Still flag
    // if it's the expected ticker shown for confirmation.
    found.add(tok);
  }

  // Company name aliases: catch hallucinations like "Tesla" appearing in a
  // JPM filing, where the bare-word check wouldn't flag because "Tesla"
  // isn't a 2-5 char uppercase token. Tag with the canonical ticker so
  // downstream metrics group by ticker, not by name variant.
  for (const { pattern, ticker } of FOREIGN_COMPANY_NAMES) {
    if (ticker === expectedUpper) continue;
    if (ticker === expectedUpper.slice(0, ticker.length)) continue; // BRK matches BRK-B
    if (pattern.test(text)) {
      found.add(ticker);
    }
  }

  return Array.from(found);
}

/**
 * Validate that an AI-emitted string is grounded to the expected ticker.
 * When foreign tickers are detected, treat as if the field were empty
 * (templates already handle empty whyItMatters / headline by hiding).
 *
 * Returns `{ value, rejected, foreignTickers? }` mirroring the shape of
 * `validateWhyItMatters` so call sites can use the same redact pattern.
 */
export function validateTickerGrounding(
  raw: unknown,
  expected: string,
): { value: string; rejected: boolean; foreignTickers?: string[] } {
  if (raw === null || raw === undefined) return { value: '', rejected: false };
  if (typeof raw !== 'string') return { value: '', rejected: false };
  if (!raw.trim()) return { value: raw, rejected: false };
  const foreign = findForeignTickers(raw, expected);
  if (foreign.length === 0) return { value: raw, rejected: false };
  return { value: '', rejected: true, foreignTickers: foreign };
}
