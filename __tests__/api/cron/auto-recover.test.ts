/**
 * Auto-Recover Endpoint Tests
 *
 * Tests for the original auto-recovery functionality.
 * Updated to align with Phase 2 self-healing implementation.
 *
 * @see docs/plans/2026-01-05-100-percent-pipeline-uptime.md
 */
import { NextRequest } from 'next/server';
import { GET, _resetRecoveryStateForTesting } from '@/app/api/cron/auto-recover/route';

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Prisma for direct database operations
const mockPrisma = {
  $executeRaw: jest.fn(),
};

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

// Mock Slack webhook service
jest.mock('@/lib/slack/webhook-service', () => ({
  slackWebhookService: {
    isConfigured: jest.fn().mockReturnValue(false), // Default to not configured
    postRaw: jest.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('/api/cron/auto-recover', () => {
  const cronSecret = 'test-cron-secret';

  /**
   * Helper to create a mock health response with the correct structure
   */
  function createHealthResponse(overrides: {
    status?: string;
    minutesSinceLastCompletion?: number | null;
    jobs?: {
      exhaustedRetrying?: number;
      invalidJobTypes?: number;
      staleProcessing?: number;
    };
    locks?: { staleCount?: number };
  } = {}) {
    return {
      ok: true,
      json: async () => ({
        status: overrides.status ?? 'HEALTHY',
        minutesSinceLastCompletion: overrides.minutesSinceLastCompletion ?? 5,
        jobs: {
          pending: 10,
          processing: 2,
          completedLast1h: 50,
          completedLast24h: 200,
          deadLetter: 0,
          retrying: 0,
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

  beforeEach(() => {
    process.env.CRON_SECRET = cronSecret;
    process.env.ADMIN_API_SECRET = 'admin-secret';
    process.env.PUBLIC_URL = 'https://tldrsec.app';
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockPrisma.$executeRaw.mockReset();
    _resetRecoveryStateForTesting();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_API_SECRET;
    delete process.env.PUBLIC_URL;
  });

  describe('Authentication', () => {
    it('should reject requests without valid cron secret', async () => {
      const request = new NextRequest('http://localhost/api/cron/auto-recover');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid cron secret in header', async () => {
      mockFetch.mockResolvedValue(createHealthResponse({ status: 'HEALTHY' }));

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Recovery Logic', () => {
    it('should take no action when pipeline is HEALTHY', async () => {
      mockFetch.mockResolvedValue(createHealthResponse({ status: 'HEALTHY' }));

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as { action: string; reason: string };

      expect(body.action).toBe('none');
      expect(body.reason).toContain('healthy');
    });

    it('should trigger immediate-cleanup when stale locks detected', async () => {
      mockFetch
        .mockResolvedValueOnce(createHealthResponse({
          status: 'DEGRADED',
          minutesSinceLastCompletion: 45,
          locks: { staleCount: 5 },
        }))
        .mockResolvedValueOnce({
          // Force cleanup call
          ok: true,
          json: async () => ({ success: true, locksCleared: 5 }),
        });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as {
        action: string;
        cleanup?: { staleLocks: number; total: number };
      };

      // With Phase 2, stale locks are now part of immediate-cleanup
      expect(body.action).toBe('immediate-cleanup');
      expect(body.cleanup?.staleLocks).toBe(5);
    });

    it('should trigger redeploy when stall exceeds threshold and no cleanup needed', async () => {
      mockFetch
        .mockResolvedValueOnce(createHealthResponse({
          status: 'CRITICAL',
          minutesSinceLastCompletion: 200,
          // No stuck jobs or stale locks - nothing to clean
          locks: { staleCount: 0 },
          jobs: { exhaustedRetrying: 0, invalidJobTypes: 0, staleProcessing: 0 },
        }))
        .mockResolvedValueOnce({
          // Redeploy call
          ok: true,
          json: async () => ({ success: true, deploymentId: 'dpl_123' }),
        });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as { action: string; deploymentId?: string };

      expect(body.action).toBe('redeploy');
      expect(body.deploymentId).toBe('dpl_123');
    });

    it('should cleanup first, not immediately redeploy when stuck jobs exist', async () => {
      // This tests that cleanup happens before redeploy is considered
      mockFetch
        .mockResolvedValueOnce(createHealthResponse({
          status: 'CRITICAL',
          minutesSinceLastCompletion: 200,
          locks: { staleCount: 3 },
        }))
        .mockResolvedValueOnce({
          // Force cleanup call
          ok: true,
          json: async () => ({ success: true, locksCleared: 3 }),
        });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as { action: string };

      // Should cleanup first via immediate-cleanup
      expect(body.action).toBe('immediate-cleanup');
    });
  });
});
