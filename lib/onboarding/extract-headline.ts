/**
 * Derive a one-line headline from a Summary's markdown summaryText.
 *
 * Used by the post-onboarding hero card render in app/dashboard/page.tsx.
 * Lives here (not inline at the call site) so the email render path can
 * adopt the same derivation when the templates evolve, and so the regex
 * is unit-tested in one place.
 */

const ELLIPSIS = '…';
const MAX_HEADLINE_CHARS = 200;

/**
 * Returns the first sentence of a markdown summary, with leading `#` headings
 * stripped, capped at MAX_HEADLINE_CHARS. Adds a single ellipsis if truncation
 * occurred (so the displayed length is still ≤ MAX_HEADLINE_CHARS).
 */
export function extractHeadline(
  summaryText: string,
  maxChars: number = MAX_HEADLINE_CHARS
): string {
  // Strip leading markdown heading marks (`### `, `## `, `# `) and surrounding
  // whitespace.
  const stripped = summaryText.replace(/^#+\s*/, '').trim();

  // Split on sentence-terminating punctuation followed by whitespace. Lookbehind
  // keeps the punctuation attached to the first sentence.
  const firstSentence = stripped.split(/(?<=[.!?])\s/)[0] ?? stripped;

  if (firstSentence.length <= maxChars) {
    return firstSentence;
  }
  // Truncate so total length (including ellipsis) is exactly maxChars.
  return firstSentence.slice(0, maxChars - ELLIPSIS.length) + ELLIPSIS;
}
