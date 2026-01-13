/**
 * Comprehensive Auto-Recovery Tests
 *
 * Tests for Phase 6 of the Eliminate Manual Pipeline Intervention plan.
 * Verifies that the auto-recover endpoint integrates:
 * - Orphaned filing detection and recovery
 * - Cron execution gap detection
 * - Persistent recovery state
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 6
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
const mockJobQueue = {
  count: jest.fn().mockResolvedValue(0),
  findFirst: jest.fn().mockResolvedValue({ completedAt: new Date() }),
  findMany: jest.fn().mockResolvedValue([]),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
};

const mockCronJobExecution = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
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

const mockLockHealthMetrics = {
  healthStatus: 'HEALTHY',
  staleLocksCount: 0,
  activeLocks: 2,
};

const mockPrisma = {
  jobQueue: mockJobQueue,
  cronJobExecution: mockCronJobExecution,
  secFiling: mockSecFiling,
  recoveryState: mockRecoveryState,
  $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(0) }]),
};

// Mock global fetch for HTTP requests to health/admin endpoints
const mockFetch = jest.fn();
global.fetch = mockFetch;

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
    getLockHealthMetrics: jest.fn().mockResolvedValue(mockLockHealthMetrics),
    cleanupStaleLocks: jest.fn().mockResolvedValue({ cleaned: 0 }),
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

// State tracking for recovery state mock - must be before jest.mock
let mockRecoveryStateData = {
  consecutiveDegraded: 0,
  consecutiveCleanups: 0,
  consecutiveRedeploys: 0,
  lastCleanupTime: null as Date | null,
  lastRedeployTime: null as Date | null,
  lastHealthyTime: null as Date | null,
  lastDegradedTime: null as Date | null,
};

// Mock the new detectors with inline implementations
jest.mock('@/lib/cron/execution-gap-detector', () => ({
  CronExecutionGapDetector: {
    checkAndAlert: jest.fn().mockResolvedValue({ alerted: false, gaps: [] }),
  },
}));

jest.mock('@/lib/cron/orphaned-filing-detector', () => ({
  OrphanedFilingDetector: {
    checkAndRecover: jest.fn().mockResolvedValue({ recovered: 0, filings: [] }),
  },
}));

jest.mock('@/lib/cron/recovery-state-service', () => ({
  RecoveryStateService: {
    getState: jest.fn().mockResolvedValue({
      consecutiveDegraded: 0,
      consecutiveCleanups: 0,
      consecutiveRedeploys: 0,
      lastCleanupTime: null,
      lastRedeployTime: null,
      lastHealthyTime: null,
      lastDegradedTime: null,
    }),
    incrementConsecutiveDegraded: jest.fn().mockResolvedValue(undefined),
    resetOnHealthy: jest.fn().mockResolvedValue(undefined),
    recordCleanup: jest.fn().mockResolvedValue(undefined),
    clearCache: jest.fn(),
    reset: jest.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks
import { GET } from '@/app/api/cron/auto-recover/route';
import { CronExecutionGapDetector } from '@/lib/cron/execution-gap-detector';
import { OrphanedFilingDetector } from '@/lib/cron/orphaned-filing-detector';
import { RecoveryStateService } from '@/lib/cron/recovery-state-service';

// Get references to mocked functions
const mockCheckAndAlert = CronExecutionGapDetector.checkAndAlert as jest.MockedFunction<typeof CronExecutionGapDetector.checkAndAlert>;
const mockCheckAndRecover = OrphanedFilingDetector.checkAndRecover as jest.MockedFunction<typeof OrphanedFilingDetector.checkAndRecover>;
const mockGetState = RecoveryStateService.getState as jest.MockedFunction<typeof RecoveryStateService.getState>;
const mockIncrementConsecutiveDegraded = RecoveryStateService.incrementConsecutiveDegraded as jest.MockedFunction<typeof RecoveryStateService.incrementConsecutiveDegraded>;
const mockResetOnHealthy = RecoveryStateService.resetOnHealthy as jest.MockedFunction<typeof RecoveryStateService.resetOnHealthy>;
const mockRecordCleanup = RecoveryStateService.recordCleanup as jest.MockedFunction<typeof RecoveryStateService.recordCleanup>;
const mockClearCache = RecoveryStateService.clearCache as jest.MockedFunction<typeof RecoveryStateService.clearCache>;
const mockResetState = RecoveryStateService.reset as jest.MockedFunction<typeof RecoveryStateService.reset>;

function createMockRequest(url = 'http://localhost:3000/api/cron/auto-recover'): NextRequest {
  return new NextRequest(url, {
    headers: {
      'x-forwarded-for': '127.0.0.1',
      'x-cron-secret': 'test-secret',
    },
  });
}

describe('Comprehensive Auto-Recovery - Phase 6', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set CRON_SECRET for authentication
    process.env.CRON_SECRET = 'test-secret';

    // Mock fetch for health endpoint and admin endpoints
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/health/pipeline')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'HEALTHY',
            minutesSinceLastCompletion: 5,
            jobs: {
              pending: 0,
              processing: 0,
              completedLast1h: 10,
              completedLast24h: 100,
              deadLetter: 0,
              retrying: 0,
              exhaustedRetrying: 0,
              invalidJobTypes: 0,
              staleProcessing: 0,
            },
            locks: {
              healthStatus: 'HEALTHY',
              staleCount: 0,
              activeCount: 2,
            },
          }),
        });
      }
      if (url.includes('/api/admin/force-cleanup')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, locksCleared: 0 }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    // Reset mocks to healthy defaults
    mockJobQueue.count.mockResolvedValue(0);
    mockJobQueue.findFirst.mockResolvedValue({ completedAt: new Date() });
    mockJobQueue.findMany.mockResolvedValue([]);
    mockJobQueue.updateMany.mockResolvedValue({ count: 0 });
    mockCronJobExecution.findMany.mockResolvedValue([
      { triggeredAt: new Date(Date.now() - 5 * 60 * 1000) },
    ]);
    mockSecFiling.findMany.mockResolvedValue([]);
    mockSecFiling.count.mockResolvedValue(0);
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    // Reset recovery state data
    mockRecoveryStateData = {
      consecutiveDegraded: 0,
      consecutiveCleanups: 0,
      consecutiveRedeploys: 0,
      lastCleanupTime: null,
      lastRedeployTime: null,
      lastHealthyTime: null,
      lastDegradedTime: null,
    };

    // Configure recovery state service mocks
    mockGetState.mockImplementation(() => Promise.resolve({ ...mockRecoveryStateData }));
    mockIncrementConsecutiveDegraded.mockImplementation(() => {
      mockRecoveryStateData.consecutiveDegraded++;
      mockRecoveryStateData.lastDegradedTime = new Date();
      return Promise.resolve();
    });
    mockResetOnHealthy.mockImplementation(() => {
      mockRecoveryStateData.consecutiveDegraded = 0;
      mockRecoveryStateData.lastHealthyTime = new Date();
      return Promise.resolve();
    });
    mockRecordCleanup.mockImplementation(() => {
      mockRecoveryStateData.consecutiveCleanups++;
      mockRecoveryStateData.lastCleanupTime = new Date();
      return Promise.resolve();
    });
    mockClearCache.mockImplementation(() => Promise.resolve());
    mockResetState.mockImplementation(() => {
      mockRecoveryStateData = {
        consecutiveDegraded: 0,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      };
      return Promise.resolve();
    });

    // Reset detectors to no issues found
    mockCheckAndAlert.mockResolvedValue({ alerted: false, gaps: [] });
    mockCheckAndRecover.mockResolvedValue({ recovered: 0, filings: [] });
  });

  describe('Orphaned Filing Recovery Integration', () => {
    it('should call OrphanedFilingDetector.checkAndRecover', async () => {
      const request = createMockRequest();
      await GET(request);

      expect(mockCheckAndRecover).toHaveBeenCalled();
    });

    it('should include orphanedFilings count in response when filings are recovered', async () => {
      mockCheckAndRecover.mockResolvedValue({
        recovered: 3,
        filings: [
          { id: 'f1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 't1', createdAt: new Date() },
          { id: 'f2', accessionNumber: 'ACC-2', formType: '10-Q', tickerId: 't2', createdAt: new Date() },
          { id: 'f3', accessionNumber: 'ACC-3', formType: '8-K', tickerId: 't3', createdAt: new Date() },
        ],
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.cleanupResults).toBeDefined();
      expect(data.cleanupResults.orphanedFilings).toBe(3);
    });
  });

  describe('Cron Execution Gap Detection Integration', () => {
    it('should call CronExecutionGapDetector.checkAndAlert', async () => {
      const request = createMockRequest();
      await GET(request);

      expect(mockCheckAndAlert).toHaveBeenCalled();
    });

    it('should include cronGapCheck in response', async () => {
      mockCheckAndAlert.mockResolvedValue({
        alerted: true,
        gaps: [
          { type: 'gap-between-executions', durationMinutes: 25, startTime: new Date(), endTime: new Date() },
        ],
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.cronGapCheck).toBeDefined();
      expect(data.cronGapCheck.checked).toBe(true);
      expect(data.cronGapCheck.gapsFound).toBe(1);
    });
  });

  describe('Persistent Recovery State Integration', () => {
    it('should use RecoveryStateService.getState', async () => {
      const request = createMockRequest();
      await GET(request);

      expect(mockGetState).toHaveBeenCalled();
    });

    it('should include recoveryState in response', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.recoveryState).toBeDefined();
      expect(typeof data.recoveryState.consecutiveDegraded).toBe('number');
    });

    it('should increment consecutiveDegraded on DEGRADED status', async () => {
      // Override fetch to return DEGRADED status for ALL calls
      // IMPORTANT: Do NOT set staleProcessing > 0 because that triggers cleanup
      // which causes an early return before the DEGRADED branch is reached.
      // The status field itself determines DEGRADED, not staleProcessing count.
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/health/pipeline')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'DEGRADED',
              minutesSinceLastCompletion: 5,
              jobs: {
                pending: 0,
                processing: 0,
                completedLast1h: 10,
                completedLast24h: 100,
                deadLetter: 0,
                retrying: 0,
                exhaustedRetrying: 0,
                invalidJobTypes: 0,
                staleProcessing: 0,  // Keep at 0 to avoid triggering cleanup
              },
              locks: {
                healthStatus: 'HEALTHY',
                staleCount: 0,
                activeCount: 2,
              },
            }),
          });
        }
        if (url.includes('/api/admin/force-cleanup')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, locksCleared: 0 }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const request = createMockRequest();
      await GET(request);

      expect(mockIncrementConsecutiveDegraded).toHaveBeenCalled();
    });

    it('should reset consecutiveDegraded on HEALTHY status', async () => {
      // Set initial degraded count
      mockRecoveryStateData.consecutiveDegraded = 3;

      const request = createMockRequest();
      await GET(request);

      expect(mockResetOnHealthy).toHaveBeenCalled();
    });

    it('should maintain state across simulated deploys', async () => {
      // First call - simulate DEGRADED state that's been accumulating
      mockRecoveryStateData.consecutiveDegraded = 2;

      // Simulate deploy by clearing cache
      mockClearCache();

      // Override fetch to return DEGRADED status so the state is maintained (not reset)
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/health/pipeline')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'DEGRADED',
              minutesSinceLastCompletion: 5,
              jobs: {
                pending: 0,
                processing: 0,
                completedLast1h: 10,
                completedLast24h: 100,
                deadLetter: 0,
                retrying: 0,
                exhaustedRetrying: 0,
                invalidJobTypes: 0,
                staleProcessing: 0,
              },
              locks: {
                healthStatus: 'HEALTHY',
                staleCount: 0,
                activeCount: 2,
              },
            }),
          });
        }
        if (url.includes('/api/admin/force-cleanup')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, locksCleared: 0 }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      // State should be read from database (mocked via getState) and incremented
      // After DEGRADED check, consecutiveDegraded goes from 2 to 3
      expect(data.recoveryState.consecutiveDegraded).toBe(3);
    });
  });

  describe('Comprehensive Response Structure', () => {
    it('should include all Phase 6 fields in response', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      // Required Phase 6 fields
      expect(data).toHaveProperty('cleanupResults');
      expect(data).toHaveProperty('cronGapCheck');
      expect(data).toHaveProperty('recoveryState');

      // Cleanup results should have orphanedFilings
      expect(data.cleanupResults).toHaveProperty('orphanedFilings');

      // Cron gap check should have checked status
      expect(data.cronGapCheck).toHaveProperty('checked');

      // Recovery state should have all counters
      expect(data.recoveryState).toHaveProperty('consecutiveDegraded');
      expect(data.recoveryState).toHaveProperty('consecutiveCleanups');
    });
  });

  describe('Error Handling', () => {
    it('should handle OrphanedFilingDetector errors gracefully', async () => {
      mockCheckAndRecover.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest();
      const response = await GET(request);

      // Should not throw, should return valid response
      expect(response.status).toBeLessThan(500);
    });

    it('should handle CronExecutionGapDetector errors gracefully', async () => {
      mockCheckAndAlert.mockRejectedValue(new Error('Query timeout'));

      const request = createMockRequest();
      const response = await GET(request);

      // Should not throw, should return valid response
      expect(response.status).toBeLessThan(500);
    });
  });
});
