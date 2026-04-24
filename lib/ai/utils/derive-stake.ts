/**
 * Deterministic derivation of post-transaction holdings (newStake) from
 * Form 3/4/144 `transactions[]` arrays.
 *
 * Five-tier precedence:
 *   1. Authoritative LLM field (`postTransactionCommonShares`)
 *   2. Derived from transactions: filter by Common Stock + Direct,
 *      sort by date, pick last `sharesOwnedFollowing`
 *   3. Fallback derivation: any transaction with `sharesOwnedFollowing`
 *      (preserves existing derivative-only filing behavior)
 *   4. LLM's legacy top-level `newStake` string (pass-through)
 *   5. Narrative regex over `summaryText` (last resort)
 *
 * Background: the LLM's top-level `newStake` is unreliable. Observed
 * failure: AAPL Parekh 2026-04-15, where `newStake` was populated from
 * a Table II (derivative) row's `sharesOwnedFollowing` instead of the
 * Table I Column 5 Common Stock row. See .claude/tasks/form4-holdings-mismatch.md.
 */
import type { NormalizedTransaction } from '../../email/form4-field-normalizer';
import { formatNumberWithCommas } from '../../email/form4-field-normalizer';

export type DeriveNewStakeSource =
  | 'authoritative'         // LLM populated postTransactionCommonShares
  | 'derived-common-direct' // filtered to Common Stock + Direct, date-sorted
  | 'derived-fallback'      // any SOF-bearing transaction
  | 'llm-legacy'            // LLM's raw newStake string
  | 'narrative'             // extracted from summaryText regex
  | 'none';

export interface DeriveNewStakeOptions {
  transactions?: NormalizedTransaction[] | null;
  postTransactionCommonShares?: unknown;
  llmNewStake?: string;
  summaryText?: string;
}

export interface DeriveNewStakeResult {
  /** Formatted number with commas, no suffix (e.g. "14,900"). Empty when source === 'none'. */
  formattedNumber: string;
  /** Parsed numeric value, null when not derivable. */
  numericValue: number | null;
  /** True when all contributing transactions are derivative-type. */
  isDerivative: boolean;
  source: DeriveNewStakeSource;
  /** Raw LLM string when source === 'llm-legacy'. May contain " shares" suffix. */
  llmLegacyRaw?: string;
}

const COMMON_STOCK_VARIANTS = new Set([
  'common stock',
  'class a common stock',
  'class b common stock',
  'class c common stock',
  'class a ordinary shares',
  'class b ordinary shares',
  'ordinary shares',
]);

const DERIVATIVE_CODES = new Set(['M', 'C', 'X', 'O', 'E', 'H']);

function isCommonStock(securityType: string | undefined): boolean {
  if (!securityType) return false;
  return COMMON_STOCK_VARIANTS.has(securityType.trim().toLowerCase());
}

function isDirect(ownershipForm: string | undefined): boolean {
  if (!ownershipForm) return false; // require explicit 'D'; missing metadata falls through to Tier 3
  return ownershipForm.trim().toUpperCase() === 'D';
}

function isAllDerivative(txns: NormalizedTransaction[]): boolean {
  if (txns.length === 0) return false;
  return txns.every(t => {
    const code = String(t.code || '').toUpperCase();
    if (DERIVATIVE_CODES.has(code)) return true;
    if (code === 'A') {
      const price = parseFloat(String(t.pricePerShare || '0').replace(/[$,]/g, '')) || 0;
      return price === 0;
    }
    return false;
  });
}

function parseToNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const cleaned = String(val).replace(/[$,\[\]]/g, '').trim();
  if (!/\d/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sortChronologically<T extends NormalizedTransaction>(txns: T[]): T[] {
  return txns
    .map((tx, idx) => ({ tx, idx }))
    .sort((a, b) => {
      if (a.tx.date && b.tx.date) {
        const cmp = a.tx.date.localeCompare(b.tx.date);
        if (cmp !== 0) return cmp;
      }
      return a.idx - b.idx;
    })
    .map(({ tx }) => tx);
}

export function deriveNewStake(opts: DeriveNewStakeOptions): DeriveNewStakeResult {
  const { transactions, postTransactionCommonShares, llmNewStake, summaryText } = opts;

  // Tier 1: authoritative LLM field
  const authNum = parseToNumber(postTransactionCommonShares);
  if (authNum !== null) {
    return {
      formattedNumber: formatNumberWithCommas(authNum),
      numericValue: authNum,
      isDerivative: false,
      source: 'authoritative',
    };
  }

  // Tier 2: derive from transactions
  const txArr = Array.isArray(transactions) ? transactions : [];
  if (txArr.length > 0) {
    const commonDirect = txArr.filter(
      t =>
        isCommonStock(t.securityType) &&
        isDirect(t.ownershipForm) &&
        parseToNumber(t.sharesOwnedFollowing) !== null,
    );

    if (commonDirect.length > 0) {
      const sorted = sortChronologically(commonDirect);
      const last = sorted[sorted.length - 1];
      const n = parseToNumber(last.sharesOwnedFollowing)!;
      return {
        formattedNumber: formatNumberWithCommas(n),
        numericValue: n,
        isDerivative: false,
        source: 'derived-common-direct',
      };
    }

    // Fallback: any transaction with SOF (handles filings that lack securityType
    // metadata, derivative-only filings, and legacy AI output without tagging).
    const anyWithSof = txArr.filter(t => parseToNumber(t.sharesOwnedFollowing) !== null);
    if (anyWithSof.length > 0) {
      const sorted = sortChronologically(anyWithSof);
      const last = sorted[sorted.length - 1];
      const n = parseToNumber(last.sharesOwnedFollowing)!;
      return {
        formattedNumber: formatNumberWithCommas(n),
        numericValue: n,
        isDerivative: isAllDerivative(txArr),
        source: 'derived-fallback',
      };
    }
  }

  // Tier 3: LLM's legacy newStake string (pass-through)
  if (typeof llmNewStake === 'string' && /\d/.test(llmNewStake)) {
    const num = parseToNumber(llmNewStake);
    return {
      formattedNumber: num !== null ? formatNumberWithCommas(num) : '',
      numericValue: num,
      isDerivative: /derivative/i.test(llmNewStake),
      source: 'llm-legacy',
      llmLegacyRaw: llmNewStake,
    };
  }

  // Tier 4: narrative regex
  if (summaryText) {
    const stakePatterns = [
      /(?:holdings?|position|stake)\s+(?:\w+\s+)*?(?:to|at|of)\s+([\d,]+(?:\.\d+)?)\s+(?:shares|units|common|class)/i,
      /(?:dropped|fell|rose|climbed|reached|unchanged)\s+(?:\w+\s+)*?(?:to|at)\s+([\d,]+(?:\.\d+)?)\s+(?:shares|units)/i,
      /(?:totale?d?|reached)\s+([\d,]+(?:\.\d+)?)\s+(?:shares|units)/i,
      /(?:holds?|owns?|holding)\s+([\d,]+(?:\.\d+)?)\s+(?:shares|units)/i,
    ];
    for (const pattern of stakePatterns) {
      const match = summaryText.match(pattern);
      if (match) {
        const n = parseToNumber(match[1]);
        if (n !== null) {
          return {
            formattedNumber: formatNumberWithCommas(n),
            numericValue: n,
            isDerivative: false,
            source: 'narrative',
          };
        }
      }
    }
  }

  return { formattedNumber: '', numericValue: null, isDerivative: false, source: 'none' };
}

/**
 * Detect a >5% disagreement between a derived newStake number and numbers in
 * the `summaryText` narrative. Returns mismatch details, or null when the
 * narrative agrees within tolerance, uses hedge words (signalling intentional
 * imprecision), or contains no comparable number.
 *
 * Narrative patterns require "shares" / "holdings" / "common" context to avoid
 * false positives on dollar amounts, percentages, or transaction share counts.
 */
export function detectNewStakeNarrativeMismatch(
  derivedNumber: number,
  summaryText: string | undefined,
): { narrativeNumber: number; derivedNumber: number; diffPct: number } | null {
  if (!summaryText) return null;

  const hedgeWords = /\b(?:roughly|approximately|around|about|nearly|almost|~)\b/i;
  if (hedgeWords.test(summaryText)) return null;

  const narrativePatterns = [
    /\b([\d,]+(?:\.\d+)?)\s+common\s+shares?\b/i,
    /(?:holdings?|position|stake)\s+(?:\w+\s+){0,3}?(?:to|at|of)\s+([\d,]+(?:\.\d+)?)\s+shares?/i,
    /(?:totale?d?|reached|holds?|owns?)\s+([\d,]+(?:\.\d+)?)\s+(?:common\s+)?shares?/i,
    /\b([\d,]+(?:\.\d+)?)\s+shares?\s+(?:remaining|held|after|of\s+common)/i,
  ];
  for (const p of narrativePatterns) {
    const m = summaryText.match(p);
    if (m) {
      const n = parseToNumber(m[1]);
      if (n !== null && n > 0) {
        const diffPct = Math.abs((derivedNumber - n) / n) * 100;
        if (diffPct > 5) {
          return { narrativeNumber: n, derivedNumber, diffPct };
        }
        return null;
      }
    }
  }
  return null;
}
