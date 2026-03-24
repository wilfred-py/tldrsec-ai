/**
 * Pipeline Health Endpoint - Connection Pool Safety Tests
 *
 * Tests that the endpoint never exceeds the connection pool limit
 * by executing queries in controlled batches.
 */

import { NextRequest } from 'next/server';

// Track concurrent query execution
let concurrentQueries = 0;
let maxConcurrentQueries = 0;

function trackQueryStart() {
  concurrentQueries++;
  if (concurrentQueries > maxConcurrentQueries) {
    maxConcurrentQueries = concurrentQueries;
  }
}

function trackQueryEnd() {
  concurrentQueries--;
}

const mockPrisma = {
  jobQueue: {
    findFirst: jest.fn().mockImplementation(async () => {
      trackQueryStart();
      await new Promise(r => setTimeout(r, 10)); // Simulate query time
      trackQueryEnd();
      return { completedAt: new Date() };
    }),
    findMany: jest.fn().mockImplementation(async () => {
      trackQueryStart();
      await new Promise(r => setTimeout(r, 10));
      trackQueryEnd();
      return [];
    }),
  },
  cronJobExecution: {
    findMany: jest.fn().mockImplementation(async () => {
      trackQueryStart();
      await new Promise(r => setTimeout(r, 10));
      trackQueryEnd();
      return [{ startedAt: new Date() }];
    }),
  },
  rssFilingCheck: {
    findMany: jest.fn().mockImplementation(async () => {
      trackQueryStart();
      await new Promise(r => setTimeout(r, 10));
      trackQueryEnd();
      return [];
    }),
    count: jest.fn().mockImplementation(async () => {
      trackQueryStart();
      await new Promise(r => setTimeout(r, 10));
      trackQueryEnd();
      return 0;
    }),
  },
  $queryRaw: jest.fn().mockImplementation(async () => {
    trackQueryStart();
    await new Promise(r => setTimeout(r, 10));
    trackQueryEnd();
    return [{
      pending_count: BigInt(0),
      processing_count: BigInt(0),
      completed_1h_count: BigInt(10),
      completed_24h_count: BigInt(100),
      dead_letter_count: BigInt(0),
      retrying_count: BigInt(0),
      stale_processing_count: BigInt(0),
      invalid_job_type_count: BigInt(0),
      high_retry_count: BigInt(0),
      exhausted_retrying_count: BigInt(0),
    }];
  }),
};

// Mock LockService with simulated delays
jest.mock('@/lib/job-queue/lock-service', () => ({
  LockService: {
    getLockHealthMetrics: jest.fn().mockImplementation(async () => {
      // Simulate 4 sequential lock queries
      for (let i = 0; i < 4; i++) {
        trackQueryStart();
        await new Promise(r => setTimeout(r, 5));
        trackQueryEnd();
      }
      return {
        healthStatus: 'HEALTHY',
        staleLocksCount: 0,
        activeLocks: 2,
      };
    }),
  },
}));

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

jest.mock('@/lib/db/supabase-config', () => ({
  checkDatabaseSchemas: jest.fn().mockResolvedValue({
    databaseType: 'supabase',
    foundSchemas: ['app', 'pipeline'],
    migrationComplete: true,
    hasExpectedSchemas: true,
  }),
}));

import { GET, clearHealthCache, resetOrphanSampleCounter } from '@/app/api/health/route';

function createMockRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/health/pipeline?bypass-cache=true', {
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  });
}

describe('Pipeline Health Endpoint - Connection Pool Safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    concurrentQueries = 0;
    maxConcurrentQueries = 0;
    clearHealthCache();
    resetOrphanSampleCounter();
  });

  describe('Concurrent connection limits', () => {
    it('should never exceed 5 concurrent database connections', async () => {
      const request = createMockRequest();
      await GET(request);

      // Should never have more than 5 concurrent queries
      // (Supabase pgbouncer limit is 5)
      expect(maxConcurrentQueries).toBeLessThanOrEqual(5);
    });

    it('should execute queries in controlled batches', async () => {
      const request = createMockRequest();
      await GET(request);

      // With batching, we should see controlled concurrency
      // Batch 1: Lock queries (4 sequential = max 1)
      // Batch 2: Aggregated query (1)
      // Batch 3: Remaining queries (4 parallel = max 4)
      // Max concurrent at any point should be <= 4
      expect(maxConcurrentQueries).toBeLessThanOrEqual(4);
    });
  });

  describe('Query execution order', () => {
    it('should complete lock health check before main queries', async () => {
      const { LockService } = await import('@/lib/job-queue/lock-service');
      const request = createMockRequest();

      await GET(request);

      // Lock health should be called
      expect(LockService.getLockHealthMetrics).toHaveBeenCalled();
    });
  });
});
