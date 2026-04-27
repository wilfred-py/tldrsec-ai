/**
 * Pre-merge gate G2 harness — exercises the X-sentiment protective layers
 * against the corpus at `__tests__/fixtures/x-sentiment-eval-corpus.json`.
 *
 * Two execution paths:
 *   - Default (CI): mocked, deterministic. Loads recorded modelOutput from the
 *     corpus and runs eligibility + validator. Asserts each bucket meets its
 *     pass threshold (1.0 for Buckets 1/2, 0.8 for Buckets 3/4).
 *   - Live (gated by RUN_X_SENTIMENT_LIVE_EVAL=true): out of scope for this
 *     harness. The runbook in tasks/x-sentiment-eval-corpus.md covers the
 *     manual review process for that path.
 *
 * On every run, a markdown report is written to
 * `tasks/x-sentiment-eval-report-latest.md` so reviewers can scan the per-entry
 * breakdown without re-running jest.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  runEval,
  formatReport,
  type EvalCorpus,
} from '../../../lib/ai/__tests__/x-sentiment-eval-runner';

function loadCorpus(): EvalCorpus {
  const corpusPath = path.resolve(
    __dirname,
    '../../fixtures/x-sentiment-eval-corpus.json',
  );
  const raw = readFileSync(corpusPath, 'utf8');
  const parsed = JSON.parse(raw) as EvalCorpus;
  return parsed;
}

function writeReport(markdown: string): string {
  const repoRoot = path.resolve(__dirname, '../../..');
  const reportDir = path.join(repoRoot, 'tasks');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'x-sentiment-eval-report-latest.md');
  writeFileSync(reportPath, markdown, 'utf8');
  return reportPath;
}

describe('X-sentiment eval suite (G2)', () => {
  const corpus = loadCorpus();
  const reports = runEval(corpus);

  beforeAll(() => {
    const markdown = formatReport(reports);
    const reportPath = writeReport(markdown);
    // eslint-disable-next-line no-console
    console.log(`\n${markdown}\n\n[eval] Wrote report to ${reportPath}\n`);
  });

  it('corpus contains all 4 buckets', () => {
    const buckets = new Set(corpus.entries.map(e => e.bucket));
    expect(buckets).toEqual(new Set([1, 2, 3, 4]));
  });

  it('corpus has at least 5 entries per bucket (test plan target)', () => {
    for (const bucket of [1, 2, 3, 4] as const) {
      const count = corpus.entries.filter(e => e.bucket === bucket).length;
      expect({ bucket, count }).toEqual({ bucket, count: expect.any(Number) });
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it.each(reports.map(r => [r.bucket, r.name, r] as const))(
    'Bucket %s (%s) meets pass threshold',
    (_bucket, _name, report) => {
      if (!report.meetsThreshold) {
        const failures = report.outcomes
          .filter(o => !o.passed)
          .map(o => `  - ${o.entry.ticker} (${o.entry.formType}): ${o.detail}`)
          .join('\n');
        throw new Error(
          `Bucket ${report.bucket} (${report.name}) failed: ` +
            `${report.passed}/${report.total} passed, threshold ${(report.threshold * 100).toFixed(0)}%.\n` +
            `Criterion: ${report.criterion}\n` +
            `Failures:\n${failures}`,
        );
      }
      expect(report.meetsThreshold).toBe(true);
    },
  );

  it('Bucket 1 — every pump-and-dump ticker is allowlist-blocked', () => {
    const bucket1 = reports.find(r => r.bucket === 1)!;
    for (const o of bucket1.outcomes) {
      expect(o.stage).toBe('eligibility_blocked');
      expect(o.eligibilityReason).toBe('not_in_allowlist');
    }
  });

  it('Bucket 2 — every collision ticker is rejected by format or allowlist', () => {
    const bucket2 = reports.find(r => r.bucket === 2)!;
    for (const o of bucket2.outcomes) {
      expect(o.stage).toBe('eligibility_blocked');
      expect(['invalid_ticker_format', 'not_in_allowlist']).toContain(
        o.eligibilityReason,
      );
    }
  });
});
