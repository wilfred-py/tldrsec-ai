#!/usr/bin/env npx tsx
/**
 * Materiality Calibration — Runner (Step 3 of 3)
 *
 * Reads the labeled CSV from Step 2, runs the materiality prompt against
 * every row, compares the model's prediction to the human label, and writes
 * a markdown report.
 *
 * Exit code is non-zero if overall accuracy < ACCURACY_GATE (default 75%).
 *
 * Usage:
 *   npx tsx scripts/materiality-calibration/run-calibration.ts
 *   npx tsx scripts/materiality-calibration/run-calibration.ts --dry-run
 *   npx tsx scripts/materiality-calibration/run-calibration.ts --limit 5
 *
 * Requires:
 *   - .env.local with DATABASE_URL and XAI_API_KEY (or tldrsec_x_search)
 *   - scripts/materiality-calibration/labeling-template.csv with filled scores
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { getPrismaClient } from '../../lib/db/prisma';
import { callXaiResponses, XaiDirectError } from '../../lib/ai/xai-direct-client';
import {
  MATERIALITY_SYSTEM_PROMPT,
  buildMaterialityUserPrompt,
  parseMaterialityResponse,
  emptyConfusionMatrix,
  type MaterialityScore,
  type MaterialityFormType,
  type MaterialityConfusionMatrix,
} from '../../lib/ai/calibration/materiality-rubric';

const ACCURACY_GATE = 0.75;
// Prefer labels.csv (filled by labeler) if present; fall back to template
const LABELS_PATH = resolve(process.cwd(), 'scripts/materiality-calibration/labels.csv');
const TEMPLATE_PATH = resolve(process.cwd(), 'scripts/materiality-calibration/labeling-template.csv');
const CSV_PATH = existsSync(LABELS_PATH) ? LABELS_PATH : TEMPLATE_PATH;
const REPORT_DIR = resolve(process.cwd(), 'scripts/materiality-calibration');
const VALID_SCORES: ReadonlySet<MaterialityScore> = new Set<MaterialityScore>([
  'high',
  'medium',
  'low',
  'noise',
]);
const VALID_FORM_TYPES: ReadonlySet<string> = new Set<string>([
  '10-K',
  '10-K/A',
  '10-Q',
  '10-Q/A',
]);

interface LabeledRow {
  accessionNumber: string;
  formType: MaterialityFormType;
  ticker: string;
  companyName: string;
  filingDate: string;
  secUrl: string;
  contentChars: number;
  humanScore: MaterialityScore;
  humanRationale: string;
  notes: string;
}

interface RunResult {
  row: LabeledRow;
  predicted: MaterialityScore | null;
  predictedRationale: string | null;
  parseError: string | null;
  costUsd: number;
  latencyMs: number;
}

interface CliArgs {
  dryRun: boolean;
  limit: number | null;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit: number | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--limit') {
      const v = parseInt(args[i + 1] ?? '', 10);
      if (!Number.isFinite(v) || v < 1) {
        throw new Error('--limit must be a positive integer');
      }
      limit = v;
      i++;
    } else if (arg.startsWith('--limit=')) {
      const v = parseInt(arg.split('=')[1] ?? '', 10);
      if (!Number.isFinite(v) || v < 1) {
        throw new Error('--limit must be a positive integer');
      }
      limit = v;
    }
  }
  return { dryRun, limit };
}

/**
 * Minimal CSV parser. Handles quoted fields with embedded commas and
 * doubled-double-quote escapes. Strict on header presence.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cur.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cur.push(field);
        if (cur.length > 1 || cur[0] !== '') rows.push(cur);
        cur = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = r[i] ?? '';
    }
    return obj;
  });
}

function loadLabeledRows(opts: { allowMissingLabels?: boolean } = {}): LabeledRow[] {
  const raw = readFileSync(CSV_PATH, 'utf8');
  const parsed = parseCsv(raw);
  const rows: LabeledRow[] = [];
  const errors: string[] = [];

  parsed.forEach((r, idx) => {
    const lineNum = idx + 2; // header is line 1
    const rawScore = (r.score || '').toLowerCase().trim();
    let score: MaterialityScore;
    if (!rawScore) {
      if (!opts.allowMissingLabels) {
        errors.push(`Line ${lineNum} (${r.accessionNumber || '<no-accession>'}): missing score`);
        return;
      }
      // Dry-run / smoke-test mode: stub the score with 'noise' so the runner
      // can still exercise prompt building + content fetch. Accuracy tally
      // will be meaningless but that's expected for unlabeled dry-runs.
      score = 'noise';
    } else if (!VALID_SCORES.has(rawScore as MaterialityScore)) {
      errors.push(`Line ${lineNum} (${r.accessionNumber}): invalid score "${rawScore}"`);
      return;
    } else {
      score = rawScore as MaterialityScore;
    }
    if (!VALID_FORM_TYPES.has(r.formType)) {
      errors.push(`Line ${lineNum} (${r.accessionNumber}): invalid formType "${r.formType}"`);
      return;
    }
    if (!r.accessionNumber) {
      errors.push(`Line ${lineNum}: missing accessionNumber`);
      return;
    }
    // Accept either old column names (filingDate, secUrl) or new ones from
    // FilingContentCache-based sampler (fetchedAt, primaryDocUrl).
    const dateValue = r.fetchedAt || r.filingDate || '';
    const urlValue = r.primaryDocUrl || r.secUrl || '';
    rows.push({
      accessionNumber: r.accessionNumber,
      formType: r.formType as MaterialityFormType,
      ticker: r.ticker,
      companyName: r.companyName,
      filingDate: dateValue,
      secUrl: urlValue,
      contentChars: parseInt(r.contentChars || '0', 10),
      humanScore: score,
      humanRationale: (r.rationale || '').trim(),
      notes: (r.notes || '').trim(),
    });
  });

  if (errors.length > 0) {
    console.error('CSV validation errors:');
    for (const e of errors) console.error('  -', e);
    throw new Error(`${errors.length} CSV row(s) failed validation. Fix and re-run.`);
  }
  return rows;
}

async function fetchFilingContent(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  accessionNumber: string,
): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ content: string }>>(
    `SELECT content FROM pipeline."FilingContentCache" WHERE "accessionNumber" = $1 LIMIT 1`,
    accessionNumber,
  );
  if (rows.length === 0) return null;
  return rows[0].content;
}

/**
 * Strip HTML/XBRL and locate the actual narrative sections of an SEC filing.
 *
 * The raw `FilingContentCache.content` for large filings begins with hundreds
 * of KB of XBRL header metadata (us-gaap:* tags, xbrli:context definitions,
 * dei:* element values). Feeding that as the model's "filing excerpt" causes
 * verbose XBRL-describing rationales and zero materiality signal — verified
 * empirically in the 2026-05-13T12-22 calibration run: all 14 parse failures
 * were `rationale_too_long` because the model described the tag soup instead
 * of classifying narrative content.
 *
 * Strategy: strip tags, then locate the LAST occurrence of section headers
 * (skipping TOC entries which appear first), and concatenate cleaned snippets.
 */
function preprocessFilingContent(rawContent: string, formType: string): string {
  const stripped = rawContent
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const findLastMatch = (patterns: RegExp[], len: number): string => {
    for (const p of patterns) {
      const gp = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g');
      let m: RegExpExecArray | null;
      let last = -1;
      let count = 0;
      while ((m = gp.exec(stripped)) !== null) {
        last = m.index;
        if (++count > 10) break;
      }
      if (last >= 0) return stripped.slice(last, last + len);
    }
    return '';
  };

  const isTenK = formType.startsWith('10-K');
  const riskPatterns = [
    /Item\s*1A[\.:\s]*Risk\s*Factors/i,
    /Risk\s*Factors/i,
  ];
  const mdaPatterns = isTenK
    ? [
        /Item\s*7[\.:\s]*Management['']?s?\s*Discussion/i,
        /Management['']?s?\s*Discussion\s*and\s*Analysis/i,
      ]
    : [
        /Item\s*2[\.:\s]*Management['']?s?\s*Discussion/i,
        /Management['']?s?\s*Discussion\s*and\s*Analysis/i,
      ];
  const overviewPatterns = [
    /Item\s*1[\.:\s]*Business/i,
    /Business\s*Overview/i,
  ];

  const overview = findLastMatch(overviewPatterns, 4_000);
  const risk = findLastMatch(riskPatterns, 8_000);
  const mda = findLastMatch(mdaPatterns, 14_000);

  // If we couldn't locate any section header, fall back to a mid-document slab
  // (skip XBRL header which sits in the first ~100KB on large filings).
  if (!overview && !risk && !mda) {
    const skip = Math.min(100_000, Math.floor(stripped.length / 4));
    return stripped.slice(skip, skip + 40_000);
  }

  // Section labels removed: the regex matches on TOC entries that often sit
  // BEFORE the actual section bodies, so the extract under "=== RISK FACTORS ==="
  // can actually contain the financial statements that follow the TOC. Grok-4.3
  // reads section labels literally and dismisses content that doesn't match —
  // verified in 2026-05-15 v4 calibration where MSFT was classified NOISE
  // despite +18% revenue YoY in the extract. Better to present unlabelled prose
  // and let the model classify by content.
  return [overview, risk, mda].filter(Boolean).join('\n\n[...]\n\n');
}

async function classifyOne(row: LabeledRow, content: string, dryRun: boolean): Promise<RunResult> {
  const userPrompt = buildMaterialityUserPrompt({
    formType: row.formType,
    ticker: row.ticker,
    companyName: row.companyName,
    filingContent: content,
  });
  const input = `${MATERIALITY_SYSTEM_PROMPT}\n\n${userPrompt}`;

  if (dryRun) {
    return {
      row,
      predicted: null,
      predictedRationale: null,
      parseError: 'dry_run',
      costUsd: 0,
      latencyMs: 0,
    };
  }

  try {
    const response = await callXaiResponses({
      input,
      // CALIBRATION_MODEL lets you override per run. Default is grok-4.3 (the
      // production target). Earlier runs used grok-4.20-0309-reasoning while
      // the API key was scoped to a model subset; key now spans the full team
      // catalog so grok-4.3 works end-to-end.
      model: process.env.CALIBRATION_MODEL ?? 'grok-4.3',
      timeoutMs: 60_000,
    });
    const parseResult = parseMaterialityResponse(response.text);
    if (!parseResult.ok || !parseResult.signal) {
      return {
        row,
        predicted: null,
        predictedRationale: null,
        parseError: parseResult.error ?? 'unknown_parse_error',
        costUsd: response.usage.costUsd,
        latencyMs: response.latencyMs,
      };
    }
    return {
      row,
      predicted: parseResult.signal.score,
      predictedRationale: parseResult.signal.rationale,
      parseError: null,
      costUsd: response.usage.costUsd,
      latencyMs: response.latencyMs,
    };
  } catch (err) {
    const msg = err instanceof XaiDirectError ? `${err.code}: ${err.message}` : (err as Error).message;
    return {
      row,
      predicted: null,
      predictedRationale: null,
      parseError: `xai_error:${msg}`,
      costUsd: 0,
      latencyMs: 0,
    };
  }
}

function tallyResults(results: RunResult[]): {
  matrix: MaterialityConfusionMatrix;
  correct: number;
  parseFailures: number;
  perTier: Record<MaterialityScore, { correct: number; total: number }>;
} {
  const matrix = emptyConfusionMatrix();
  const perTier: Record<MaterialityScore, { correct: number; total: number }> = {
    high: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    low: { correct: 0, total: 0 },
    noise: { correct: 0, total: 0 },
  };
  let correct = 0;
  let parseFailures = 0;
  for (const r of results) {
    perTier[r.row.humanScore].total++;
    if (r.predicted === null) {
      parseFailures++;
      continue;
    }
    matrix[r.row.humanScore][r.predicted]++;
    if (r.predicted === r.row.humanScore) {
      correct++;
      perTier[r.row.humanScore].correct++;
    }
  }
  return { matrix, correct, parseFailures, perTier };
}

function formatMatrix(matrix: MaterialityConfusionMatrix): string {
  const scores: MaterialityScore[] = ['high', 'medium', 'low', 'noise'];
  const header = '| truth ↓ \\ pred → | ' + scores.map((s) => s).join(' | ') + ' |';
  const sep = '|---' + '|---'.repeat(scores.length) + '|';
  const body = scores.map((truth) => {
    const cells = scores.map((pred) => matrix[truth][pred].toString());
    return `| **${truth}** | ${cells.join(' | ')} |`;
  });
  return [header, sep, ...body].join('\n');
}

function writeReport(
  results: RunResult[],
  tally: ReturnType<typeof tallyResults>,
  totalCost: number,
  totalDurationMs: number,
  dryRun: boolean,
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = resolve(REPORT_DIR, `calibration-report-${stamp}.md`);
  const overallAcc = results.length > 0 ? tally.correct / results.length : 0;
  const verdict = overallAcc >= ACCURACY_GATE ? 'PASS' : 'FAIL';
  const mismatches = results.filter((r) => r.predicted !== null && r.predicted !== r.row.humanScore);
  const parseFailures = results.filter((r) => r.predicted === null);

  const lines: string[] = [
    `# Materiality Calibration Report`,
    ``,
    `**Generated**: ${new Date().toISOString()}`,
    `**Dry run**: ${dryRun ? 'YES (no model calls made)' : 'no'}`,
    `**Verdict**: **${verdict}** (gate: ≥${ACCURACY_GATE * 100}% overall accuracy)`,
    ``,
    `## Overall`,
    ``,
    `- **Accuracy**: ${tally.correct}/${results.length} = **${(overallAcc * 100).toFixed(1)}%**`,
    `- **Parse failures**: ${tally.parseFailures}/${results.length}`,
    `- **Total cost**: $${totalCost.toFixed(4)}`,
    `- **Total wall-clock**: ${(totalDurationMs / 1000).toFixed(1)}s`,
    ``,
    `## Per-tier accuracy`,
    ``,
  ];
  for (const tier of ['high', 'medium', 'low', 'noise'] as const) {
    const t = tally.perTier[tier];
    const pct = t.total > 0 ? ((t.correct / t.total) * 100).toFixed(1) : 'n/a';
    lines.push(`- **${tier}**: ${t.correct}/${t.total} = ${pct}%`);
  }
  lines.push(``);
  lines.push(`## Confusion matrix`);
  lines.push(``);
  lines.push(`Rows = human label (truth). Columns = model prediction.`);
  lines.push(``);
  lines.push(formatMatrix(tally.matrix));
  lines.push(``);

  if (mismatches.length > 0) {
    lines.push(`## Mismatches (${mismatches.length})`);
    lines.push(``);
    for (const m of mismatches) {
      lines.push(`### ${m.row.ticker} ${m.row.formType} — ${m.row.accessionNumber}`);
      lines.push(``);
      lines.push(`- **Filed**: ${m.row.filingDate}`);
      lines.push(`- **Human label**: \`${m.row.humanScore}\``);
      lines.push(`- **Model prediction**: \`${m.predicted}\``);
      lines.push(`- **Human rationale**: ${m.row.humanRationale}`);
      lines.push(`- **Model rationale**: ${m.predictedRationale}`);
      if (m.row.notes) lines.push(`- **Human notes**: ${m.row.notes}`);
      lines.push(`- **Filing**: ${m.row.secUrl}`);
      lines.push(``);
    }
  }

  if (parseFailures.length > 0) {
    lines.push(`## Parse failures (${parseFailures.length})`);
    lines.push(``);
    for (const p of parseFailures) {
      lines.push(
        `- ${p.row.ticker} ${p.row.formType} (${p.row.accessionNumber}): ${p.parseError}`,
      );
    }
    lines.push(``);
  }

  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
  return path;
}

async function main(): Promise<void> {
  const cli = parseCliArgs();
  console.log('Materiality calibration runner');
  console.log(`Mode: ${cli.dryRun ? 'DRY RUN (no API calls)' : 'LIVE'}`);
  if (cli.limit !== null) console.log(`Limit: ${cli.limit} rows`);
  console.log('');

  const allRows = loadLabeledRows({ allowMissingLabels: cli.dryRun });
  const rows = cli.limit !== null ? allRows.slice(0, cli.limit) : allRows;
  console.log(`Loaded ${rows.length} labeled rows (${allRows.length} total in CSV)`);

  const prisma = getPrismaClient();
  const results: RunResult[] = [];
  const startedAt = Date.now();
  let totalCost = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`[${i + 1}/${rows.length}] ${row.ticker} ${row.formType} `);
    const rawContent = await fetchFilingContent(prisma, row.accessionNumber);
    if (rawContent === null) {
      console.log('SKIP (no content cache)');
      results.push({
        row,
        predicted: null,
        predictedRationale: null,
        parseError: 'no_filing_content',
        costUsd: 0,
        latencyMs: 0,
      });
      continue;
    }
    const content = preprocessFilingContent(rawContent, row.formType);
    const result = await classifyOne(row, content, cli.dryRun);
    totalCost += result.costUsd;
    if (result.parseError) {
      console.log(`✗ ${result.parseError}`);
    } else {
      const match = result.predicted === row.humanScore ? '✓' : '✗';
      console.log(`${match} pred=${result.predicted} truth=${row.humanScore}`);
    }
    results.push(result);
  }

  const totalDurationMs = Date.now() - startedAt;
  const tally = tallyResults(results);

  console.log('');
  console.log(`Accuracy: ${tally.correct}/${results.length} = ${((tally.correct / results.length) * 100).toFixed(1)}%`);
  console.log(`Parse failures: ${tally.parseFailures}`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);
  console.log(`Wall-clock: ${(totalDurationMs / 1000).toFixed(1)}s`);

  const reportPath = writeReport(results, tally, totalCost, totalDurationMs, cli.dryRun);
  console.log(`Report: ${reportPath}`);

  await prisma.$disconnect();

  const overallAcc = results.length > 0 ? tally.correct / results.length : 0;
  if (!cli.dryRun && overallAcc < ACCURACY_GATE) {
    console.error(`FAIL: accuracy ${(overallAcc * 100).toFixed(1)}% < gate ${ACCURACY_GATE * 100}%`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Calibration failed:', err);
  process.exit(1);
});
