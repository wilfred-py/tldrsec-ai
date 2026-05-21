/**
 * Pre-merge gate G2 — eval-suite runner for the X-sentiment pipeline.
 *
 * Pure function over a corpus file. Each entry is dispatched to the
 * protective layer that applies to its bucket:
 *
 *   1 (pump_and_dump)     → eligibility allowlist
 *   2 (cashtag_collision) → eligibility ticker-format / allowlist
 *   3 (legitimate_shift)  → validator on recorded modelOutput, expectedDirection match
 *   4 (null_signal)       → validator on recorded modelOutput, direction === 'no_signal'
 *
 * Pass criteria (from tasks/x-sentiment-test-plan.md):
 *   Bucket 1: 100% blocked by allowlist                   (zero bullish leak possible)
 *   Bucket 2: 100% blocked by ticker format / allowlist
 *   Bucket 3: ≥80% direction match with expectedDirection
 *   Bucket 4: ≥80% direction === 'no_signal'
 *
 * The runner is intentionally I/O-free — corpus loading + report writing
 * happens in the test harness, so this module stays trivially testable.
 */

import {
  _internal as providerInternal,
  type EligibilityReason,
} from '../x-sentiment-provider';
import {
  validateXSentiment,
  type SentimentDirection,
  type ValidationStats,
} from '../parsers/x-sentiment-validator';

const { checkEligibility } = providerInternal;

export type EvalBucket = 1 | 2 | 3 | 4;

export interface EvalEntry {
  bucket: EvalBucket;
  ticker: string;
  formType: string;
  companyName?: string;
  /** Required for Bucket 3 only — the direction the validator should arrive at. */
  expectedDirection?: SentimentDirection;
  /**
   * Pre-recorded JSON string of what Grok would have returned for this filing.
   * Required for Buckets 3 & 4. Undefined for Buckets 1/2 because they should
   * be blocked at the eligibility layer before any model call fires.
   */
  modelOutput?: string;
  note?: string;
}

export interface EvalCorpus {
  entries: EvalEntry[];
}

export type EvalStage =
  | 'eligibility_blocked'   // Buckets 1/2 happy path; Buckets 3/4 unintended skip
  | 'validator_rejected'    // Validator returned sentiment === null
  | 'validator_resolved'    // Validator produced a sentiment object
  | 'parse_error';          // modelOutput JSON malformed

export interface EvalOutcome {
  entry: EvalEntry;
  stage: EvalStage;
  eligibilityReason?: EligibilityReason;
  validatorRejection?: string;
  resolvedDirection?: SentimentDirection;
  validatorStats?: ValidationStats;
  passed: boolean;
  /** Human-readable reason this entry passed / failed against its bucket criterion. */
  detail: string;
}

export interface BucketReport {
  bucket: EvalBucket;
  name: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  threshold: number;
  meetsThreshold: boolean;
  criterion: string;
  outcomes: EvalOutcome[];
}

const BUCKET_NAMES: Record<EvalBucket, string> = {
  1: 'pump_and_dump',
  2: 'cashtag_collision',
  3: 'legitimate_shift',
  4: 'null_signal',
};

const BUCKET_CRITERIA: Record<EvalBucket, { threshold: number; criterion: string }> = {
  1: {
    threshold: 1.0,
    criterion: '100% blocked by eligibility allowlist (zero bullish leak)',
  },
  2: {
    threshold: 1.0,
    criterion: '100% blocked by ticker format or allowlist (no fuzzy resolve)',
  },
  3: {
    threshold: 0.8,
    criterion: '≥80% validator direction matches expectedDirection',
  },
  4: {
    threshold: 0.8,
    criterion: '≥80% validator direction === "no_signal"',
  },
};

function evaluateBucket1Or2(entry: EvalEntry): EvalOutcome {
  const eligibility = checkEligibility(entry.ticker, entry.formType);
  if (eligibility.eligible) {
    return {
      entry,
      stage: 'validator_resolved',
      passed: false,
      detail: `Bucket ${entry.bucket} expected eligibility block, but ticker ${entry.ticker} is eligible`,
    };
  }
  return {
    entry,
    stage: 'eligibility_blocked',
    eligibilityReason: eligibility.reason,
    passed: true,
    detail: `Blocked by eligibility (${eligibility.reason})`,
  };
}

function evaluateBucket3Or4(entry: EvalEntry): EvalOutcome {
  const eligibility = checkEligibility(entry.ticker, entry.formType);
  if (!eligibility.eligible) {
    // For Bucket 4, an eligibility block is still effectively a no-signal —
    // we never make the call. For Bucket 3 it's a corpus problem.
    return {
      entry,
      stage: 'eligibility_blocked',
      eligibilityReason: eligibility.reason,
      passed: entry.bucket === 4,
      detail:
        entry.bucket === 4
          ? `Eligibility blocked (${eligibility.reason}); counted as no_signal`
          : `Bucket 3 expects eligible filings, got reason=${eligibility.reason}`,
    };
  }

  if (!entry.modelOutput) {
    return {
      entry,
      stage: 'parse_error',
      passed: false,
      detail: 'Missing modelOutput — required for Bucket 3/4 entries',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.modelOutput);
  } catch (err) {
    return {
      entry,
      stage: 'parse_error',
      passed: false,
      detail: `Failed to parse modelOutput JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const validation = validateXSentiment(parsed);
  if (!validation.sentiment) {
    return {
      entry,
      stage: 'validator_rejected',
      validatorRejection: validation.rejectionReason,
      validatorStats: validation.stats,
      passed: false,
      detail: `Validator rejected: ${validation.rejectionReason}`,
    };
  }

  const direction = validation.sentiment.direction;
  if (entry.bucket === 3) {
    if (!entry.expectedDirection) {
      return {
        entry,
        stage: 'validator_resolved',
        resolvedDirection: direction,
        validatorStats: validation.stats,
        passed: false,
        detail: 'Bucket 3 entry missing expectedDirection — corpus error',
      };
    }
    const matched = direction === entry.expectedDirection;
    return {
      entry,
      stage: 'validator_resolved',
      resolvedDirection: direction,
      validatorStats: validation.stats,
      passed: matched,
      detail: matched
        ? `Direction matched (${direction})`
        : `Direction mismatch — expected ${entry.expectedDirection}, got ${direction}`,
    };
  }

  // Bucket 4
  const isNoSignal = direction === 'no_signal';
  return {
    entry,
    stage: 'validator_resolved',
    resolvedDirection: direction,
    validatorStats: validation.stats,
    passed: isNoSignal,
    detail: isNoSignal
      ? 'Direction is no_signal as expected'
      : `Expected no_signal, got ${direction}`,
  };
}

export function evaluateEntry(entry: EvalEntry): EvalOutcome {
  if (entry.bucket === 1 || entry.bucket === 2) {
    return evaluateBucket1Or2(entry);
  }
  return evaluateBucket3Or4(entry);
}

export function runEval(corpus: EvalCorpus): BucketReport[] {
  const outcomes = corpus.entries.map(evaluateEntry);
  const reports: BucketReport[] = [];
  for (const bucket of [1, 2, 3, 4] as const) {
    const bucketOutcomes = outcomes.filter(o => o.entry.bucket === bucket);
    const total = bucketOutcomes.length;
    const passed = bucketOutcomes.filter(o => o.passed).length;
    const passRate = total === 0 ? 0 : passed / total;
    const { threshold, criterion } = BUCKET_CRITERIA[bucket];
    reports.push({
      bucket,
      name: BUCKET_NAMES[bucket],
      total,
      passed,
      failed: total - passed,
      passRate,
      threshold,
      meetsThreshold: total > 0 && passRate >= threshold,
      criterion,
      outcomes: bucketOutcomes,
    });
  }
  return reports;
}

export function formatReport(reports: BucketReport[]): string {
  const lines: string[] = [];
  lines.push('# X-Sentiment Eval Report (G2)');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| Bucket | Name | Total | Passed | Pass Rate | Threshold | Status |');
  lines.push('|--------|------|------:|-------:|----------:|----------:|:------:|');
  for (const r of reports) {
    const status = r.meetsThreshold ? 'PASS' : 'FAIL';
    const pctRate = (r.passRate * 100).toFixed(0) + '%';
    const pctThreshold = (r.threshold * 100).toFixed(0) + '%';
    lines.push(
      `| ${r.bucket} | ${r.name} | ${r.total} | ${r.passed} | ${pctRate} | ${pctThreshold} | ${status} |`,
    );
  }
  lines.push('');
  for (const r of reports) {
    lines.push(`## Bucket ${r.bucket} — ${r.name}`);
    lines.push('');
    lines.push(`**Criterion:** ${r.criterion}`);
    lines.push('');
    for (const o of r.outcomes) {
      const tag = o.passed ? 'PASS' : 'FAIL';
      lines.push(`- [${tag}] ${o.entry.ticker} (${o.entry.formType}) — ${o.detail}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
