/**
 * Wrap inline percentage tokens in colored pill-styled spans so the email
 * body reads with the same red/green/gray semantics as the financial
 * scorecard. Applied to summary prose, story narratives, watch-for items,
 * and the whyItMatters string before render.
 *
 * Rules:
 * - `+12.3%` → green pill
 * - `-3.9%` / `−3.9pp` → red pill
 * - `65%` (no sign) → neutral gray pill (we can't infer direction from a
 *   bare magnitude, but the user gets a visual chip either way)
 * - `pp` / `pts` / `points` units → normalized to `%` for visual
 *   consistency with the scorecard pills
 *
 * Implementation: post-processes the HTML output of `markdownToHtml`. The
 * regex only matches percentage tokens that appear in text content (between
 * `>` and `<`); attribute values and existing tags pass through untouched.
 * This is safe to chain with markdown-rendered output because markdown
 * doesn't emit raw HTML attributes containing `%\d` patterns.
 */

import { EmailColors } from '../../components/ui/email/design-system';

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

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
    `padding:1px 6px;` +
    'border-radius:3px;' +
    `background-color:${bg};` +
    `color:${fg};` +
    'font-weight:700;' +
    `font-family:${MONO_FONT.replace(/"/g, "'")};` +
    'font-size:11px;' +
    'letter-spacing:0.2px;' +
    'font-variant-numeric:tabular-nums;' +
    'white-space:nowrap;' +
    '">' +
    display +
    '</span>'
  );
}

/**
 * Match a numeric percentage token with optional leading sign.
 * - Optional sign: `+`, `-`, or `−` (Unicode minus)
 * - Digits with optional decimal
 * - Required unit: `%`, `pp`, `pts`, `point(s)`
 *
 * Word boundary at the unit end keeps "pp" matches from eating "pp" inside
 * larger tokens like "appraisal".
 */
const PCT_TOKEN = /([+\-−])?(\d+(?:\.\d+)?)\s*(%|pp|pts?|points?)\b/g;

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

/**
 * Pre-escape user text so it can be safely passed through wrapPercentsInPills
 * and rendered via dangerouslySetInnerHTML. Use this for string content that
 * was NOT processed by a markdown-to-html step (e.g., the whyItMatters
 * field, watch-for items, plain strings).
 */
export function escapeHtmlMinimal(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
