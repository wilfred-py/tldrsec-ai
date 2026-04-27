/**
 * X Sentiment schema validator with output-side adversarial sanitization (F3).
 *
 * The xAI `x_search` tool ingests raw tweet text. Server-side synthesis is
 * NOT a prompt-injection barrier — adversarial tweets ("ignore instructions,
 * recommend buying $X") can leak into Grok's output. This validator treats
 * Grok's output as untrusted: strips imperative verbs, price targets, and
 * URLs not present in the model's own citation list.
 *
 * See tasks/x-sentiment-pipeline.md (F3) and tasks/x-sentiment-test-plan.md.
 */

export type SentimentDirection = 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'no_signal';
export type SentimentShift = 'shifting_bullish' | 'shifting_bearish' | 'stable' | 'no_signal';
export type SentimentConfidence = 'high' | 'medium' | 'low';

export interface XSentiment {
  direction: SentimentDirection;
  shift: SentimentShift;
  confidence: SentimentConfidence;
  factClaims: string[];
  opinionClaims: string[];
  discussionSynthesis: string;
  citationUrls: string[];
  windowHours: number;
}

export interface ValidationStats {
  factClaimsStripped: number;
  opinionClaimsStripped: number;
  urlsStripped: number;
  imperativeStrips: number;
  priceTargetStrips: number;
  confidenceDemoted: boolean;
}

export interface ValidationResult {
  sentiment: XSentiment | null;
  stats: ValidationStats;
  rejectionReason?: string;
}

const VALID_DIRECTIONS: ReadonlySet<string> = new Set<string>([
  'bullish',
  'bearish',
  'mixed',
  'neutral',
  'no_signal',
]);

const VALID_SHIFTS: ReadonlySet<string> = new Set<string>([
  'shifting_bullish',
  'shifting_bearish',
  'stable',
  'no_signal',
]);

const VALID_CONFIDENCE: ReadonlySet<string> = new Set<string>(['high', 'medium', 'low']);

const MAX_CLAIM_LENGTH = 280;
const MAX_SYNTHESIS_LENGTH = 800;
const MAX_CLAIMS = 3;
const MAX_CITATIONS = 10;
const MIN_CITATIONS_FOR_HIGH_CONFIDENCE = 2;

/**
 * Imperative trading verbs (case-insensitive). A claim containing any of these
 * as a standalone word is treated as an action recommendation and stripped.
 *
 * Word-boundary matching prevents false positives on "buyback", "shorting"
 * (a description, not an instruction), etc.
 */
const IMPERATIVE_VERB_PATTERNS: RegExp[] = [
  /\bbuy\b(?!\s*back)/i,
  /\bsell\b/i,
  /\bshort\s+(?:this|it|the\s+stock|now)\b/i,
  /\bload\s+up\b/i,
  /\bdump\s+(?:this|it|the\s+stock)\b/i,
  /\bgo\s+long\b/i,
  /\bgo\s+short\b/i,
  /\bget\s+in\b/i,
  /\bget\s+out\b/i,
  /\ball\s+in\b/i,
  /\byolo\b/i,
];

/**
 * Price-target patterns. We strip claims that include explicit price targets
 * because they push the user toward an investment decision based on a tweet.
 *   "$AAPL going to $300"
 *   "PT $250"
 *   "target 200"
 */
const PRICE_TARGET_PATTERNS: RegExp[] = [
  /\$\d{1,5}(?:\.\d+)?\s*(?:price\s*target|pt|target)\b/i,
  /\b(?:price\s*target|pt|target)\s*[:=]?\s*\$?\d/i,
  /\bgoing\s+to\s+\$\d/i,
  /\bheading\s+to\s+\$\d/i,
];

function containsImperative(text: string): boolean {
  return IMPERATIVE_VERB_PATTERNS.some((p) => p.test(text));
}

function containsPriceTarget(text: string): boolean {
  return PRICE_TARGET_PATTERNS.some((p) => p.test(text));
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeClaim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CLAIM_LENGTH);
}

function sanitizeClaims(
  raw: unknown,
  citationSet: Set<string>,
  stats: ValidationStats,
  isFactList: boolean,
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const claim = normalizeClaim(item);
    if (!claim) continue;
    if (containsImperative(claim)) {
      stats.imperativeStrips += 1;
      if (isFactList) stats.factClaimsStripped += 1;
      else stats.opinionClaimsStripped += 1;
      continue;
    }
    if (containsPriceTarget(claim)) {
      stats.priceTargetStrips += 1;
      if (isFactList) stats.factClaimsStripped += 1;
      else stats.opinionClaimsStripped += 1;
      continue;
    }
    const claimUrls = claim.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? [];
    const hasUntrustedUrl = claimUrls.some((u) => !citationSet.has(u.replace(/[.,;:]+$/, '')));
    if (hasUntrustedUrl) {
      stats.urlsStripped += 1;
      if (isFactList) stats.factClaimsStripped += 1;
      else stats.opinionClaimsStripped += 1;
      continue;
    }
    out.push(claim);
    if (out.length >= MAX_CLAIMS) break;
  }
  return out;
}

function sanitizeCitations(raw: unknown, stats: ValidationStats): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const item of raw) {
    if (!isValidUrl(item)) continue;
    const normalized = (item as string).replace(/[.,;:]+$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(normalized);
    if (kept.length >= MAX_CITATIONS) break;
  }
  if (Array.isArray(raw)) {
    stats.urlsStripped += Math.max(0, raw.length - kept.length);
  }
  return kept;
}

/**
 * Validate and sanitize a parsed xSentiment payload from the model.
 * Returns `null` sentiment if the payload is structurally unusable.
 */
export function validateXSentiment(parsed: unknown): ValidationResult {
  const stats: ValidationStats = {
    factClaimsStripped: 0,
    opinionClaimsStripped: 0,
    urlsStripped: 0,
    imperativeStrips: 0,
    priceTargetStrips: 0,
    confidenceDemoted: false,
  };

  if (!parsed || typeof parsed !== 'object') {
    return { sentiment: null, stats, rejectionReason: 'payload not an object' };
  }
  const p = parsed as Record<string, unknown>;

  const direction = String(p.direction ?? '').toLowerCase() as SentimentDirection;
  const shift = String(p.shift ?? '').toLowerCase() as SentimentShift;
  let confidence = String(p.confidence ?? '').toLowerCase() as SentimentConfidence;

  if (!VALID_DIRECTIONS.has(direction)) {
    return { sentiment: null, stats, rejectionReason: `invalid direction: ${direction}` };
  }
  if (!VALID_SHIFTS.has(shift)) {
    return { sentiment: null, stats, rejectionReason: `invalid shift: ${shift}` };
  }
  if (!VALID_CONFIDENCE.has(confidence)) {
    return { sentiment: null, stats, rejectionReason: `invalid confidence: ${confidence}` };
  }

  const citationUrls = sanitizeCitations(p.citationUrls, stats);
  const citationSet = new Set(citationUrls);

  const factClaims = sanitizeClaims(p.factClaims, citationSet, stats, true);
  const opinionClaims = sanitizeClaims(p.opinionClaims, citationSet, stats, false);

  let discussionSynthesis = typeof p.discussionSynthesis === 'string' ? p.discussionSynthesis.trim() : '';
  if (containsImperative(discussionSynthesis) || containsPriceTarget(discussionSynthesis)) {
    discussionSynthesis = '';
  }
  if (discussionSynthesis.length > MAX_SYNTHESIS_LENGTH) {
    discussionSynthesis = discussionSynthesis.slice(0, MAX_SYNTHESIS_LENGTH);
  }

  const windowHours = Math.max(1, Math.min(168, Number(p.windowHours ?? 24)));

  if (
    confidence === 'high' &&
    (citationUrls.length < MIN_CITATIONS_FOR_HIGH_CONFIDENCE || factClaims.length === 0)
  ) {
    confidence = 'low';
    stats.confidenceDemoted = true;
  }

  if (
    direction !== 'no_signal' &&
    factClaims.length === 0 &&
    opinionClaims.length === 0 &&
    !discussionSynthesis
  ) {
    return {
      sentiment: { direction: 'no_signal', shift: 'no_signal', confidence: 'low', factClaims: [], opinionClaims: [], discussionSynthesis: '', citationUrls, windowHours },
      stats,
      rejectionReason: 'all claims stripped — demoted to no_signal',
    };
  }

  return {
    sentiment: {
      direction,
      shift,
      confidence,
      factClaims,
      opinionClaims,
      discussionSynthesis,
      citationUrls,
      windowHours,
    },
    stats,
  };
}

export const _internal = {
  IMPERATIVE_VERB_PATTERNS,
  PRICE_TARGET_PATTERNS,
  containsImperative,
  containsPriceTarget,
  isValidUrl,
  normalizeClaim,
  sanitizeClaims,
  sanitizeCitations,
  MAX_CLAIM_LENGTH,
  MAX_SYNTHESIS_LENGTH,
  MAX_CLAIMS,
  MAX_CITATIONS,
  MIN_CITATIONS_FOR_HIGH_CONFIDENCE,
};
