/**
 * Comprehensive Self-Healing Auto-Recovery Tests
 *
 * Tests for Phase 2 of 100% Pipeline Uptime plan.
 * Validates that auto-recovery runs cleanup checks EVERY execution
 * and immediately fixes stuck job conditions.
 *
 * @see docs/plans/2026-01-05-100-percent-pipeline-uptime.md
 */
import { NextRequest } from 'next/server';

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Prisma for direct database operations
const mockPrismaJobQueue = {
  findMany: jest.fn(),
  updateMany: jest.fn(),
  update: jest.fn(),
};

// Simulated database state for RecoveryState (tracks changes across calls)
let mockRecoveryDbState = {
  id: 'singleton',
  consecutiveDegraded: 0,
  consecutiveCleanups: 0,
  consecutiveRedeploys: 0,
  lastCleanupTime: null as Date | null,
  lastRedeployTime: null as Date | null,
  lastHealthyTime: null as Date | null,
  lastDegradedTime: null as Date | null,
};

// Helper to reset mock DB state
function resetMockRecoveryDbState() {
  mockRecoveryDbState = {
    id: 'singleton',
    consecutiveDegraded: 0,
    consecutiveCleanups: 0,
    consecutiveRedeploys: 0,
    lastCleanupTime: null,
    lastRedeployTime: null,
    lastHealthyTime: null,
    lastDegradedTime: null,
  };
}

const mockPrisma = {
  jobQueue: mockPrismaJobQueue,
  $executeRaw: jest.fn(),
  recoveryState: {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...mockRecoveryDbState })),
    create: jest.fn().mockImplementation(() => Promise.resolve({ ...mockRecoveryDbState })),
    upsert: jest.fn().mockImplementation((args: { update: Record<string, unknown> }) => {
      // Simulate upsert behavior - apply updates to mock state
      const update = args.update;
      if (update.consecutiveDegraded !== undefined) {
        if (typeof update.consecutiveDegraded === 'object' && 'increment' in update.consecutiveDegraded) {
          mockRecoveryDbState.consecutiveDegraded += (update.consecutiveDegraded as { increment: number }).increment;
        } else {
          mockRecoveryDbState.consecutiveDegraded = update.consecutiveDegraded as number;
        }
      }
      if (update.consecutiveCleanups !== undefined) {
        if (typeof update.consecutiveCleanups === 'object' && 'increment' in update.consecutiveCleanups) {
          mockRecoveryDbState.consecutiveCleanups += (update.consecutiveCleanups as { increment: number }).increment;
        } else {
          mockRecoveryDbState.consecutiveCleanups = update.consecutiveCleanups as number;
        }
      }
      if (update.consecutiveRedeploys !== undefined) {
        if (typeof update.consecutiveRedeploys === 'object' && 'increment' in update.consecutiveRedeploys) {
          mockRecoveryDbState.consecutiveRedeploys += (update.consecutiveRedeploys as { increment: number }).increment;
        } else {
          mockRecoveryDbState.consecutiveRedeploys = update.consecutiveRedeploys as number;
        }
      }
      if (update.lastCleanupTime !== undefined) mockRecoveryDbState.lastCleanupTime = update.lastCleanupTime as Date | null;
      if (update.lastRedeployTime !== undefined) mockRecoveryDbState.lastRedeployTime = update.lastRedeployTime as Date | null;
      if (update.lastHealthyTime !== undefined) mockRecoveryDbState.lastHealthyTime = update.lastHealthyTime as Date | null;
      if (update.lastDegradedTime !== undefined) mockRecoveryDbState.lastDegradedTime = update.lastDegradedTime as Date | null;
      return Promise.resolve({ ...mockRecoveryDbState });
    }),
  },
};

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

// Mock Slack webhook service
const mockPostRaw = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/lib/slack/webhook-service', () => ({
  slackWebhookService: {
    isConfigured: jest.fn().mockReturnValue(true),
    postRaw: mockPostRaw,
  },
}));

// Import after mocks
import { GET, _resetRecoveryStateForTesting } from '@/app/api/cron/route';

describe('Comprehensive Self-Healing Auto-Recovery', () => {
  const cronSecret = 'test-cron-secret';

  beforeEach(async () => {
    process.env.CRON_SECRET = cronSecret;
    process.env.ADMIN_API_SECRET = 'admin-secret';
    process.env.PUBLIC_URL = 'https://tldrsec.app';
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockPrisma.$executeRaw.mockReset();
    mockPrismaJobQueue.findMany.mockReset();
    mockPrismaJobQueue.updateMany.mockReset();
    resetMockRecoveryDbState();
    await _resetRecoveryStateForTesting();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_API_SECRET;
    delete process.env.PUBLIC_URL;
  });

  /**
   * Helper to create a mock health response
   */
  function createHealthResponse(overrides: Partial<{
    status: string;
    minutesSinceLastCompletion: number | null;
    jobs: {
      exhaustedRetrying?: number;
      invalidJobTypes?: number;
      staleProcessing?: number;
    };
    locks: { staleCount: number };
  }> = {}) {
    return {
      ok: true,
      json: async () => ({
        status: overrides.status ?? 'HEALTHY',
        minutesSinceLastCompletion: overrides.minutesSinceLastCompletion ?? 5,
        jobs: {
          pending: 10,
          processing: 2,
          completedLast1h: 50,
          exhaustedRetrying: overrides.jobs?.exhaustedRetrying ?? 0,
          invalidJobTypes: overrides.jobs?.invalidJobTypes ?? 0,
          staleProcessing: overrides.jobs?.staleProcessing ?? 0,
        },
        locks: {
          healthStatus: 'HEALTHY',
          staleCount: overrides.locks?.staleCount ?? 0,
          activeCount: 1,
        },
      }),
    };
  }

  describe('CRITICAL conditions - immediate cleanup', () => {
    it('should IMMEDIATELY clean exhausted RETRYING jobs on first detection', async () => {
      // Health check returns CRITICAL with exhausted RETRYING jobs
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'CRITICAL',
        jobs: { exhaustedRetrying: 5 },
      }));

      // Mock the cleanup to return 5 cleaned jobs
      mockPrisma.$executeRaw.mockResolvedValueOnce(5); // exhaustedRetrying cleanup
      mockPrisma.$executeRaw.mockResolvedValueOnce(0); // invalidJobTypes cleanup
      mockPrisma.$executeRaw.mockResolvedValueOnce(0); // staleProcessing cleanup

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as {
        action: string;
        cleanup?: { exhaustedRetrying: number };
      };

      expect(body.action).toBe('immediate-cleanup');
      expect(body.cleanup?.exhaustedRetrying).toBe(5);
    });

    it('should IMMEDIATELY clean invalid job types on first detection', async () => {
      // Health check returns CRITICAL with invalid job types
      // Note: exhaustedRetrying is 0, so that cleanup branch won't execute
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'CRITICAL',
        jobs: { invalidJobTypes: 3, exhaustedRetrying: 0 },
      }));

      // Mock the cleanup - only invalidJobTypes cleanup will be called
      mockPrisma.$executeRaw.mockResolvedValueOnce(3); // invalidJobTypes cleanup

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as {
        action: string;
        cleanup?: { invalidJobTypes: number };
      };

      expect(body.action).toBe('immediate-cleanup');
      expect(body.cleanup?.invalidJobTypes).toBe(3);
    });

    it('should clean stale PROCESSING jobs (>15 min) on first detection', async () => {
      // Health check returns DEGRADED with stale PROCESSING jobs
      // Note: exhaustedRetrying and invalidJobTypes are 0, so those cleanup branches won't execute
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'DEGRADED',
        jobs: { staleProcessing: 2, exhaustedRetrying: 0, invalidJobTypes: 0 },
      }));

      // Mock the cleanup - only staleProcessing cleanup will be called
      mockPrisma.$executeRaw.mockResolvedValueOnce(2); // staleProcessing cleanup

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as {
        action: string;
        cleanup?: { staleProcessing: number };
      };

      expect(body.action).toBe('immediate-cleanup');
      expect(body.cleanup?.staleProcessing).toBe(2);
    });

    it('should clean multiple stuck conditions in a single execution', async () => {
      // Health check returns CRITICAL with multiple issues
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'CRITICAL',
        jobs: {
          exhaustedRetrying: 3,
          invalidJobTypes: 2,
          staleProcessing: 1,
        },
      }));

      // Mock all cleanups
      mockPrisma.$executeRaw.mockResolvedValueOnce(3); // exhaustedRetrying
      mockPrisma.$executeRaw.mockResolvedValueOnce(2); // invalidJobTypes
      mockPrisma.$executeRaw.mockResolvedValueOnce(1); // staleProcessing

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as {
        action: string;
        cleanup?: {
          exhaustedRetrying: number;
          invalidJobTypes: number;
          staleProcessing: number;
          total: number;
        };
      };

      expect(body.action).toBe('immediate-cleanup');
      expect(body.cleanup?.exhaustedRetrying).toBe(3);
      expect(body.cleanup?.invalidJobTypes).toBe(2);
      expect(body.cleanup?.staleProcessing).toBe(1);
      expect(body.cleanup?.total).toBe(6);
    });
  });

  describe('DEGRADED status handling - delayed action', () => {
    it('should track consecutive DEGRADED count in state', async () => {
      // First call - DEGRADED
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'DEGRADED',
        minutesSinceLastCompletion: 45,
      }));
      mockPrisma.$executeRaw.mockResolvedValue(0); // No cleanup needed

      const request1 = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response1 = await GET(request1);
      const body1 = await response1.json() as {
        recoveryState?: { consecutiveDegraded: number };
      };

      expect(body1.recoveryState?.consecutiveDegraded).toBe(1);

      // Second call - still DEGRADED
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'DEGRADED',
        minutesSinceLastCompletion: 50,
      }));

      const request2 = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response2 = await GET(request2);
      const body2 = await response2.json() as {
        recoveryState?: { consecutiveDegraded: number };
      };

      expect(body2.recoveryState?.consecutiveDegraded).toBe(2);
    });

    it('should reset consecutive DEGRADED count on HEALTHY', async () => {
      // First call - DEGRADED
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'DEGRADED',
        minutesSinceLastCompletion: 45,
      }));
      mockPrisma.$executeRaw.mockResolvedValue(0);

      const request1 = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      await GET(request1);

      // Second call - HEALTHY
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'HEALTHY',
        minutesSinceLastCompletion: 5,
      }));

      const request2 = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response2 = await GET(request2);
      const body2 = await response2.json() as {
        recoveryState?: { consecutiveDegraded: number };
      };

      // Should be 0 or undefined after healthy
      expect(body2.recoveryState?.consecutiveDegraded ?? 0).toBe(0);
    });

    it('should trigger proactive investigation after prolonged DEGRADED state', async () => {
      // Simulate 6 consecutive DEGRADED checks (30 minutes at 5-minute intervals)
      mockPrisma.$executeRaw.mockResolvedValue(0);

      for (let i = 0; i < 6; i++) {
        mockFetch.mockResolvedValueOnce(createHealthResponse({
          status: 'DEGRADED',
          minutesSinceLastCompletion: 45 + i * 5,
        }));

        const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
          headers: { 'x-cron-secret': cronSecret },
        });
        const response = await GET(request);
        const body = await response.json() as { action: string };

        if (i < 5) {
          expect(body.action).toBe('monitoring');
        } else {
          // After 6 consecutive DEGRADED, should trigger investigation
          expect(body.action).toBe('proactive-investigation');
        }
      }
    });
  });

  describe('Cleanup reporting', () => {
    it('should log count of all cleaned jobs by type', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'CRITICAL',
        jobs: {
          exhaustedRetrying: 3,
          invalidJobTypes: 2,
          staleProcessing: 1,
        },
      }));

      mockPrisma.$executeRaw.mockResolvedValueOnce(3);
      mockPrisma.$executeRaw.mockResolvedValueOnce(2);
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      await GET(request);

      // Verify cleanup was logged with breakdown
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AutoRecover]'),
        expect.objectContaining({
          exhaustedRetrying: 3,
          invalidJobTypes: 2,
          staleProcessing: 1,
        })
      );

      consoleSpy.mockRestore();
    });

    it('should send Slack notification with cleanup summary', async () => {
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'CRITICAL',
        jobs: { exhaustedRetrying: 5 },
      }));

      mockPrisma.$executeRaw.mockResolvedValueOnce(5);
      mockPrisma.$executeRaw.mockResolvedValueOnce(0);
      mockPrisma.$executeRaw.mockResolvedValueOnce(0);

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      await GET(request);

      // Verify Slack notification was sent via webhook service
      expect(mockPostRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'section',
              text: expect.objectContaining({
                text: expect.stringContaining('Auto-Recovery Cleaned'),
              }),
            }),
          ]),
        })
      );
    });

    it('should NOT send Slack notification when no cleanup needed', async () => {
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'HEALTHY',
      }));

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      await GET(request);

      // No Slack notification for healthy pipeline
      expect(mockPostRaw).not.toHaveBeenCalled();
    });
  });

  describe('Integration with existing recovery logic', () => {
    it('should still handle stale locks cleanup via immediate-cleanup', async () => {
      mockFetch
        .mockResolvedValueOnce(createHealthResponse({
          status: 'DEGRADED',
          locks: { staleCount: 3 },
          // No stuck jobs, only stale locks
          jobs: { exhaustedRetrying: 0, invalidJobTypes: 0, staleProcessing: 0 },
        }))
        .mockResolvedValueOnce({
          // Force cleanup call for locks
          ok: true,
          json: async () => ({ success: true, locksCleared: 3 }),
        });

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as {
        action: string;
        cleanup?: { staleLocks: number; total: number };
      };

      // Now stale locks are cleaned as part of immediate-cleanup
      expect(body.action).toBe('immediate-cleanup');
      expect(body.cleanup?.staleLocks).toBe(3);
      expect(body.cleanup?.total).toBe(3);
    });

    it('should perform stuck job cleanup BEFORE checking health status for other actions', async () => {
      // Health shows CRITICAL but after cleanup it should be clean
      mockFetch.mockResolvedValueOnce(createHealthResponse({
        status: 'CRITICAL',
        jobs: { exhaustedRetrying: 5 },
      }));

      mockPrisma.$executeRaw.mockResolvedValueOnce(5); // cleanup removes all stuck jobs
      mockPrisma.$executeRaw.mockResolvedValueOnce(0);
      mockPrisma.$executeRaw.mockResolvedValueOnce(0);

      const request = new NextRequest('http://localhost/api/cron?action=auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as { action: string };

      // Should report immediate-cleanup action
      expect(body.action).toBe('immediate-cleanup');
    });
  });
});
