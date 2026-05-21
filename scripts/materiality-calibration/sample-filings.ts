#!/usr/bin/env npx tsx
/**
 * Materiality Calibration — Sampling Script (Step 1 of 3)
 *
 * Pulls a stratified set of historical 10-K and 10-Q filings from the
 * `FilingContentCache` (pipeline schema) joined to `CikMapping` for ticker
 * and company name. Writes the candidates to a CSV ready for human labeling.
 *
 * Why FilingContentCache instead of SecFiling: the cache is the canonical
 * source of fetched filing text (keyed by accessionNumber), populated by
 * the ingest pipeline. SecFiling is the user-scoped tracking table — many
 * cached filings won't have a SecFiling row if no user had the ticker on
 * their watchlist at fetch time. For calibration we want raw content
 * coverage, not user tracking.
 *
 * Stratification:
 *   - target ~15 × 10-K, ~15 × 10-Q (configurable)
 *   - at most MAX_PER_TICKER filings per ticker
 *   - prefer recent filings (ORDER BY fetchedAt DESC)
 *
 * Output: scripts/materiality-calibration/labeling-template.csv
 * Columns: accessionNumber, formType, cik, ticker, companyName, fetchedAt,
 *          contentChars, primaryDocUrl, score, rationale, notes
 *
 * `score`, `rationale`, and `notes` are blank — Wilfred fills these by hand.
 *
 * Usage: npx tsx scripts/materiality-calibration/sample-filings.ts
 * Requires: .env.local with DATABASE_URL.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { getPrismaClient } from '../../lib/db/prisma';

const TARGET_PER_FORM = 15;
const MAX_PER_TICKER = 2;
const MIN_CONTENT_CHARS = 5_000;
const OUTPUT_DIR = resolve(process.cwd(), 'scripts/materiality-calibration');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'labeling-template.csv');

interface FilingRow {
  accessionNumber: string;
  formType: string;
  cik: string;
  ticker: string;
  companyName: string;
  fetchedAt: Date;
  contentChars: number;
  primaryDocUrl: string | null;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsvRow(row: FilingRow): string {
  return [
    csvEscape(row.accessionNumber),
    csvEscape(row.formType),
    csvEscape(row.cik),
    csvEscape(row.ticker),
    csvEscape(row.companyName),
    csvEscape(row.fetchedAt.toISOString().slice(0, 10)),
    csvEscape(row.contentChars),
    csvEscape(row.primaryDocUrl ?? ''),
    csvEscape(''), // score (blank)
    csvEscape(''), // rationale (blank)
    csvEscape(''), // notes (blank)
  ].join(',');
}

async function sampleForFormType(
  prisma: ReturnType<typeof getPrismaClient>,
  formTypes: string[],
  target: number,
): Promise<FilingRow[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      accession_number: string;
      form_type: string;
      cik: string;
      ticker: string | null;
      company_name: string | null;
      fetched_at: Date;
      content_length: number;
      primary_doc_url: string | null;
    }>
  >(
    `
    SELECT
      fcc."accessionNumber"  AS accession_number,
      fcc."formType"         AS form_type,
      fcc.cik                AS cik,
      cm.ticker              AS ticker,
      cm."companyName"       AS company_name,
      fcc."fetchedAt"        AS fetched_at,
      fcc."contentLength"    AS content_length,
      fcc."primaryDocUrl"    AS primary_doc_url
    FROM pipeline."FilingContentCache" fcc
    LEFT JOIN app."CikMapping" cm ON cm.cik = fcc.cik
    WHERE fcc."formType" = ANY($1::text[])
      AND fcc."contentLength" >= $2
      AND fcc.status = 'CACHED'
    ORDER BY fcc."fetchedAt" DESC
    LIMIT 500
    `,
    formTypes,
    MIN_CONTENT_CHARS,
  );

  // Stratify: at most MAX_PER_TICKER per ticker (fallback to cik when ticker
  // is missing — some CIKs aren't in CikMapping yet).
  const seenKey = new Map<string, number>();
  const picked: FilingRow[] = [];
  for (const r of rows) {
    if (picked.length >= target) break;
    const key = r.ticker ?? `cik:${r.cik}`;
    const count = seenKey.get(key) ?? 0;
    if (count >= MAX_PER_TICKER) continue;
    seenKey.set(key, count + 1);
    picked.push({
      accessionNumber: r.accession_number,
      formType: r.form_type,
      cik: r.cik,
      ticker: r.ticker ?? `CIK${r.cik}`,
      companyName: r.company_name ?? r.ticker ?? `CIK ${r.cik}`,
      fetchedAt: r.fetched_at,
      contentChars: r.content_length,
      primaryDocUrl: r.primary_doc_url,
    });
  }
  return picked;
}

async function main(): Promise<void> {
  console.log('Materiality calibration — sampling filings from FilingContentCache');
  console.log(`Target: ${TARGET_PER_FORM} × 10-K + ${TARGET_PER_FORM} × 10-Q`);
  console.log(`Max per ticker (or CIK if unmapped): ${MAX_PER_TICKER}`);
  console.log(`Min content chars: ${MIN_CONTENT_CHARS.toLocaleString()}`);
  console.log('');

  const prisma = getPrismaClient();

  const tenK = await sampleForFormType(prisma, ['10-K', '10-K/A'], TARGET_PER_FORM);
  const tenQ = await sampleForFormType(prisma, ['10-Q', '10-Q/A'], TARGET_PER_FORM);

  console.log(`Found ${tenK.length} × 10-K and ${tenQ.length} × 10-Q candidates`);
  if (tenK.length + tenQ.length === 0) {
    console.error('No filings found. Check FilingContentCache is populated and DATABASE_URL is right.');
    await prisma.$disconnect();
    process.exit(2);
  }
  if (tenK.length < TARGET_PER_FORM || tenQ.length < TARGET_PER_FORM) {
    console.warn(
      'WARN: candidate pool is short of target. Calibration will run on what we have.',
    );
  }

  const all = [...tenK, ...tenQ];
  const header = [
    'accessionNumber',
    'formType',
    'cik',
    'ticker',
    'companyName',
    'fetchedAt',
    'contentChars',
    'primaryDocUrl',
    'score',
    'rationale',
    'notes',
  ].join(',');

  const lines = [header, ...all.map(toCsvRow)];
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, lines.join('\n') + '\n', 'utf8');

  console.log('');
  console.log(`Wrote ${all.length} rows to ${OUTPUT_PATH}`);
  console.log('');
  console.log('Tickers sampled (10-K):', [...new Set(tenK.map((r) => r.ticker))].join(', '));
  console.log('Tickers sampled (10-Q):', [...new Set(tenQ.map((r) => r.ticker))].join(', '));
  console.log('');
  console.log('Next: open the CSV, fill `score` (high|medium|low|noise) and `rationale` per row.');
  console.log('See scripts/materiality-calibration/README.md for the labeling rubric.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Sampling failed:', err);
  process.exit(1);
});
