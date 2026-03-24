/**
 * Pipeline Health Endpoint - Aggregated Query Tests
 *
 * Tests that JobQueue counts are fetched via a single aggregated SQL query
 * instead of 10 separate Prisma queries.
 */

import { NextRequest } from 'next/server';

// Track $queryRaw calls to verify aggregation
let queryRawCalls: string[] = [];

const mockPrisma = {
  jobQueue: {
    count: jest.fn().mockRejectedValue(new Error('Should not use individual count queries')),
    findFirst: jest.fn().mockResolvedValue({ completedAt: new Date() }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  cronJobExecution: {
    findMany: jest.fn().mockResolvedValue([{ startedAt: new Date() }]),
  },
  rssFilingCheck: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  $queryRaw: jest.fn().mockImplementation((query: TemplateStringsArray) => {
    const queryStr = query.join('');
    queryRawCalls.push(queryStr);

    // Return aggregated job stats
    if (queryStr.includes('job_queue_stats') || queryStr.includes('FILTER')) {
      return Promise.resolve([{
        pending_count: BigInt(5),
        processing_count: BigInt(2),
        completed_1h_count: BigInt(10),
        completed_24h_count: BigInt(100),
        dead_letter_count: BigInt(3),
        retrying_count: BigInt(1),
        stale_processing_count: BigInt(0),
        invalid_job_type_count: BigInt(0),
        high_retry_count: BigInt(0),
        exhausted_retrying_count: BigInt(0),
      }]);
    }

    // Default for other raw queries
    return Promise.resolve([{ count: BigInt(0) }]);
  }),
};

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => mockPrisma,
}));

jest.mock('@/lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('@/lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn().mockResolvedValue({ allowed: true }),
  },
}));

jest.mock('@/lib/job-queue/lock-service', () => ({
  LockService: {
    getLockHealthMetrics: jest.fn().mockResolvedValue({
      healthStatus: 'HEALTHY',
      staleLocksCount: 0,
      activeLocks: 2,
    }),
  },
}));

jest.mock('@/lib/db/supabase-config', () => ({
  checkDatabaseSchemas: jest.fn().mockResolvedValue({
    databaseType: 'supabase',
    foundSchemas: ['app', 'pipeline'],
    migrationComplete: true,
    hasExpectedSchemas: true,
  }),
}));

import { GET, clearHealthCache } from '@/app/api/health/route';

function createMockRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/health/pipeline?bypass-cache=true', {
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  });
}

describe('Pipeline Health Endpoint - Aggregated Queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryRawCalls = [];
    clearHealthCache();
  });

  describe('JobQueue count aggregation', () => {
    it('should fetch all JobQueue counts in a single SQL query', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      // Verify response contains expected job counts
      expect(data.jobs.pending).toBe(5);
      expect(data.jobs.processing).toBe(2);
      expect(data.jobs.completedLast1h).toBe(10);
      expect(data.jobs.completedLast24h).toBe(100);
      expect(data.jobs.deadLetter).toBe(3);
      expect(data.jobs.retrying).toBe(1);

      // Verify aggregated query was used (contains FILTER clause)
      const hasAggregatedQuery = queryRawCalls.some(q =>
        q.includes('FILTER') || q.includes('job_queue_stats')
      );
      expect(hasAggregatedQuery).toBe(true);
    });

    it('should NOT use individual Prisma count queries for JobQueue', async () => {
      const request = createMockRequest();
      await GET(request);

      // jobQueue.count should NOT have been called
      expect(mockPrisma.jobQueue.count).not.toHaveBeenCalled();
    });

    it('should still use Prisma for complex queries (findFirst, findMany)', async () => {
      const request = createMockRequest();
      await GET(request);

      // findFirst for lastCompletedJob should still use Prisma
      expect(mockPrisma.jobQueue.findFirst).toHaveBeenCalled();
    });
  });

  describe('Query efficiency', () => {
    it('should execute maximum 6 database operations total', async () => {
      const request = createMockRequest();
      await GET(request);

      // Count all database calls:
      // 1. Aggregated JobQueue stats ($queryRaw)
      // 2. Last completed job (findFirst)
      // 3. Cron executions (findMany)
      // 4. Unprocessed filings (findMany) - sampled
      // 5. Unprocessed count (count) - sampled
      // Plus LockService calls (4 internal, but mocked)

      const totalDbCalls =
        queryRawCalls.length +
        mockPrisma.jobQueue.findFirst.mock.calls.length +
        mockPrisma.cronJobExecution.findMany.mock.calls.length +
        mockPrisma.rssFilingCheck.findMany.mock.calls.length +
        mockPrisma.rssFilingCheck.count.mock.calls.length;

      // Should be significantly less than the original 14+ parallel queries
      expect(totalDbCalls).toBeLessThanOrEqual(6);
    });
  });
});
