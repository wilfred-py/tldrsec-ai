/**
 * DLQ Cleanup Endpoint Tests
 *
 * Tests the automated cleanup of Dead Letter Queue entries and old failed jobs.
 */

import { NextRequest } from 'next/server';
import { POST, GET } from '@/app/api/cron/route';
import { getPrismaClient } from '@/lib/db/prisma';
import { DeadLetterQueueService } from '@/lib/job-queue/dead-letter-queue';
import { CronAuthService } from '@/lib/cron/auth-service';

// Mock dependencies
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn()
}));

jest.mock('@/lib/job-queue/dead-letter-queue', () => ({
  DeadLetterQueueService: {
    cleanupOldEntries: jest.fn()
  }
}));

jest.mock('@/lib/cron/auth-service', () => ({
  CronAuthService: {
    authenticateRequest: jest.fn()
  }
}));

jest.mock('@/lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    start: jest.fn(() => ({
      complete: jest.fn(),
      fail: jest.fn()
    }))
  }
}));

describe('DLQ Cleanup Endpoint', () => {
  let mockPrisma: any;
  let cleanupSpy: jest.SpyInstance;
  let authSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Prisma client
    mockPrisma = {
      jobQueue: {
        deleteMany: jest.fn()
      },
      deadLetterQueue: {
        count: jest.fn(),
        findMany: jest.fn()
      }
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    // Setup spies for static methods
    cleanupSpy = jest.spyOn(DeadLetterQueueService, 'cleanupOldEntries');
    authSpy = jest.spyOn(CronAuthService, 'authenticateRequest');
  });

  afterEach(() => {
    cleanupSpy.mockRestore();
    authSpy.mockRestore();
  });

  describe('POST /api/cron/cleanup-dlq', () => {
    it('should require HMAC authentication', async () => {
      authSpy.mockResolvedValue({
        authenticated: false,
        error: 'Invalid HMAC signature'
      });

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should clean reprocessed DLQ entries older than 30 days', async () => {
      authSpy.mockResolvedValue({
        authenticated: true
      });

      cleanupSpy.mockResolvedValue(15);
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 10 });
      mockPrisma.deadLetterQueue.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(120); // reprocessed
      mockPrisma.deadLetterQueue.findMany.mockResolvedValue([]);

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.dlqCleaned).toBe(15);
      expect(cleanupSpy).toHaveBeenCalledWith(30);
    });

    it('should clean FAILED jobs older than 14 days from main queue', async () => {
      authSpy.mockResolvedValue({
        authenticated: true
      });

      cleanupSpy.mockResolvedValue(5);
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 20 });
      mockPrisma.deadLetterQueue.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(100);
      mockPrisma.deadLetterQueue.findMany.mockResolvedValue([]);

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.failedJobsCleaned).toBe(20);

      // Verify deleteMany called with correct cutoff
      const deleteCall = mockPrisma.jobQueue.deleteMany.mock.calls[0][0];
      expect(deleteCall.where.status).toBe('FAILED');
      expect(deleteCall.where.createdAt.lt).toBeInstanceOf(Date);

      // Verify cutoff is approximately 14 days ago (allow 1 minute tolerance)
      const cutoffTime = deleteCall.where.createdAt.lt.getTime();
      const expectedCutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(cutoffTime - expectedCutoff);
      expect(diff).toBeLessThan(60 * 1000); // Less than 1 minute difference
    });

    it('should respect time cutoffs and not remove recent jobs', async () => {
      authSpy.mockResolvedValue({
        authenticated: true
      });

      cleanupSpy.mockResolvedValue(0);
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.deadLetterQueue.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(50);
      mockPrisma.deadLetterQueue.findMany.mockResolvedValue([
        {
          id: 'dlq-1',
          lastError: 'Recent error',
          createdAt: new Date(Date.now() - 1000 * 60 * 30) // 30 minutes ago
        }
      ]);

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.dlqCleaned).toBe(0); // No old entries to clean
      expect(data.failedJobsCleaned).toBe(0); // No old FAILED jobs
    });

    it('should trigger WARNING alert at 50 entries', async () => {
      authSpy.mockResolvedValue({
        authenticated: true
      });

      cleanupSpy.mockResolvedValue(0);
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.deadLetterQueue.count
        .mockResolvedValueOnce(55) // pending - exceeds WARNING threshold
        .mockResolvedValueOnce(100); // reprocessed
      mockPrisma.deadLetterQueue.findMany.mockResolvedValue([]);

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.alerts).toHaveLength(1);
      expect(data.alerts[0].level).toBe('WARNING');
      expect(data.alerts[0].message).toContain('55 pending entries');
    });

    it('should trigger CRITICAL alert at 100 entries', async () => {
      authSpy.mockResolvedValue({
        authenticated: true
      });

      cleanupSpy.mockResolvedValue(0);
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.deadLetterQueue.count
        .mockResolvedValueOnce(120) // pending - exceeds CRITICAL threshold
        .mockResolvedValueOnce(200); // reprocessed
      mockPrisma.deadLetterQueue.findMany.mockResolvedValue([]);

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.alerts).toHaveLength(1);
      expect(data.alerts[0].level).toBe('CRITICAL');
      expect(data.alerts[0].message).toContain('120 pending entries');
    });

    it('should handle empty DLQ gracefully', async () => {
      authSpy.mockResolvedValue({
        authenticated: true
      });

      cleanupSpy.mockResolvedValue(0);
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.deadLetterQueue.count
        .mockResolvedValueOnce(0) // pending
        .mockResolvedValueOnce(0); // reprocessed
      mockPrisma.deadLetterQueue.findMany.mockResolvedValue([]);

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.dlqMetrics.pendingCount).toBe(0);
      expect(data.alerts).toHaveLength(0);
    });

    it('should collect error patterns and age distribution', async () => {
      authSpy.mockResolvedValue({
        authenticated: true
      });

      cleanupSpy.mockResolvedValue(0);
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.deadLetterQueue.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(10);

      const now = Date.now();
      mockPrisma.deadLetterQueue.findMany.mockResolvedValue([
        {
          id: 'dlq-1',
          lastError: 'timeout error',
          createdAt: new Date(now - 30 * 60 * 1000) // 30 minutes ago
        },
        {
          id: 'dlq-2',
          lastError: 'timeout error',
          createdAt: new Date(now - 2 * 60 * 60 * 1000) // 2 hours ago
        },
        {
          id: 'dlq-3',
          lastError: 'executionContext undefined',
          createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000) // 8 days ago
        }
      ]);

      const request = new Request('http://localhost:3000/api/cron?action=cleanup-dlq', {
        method: 'POST'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Error patterns
      expect(data.dlqMetrics.errorPatterns).toHaveProperty('timeout error', 2);
      expect(data.dlqMetrics.errorPatterns).toHaveProperty('executionContext undefined', 1);

      // Age distribution
      expect(data.dlqMetrics.ageDistribution.lessThan1Hour).toBe(1);
      expect(data.dlqMetrics.ageDistribution.lessThan1Day).toBe(1);
      expect(data.dlqMetrics.ageDistribution.moreThan1Week).toBe(1);
    });
  });

  describe('GET /api/cron?action=cleanup-dlq', () => {
    it('should return 400 for cleanup-dlq via GET (POST-only action)', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron?action=cleanup-dlq');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });
});
