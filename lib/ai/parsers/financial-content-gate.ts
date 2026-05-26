/**
 * Financial-content gates for 10-Q / 10-K filings.
 *
 * Two gates, both pure functions:
 *
 * 1. PRE-LLM: `hasFinancialStatementSignal(text)` — verifies the prepared
 *    excerpt sent to the LLM actually contains financial-statement content.
 *    Catches the COIN-style failure where the parser fed Grok only XBRL
 *    headers ("XBRL namespaces but lacks detailed financial statements"),
 *    causing six rows of `value: "N/A"` to be emitted per the prompt's
 *    sentinel contract.
 *
 * 2. POST-LLM: `hasUsableFinancialHighlights(data)` — validates the LLM
 *    output before persisting. Combines presence + `isUsableMetricRow`
 *    filter so summaries that came back all-"$NaN" are flagged as partial
 *    rather than COMPLETED.
 *
 * Design assumption (per product owner): every 10-Q and 10-K filing has
 * extractable financial data. If our pipeline produces a summary that lacks
 * it, that's a parser/extraction failure — the email must NOT ship.
 */
import { isUsableMetricRow } from '../../../components/ui/email/design-system';

export interface ContentGateResult {
  ok: boolean;
  /** Human-readable reasons (for logging / monitoring). */
  reasons: string[];
  /**
   * Per-criterion pass/fail map for observability — exposed so callers can
   * emit structured monitoring counters without re-parsing reason strings.
   */
  signals: Record<string, boolean>;
}

// Regexes scoped to common SEC filing income-statement vocabulary. Anchored
// case-insensitive matches on word boundaries — `/i` is safe here because
// none of these tokens overlap with a verb that would false-positive.

const PERIOD_HEADER_RE =
  /\b(?:three|six|nine|twelve)\s+months?\s+ended\b|\byear\s+ended\b|\bfiscal\s+year\s+ended\b/i;

const STATEMENT_TITLE_RE =
  /(?:condensed\s+)?(?:consolidated\s+)?(?:statements?\s+of\s+(?:operations|income|comprehensive\s+income|cash\s+flows?|stockholders?[’']?\s+equity)|balance\s+sheets?|income\s+statements?)/i;

// Distinct income-statement line items. Each must appear at least once for
// it to count toward the line-item criterion.
const LINE_ITEMS = [
  /\btotal\s+revenues?\b/i,
  /\bnet\s+revenues?\b/i,
  /(?<!revenue\s)\brevenues?\b(?!\s+per)/i, // bare "revenue" / "revenues"
  /\bnet\s+income\b/i,
  /\bnet\s+loss\b/i,
  /\boperating\s+(?:income|loss)\b/i,
  /\bgross\s+(?:profit|margin)\b/i,
  /\bcost\s+of\s+(?:revenues?|sales|services|goods)\b/i,
  /\bearnings\s+per\s+share\b|\bdiluted\s+(?:eps|earnings\s+per\s+share)\b/i,
  /\b(?:basic|diluted)\s+share/i,
];

// Dollar-figure token. Matches $1,234, $1.23, $1.2B, $1.2 million, etc.
// We deliberately don't match bare "1,234,567" without $ to avoid catching
// CIK numbers and other XBRL identifier noise that would defeat the gate.
const DOLLAR_FIGURE_RE =
  /\$\s?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:[KMBT]\b|billion|million|thousand|trillion)?/gi;

const MIN_TEXT_LENGTH = 3000;
const MIN_DISTINCT_LINE_ITEMS = 2;
const MIN_DOLLAR_FIGURES = 10;
const REQUIRED_SIGNALS = 3; // out of 5 below

/**
 * Pre-LLM content gate. Returns ok=true iff the prepared excerpt has
 * enough financial-statement signal that it's worth spending an LLM call.
 *
 * The COIN failure produced an excerpt of pure XBRL namespaces + CIK
 * identifiers — no period headers, no statement titles, no line items,
 * no dollar figures, and short. That excerpt scores 0/5 and is rejected.
 *
 * Layer C tightens this gate for strict-financial forms: pass
 * `formType` to require `STATEMENT_TITLE_RE` (was previously 1-of-5
 * optional). Plain iXBRL noise frequently contains dollar density +
 * common line-item words without ever mentioning "Statements of
 * Operations" or "Balance Sheets" — the title is the most reliable
 * signal that real financial-statement structure is present.
 */
export function hasFinancialStatementSignal(
  text: string | null | undefined,
  formType?: string | null
): ContentGateResult {
  const reasons: string[] = [];
  const signals: Record<string, boolean> = {
    hasPeriodHeader: false,
    hasStatementTitle: false,
    hasLineItems: false,
    hasDollarDensity: false,
    hasMinimumLength: false,
  };

  if (typeof text !== 'string' || text.length === 0) {
    return {
      ok: false,
      reasons: ['empty or non-string input'],
      signals,
    };
  }

  signals.hasMinimumLength = text.length >= MIN_TEXT_LENGTH;
  if (!signals.hasMinimumLength) {
    reasons.push(`text length ${text.length} < ${MIN_TEXT_LENGTH}`);
  }

  signals.hasPeriodHeader = PERIOD_HEADER_RE.test(text);
  if (!signals.hasPeriodHeader) {
    reasons.push('no period header (Three/Six/Nine/Twelve Months Ended, Year Ended)');
  }

  signals.hasStatementTitle = STATEMENT_TITLE_RE.test(text);
  if (!signals.hasStatementTitle) {
    reasons.push('no financial-statement title (Statements of Operations / Balance Sheets / etc.)');
  }

  const distinctLineItems = LINE_ITEMS.reduce((n, re) => (re.test(text) ? n + 1 : n), 0);
  signals.hasLineItems = distinctLineItems >= MIN_DISTINCT_LINE_ITEMS;
  if (!signals.hasLineItems) {
    reasons.push(`only ${distinctLineItems} distinct line items found (need ${MIN_DISTINCT_LINE_ITEMS})`);
  }

  const dollarMatches = text.match(DOLLAR_FIGURE_RE);
  const dollarCount = dollarMatches ? dollarMatches.length : 0;
  signals.hasDollarDensity = dollarCount >= MIN_DOLLAR_FIGURES;
  if (!signals.hasDollarDensity) {
    reasons.push(`only ${dollarCount} dollar-figure tokens found (need ${MIN_DOLLAR_FIGURES})`);
  }

  const passingSignals = Object.values(signals).filter(Boolean).length;
  let ok = passingSignals >= REQUIRED_SIGNALS;

  // C1: for strict-financial forms (10-K, 10-Q, 20-F, 6-K, and amendments),
  // require STATEMENT_TITLE_RE specifically. The 3-of-5 generic threshold can
  // be satisfied by dollar density + line items + length alone — true for any
  // iXBRL tag soup that mentions revenue tags, even when no actual statement
  // structure is present. The statement title is the most reliable signal.
  if (ok && formType && requiresFinancialContent(formType) && !signals.hasStatementTitle) {
    ok = false;
    reasons.push(
      `strict-financial form ${formType} requires hasStatementTitle (Layer C C1)`
    );
  }

  return { ok, reasons, signals };
}

/**
 * Phrases the LLM emits when it can't extract structured financial data
 * but doesn't outright refuse. After Layer C, any of these in the summary
 * text signals that the post-LLM gate should fail even if
 * `financialHighlights` happens to be populated — the prose itself
 * contradicts the structured data.
 *
 * Pattern is case-insensitive and matches the language Grok produced on
 * the NVDA 2026-05-20 failure ("no extractable quarterly financial
 * results", "Key metrics… are unavailable") plus the language emitted by
 * `generateMinimalContentPrompt` in summarize.ts ("acknowledge the
 * limited information available").
 */
const SUMMARY_FAILURE_PHRASES_RE =
  /\b(?:no extractable|are unavailable|minimal or no|could not be fully extracted|limited information available)\b/i;

export function summaryHasFailurePhrase(summaryText: string | null | undefined): {
  matched: boolean;
  matchedPhrase: string | null;
} {
  if (typeof summaryText !== 'string' || summaryText.length === 0) {
    return { matched: false, matchedPhrase: null };
  }
  const match = summaryText.match(SUMMARY_FAILURE_PHRASES_RE);
  return { matched: match !== null, matchedPhrase: match ? match[0] : null };
}

/**
 * Post-LLM content gate. Returns ok=true iff the parsed `financialHighlights`
 * array has at least one row that passes `isUsableMetricRow` (i.e. label +
 * value present, value not a sentinel like "$NaN" / "N/A" / "null").
 *
 * Required for 10-Q and 10-K: per product contract, these filings always
 * contain numeric financial data. Zero usable rows means the LLM output
 * is unfit for the email scorecard.
 *
 * Layer C C6: also checks `summaryText` for known failure phrases
 * (see SUMMARY_FAILURE_PHRASES_RE). When matched, signals `hasFailurePhrase`
 * = false (gate fails) AND records the matched phrase in reasons so the
 * caller can surface it in observability.
 */
export function hasUsableFinancialHighlights(
  data: unknown,
  summaryText?: string | null
): ContentGateResult {
  const reasons: string[] = [];
  const signals: Record<string, boolean> = {
    arrayPresent: false,
    arrayNonEmpty: false,
    hasUsableRow: false,
  };

  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      reasons: ['parsed data missing or not an object'],
      signals,
    };
  }

  const fh = (data as { financialHighlights?: unknown }).financialHighlights;
  signals.arrayPresent = Array.isArray(fh);
  if (!signals.arrayPresent) {
    reasons.push('financialHighlights field missing or not an array');
    return { ok: false, reasons, signals };
  }

  const arr = fh as unknown[];
  signals.arrayNonEmpty = arr.length > 0;
  if (!signals.arrayNonEmpty) {
    reasons.push('financialHighlights array is empty');
    return { ok: false, reasons, signals };
  }

  const usable = arr.filter((row) =>
    isUsableMetricRow(row as Parameters<typeof isUsableMetricRow>[0])
  );
  signals.hasUsableRow = usable.length > 0;
  if (!signals.hasUsableRow) {
    reasons.push(
      `${arr.length} rows, 0 usable — every value is a sentinel (e.g. "$NaN" / "N/A" / "null")`
    );
  }

  // C6: summary-text failure-phrase check. Catches the case where the LLM
  // populated financialHighlights with apparent values but its prose
  // simultaneously admits the extraction failed. Trust the prose — if it
  // says "are unavailable," don't ship.
  const phraseCheck = summaryHasFailurePhrase(summaryText);
  signals.hasNoFailurePhrase = !phraseCheck.matched;
  if (phraseCheck.matched) {
    reasons.push(
      `summary text contains failure phrase "${phraseCheck.matchedPhrase}" — LLM admitted extraction failure`
    );
  }

  const ok = signals.hasUsableRow && signals.hasNoFailurePhrase;
  return { ok, reasons, signals };
}

/**
 * Form types where financial-data presence is a hard product requirement.
 * Pre- and post-LLM gates only fire for these.
 */
const STRICT_FINANCIAL_FORMS = new Set(['10-K', '10-Q', '20-F', '6-K', '10-K/A', '10-Q/A']);

export function requiresFinancialContent(formType: string | null | undefined): boolean {
  if (!formType) return false;
  return STRICT_FINANCIAL_FORMS.has(formType.toUpperCase());
}
