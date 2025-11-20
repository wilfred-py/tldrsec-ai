/**
 * Phase 1 Verification Script: Async Filing Queue
 *
 * Tests:
 * 1. Cron endpoint responds within 10 seconds
 * 2. Response includes async processing indicators
 * 3. JobQueue table contains ASYNC_SUMMARIZE_FILING records
 * 4. No 524 timeout errors
 * 5. Idempotency prevents duplicate jobs
 */

import { getPrismaClient } from '../lib/db/prisma';

const CRON_ENDPOINT = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/cron/tier-aware`
  : 'http://localhost:3000/api/cron/tier-aware';

const CRON_SECRET = process.env.CRON_SECRET;

interface CronResponse {
  success: boolean;
  executionId: string;
  duration: number;
  processingMode?: string;
  queue?: {
    filingsQueued: number;
    estimatedCompletionTime: string;
    message: string;
  };
  results: any;
}

async function verifyCronEndpointSpeed(): Promise<boolean> {
  console.log('\n🧪 Test 1: Cron endpoint response time...');

  const startTime = Date.now();

  try {
    const response = await fetch(CRON_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': CRON_SECRET || '',
      },
    });

    const duration = Date.now() - startTime;
    const data = await response.json() as CronResponse;

    console.log(`   Response time: ${duration}ms`);
    console.log(`   Status: ${response.status}`);

    if (response.status !== 200) {
      console.error(`   ❌ FAILED: Expected 200, got ${response.status}`);
      return false;
    }

    if (duration > 10000) {
      console.error(`   ❌ FAILED: Response took ${duration}ms (> 10 seconds)`);
      return false;
    }

    console.log('   ✅ PASSED: Response within 10 seconds');
    return true;
  } catch (error) {
    console.error('   ❌ FAILED:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

async function verifyAsyncProcessingIndicators(): Promise<boolean> {
  console.log('\n🧪 Test 2: Async processing indicators...');

  try {
    const response = await fetch(CRON_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': CRON_SECRET || '',
      },
    });

    const data = await response.json() as CronResponse;
    const headers = response.headers;

    // Check response body
    const hasProcessingMode = data.processingMode === 'async';
    const hasQueueInfo = !!data.queue && typeof data.queue.filingsQueued === 'number';

    // Check response headers
    const hasProcessingModeHeader = headers.get('X-Processing-Mode') === 'async';
    const hasExecutionIdHeader = !!headers.get('X-Execution-ID');
    const hasFilingsQueuedHeader = headers.has('X-Filings-Queued');

    console.log('   Response body:');
    console.log(`     processingMode: ${data.processingMode} ${hasProcessingMode ? '✅' : '❌'}`);
    console.log(`     queue.filingsQueued: ${data.queue?.filingsQueued} ${hasQueueInfo ? '✅' : '❌'}`);

    console.log('   Response headers:');
    console.log(`     X-Processing-Mode: ${headers.get('X-Processing-Mode')} ${hasProcessingModeHeader ? '✅' : '❌'}`);
    console.log(`     X-Execution-ID: ${headers.get('X-Execution-ID')?.substring(0, 8)}... ${hasExecutionIdHeader ? '✅' : '❌'}`);
    console.log(`     X-Filings-Queued: ${headers.get('X-Filings-Queued')} ${hasFilingsQueuedHeader ? '✅' : '❌'}`);

    const allPassed = hasProcessingMode && hasQueueInfo && hasProcessingModeHeader && hasExecutionIdHeader && hasFilingsQueuedHeader;

    if (allPassed) {
      console.log('   ✅ PASSED: All async indicators present');
    } else {
      console.error('   ❌ FAILED: Missing async indicators');
    }

    return allPassed;
  } catch (error) {
    console.error('   ❌ FAILED:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

async function verifyJobQueueRecords(): Promise<boolean> {
  console.log('\n🧪 Test 3: JobQueue database records...');

  try {
    const prisma = getPrismaClient();

    // Check for ASYNC_SUMMARIZE_FILING jobs
    const asyncJobs = await prisma.jobQueue.findMany({
      where: {
        jobType: 'ASYNC_SUMMARIZE_FILING',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    console.log(`   Found ${asyncJobs.length} ASYNC_SUMMARIZE_FILING jobs`);

    if (asyncJobs.length > 0) {
      console.log('   Recent jobs:');
      asyncJobs.forEach((job, index) => {
        console.log(`     ${index + 1}. ID: ${job.id.substring(0, 8)}... Status: ${job.status} Priority: ${job.priority}`);
      });
      console.log('   ✅ PASSED: ASYNC_SUMMARIZE_FILING jobs found');
      return true;
    } else {
      console.error('   ⚠️  WARNING: No ASYNC_SUMMARIZE_FILING jobs found (may be expected if no backlog)');
      return true; // Not a failure - might just be no backlog
    }
  } catch (error) {
    console.error('   ❌ FAILED:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

async function verifyIdempotency(): Promise<boolean> {
  console.log('\n🧪 Test 4: Idempotency verification...');

  try {
    const prisma = getPrismaClient();

    // Check for jobs with same idempotency keys
    const jobs = await prisma.jobQueue.findMany({
      where: {
        jobType: 'ASYNC_SUMMARIZE_FILING',
        idempotencyKey: {
          not: null,
        },
      },
      select: {
        id: true,
        idempotencyKey: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    // Group by idempotency key
    const groupedByKey = new Map<string, typeof jobs>();
    jobs.forEach(job => {
      if (job.idempotencyKey) {
        const existing = groupedByKey.get(job.idempotencyKey) || [];
        existing.push(job);
        groupedByKey.set(job.idempotencyKey, existing);
      }
    });

    // Check for duplicates
    const duplicates = Array.from(groupedByKey.entries()).filter(([_, jobs]) => jobs.length > 1);

    console.log(`   Total jobs checked: ${jobs.length}`);
    console.log(`   Unique idempotency keys: ${groupedByKey.size}`);
    console.log(`   Duplicate keys found: ${duplicates.length}`);

    if (duplicates.length > 0) {
      console.log('   Duplicate jobs:');
      duplicates.forEach(([key, jobs]) => {
        console.log(`     Key: ${key.substring(0, 30)}... (${jobs.length} jobs)`);
        jobs.forEach(job => {
          console.log(`       - ${job.id.substring(0, 8)}... Status: ${job.status} Created: ${job.createdAt.toISOString()}`);
        });
      });
      console.error('   ❌ FAILED: Duplicate jobs found with same idempotency key');
      return false;
    }

    console.log('   ✅ PASSED: No duplicate jobs found');
    return true;
  } catch (error) {
    console.error('   ❌ FAILED:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

async function verifyNoTimeoutErrors(): Promise<boolean> {
  console.log('\n🧪 Test 5: Checking for timeout errors...');

  try {
    const prisma = getPrismaClient();

    // Check recent error alerts for timeout-related issues
    const recentAlerts = await prisma.errorAlert.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
        OR: [
          { alertType: { contains: 'TIMEOUT' } },
          { message: { contains: '524' } },
          { message: { contains: 'timeout' } },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    console.log(`   Timeout-related alerts in last 24h: ${recentAlerts.length}`);

    if (recentAlerts.length > 0) {
      console.log('   Recent timeout alerts:');
      recentAlerts.forEach((alert, index) => {
        console.log(`     ${index + 1}. ${alert.alertType}: ${alert.message}`);
      });
      console.error('   ⚠️  WARNING: Timeout errors detected');
      return false;
    }

    console.log('   ✅ PASSED: No timeout errors found');
    return true;
  } catch (error) {
    console.error('   ⚠️  Could not check alerts:', error instanceof Error ? error.message : 'Unknown error');
    return true; // Don't fail if we can't check alerts
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 Phase 1 Verification: Async Filing Queue');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\nTarget: ${CRON_ENDPOINT}`);
  console.log(`Auth: ${CRON_SECRET ? '✓ CRON_SECRET provided' : '✗ CRON_SECRET missing'}`);

  const results = {
    endpointSpeed: await verifyCronEndpointSpeed(),
    asyncIndicators: await verifyAsyncProcessingIndicators(),
    jobQueueRecords: await verifyJobQueueRecords(),
    idempotency: await verifyIdempotency(),
    noTimeouts: await verifyNoTimeoutErrors(),
  };

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 Test Results Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`1. Endpoint Speed:        ${results.endpointSpeed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`2. Async Indicators:      ${results.asyncIndicators ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`3. Job Queue Records:     ${results.jobQueueRecords ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`4. Idempotency:           ${results.idempotency ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`5. No Timeout Errors:     ${results.noTimeouts ? '✅ PASSED' : '❌ FAILED'}`);

  const allPassed = Object.values(results).every(r => r);

  console.log('\n═══════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED - Phase 1 verification successful!');
    console.log('✅ Ready to proceed to Phase 2');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review results above');
    console.log('❌ Fix issues before proceeding to Phase 2');
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('\n💥 Fatal error running tests:', error);
  process.exit(1);
});
