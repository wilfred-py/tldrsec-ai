#!/usr/bin/env npx tsx
/**
 * Landing-page Gmail fixture refresh helper.
 *
 * Surfaces the highest-scoring summaries from the last 30 days as candidates
 * for hand-curation into `lib/landing/gmail-mock-summaries.ts`. Reuses the
 * scoring + 30-day query already used by campaign emails — does not
 * duplicate the heuristic.
 *
 * Output:
 *   - stdout: markdown table of ~30 candidates (ticker, type, importance,
 *     headline) for quick at-a-glance triage.
 *   - /tmp/landing-fixture-candidates.json: full raw fields (summaryText,
 *     whyItMatters, smartSubject, dates) for actual fixture authoring.
 *
 * Usage: npx tsx scripts/refresh-landing-fixtures.ts
 * Requires: .env.local with DATABASE_URL.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import {
  fetchScoredSummariesLast30Days,
  dedupeByTicker,
  type ScoredSummaryRow,
} from '../lib/email/campaign-templates';

const OUTPUT_PATH = '/tmp/landing-fixture-candidates.json';
const MAX_PER_TICKER = 3;
const TOP_N = 30;

function extractWhyItMatters(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const w = (json as Record<string, unknown>).whyItMatters;
  return typeof w === 'string' && w.trim().length > 0 ? w : null;
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n - 1) + '…' : flat;
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|');
}

async function main() {
  const scored = await fetchScoredSummariesLast30Days(150);
  if (scored.length === 0) {
    console.error('No completed summaries in last 30 days. Check DATABASE_URL.');
    process.exit(1);
  }

  const candidates = dedupeByTicker(scored, MAX_PER_TICKER).slice(0, TOP_N);

  // stdout: markdown candidate table
  console.log(`# Landing-page fixture candidates (${candidates.length} of ${scored.length} total)`);
  console.log(`Generated ${new Date().toISOString()}\n`);
  console.log('| # | Score | Ticker | Type | Importance | Date | Headline |');
  console.log('|---|------:|--------|------|------------|------|----------|');
  candidates.forEach((c, i) => {
    const headline = c.smartSubject || truncate(c.summaryText, 80);
    const date = c.filingDate.toISOString().slice(0, 10);
    console.log(
      `| ${i + 1} | ${c.score.toFixed(1)} | ${c.ticker.symbol} | ${c.filingType} | ` +
      `${c.importance ?? '?'} | ${date} | ${escapePipes(truncate(headline, 80))} |`
    );
  });

  // side file: raw fields for fixture authoring
  const payload = candidates.map((c: ScoredSummaryRow) => ({
    score: c.score,
    ticker: c.ticker.symbol,
    companyName: c.ticker.companyName,
    filingType: c.filingType,
    filingDate: c.filingDate.toISOString(),
    importance: c.importance,
    smartSubject: c.smartSubject,
    summaryText: c.summaryText,
    whyItMatters: extractWhyItMatters(c.summaryJSON),
    tokensUsed: c.tokensUsed,
  }));
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.error(`\nWrote ${payload.length} candidates to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Refresh failed:', err);
  process.exit(1);
});
