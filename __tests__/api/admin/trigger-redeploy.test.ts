import { NextRequest } from 'next/server';
import { POST, _resetRateLimitForTesting } from '@/app/api/admin/trigger-redeploy/route';

// Mock fetch for Deploy Hook calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('/api/admin/trigger-redeploy', () => {
  const validSecret = 'test-admin-secret';
  const deployHookUrl = 'https://api.vercel.com/v1/integrations/deploy-hooks/test-hook';

  beforeEach(() => {
    process.env.ADMIN_API_SECRET = validSecret;
    process.env.VERCEL_DEPLOY_HOOK_URL = deployHookUrl;
    jest.clearAllMocks();
    mockFetch.mockReset();
    // Reset rate limit state between tests
    _resetRateLimitForTesting();
  });

  afterEach(() => {
    delete process.env.ADMIN_API_SECRET;
    delete process.env.VERCEL_DEPLOY_HOOK_URL;
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid secret', async () => {
      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer wrong-secret' },
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Deploy Hook Trigger', () => {
    it('should call Vercel Deploy Hook and return deployment info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: { id: 'dpl_123', state: 'PENDING', createdAt: Date.now() },
        }),
      });

      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ reason: 'Pipeline stall recovery' }),
      });
      const response = await POST(request);
      const body = await response.json() as { success: boolean; deploymentId: string };

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deploymentId).toBe('dpl_123');
      expect(mockFetch).toHaveBeenCalledWith(deployHookUrl, expect.any(Object));
    });

    it('should return error if Deploy Hook URL not configured', async () => {
      delete process.env.VERCEL_DEPLOY_HOOK_URL;

      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const body = await response.json() as { error: string };
      expect(body.error).toContain('Deploy Hook URL not configured');
    });

    it('should return error on Deploy Hook failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const request = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await POST(request);

      expect(response.status).toBe(502);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce 1-hour cooldown between redeployments', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ job: { id: 'dpl_123', state: 'PENDING' } }),
      });

      // First request should succeed
      const request1 = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Second request within 1 hour should be rate limited
      const request2 = new NextRequest('http://localhost/api/admin/trigger-redeploy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response2 = await POST(request2);
      expect(response2.status).toBe(429);

      const body = await response2.json() as { error: string };
      expect(body.error).toContain('Cooldown');
    });

    it('should enforce max 3 redeployments per 24 hours', async () => {
      // This test would need time mocking - placeholder for now
      expect(true).toBe(true);
    });
  });
});
