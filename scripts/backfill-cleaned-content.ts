#!/usr/bin/env tsx
/**
 * Backfills FilingContentCache.cleanedContent for any pre-Layer-A rows.
 *
 * Layer C's self-healing read (lib/cron/handlers/summarize-cached-handler.ts)
 * will do this lazily on first summarize, but running this script proactively
 * warms the cache and avoids the per-row latency cost on first hit.
 *
 * Usage:
 *   npx tsx scripts/backfill-cleaned-content.ts [--dry-run]
 *
 * --dry-run  Count affected rows without writing.
 */

import { getPrismaClient } from '../lib/db/prisma';
import { cleanHtmlContent } from '../lib/parsers/filing-extractor';

const BATCH_SIZE = 50;
const ROWS_PER_SECOND = 10;
const BATCH_SLEEP_MS = Math.ceil((BATCH_SIZE / ROWS_PER_SECOND) * 1000);
const LOG_INTERVAL = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBackfill(options: { dryRun: boolean; sleepMs?: number }): Promise<void> {
  const { dryRun } = options;
  const effectiveSleepMs = options.sleepMs ?? BATCH_SLEEP_MS;
  const prisma = getPrismaClient();

  console.log(
    `[backfill-cleaned-content] Starting${dryRun ? ' (DRY RUN — no writes)' : ''}...`
  );

  let cursor: string | undefined;
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (;;) {
    const rows = await prisma.filingContentCache.findMany({
      where: { cleanedContent: null, status: 'CACHED' },
      select: { id: true, content: true },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });

    if (rows.length === 0) break;

    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      try {
        const cleaned = cleanHtmlContent(row.content);
        if (cleaned.length === 0) {
          console.warn(
            `[backfill-cleaned-content] WARN: cleaning produced empty string for id=${row.id} — skipping`
          );
          skipped++;
          continue;
        }

        if (!dryRun) {
          await prisma.filingContentCache.update({
            where: { id: row.id },
            data: { cleanedContent: cleaned, cleanedAt: new Date() },
          });
        }
        processed++;
      } catch (err) {
        errors++;
        console.error(
          `[backfill-cleaned-content] ERROR processing id=${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }

      if ((processed + skipped + errors) % LOG_INTERVAL === 0 && processed + skipped + errors > 0) {
        console.log(
          `[backfill-cleaned-content] [${processed} processed, ${skipped} skipped, ${errors} errors]`
        );
      }
    }

    await sleep(effectiveSleepMs);
  }

  console.log(
    `[backfill-cleaned-content] Done.${dryRun ? ' (DRY RUN)' : ''} ` +
      `processed=${processed} skipped=${skipped} errors=${errors}`
  );
}

// Entry point when run directly
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  runBackfill({ dryRun }).catch((err) => {
    console.error('[backfill-cleaned-content] Fatal:', err);
    process.exit(1);
  });
}
