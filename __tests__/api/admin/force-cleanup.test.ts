import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/force-cleanup/route';

// Mock the lock service
jest.mock('@/lib/job-queue/lock-service', () => ({
  LockService: {
    forceCleanupAllLocks: jest.fn(),
    getLockHealthMetrics: jest.fn(),
  },
}));

// Mock the distributed lock manager
jest.mock('@/lib/db/distributed-lock', () => ({
  DistributedLockManager: {
    emergencyReleaseAllAdvisoryLocks: jest.fn(),
  },
}));

describe('/api/admin/force-cleanup', () => {
  const validSecret = 'test-admin-secret';

  beforeEach(() => {
    process.env.ADMIN_API_SECRET = validSecret;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ADMIN_API_SECRET;
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost/api/admin/force-cleanup');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid secret', async () => {
      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': 'Bearer wrong-secret' },
      });
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid secret', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockResolvedValue(5);
      LockService.getLockHealthMetrics.mockResolvedValue({ staleLocksCount: 0 });

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Force Cleanup Execution', () => {
    it('should call forceCleanupAllLocks and return count', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockResolvedValue(10);
      LockService.getLockHealthMetrics.mockResolvedValue({
        staleLocksCount: 0,
        activeLocksCount: 0,
        healthStatus: 'HEALTHY'
      });

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);
      const body = await response.json() as { locksCleared: number; success: boolean };

      expect(response.status).toBe(200);
      expect(body.locksCleared).toBe(10);
      expect(body.success).toBe(true);
      expect(LockService.forceCleanupAllLocks).toHaveBeenCalledTimes(1);
    });

    it('should call emergencyReleaseAllAdvisoryLocks when includeAdvisory=true', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      const { DistributedLockManager } = require('@/lib/db/distributed-lock');

      LockService.forceCleanupAllLocks.mockResolvedValue(5);
      LockService.getLockHealthMetrics.mockResolvedValue({ staleLocksCount: 0 });
      DistributedLockManager.emergencyReleaseAllAdvisoryLocks.mockResolvedValue(undefined);

      const request = new NextRequest(
        'http://localhost/api/admin/force-cleanup?includeAdvisory=true',
        { headers: { 'Authorization': `Bearer ${validSecret}` } }
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(DistributedLockManager.emergencyReleaseAllAdvisoryLocks).toHaveBeenCalledTimes(1);
    });

    it('should return error on cleanup failure', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json() as { error: string };
      expect(body.error).toContain('Database error');
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers in response', async () => {
      const { LockService } = require('@/lib/job-queue/lock-service');
      LockService.forceCleanupAllLocks.mockResolvedValue(0);
      LockService.getLockHealthMetrics.mockResolvedValue({ staleLocksCount: 0 });

      const request = new NextRequest('http://localhost/api/admin/force-cleanup', {
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });
  });
});
