import { z } from 'zod';

/**
 * Bonus point values per signal. Sum capped at 100 by getAnalysisDepthScore.
 * Tunable; do not exceed 100 in any single signal.
 */
const BONUSES = {
  xSentiment: 25,
  financialHighlights: 20,
  dealTermsOrTranches: 20,
  transactions: 15,
  smartSubject: 10,
  longSummaryText: 10,
} as const;

const SUMMARY_TEXT_LONG_THRESHOLD = 600;

/**
 * Permissive shape — every field optional, nothing throws on shape divergence.
 * Each `unknown`-typed field is shape-checked at score time so we don't crash
 * on malformed legacy data. The score function returns 0 on parse failure.
 */
const SummaryJsonSchema = z
  .object({
    xSentiment: z
      .object({
        direction: z
          .enum(['bullish', 'bearish', 'mixed', 'neutral', 'no_signal'])
          .optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
    financialHighlights: z.array(z.unknown()).optional().nullable(),
    dealTerms: z.unknown().optional().nullable(),
    tranches: z.array(z.unknown()).optional().nullable(),
    transactions: z.array(z.unknown()).optional().nullable(),
  })
  .passthrough();

export interface AnalysisDepthInput {
  summaryJSON: unknown;
  summaryText: string | null | undefined;
  smartSubject: string | null | undefined;
}

/**
 * Score a Summary by structural-fidelity signals. Higher = richer parse.
 *
 * Returns a value in [0, 100]. Returns 0 for malformed/null inputs — never
 * throws. Each signal proves a successful AI parse step (xSentiment ran;
 * financial scorecard extracted; deal terms structured; etc.). A failed
 * parse can't fake the union of these markers.
 *
 * Tested in lib/onboarding/__tests__/analysis-depth.test.ts.
 */
export function getAnalysisDepthScore(input: AnalysisDepthInput): number {
  let score = 0;

  // smartSubject is a row scalar, not summaryJSON
  if (typeof input.smartSubject === 'string' && input.smartSubject.length > 0) {
    score += BONUSES.smartSubject;
  }

  // length proxy on summaryText
  if (
    typeof input.summaryText === 'string' &&
    input.summaryText.length > SUMMARY_TEXT_LONG_THRESHOLD
  ) {
    score += BONUSES.longSummaryText;
  }

  // summaryJSON shape-check — null, array, or malformed shape returns no bonuses
  const parsed = SummaryJsonSchema.safeParse(input.summaryJSON);
  if (!parsed.success) {
    return Math.min(score, 100);
  }
  const j = parsed.data;

  // xSentiment present + direction set → strongest "this matters" signal
  if (j.xSentiment?.direction) {
    score += BONUSES.xSentiment;
  }

  // financialHighlights array (10-K/10-Q scorecard).
  // Field name MUST match what response-parser writes — it aliases the AI's
  // `financials` to `financialHighlights` and deletes the old key, so a
  // check against `j.financials` would always be false (dead code).
  if (Array.isArray(j.financialHighlights) && j.financialHighlights.length > 0) {
    score += BONUSES.financialHighlights;
  }

  // dealTerms (8-K M&A) OR tranches (8-K debt) — either path, not both
  const hasDealTerms = j.dealTerms != null && typeof j.dealTerms === 'object';
  const hasTranches = Array.isArray(j.tranches) && j.tranches.length > 0;
  if (hasDealTerms || hasTranches) {
    score += BONUSES.dealTermsOrTranches;
  }

  // Form 4 normalized transactions
  if (Array.isArray(j.transactions) && j.transactions.length > 0) {
    score += BONUSES.transactions;
  }

  return Math.min(score, 100);
}

export const ANALYSIS_DEPTH_BONUSES = BONUSES;
export const ANALYSIS_DEPTH_TEXT_THRESHOLD = SUMMARY_TEXT_LONG_THRESHOLD;
