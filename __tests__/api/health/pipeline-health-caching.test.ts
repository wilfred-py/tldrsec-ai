/**
 * Pipeline Health Endpoint Caching Tests
 *
 * Tests the response caching layer that prevents redundant database queries.
 */

import { NextRequest } from 'next/server';

// Track database query calls (now tracking $queryRaw since we use aggregated queries)
let queryCallCount = 0;

const mockPrisma = {
  jobQueue: {
    count: jest.fn().mockResolvedValue(0),
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
  $queryRaw: jest.fn().mockImplementation(() => {
    queryCallCount++;
    // Return aggregated job stats for the new optimized query
    return Promise.resolve([{
      pending_count: BigInt(0),
      processing_count: BigInt(0),
      completed_1h_count: BigInt(0),
      completed_24h_count: BigInt(0),
      dead_letter_count: BigInt(0),
      retrying_count: BigInt(0),
      stale_processing_count: BigInt(0),
      invalid_job_type_count: BigInt(0),
      high_retry_count: BigInt(0),
      exhausted_retrying_count: BigInt(0),
    }]);
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

// Import after mocks - will be updated to use new cached version
import { GET, clearHealthCache } from '@/app/api/health/pipeline/route';

function createMockRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/health/pipeline', {
    headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
  });
}

describe('Pipeline Health Endpoint - Response Caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryCallCount = 0;
    // Clear cache before each test
    clearHealthCache();
  });

  describe('Cache behavior', () => {
    it('should cache response for 30 seconds', async () => {
      const request = createMockRequest();

      // First request - should hit database
      const response1 = await GET(request);
      const data1 = await response1.json();
      const initialQueryCount = queryCallCount;

      expect(data1.status).toBeDefined();
      expect(initialQueryCount).toBeGreaterThan(0);

      // Second request immediately after - should use cache
      const response2 = await GET(request);
      const data2 = await response2.json();

      // Query count should NOT increase (cache hit)
      expect(queryCallCount).toBe(initialQueryCount);
      expect(data2.timestamp).toBe(data1.timestamp);
    });

    it('should include X-Cache header indicating cache status', async () => {
      const request = createMockRequest();

      // First request - cache miss
      const response1 = await GET(request);
      expect(response1.headers.get('X-Cache')).toBe('MISS');

      // Second request - cache hit
      const response2 = await GET(request);
      expect(response2.headers.get('X-Cache')).toBe('HIT');
    });

    it('should refresh cache after TTL expires', async () => {
      jest.useFakeTimers();

      const request = createMockRequest();

      // First request
      await GET(request);
      const countAfterFirst = queryCallCount;

      // Advance time past cache TTL (30 seconds)
      jest.advanceTimersByTime(31000);

      // Third request after TTL - should hit database again
      await GET(request);
      expect(queryCallCount).toBeGreaterThan(countAfterFirst);

      jest.useRealTimers();
    });

    it('should bypass cache when bypass-cache query param is present', async () => {
      const request1 = createMockRequest();
      const response1 = await GET(request1);
      expect(response1.headers.get('X-Cache')).toBe('MISS');

      // Without bypass param, second request should be HIT
      const request2 = createMockRequest();
      const response2 = await GET(request2);
      expect(response2.headers.get('X-Cache')).toBe('HIT');

      // Request with bypass-cache query param should bypass and get MISS
      const request3 = new NextRequest('http://localhost:3000/api/health/pipeline?bypass-cache=true', {
        headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
      });

      const response3 = await GET(request3);
      expect(response3.headers.get('X-Cache')).toBe('MISS');
    });
  });

  describe('Cache key isolation', () => {
    it('should use same cache for all clients (not per-IP)', async () => {
      const request1 = new NextRequest('http://localhost:3000/api/health/pipeline', {
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' }),
      });
      const request2 = new NextRequest('http://localhost:3000/api/health/pipeline', {
        headers: new Headers({ 'x-forwarded-for': '192.168.1.2' }),
      });

      await GET(request1);
      const countAfterFirst = queryCallCount;

      await GET(request2);
      // Should use cache, not increase query count
      expect(queryCallCount).toBe(countAfterFirst);
    });
  });
});
