/**
 * Final Backup Cron Endpoint Tests
 *
 * Tests for Phase 7 of the Eliminate Manual Pipeline Intervention plan.
 * Verifies the final backup endpoint that runs via Vercel cron as
 * the last-resort backup when both Cloudflare Workers fail.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 7
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
const mockCronJobExecution = {
  findFirst: jest.fn(),
  create: jest.fn(),
};

const mockPrisma = {
  cronJobExecution: mockCronJobExecution,
};

// Mock global fetch for Slack notifications and tier-aware endpoint
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

// Import after mocks
import { GET } from '@/app/api/cron/route';

function createMockRequest(
  url = 'http://localhost:3000/api/cron/final-backup'
): NextRequest {
  return new NextRequest(url, {
    headers: {
      authorization: `Bearer test-cron-secret`,
    },
  });
}

function createMockRequestWithQuerySecret(
  url = 'http://localhost:3000/api/cron/final-backup?secret=test-cron-secret'
): NextRequest {
  return new NextRequest(url);
}

describe('Final Backup Cron Endpoint - Phase 7', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    process.env.PUBLIC_URL = 'https://tldrsec.app';

    // Default: No recent execution (emergency scenario)
    mockCronJobExecution.findFirst.mockResolvedValue(null);
    mockCronJobExecution.create.mockResolvedValue({
      id: 'test-execution-id',
      jobType: 'sec-filing-monitor',
      source: 'final-backup',
    });

    // Default mock fetch responses
    mockFetch.mockImplementation((url: string) => {
      // Slack webhook
      if (url.includes('slack.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        });
      }
      // tier-aware endpoint
      if (url.includes('/api/cron/tier-aware')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              jobs: { created: 5, processed: 3 },
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authorization', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/cron/final-backup',
        { headers: {} }
      );

      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept requests with Bearer authorization header', async () => {
      const request = createMockRequest();

      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should accept requests with query parameter secret', async () => {
      const request = createMockRequestWithQuerySecret();

      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Skip Logic - Recent Execution Exists', () => {
    it('should skip when recent execution exists within 25 minutes', async () => {
      // Mock recent execution from primary Cloudflare Worker
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mockCronJobExecution.findFirst.mockResolvedValue({
        id: 'recent-execution',
        triggeredAt: fiveMinutesAgo,
        source: 'cloudflare-cron',
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toContain('Recent execution found');
    });

    it('should include source of recent execution in skip response', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mockCronJobExecution.findFirst.mockResolvedValue({
        id: 'recent-execution',
        triggeredAt: fiveMinutesAgo,
        source: 'backup-trigger', // From watchdog
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.source).toBe('backup-trigger');
    });

    it('should skip even for auto-recover executions', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      mockCronJobExecution.findFirst.mockResolvedValue({
        id: 'auto-recover-execution',
        triggeredAt: tenMinutesAgo,
        source: 'auto-recover',
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.skipped).toBe(true);
    });
  });

  describe('Emergency Pipeline Execution', () => {
    it('should run pipeline when no recent execution exists', async () => {
      mockCronJobExecution.findFirst.mockResolvedValue(null);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.skipped).toBeUndefined();
      expect(data.source).toBe('final-backup');
    });

    it('should call tier-aware endpoint when triggering', async () => {
      mockCronJobExecution.findFirst.mockResolvedValue(null);

      const request = createMockRequest();
      await GET(request);

      // Verify tier-aware endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/cron/tier-aware'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-final-backup-source': 'true',
          }),
        })
      );
    });

    it('should send emergency Slack alert when triggering', async () => {
      mockCronJobExecution.findFirst.mockResolvedValue(null);

      const request = createMockRequest();
      await GET(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('EMERGENCY'),
        })
      );
    });

    it('should log execution to database', async () => {
      mockCronJobExecution.findFirst.mockResolvedValue(null);

      const request = createMockRequest();
      await GET(request);

      expect(mockCronJobExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobType: 'sec-filing-monitor',
          source: 'final-backup',
          status: 'COMPLETED',
        }),
      });
    });

    it('should include pipeline result in response', async () => {
      mockCronJobExecution.findFirst.mockResolvedValue(null);
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/cron/tier-aware')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                jobs: { created: 10, processed: 8 },
              }),
          });
        }
        if (url.includes('slack.com')) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.result).toBeDefined();
      expect(data.result.success).toBe(true);
      expect(data.result.jobs).toEqual({ created: 10, processed: 8 });
    });
  });

  describe('Error Handling', () => {
    it('should handle tier-aware endpoint errors gracefully', async () => {
      mockCronJobExecution.findFirst.mockResolvedValue(null);
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/cron/tier-aware')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Pipeline failed' }),
          });
        }
        if (url.includes('slack.com')) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Pipeline');
    });

    it('should handle database errors gracefully', async () => {
      mockCronJobExecution.findFirst.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Database connection failed');
    });

    it('should continue if Slack notification fails', async () => {
      mockCronJobExecution.findFirst.mockResolvedValue(null);
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('slack.com')) {
          return Promise.reject(new Error('Slack webhook failed'));
        }
        if (url.includes('/api/cron/tier-aware')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      // Should still succeed despite Slack failure
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Threshold Boundary Tests', () => {
    it('should skip for execution exactly at 24 minutes ago', async () => {
      const twentyFourMinutesAgo = new Date(Date.now() - 24 * 60 * 1000);
      mockCronJobExecution.findFirst.mockResolvedValue({
        id: 'boundary-execution',
        triggeredAt: twentyFourMinutesAgo,
        source: 'cloudflare-cron',
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.skipped).toBe(true);
    });

    it('should run pipeline for execution at 26 minutes ago (outside threshold)', async () => {
      // Configure findFirst to return null (no recent execution within threshold)
      // The query uses gte: twentyFiveMinutesAgo, so 26 min ago won't match
      mockCronJobExecution.findFirst.mockResolvedValue(null);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.skipped).toBeUndefined();
      // Verify tier-aware was called (not mockRunTierAwarePipeline)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/cron/tier-aware'),
        expect.any(Object)
      );
    });
  });
});
