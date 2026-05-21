/**
 * Materiality signal helpers for 10-K / 10-Q email rendering.
 *
 * The materialitySignal field is OPTIONAL in `FORM_SCHEMAS['10-K'|'10-Q']`
 * (autoplan Decision #4 — keeping it required would create a JSON-schema
 * rejection cliff). When absent, we default to `{ score: 'noise', rationale }`
 * so the rendering layer never needs to null-check.
 *
 * Rubric validated at 76.7% accuracy on 30-filing labeled set
 * (`scripts/materiality-calibration/`, gate ≥75%). See
 * `lib/ai/calibration/materiality-rubric.ts` for the production rubric.
 */

export type MaterialityScore = 'high' | 'medium' | 'low' | 'noise';

export interface MaterialitySignal {
  score: MaterialityScore;
  rationale: string;
}

const VALID_SCORES: ReadonlySet<MaterialityScore> = new Set([
  'high',
  'medium',
  'low',
  'noise',
]);

const DEFAULT_SIGNAL: MaterialitySignal = {
  score: 'noise',
  rationale: 'Filing did not produce a materiality signal.',
};

/**
 * Pull `materialitySignal` out of a Summary.summaryJSON blob (or any unknown
 * input). Returns the default noise signal on any malformed input — never
 * throws, never returns null.
 *
 * Reasons we get DEFAULT_SIGNAL:
 * - summaryJSON is null/undefined (filing predates rollout, no schema field)
 * - summaryJSON has no `materialitySignal` key (model didn't produce one)
 * - materialitySignal has an invalid shape (score enum mismatch, etc.)
 *
 * This is by design — the rendering layer should never break on the
 * materiality field. A "noise" default cleanly suppresses the badge.
 */
export function extractMaterialitySignal(summaryJSON: unknown): MaterialitySignal {
  if (!summaryJSON || typeof summaryJSON !== 'object') {
    return DEFAULT_SIGNAL;
  }
  const candidate = (summaryJSON as Record<string, unknown>).materialitySignal;
  if (!candidate || typeof candidate !== 'object') {
    return DEFAULT_SIGNAL;
  }
  const c = candidate as Record<string, unknown>;
  const score = typeof c.score === 'string' ? c.score.toLowerCase().trim() : '';
  const rationale = typeof c.rationale === 'string' ? c.rationale.trim() : '';
  if (!VALID_SCORES.has(score as MaterialityScore) || rationale.length === 0) {
    return DEFAULT_SIGNAL;
  }
  return {
    score: score as MaterialityScore,
    rationale,
  };
}

/**
 * Map a MaterialityScore to a BadgeColors key in `design-system.ts`.
 *
 * - high   → amber (BadgeColors.high)        — most-material signal
 * - medium → indigo (BadgeColors.moderate)   — worth monitoring
 * - low    → slate (BadgeColors.low)         — routine
 * - noise  → null                            — caller suppresses the badge
 *
 * Returning null for noise is deliberate: per autoplan Design Pass 1
 * (Decision #15), reuse the existing FormPlusMaterialityBadgeRow `signal`
 * slot instead of double-rendering a separate badge. Callers fall back to
 * the form-type label (e.g. 'ANNUAL REPORT' / 'QUARTERLY REPORT') when
 * materiality is noise.
 */
export type MaterialityBadgeColorKey = 'high' | 'moderate' | 'low';

export interface MaterialityBadge {
  label: string;
  colorKey: MaterialityBadgeColorKey;
}

export function materialityToBadge(signal: MaterialitySignal): MaterialityBadge | null {
  switch (signal.score) {
    case 'high':
      return { label: 'HIGH MATERIALITY', colorKey: 'high' };
    case 'medium':
      return { label: 'MEDIUM MATERIALITY', colorKey: 'moderate' };
    case 'low':
      return { label: 'LOW MATERIALITY', colorKey: 'low' };
    case 'noise':
    default:
      return null;
  }
}

/**
 * Build the mailto: feedback URL rendered under the badge. The link lets
 * a reader flag a wrong materiality call in one click — the cheapest
 * possible quality signal per autoplan Decision #10 (CEO Section 8
 * "Observability: missing user-quality feedback loop").
 *
 * Use a generic mailbox; subject encodes ticker + form + accession for
 * downstream tracking. Body is empty so the user can describe in their own
 * words (or just hit send).
 */
export function buildMaterialityFeedbackMailto(opts: {
  ticker: string;
  formType: string;
  accessionNumber?: string;
  to?: string;
}): string {
  const to = opts.to ?? 'materiality-feedback@tldrsec.com';
  const subject = `Materiality feedback: ${opts.ticker} ${opts.formType}${opts.accessionNumber ? ` (${opts.accessionNumber})` : ''}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`;
}
