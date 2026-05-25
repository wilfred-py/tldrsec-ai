/**
 * Backfill: re-summarize Summary rows that shipped with failure-phrase language
 * (e.g. NVDA 2026-05-20 "no extractable financial metrics" email).
 *
 * Layer E of NVDA 10-Q missing-metrics fix. See plan at
 * .claude/tasks/nvda-10q-missing-metrics-fix.md
 *
 * Why a separate script (not in-pipeline):
 *   Re-summarization is destructive (overwrites summaryText / summaryJSON).
 *   Operator should run it explicitly post-deploy of Layers A-D, confirm
 *   the fix produces correct output on a sample, then run at scale.
 *
 * What it does:
 *   1. Finds Summary rows where summaryText contains failure phrases
 *      AND createdAt within the lookback window (default 30 days).
 *   2. For each row, calls the same summarization pipeline the cron uses
 *      (summarizeFilingWithValidation) against the cached content.
 *      Layer A/C populates `cleanedContent`, so the re-run uses the
 *      iXBRL-cleaned text rather than the raw HTML that caused the bug.
 *   3. If the new summary STILL contains failure phrases, marks
 *      processingErrorCode = 'PERSISTENTLY_UNEXTRACTABLE' and
 *      processingStatus = 'FAILED'. Skip in place (filing genuinely
 *      can't be extracted — e.g. XBRL-only attachment).
 *   4. Otherwise, updates summaryText + summaryJSON in place.
 *
 * Pre-launch context (per memory `project-prelaunch-no-users.md`):
 *   - No real users; all SummaryEmailDelivery rows belong to test addresses.
 *   - No correction emails sent — operator manually re-tests via existing
 *     `npx tsx scripts/send-pr1-test-email.ts` pattern.
 *
 * Run:
 *   npx tsx scripts/backfill-bad-summaries.ts --dry-run
 *   npx tsx scripts/backfill-bad-summaries.ts
 *   npx tsx scripts/backfill-bad-summaries.ts --lookback-days=7 --batch-size=20
 */

import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import path from 'path';

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_SLEEP_MS = 1000; // gentle throttle — re-summarize calls Grok

// Same regex as financial-content-gate.ts:SUMMARY_FAILURE_PHRASES_RE.
// Duplicated here (not imported) to keep this script standalone-runnable
// without requiring the test/jest infrastructure that wraps that module.
const FAILURE_PHRASES_RE =
  /\b(?:no extractable|are unavailable|minimal or no|could not be fully extracted|limited information available)\b/i;

interface Options {
  lookbackDays: number;
  batchSize: number;
  sleepMs: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    batchSize: DEFAULT_BATCH_SIZE,
    sleepMs: DEFAULT_SLEEP_MS,
    dryRun: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--lookback-days=')) opts.lookbackDays = Number(a.split('=')[1]);
    else if (a.startsWith('--batch-size=')) opts.batchSize = Number(a.split('=')[1]);
    else if (a.startsWith('--sleep-ms=')) opts.sleepMs = Number(a.split('=')[1]);
  }
  if (!Number.isFinite(opts.lookbackDays) || opts.lookbackDays <= 0) {
    throw new Error(`Invalid --lookback-days: ${opts.lookbackDays}`);
  }
  if (!Number.isFinite(opts.batchSize) || opts.batchSize <= 0) {
    throw new Error(`Invalid --batch-size: ${opts.batchSize}`);
  }
  if (!Number.isFinite(opts.sleepMs) || opts.sleepMs < 0) {
    throw new Error(`Invalid --sleep-ms: ${opts.sleepMs}`);
  }
  return opts;
}

function ts(): string {
  return new Date().toISOString();
}

function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface BackfillResult {
  scanned: number;
  reprocessed: number;
  fixed: number;
  persistentlyUnextractable: number;
  errors: number;
  dryRun: boolean;
}

async function findCandidates(prisma: PrismaClient, lookbackDays: number) {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Use raw SQL because Prisma doesn't expose case-insensitive LIKE cleanly
  // for the failure-phrase OR filter. The Summary table lives in the `app`
  // schema (per @@schema directive in prisma/schema.prisma).
  return prisma.$queryRaw<Array<{
    id: string;
    tickerId: string;
    filingType: string;
    filingUrl: string;
    summaryText: string;
    createdAt: Date;
  }>>`
    SELECT id, "tickerId", "filingType", "filingUrl", "summaryText", "createdAt"
    FROM app."Summary"
    WHERE "createdAt" > ${cutoff}
      AND (
        "summaryText" ILIKE '%are unavailable%'
        OR "summaryText" ILIKE '%no extractable%'
        OR "summaryText" ILIKE '%minimal or no%'
        OR "summaryText" ILIKE '%could not be fully extracted%'
        OR "summaryText" ILIKE '%limited information available%'
      )
    ORDER BY "createdAt" DESC
  `;
}

async function main(): Promise<BackfillResult> {
  const opts = parseArgs(process.argv.slice(2));
  log(
    `Starting backfill: lookback=${opts.lookbackDays}d batchSize=${opts.batchSize} ` +
    `sleep=${opts.sleepMs}ms dryRun=${opts.dryRun}`
  );

  const prisma = new PrismaClient();
  const result: BackfillResult = {
    scanned: 0,
    reprocessed: 0,
    fixed: 0,
    persistentlyUnextractable: 0,
    errors: 0,
    dryRun: opts.dryRun,
  };

  try {
    const candidates = await findCandidates(prisma, opts.lookbackDays);
    result.scanned = candidates.length;

    log(`Found ${candidates.length} candidate Summary rows`);

    if (opts.dryRun) {
      log(`--- DRY RUN — sample of first 5 candidates ---`);
      for (const row of candidates.slice(0, 5)) {
        log(
          `  ${row.id} | ${row.filingType} | ${row.createdAt.toISOString()} | ` +
          `"${row.summaryText.slice(0, 80)}..."`
        );
      }
      log(`--- END DRY RUN ---`);
      return result;
    }

    // The destructive re-summarize loop is NOT implemented yet — it needs
    // either (a) JobPayload reconstruction (userId, ticker, executionContext)
    // to re-enqueue via JobQueueService.addJob, or (b) cache-lookup-by-filingUrl
    // join + inline summarizeFilingWithValidation. Both are substantial wiring
    // (see plan: .claude/tasks/nvda-10q-missing-metrics-fix.md Layer E TODO).
    //
    // FAIL LOUD instead of silently incrementing a "reprocessed" counter.
    // Operator must explicitly pass --dry-run for now.
    log(`ERROR: destructive re-summarize loop is not yet implemented.`);
    log(`Found ${candidates.length} candidate rows. Use --dry-run to inspect them.`);
    log(`To actually re-process: implement the JobPayload reconstruction or inline summarize`);
    log(`path documented at the top of this file, then remove this guard.`);
    result.errors = candidates.length;
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

// Run when invoked as a script (npx tsx scripts/backfill-bad-summaries.ts)
const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  main()
    .then((result) => {
      process.exit(result.errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(`[${ts()}] FATAL:`, err);
      process.exit(1);
    });
}

export { main, findCandidates, FAILURE_PHRASES_RE };
export type { BackfillResult, Options };
