/**
 * Single source of truth for `Summary.processingStatus` values.
 *
 * Both the writer (`lib/ai/summarize.ts`) and the email-gate reader
 * (`lib/cron/handlers/summarize-cached-handler.ts`) reference this const.
 * String literals scattered across both sites are easy to typo and silently
 * break the partial-result gate.
 *
 * Casing intentionally preserved as it appears in the DB today (mixed-case
 * legacy; do not normalize without a backfill).
 */
export const ProcessingStatus = {
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
  /** Hard failure (API error, validation crash, etc.). */
  FAILED: 'FAILED',
} as const;

export type ProcessingStatusValue = typeof ProcessingStatus[keyof typeof ProcessingStatus];

/**
 * Statuses that should suppress downstream side-effects (email send,
 * analytics emit). The email gate at the cron handler reads this set.
 */
export const PARTIAL_RESULT_STATUSES: ReadonlySet<ProcessingStatusValue> = new Set([
  ProcessingStatus.COMPLETED_WITH_WARNINGS,
  ProcessingStatus.OUTPUT_TRUNCATED,
  ProcessingStatus.INSUFFICIENT_CONTENT,
]);

/**
 * True when this summary should NOT be emailed to a user. Combines the
 * status set above with the explicit `isPartialResult` boolean in case a
 * future writer sets one but not the other.
 */
export function isSuppressedFromEmail(opts: {
  isPartialResult?: boolean | null;
  processingStatus?: string | null;
}): boolean {
  if (opts.isPartialResult === true) return true;
  if (opts.processingStatus && PARTIAL_RESULT_STATUSES.has(opts.processingStatus as ProcessingStatusValue)) {
    return true;
  }
  return false;
}
