/**
 * Pipeline Test Helpers for E2E Recovery Testing
 *
 * These utilities provide functions to:
 * - Create stuck jobs in various states for testing recovery
 * - Query health status via the API
 * - Trigger auto-recovery
 * - Clean up test data
 *
 * @see docs/plans/2026-01-05-100-percent-pipeline-uptime.md Phase 4
 */

import { v4 as uuidv4 } from 'uuid';

// Valid job types that have handlers
const VALID_JOB_TYPES = [
  'ASYNC_DISCOVER_FILINGS',
  'ASYNC_FETCH_FILING',
  'ASYNC_SUMMARIZE_CACHED'
] as const;

// Test marker to identify test-created jobs
const TEST_MARKER = 'e2e-pipeline-recovery-test';

// Type alias for the PrismaClient
type PrismaClientType = import('@prisma/client').PrismaClient;

// Create a dedicated Prisma client for E2E tests
// This bypasses the getPrismaClient() stub behavior during test runs
let testPrisma: PrismaClientType | null = null;
let connectionAttempted = false;

/**
 * Get Prisma client for E2E database operations
 * Uses dynamic require to bypass Jest's module mocking and get the real Node.js client
 */
async function getPrisma(): Promise<PrismaClientType> {
  if (testPrisma) {
    return testPrisma;
  }

  // Only try once to avoid repeated connection failures
  if (connectionAttempted) {
    throw new Error('Prisma connection previously failed');
  }
  connectionAttempted = true;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[E2E getPrisma] DATABASE_URL is not set');
    console.error('[E2E getPrisma] Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('DB')));
    throw new Error('DATABASE_URL is required for E2E tests');
  }

  console.log('[E2E getPrisma] Creating Prisma client with DATABASE_URL:', dbUrl.substring(0, 30) + '...');

  // Use require() directly with the full path to get the Node.js version, not the browser bundle
  // This bypasses Jest's module resolution which can return the browser bundle
  const prismaClientPath = require.resolve('.prisma/client', { paths: [process.cwd() + '/node_modules'] });
  const prismaModule = require(prismaClientPath);
  const PrismaClient = prismaModule.PrismaClient;

  testPrisma = new PrismaClient({
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });

  // Test connection
  try {
    await testPrisma.$connect();
    console.log('[E2E getPrisma] Connected successfully');
    console.log('[E2E getPrisma] jobQueue available:', !!(testPrisma as unknown as Record<string, unknown>).jobQueue);
  } catch (error) {
    console.error('[E2E getPrisma] Connection failed:', error instanceof Error ? error.message : 'Unknown error');
    testPrisma = null;
    throw error;
  }

  return testPrisma;
}

/**
 * Create exhausted RETRYING jobs (jobs that are stuck in RETRYING with retryCount >= maxRetries)
 * This was the root cause of the 41-hour stall in January 2026
 */
export async function createExhaustedRetryingJobs(count: number): Promise<string[]> {
  const prisma = await getPrisma();
  const jobIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const job = await prisma.jobQueue.create({
      data: {
        id: uuidv4(),
        jobType: VALID_JOB_TYPES[i % VALID_JOB_TYPES.length],
        status: 'RETRYING',
        retryCount: 3,
        maxRetries: 3,
        priority: 0,
        scheduledFor: new Date(),
        payload: {
          test: true,
          marker: TEST_MARKER,
          scenario: 'exhausted-retrying'
        },
        createdAt: new Date(),
      },
    });
    jobIds.push(job.id);
  }

  return jobIds;
}

/**
 * Create jobs with invalid/unknown job types (no handler exists for these)
 */
export async function createInvalidJobTypeJobs(count: number): Promise<string[]> {
  const prisma = await getPrisma();
  const jobIds: string[] = [];

  const invalidTypes = [
    'filing_fetch',        // Legacy type
    'LEGACY_SUMMARIZE',    // Old naming convention
    'UNKNOWN_JOB_TYPE',    // Non-existent type
    'ASYNC_INVALID'        // Made-up type
  ];

  for (let i = 0; i < count; i++) {
    const job = await prisma.jobQueue.create({
      data: {
        id: uuidv4(),
        jobType: invalidTypes[i % invalidTypes.length],
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        priority: 0,
        scheduledFor: new Date(),
        payload: {
          test: true,
          marker: TEST_MARKER,
          scenario: 'invalid-job-type'
        },
        createdAt: new Date(),
      },
    });
    jobIds.push(job.id);
  }

  return jobIds;
}

/**
 * Create stale PROCESSING jobs (jobs that have been processing for > 15 minutes)
 */
export async function createStaleProcessingJobs(count: number): Promise<string[]> {
  const prisma = await getPrisma();
  const jobIds: string[] = [];

  // Create jobs with startedAt 30 minutes ago
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  for (let i = 0; i < count; i++) {
    const job = await prisma.jobQueue.create({
      data: {
        id: uuidv4(),
        jobType: VALID_JOB_TYPES[i % VALID_JOB_TYPES.length],
        status: 'PROCESSING',
        retryCount: 0,
        maxRetries: 3,
        priority: 0,
        scheduledFor: new Date(thirtyMinutesAgo.getTime() - 5 * 60 * 1000), // Scheduled 35 min ago
        startedAt: thirtyMinutesAgo,
        payload: {
          test: true,
          marker: TEST_MARKER,
          scenario: 'stale-processing'
        },
        createdAt: new Date(thirtyMinutesAgo.getTime() - 5 * 60 * 1000),
      },
    });
    jobIds.push(job.id);
  }

  return jobIds;
}

/**
 * Create a stale lock (lock that has expired but not been released)
 * Note: Uses raw SQL due to schema drift between Prisma and actual database
 */
export async function createStaleLock(lockName?: string): Promise<string> {
  const prisma = await getPrisma();

  // Create a lock with expiresAt in the past
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const lockId = uuidv4();
  const lockKey = lockName || `test-stale-lock-${Date.now()}`;

  // Use raw SQL because the database has lockKey/lockHolder but Prisma has lockName/acquiredBy
  await prisma.$executeRaw`
    INSERT INTO pipeline."JobLock" ("id", "lockKey", "lockHolder", "acquiredAt", "expiresAt", "environment")
    VALUES (${lockId}, ${lockKey}, ${TEST_MARKER}, ${oneHourAgo}, ${tenMinutesAgo}, 'test')
  `;

  return lockId;
}

/**
 * Get exhausted RETRYING jobs (jobs with retryCount >= maxRetries)
 */
export async function getExhaustedRetryingJobs(): Promise<{ id: string; jobType: string }[]> {
  const prisma = await getPrisma();

  // Since Prisma doesn't support field comparison directly, use raw query
  const exhaustedJobs = await prisma.$queryRaw<{id: string; jobType: string}[]>`
    SELECT id, "jobType"
    FROM pipeline."JobQueue"
    WHERE status = 'RETRYING'
      AND "retryCount" >= "maxRetries"
  `;

  return exhaustedJobs;
}

/**
 * Get pipeline health status via the API
 */
export async function getHealthStatus(): Promise<{
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
  jobs: {
    pending: number;
    processing: number;
    exhaustedRetrying: number;
    staleProcessing: number;
    invalidJobTypes: number;
  };
  locks: {
    healthStatus: string;
    staleCount: number;
  };
  issues: string[];
}> {
  const baseUrl = process.env.PUBLIC_URL || process.env.TEST_URL || 'http://localhost:3000';

  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok && response.status !== 503) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Trigger auto-recovery endpoint
 */
export async function triggerAutoRecovery(): Promise<{
  action: string;
  reason: string;
  cleanedJobs?: number;
  locksCleared?: number;
}> {
  const baseUrl = process.env.PUBLIC_URL || process.env.TEST_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET || 'test-cron-secret';

  const response = await fetch(`${baseUrl}/api/cron?action=auto-recover`, {
    headers: {
      'x-cron-secret': cronSecret,
      'Cache-Control': 'no-cache'
    },
  });

  if (!response.ok) {
    throw new Error(`Auto-recovery failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Clean up all test-created jobs
 */
export async function cleanupTestJobs(): Promise<number> {
  try {
    const prisma = await getPrisma();
    if (!prisma || !prisma.jobQueue) {
      console.warn('[cleanupTestJobs] Prisma client not available, skipping cleanup');
      return 0;
    }

    // Delete jobs created by tests (identified by payload marker)
    const result = await prisma.jobQueue.deleteMany({
      where: {
        payload: {
          path: ['marker'],
          equals: TEST_MARKER
        }
      }
    });

    return result.count;
  } catch (error) {
    console.warn('[cleanupTestJobs] Cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
    return 0;
  }
}

/**
 * Clean up all test-created locks
 * Note: Uses raw SQL due to schema drift between Prisma and actual database
 */
export async function cleanupTestLocks(): Promise<number> {
  try {
    const prisma = await getPrisma();
    if (!prisma) {
      console.warn('[cleanupTestLocks] Prisma client not available, skipping cleanup');
      return 0;
    }

    // Use raw SQL because the database has lockHolder but Prisma has acquiredBy
    const result = await prisma.$executeRaw`
      DELETE FROM pipeline."JobLock"
      WHERE "lockHolder" = ${TEST_MARKER}
    `;

    return result as number;
  } catch (error) {
    console.warn('[cleanupTestLocks] Cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
    return 0;
  }
}

/**
 * Clean up all test data (jobs and locks)
 */
export async function cleanupAllTestData(): Promise<{ jobs: number; locks: number }> {
  const [jobs, locks] = await Promise.all([
    cleanupTestJobs(),
    cleanupTestLocks()
  ]);

  return { jobs, locks };
}

/**
 * Get count of jobs by status
 */
export async function getJobCountsByStatus(): Promise<Record<string, number>> {
  const prisma = await getPrisma();

  const counts = await prisma.jobQueue.groupBy({
    by: ['status'],
    _count: { status: true }
  });

  return counts.reduce((acc, item) => {
    acc[item.status] = item._count.status;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs: number = 30000,
  intervalMs: number = 1000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return false;
}
