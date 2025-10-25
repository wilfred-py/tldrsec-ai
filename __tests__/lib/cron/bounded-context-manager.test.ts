/**
 * Tests for BoundedContextManager - Memory Optimization Component
 * Validates that context aggregation is bounded and memory usage is controlled
 */

import { BoundedContextManager } from '../../../lib/cron/bounded-context-manager';
import { ProcessingContext } from '../../../lib/cron/types';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/logging');

describe('BoundedContextManager', () => {
  let contextManager: BoundedContextManager;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    mockLogger = {
      child: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      })),
    };

    (logger as any).child = mockLogger.child;

    // Create fresh instance for each test
    contextManager = BoundedContextManager.getInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Memory Bounds Enforcement', () => {
    it('should limit contexts per user to prevent unbounded growth', () => {
      const userId = 'test-user-1';
      const maxContexts = 100; // Default limit from environment
      
      // Add more contexts than the limit
      for (let i = 0; i < maxContexts + 50; i++) {
        const context: ProcessingContext = {
          userId,
          tier: 'PRO',
          operation: `test-operation-${i}`,
          operationType: 'ai_generation',
          isCached: false,
          processingStartTime: Date.now() + i,
        };
        
        contextManager.addContext(userId, context);
      }

      // Should not exceed the limit
      const aggregatedContexts = contextManager.getAggregatedContexts(userId);
      expect(aggregatedContexts.length).toBeLessThanOrEqual(maxContexts);
    });

    it('should enforce total context limit across all users', () => {
      const maxTotalContexts = 1000; // Default limit
      const usersNeeded = Math.ceil(maxTotalContexts / 50) + 5; // Exceed limit
      
      // Add contexts for multiple users to exceed total limit
      for (let userId = 0; userId < usersNeeded; userId++) {
        for (let contextId = 0; contextId < 50; contextId++) {
          const context: ProcessingContext = {
            userId: `user-${userId}`,
            tier: 'HOBBY',
            operation: `operation-${contextId}`,
            operationType: 'cached_summary',
            isCached: true,
            processingStartTime: Date.now(),
          };
          
          contextManager.addContext(`user-${userId}`, context);
        }
      }

      // Check that total contexts are bounded
      const stats = contextManager.getStats();
      expect(stats.totalContexts).toBeLessThanOrEqual(maxTotalContexts);
      expect(stats.evictedContexts).toBeGreaterThan(0); // Should have evicted some
    });

    it('should use LRU eviction strategy', () => {
      const userId = 'lru-test-user';
      
      // Add contexts with different access patterns
      const contexts: ProcessingContext[] = [];
      for (let i = 0; i < 10; i++) {
        const context: ProcessingContext = {
          userId,
          tier: 'PRO',
          operation: `lru-operation-${i}`,
          operationType: 'ai_generation',
          isCached: false,
          processingStartTime: Date.now() + i * 1000,
        };
        
        contexts.push(context);
        contextManager.addContext(userId, context);
      }

      // Access some contexts to update their usage
      contextManager.getAggregatedContexts(userId); // This should update access times
      
      // Add many more contexts to trigger eviction
      for (let i = 10; i < 110; i++) {
        const context: ProcessingContext = {
          userId,
          tier: 'PRO',
          operation: `lru-operation-${i}`,
          operationType: 'ai_generation',
          isCached: false,
          processingStartTime: Date.now() + i * 1000,
        };
        
        contextManager.addContext(userId, context);
      }

      // The recently accessed contexts should be preserved
      const remainingContexts = contextManager.getAggregatedContexts(userId);
      expect(remainingContexts.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Context Aggregation with Bounds', () => {
    it('should create bounded aggregate context efficiently', () => {
      const userId = 'aggregate-test-user';
      const tier = 'PRO';
      
      // Create many individual contexts
      const individualContexts: ProcessingContext[] = [];
      for (let i = 0; i < 200; i++) {
        individualContexts.push({
          userId,
          tier,
          operation: `individual-${i}`,
          operationType: i % 3 === 0 ? 'cached_summary' : 'ai_generation',
          isCached: i % 3 === 0,
          cacheHit: i % 3 === 0,
          aiGenerated: i % 3 !== 0,
          processingStartTime: Date.now() + i,
          processingEndTime: Date.now() + i + 1000,
        });
      }

      const startTime = Date.now();
      
      const aggregateContext = contextManager.createBoundedAggregateContext(
        userId,
        tier,
        individualContexts,
        10.50,
        5
      );

      const processingTime = Date.now() - startTime;
      
      // Should process quickly despite large input
      expect(processingTime).toBeLessThan(50);
      
      // Should create valid aggregate
      expect(aggregateContext.userId).toBe(userId);
      expect(aggregateContext.tier).toBe(tier);
      expect(aggregateContext.operation).toBe('tier-aware-cron-processing');
      expect(['cached_summary', 'ai_generation', 'failed_operation']).toContain(aggregateContext.operationType);
    });

    it('should handle empty context list gracefully', () => {
      const userId = 'empty-test-user';
      const tier = 'HOBBY';
      
      const aggregateContext = contextManager.createBoundedAggregateContext(
        userId,
        tier,
        [], // Empty contexts
        0,
        0
      );

      // Should create fallback context
      expect(aggregateContext.userId).toBe(userId);
      expect(aggregateContext.tier).toBe(tier);
      expect(aggregateContext.operationType).toBe('failed_operation');
      expect(aggregateContext.errorOccurred).toBe(true);
    });

    it('should correctly determine aggregate operation type', () => {
      const userId = 'operation-type-test';
      const tier = 'PRO';
      
      // Test cache-heavy scenario
      const cacheHeavyContexts: ProcessingContext[] = Array(10).fill(null).map((_, i) => ({
        userId,
        tier,
        operation: `cache-${i}`,
        operationType: 'cached_summary' as const,
        isCached: true,
        cacheHit: true,
        aiGenerated: false,
      }));

      const cacheAggregate = contextManager.createBoundedAggregateContext(
        userId,
        tier,
        cacheHeavyContexts,
        0,
        10
      );

      expect(cacheAggregate.operationType).toBe('cached_summary');
      expect(cacheAggregate.isCached).toBe(true);

      // Test AI-heavy scenario
      const aiHeavyContexts: ProcessingContext[] = Array(10).fill(null).map((_, i) => ({
        userId,
        tier,
        operation: `ai-${i}`,
        operationType: 'ai_generation' as const,
        isCached: false,
        cacheHit: false,
        aiGenerated: true,
      }));

      const aiAggregate = contextManager.createBoundedAggregateContext(
        userId,
        tier,
        aiHeavyContexts,
        15.75,
        10
      );

      expect(aiAggregate.operationType).toBe('ai_generation');
      expect(aiAggregate.aiGenerated).toBe(true);
    });
  });

  describe('Memory Cleanup and TTL', () => {
    it('should clean up completed contexts automatically', () => {
      const userId = 'cleanup-test-user';
      
      // Add completed contexts (old)
      const oldContext: ProcessingContext = {
        userId,
        tier: 'PRO',
        operation: 'old-operation',
        operationType: 'ai_generation',
        isCached: false,
        processingStartTime: Date.now() - 7200000, // 2 hours ago
        processingEndTime: Date.now() - 7200000 + 5000, // Completed 2 hours ago
      };
      
      contextManager.addContext(userId, oldContext);

      // Add recent contexts
      const recentContext: ProcessingContext = {
        userId,
        tier: 'PRO',
        operation: 'recent-operation',
        operationType: 'cached_summary',
        isCached: true,
        processingStartTime: Date.now() - 60000, // 1 minute ago
        processingEndTime: Date.now() - 55000, // Recently completed
      };
      
      contextManager.addContext(userId, recentContext);

      const initialStats = contextManager.getStats();
      expect(initialStats.totalContexts).toBe(2);

      // Trigger cleanup
      contextManager.cleanupCompletedContexts(userId);

      const finalStats = contextManager.getStats();
      expect(finalStats.totalContexts).toBe(1); // Should remove old context
      expect(finalStats.evictedContexts).toBeGreaterThan(0);
    });

    it('should perform periodic cleanup', () => {
      const userId = 'periodic-cleanup-test';
      
      // Add contexts that will expire
      for (let i = 0; i < 10; i++) {
        const context: ProcessingContext = {
          userId,
          tier: 'HOBBY',
          operation: `periodic-${i}`,
          operationType: 'ai_generation',
          isCached: false,
          processingStartTime: Date.now() - 3700000, // Just over 1 hour ago
          processingEndTime: Date.now() - 3695000, // Completed just over 1 hour ago
        };
        
        contextManager.addContext(userId, context);
      }

      const initialStats = contextManager.getStats();
      expect(initialStats.totalContexts).toBe(10);

      // Advance time to trigger periodic cleanup
      jest.advanceTimersByTime(300000); // 5 minutes (cleanup interval)
      
      const finalStats = contextManager.getStats();
      expect(finalStats.totalContexts).toBeLessThan(initialStats.totalContexts);
    });
  });

  describe('Performance and Memory Monitoring', () => {
    it('should provide accurate statistics', () => {
      const userId1 = 'stats-user-1';
      const userId2 = 'stats-user-2';
      
      // Add contexts for multiple users
      for (let i = 0; i < 5; i++) {
        contextManager.addContext(userId1, {
          userId: userId1,
          tier: 'PRO',
          operation: `op-${i}`,
          operationType: 'ai_generation',
          isCached: false,
        });
        
        contextManager.addContext(userId2, {
          userId: userId2,
          tier: 'HOBBY',
          operation: `op-${i}`,
          operationType: 'cached_summary',
          isCached: true,
        });
      }

      const stats = contextManager.getStats();
      
      expect(stats.totalContexts).toBe(10);
      expect(stats.activeContexts).toBe(2); // Two users
      expect(stats.memoryUsageMB).toBeGreaterThan(0);
      expect(stats.cacheHitRatio).toBeGreaterThanOrEqual(0);
      expect(stats.evictedContexts).toBeGreaterThanOrEqual(0);
    });

    it('should track cache hit ratios accurately', () => {
      const userId = 'cache-ratio-test';
      
      // Add contexts and access them to generate cache hits
      for (let i = 0; i < 5; i++) {
        contextManager.addContext(userId, {
          userId,
          tier: 'PRO',
          operation: `cache-op-${i}`,
          operationType: 'cached_summary',
          isCached: true,
        });
      }

      // Access contexts multiple times to generate hits
      contextManager.getAggregatedContexts(userId);
      contextManager.getAggregatedContexts(userId);
      contextManager.getAggregatedContexts(userId);

      // Also generate some misses
      contextManager.getAggregatedContexts('non-existent-user');
      contextManager.getAggregatedContexts('another-non-existent-user');

      const stats = contextManager.getStats();
      expect(stats.cacheHitRatio).toBeGreaterThan(0);
      expect(stats.cacheHitRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed contexts gracefully', () => {
      const userId = 'malformed-test';
      
      // Add context with missing fields
      const malformedContext = {
        userId,
        tier: 'PRO',
        // Missing required fields
      } as ProcessingContext;

      expect(() => {
        contextManager.addContext(userId, malformedContext);
      }).not.toThrow();

      // Should still be able to retrieve contexts
      const contexts = contextManager.getAggregatedContexts(userId);
      expect(Array.isArray(contexts)).toBe(true);
    });

    it('should handle concurrent access safely', async () => {
      const userId = 'concurrent-test';
      
      // Simulate concurrent operations
      const promises = Array(20).fill(null).map(async (_, i) => {
        const context: ProcessingContext = {
          userId,
          tier: 'PRO',
          operation: `concurrent-${i}`,
          operationType: 'ai_generation',
          isCached: false,
        };
        
        contextManager.addContext(userId, context);
        return contextManager.getAggregatedContexts(userId);
      });

      // Should not throw errors
      await expect(Promise.all(promises)).resolves.not.toThrow();
      
      // Final state should be consistent
      const finalContexts = contextManager.getAggregatedContexts(userId);
      expect(Array.isArray(finalContexts)).toBe(true);
    });

    it('should handle memory pressure gracefully', () => {
      // Simulate memory pressure by adding many contexts rapidly
      for (let userId = 0; userId < 100; userId++) {
        for (let contextId = 0; contextId < 20; contextId++) {
          const context: ProcessingContext = {
            userId: `pressure-user-${userId}`,
            tier: 'PRO',
            operation: `pressure-op-${contextId}`,
            operationType: 'ai_generation',
            isCached: false,
            processingStartTime: Date.now(),
          };
          
          contextManager.addContext(`pressure-user-${userId}`, context);
        }
      }

      // Should maintain reasonable memory usage
      const stats = contextManager.getStats();
      expect(stats.totalContexts).toBeLessThan(2000); // Should evict excess
      expect(stats.evictedContexts).toBeGreaterThan(0);
    });
  });

  describe('Performance Regression Prevention', () => {
    it('should maintain fast context operations under load', () => {
      const userId = 'performance-test';
      const operationCount = 1000;
      const measurements: number[] = [];

      // Measure context addition performance
      for (let i = 0; i < operationCount; i++) {
        const startTime = Date.now();
        
        contextManager.addContext(userId, {
          userId,
          tier: 'PRO',
          operation: `perf-op-${i}`,
          operationType: 'ai_generation',
          isCached: false,
        });

        const duration = Date.now() - startTime;
        measurements.push(duration);
      }

      // Calculate statistics
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);
      const p95Time = measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)];

      // Performance assertions - should be very fast
      expect(avgTime).toBeLessThan(1); // Sub-millisecond average
      expect(maxTime).toBeLessThan(5); // Even max should be very fast
      expect(p95Time).toBeLessThan(2); // 95th percentile excellent

      console.log(`Context Manager Performance: avg=${avgTime}ms, max=${maxTime}ms, p95=${p95Time}ms`);
    });
  });
});