/**
 * Pipeline Health Endpoint - Orphan Check Sampling Tests
 *
 * Tests that expensive orphan filing detection is sampled rather than
 * running on every request.
 */

import { NextRequest } from 'next/server';

let orphanQueryCalls = 0;

const mockPrisma = {
  jobQueue: {
    findFirst: jest.fn().mockResolvedValue({ completedAt: new Date() }),
    findMany: jest.fn().mockImplementation(() => {
      orphanQueryCalls++;
      return Promise.resolve([]);
    }),
  },
  cronJobExecution: {
    findMany: jest.fn().mockResolvedValue([{ startedAt: new Date() }]),
  },
  rssFilingCheck: {
    findMany: jest.fn().mockResolvedValue([
      { id: 'filing-1' },
      { id: 'filing-2' },
    ]),
    count: jest.fn().mockResolvedValue(2),
  },
  $queryRaw: jest.fn().mockResolvedValue([{
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
  }]),
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

import { GET, clearHealthCache, resetOrphanSampleCounter } from '@/app/api/health/pipeline/route';

function createMockRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/health/pipeline?bypass-cache=true', {
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  });
}

describe('Pipeline Health Endpoint - Orphan Check Sampling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orphanQueryCalls = 0;
    clearHealthCache();
    resetOrphanSampleCounter();
  });

  describe('Sampling behavior', () => {
    it('should run orphan check on first request', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      // First request should check orphans
      expect(data.filings.orphanedCount).toBeDefined();
    });

    it('should skip orphan check on subsequent requests within sample window', async () => {
      // First request - runs orphan check
      await GET(createMockRequest());
      const firstCallCount = orphanQueryCalls;

      // Next 5 requests should NOT run orphan check (sample rate = 1 in 6)
      for (let i = 0; i < 5; i++) {
        clearHealthCache(); // Clear cache to force fresh query
        await GET(createMockRequest());
      }

      // Orphan query should only have been called once
      expect(orphanQueryCalls).toBe(firstCallCount);
    });

    it('should run orphan check every 6th request', async () => {
      // Run 12 requests (should trigger orphan check twice)
      for (let i = 0; i < 12; i++) {
        clearHealthCache();
        await GET(createMockRequest());
      }

      // Should have been called twice (at request 1 and request 7)
      expect(orphanQueryCalls).toBe(2);
    });

    it('should return last known orphan count when sampling is skipped', async () => {
      // First request - runs orphan check, finds 2 orphaned filings
      const response1 = await GET(createMockRequest());
      const data1 = await response1.json();

      // Second request - skips orphan check but returns last known count
      clearHealthCache();
      const response2 = await GET(createMockRequest());
      const data2 = await response2.json();

      // Both should report the same orphan count
      expect(data2.filings.orphanedCount).toBe(data1.filings.orphanedCount);
    });

    it('should indicate when orphan data is from sampling', async () => {
      // First request
      await GET(createMockRequest());

      // Second request - sampled
      clearHealthCache();
      const response = await GET(createMockRequest());
      const data = await response.json();

      // Should include indicator that orphan data may be stale
      expect(data.filings.orphanedCountSampled).toBe(true);
    });
  });
});
