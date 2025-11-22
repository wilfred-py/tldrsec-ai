/**
 * Script to check job processing progress
 * Run: npx tsx scripts/check-job-progress.ts
 */

import { prisma } from '../lib/db/prisma.js';

async function checkJobProgress() {
  console.log('📊 Job Queue Progress Report');
  console.log('============================');
  console.log('Time:', new Date().toISOString(), '\n');

  // Get counts by status
  const counts = await prisma.jobQueue.groupBy({
    by: ['status'],
    _count: true,
  });

  console.log('📋 Job Status Counts:');
  const statusOrder = ['COMPLETED', 'PROCESSING', 'PENDING', 'RETRYING', 'FAILED'];
  for (const status of statusOrder) {
    const found = counts.find(c => c.status === status);
    if (found) {
      const emoji = status === 'COMPLETED' ? '✅' :
                    status === 'PROCESSING' ? '🔄' :
                    status === 'PENDING' ? '⏳' :
                    status === 'RETRYING' ? '🔁' : '❌';
      console.log(`   ${emoji} ${status}: ${found._count}`);
    }
  }

  // Check completed jobs
  const completedJobs = await prisma.jobQueue.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      completedAt: true,
      payload: true,
      jobType: true
    }
  });

  console.log('\n✅ Recent COMPLETED Jobs:', completedJobs.length > 0 ? '' : '(none yet)');
  for (const job of completedJobs) {
    const payload = job.payload as Record<string, unknown>;
    const ticker = (payload?.ticker as Record<string, unknown>)?.symbol || 'N/A';
    const formType = (payload?.filing as Record<string, unknown>)?.formType || 'N/A';
    console.log(`   - ${job.id.substring(0, 8)}... | ${ticker} ${formType} | completed: ${job.completedAt?.toISOString()}`);
  }

  // Check processing jobs
  const processingJobs = await prisma.jobQueue.findMany({
    where: { status: 'PROCESSING' },
    select: {
      id: true,
      startedAt: true,
      payload: true
    }
  });

  console.log('\n🔄 Currently PROCESSING:', processingJobs.length);
  for (const job of processingJobs) {
    const payload = job.payload as Record<string, unknown>;
    const ticker = (payload?.ticker as Record<string, unknown>)?.symbol || 'N/A';
    const filingId = (payload?.filing as Record<string, unknown>)?.filingId || '';
    const duration = job.startedAt
      ? Math.round((Date.now() - job.startedAt.getTime()) / 1000)
      : 0;
    console.log(`   - ${job.id.substring(0, 8)}... | ${ticker} | started ${duration}s ago`);
    console.log(`     filingId: ${String(filingId).substring(0, 36)}`);
  }

  // Check recent summaries
  const recentSummaries = await prisma.summary.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      ticker: { select: { symbol: true } }
    }
  });

  console.log('\n📝 Recent Summaries Created:');
  if (recentSummaries.length === 0) {
    console.log('   (no summaries yet)');
  } else {
    for (const summary of recentSummaries) {
      const hasContent = summary.content && summary.content.length > 50;
      console.log(`   - ${summary.ticker.symbol} | ${summary.formType} | ${summary.createdAt.toISOString()}`);
      console.log(`     ${hasContent ? '✓ Has content' : '✗ No content'} | AI cost: $${summary.aiCost?.toFixed(4) || 'N/A'}`);
    }
  }

  // Check for newly created summaries today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todaySummaries = await prisma.summary.count({
    where: {
      createdAt: { gte: todayStart }
    }
  });

  console.log('\n📅 Summaries Created Today:', todaySummaries);

  console.log('\n============================');
  console.log('Report complete!');
}

checkJobProgress()
  .catch(console.error)
  .finally(() => process.exit(0));
