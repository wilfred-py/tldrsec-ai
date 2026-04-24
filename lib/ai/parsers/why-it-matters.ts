/**
 * whyItMatters field post-processing.
 *
 * Enforces a two-state contract: either a valid non-empty string that adds
 * context beyond the headline/summary, OR the field is absent entirely.
 *
 * Rejection rules (W1.3):
 * 1. Any 10+ consecutive-word window from whyItMatters appears verbatim
 *    (case-insensitive) in summary or headline.
 * 2. >=60% of the headline's distinct content words (minus stopwords, ticker,
 *    filing-type words) also appear in whyItMatters.
 *
 * Rejected or empty values cause the field to be deleted from the parsed
 * object, letting templates fall back to hardcoded copy via one check.
 */

const CONSECUTIVE_WINDOW_SIZE = 10;
const HEADLINE_OVERLAP_THRESHOLD = 0.6;
/** Minimum useful length. Below this, the field is too short to add context. */
const MIN_LENGTH = 40;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
  'their', 'his', 'her', 'our', 'not', 'no', 'than', 'then', 'so', 'if',
  'about', 'into', 'over', 'under', 'after', 'before', 'more', 'most', 'some',
  'any', 'all', 'each', 'new', 'per', 'up', 'down', 'out', 'off', 'via',
]);

const FILING_TYPE_WORDS = new Set([
  'form', 'filing', 'report', 'statement', 'prospectus', 'schedule',
  '10-k', '10-q', '8-k', '424b2', '424b', 's-1', 's-3', 'sc', 'def', '14a',
  '13g', '13d', 'defa14a', 'fwp', '11-k', '20-f', '6-k',
]);

/** Lowercase, strip punctuation, split on whitespace. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Build set of "content words" from text: tokens minus stopwords/filing words/ticker. */
function contentWords(text: string, ticker?: string): Set<string> {
  const tickerLower = ticker?.toLowerCase();
  const out = new Set<string>();
  for (const tok of tokenize(text)) {
    if (tok.length < 2) continue;
    if (STOPWORDS.has(tok)) continue;
    if (FILING_TYPE_WORDS.has(tok)) continue;
    if (tickerLower && tok === tickerLower) continue;
    out.add(tok);
  }
  return out;
}

/** Check if any N-consecutive-word window from needle appears verbatim in haystack. */
function hasConsecutiveOverlap(needle: string, haystack: string, windowSize: number): boolean {
  const needleTokens = tokenize(needle);
  if (needleTokens.length < windowSize) return false;

  const haystackText = tokenize(haystack).join(' ');
  if (!haystackText) return false;

  for (let i = 0; i <= needleTokens.length - windowSize; i++) {
    const window = needleTokens.slice(i, i + windowSize).join(' ');
    if (haystackText.includes(window)) return true;
  }
  return false;
}

/** Fraction of headline's content words that reappear in whyItMatters. */
function headlineOverlapRatio(whyItMatters: string, headline: string, ticker?: string): number {
  const headlineWords = contentWords(headline, ticker);
  if (headlineWords.size === 0) return 0;

  const whyWords = contentWords(whyItMatters, ticker);
  let shared = 0;
  for (const w of headlineWords) {
    if (whyWords.has(w)) shared++;
  }
  return shared / headlineWords.size;
}

export interface RestatementCheckInput {
  whyItMatters: string;
  summary?: string;
  headline?: string;
  ticker?: string;
}

/**
 * Returns true if whyItMatters substantially restates headline or summary.
 * See module docstring for the two rejection rules.
 */
export function isRestatement(input: RestatementCheckInput): boolean {
  const { whyItMatters, summary, headline, ticker } = input;
  const trimmed = whyItMatters.trim();
  if (!trimmed) return false;

  if (summary && hasConsecutiveOverlap(trimmed, summary, CONSECUTIVE_WINDOW_SIZE)) {
    return true;
  }
  if (headline && hasConsecutiveOverlap(trimmed, headline, CONSECUTIVE_WINDOW_SIZE)) {
    return true;
  }

  if (headline) {
    const ratio = headlineOverlapRatio(trimmed, headline, ticker);
    if (ratio >= HEADLINE_OVERLAP_THRESHOLD) return true;
  }

  return false;
}

/**
 * Two-state contract: mutates `data` in place, deleting `whyItMatters` if:
 * - missing / not a string
 * - empty or whitespace-only
 * - under the MIN_LENGTH floor
 * - fails the restatement guard
 *
 * Otherwise, trims the string and leaves it in place.
 */
export function coerceWhyItMatters(data: Record<string, unknown>, ticker?: string): void {
  const raw = data.whyItMatters;
  if (typeof raw !== 'string') {
    delete data.whyItMatters;
    return;
  }
  const trimmed = raw.trim();
  if (trimmed.length < MIN_LENGTH) {
    delete data.whyItMatters;
    return;
  }

  const summary = typeof data.summary === 'string' ? data.summary : undefined;
  const headline = typeof data.headline === 'string' ? data.headline : undefined;

  if (isRestatement({ whyItMatters: trimmed, summary, headline, ticker })) {
    delete data.whyItMatters;
    return;
  }

  data.whyItMatters = trimmed;
}
