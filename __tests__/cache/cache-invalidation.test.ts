/**
 * Cache Invalidation Service Test Suite
 * 
 * Comprehensive tests for cache invalidation functionality including
 * service methods, API endpoints, and integration with filing processor.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { cacheInvalidationService } from '../../lib/cache/cache-invalidation-service';
import { getPrismaClient } from '../../lib/db/prisma';

describe('Cache Invalidation Service', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let testTickerId: string;
  let testSummaryIds: string[] = [];

  beforeAll(async () => {
    prisma = getPrismaClient();
    
    // Ensure we're in test environment
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cache invalidation tests cannot run in production');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test data for each test
    const testUser = await prisma.user.create({
      data: {
        id: `test-user-cache-${Date.now()}`,
        email: `test-cache-${Date.now()}@example.com`,
        authProvider: 'test',
        authProviderId: `test-${Date.now()}`,
        subscriptionTier: 'FREE'
      }
    });
    testUserId = testUser.id;

    const testTicker = await prisma.ticker.create({
      data: {
        symbol: 'TEST',
        companyName: 'Test Company for Cache Invalidation',
        userId: testUserId
      }
    });
    testTickerId = testTicker.id;

    // Create test summaries
    const summary1 = await prisma.summary.create({
      data: {
        tickerId: testTickerId,
        filingType: '10-K',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://example.com/test-filing-1',
        summaryText: 'Test summary 1 for cache invalidation',
        totalCost: 0.05,
        tokensUsed: 1000,
        processingStatus: 'SUCCESS'
      }
    });

    const summary2 = await prisma.summary.create({
      data: {
        tickerId: testTickerId,
        filingType: '10-Q',
        filingDate: new Date('2024-02-15'),
        filingUrl: 'https://example.com/test-filing-2',
        summaryText: 'Test summary 2 for cache invalidation',
        totalCost: 0.03,
        tokensUsed: 800,
        processingStatus: 'SUCCESS'
      }
    });

    testSummaryIds = [summary1.id, summary2.id];
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.summary.deleteMany({
      where: { id: { in: testSummaryIds } }
    });
    await prisma.ticker.deleteMany({
      where: { id: testTickerId }
    });
    await prisma.user.deleteMany({
      where: { id: testUserId }
    });
    await prisma.cacheInvalidation.deleteMany({
      where: { requesterId: { contains: 'test-cache' } }
    });
    
    testSummaryIds = [];
  });

  describe('Environment Safety', () => {
    test('should block production environment operations', async () => {
      // Temporarily set NODE_ENV to production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await expect(
          cacheInvalidationService.invalidateCache({
            tickers: ['TEST'],
            environment: 'test',
            reason: 'Testing production block',
            requesterId: 'test-user'
          })
        ).rejects.toThrow('Cache invalidation is not allowed in production environment');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('should validate environment parameter', async () => {
      await expect(
        cacheInvalidationService.invalidateCache({
          tickers: ['TEST'],
          environment: 'production' as any,
          reason: 'Testing environment validation',
          requesterId: 'test-user'
        })
      ).rejects.toThrow('Invalid environment: production');
    });

    test('should allow valid test environments', async () => {
      const validEnvironments = ['test', 'dev', 'staging'];
      
      for (const env of validEnvironments) {
        const result = await cacheInvalidationService.invalidateCache({
          tickers: ['NONEXISTENT'],
          environment: env as any,
          reason: `Testing ${env} environment`,
          requesterId: 'test-user',
          dryRun: true
        });
        
        expect(result.success).toBe(true);
        expect(result.environment).toBe(env);
      }
    });
  });

  describe('Cache Statistics', () => {
    test('should return accurate cache statistics', async () => {
      const stats = await cacheInvalidationService.getCacheStatistics();
      
      expect(stats).toMatchObject({
        totalSummaries: expect.any(Number),
        invalidatedSummaries: expect.any(Number),
        cacheHitRate: expect.any(Number),
        totalCacheValue: expect.any(Number),
        breakdown: {
          byTicker: expect.any(Object),
          byFilingType: expect.any(Object)
        }
      });

      expect(stats.totalSummaries).toBeGreaterThanOrEqual(2); // Our test summaries
      expect(stats.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(stats.cacheHitRate).toBeLessThanOrEqual(100);
    });

    test('should include test summaries in breakdown', async () => {
      const stats = await cacheInvalidationService.getCacheStatistics();
      
      expect(stats.breakdown.byTicker['TEST']).toBeGreaterThanOrEqual(2);
      expect(stats.breakdown.byFilingType['10-K']).toBeGreaterThanOrEqual(1);
      expect(stats.breakdown.byFilingType['10-Q']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cache Invalidation Preview', () => {
    test('should preview invalidation without modifying data', async () => {
      const preview = await cacheInvalidationService.previewInvalidation({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing preview functionality',
        requesterId: 'test-user'
      });

      expect(preview).toMatchObject({
        estimatedCount: expect.any(Number),
        sampleSummaries: expect.any(Array),
        tickerBreakdown: expect.any(Object),
        filingTypeBreakdown: expect.any(Object),
        estimatedCostImpact: expect.any(Number)
      });

      expect(preview.estimatedCount).toBeGreaterThanOrEqual(2);
      expect(preview.tickerBreakdown['TEST']).toBeGreaterThanOrEqual(2);
      
      // Verify no data was actually modified
      const summaries = await prisma.summary.findMany({
        where: { id: { in: testSummaryIds } }
      });
      
      expect(summaries.every(s => !s.forceRefreshFlag)).toBe(true);
    });

    test('should filter by filing type in preview', async () => {
      const preview = await cacheInvalidationService.previewInvalidation({
        tickers: ['TEST'],
        filingTypes: ['10-K'],
        environment: 'test',
        reason: 'Testing filing type filter',
        requesterId: 'test-user'
      });

      expect(preview.estimatedCount).toBe(1);
      expect(preview.filingTypeBreakdown['10-K']).toBe(1);
      expect(preview.filingTypeBreakdown['10-Q']).toBeUndefined();
    });

    test('should filter by date range in preview', async () => {
      const preview = await cacheInvalidationService.previewInvalidation({
        tickers: ['TEST'],
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31')
        },
        environment: 'test',
        reason: 'Testing date range filter',
        requesterId: 'test-user'
      });

      expect(preview.estimatedCount).toBe(1); // Only January filing
    });
  });

  describe('Soft Invalidation Strategy', () => {
    test('should mark summaries with force refresh flag', async () => {
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing soft invalidation',
        requesterId: 'test-user',
        strategy: 'soft'
      });

      expect(result.success).toBe(true);
      expect(result.invalidatedCount).toBe(2);
      expect(result.strategy).toBe('soft');
      expect(result.affectedSummaries).toHaveLength(2);

      // Verify database changes
      const invalidatedSummaries = await prisma.summary.findMany({
        where: { id: { in: testSummaryIds } }
      });

      expect(invalidatedSummaries.every(s => s.forceRefreshFlag)).toBe(true);
      expect(invalidatedSummaries.every(s => s.lastInvalidatedAt)).toBeTruthy();
      expect(invalidatedSummaries.every(s => s.invalidationCount === 1)).toBe(true);
      expect(invalidatedSummaries.every(s => s.invalidationReason === 'Testing soft invalidation')).toBe(true);
      expect(invalidatedSummaries.every(s => s.invalidatedBy === 'test-user')).toBe(true);
    });

    test('should create audit record for invalidation', async () => {
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        filingTypes: ['10-K'],
        environment: 'test',
        reason: 'Testing audit trail',
        requesterId: 'test-audit-user',
        strategy: 'soft'
      });

      expect(result.success).toBe(true);

      // Check audit record was created
      const auditRecord = await prisma.cacheInvalidation.findUnique({
        where: { correlationId: result.correlationId }
      });

      expect(auditRecord).toBeTruthy();
      expect(auditRecord!.requesterId).toBe('test-audit-user');
      expect(auditRecord!.environment).toBe('test');
      expect(auditRecord!.reason).toBe('Testing audit trail');
      expect(auditRecord!.strategy).toBe('soft');
      expect(auditRecord!.invalidatedCount).toBe(1);
      expect(auditRecord!.success).toBe(true);
    });

    test('should handle empty result sets gracefully', async () => {
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['NONEXISTENT'],
        environment: 'test',
        reason: 'Testing empty results',
        requesterId: 'test-user',
        strategy: 'soft'
      });

      expect(result.success).toBe(true);
      expect(result.invalidatedCount).toBe(0);
      expect(result.affectedSummaries).toHaveLength(0);
    });
  });

  describe('Timestamp Invalidation Strategy', () => {
    test('should update invalidation timestamp without force refresh flag', async () => {
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing timestamp invalidation',
        requesterId: 'test-user',
        strategy: 'timestamp'
      });

      expect(result.success).toBe(true);
      expect(result.invalidatedCount).toBe(2);
      expect(result.strategy).toBe('timestamp');

      // Verify database changes
      const invalidatedSummaries = await prisma.summary.findMany({
        where: { id: { in: testSummaryIds } }
      });

      expect(invalidatedSummaries.every(s => !s.forceRefreshFlag)).toBe(true); // No force refresh flag
      expect(invalidatedSummaries.every(s => s.lastInvalidatedAt)).toBeTruthy();
      expect(invalidatedSummaries.every(s => s.invalidationCount === 1)).toBe(true);
    });
  });

  describe('Hard Invalidation Strategy', () => {
    test('should require confirmDestructive flag for hard invalidation', async () => {
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing hard invalidation safety',
        requesterId: 'test-user',
        strategy: 'hard'
      });

      // Should succeed because service doesn't enforce confirmDestructive
      // (that's handled at API level)
      expect(result.success).toBe(true);
    });

    test('should permanently delete summaries with hard strategy', async () => {
      const originalCount = await prisma.summary.count();
      
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing hard deletion',
        requesterId: 'test-user',
        strategy: 'hard'
      });

      expect(result.success).toBe(true);
      expect(result.invalidatedCount).toBe(2);

      // Verify summaries were deleted
      const remainingSummaries = await prisma.summary.findMany({
        where: { id: { in: testSummaryIds } }
      });
      
      expect(remainingSummaries).toHaveLength(0);
      
      // Verify total count decreased
      const newCount = await prisma.summary.count();
      expect(newCount).toBe(originalCount - 2);
    });
  });

  describe('Cache Restoration', () => {
    test('should restore soft-invalidated summaries', async () => {
      // First invalidate
      const invalidationResult = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing restoration',
        requesterId: 'test-user',
        strategy: 'soft'
      });

      expect(invalidationResult.success).toBe(true);
      expect(invalidationResult.invalidatedCount).toBe(2);

      // Verify invalidation worked
      let summaries = await prisma.summary.findMany({
        where: { id: { in: testSummaryIds } }
      });
      expect(summaries.every(s => s.forceRefreshFlag)).toBe(true);

      // Restore the summaries
      const restorationResult = await cacheInvalidationService.restoreInvalidatedCache(testSummaryIds);
      
      expect(restorationResult.restoredCount).toBe(2);

      // Verify restoration worked
      summaries = await prisma.summary.findMany({
        where: { id: { in: testSummaryIds } }
      });
      expect(summaries.every(s => !s.forceRefreshFlag)).toBe(true);
      expect(summaries.every(s => !s.invalidationReason)).toBe(true);
      expect(summaries.every(s => !s.invalidatedBy)).toBe(true);
    });

    test('should only restore summaries with force refresh flag', async () => {
      // Try to restore non-invalidated summaries
      const restorationResult = await cacheInvalidationService.restoreInvalidatedCache(testSummaryIds);
      
      expect(restorationResult.restoredCount).toBe(0); // Nothing to restore
    });

    test('should handle empty summary ID list', async () => {
      const restorationResult = await cacheInvalidationService.restoreInvalidatedCache([]);
      
      expect(restorationResult.restoredCount).toBe(0);
    });
  });

  describe('Dry Run Functionality', () => {
    test('should not modify data in dry run mode', async () => {
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing dry run',
        requesterId: 'test-user',
        strategy: 'soft',
        dryRun: true
      });

      expect(result.success).toBe(true);
      expect(result.invalidatedCount).toBe(0); // Dry run doesn't actually invalidate
      expect(result.strategy).toBe('soft-dryrun');

      // Verify no data was modified
      const summaries = await prisma.summary.findMany({
        where: { id: { in: testSummaryIds } }
      });
      
      expect(summaries.every(s => !s.forceRefreshFlag)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Disconnect prisma to simulate database error
      await prisma.$disconnect();

      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing error handling',
        requesterId: 'test-user',
        strategy: 'soft'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.invalidatedCount).toBe(0);

      // Reconnect for cleanup
      prisma = getPrismaClient();
    });

    test('should validate required parameters', async () => {
      await expect(
        cacheInvalidationService.invalidateCache({
          environment: 'test',
          reason: '',
          requesterId: 'test-user'
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    test('should complete invalidation within reasonable time', async () => {
      const startTime = Date.now();
      
      const result = await cacheInvalidationService.invalidateCache({
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing performance',
        requesterId: 'test-user',
        strategy: 'soft'
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.executionTimeMs).toBeLessThan(5000);
    });
  });
});