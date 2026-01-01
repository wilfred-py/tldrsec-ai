import { NextRequest } from 'next/server';
import { GET, _resetRecoveryStateForTesting } from '@/app/api/cron/auto-recover/route';

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('/api/cron/auto-recover', () => {
  const cronSecret = 'test-cron-secret';

  beforeEach(() => {
    process.env.CRON_SECRET = cronSecret;
    process.env.ADMIN_API_SECRET = 'admin-secret';
    process.env.VERCEL_URL = 'https://tldrsec.app';
    jest.clearAllMocks();
    mockFetch.mockReset();
    _resetRecoveryStateForTesting();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_API_SECRET;
    delete process.env.VERCEL_URL;
  });

  describe('Authentication', () => {
    it('should reject requests without valid cron secret', async () => {
      const request = new NextRequest('http://localhost/api/cron/auto-recover');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid cron secret in header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'HEALTHY',
          jobQueue: { minutesSinceLastCompletion: 5, pendingCount: 0, processingCount: 0 },
          lockHealth: { staleLocksCount: 0, activeLocksCount: 0, healthStatus: 'HEALTHY' },
        }),
      });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Recovery Logic', () => {
    it('should take no action when pipeline is HEALTHY', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'HEALTHY',
          jobQueue: { minutesSinceLastCompletion: 5 },
          lockHealth: { staleLocksCount: 0 },
        }),
      });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as { action: string; reason: string };

      expect(body.action).toBe('none');
      expect(body.reason).toContain('healthy');
    });

    it('should trigger force cleanup when stale locks detected', async () => {
      mockFetch
        .mockResolvedValueOnce({
          // Health check
          ok: true,
          json: async () => ({
            status: 'DEGRADED',
            jobQueue: { minutesSinceLastCompletion: 45 },
            lockHealth: { staleLocksCount: 5 },
          }),
        })
        .mockResolvedValueOnce({
          // Force cleanup call
          ok: true,
          json: async () => ({ success: true, locksCleared: 5 }),
        });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as { action: string; locksCleared: number };

      expect(body.action).toBe('cleanup');
      expect(body.locksCleared).toBe(5);
    });

    it('should trigger redeploy when stall exceeds threshold and cleanup already attempted', async () => {
      mockFetch
        .mockResolvedValueOnce({
          // Health check shows critical stall
          ok: true,
          json: async () => ({
            status: 'CRITICAL',
            jobQueue: { minutesSinceLastCompletion: 200 },
            lockHealth: { staleLocksCount: 0 }, // Already cleaned
          }),
        })
        .mockResolvedValueOnce({
          // Redeploy call
          ok: true,
          json: async () => ({ success: true, deploymentId: 'dpl_123' }),
        });

      const request = new NextRequest('http://localhost/api/cron/auto-recover', {
        headers: { 'x-cron-secret': cronSecret },
      });
      const response = await GET(request);
      const body = await response.json() as { action: string; deploymentId: string };

      expect(body.action).toBe('redeploy');
      expect(body.deploymentId).toBe('dpl_123');
    });

    it('should not redeploy if cleanup was just performed', async () => {
      // This tests the "wait 10 minutes after cleanup before redeploying" logic
      mockFetch
        .mockResolvedValueOnce({
          // Health check shows critical stall with stale locks
          ok: true,
          json: async () => ({
            status: 'CRITICAL',
            jobQueue: { minutesSinceLastCompletion: 200 },
            lockHealth: { staleLocksCount: 3 }, // Still has stale locks, cleanup needed first
          }),
        })
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

      // Should cleanup first, not immediately redeploy
      expect(body.action).toBe('cleanup');
    });
  });
});
