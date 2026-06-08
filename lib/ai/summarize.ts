/**
 * Claude AI Summarization Service
 *
 * Phase 4: Uses unified-prompts system for bulletproof JSON output.
 * The system prompt enforces strict JSON-only responses, eliminating
 * the need for complex parsing and repair logic.
 *
 * Handles the summarization of SEC filings using xAI Grok via OpenRouter
 * with form-specific prompts that guarantee clean JSON responses.
 */

import { openRouterClient } from './openrouter-client';
import { modelConfig, getDefaultModel } from './config';
import { parseResponse } from './parsers';
import { SECFilingType } from './prompts/prompt-types';
import { generateFilingPrompt as generateUnifiedPrompt } from './prompts/unified-prompts';
import {
  estimateTokenCount,
  splitDocumentIntoChunks,
  getContextConfig,
  buildSectionedPrompt,
  extractSections,
  hasUsableFinancialSection,
} from './prompts/context-manager';
import { getEnrichmentContext } from './web-search-context';
import { getXSentiment, type XSentimentEnrichment } from './x-sentiment-provider';
import { isMaxEligible } from '../auth/tier-eligibility';
// Removed Anthropic SDK import - using OpenRouter client
// import { extractFilingContent } from '../parsers/filing-extractor'; // Currently unused
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { ApiError, ErrorCode } from '../error-handling';
import { prisma, getPrismaClient } from '../db/prisma';
import { getSchemaForFormType, JSONSchema } from './prompts/unified-prompts';
import {
  hasFinancialStatementSignal,
  hasUsableFinancialHighlights,
  requiresFinancialContent,
} from './parsers/financial-content-gate';
// Single source of truth for `Summary.processingStatus` values written by this
// module. Casing intentionally preserved as it appears in the DB today
// (mixed-case legacy; do not normalize without a backfill).
const ProcessingStatus = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  /** Parser produced a partial result; isPartialResult=true is also set. */
  COMPLETED_WITH_WARNINGS: 'COMPLETED_WITH_WARNINGS',
  /** Model output truncated by max_tokens before the JSON closed. */
  OUTPUT_TRUNCATED: 'OUTPUT_TRUNCATED',
  /**
   * Pre-LLM content gate rejected the prepared excerpt for a 10-Q / 10-K /
   * 20-F / 6-K filing — the parser fed us only XBRL headers / namespace
   * boilerplate without an actual income statement. Per product contract
   * these filings always contain financials, so this is a parser-side
   * failure, not an AI-side one. The owning job is retried with backoff
   * (cron-cycle intervals via JobQueue.retryCount/maxRetries) on the
   * theory that EDGAR may finish processing the document body shortly
   * after acceptance. Email is suppressed throughout.
   */
  INSUFFICIENT_CONTENT: 'INSUFFICIENT_CONTENT',
  /**
   * Sectionizer ran on cleaned 10-Q/10-K content and could not locate the
   * Financial Statements section (e.g. Item 1 missing or empty). Different
   * from INSUFFICIENT_CONTENT (whole filing empty) — here the filing has body
   * content but the financial-statement region specifically failed to extract.
   */
  INSUFFICIENT_FINANCIAL_SECTION: 'INSUFFICIENT_FINANCIAL_SECTION',
  /** Hard failure (API error, validation crash, etc.). */
  FAILED: 'FAILED',
} as const;

/**
 * Validates if a parsed response has all required fields for its filing type
 * Phase 3: Uses schema from unified-prompts instead of legacy response-fixer
 *
 * @param data - The parsed data to validate
 * @param filingType - The type of SEC filing
 * @returns Object with validation result and missing fields
 */
function validateRequiredFields(
  data: Record<string, unknown>,
  filingType: SECFilingType
): { valid: boolean; missingFields: string[] } {
  const schema: JSONSchema = getSchemaForFormType(filingType);
  const missingFields = schema.required.filter(field => {
    const value = data[field];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

// ---------------------------------------------------------------------------
// whyItMatters coercion (W1.3 restatement guard)
//
// Two-state contract: either a valid non-empty trimmed string (>= 40 chars
// per Zod, adds context beyond headline/summary), OR the field is absent
// from the parsed JSON. Templates rely on this binary via one `'whyItMatters'
// in data` check.
//
// Rejection rules:
// 1. Any 10+ consecutive-word window from whyItMatters appears verbatim
//    (case-insensitive) in summary or headline.
// 2. >=60% of the headline's distinct content words (minus stopwords,
//    ticker, filing-type words) also appear in whyItMatters.
//
// Inlined here because the only caller is the summarization pipeline below
// and the prior extraction-for-testability split (in
// `lib/ai/parsers/why-it-matters.ts`) produced no leverage — same shape as
// ADR-0002 (analysis-depth inlining).
// ---------------------------------------------------------------------------

const WHY_IT_MATTERS_CONSECUTIVE_WINDOW = 10;
const WHY_IT_MATTERS_HEADLINE_OVERLAP_THRESHOLD = 0.6;
/** Minimum useful length. Below this, the field is too short to add context. */
const WHY_IT_MATTERS_MIN_LENGTH = 40;

const WHY_IT_MATTERS_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
  'their', 'his', 'her', 'our', 'not', 'no', 'than', 'then', 'so', 'if',
  'about', 'into', 'over', 'under', 'after', 'before', 'more', 'most', 'some',
  'any', 'all', 'each', 'new', 'per', 'up', 'down', 'out', 'off', 'via',
]);

const WHY_IT_MATTERS_FILING_TYPE_WORDS = new Set([
  'form', 'filing', 'report', 'statement', 'prospectus', 'schedule',
  '10-k', '10-q', '8-k', '424b2', '424b', 's-1', 's-3', 'sc', 'def', '14a',
  '13g', '13d', 'defa14a', 'fwp', '11-k', '20-f', '6-k',
]);

function whyItMattersTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function whyItMattersContentWords(text: string, ticker?: string): Set<string> {
  const tickerLower = ticker?.toLowerCase();
  const out = new Set<string>();
  for (const tok of whyItMattersTokenize(text)) {
    if (tok.length < 2) continue;
    if (WHY_IT_MATTERS_STOPWORDS.has(tok)) continue;
    if (WHY_IT_MATTERS_FILING_TYPE_WORDS.has(tok)) continue;
    if (tickerLower && tok === tickerLower) continue;
    out.add(tok);
  }
  return out;
}

function whyItMattersHasConsecutiveOverlap(needle: string, haystack: string, windowSize: number): boolean {
  const needleTokens = whyItMattersTokenize(needle);
  if (needleTokens.length < windowSize) return false;

  const haystackText = whyItMattersTokenize(haystack).join(' ');
  if (!haystackText) return false;

  for (let i = 0; i <= needleTokens.length - windowSize; i++) {
    const window = needleTokens.slice(i, i + windowSize).join(' ');
    if (haystackText.includes(window)) return true;
  }
  return false;
}

function whyItMattersHeadlineOverlapRatio(whyItMatters: string, headline: string, ticker?: string): number {
  const headlineWords = whyItMattersContentWords(headline, ticker);
  if (headlineWords.size === 0) return 0;

  const whyWords = whyItMattersContentWords(whyItMatters, ticker);
  let shared = 0;
  for (const w of headlineWords) {
    if (whyWords.has(w)) shared++;
  }
  return shared / headlineWords.size;
}

function isWhyItMattersRestatement(
  whyItMatters: string,
  summary: string | undefined,
  headline: string | undefined,
  ticker: string | undefined,
): boolean {
  const trimmed = whyItMatters.trim();
  if (!trimmed) return false;

  if (summary && whyItMattersHasConsecutiveOverlap(trimmed, summary, WHY_IT_MATTERS_CONSECUTIVE_WINDOW)) {
    return true;
  }
  if (headline && whyItMattersHasConsecutiveOverlap(trimmed, headline, WHY_IT_MATTERS_CONSECUTIVE_WINDOW)) {
    return true;
  }

  if (headline) {
    const ratio = whyItMattersHeadlineOverlapRatio(trimmed, headline, ticker);
    if (ratio >= WHY_IT_MATTERS_HEADLINE_OVERLAP_THRESHOLD) return true;
  }

  return false;
}

/**
 * Mutates `data` in place, deleting `whyItMatters` if missing / not a
 * string / empty / below the MIN_LENGTH floor / fails the restatement guard.
 * Otherwise trims the string and leaves it in place.
 */
function coerceWhyItMatters(data: Record<string, unknown>, ticker?: string): void {
  const raw = data.whyItMatters;
  if (typeof raw !== 'string') {
    delete data.whyItMatters;
    return;
  }
  const trimmed = raw.trim();
  if (trimmed.length < WHY_IT_MATTERS_MIN_LENGTH) {
    delete data.whyItMatters;
    return;
  }

  const summary = typeof data.summary === 'string' ? data.summary : undefined;
  const headline = typeof data.headline === 'string' ? data.headline : undefined;

  if (isWhyItMattersRestatement(trimmed, summary, headline, ticker)) {
    delete data.whyItMatters;
    return;
  }

  data.whyItMatters = trimmed;
}

// =============================================================================
// Ticker Grounding Guard
// =============================================================================
// Detect when an AI-emitted prose field mentions a ticker symbol or company
// name that doesn't match the Filing's actual ticker. Triggered by a real
// failure: a fresh JPM S-3 summary's whyItMatters read "This $5B shelf
// provides TSLA flexible, low-cost capital..." — the model swapped JPMorgan
// for Tesla mid-sentence. Shipping the wrong ticker is worse than shipping
// no analysis. False positives are tolerated; false negatives are not — any
// suspicious mismatch redacts the field.
//
// Implemented as private functions inside the Summarize module rather than a
// separate seam: there is only one production caller (the post-parse path
// below), and the prior extraction-for-testability split (formerly
// `lib/ai/parsers/ticker-grounding.ts`) offered no leverage. Same shape as
// the Why It Matters Guard above and ADR-0002.

/**
 * Common UPPERCASE 2-5-letter tokens that look like tickers but are almost
 * always something else (financial acronyms, units, geographic codes).
 * Conservative list — we'd rather flag a false positive than let a real
 * foreign ticker through.
 */
const TICKER_GROUNDING_ACRONYM_ALLOWLIST = new Set<string>([
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
 * Company-name aliases for the most-hallucinated tickers. Catches names like
 * "Tesla" appearing in a JPM filing where the bare-word ticker scan would
 * miss (Tesla isn't a 2-5 char uppercase token). Tight list — comprehensive
 * S&P 500 coverage is out of scope.
 */
const TICKER_GROUNDING_FOREIGN_COMPANY_NAMES: Array<{ pattern: RegExp; ticker: string }> = [
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

function findForeignTickers(text: string, expected: string): string[] {
  if (!text || !expected) return [];
  const expectedUpper = expected.toUpperCase().replace(/[.\-]/g, '');
  const found = new Set<string>();

  const dollarPattern = /\$([A-Z]{1,5})(?:[.\-][A-Z])?\b/g;
  let m: RegExpExecArray | null;
  while ((m = dollarPattern.exec(text)) !== null) {
    const tok = m[1].toUpperCase();
    if (tok !== expectedUpper && tok !== expectedUpper.slice(0, m[1].length)) {
      found.add(tok);
    }
  }

  const bareWordPattern = /\b([A-Z]{2,5})\b/g;
  while ((m = bareWordPattern.exec(text)) !== null) {
    const tok = m[1];
    if (tok === expectedUpper) continue;
    if (TICKER_GROUNDING_ACRONYM_ALLOWLIST.has(tok)) continue;
    found.add(tok);
  }

  for (const { pattern, ticker } of TICKER_GROUNDING_FOREIGN_COMPANY_NAMES) {
    if (ticker === expectedUpper) continue;
    if (ticker === expectedUpper.slice(0, ticker.length)) continue;
    if (pattern.test(text)) {
      found.add(ticker);
    }
  }

  return Array.from(found);
}

function validateTickerGrounding(
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

const TICKER_GROUNDING_PROSE_FIELDS = ['whyItMatters', 'headline', 'summary', 'emailSubject'] as const;

interface TickerGroundingViolation {
  field: string;
  foreignTickers: string[];
}

function validateTickerGroundingInPlace(
  data: Record<string, unknown>,
  expectedTicker: string | undefined | null,
): TickerGroundingViolation[] {
  if (!expectedTicker || expectedTicker === 'UNKNOWN') return [];
  const violations: TickerGroundingViolation[] = [];
  for (const field of TICKER_GROUNDING_PROSE_FIELDS) {
    const result = validateTickerGrounding(data[field], expectedTicker);
    if (result.rejected) {
      violations.push({ field, foreignTickers: result.foreignTickers || [] });
      delete data[field];
    }
  }
  return violations;
}

// =============================================================================
// Numeric Grounding Guard
// =============================================================================
// Walk the parsed summary structure and confirm every emitted dollar amount,
// percentage, and large share count appears (or has a normalized variant)
// somewhere in the SEC source document. Values without a match are redacted to
// null and a violation is recorded for telemetry.
//
// SCOPE: ground against the SEC source doc only (`processedContent`). Values
// backed only by web-search or historical-context enrichment WILL be redacted
// — enrichment is for color, not numeric truth. A model-emitted number that
// only appeared in enrichment is still a fabrication relative to this filing's
// prospectus.
//
// SKIP RULES (false-positive guards):
//  - Source doc shorter than NUMERIC_GROUNDING_MIN_SOURCE_LEN: too little
//    signal to ground.
//  - Field shorter than NUMERIC_GROUNDING_MIN_VALUE_LEN: noise.
//  - Prose fields (summary, whyItMatters, headline, emailSubject): handled by
//    the Ticker Grounding Guard above, not by numeric grounding.
//  - *Date paths: dates have too many representational variants for substring
//    matching to be reliable.
//  - "approximately"/"approximately equal to" near the candidate value in the
//    source doc: filings round, AI re-rounds.
//
// REDACTION STRATEGY:
//  - Top-level string field → null.
//  - Array-item string field → null (the row stays so other fields render).
//  - DO NOT delete the array entry — that conflates "value unverified" with
//    "category doesn't exist".
//
// ORIGINALLY-REQUIRED FIELDS (e.g. Form 4 `transactions[].shares`) cannot be
// nulled without breaking the strict-json-schema contract downstream renderers
// may rely on. For those, the value is left in place and the violation is
// recorded under `ai.numeric_grounding_violation_unredactable`.
//
// Implemented as private functions inside the Summarize module rather than a
// separate seam: there is only one production caller (the post-parse path
// below), and the prior extraction-for-testability split (formerly
// `lib/ai/parsers/numeric-grounding.ts`) offered no leverage. Same shape as
// the Ticker Grounding Guard above and ADR-0002. Coverage now flows through
// the summarizeFiling interface via
// `__tests__/lib/ai/summarize-grounding-wireup.test.ts`.

interface NumericGroundingViolation {
  path: string;
  value: string;
  reason: string;
}

interface NumericGroundingResult {
  rejectedFields: NumericGroundingViolation[];
  /** Originally-required paths that violated but were preserved. */
  unredactablePaths: string[];
  durationMs: number;
  /** When true, the validator counted violations but did NOT mutate data. */
  warnOnly: boolean;
}

interface NumericGroundingOptions {
  formType?: string;
  /** Set true when the source doc represents only one of multiple chunks. */
  chunked?: boolean;
}

const NUMERIC_GROUNDING_MIN_SOURCE_LEN = 1000;
const NUMERIC_GROUNDING_MIN_VALUE_LEN = 2;

/**
 * Prose fields are excluded — the Ticker Grounding Guard handles them. Listed
 * at module scope so the structured walker can short-circuit.
 */
const NUMERIC_GROUNDING_PROSE_FIELD_NAMES = new Set([
  'summary',
  'whyItMatters',
  'headline',
  'emailSubject',
  'description',
  'context',
  'commentary',
  'analysis',
  'narrative',
  'governanceContext',
]);

/**
 * Structured walk paths. Validator only checks these; generic recursion would
 * over-flag (e.g. catch a dollar in a free-text description). When a schema
 * adds a new numeric field, extend this list.
 *
 * Path syntax mirrors what we report: `a.b` for nested, `a[].b` for arrays.
 */
const NUMERIC_GROUNDING_WALK_PATHS: ReadonlyArray<string> = [
  // Top-level dollar / percent / count strings
  'offeringAmount',
  'dilutionImpact',
  'pricePerShare',
  'sharesOffered',
  'ceoPayRatio',
  'planAssets',
  'netAssetsChange',
  'participantCount',
  'companyStockHoldings',
  'contributionsReceived',
  'employerContributions',
  'benefitsDistributed',
  'totalRevenue',
  'netIncome',
  // PR 2 §7 additions
  'coupon',
  'yield',
  'spread',
  'eps',
  'revenue',
  'margin',
  'dividend',
  'maturity',
  'proceeds',
  'nav',
  // Nested objects
  'shelfRegistration.totalAuthorized',
  'shelfRegistration.remainingCapacity',
  'dealTerms.dealValue',
  'dealTerms.consideration',
  // Arrays of objects — array notation `name[].field`
  'financialHighlights[].value',
  'financialHighlights[].change',
  'financialHighlights[].qoqChange',
  'segments[].revenue',
  'segments[].growth',
  'tranches[].amountDisplay',
  'tranches[].coupon',
  'tranches[].yield',
  'tranches[].spread',
  'transactions[].shares',
  'transactions[].pricePerShare',
  'transactions[].totalValue',
  'transactions[].sharesOwnedFollowing',
  'executiveCompensation[].totalCompensation',
  'investmentOptions[].allocation',
  'investmentOptions[].return',
  'securityTypes[].amount',
];

/** Detection patterns; ORDER MATTERS — dollars before bare share counts. */
const NUMERIC_GROUNDING_DOLLAR_PATTERN = /\$[\d,]+(?:\.\d+)?\s*(?:billion|million|thousand|trillion|B|M|K|T)?\b/gi;
const NUMERIC_GROUNDING_PERCENT_PATTERN = /[+\-]?\d+(?:\.\d+)?\s*%/g;
/** Bare share counts: only flag when >= 1000 to avoid matching "5" / "10" etc. */
const NUMERIC_GROUNDING_SHARE_COUNT_PATTERN = /\b(?:\d{1,3}(?:,\d{3})+|\d{4,})\b/g;

interface NumericGroundingRequiredPathSet {
  has(path: string): boolean;
}

/**
 * Build a set of "originally-required" paths from a JSON Schema. Walks the
 * top-level `required` array plus `items.required` for any object-array
 * properties. Output paths use the same `a.b` / `a[].b` notation as
 * `NUMERIC_GROUNDING_WALK_PATHS`.
 */
function buildNumericGroundingRequiredPaths(formType: string | undefined): NumericGroundingRequiredPathSet {
  const result = new Set<string>();
  if (!formType) return { has: (p) => result.has(p) };

  let schema: unknown;
  try {
    schema = getSchemaForFormType(formType);
  } catch {
    return { has: (p) => result.has(p) };
  }
  if (!schema || typeof schema !== 'object') return { has: (p) => result.has(p) };
  const sObj = schema as { required?: string[]; properties?: Record<string, unknown> };
  if (!sObj.properties) return { has: (p) => result.has(p) };

  for (const reqName of sObj.required ?? []) {
    result.add(reqName);
  }
  for (const [propName, propRaw] of Object.entries(sObj.properties)) {
    if (!propRaw || typeof propRaw !== 'object') continue;
    const prop = propRaw as { type?: string; items?: { required?: string[] }; required?: string[] };
    if (prop.type === 'array') {
      for (const itemReq of prop.items?.required ?? []) {
        result.add(`${propName}[].${itemReq}`);
      }
    } else if (prop.type === 'object') {
      for (const nestedReq of prop.required ?? []) {
        result.add(`${propName}.${nestedReq}`);
      }
    }
  }
  return { has: (p) => result.has(p) };
}

/**
 * Tokenize the source doc once into the set of bare numeric tokens (with
 * commas/dots intact). Membership-check is O(1) and short-circuits the more
 * expensive substring search for the common case where an emitted value's
 * core digits are already present in the doc.
 */
function buildNumericTokenSet(sourceDoc: string): Set<string> {
  const tokens = sourceDoc.match(/[\d,.]+/g);
  return new Set(tokens ?? []);
}

/** Strip commas and trailing dots from a numeric token. */
function numericGroundingBareDigits(s: string): string {
  return s.replace(/[,$\s]/g, '').replace(/\.$/, '');
}

/**
 * Extract a single canonical numeric value (and unit) from an emitted value
 * like `$5B`, `$5,000,000,000`, `5 billion`, `34%`, `1,234,567`.
 */
interface NumericGroundingExtractedValue {
  raw: string;
  kind: 'dollar' | 'percent' | 'shares';
  /** Canonical numeric form: digits-only string, with multiplier applied for B/M/K. */
  canonical: string;
  /** Decimal form for variant generation (e.g., "5.0" for "$5B"). */
  decimal: string;
}

const NUMERIC_GROUNDING_UNIT_MULTIPLIERS: Record<string, number> = {
  trillion: 1_000_000_000_000,
  t: 1_000_000_000_000,
  billion: 1_000_000_000,
  b: 1_000_000_000,
  million: 1_000_000,
  m: 1_000_000,
  thousand: 1_000,
  k: 1_000,
};

function extractDollarMagnitude(raw: string): NumericGroundingExtractedValue | null {
  // Match the digits and optional unit
  const m = raw.match(/\$?([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|trillion|B|M|K|T)?\b/i);
  if (!m) return null;
  const digits = m[1];
  const unit = (m[2] ?? '').toLowerCase();
  const baseNum = parseFloat(digits.replace(/,/g, ''));
  if (!Number.isFinite(baseNum)) return null;
  const mult = unit ? (NUMERIC_GROUNDING_UNIT_MULTIPLIERS[unit] ?? 1) : 1;
  const total = baseNum * mult;
  return {
    raw,
    kind: 'dollar',
    canonical: total.toString(),
    decimal: baseNum.toString(),
  };
}

function extractPercent(raw: string): NumericGroundingExtractedValue | null {
  const m = raw.match(/[+\-]?(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return { raw, kind: 'percent', canonical: m[1], decimal: m[1] };
}

function extractShareCount(raw: string): NumericGroundingExtractedValue | null {
  const cleaned = numericGroundingBareDigits(raw);
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 1000) return null;
  return { raw, kind: 'shares', canonical: cleaned, decimal: cleaned };
}

/**
 * Generate substring variants the source doc might use to express this value.
 * Conservative — adds common forms, accepts the false-negative cost of unusual
 * phrasings (an unverified-but-real value gets nulled, the downstream template
 * hides it gracefully).
 */
function generateNumericGroundingVariants(extracted: NumericGroundingExtractedValue): string[] {
  const out = new Set<string>();
  const { canonical, decimal, kind } = extracted;

  if (kind === 'dollar') {
    const num = parseFloat(canonical);
    if (!Number.isFinite(num)) return [canonical];
    // Long-form: "5,000,000,000"
    out.add(num.toLocaleString('en-US'));
    // Plain digits: "5000000000"
    out.add(canonical);
    // Magnitude forms based on size
    if (num >= 1e12) {
      const t = num / 1e12;
      out.add(`${t}T`); out.add(`${t} trillion`); out.add(`${t.toFixed(1)} trillion`);
    }
    if (num >= 1e9) {
      const b = num / 1e9;
      out.add(`${b}B`); out.add(`${b} billion`); out.add(`${b.toFixed(1)} billion`);
      out.add(`${b.toFixed(1)}B`);
    }
    if (num >= 1e6) {
      const mm = num / 1e6;
      out.add(`${mm}M`); out.add(`${mm} million`); out.add(`${mm.toFixed(1)} million`);
      out.add(`${mm.toFixed(1)}M`);
    }
    if (num >= 1000) {
      const k = num / 1000;
      out.add(`${k}K`); out.add(`${k} thousand`);
    }
    // Original decimal form (e.g. "5" or "5.5")
    out.add(decimal);
  } else if (kind === 'percent') {
    out.add(`${canonical}%`);
    out.add(`${canonical} percent`);
    out.add(canonical);
    // 34 → 0.34
    const n = parseFloat(canonical);
    if (Number.isFinite(n)) {
      out.add((n / 100).toString());
      out.add(`(${canonical}%)`);
    }
  } else if (kind === 'shares') {
    const n = parseFloat(canonical);
    if (!Number.isFinite(n)) return [canonical];
    // Long-form with commas
    out.add(n.toLocaleString('en-US'));
    out.add(canonical);
    // Magnitude forms (e.g. 1,234,567 → "1.2M shares")
    if (n >= 1e9) out.add(`${(n / 1e9).toFixed(1)}B`);
    if (n >= 1e6) out.add(`${(n / 1e6).toFixed(1)}M`);
    if (n >= 1e3) out.add(`${(n / 1e3).toFixed(1)}K`);
  }

  return Array.from(out).filter((v) => v && v.length >= 2);
}

/**
 * Approximation tolerance: scan for "approximately N [unit]" patterns in the
 * source doc (already lowercased) and accept if any of those numbers is
 * within 5% of `target`.
 */
const NUMERIC_GROUNDING_APPROXIMATE_PATTERN = /approximate(?:ly)?\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|trillion|b|m|k|t)?\b/g;

function hasNumericGroundingApproximateMatch(sourceLower: string, target: number): boolean {
  let match: RegExpExecArray | null;
  // Reset lastIndex since the regex is module-scoped with the `g` flag.
  NUMERIC_GROUNDING_APPROXIMATE_PATTERN.lastIndex = 0;
  while ((match = NUMERIC_GROUNDING_APPROXIMATE_PATTERN.exec(sourceLower)) !== null) {
    const baseNum = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(baseNum)) continue;
    const unit = (match[2] ?? '').toLowerCase();
    const mult = unit ? (NUMERIC_GROUNDING_UNIT_MULTIPLIERS[unit] ?? 1) : 1;
    const approxValue = baseNum * mult;
    const ratio = Math.abs(approxValue - target) / Math.max(approxValue, target);
    if (ratio <= 0.05) return true;
  }
  return false;
}

/**
 * Check if a candidate value's numeric content is grounded in the source.
 * Fast path: the value's raw digit token is in the source's numeric token
 * set. Slow path: substring-search any of the normalized variants.
 */
function checkNumericGrounded(
  value: string,
  sourceDoc: string,
  sourceLowerWindow: string,
  numericTokens: Set<string>,
): { grounded: true } | { grounded: false; reason: string } {
  if (value.length < NUMERIC_GROUNDING_MIN_VALUE_LEN) return { grounded: true };

  // Pull the strongest signal — order matters: try dollar first since
  // "$5,000,000" would also match the share-count pattern.
  const dollar = value.match(NUMERIC_GROUNDING_DOLLAR_PATTERN);
  const percent = value.match(NUMERIC_GROUNDING_PERCENT_PATTERN);
  const shares = value.match(NUMERIC_GROUNDING_SHARE_COUNT_PATTERN);

  const candidates: NumericGroundingExtractedValue[] = [];
  for (const raw of dollar ?? []) {
    const ex = extractDollarMagnitude(raw);
    if (ex) candidates.push(ex);
  }
  for (const raw of percent ?? []) {
    const ex = extractPercent(raw);
    if (ex) candidates.push(ex);
  }
  // Only count bare share counts if we didn't already classify as dollar/percent.
  if (candidates.length === 0) {
    for (const raw of shares ?? []) {
      const ex = extractShareCount(raw);
      if (ex) candidates.push(ex);
    }
  }
  if (candidates.length === 0) {
    // Nothing numeric to ground — value is opaque / categorical, accept.
    return { grounded: true };
  }

  for (const ex of candidates) {
    // Fast path: bare-digit token already in source.
    const bare = numericGroundingBareDigits(ex.canonical);
    if (numericTokens.has(bare)) continue;

    // Slow path: try variants.
    const variants = generateNumericGroundingVariants(ex);
    let matched = false;
    for (const v of variants) {
      if (sourceLowerWindow.includes(v.toLowerCase())) {
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Approximation tolerance: when source says "approximately N <unit>"
    // where N is within 5% of the emitted value's magnitude, accept. Filings
    // often round ("approximately $79.9 billion") and the AI re-rounds
    // ("$80B"). This avoids false positives on benign rounding.
    if (ex.kind === 'dollar' || ex.kind === 'shares') {
      const target = parseFloat(ex.canonical);
      if (Number.isFinite(target) && hasNumericGroundingApproximateMatch(sourceLowerWindow, target)) {
        continue;
      }
    }

    return { grounded: false, reason: `No source match for ${ex.kind} "${ex.raw}"` };
  }

  return { grounded: true };
}

/**
 * Resolve a path like 'shelfRegistration.totalAuthorized' against the parsed
 * data and apply `visit` to each terminal value. For `a[].b` paths, iterates
 * each array element.
 */
type NumericGroundingVisitor = (path: string, value: unknown, redact: () => void) => void;

function visitNumericGroundingPath(
  data: Record<string, unknown>,
  path: string,
  visitor: NumericGroundingVisitor,
): void {
  if (path.includes('[].')) {
    const [arrayPart, fieldName] = path.split('[].');
    const arr = resolveNumericGroundingDeep(data, arrayPart);
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        if (fieldName in obj) {
          visitor(`${arrayPart}[${i}].${fieldName}`, obj[fieldName], () => {
            obj[fieldName] = null;
          });
        }
      }
    }
  } else if (path.includes('.')) {
    const segments = path.split('.');
    const last = segments.pop()!;
    let cur: Record<string, unknown> | undefined = data;
    for (const seg of segments) {
      const next = cur?.[seg];
      if (!next || typeof next !== 'object' || Array.isArray(next)) return;
      cur = next as Record<string, unknown>;
    }
    if (cur && last in cur) {
      visitor(path, cur[last], () => {
        cur![last] = null;
      });
    }
  } else {
    if (path in data) {
      visitor(path, data[path], () => {
        data[path] = null;
      });
    }
  }
}

function resolveNumericGroundingDeep(data: Record<string, unknown>, path: string): unknown {
  let cur: unknown = data;
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Numeric Grounding Guard entry point. Mutates `data` in place, redacting
 * ungrounded numeric strings to null (except where the schema marks the path
 * required — those are reported but preserved).
 */
function validateNumericGrounding(
  data: Record<string, unknown>,
  sourceDoc: string,
  options: NumericGroundingOptions = {},
): NumericGroundingResult {
  const startedAt = Date.now();
  const empty: NumericGroundingResult = {
    rejectedFields: [],
    unredactablePaths: [],
    durationMs: 0,
    warnOnly: false,
  };

  if (process.env.ENRICHMENT_DISABLE_NUMERIC_GROUNDING === '1') {
    return empty;
  }
  if (!sourceDoc || sourceDoc.length < NUMERIC_GROUNDING_MIN_SOURCE_LEN) {
    return empty;
  }

  // When the source was chunked we only see one chunk — emitted values that
  // came from a different chunk would be redacted as fabrications. Run in
  // warn-only mode: count the violations but DO NOT mutate data.
  const warnOnly = Boolean(options.chunked);

  const requiredPaths = buildNumericGroundingRequiredPaths(options.formType);
  const numericTokens = buildNumericTokenSet(sourceDoc);
  // Lowercase once for substring search.
  const sourceLower = sourceDoc.toLowerCase();

  const rejected: NumericGroundingViolation[] = [];
  const unredactable: string[] = [];

  for (const walkPath of NUMERIC_GROUNDING_WALK_PATHS) {
    visitNumericGroundingPath(data, walkPath, (concretePath, value, redact) => {
      // Only ground string values (JSON-numeric typed values are skipped).
      if (typeof value !== 'string' || !value.trim()) return;
      // Skip prose-like field names.
      const leaf = concretePath.split(/[.[]/).pop()!.replace(/\]/g, '');
      if (NUMERIC_GROUNDING_PROSE_FIELD_NAMES.has(leaf)) return;
      if (/date$/i.test(leaf) || /maturityDate/i.test(leaf)) return;

      const result = checkNumericGrounded(value, sourceDoc, sourceLower, numericTokens);
      if (result.grounded) return;

      // Determine redaction policy: originally-required paths cannot be
      // nulled without violating strict-schema invariants.
      const normalizedRequiredKey = walkPath; // matches buildNumericGroundingRequiredPaths output
      if (requiredPaths.has(normalizedRequiredKey)) {
        unredactable.push(concretePath);
        return;
      }

      rejected.push({ path: concretePath, value, reason: result.reason });
      if (!warnOnly) redact();
    });
  }

  return {
    rejectedFields: rejected,
    unredactablePaths: unredactable,
    durationMs: Date.now() - startedAt,
    warnOnly,
  };
}

/**
 * Creates minimum fallback data when parsing fails
 * Phase 3: Simplified fallback - just ensures summary and company exist
 *
 * @param responseText - The raw text response from Claude
 * @param filingType - The type of SEC filing
 * @param fallbackCompany - Fallback company name if not found
 * @returns A minimal JSON object with basic required fields
 */
function ensureMinimumFields(
  responseText: string,
  filingType: SECFilingType,
  fallbackCompany: string = 'Unknown Company'
): Record<string, unknown> {
  // Check if responseText looks like JSON (starts with { or [)
  const looksLikeJson = responseText.trim().startsWith('{') || responseText.trim().startsWith('[');

  let summary: string;

  if (looksLikeJson) {
    // Try to extract the summary field from malformed JSON
    // Common patterns: {"company":"...", "summary":"<actual summary text>"...
    const summaryMatch = responseText.match(/"summary"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (summaryMatch && summaryMatch[1]) {
      // Unescape any escaped characters and use extracted summary
      summary = summaryMatch[1]
        .replace(/\\n/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      // Limit to 500 chars
      if (summary.length > 500) {
        summary = summary.substring(0, 497) + '...';
      }
    } else {
      // Could not extract summary from JSON - use a descriptive fallback
      summary = `This ${filingType} filing from ${fallbackCompany} could not be fully summarized due to a processing error. Please view the original filing on SEC.gov for complete details.`;
    }
  } else {
    // Non-JSON response - use as-is but limit length
    summary = responseText.length > 500
      ? responseText.substring(0, 497) + '...'
      : responseText;
  }

  return {
    company: fallbackCompany,
    summary: summary || `Unable to parse ${filingType} filing summary.`,
    filingType
  };
}

// ─── Historical context (Phase 3) ─────────────────────────────────────────────
// Pulls the most recent prior Summaries for a ticker and folds them into the
// current filing prompt so the model can reference continuity (e.g. "Q3 follows
// the Q2 guidance cut"). Hidden inside the Summarize module — there's exactly
// one caller (the historical-context enrichment block below) and the prior
// extraction-for-testability split was a textbook ADR-0002 shape. Coverage now
// flows through the summarize interface.

interface HistoricalSummary {
  id: string;
  filingType: string;
  filingDate: Date;
  summaryText: string;
  ticker: { symbol: string };
}

const MAX_HISTORICAL_SUMMARIES = 3;
const MAX_HISTORICAL_SUMMARY_LENGTH = 1500;

async function getHistoricalSummaries(
  tickerSymbol: string,
  currentFilingDate: string,
): Promise<HistoricalSummary[]> {
  return getPrismaClient().summary.findMany({
    where: {
      ticker: { symbol: tickerSymbol },
      filingDate: { lt: new Date(currentFilingDate) },
    },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      summaryText: true,
      ticker: { select: { symbol: true } },
    },
    orderBy: { filingDate: 'desc' },
    take: MAX_HISTORICAL_SUMMARIES,
  });
}

function buildContextEnrichedPrompt(
  currentContent: string,
  historicalSummaries: HistoricalSummary[],
): string {
  if (historicalSummaries.length === 0) {
    return currentContent;
  }

  const contextSection = historicalSummaries
    .map((summary) => {
      const truncatedText =
        summary.summaryText.length > MAX_HISTORICAL_SUMMARY_LENGTH
          ? summary.summaryText.substring(0, MAX_HISTORICAL_SUMMARY_LENGTH) + '...'
          : summary.summaryText;
      const dateStr = summary.filingDate.toISOString().split('T')[0];
      return `### Previous ${summary.filingType} (${dateStr})\n${truncatedText}`;
    })
    .join('\n\n');

  return `## Historical Context
The following are the most recent filings for this company. Use this context to provide continuity and reference relevant patterns:

${contextSection}

---

## Current Filing
${currentContent}`;
}

/**
 * Process document content for summarization
 * - Validates content before processing
 * - Checks if document needs chunking based on token count
 * - Either returns full document or processes it into chunks
 * - For large documents, combines important sections from all chunks
 * 
 * @param content - The document content to process
 * @param filingType - The type of SEC filing
 * @param maxTokens - Maximum tokens allowed
 * @returns Processed document content and chunking info
 */
// Exported so regression tests can pin the case-insensitive key-section
// match and the wider 10-Q/10-K extraction window — both load-bearing for
// FCF and current-period extraction.
export function processDocumentContent(content: string, filingType: SECFilingType, maxTokens: number = 150000): {
  processedContent: string;
  isChunked: boolean;
  chunkCount?: number;
  estimatedTokens: number;
  isMinimalContent?: boolean;
  isSectioned?: boolean;
} {
  // Validate content first
  if (!content || content.trim().length === 0) {
    componentLogger.warn(`Empty content received for ${filingType} filing`);
    return {
      processedContent: '',
      isChunked: false,
      estimatedTokens: 0,
      isMinimalContent: true
    };
  }
  
  // Check for minimal content (less than 500 characters)
  if (content.trim().length < 500) {
    componentLogger.warn(`Minimal content (${content.length} chars) received for ${filingType} filing`);
    return {
      processedContent: content,
      isChunked: false,
      estimatedTokens: estimateTokenCount(content),
      isMinimalContent: true
    };
  }
  
  // Estimate current token count
  const estimatedTokens = estimateTokenCount(content);
  
  // If we're already under the limit, return the full content
  if (estimatedTokens <= maxTokens * 0.85) { // Using 85% of max as safety margin
    return {
      processedContent: content,
      isChunked: false,
      estimatedTokens
    };
  }
  
  // Document needs chunking - use the chunking strategy from context-manager
  const config = getContextConfig(filingType);
  
  // Adjust config to respect our maxTokens parameter
  const adjustedConfig = {
    ...config,
    maxChunkSize: Math.min(config.maxChunkSize, maxTokens * 0.85) // 85% of max tokens
  };
  
  // Get chunks using the appropriate strategy
  const chunks = splitDocumentIntoChunks(content, adjustedConfig);
  
  if (chunks.length === 0) {
    componentLogger.warn(`Chunking resulted in 0 chunks for ${filingType} filing`);
    return {
      processedContent: content.substring(0, Math.min(content.length, 100000)), // Fallback to first 100k chars
      isChunked: true,
      chunkCount: 1,
      estimatedTokens: Math.min(estimatedTokens, maxTokens * 0.85)
    };
  }
  
  // Enhanced approach: Process multiple chunks for large documents
  // For filings with multiple chunks, combine the most important parts
  if (chunks.length > 1) {
    // Always include the first chunk as it typically contains the most important information
    let combinedContent = chunks[0];
    
    // For specific filing types, extract and include key sections from other chunks
    if (['10-K', '10-Q', '8-K', '20-F', '40-F', '10-K/A', '10-Q/A'].includes(filingType)) {
      // For financial reports, look for risk factors, MD&A, and financial statements in other chunks.
      // 'Cash Flow' / 'Statements of Cash' are added explicitly so we don't rely on the broader
      // 'Consolidated Statements' match (whose first occurrence usually lands on the income
      // statement) to also reach the cash-flow table — important for FCF Margin extraction.
      const keyPhrases = [
        'Risk Factors', 'Item 1A', 'Item 7', 'Management Discussion',
        'Financial Statements', 'Consolidated Statements', 'Statements of Cash',
        'Cash Flow', 'Notes to', 'Executive Summary', 'Business Overview'
      ];

      // Extract key sections from other chunks
      let keyContentFromOtherChunks = '';

      // Window sizing for key-section extraction.
      // Wider window for financial reports so multi-column income-statement
      // tables (current quarter + prior-year + YTD) aren't truncated
      // mid-row. 18k chars after the heading covers the full table plus
      // surrounding MD&A context.
      const isQuarterlyOrAnnual = ['10-K', '10-Q', '20-F', '40-F', '10-K/A', '10-Q/A'].includes(filingType);
      const beforeChars = isQuarterlyOrAnnual ? 1000 : 500;
      const afterChars = isQuarterlyOrAnnual ? 18000 : 4500;

      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        // Case-insensitive matching: many older filings use ALL-CAPS section
        // headings (e.g., "CONSOLIDATED STATEMENTS OF CASH FLOWS"); we don't
        // want a case mismatch to silently drop the cash-flow table.
        const chunkLower = chunk.toLowerCase();

        // Look for key sections in this chunk
        for (const phrase of keyPhrases) {
          const phraseIndex = chunkLower.indexOf(phrase.toLowerCase());
          if (phraseIndex >= 0) {
            const startPos = Math.max(0, phraseIndex - beforeChars);
            const endPos = Math.min(chunk.length, phraseIndex + afterChars);
            const section = chunk.substring(startPos, endPos);

            keyContentFromOtherChunks += `\n\n--- ${phrase} (from document section ${i+1}) ---\n${section}`;
          }
        }
      }
      
      // Add key content if we found any, but respect token limits
      if (keyContentFromOtherChunks) {
        const firstChunkTokens = estimateTokenCount(combinedContent);
        const keyContentTokens = estimateTokenCount(keyContentFromOtherChunks);
        
        // Only add if we have room within our token budget
        if (firstChunkTokens + keyContentTokens <= maxTokens * 0.85) {
          combinedContent += keyContentFromOtherChunks;
        } else {
          // If too large, truncate the key content
          const availableTokens = maxTokens * 0.85 - firstChunkTokens;
          const truncationRatio = availableTokens / keyContentTokens;
          const truncatedLength = Math.floor(keyContentFromOtherChunks.length * truncationRatio);
          
          combinedContent += keyContentFromOtherChunks.substring(0, truncatedLength) + 
            '\n\n[Additional content truncated due to token limits]';
        }
      }
    } else if (['424B2', '424B3', '424B5', 'FWP'].includes(filingType)) {
      // For prospectus filings, look for pricing, risk factors, and terms
      const keyPhrases = [
        'Pricing', 'Risk Factors', 'Terms', 'Maturity', 'Interest Rate', 
        'Redemption', 'Offering', 'Underwriting'
      ];
      
      // Similar extraction logic as above
      let keyContentFromOtherChunks = '';
      
      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        for (const phrase of keyPhrases) {
          const phraseIndex = chunk.indexOf(phrase);
          if (phraseIndex >= 0) {
            const startPos = Math.max(0, phraseIndex - 500);
            const endPos = Math.min(chunk.length, phraseIndex + 4500);
            const section = chunk.substring(startPos, endPos);
            
            keyContentFromOtherChunks += `\n\n--- ${phrase} (from document section ${i+1}) ---\n${section}`;
          }
        }
      }
      
      // Add key content with token limit handling
      if (keyContentFromOtherChunks) {
        const firstChunkTokens = estimateTokenCount(combinedContent);
        const keyContentTokens = estimateTokenCount(keyContentFromOtherChunks);
        
        if (firstChunkTokens + keyContentTokens <= maxTokens * 0.85) {
          combinedContent += keyContentFromOtherChunks;
        } else {
          const availableTokens = maxTokens * 0.85 - firstChunkTokens;
          const truncationRatio = availableTokens / keyContentTokens;
          const truncatedLength = Math.floor(keyContentFromOtherChunks.length * truncationRatio);
          
          combinedContent += keyContentFromOtherChunks.substring(0, truncatedLength) + 
            '\n\n[Additional content truncated due to token limits]';
        }
      }
    } else if (['DEF 14A', 'DEFA14A', 'PRE 14A', 'PX14A6G'].includes(filingType)) {
      // For proxy statements, look for proposals, compensation, and governance
      const keyPhrases = [
        'Proposal', 'Shareholder', 'Executive Compensation', 'Board', 
        'Director', 'Governance', 'Vote', 'Recommendation'
      ];
      
      // Extract key sections
      let keyContentFromOtherChunks = '';
      
      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        for (const phrase of keyPhrases) {
          const phraseIndex = chunk.indexOf(phrase);
          if (phraseIndex >= 0) {
            const startPos = Math.max(0, phraseIndex - 500);
            const endPos = Math.min(chunk.length, phraseIndex + 4500);
            const section = chunk.substring(startPos, endPos);
            
            keyContentFromOtherChunks += `\n\n--- ${phrase} (from document section ${i+1}) ---\n${section}`;
          }
        }
      }
      
      // Add key content with token limit handling
      if (keyContentFromOtherChunks) {
        const firstChunkTokens = estimateTokenCount(combinedContent);
        const keyContentTokens = estimateTokenCount(keyContentFromOtherChunks);
        
        if (firstChunkTokens + keyContentTokens <= maxTokens * 0.85) {
          combinedContent += keyContentFromOtherChunks;
        } else {
          const availableTokens = maxTokens * 0.85 - firstChunkTokens;
          const truncationRatio = availableTokens / keyContentTokens;
          const truncatedLength = Math.floor(keyContentFromOtherChunks.length * truncationRatio);
          
          combinedContent += keyContentFromOtherChunks.substring(0, truncatedLength) + 
            '\n\n[Additional content truncated due to token limits]';
        }
      }
    }
    
    return {
      processedContent: combinedContent,
      isChunked: true,
      chunkCount: chunks.length,
      estimatedTokens: estimateTokenCount(combinedContent)
    };
  }
  
  // For single chunk documents, return that chunk
  return {
    processedContent: chunks[0],
    isChunked: true,
    chunkCount: chunks.length,
    estimatedTokens: estimateTokenCount(chunks[0])
  };
}

/**
 * Truncate document content to fit within token limits
 * Uses a smart approach to preserve important sections
 * 
 * @param content - The document content to truncate
 * @param maxTokens - Maximum tokens to allow
 * @returns Truncated document content
 */
function truncateDocumentContent(content: string, maxTokens: number): string {
  // Estimate current token count
  const currentTokens = estimateTokenCount(content);
  
  // If already under limit, return as is
  if (currentTokens <= maxTokens) {
    return content;
  }
  
  // Split document into sections/paragraphs
  const sections = content.split(/\n\n+/);
  
  // Calculate approximate ratio to keep (for potential future use)
  // const _keepRatio = maxTokens / currentTokens;
  
  // Prioritize important sections based on keywords
  const prioritizedSections = sections.map((section, index) => {
    let priority = 0;
    
    // Prioritize sections with important keywords
    if (/risk factors|item 1a|item 7|financial statements|management discussion/i.test(section)) {
      priority += 3;
    }
    
    // Prioritize sections with numbers (often important in financial docs)
    if (/\$|\d+\.\d+|\d+%|million|billion/i.test(section)) {
      priority += 2;
    }
    
    // Prioritize beginning and end of document
    if (index < sections.length * 0.2) { // First 20%
      priority += 2;
    } else if (index > sections.length * 0.8) { // Last 20%
      priority += 1;
    }
    
    return { section, priority, index };
  });
  
  // Sort by priority (highest first)
  prioritizedSections.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // If same priority, maintain original order
    return a.index - b.index;
  });
  
  // Keep sections until we hit the token limit
  const keptSections: string[] = [];
  let tokenCount = 0;
  
  for (const { section } of prioritizedSections) {
    const sectionTokens = estimateTokenCount(section);
    
    if (tokenCount + sectionTokens <= maxTokens * 0.95) { // Leave 5% buffer
      keptSections.push(section);
      tokenCount += sectionTokens;
    }
  }
  
  // Sort back to original order
  keptSections.sort((a, b) => {
    const indexA = sections.indexOf(a);
    const indexB = sections.indexOf(b);
    return indexA - indexB;
  });
  
  // Join sections back together
  return keptSections.join('\n\n');
}

// Cost calculation removed - using OpenRouter's cost directly from response

// Component logger
const componentLogger = logger.child('claude-summarizer');

// ─── Enrichment rollout gates (private to Summarize) ────────────────────────
//
// PostHog feature-flag evaluations gating the enrichment path. Inlined from
// the former `lib/ai/enrichment-flags.ts` for the same reason as the Why It
// Matters Guard / Ticker Grounding Guard / Numeric Grounding Guard / Historical
// Context inlines documented in CONTEXT.md and ADR-0002: the only production
// caller is this Summarize module, the extraction was for testability rather
// than leverage, and the unit-test surface asserted on internal flag-name
// constants past the interface.
//
// `accessionNumber` flows through as PostHog's `distinctId` for stable
// per-filing bucketing. Every gate fails-safe-off — any thrown error or
// missing client resolves to `false`, so a PostHog outage cannot accidentally
// enable enrichment.
const ENRICHMENT_TOP_LEVEL_FLAG = 'why_it_matters_enrichment';

const ENRICHMENT_PROVIDER_FLAGS: Record<string, string> = {
  counterparty: 'why_it_matters_counterparty',
  governance: 'why_it_matters_governance',
  debt_issuance: 'why_it_matters_debt',
  earnings: 'why_it_matters_earnings',
  capital_return: 'why_it_matters_capital_return',
  x_sentiment: 'x_sentiment_enrichment',
};

const EARNINGS_MINI_DEEP_DIVE_FLAG = 'enable_earnings_mini_deep_dive';

async function evaluateEnrichmentFlag(flagKey: string, distinctId: string): Promise<boolean> {
  // Dev/QA bypass: ENRICHMENT_FORCE_ENABLE=1 short-circuits every flag to true so
  // test scripts can exercise enrichment without provisioning PostHog flags.
  // NEVER set this in production — it disables the kill-switch.
  if (process.env.ENRICHMENT_FORCE_ENABLE === '1') {
    return true;
  }
  try {
    // Dynamic import prevents posthog-node (Node-only deps like `readline`)
    // from being pulled into any client bundle that transitively imports
    // this module via the summarize pipeline.
    const { getServerPostHog } = await import('../analytics/posthog-server');
    const posthog = getServerPostHog();
    if (!posthog) {
      return false;
    }
    const value = await posthog.getFeatureFlag(flagKey, distinctId);
    return value === true || value === 'true';
  } catch (error) {
    componentLogger.warn(`PostHog flag evaluation failed for ${flagKey}, defaulting to off`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function isWhyItMattersEnabled(accessionNumber: string): Promise<boolean> {
  return evaluateEnrichmentFlag(ENRICHMENT_TOP_LEVEL_FLAG, accessionNumber);
}

async function isProviderEnabled(providerName: string, accessionNumber: string): Promise<boolean> {
  const flagKey = ENRICHMENT_PROVIDER_FLAGS[providerName];
  if (!flagKey) {
    componentLogger.warn(`Unknown provider name for flag lookup: ${providerName}`);
    return false;
  }
  return evaluateEnrichmentFlag(flagKey, accessionNumber);
}

/**
 * Gate for the materialitySignal field on 10-K/10-Q summaries.
 * Cohort-gated per autoplan plan: Day 1 internal, Day 4 = 10%, Day 14 = 100%.
 * Kill-switch: unsubscribe rate > 1.5x 7-day baseline triggers auto-rollback.
 */
async function isEarningsMiniDeepDiveEnabled(accessionNumber: string): Promise<boolean> {
  return evaluateEnrichmentFlag(EARNINGS_MINI_DEEP_DIVE_FLAG, accessionNumber);
}

/**
 * Get the appropriate prompt for a filing type with context
 * Phase 4: Uses unified-prompts for bulletproof JSON output
 */
function getPromptForFilingType(
  filingType: SECFilingType,
  context: {
    ticker?: string;
    companyName?: string;
    accessionNumber?: string;
    /** Pre-evaluated PostHog flag — caller resolves async, prompt build stays sync. */
    enableEarningsMiniDeepDive?: boolean;
  },
) {
  return {
    /**
     * Generate the complete prompt including system and user prompts
     * Returns both prompts for use with OpenRouter API
     */
    getPrompts: (content: string) => {
      const { systemPrompt, userPrompt } = generateUnifiedPrompt({
        formType: filingType,
        company: context.companyName || 'Unknown Company',
        ticker: context.ticker || 'Unknown',
        filingDate: new Date().toISOString().split('T')[0],
        filingContent: content,
        enableEarningsMiniDeepDive: context.enableEarningsMiniDeepDive,
      });

      return { systemPrompt, userPrompt };
    },
    /**
     * Legacy method - returns just the user prompt for backward compatibility
     * @deprecated Use getPrompts() instead for full JSON enforcement
     */
    getFullPrompt: (content: string) => {
      const { userPrompt } = generateUnifiedPrompt({
        formType: filingType,
        company: context.companyName || 'Unknown Company',
        ticker: context.ticker || 'Unknown',
        filingDate: new Date().toISOString().split('T')[0],
        filingContent: content,
        enableEarningsMiniDeepDive: context.enableEarningsMiniDeepDive,
      });

      return userPrompt;
    }
  };
}

/**
 * Generate a prompt for minimal content cases using available metadata
 * This is used when the filing content is empty, minimal, or couldn't be extracted properly
 * @param filingRecord - The filing record with metadata
 * @returns A prompt string focused on metadata
 */
function generateMinimalContentPrompt(filingRecord: {
  id: string;
  formType: string;
  companyName: string;
  ticker?: { symbol?: string };
  accessionNumber?: string;
  rawContent?: string;
}): string {
  const ticker = filingRecord.ticker?.symbol || 'UNKNOWN';
  const formType = filingRecord.formType || 'UNKNOWN';
  const companyName = filingRecord.companyName || 'Unknown Company';
  const accessionNumber = filingRecord.accessionNumber || 'Unknown';
  const filingId = filingRecord.id;
  
  // Use any available raw content, even if minimal
  const minimalContent = filingRecord.rawContent || '';
  
  // Build a metadata-focused prompt
  return `
# SEC Filing Metadata Summary Request

I need to generate a summary for an SEC filing with minimal or no extractable content.

## Available Metadata:
- Company: ${companyName}
- Ticker: ${ticker}
- Form Type: ${formType}
- Accession Number: ${accessionNumber}
- Filing ID: ${filingId}

## Limited Available Content:
${minimalContent.substring(0, 1000)}${minimalContent.length > 1000 ? '...[truncated]' : ''}

## Instructions:
1. Based on the form type and company information, provide a general description of what this type of filing typically contains.
2. Explain the purpose and significance of this form type for investors.
3. Note that the actual content could not be fully extracted or was minimal.
4. If possible, extract any meaningful information from the limited content provided.
5. Format your response as a proper summary that acknowledges the limited information available.

Please provide the best possible summary given these constraints.
`;
}

/**
 * Error class for summarization failures
 */
export class SummarizationError extends Error {
  filingType: string;
  summaryId: string;
  code: string;
  reason?: string;
  isRetriable: boolean;
  
  constructor(
    message: string, 
    summaryId: string, 
    filingType: string, 
    code: string = 'SUMMARIZATION_FAILED',
    isRetriable: boolean = false,
    reason?: string
  ) {
    super(message);
    this.name = 'SummarizationError';
    this.summaryId = summaryId;
    this.filingType = filingType;
    this.code = code;
    this.isRetriable = isRetriable;
    this.reason = reason;
  }
}

/**
 * Interface for summarization options
 */
export interface SummarizationOptions {
  filingId?: string;
  summaryId?: string;
  requestId?: string;
  openRouterOptions?: Record<string, unknown>;
  model?: string;
  metadata?: {
    ticker?: string;
    companyName?: string;
    formType?: string;
    filingDate?: string;
    accessionNumber?: string;
    cik?: string;
    documentType?: string;
    documentDescription?: string;
  };
  // Tier-gating context for web-search enrichment ("Why it matters"). Phase 4
  // of `tasks/x-search-max-only.md`: enrichment is MAX-only, but the producer
  // is the writer (this function), not the email template. When userTier is
  // undefined we treat the request as non-Max — safer default for legacy
  // callers (admin scripts, direct service-level paths) than silently
  // enriching for everyone.
  userTier?: 'FREE' | 'PRO' | 'MAX' | string;
  isTrialing?: boolean;
  trialEndsAt?: Date | null;
}
/**
 * Interface for summarization result
 */
export interface SummarizationResult {
  summaryId?: string;
  summary: string;
  summaryText: string;
  summaryJSON: Record<string, unknown> | null;
  keyPoints?: string[];
  isPartial?: boolean;
  duration: number;
  parsingErrors?: string[];
  // AI metrics
  modelUsed: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokensUsed?: number;
  cost?: number;
  processingTimeMs?: number;
  attempts?: number;
}

/**
 * Summarize an SEC filing using Claude AI with robust error handling and fallback
 */
export async function summarizeFiling(content: string, options: SummarizationOptions): Promise<SummarizationResult> {
  // Define a type that matches the Prisma return structure
  type SECFilingRecord = {
    id: string;
    formType: string;
    rawContent?: string;
    companyName: string;
    ticker?: { symbol?: string };
    accessionNumber?: string;
    filingDate?: Date;
  };
  
  let filingRecordFromDB: SECFilingRecord | null = null;
  const {
    filingId,
    summaryId,
    requestId,
    openRouterOptions,
    metadata,
    model: optionsModel,
    userTier,
    isTrialing,
    trialEndsAt,
  } = options;
  // MAX-only enrichment gate (Phase 4 of tasks/x-search-max-only.md). Computed
  // once and used as the single source of truth for: (a) whether to invoke
  // web-search providers at all, (b) defense-in-depth output sanitization,
  // (c) the persisted enrichmentApplied column. Default to non-Max when tier
  // context is missing (legacy callers, admin scripts) — safer than silently
  // enriching for everyone.
  const enrichmentApplied = isMaxEligible({
    tier: userTier ?? null,
    isTrialing: isTrialing ?? false,
    trialEndsAt: trialEndsAt ?? null,
  });
  const startTime = Date.now();
  
  const aiClient = openRouterClient;
  const operationId = requestId || `summarize-${summaryId || 'direct'}-${Date.now()}`;
  
  componentLogger.info(`Starting summarization${summaryId ? ` for summaryId=${summaryId}` : ''}${filingId ? `, filingId=${filingId}` : ''}, operationId=${operationId}`);
  monitoring.incrementCounter('ai.summarization_started', 1);
  
  try {
    // Only try to fetch filing and summary records if IDs are provided
    if (filingId) {
      filingRecordFromDB = await prisma.secFiling.findUnique({
        where: { id: filingId },
        include: { ticker: true }
      });
      
      if (!filingRecordFromDB) {
        componentLogger.error(`Filing not found for filingId=${filingId}`);
        monitoring.incrementCounter('ai.summarization_error');
        throw new SummarizationError(
          `Filing not found: ${filingId}`,
          summaryId || 'unknown',
          'unknown',
          'FILING_NOT_FOUND',
          false,
          'filing_not_found'
        );
      }
    } else if (metadata) {
      // Create a mock filing record from metadata when no filingId is provided
      filingRecordFromDB = {
        id: 'direct-summarization',
        formType: metadata.formType || 'unknown',
        companyName: metadata.companyName || 'Unknown Company',
        ticker: { symbol: metadata.ticker || 'UNKNOWN' },
        accessionNumber: metadata.accessionNumber
      };
    } else {
      // If neither filingId nor metadata is provided, create a minimal record
      filingRecordFromDB = {
        id: 'direct-summarization',
        formType: 'unknown',
        companyName: 'Unknown Company',
        ticker: { symbol: 'UNKNOWN' }
      };
    }
    
    let summary = null;
    if (summaryId) {
      summary = await prisma.summary.findUnique({
        where: { id: summaryId }
      });
      
      if (!summary) {
        componentLogger.error(`Summary record not found for summaryId=${summaryId}`);
        monitoring.incrementCounter('ai.summarization_error');
        throw new SummarizationError(
          `Summary record not found: ${summaryId}`,
          summaryId,
          filingRecordFromDB.formType,
          'SUMMARY_NOT_FOUND',
          false,
          'summary_not_found'
        );
      }
    }
    
    // Check if content is provided
    if (!content) {
      componentLogger.error(`No content provided for summarization`);
      monitoring.incrementCounter('ai.content_extraction_error', 1);
      throw new SummarizationError(
        `No content provided for summarization`,
        summaryId || 'unknown',
        filingRecordFromDB.formType,
        'CONTENT_MISSING',
        false,
        'content_missing'
      );
    }
    
    // Process document content - handle large documents appropriately
    const processedDoc = processDocumentContent(content, filingRecordFromDB.formType as SECFilingType);
    
    // Handle minimal or empty content cases
    if (processedDoc.isMinimalContent) {
      // Layer C C2: refuse to fall through to the metadata-only minimal-content
      // prompt for strict-financial forms (10-K, 10-Q, 20-F, 6-K, amendments).
      // The minimal-content prompt explicitly tells the LLM to "acknowledge the
      // limited information available" — which is exactly the language that
      // shipped on the NVDA 2026-05-20 "no extractable financial metrics" email.
      // For these forms, empty/minimal content is a parser bug, not a legitimate
      // filing state, and we must NOT ship a degenerate summary. Non-retriable
      // per C7 — cache reads return the same content on retry.
      if (requiresFinancialContent(filingRecordFromDB.formType)) {
        componentLogger.warn(
          `[C2] Refusing minimal-content fallback for strict-financial form ${filingRecordFromDB.formType} (${filingId || 'direct'}) — treating as INSUFFICIENT_CONTENT.`
        );
        monitoring.incrementCounter('ai.minimal_content_refused_strict_form', 1);
        monitoring.incrementCounter(`ai.minimal_content_refused.${filingRecordFromDB.formType}`, 1);
        throw new SummarizationError(
          `Filing has minimal extractable content but ${filingRecordFromDB.formType} requires financial data. Parser likely failed to clean the source HTML.`,
          summaryId || 'direct',
          filingRecordFromDB.formType,
          ProcessingStatus.INSUFFICIENT_CONTENT,
          false, // non-retriable: cache read returns same content on retry (C7)
          'minimal_content_strict_form'
        );
      }

      componentLogger.warn(`Minimal or empty content detected for ${filingId || 'direct'} (${filingRecordFromDB.formType}). Using metadata-based fallback.`);
      monitoring.incrementCounter('ai.minimal_content_detected', 1);

      try {
        // For minimal content, we'll create a special prompt that focuses on metadata
        const minimalContentPrompt = generateMinimalContentPrompt(filingRecordFromDB);

        // Update the processed content with our minimal content prompt
        processedDoc.processedContent = minimalContentPrompt;

        // Record the specific filing type for minimal content cases to track patterns
        monitoring.incrementCounter(`ai.minimal_content_filing_type.${filingRecordFromDB.formType}`, 1);
      } catch (error) {
        componentLogger.error(`Error generating minimal content prompt: ${error instanceof Error ? error.message : String(error)}`);
        monitoring.incrementCounter('ai.minimal_content_error', 1);
        
        // Provide a basic fallback prompt if the minimal content prompt generation fails
        processedDoc.processedContent = `SEC Filing for ${filingRecordFromDB.companyName} (${filingRecordFromDB.ticker?.symbol || 'Unknown'}), Form Type: ${filingRecordFromDB.formType}. Content could not be extracted properly.`;
      }
    } else if (processedDoc.isChunked) {
      componentLogger.info(`Document was chunked for processing. Using optimized content from ${processedDoc.chunkCount} chunks. Token estimate: ${processedDoc.estimatedTokens}`);
      monitoring.incrementCounter('ai.document_chunked', 1);
      monitoring.recordMetric('ai.document_chunks', processedDoc.chunkCount ? processedDoc.chunkCount : 1);
      
      // Record the specific filing type for chunked content to track patterns
      monitoring.incrementCounter(`ai.chunked_filing_type.${filingRecordFromDB.formType}`, 1);
    }

    // B3: For 10-Q / 10-K and amendments, override processedContent with a
    // priority-ordered sectioned prompt — guarantees Financial Statements
    // survives budget pressure. Layer A produced cleaned text with markdown
    // headings; Layer B built the extractor + priority budget builder; this
    // block makes them actually run for the filings that need them.
    // Fires only when content is non-minimal (C2 above handles the minimal case).
    const isStrictFinancialForm = (['10-Q', '10-K', '10-Q/A', '10-K/A'] as string[]).includes(
      filingRecordFromDB.formType
    );
    if (isStrictFinancialForm && !processedDoc.isMinimalContent) {
      const sections = extractSections(content, filingRecordFromDB.formType as SECFilingType);
      if (!hasUsableFinancialSection(sections)) {
        componentLogger.warn(
          `[B3] No usable Financial Statements section in ${filingRecordFromDB.formType} ` +
            `(${filingId || 'direct'}) — sectionizer found ${sections.length} section(s).`
        );
        monitoring.incrementCounter('ai.sectioned_extraction.no_financial_section', 1);
        throw new SummarizationError(
          `No Financial Statements section found in ${filingRecordFromDB.formType} filing. ` +
            `Sectionizer found ${sections.length} section(s) but none matched Financial ` +
            `Statements with usable content (>=100 chars).`,
          summaryId || 'direct',
          filingRecordFromDB.formType,
          ProcessingStatus.INSUFFICIENT_FINANCIAL_SECTION,
          false,
          'no_financial_statements_section'
        );
      }
      processedDoc.processedContent = buildSectionedPrompt(sections, 150000);
      processedDoc.isSectioned = true;
      componentLogger.info(
        `[B3] Sectioned extraction for ${filingRecordFromDB.formType} ` +
          `(${filingId || 'direct'}): ${sections.length} section(s) assembled.`
      );
      monitoring.incrementCounter('ai.sectioned_extraction.success', 1);
    }

    // Use the processed content for the prompt
    const processedContent = processedDoc.processedContent;

    // Resolve the earnings-mini-deep-dive flag once before building the
    // prompt. Used to gate the materialitySignal field on 10-K/10-Q at the
    // schema layer (autoplan Decision #33 — single gating layer). 8-K and
    // other filings ignore this flag.
    const earningsMiniDeepDiveEnabled = await isEarningsMiniDeepDiveEnabled(
      filingRecordFromDB.accessionNumber,
    );

    // Get the appropriate prompt for this filing type
    // Phase 4: Now using unified-prompts with bulletproof JSON enforcement
    const promptGenerator = getPromptForFilingType(
      filingRecordFromDB.formType as SECFilingType,
      {
        ticker: filingRecordFromDB.ticker?.symbol,
        companyName: filingRecordFromDB.companyName,
        // Add accession number if available
        accessionNumber: filingRecordFromDB.accessionNumber,
        enableEarningsMiniDeepDive: earningsMiniDeepDiveEnabled,
      }
    );

    // Phase 3: Enrich content with historical context if ticker is available
    let enrichedContent = processedContent;
    let capturedXSentiment: XSentimentEnrichment | null = null;
    const tickerSymbol = filingRecordFromDB.ticker?.symbol;
    const filingDateStr = filingRecordFromDB.filingDate
      ? filingRecordFromDB.filingDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    if (tickerSymbol && tickerSymbol !== 'UNKNOWN') {
      try {
        const historicalSummaries = await getHistoricalSummaries(tickerSymbol, filingDateStr);
        if (historicalSummaries.length > 0) {
          enrichedContent = buildContextEnrichedPrompt(processedContent, historicalSummaries);
          componentLogger.info(`Added historical context for ${tickerSymbol}: ${historicalSummaries.length} prior summaries`);
          monitoring.incrementCounter('ai.historical_context_added', 1);
          monitoring.recordMetric('ai.historical_context_count', historicalSummaries.length);
        }
      } catch (historyError) {
        componentLogger.warn(`Failed to fetch historical context for ${tickerSymbol}: ${historyError instanceof Error ? historyError.message : String(historyError)}`);
        monitoring.incrementCounter('ai.historical_context_error', 1);
        // Continue without historical context - non-fatal error
      }
    }

    // Enrich supported filings with web search context.
    // Providers: counterparty + governance (8-K), debt issuance (424B2/424B3/FWP),
    // earnings + capital return (8-K). Gated by tier (MAX-only) FIRST, then
    // PostHog flag + daily spend cap. Tier check is first so non-Max requests
    // never burn PostHog evaluations or budget for enrichment they can't see —
    // see review item 16A in tasks/x-search-max-only.md.
    // 10-K and 10-Q routing added 2026-05-17 per autoplan D2=B (PR1 polish
    // follow-up). The whyItMatters property description has always referenced
    // web-search enrichment context ("rates, spreads, consensus, peer context")
    // but the routing previously excluded earnings filings — making the
    // instruction dead for 10-K/10-Q. With the new per-form WIM guidance
    // explicitly leaning on this context, the routing is now wired through.
    // Cost: ~$0.003/filing × MAX-tier users on allowlisted tickers; latency:
    // up to 45s total / 20s per-provider budget (enforced inside runEnrichment).
    //
    // Lifetime Seat / Founding cohort note: Form 4 enrichment is delivered via
    // the x_sentiment branch below (broader HIGH_IMPORTANCE_FORMS set + S&P 500
    // ticker allowlist), not via the why-it-matters providers above. See ADR-0004.
    const ENRICHMENT_FORM_TYPES = new Set(['8-K', '8-K/A', '424B2', '424B3', 'FWP', '10-K', '10-K/A', '10-Q', '10-Q/A']);
    if (enrichmentApplied && ENRICHMENT_FORM_TYPES.has(filingRecordFromDB.formType) && !process.env.ENRICHMENT_FORCE_DISABLE) {
      const accession = filingRecordFromDB.accessionNumber || filingRecordFromDB.id || tickerSymbol || 'unknown';
      try {
        const flagEnabled = await isWhyItMattersEnabled(accession);
        if (!flagEnabled) {
          componentLogger.info('Enrichment flag off, skipping web-search', { accession });
        } else {
          // Budget enforcement is per-provider inside runSingleProvider via
          // tryDebitEnrichment(why_it_matters, ...) — atomic against Postgres,
          // idempotent on (envelope, dateIso, requestId), so retries can't
          // double-spend and concurrent isolates can't race past the cap.
          const enrichments = await getEnrichmentContext(
            processedContent,
            filingRecordFromDB.formType,
            filingRecordFromDB.companyName,
            tickerSymbol || 'UNKNOWN',
            { cacheKey: accession, accessionNumber: accession },
          );
          for (const ctx of enrichments) {
            enrichedContent += `\n\n${ctx}`;
            componentLogger.info(`Added enrichment context for ${tickerSymbol}`);
          }
        }
      } catch (enrichError) {
        componentLogger.warn(`Failed to fetch enrichment context: ${enrichError instanceof Error ? enrichError.message : String(enrichError)}`);
        monitoring.incrementCounter('ai.enrichment_context_error', 1);
      }
    }

    // X Sentiment enrichment runs on a wider form set (any high-importance form
    // for an allowlisted ticker) and uses xAI direct rather than OpenRouter, so
    // it lives outside the legacy ENRICHMENT_FORM_TYPES branch above. Eligibility,
    // budget, and F3 sanitization are enforced inside getXSentiment. Same MAX
    // tier gate as the why-it-matters branch above (review 16A).
    if (enrichmentApplied && tickerSymbol && tickerSymbol !== 'UNKNOWN' && !process.env.ENRICHMENT_FORCE_DISABLE) {
      const accession = filingRecordFromDB.accessionNumber || filingRecordFromDB.id || tickerSymbol;
      try {
        const topFlag = await isWhyItMattersEnabled(accession);
        const providerFlag = topFlag && (await isProviderEnabled('x_sentiment', accession));
        if (!providerFlag) {
          componentLogger.info('x_sentiment flag off, skipping', { accession });
        } else {
          const result = await getXSentiment({
            ticker: tickerSymbol,
            formType: filingRecordFromDB.formType,
            companyName: filingRecordFromDB.companyName,
            accessionNumber: accession,
          });
          if (result.enrichment) {
            enrichedContent += `\n\n${result.enrichment.formattedSection}`;
            capturedXSentiment = result.enrichment;
            componentLogger.info('Added x_sentiment enrichment', {
              ticker: tickerSymbol,
              direction: result.enrichment.sentiment.direction,
              confidence: result.enrichment.sentiment.confidence,
            });
          } else {
            componentLogger.info('x_sentiment skipped', { ticker: tickerSymbol, reason: result.skipReason });
          }
        }
      } catch (xErr) {
        componentLogger.warn(`x_sentiment enrichment failed: ${xErr instanceof Error ? xErr.message : String(xErr)}`);
        monitoring.incrementCounter('ai.x_sentiment_unhandled_error', 1);
      }
    }

    // Check if we need to chunk the document due to token limits
    const estimatedTokens = estimateTokenCount(enrichedContent);
    const maxTokenLimit = 180000; // xAI Grok's context window allows this with buffer for prompt

    let userPrompt: string;
    let systemPrompt: string;

    // Handle minimal content case specially
    if (processedDoc.isMinimalContent) {
      // For minimal content, we already generated a special prompt in processedContent
      // Use the unified prompts system prompt for JSON enforcement
      const prompts = promptGenerator.getPrompts('');
      systemPrompt = prompts.systemPrompt;
      userPrompt = enrichedContent; // Use enriched content which may include historical context
      componentLogger.info(`Using minimal content prompt for filing ${filingId || 'direct'} (${filingRecordFromDB.formType})`);
      monitoring.incrementCounter('ai.minimal_content_prompt_used', 1);
    } else if (estimatedTokens > maxTokenLimit) {
      // Document is too large, we need to truncate it further
      componentLogger.warn(`Document for filing ${filingId || 'direct'} exceeds token limit (${estimatedTokens} tokens). Truncating to ${maxTokenLimit} tokens.`);
      monitoring.incrementCounter('ai.document_truncated', 1);

      // Use the existing truncation function since we've already done smart processing in processDocumentContent
      const truncatedContent = truncateDocumentContent(enrichedContent, maxTokenLimit);
      const prompts = promptGenerator.getPrompts(truncatedContent);
      systemPrompt = prompts.systemPrompt;
      userPrompt = prompts.userPrompt;
    } else {
      // Document is within token limits - use unified prompts
      const prompts = promptGenerator.getPrompts(enrichedContent);
      systemPrompt = prompts.systemPrompt;
      userPrompt = prompts.userPrompt;
    }
    
    // Update the summary record to show we're processing (only if summaryId exists)
    if (summaryId) {
      await prisma.summary.update({
        where: { id: summaryId },
        data: {
          processingStatus: 'PROCESSING'
          // Let Prisma handle the updatedAt timestamp automatically
        }
      });
    }

    // Pre-LLM content gate (10-Q / 10-K / 20-F / 6-K).
    //
    // Refuse to invoke the LLM when the prepared excerpt lacks
    // financial-statement signal (no period header, no statement title,
    // no line items, no dollar density). The unified prompt instructs
    // the AI to emit literal "N/A" for unavailable values; downstream
    // normalizeCurrency turns those into "$NaN" and ships a misleading
    // scorecard.
    //
    // Throws a retriable SummarizationError so the worker's
    // exponential-backoff retry mechanism (1, 2, 4, 8, 16 minutes — see
    // JobQueueService.updateJobStatus at lib/job-queue/index.ts:457)
    // re-attempts on the theory that EDGAR may finish processing the
    // document body shortly after acceptance. After maxRetries the job
    // is marked FAILED and the email is never sent.
    //
    // Reproduces COIN 2026-05-07 regression: parser fed Grok only XBRL
    // namespace headers; Grok returned 6 rows of `value: "$NaN"`.
    if (requiresFinancialContent(filingRecordFromDB.formType)) {
      // Layer C C1: pass formType so the gate requires STATEMENT_TITLE_RE for
      // strict-financial forms (not the 3-of-5 generic threshold). Without this
      // arg the tightening is dead — iXBRL noise with dollar density + line
      // items can satisfy 3-of-5 without ever mentioning "Statements of Operations".
      const preGate = hasFinancialStatementSignal(enrichedContent, filingRecordFromDB.formType);
      if (!preGate.ok) {
        componentLogger.warn(
          `Pre-LLM content gate failed for ${filingRecordFromDB.formType} (summaryId=${summaryId || 'direct'}): ${preGate.reasons.join('; ')}`,
          { signals: preGate.signals }
        );
        monitoring.incrementCounter('ai.content_gate_pre_llm_failed', 1);
        if (summaryId) {
          await prisma.summary.update({
            where: { id: summaryId },
            data: {
              processingStatus: ProcessingStatus.INSUFFICIENT_CONTENT,
              processingCompletedAt: new Date(),
              isPartialResult: true,
              processingError: `Pre-LLM gate failed: ${preGate.reasons.join('; ')}`,
              processingTimeMs: Date.now() - startTime,
            },
          });
        }
        throw new SummarizationError(
          `Pre-LLM content gate failed for ${filingRecordFromDB.formType}: ${preGate.reasons.join('; ')}`,
          summaryId || 'unknown',
          filingRecordFromDB.formType,
          ErrorCode.AI_INSUFFICIENT_CONTENT,
          // Layer C C7: non-retriable on cache-read path. SummarizationError
          // assigns this directly (not from the isRetriableError global table),
          // so the per-throw flag must match. Cache reads return the same
          // bytes on retry; the retry budget is wasted.
          false,
          'insufficient_content'
        );
      }
    }

    // Configure the OpenRouter request
    // Phase 4: Include system prompt for bulletproof JSON enforcement
    const model = optionsModel || getDefaultModel();
    const requestOptions = {
      model,
      maxTokens: modelConfig.maxOutputTokens || 4000,
      temperature: modelConfig.temperature || 0.2, // Consistent 0.2 temperature for reliable output
      system: systemPrompt, // Phase 4: Unified prompts system message enforcing JSON output
      ...openRouterOptions
    };

    componentLogger.debug(`Using model ${model} for ${summaryId ? `summaryId=${summaryId}` : 'direct summarization'} with unified prompts`);

    try {
      // Call OpenRouter API to generate the summary
      // Phase 4: Now using system prompt + user prompt for bulletproof JSON output
      const response = await aiClient.sendMessage([
        {
          role: 'user',
          content: userPrompt
        }
      ], requestOptions);
      
      // Extract text content from the OpenRouter API response
      const summaryText = response.content;
      
      // Access token usage from OpenRouter response
      const inputTokens = response.usage?.inputTokens || 0;
      const outputTokens = response.usage?.outputTokens || 0;
      const cost = response.cost?.totalCost || 0;
      
      componentLogger.info(`Received response for ${summaryId ? `summaryId=${summaryId}` : 'direct summarization'}, length=${summaryText.length}, inputTokens=${inputTokens}, outputTokens=${outputTokens}`);
      monitoring.recordTiming('ai.response_time', Date.now() - startTime);
      monitoring.incrementCounter('ai.summarization_completed', 1);
      
      // Parse the response
      const parsingStartTime = Date.now();
      const parsedResult = parseResponse(summaryText, filingRecordFromDB.formType as SECFilingType, {
        normalize: true,
        collectMetrics: true,
        maxAttempts: 3 // Try multiple parsing attempts
      });
      const parsingDuration = Date.now() - parsingStartTime;
      
      // Validate that the parsed data has all required fields
      const validationResult = validateRequiredFields(
        parsedResult.data || {}, 
        filingRecordFromDB.formType as SECFilingType
      );
      
      if (parsedResult.success && parsedResult.data && validationResult.valid) {
        componentLogger.info(`Successfully parsed response for ${summaryId ? `summaryId=${summaryId}` : 'direct summarization'}, filingType=${filingRecordFromDB.formType}`);
        monitoring.recordTiming('ai.parsing_duration', Date.now() - parsingStartTime);
        monitoring.incrementCounter('ai.summarization_parsing_success', 1);

        // Post-parse grounding hooks (PR 1 wire-up). Mutate parsedResult.data
        // in place BEFORE composing summaryJSONWithSentiment so the redactions
        // flow into both the persisted record and the returned payload.
        // Order matters: whyItMatters coercion can drop the field on
        // restatement; ticker grounding then walks remaining prose and
        // redacts foreign-ticker contamination (e.g., "TSLA" mentioned in a
        // JPM filing). Both have env kill switches for fast rollback.
        if (process.env.DISABLE_WHY_IT_MATTERS_GROUNDING !== '1') {
          const beforeHasWhy = typeof (parsedResult.data as Record<string, unknown>).whyItMatters === 'string';
          coerceWhyItMatters(parsedResult.data as Record<string, unknown>, tickerSymbol);
          const afterHasWhy = typeof (parsedResult.data as Record<string, unknown>).whyItMatters === 'string';
          if (beforeHasWhy && !afterHasWhy) {
            componentLogger.warn(`whyItMatters dropped by coercion for ${summaryId ? `summaryId=${summaryId}` : 'direct summarization'}`, {
              formType: filingRecordFromDB.formType,
              accessionNumber: filingRecordFromDB.accessionNumber,
            });
            monitoring.incrementCounter('ai.why_it_matters_violation', 1);
          }
        }

        if (process.env.DISABLE_TICKER_GROUNDING !== '1') {
          const tickerViolations = validateTickerGroundingInPlace(
            parsedResult.data as Record<string, unknown>,
            tickerSymbol,
          );
          for (const v of tickerViolations) {
            componentLogger.warn(`ticker grounding violation: ${v.field} contained foreign tickers ${v.foreignTickers.join(',')} (expected ${tickerSymbol})`, {
              formType: filingRecordFromDB.formType,
              accessionNumber: filingRecordFromDB.accessionNumber,
              field: v.field,
              foreignTickers: v.foreignTickers,
            });
            monitoring.incrementCounter('ai.ticker_grounding_violation', 1, { field: v.field });
          }
        }

        // Numeric grounding (PR 2). Substring-checks every emitted dollar /
        // percent / share count against the SEC source doc; redacts to null
        // when absent. Critical because strict json_schema can force the
        // model to fill in fields it can't actually justify. Grounds against
        // processedContent ONLY (not enrichedContent) — values backed only
        // by web-search / historical-context enrichment WILL be redacted;
        // enrichment is for color, not numeric truth.
        const numericGrounding = validateNumericGrounding(
          parsedResult.data as Record<string, unknown>,
          processedContent,
          {
            formType: filingRecordFromDB.formType,
            chunked: processedDoc.isChunked,
          },
        );
        if (numericGrounding.rejectedFields.length > 0 || numericGrounding.unredactablePaths.length > 0) {
          componentLogger.info(
            `numeric_grounding: ${numericGrounding.rejectedFields.length} violations, ${numericGrounding.unredactablePaths.length} unredactable, durationMs=${numericGrounding.durationMs}, warnOnly=${numericGrounding.warnOnly}`,
            {
              formType: filingRecordFromDB.formType,
              accessionNumber: filingRecordFromDB.accessionNumber,
              paths: numericGrounding.rejectedFields.map((r) => r.path),
              unredactablePaths: numericGrounding.unredactablePaths,
              warnOnly: numericGrounding.warnOnly,
            },
          );
          for (const rej of numericGrounding.rejectedFields) {
            monitoring.incrementCounter('ai.numeric_grounding_violation', 1, {
              path: rej.path.split(/[.[]/)[0],
            });
          }
          for (const path of numericGrounding.unredactablePaths) {
            monitoring.incrementCounter('ai.numeric_grounding_violation_unredactable', 1, {
              path: path.split(/[.[]/)[0],
            });
          }
        }
        monitoring.recordTiming('ai.numeric_grounding_duration', numericGrounding.durationMs);

        // Producer-gate defense-in-depth: even if a model hallucinates
        // whyItMatters into the JSON without our enrichment context, scrub
        // it for non-Max requests. coerceWhyItMatters above is upstream and
        // can drop on restatement; this belt-and-braces removal guarantees
        // the persisted summaryJSON cannot carry MAX-only output for non-Max
        // users (Phase 4 of x-search-max-only).
        if (!enrichmentApplied) {
          const dataAsRecord = parsedResult.data as Record<string, unknown>;
          if ('whyItMatters' in dataAsRecord) {
            delete dataAsRecord.whyItMatters;
          }
        }

        const summaryJSONWithSentiment = capturedXSentiment
          ? { ...parsedResult.data, xSentiment: capturedXSentiment.sentiment }
          : parsedResult.data;

        // Post-LLM content gate (10-Q / 10-K / 20-F / 6-K).
        //
        // The LLM may return structurally valid JSON (passes parser
        // validation) where every financialHighlights row has a sentinel
        // value like "$NaN" / "N/A". Belt-and-suspenders with the pre-LLM
        // gate — catches cases where the excerpt LOOKED financial enough
        // to pass pre-gate but the AI couldn't extract usable numbers.
        // Marks as COMPLETED_WITH_WARNINGS so the downstream email gate
        // (read by the cron summary handler) skips the send.
        if (requiresFinancialContent(filingRecordFromDB.formType)) {
          // Layer C C6: pass summaryText so the gate also checks for failure
          // phrases ("no extractable", "are unavailable", etc.) — catches the
          // case where the LLM populated highlights but its prose contradicts
          // them (the NVDA 2026-05-20 failure mode).
          const postGate = hasUsableFinancialHighlights(
            parsedResult.data,
            parsedResult.data?.summary ?? null
          );
          if (!postGate.ok) {
            componentLogger.warn(
              `Post-LLM content gate failed for ${filingRecordFromDB.formType} (summaryId=${summaryId || 'direct'}): ${postGate.reasons.join('; ')}`,
              { signals: postGate.signals }
            );
            monitoring.incrementCounter('ai.content_gate_post_llm_failed', 1);
            if (summaryId) {
              await prisma.summary.update({
                where: { id: summaryId },
                data: {
                  summaryText: parsedResult.data.summary,
                  summaryJSON: summaryJSONWithSentiment,
                  processingStatus: 'COMPLETED_WITH_WARNINGS',
                  processingCompletedAt: new Date(),
                  isPartialResult: true,
                  processingError: `Post-LLM gate failed: ${postGate.reasons.join('; ')}`,
                  processingTimeMs: Date.now() - startTime,
                  tokensUsed: inputTokens + outputTokens,
                  model: response.model || getDefaultModel(),
                  modelVersion: response.model || getDefaultModel(),
                  promptVersion: 'v1.0',
                  cost,
                  attempts: 1,
                },
              });
            }
            return {
              summaryId: summaryId || undefined,
              summary: parsedResult.data.summary as string,
              summaryText: parsedResult.data.summary as string,
              summaryJSON: summaryJSONWithSentiment as Record<string, unknown>,
              keyPoints: (parsedResult.data.keyPoints || []) as string[],
              isPartial: true,
              parsingErrors: postGate.reasons,
              duration: Date.now() - startTime,
              modelUsed: response.model || getDefaultModel(),
              model: response.model || getDefaultModel(),
              inputTokens,
              outputTokens,
              tokensUsed: inputTokens + outputTokens,
              cost,
              processingTimeMs: Date.now() - startTime,
              attempts: 1,
            };
          }
        }

        // Update the summary record if summaryId exists
        if (summaryId) {
          await prisma.summary.update({
            where: { id: summaryId },
            data: {
              summaryText: parsedResult.data.summary,
              /**
               * Store structured JSON data for email templates to use
               * This eliminates the need for regex extraction fallbacks
               */
              summaryJSON: summaryJSONWithSentiment,
              processingStatus: 'COMPLETED',
              processingCompletedAt: new Date(),
              isPartialResult: false,
              processingTimeMs: Date.now() - startTime,
              tokensUsed: inputTokens + outputTokens,
              model: response.model || getDefaultModel(),
              modelVersion: response.model || getDefaultModel(),
              promptVersion: 'v1.0', // Track prompt version
              cost,
              attempts: 1,
              enrichmentApplied,
            }
          });

          componentLogger.info(`Stored summaryJSON for summaryId=${summaryId} with ${Object.keys(parsedResult.data).length} fields`);
        }
        
        return {
          summaryId: summaryId || undefined,
          summary: parsedResult.data.summary,
          summaryText: parsedResult.data.summary,
          summaryJSON: summaryJSONWithSentiment,
          keyPoints: parsedResult.data.keyPoints || [],
          duration: Date.now() - startTime,
          modelUsed: response.model || getDefaultModel(),
          model: response.model || getDefaultModel(),
          modelVersion: response.model || getDefaultModel(),
          promptVersion: 'v1.0',
          inputTokens,
          outputTokens,
          tokensUsed: inputTokens + outputTokens,
          cost,
          processingTimeMs: Date.now() - startTime,
          processingCompletedAt: new Date(),
          attempts: 1
        };
      } else {
        monitoring.recordTiming('ai.parsing_duration', parsingDuration);
        componentLogger.warn(`Failed to parse valid JSON from response for ${summaryId ? `summaryId=${summaryId}` : 'direct summarization'}, filingType=${filingRecordFromDB.formType}, errors=${parsedResult.errors?.join('; ')}, operationId=${operationId}`);
        monitoring.incrementCounter('ai.summarization_parsing_error', 1);
        
        // First try to fix the JSON by attempting to extract valid fields
        let fixedData: Record<string, unknown> = {};
        let validationResult = { valid: false, missingFields: [] as string[] };
        
        // Try to extract any valid JSON from the response
        try {
          // Look for JSON-like structures in the response
          const jsonPattern = /{[\s\S]*?}/g;
          const jsonMatches = summaryText.match(jsonPattern);
          
          if (jsonMatches) {
            // Try each match to see if any can be parsed as JSON
            for (const match of jsonMatches) {
              try {
                const parsed = JSON.parse(match);
                // Check if this parsed object has the required fields
                validationResult = validateRequiredFields(parsed, filingRecordFromDB.formType as SECFilingType);
                if (validationResult.valid) {
                  fixedData = parsed;
                  componentLogger.info(`Found valid JSON structure in response for ${filingRecordFromDB.formType}`);
                  break;
                } else {
                  // Merge any valid fields we found
                  Object.assign(fixedData, parsed);
                  componentLogger.debug(`Found partial JSON structure, missing fields: ${validationResult.missingFields.join(', ')}`);
                }
              } catch {
                // Continue to the next match if this one fails
                continue;
              }
            }
          }
        } catch (error) {
          componentLogger.error(`Error attempting to extract JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // If we couldn't extract valid JSON or it's missing required fields, use response-fixer
        if (!validationResult.valid) {
          const companyName = filingRecordFromDB.companyName ||
                           (filingRecordFromDB.ticker?.symbol ? `${filingRecordFromDB.ticker.symbol} Company` : 'Unknown Company');
          fixedData = ensureMinimumFields(summaryText, filingRecordFromDB.formType as SECFilingType, companyName);
          componentLogger.info(`Used fallback data generation for ${filingRecordFromDB.formType}`);
        }

        // Defense-in-depth: same scrub as the success path. The fallback fixer
        // doesn't normally produce whyItMatters, but extracted partial JSON
        // could carry it through, so guard the partial-result branch too.
        if (!enrichmentApplied && fixedData && 'whyItMatters' in fixedData) {
          delete (fixedData as Record<string, unknown>).whyItMatters;
        }

        // Update the summary record with the fixed data if summaryId exists
        if (summaryId) {
          await prisma.summary.update({
            where: { id: summaryId },
            data: {
              summaryText: fixedData.summary,
              processingStatus: 'COMPLETED_WITH_WARNINGS',
              processingCompletedAt: new Date(),
              isPartialResult: true,
              processingTimeMs: Date.now() - startTime,
              processingError: 'Fixed JSON response: ' + parsedResult.errors?.join('; '),
              tokensUsed: inputTokens + outputTokens,
              model: response.model || getDefaultModel(),
              modelVersion: response.model || getDefaultModel(),
              promptVersion: 'v1.0',
              cost,
              attempts: 1,
              enrichmentApplied,
            }
          });
        }
        
        const fixedDataWithSentiment = capturedXSentiment
          ? { ...fixedData, xSentiment: capturedXSentiment.sentiment }
          : fixedData;

        return {
          summaryId: summaryId || undefined,
          summary: fixedData.summary,
          summaryText: fixedData.summary,
          summaryJSON: fixedDataWithSentiment,
          keyPoints: fixedData.keyPoints || [],
          isPartial: true,
          parsingErrors: parsedResult.errors,
          duration: Date.now() - startTime,
          modelUsed: response.model || getDefaultModel(),
          model: response.model || getDefaultModel(),
          modelVersion: response.model || getDefaultModel(),
          promptVersion: 'v1.0',
          inputTokens,
          outputTokens,
          tokensUsed: inputTokens + outputTokens,
          cost,
          processingTimeMs: Date.now() - startTime,
          processingCompletedAt: new Date(),
          attempts: 1
        };
      }
    } catch (error) {
      componentLogger.error(`Error calling Claude API for ${filingId ? `filing ${filingId}` : 'direct summarization'}, ${summaryId ? `summary ${summaryId}` : ''}: ${error instanceof Error ? error.message : String(error)} (filingType: ${filingRecordFromDB.formType}, operationId: ${operationId})`);
      monitoring.incrementCounter('ai.summarization_error', 1);
      const isRetriable = error instanceof ApiError && error.isRetriable;
      const isRateLimit = error instanceof ApiError && error.code === ErrorCode.RATE_LIMITED;
      
      // Update the summary record if summaryId exists
      if (summaryId && (!isRetriable || (error instanceof ApiError && error.code === ErrorCode.RETRY_EXHAUSTED))) {
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            processingStatus: 'FAILED',
            processingError: `API call failed: ${error instanceof Error ? error.message : String(error)}`,
            processingErrorCode: error instanceof ApiError ? error.code : 'UNKNOWN_ERROR',
            processingTimeMs: Date.now() - startTime
          }
        });
      }
      
      throw new SummarizationError(
        `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
        summaryId || 'unknown',
        filingRecordFromDB.formType,
        error instanceof ApiError ? error.code : 'AI_ERROR',
        isRetriable || isRateLimit,
        error instanceof ApiError ? error.code : 'ai_error'
      );
    }
  } catch (error) {
    if (error instanceof SummarizationError) {
      throw error;
    }
    throw new SummarizationError(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
      summaryId || 'unknown',
      filingRecordFromDB?.formType || 'unknown',
      'SUMMARIZATION_FAILED',
      error instanceof ApiError && error.isRetriable,
      'unexpected_error'
    );
  }
}
