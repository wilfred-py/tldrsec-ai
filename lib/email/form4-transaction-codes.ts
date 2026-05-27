/**
 * Canonical SEC Form 4 transaction-code → display-type map.
 *
 * Single source of truth for how a Form 4 transaction code maps to a
 * human-readable type across the [Filing] email render path. Both the markdown
 * extractor (`form4-data-extractor.ts`) and the AI-JSON normalizer
 * (`form4-field-normalizer.ts`) resolve codes through this one map so the two
 * paths can't drift — previously each carried its own copy and they disagreed
 * on the 'A' label ('Award' vs 'Award/Grant').
 *
 * @see https://www.sec.gov/about/forms/form4data.pdf
 *
 * NOTE: a third, semantically-divergent copy still lives in
 * `lib/ai/parsers/response-parser.ts` (it maps 'F'→Disposition, 'C'→Exercise,
 * 'J'/'K'→Transfer, 'W'→Gift, which conflict with SEC semantics). That copy is
 * in a different pipeline layer and changing it alters shipped [Summary]
 * classification, so reconciling it is tracked separately as an architecture-gap
 * rather than folded into this consolidation.
 */
export const TRANSACTION_CODE_MAP: Record<string, string> = {
  'S': 'Sale',
  'P': 'Purchase',
  'V': 'Voluntarily Reported',
  'A': 'Award/Grant',
  'D': 'Disposition',
  'F': 'Tax Withholding',
  'I': 'Discretionary',
  'M': 'Exercise',
  'C': 'Conversion',
  'E': 'Expiration',
  'H': 'Expiration',
  'O': 'Exercise',
  'X': 'Exercise',
  'G': 'Gift',
  'L': 'Small Acquisition',
  'W': 'Will/Descent',
  'Z': 'Voting Trust',
  'J': 'Trust Transfer',
  'K': 'Equity Swap',
  'U': 'Tender',
} as const;
