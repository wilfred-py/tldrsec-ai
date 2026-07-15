/**
 * Render helpers shared by the 10-K and 10-Q minimalist templates.
 *
 * Absorbs two former modules (lib/email/pill-pct.ts and lib/email/materiality.ts)
 * that each served the same two callers under different names. The split was a
 * hypothetical seam — one adapter, two callers, no leverage — so both are
 * folded here and co-located with the JSX that consumes them.
 *
 * Two responsibilities live behind the interface:
 *
 * 1. Percent-token pill wrapping (formerly pill-pct.ts). Post-processes the
 *    HTML output of `markdownToHtml` so inline "+12.3%" / "-3.9pp" tokens
 *    render as red/green/gray pill spans matching the scorecard visual.
 *
 * 2. Materiality signal extraction and badge mapping (formerly materiality.ts).
 *    Pulls the optional `materialitySignal` field out of a Summary.summaryJSON
 *    blob and maps it to a badge label + color key, or returns null so the
 *    caller falls back to the form-type label ("ANNUAL REPORT" / "QUARTERLY
 *    REPORT"). Also builds the "Wrong call?" mailto: feedback URL.
 *
 * The two responsibilities compose in the templates: percent pills annotate
 * prose fields, materiality badges annotate the header row. Callers never
 * reach past this interface.
 */

import { EmailColors } from '../design-system';

// ---------------------------------------------------------------------------
// Percent-token pill wrapping
// ---------------------------------------------------------------------------

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

/**
 * Match a numeric percentage token with optional leading sign.
 * - Optional sign: `+`, `-`, or `−` (Unicode minus)
 * - Digits with optional decimal
 * - Required unit: `%`, `pp`, `pts`, `point(s)`
 *
 * v13 bug fix: the previous version used `\b` after the unit to prevent
 * matches inside larger words like "happen". But `%` is a NON-word
 * character, so `\b` after `%` followed by a space (also non-word) never
 * fires — meaning EVERY `%` token in prose was silently failing to
 * match. Replaced with a negative lookahead that only rejects a
 * following alphabetic, so the unit can still be followed by spaces,
 * punctuation, or end-of-string.
 */
const PCT_TOKEN = /([+\-−])?(\d+(?:\.\d+)?)\s*(%|pp|pts?|points?)(?![a-zA-Z])/g;

/**
 * Wrap a single matched percentage token in a styled <span>.
 * Sign drives color: '+' → green, '-' / '−' → red, none → neutral.
 * pp / pts / points → display as `%` for consistency with scorecard pills.
 */
function buildPillSpan(sign: string | undefined, num: string, _unit: string): string {
  const isPos = sign === '+';
  const isNeg = sign === '-' || sign === '−';

  const bg = isPos
    ? EmailColors.semantic.pillPositiveBg
    : isNeg
      ? EmailColors.semantic.pillNegativeBg
      : EmailColors.semantic.pillNeutralBg;
  const fg = isPos
    ? EmailColors.semantic.pillPositiveFg
    : isNeg
      ? EmailColors.semantic.pillNegativeFg
      : EmailColors.semantic.pillNeutralFg;

  // Normalize the display sign: HTML `-` ASCII hyphen → en-dash for visual
  // consistency with the PillDelta component. Plus stays plus. No sign stays
  // no sign.
  const displaySign = isNeg ? '−' : isPos ? '+' : '';
  const display = `${displaySign}${num}%`;

  return (
    '<span style="' +
    'display:inline-block;' +
    `padding:2px 8px;` +
    'border-radius:4px;' +
    `background-color:${bg};` +
    `color:${fg};` +
    'font-weight:700;' +
    `font-family:${MONO_FONT.replace(/"/g, "'")};` +
    'font-size:12px;' +
    'letter-spacing:0.2px;' +
    'font-variant-numeric:tabular-nums;' +
    'white-space:nowrap;' +
    '">' +
    display +
    '</span>'
  );
}

/**
 * Replace percentage tokens inside text-content segments of an HTML string
 * with pill-styled spans. Tag content (between `<` and `>`) is preserved
 * verbatim, so existing `<a href="...">`, `<strong>`, etc. are untouched.
 *
 * The split-on-tag-boundary approach is safe because we only mutate text
 * runs. Empty input returns empty string.
 */
export function wrapPercentsInPills(html: string): string {
  if (!html) return html;

  // Split on tag boundaries: keep tags untouched, replace inside text runs.
  // Pattern: greedy match of either a tag `<...>` or a text run `[^<]+`.
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_match, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag;
    if (!text) return '';
    return text.replace(PCT_TOKEN, (m, sign, num, unit) => buildPillSpan(sign, num, unit));
  });
}

// ---------------------------------------------------------------------------
// Materiality signal + badge
// ---------------------------------------------------------------------------

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
