/**
 * Static-analysis guardrail: the process-local enrichment budget primitives
 * (`tryDebitEnrichmentBudget`, `isWithinDailyEnrichmentBudget`,
 * `_resetDailyEnrichmentSpend`) were removed in favour of the Postgres-backed
 * ledger in `lib/ai/enrichment-spend.ts`. They MUST NOT come back — process-local
 * state is unsafe under Cloudflare Pages' multi-isolate runtime.
 *
 * This test fails the build if any non-test source file under `lib/` or
 * `app/` references the deprecated symbols. Test files are excluded so the
 * historical commits and migration notes can still mention them.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const FORBIDDEN_TOKENS = [
  'tryDebitEnrichmentBudget',
  'isWithinDailyEnrichmentBudget',
  '_resetDailyEnrichmentSpend',
] as const;

const SCAN_DIRS = ['lib', 'app'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function walkSourceFiles(repoRoot: string, relDir: string): string[] {
  const absDir = path.join(repoRoot, relDir);
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    const relPath = path.join(relDir, entry);
    const absPath = path.join(repoRoot, relPath);
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      // Skip test directories — historical commits and migration notes still
      // mention the deprecated tokens in test files, which is fine.
      if (entry === '__tests__') continue;
      results.push(...walkSourceFiles(repoRoot, relPath));
    } else if (stat.isFile()) {
      if (!SOURCE_EXTENSIONS.some(ext => entry.endsWith(ext))) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
      results.push(relPath);
    }
  }
  return results;
}

describe('deprecated enrichment-budget API', () => {
  it('is fully removed from production source', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const allFiles: string[] = [];
    for (const dir of SCAN_DIRS) {
      allFiles.push(...walkSourceFiles(repoRoot, dir));
    }

    const violations: Array<{ file: string; token: string; line: number }> = [];
    for (const relPath of allFiles) {
      const absPath = path.join(repoRoot, relPath);
      const content = readFileSync(absPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const token of FORBIDDEN_TOKENS) {
          if (lines[i].includes(token)) {
            violations.push({ file: relPath, token, line: i + 1 });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map(v => `  ${v.file}:${v.line} — references "${v.token}"`)
        .join('\n');
      throw new Error(
        `Deprecated enrichment-budget API still referenced in production source.\n` +
          `Use \`tryDebitEnrichment\` from \`lib/ai/enrichment-spend.ts\` instead.\n${report}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
