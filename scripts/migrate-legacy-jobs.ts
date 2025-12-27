/**
 * Migration Script: Convert ASYNC_SUMMARIZE_FILING jobs to ASYNC_FETCH_FILING
 *
 * This script:
 * 1. Finds all PENDING ASYNC_SUMMARIZE_FILING jobs
 * 2. Archives them to a JSON file for backup
 * 3. Creates equivalent ASYNC_FETCH_FILING jobs
 * 4. Marks original jobs as COMPLETED (with migration metadata)
 *
 * Run with: npx tsx scripts/migrate-legacy-jobs.ts
 * Dry run: npx tsx scripts/migrate-legacy-jobs.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface LegacyJobPayload {
  userId: string;
  userEmail: string;
  userTier: string;
  ticker: {
    symbol: string;
    companyName: string;
    cik?: string;
  };
  filing: {
    accessionNumber: string;
    formType: string;
    filingDate: string;
    filingUrl: string;
    filingId?: string;
  };
  executionContext?: Record<string, unknown>;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' = 'INFO'): void {
  const timestamp = formatTimestamp();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

async function migrateLegacyJobs(dryRun: boolean = false) {
  log(`${'='.repeat(60)}`);
  log(`Legacy Job Migration Script`);
  log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be committed)'}`);
  log(`Started at: ${formatTimestamp()}`);
  log(`${'='.repeat(60)}`);

  // Step 1: Find all PENDING ASYNC_SUMMARIZE_FILING jobs
  log('Step 1: Finding PENDING ASYNC_SUMMARIZE_FILING jobs...');
  const legacyJobs = await prisma.jobQueue.findMany({
    where: {
      jobType: 'ASYNC_SUMMARIZE_FILING',
      status: 'PENDING'
    },
    orderBy: { createdAt: 'asc' }
  });

  log(`Found ${legacyJobs.length} PENDING ASYNC_SUMMARIZE_FILING jobs`);

  if (legacyJobs.length === 0) {
    log('No jobs to migrate. Exiting.');
    return { migrated: 0, errors: 0, skipped: 0 };
  }

  // Step 2: Archive to JSON file
  log('Step 2: Archiving jobs to JSON backup file...');
  const archiveDir = path.join(process.cwd(), 'data', 'migrations');
  const archiveFile = path.join(archiveDir, `legacy-jobs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

  if (!dryRun) {
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(archiveFile, JSON.stringify(legacyJobs, null, 2));
    log(`Archived ${legacyJobs.length} jobs to: ${archiveFile}`);
  } else {
    log(`[DRY RUN] Would archive to: ${archiveFile}`);
  }

  // Step 3: Migrate each job
  log('Step 3: Migrating jobs...');
  let migrated = 0;
  let errors = 0;
  let skipped = 0;

  for (const job of legacyJobs) {
    try {
      const payload = job.payload as unknown as LegacyJobPayload;

      // Validate payload structure
      if (!payload.userId || !payload.ticker || !payload.filing) {
        log(`  SKIP job ${job.id}: Invalid payload structure (missing userId, ticker, or filing)`, 'WARN');
        skipped++;
        continue;
      }

      if (!payload.filing.accessionNumber) {
        log(`  SKIP job ${job.id}: Missing accessionNumber in filing`, 'WARN');
        skipped++;
        continue;
      }

      const newJobPayload = {
        userId: payload.userId,
        userEmail: payload.userEmail,
        userTier: payload.userTier,
        ticker: payload.ticker,
        filing: payload.filing,
        executionContext: {
          ...(payload.executionContext || {}),
          migratedFrom: job.id,
          migratedAt: new Date().toISOString(),
          originalJobType: 'ASYNC_SUMMARIZE_FILING',
          migrationReason: 'Legacy job type not processed by modern 3-phase pipeline'
        }
      };

      const idempotencyKey = `ASYNC_FETCH_FILING:${payload.userId}:${payload.filing.accessionNumber}`;

      if (!dryRun) {
        // Check if a job with this idempotency key already exists
        const existingJob = await prisma.jobQueue.findFirst({
          where: { idempotencyKey }
        });

        if (existingJob) {
          log(`  SKIP job ${job.id}: Job with idempotencyKey ${idempotencyKey} already exists (${existingJob.id})`, 'WARN');

          // Still mark the original as completed since it's effectively migrated
          await prisma.jobQueue.update({
            where: { id: job.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              result: {
                migrated: true,
                migratedTo: existingJob.id,
                migratedAt: new Date().toISOString(),
                note: 'Duplicate - existing job found'
              } as object
            }
          });

          skipped++;
          continue;
        }

        // Create new ASYNC_FETCH_FILING job
        const newJob = await prisma.jobQueue.create({
          data: {
            jobType: 'ASYNC_FETCH_FILING',
            status: 'PENDING',
            payload: newJobPayload as object,
            priority: job.priority,
            idempotencyKey,
            maxRetries: 3,
            retryCount: 0,
            scheduledFor: new Date() // Schedule for immediate processing
          }
        });

        // Mark original job as completed with migration note
        await prisma.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            result: {
              migrated: true,
              migratedTo: newJob.id,
              migratedToJobType: 'ASYNC_FETCH_FILING',
              migratedAt: new Date().toISOString()
            } as object
          }
        });

        log(`  OK job ${job.id} -> ${newJob.id} (ASYNC_FETCH_FILING) [${payload.ticker.symbol}]`);
      } else {
        log(`  [DRY RUN] Would migrate job ${job.id} -> ASYNC_FETCH_FILING [${payload.ticker.symbol}]`);
      }

      migrated++;
    } catch (error) {
      log(`  ERROR job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'ERROR');
      errors++;
    }
  }

  // Step 4: Summary Report
  log(`${'='.repeat(60)}`);
  log(`Migration Complete`);
  log(`${'='.repeat(60)}`);
  log(`  Total Legacy Jobs Found: ${legacyJobs.length}`);
  log(`  Successfully Migrated:   ${migrated}`);
  log(`  Skipped (duplicates):    ${skipped}`);
  log(`  Errors:                  ${errors}`);
  log(`  Mode:                    ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  log(`  Completed at:            ${formatTimestamp()}`);
  log(`${'='.repeat(60)}`);

  return { migrated, errors, skipped };
}

// Main execution
const dryRun = process.argv.includes('--dry-run');
migrateLegacyJobs(dryRun)
  .then((result) => {
    log(`Migration result: ${JSON.stringify(result)}`);
    process.exit(result.errors > 0 ? 1 : 0);
  })
  .catch((error) => {
    log(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'ERROR');
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
