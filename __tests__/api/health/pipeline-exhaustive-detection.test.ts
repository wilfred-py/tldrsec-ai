/**
 * Pipeline Health - Exhaustive Detection Tests
 *
 * Tests for detecting ALL conditions that can stall the pipeline,
 * including the RETRYING jobs with exhausted retries that caused
 * the 41-hour stall on Jan 3-5, 2026.
 */
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
const mockPrismaJobQueue = {
  count: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
};

const mockPrisma = {
  jobQueue: mockPrismaJobQueue,
  $queryRaw: jest.fn(),
};

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('@/lib/job-queue/lock-service', () => ({
  LockService: {
    getLockHealthMetrics: jest.fn().mockResolvedValue({
      healthStatus: 'HEALTHY',
      staleLocksCount: 0,
      activeLocks: 0,
    }),
  },
}));

jest.mock('@/lib/db/supabase-config', () => ({
  checkDatabaseSchemas: jest.fn().mockResolvedValue({
    databaseType: 'supabase',
    foundSchemas: ['app', 'pipeline'],
    hasExpectedSchemas: true,
    migrationComplete: true,
    message: 'All schemas present',
  }),
}));

jest.mock('@/lib/security/rate-limiter', () => ({
  rateLimiter: {
    checkLimit: jest.fn().mockResolvedValue({ allowed: true }),
  },
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

import { GET } from '@/app/api/health/route';

describe('Pipeline Health - Exhaustive Detection', () => {
  const mockRequest = new NextRequest('http://localhost/api/health/pipeline');

  beforeEach(() => {
    jest.clearAllMocks();

    // Default healthy state
    mockPrismaJobQueue.count.mockResolvedValue(0);
    mockPrismaJobQueue.findFirst.mockResolvedValue({
      completedAt: new Date(),
    });
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
  });

  describe('RETRYING jobs with exhausted retries', () => {
    beforeEach(() => {
      // Setup counts for different statuses
      mockPrismaJobQueue.count
        .mockResolvedValueOnce(0) // PENDING
        .mockResolvedValueOnce(0) // PROCESSING
        .mockResolvedValueOnce(5) // completedLast1h
        .mockResolvedValueOnce(10) // completedLast24h
        .mockResolvedValueOnce(0) // DEAD_LETTER
        .mockResolvedValueOnce(5); // RETRYING (total count)

      // Return exhausted RETRYING jobs count via $queryRaw
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(3) }]);
    });

    it('should detect RETRYING jobs with exhausted retries as CRITICAL', async () => {
      const response = await GET(mockRequest);
      const data = await response.json() as {
        status: string;
        issues: string[];
        jobs: { exhaustedRetrying?: number };
      };

      expect(data.status).toBe('CRITICAL');
      expect(data.issues).toContainEqual(
        expect.stringMatching(/RETRYING jobs with exhausted retries/i)
      );
    });

    it('should include exhausted retry count in metrics', async () => {
      const response = await GET(mockRequest);
      const data = await response.json() as {
        jobs: { exhaustedRetrying?: number };
      };

      expect(data.jobs.exhaustedRetrying).toBeGreaterThan(0);
    });
  });

  describe('PROCESSING jobs older than timeout', () => {
    beforeEach(() => {
      // Setup counts - include stale PROCESSING jobs
      mockPrismaJobQueue.count
        .mockResolvedValueOnce(0) // PENDING
        .mockResolvedValueOnce(2) // PROCESSING (some are stale)
        .mockResolvedValueOnce(5) // completedLast1h
        .mockResolvedValueOnce(10) // completedLast24h
        .mockResolvedValueOnce(0) // DEAD_LETTER
        .mockResolvedValueOnce(0) // RETRYING
        .mockResolvedValueOnce(2); // staleProcessingCount (>15 min)

      // No exhausted RETRYING jobs
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
    });

    it('should detect PROCESSING jobs older than 15 minutes as WARNING/DEGRADED', async () => {
      const response = await GET(mockRequest);
      const data = await response.json() as {
        status: string;
        issues: string[];
        jobs: { staleProcessing?: number };
      };

      expect(['DEGRADED', 'CRITICAL']).toContain(data.status);
      expect(data.issues).toContainEqual(
        expect.stringMatching(/PROCESSING jobs stuck/i)
      );
    });
  });

  describe('Invalid job types', () => {
    beforeEach(() => {
      // Setup normal counts
      mockPrismaJobQueue.count
        .mockResolvedValueOnce(5) // PENDING
        .mockResolvedValueOnce(0) // PROCESSING
        .mockResolvedValueOnce(5) // completedLast1h
        .mockResolvedValueOnce(10) // completedLast24h
        .mockResolvedValueOnce(0) // DEAD_LETTER
        .mockResolvedValueOnce(0) // RETRYING
        .mockResolvedValueOnce(0) // staleProcessingCount
        .mockResolvedValueOnce(3); // invalidTypeCount

      // No exhausted RETRYING jobs
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
    });

    it('should detect jobs with invalid job types as CRITICAL', async () => {
      const response = await GET(mockRequest);
      const data = await response.json() as {
        status: string;
        issues: string[];
        jobs: { invalidJobTypes?: number };
      };

      expect(data.status).toBe('CRITICAL');
      expect(data.issues).toContainEqual(
        expect.stringMatching(/invalid.*job type/i)
      );
    });
  });

  describe('PENDING jobs approaching max retries', () => {
    beforeEach(() => {
      // Setup counts with jobs approaching max retries
      mockPrismaJobQueue.count
        .mockResolvedValueOnce(10) // PENDING
        .mockResolvedValueOnce(0) // PROCESSING
        .mockResolvedValueOnce(5) // completedLast1h
        .mockResolvedValueOnce(10) // completedLast24h
        .mockResolvedValueOnce(0) // DEAD_LETTER
        .mockResolvedValueOnce(0) // RETRYING
        .mockResolvedValueOnce(0) // staleProcessingCount
        .mockResolvedValueOnce(0) // invalidTypeCount
        .mockResolvedValueOnce(5); // highRetryCount (approaching max)

      // No exhausted RETRYING jobs
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
    });

    it('should warn about PENDING jobs with high retry counts', async () => {
      const response = await GET(mockRequest);
      const data = await response.json() as {
        warnings?: string[];
        recommendations: string[];
      };

      // Check either warnings array or recommendations for the warning
      const allMessages = [...(data.warnings || []), ...(data.recommendations || [])];
      expect(allMessages).toContainEqual(
        expect.stringMatching(/approaching.*max.*retry/i)
      );
    });
  });

  describe('Multiple stuck conditions', () => {
    beforeEach(() => {
      // Setup multiple stuck conditions
      mockPrismaJobQueue.count
        .mockResolvedValueOnce(10) // PENDING
        .mockResolvedValueOnce(5) // PROCESSING (some stale)
        .mockResolvedValueOnce(0) // completedLast1h (none!)
        .mockResolvedValueOnce(5) // completedLast24h
        .mockResolvedValueOnce(10) // DEAD_LETTER
        .mockResolvedValueOnce(3) // RETRYING
        .mockResolvedValueOnce(5) // staleProcessingCount
        .mockResolvedValueOnce(2) // invalidTypeCount
        .mockResolvedValueOnce(3); // highRetryCount

      // 2 exhausted RETRYING jobs
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(2) }]);

      // No recent completions
      mockPrismaJobQueue.findFirst.mockResolvedValue({
        completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      });
    });

    it('should detect all issues and report CRITICAL status', async () => {
      const response = await GET(mockRequest);
      const data = await response.json() as {
        status: string;
        issues: string[];
      };

      expect(data.status).toBe('CRITICAL');
      expect(data.issues.length).toBeGreaterThanOrEqual(2);
    });
  });
});
