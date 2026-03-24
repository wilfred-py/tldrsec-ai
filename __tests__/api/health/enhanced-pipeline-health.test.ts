/**
 * Enhanced Pipeline Health Endpoint Tests
 *
 * Tests for Phase 5 of the Eliminate Manual Pipeline Intervention plan.
 * Verifies that the health endpoint includes:
 * - Cron execution gap status
 * - Orphaned filing count
 * - Appropriate status changes based on these new conditions
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 5
 */

import { NextRequest } from 'next/server';

// Mock Prisma client - count returns 0 by default for healthy status
const mockJobQueue = {
  count: jest.fn().mockResolvedValue(0),
  findFirst: jest.fn().mockResolvedValue({ completedAt: new Date() }),
  findMany: jest.fn().mockResolvedValue([]),
};

const mockCronJobExecution = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
};

const mockSecFiling = {
  findMany: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};

const mockRecoveryState = {
  findUnique: jest.fn().mockResolvedValue({
    id: 'singleton',
    consecutiveDegraded: 0,
    consecutiveCleanups: 0,
    consecutiveRedeploys: 0,
    lastCleanupTime: null,
    lastRedeployTime: null,
    lastHealthyTime: null,
    lastDegradedTime: null,
    updatedAt: new Date(),
  }),
  upsert: jest.fn(),
  create: jest.fn(),
};

const mockPrisma = {
  jobQueue: mockJobQueue,
  cronJobExecution: mockCronJobExecution,
  secFiling: mockSecFiling,
  recoveryState: mockRecoveryState,
  $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(0) }]),
};

// Mock modules
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => mockPrisma,
}));

jest.mock('@/lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
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
    message: 'All schemas present',
  }),
}));

// Import after mocks
import { GET } from '@/app/api/health/route';

function createMockRequest(url = 'http://localhost:3000/api/health/pipeline'): NextRequest {
  return new NextRequest(url, {
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  });
}

describe('Enhanced Pipeline Health Endpoint - Phase 5', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset to healthy defaults
    // count is called many times with different where clauses, so default to 0 (healthy)
    mockJobQueue.count.mockResolvedValue(0);
    mockJobQueue.findFirst.mockResolvedValue({
      completedAt: new Date(), // Recent completion = healthy
    });
    mockJobQueue.findMany.mockResolvedValue([]);
    mockCronJobExecution.findMany.mockResolvedValue([
      { triggeredAt: new Date(Date.now() - 5 * 60 * 1000) }, // 5 min ago
      { triggeredAt: new Date(Date.now() - 10 * 60 * 1000) }, // 10 min ago
    ]);
    mockSecFiling.findMany.mockResolvedValue([]);
    mockSecFiling.count.mockResolvedValue(0);
    // $queryRaw for exhaustedRetrying count - return 0 for healthy
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
  });

  describe('Cron Execution Gap Status', () => {
    it('should include cron execution gap status in response', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.cronExecution).toBeDefined();
      expect(typeof data.cronExecution.lastExecution).toBe('string');
      expect(typeof data.cronExecution.gapsDetected).toBe('number');
    });

    it('should report healthy when no cron gaps exist', async () => {
      // Regular executions every 5 minutes
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 5 * 60 * 1000) },
        { triggeredAt: new Date(Date.now() - 10 * 60 * 1000) },
        { triggeredAt: new Date(Date.now() - 15 * 60 * 1000) },
      ]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.cronExecution.gapsDetected).toBe(0);
      expect(data.issues).not.toContain(expect.stringMatching(/cron.*gap/i));
    });

    it('should detect and report cron execution gaps', async () => {
      // Gap of 30 minutes between executions
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 5 * 60 * 1000) }, // 5 min ago
        { triggeredAt: new Date(Date.now() - 35 * 60 * 1000) }, // 35 min ago (30 min gap)
      ]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.cronExecution.gapsDetected).toBeGreaterThan(0);
    });

    it('should include minutesSinceLastCron', async () => {
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 12 * 60 * 1000) }, // 12 min ago
      ]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.cronExecution.minutesSinceLastCron).toBeGreaterThanOrEqual(12);
    });
  });

  describe('Orphaned Filing Count', () => {
    it('should include orphaned filing count in response', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.filings).toBeDefined();
      expect(typeof data.filings.orphanedCount).toBe('number');
    });

    it('should report zero orphaned filings when all are processed', async () => {
      mockSecFiling.findMany.mockResolvedValue([]);
      mockSecFiling.count.mockResolvedValue(0);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.filings.orphanedCount).toBe(0);
      expect(data.issues).not.toContain(expect.stringMatching(/orphan/i));
    });

    it('should detect orphaned filings', async () => {
      // 3 unprocessed filings with no jobs
      mockSecFiling.count.mockResolvedValue(3);
      mockSecFiling.findMany.mockResolvedValue([
        { id: 'filing-1', accessionNumber: 'ACC-1', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-2', accessionNumber: 'ACC-2', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-3', accessionNumber: 'ACC-3', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
      ]);
      mockJobQueue.findMany.mockResolvedValue([]); // No matching jobs

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.filings.orphanedCount).toBe(3);
    });
  });

  describe('Health Status with Cron Gaps', () => {
    it('should mark CRITICAL when cron gaps exceed threshold (>20 minutes)', async () => {
      // No executions in last 25 minutes
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 25 * 60 * 1000) }, // 25 min ago
      ]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.status).toBe('CRITICAL');
      expect(data.issues.some((i: string) => /cron.*gap/i.test(i))).toBe(true);
    });

    it('should mark DEGRADED when cron gaps exceed threshold (15-20 minutes)', async () => {
      // No executions in last 18 minutes (DEGRADED threshold)
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 18 * 60 * 1000) }, // 18 min ago
      ]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(['DEGRADED', 'CRITICAL']).toContain(data.status);
    });
  });

  describe('Health Status with Orphaned Filings', () => {
    it('should mark DEGRADED when orphaned filings exist', async () => {
      // 5 orphaned filings
      mockSecFiling.count.mockResolvedValue(5);
      mockSecFiling.findMany.mockResolvedValue([
        { id: 'filing-1', accessionNumber: 'ACC-1', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-2', accessionNumber: 'ACC-2', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-3', accessionNumber: 'ACC-3', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-4', accessionNumber: 'ACC-4', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-5', accessionNumber: 'ACC-5', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
      ]);
      mockJobQueue.findMany.mockResolvedValue([]); // No matching jobs

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(['DEGRADED', 'CRITICAL']).toContain(data.status);
      expect(data.issues.some((i: string) => /orphan/i.test(i))).toBe(true);
    });

    it('should add recommendation for orphaned filings', async () => {
      // 3 orphaned filings
      mockSecFiling.count.mockResolvedValue(3);
      mockSecFiling.findMany.mockResolvedValue([
        { id: 'filing-1', accessionNumber: 'ACC-1', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-2', accessionNumber: 'ACC-2', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
        { id: 'filing-3', accessionNumber: 'ACC-3', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
      ]);
      mockJobQueue.findMany.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.recommendations.some((r: string) => /orphan/i.test(r))).toBe(true);
    });
  });

  describe('Combined Health Status', () => {
    it('should report HEALTHY when no gaps and no orphans', async () => {
      // Regular executions, no orphans
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 3 * 60 * 1000) },
        { triggeredAt: new Date(Date.now() - 8 * 60 * 1000) },
      ]);
      mockSecFiling.findMany.mockResolvedValue([]);
      mockSecFiling.count.mockResolvedValue(0);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.status).toBe('HEALTHY');
    });

    it('should prioritize CRITICAL over DEGRADED conditions', async () => {
      // CRITICAL: 25 minute gap + DEGRADED: orphaned filings
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 25 * 60 * 1000) },
      ]);
      mockSecFiling.count.mockResolvedValue(3);
      mockSecFiling.findMany.mockResolvedValue([
        { id: 'filing-1', accessionNumber: 'ACC-1', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
      ]);
      mockJobQueue.findMany.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.status).toBe('CRITICAL');
    });

    it('should include all issues in issues array', async () => {
      // Both cron gap and orphaned filings
      mockCronJobExecution.findMany.mockResolvedValue([
        { triggeredAt: new Date(Date.now() - 25 * 60 * 1000) },
      ]);
      mockSecFiling.count.mockResolvedValue(3);
      mockSecFiling.findMany.mockResolvedValue([
        { id: 'filing-1', accessionNumber: 'ACC-1', processed: false, createdAt: new Date(Date.now() - 30 * 60 * 1000) },
      ]);
      mockJobQueue.findMany.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.issues.some((i: string) => i.toLowerCase().includes('cron') || i.toLowerCase().includes('gap'))).toBe(true);
      expect(data.issues.some((i: string) => i.toLowerCase().includes('orphan'))).toBe(true);
    });
  });
});
