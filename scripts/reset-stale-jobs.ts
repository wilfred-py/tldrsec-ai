/**
 * Script to reset stale PROCESSING jobs back to PENDING
 * Run: npx tsx scripts/reset-stale-jobs.ts
 *
 * This addresses jobs that got stuck in PROCESSING state due to:
 * - Vercel function timeouts
 * - Uncaught errors during processing
 * - Worker process crashes
 */

import { prisma } from '../lib/db/prisma.js';

// Jobs stuck in PROCESSING for more than 5 minutes are considered stale
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

async function resetStaleJobs() {
  console.log('🔧 Resetting Stale PROCESSING Jobs\n');
  console.log(`Threshold: Jobs processing for > ${STALE_THRESHOLD_MS / 60000} minutes\n`);

  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  // Find stale PROCESSING jobs
  const staleJobs = await prisma.jobQueue.findMany({
    where: {
      status: 'PROCESSING',
      startedAt: { lt: staleThreshold }
    },
    select: {
      id: true,
      startedAt: true,
      retryCount: true,
      maxRetries: true,
      payload: true
    }
  });

  console.log(`Found ${staleJobs.length} stale PROCESSING jobs\n`);

  if (staleJobs.length === 0) {
    console.log('No stale jobs to reset.');
    return;
  }

  // Show details of stale jobs
  console.log('Stale jobs to reset:');
  for (const job of staleJobs) {
    const payload = job.payload as Record<string, unknown>;
    const ticker = (payload?.ticker as Record<string, unknown>)?.symbol || 'N/A';
    const processingTime = job.startedAt
      ? Math.round((Date.now() - job.startedAt.getTime()) / 1000)
      : 0;
    console.log(`  - ${job.id.substring(0, 8)}... | ${ticker} | ${processingTime}s | retries: ${job.retryCount}/${job.maxRetries}`);
  }

  // Reset stale jobs back to RETRYING (will increment retryCount)
  let resetCount = 0;
  let failedCount = 0;

  for (const job of staleJobs) {
    const newRetryCount = job.retryCount + 1;
    const shouldFail = newRetryCount >= job.maxRetries;

    if (shouldFail) {
      // Max retries exceeded - mark as FAILED
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastError: `Stale job recovery: exceeded max retries (${job.maxRetries}) after ${STALE_THRESHOLD_MS / 60000}min timeout`
        }
      });
      failedCount++;
    } else {
      // Reset to RETRYING for another attempt
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'RETRYING',
          startedAt: null,
          retryCount: newRetryCount,
          lastError: `Stale job recovery: reset after ${STALE_THRESHOLD_MS / 60000}min timeout`
        }
      });
      resetCount++;
    }
  }

  console.log(`\n✅ Reset ${resetCount} jobs to RETRYING`);
  console.log(`❌ Marked ${failedCount} jobs as FAILED (max retries exceeded)`);

  // Show updated status counts
  const afterStats = await prisma.jobQueue.groupBy({
    by: ['status'],
    _count: true,
  });

  console.log('\n📊 Job Queue Status AFTER reset:');
  const statusOrder = ['COMPLETED', 'PROCESSING', 'PENDING', 'RETRYING', 'FAILED'];
  for (const status of statusOrder) {
    const found = afterStats.find(c => c.status === status);
    if (found) {
      console.log(`   ${status}: ${found._count}`);
    }
  }
}

resetStaleJobs()
  .catch(console.error)
  .finally(() => process.exit(0));
