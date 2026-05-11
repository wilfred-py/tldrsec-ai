/**
 * Backfill: Summary.enrichmentApplied = true for legacy rows whose summaryJSON
 * already contains a `whyItMatters` field.
 *
 * Phase 3 of `tasks/x-search-max-only.md`. Runs post-deploy, after the schema
 * migration in PR #489 lands and the post-deploy `CREATE INDEX CONCURRENTLY`
 * has completed.
 *
 * Why a separate script (not in-migration):
 *   The Summary table can have millions of rows. A single-statement
 *   `UPDATE ... WHERE summary_json ? 'whyItMatters'` would hold row locks
 *   across the whole table for minutes and block production writes
 *   (per Performance review 13A in the plan).
 *
 * Why self-paginating (not id BETWEEN ranges):
 *   Summary.id is a UUID, not a sequence. We can't carve numeric ranges.
 *   Instead, each iteration UPDATEs up to `batchSize` rows that still match
 *   `enrichmentApplied = false AND summaryJSON ? 'whyItMatters'` — flipping
 *   the flag naturally shrinks the working set, so the loop terminates when
 *   the SELECT returns < batchSize rows.
 *
 * Idempotency:
 *   Safe to re-run. The `enrichmentApplied = false` filter excludes rows
 *   already flipped. New rows landing during the backfill window default
 *   to false; the rare Max user hitting one of those rows pays a one-shot
 *   regen, which is acceptable.
 *
 * Run:
 *   npx tsx scripts/backfill-enrichment-applied.ts --dry-run
 *   npx tsx scripts/backfill-enrichment-applied.ts
 *   npx tsx scripts/backfill-enrichment-applied.ts --batch-size=10000 --sleep-ms=200
 */

import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import path from 'path';

const DEFAULT_BATCH_SIZE = 5000;
const DEFAULT_SLEEP_MS = 100;

interface Options {
  batchSize: number;
  sleepMs: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    batchSize: DEFAULT_BATCH_SIZE,
    sleepMs: DEFAULT_SLEEP_MS,
    dryRun: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--batch-size=')) {
      opts.batchSize = Number(a.split('=')[1]);
    } else if (a.startsWith('--sleep-ms=')) {
      opts.sleepMs = Number(a.split('=')[1]);
    }
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

export interface BackfillResult {
  totalUpdated: number;
  batches: number;
  remainingCandidates: number;
  dryRun: boolean;
}

/**
 * Exported for the migration regression test (`__tests__/migrations/
 * enrichment-applied-backfill.test.ts`). The test creates a fresh PrismaClient
 * pointed at a real DB, seeds fixture rows, then calls this directly.
 */
export async function runBackfill(
  prisma: PrismaClient,
  opts: Options
): Promise<BackfillResult> {
  let totalUpdated = 0;
  let batches = 0;

  const candidatesRow = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "app"."Summary"
    WHERE "enrichmentApplied" = false
      AND "summaryJSON" ? 'whyItMatters'
  `;
  const initialCandidates = Number(candidatesRow[0]?.count ?? 0);
  log(`Initial candidate rows (enrichmentApplied=false ∧ has whyItMatters): ${initialCandidates}`);

  if (initialCandidates === 0) {
    return { totalUpdated: 0, batches: 0, remainingCandidates: 0, dryRun: opts.dryRun };
  }

  if (opts.dryRun) {
    log(`[DRY RUN] Would update ${initialCandidates} rows in batches of ${opts.batchSize}`);
    return {
      totalUpdated: 0,
      batches: 0,
      remainingCandidates: initialCandidates,
      dryRun: true,
    };
  }

  while (true) {
    batches++;
    const updated = await prisma.$executeRaw`
      UPDATE "app"."Summary"
      SET "enrichmentApplied" = true
      WHERE id IN (
        SELECT id
        FROM "app"."Summary"
        WHERE "enrichmentApplied" = false
          AND "summaryJSON" ? 'whyItMatters'
        LIMIT ${opts.batchSize}
      )
    `;

    totalUpdated += updated;
    log(`  batch ${batches}: updated ${updated} rows (running total: ${totalUpdated})`);

    if (updated < opts.batchSize) break;
    if (opts.sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.sleepMs));
    }
  }

  const remainingRow = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "app"."Summary"
    WHERE "enrichmentApplied" = false
      AND "summaryJSON" ? 'whyItMatters'
  `;
  const remainingCandidates = Number(remainingRow[0]?.count ?? 0);

  return { totalUpdated, batches, remainingCandidates, dryRun: false };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  log('='.repeat(60));
  log('Summary.enrichmentApplied backfill');
  log(`Mode:       ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`);
  log(`Batch size: ${opts.batchSize}`);
  log(`Sleep ms:   ${opts.sleepMs}`);
  log('='.repeat(60));

  const prisma = new PrismaClient();
  try {
    const result = await runBackfill(prisma, opts);
    log('='.repeat(60));
    log('Done');
    log(`  Batches:               ${result.batches}`);
    log(`  Rows updated:          ${result.totalUpdated}`);
    log(`  Remaining candidates:  ${result.remainingCandidates}`);
    log(`  Mode:                  ${result.dryRun ? 'DRY RUN' : 'LIVE'}`);
    log('='.repeat(60));
    if (result.remainingCandidates > 0 && !result.dryRun) {
      log('WARNING: some candidates remain — likely new writes during backfill.');
      log('         Re-running is safe (idempotent).');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Project is "type": "module" — `require.main === module` throws ReferenceError
// when this file is executed directly via `tsx`. Match the ESM-safe pattern
// already used by `scripts/verify-daily-pipeline.ts`: derive the absolute path
// of THIS file from `import.meta.url`, compare against `process.argv[1]`, and
// only call main() when they match. Jest's transform also handles this — the
// regression test in `__tests__/migrations/enrichment-applied-backfill.test.ts`
// imports `runBackfill` and the comparison evaluates to false there, so main()
// stays dormant.
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && (
  path.resolve(process.argv[1]) === __filename ||
  path.resolve(process.argv[1]) === path.resolve(__filename)
);

if (isMainModule) {
  main().catch((err) => {
    log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
