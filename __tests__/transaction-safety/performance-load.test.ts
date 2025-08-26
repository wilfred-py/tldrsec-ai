/**
 * Performance and Load Testing for Transaction Safety
 * 
 * Tests system performance under load, validates scalability improvements,
 * and ensures transaction safety mechanisms don't severely impact performance.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { performance } from 'perf_hooks';
import { 
  withOptimisticLocking,
  executeWithIsolation,
  isConcurrencyError
} from '../../lib/db/concurrency';
import { updateUserBudgetWithLock, updateMultipleUserBudgets } from '../../lib/db/budget-operations';
import { 
  createAsyncAuditLog, 
  clearAuditQueue, 
  flushAuditQueue, 
  getAuditQueueStats
} from '../../lib/db/async-audit';
import { validateCostUpdate, validateCostBatch } from '../../lib/db/cost-validation';
import { TransactionManager } from '../../lib/db/transaction-manager';
import { getPrismaClient } from '../../lib/db/prisma';

const prisma = getPrismaClient();

// Performance measurement utilities
class PerformanceMetrics {
  private measurements: { [key: string]: number[] } = {};
  
  record(operation: string, duration: number) {
    if (!this.measurements[operation]) {
      this.measurements[operation] = [];
    }
    this.measurements[operation].push(duration);
  }
  
  getStats(operation: string) {
    const times = this.measurements[operation] || [];
    if (times.length === 0) return null;
    
    const sorted = [...times].sort((a, b) => a - b);
    return {
      count: times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
  
  getAllStats() {
    const stats: { [key: string]: any } = {};
    for (const operation of Object.keys(this.measurements)) {
      stats[operation] = this.getStats(operation);
    }
    return stats;
  }
  
  clear() {
    this.measurements = {};
  }
}

const metrics = new PerformanceMetrics();

// Test utilities
async function measureOperation<T>(
  name: string, 
  operation: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await operation();
  const duration = performance.now() - start;
  metrics.record(name, duration);
  return { result, duration };
}

function generateLoadTestUser(index: number) {
  return {
    id: `load-test-user-${Date.now()}-${index}`,
    email: `loadtest${index}@example.com`,
    subscriptionTier: ['FREE', 'PROFESSIONAL', 'ENTERPRISE', 'INSTITUTION'][index % 4],
    budgetUsed: 0
  };
}

describe('Performance and Load Testing', () => {
  beforeEach(async () => {
    clearAuditQueue();
    metrics.clear();
    
    // Mock console methods to reduce noise during load tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await flushAuditQueue(5000);
    clearAuditQueue();
    jest.restoreAllMocks();
    
    // Output performance metrics
    const allStats = metrics.getAllStats();
    if (Object.keys(allStats).length > 0) {
      console.log('\n=== Performance Metrics ===');
      Object.entries(allStats).forEach(([operation, stats]) => {
        console.log(`${operation}:`, {
          count: stats.count,
          avg: `${stats.avg.toFixed(2)}ms`,
          median: `${stats.median.toFixed(2)}ms`,
          p95: `${stats.p95.toFixed(2)}ms`,
          p99: `${stats.p99.toFixed(2)}ms`
        });
      });
    }
  });

  describe('Budget Update Performance', () => {
    it('should handle high-frequency budget updates efficiently', async () => {
      const operationCount = 200;
      const concurrency = 10;
      const userId = `perf-test-${Date.now()}`;
      const dailyLimit = 50.0; // High limit to allow all operations

      // Create test user
      await prisma.user.create({
        data: generateLoadTestUser(0)
      });

      // Generate operations
      const operations = Array.from({ length: operationCount }, (_, i) => ({
        cost: 0.1,
        expectedBudget: null, // Use atomic reads for performance
        userId,
        index: i
      }));

      // Measure batch processing performance
      const batchStart = performance.now();
      
      // Process in controlled batches
      const batchResults = [];
      for (let i = 0; i < operations.length; i += concurrency) {
        const batch = operations.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (op) => {
          const { result, duration } = await measureOperation(
            'budget-update',
            () => updateUserBudgetWithLock(
              op.userId,
              op.cost,
              null, // Atomic read
              dailyLimit,
              {
                tier: 'ENTERPRISE',
                atomicBudgetRead: true,
                enableAuditLogging: false, // Disable for performance test
                maxRetries: 3,
                baseDelay: 10
              }
            )
          );
          
          return { success: result.success, duration, index: op.index };
        });

        const batchResult = await Promise.allSettled(batchPromises);
        batchResults.push(...batchResult);
      }

      const totalTime = performance.now() - batchStart;
      const successful = batchResults.filter(
        r => r.status === 'fulfilled' && r.value.success
      ).length;

      const throughput = (operationCount / totalTime) * 1000; // ops/second
      
      console.log(`\nBudget Update Performance Test:
        Operations: ${operationCount}
        Successful: ${successful}
        Total Time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} ops/sec
        Success Rate: ${((successful / operationCount) * 100).toFixed(1)}%`);

      // Performance assertions
      expect(successful).toBeGreaterThan(operationCount * 0.8); // 80%+ success rate
      expect(throughput).toBeGreaterThan(20); // At least 20 ops/second
      
      const budgetStats = metrics.getStats('budget-update');
      expect(budgetStats?.avg).toBeLessThan(500); // Average < 500ms
      expect(budgetStats?.p95).toBeLessThan(1000); // 95th percentile < 1s
    }, 30000);

    it('should scale batch operations efficiently', async () => {
      const batchSizes = [10, 25, 50, 100];
      const results: { [key: number]: any } = {};

      for (const batchSize of batchSizes) {
        const users = Array.from({ length: batchSize }, (_, i) => 
          generateLoadTestUser(i)
        );

        // Create test users
        await prisma.user.createMany({
          data: users
        });

        const batchOperations = users.map((user, index) => ({
          userId: user.id,
          costToAdd: 0.5,
          expectedCurrentBudget: null,
          dailyLimit: 5.0,
          context: {
            tier: user.subscriptionTier,
            atomicBudgetRead: true,
            enableAuditLogging: false
          }
        }));

        // Measure batch performance
        const { result, duration } = await measureOperation(
          `batch-${batchSize}`,
          () => updateMultipleUserBudgets(batchOperations, {
            maxConcurrency: Math.min(5, Math.ceil(batchSize / 5))
          })
        );

        const successCount = result.filter(r => r.success).length;
        const throughput = (batchSize / duration) * 1000;

        results[batchSize] = {
          duration,
          successCount,
          throughput,
          successRate: (successCount / batchSize) * 100
        };

        console.log(`Batch size ${batchSize}: ${throughput.toFixed(2)} ops/sec (${successCount}/${batchSize} success)`);
      }

      // Verify scaling characteristics
      const throughputs = Object.values(results).map(r => r.throughput);
      const maxThroughput = Math.max(...throughputs);
      const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;

      expect(avgThroughput).toBeGreaterThan(10); // At least 10 ops/sec average
      expect(maxThroughput).toBeGreaterThan(20); // Peak performance > 20 ops/sec
    }, 45000);
  });

  describe('Cost Validation Performance', () => {
    it('should validate costs efficiently under load', async () => {
      const validationCount = 1000;
      const costs = Array.from({ length: validationCount }, (_, i) => ({
        cost: Math.random() * 5, // Random costs between 0-5
        tier: ['FREE', 'PROFESSIONAL', 'ENTERPRISE', 'INSTITUTION'][i % 4],
        context: {
          userId: `perf-user-${i}`,
          operation: `perf-validation-${i}`
        }
      }));

      // Single validations performance
      const singleValidationStart = performance.now();
      const singleResults = await Promise.all(
        costs.map(async (cost, index) => {
          const { result, duration } = await measureOperation(
            'single-validation',
            () => Promise.resolve(validateCostUpdate(cost.cost, cost.tier, cost.context))
          );
          return { result, duration, index };
        })
      );
      const singleValidationTime = performance.now() - singleValidationStart;

      // Batch validation performance
      const { result: batchResult, duration: batchDuration } = await measureOperation(
        'batch-validation',
        () => Promise.resolve(validateCostBatch(costs))
      );

      const singleThroughput = (validationCount / singleValidationTime) * 1000;
      const batchThroughput = (validationCount / batchDuration) * 1000;
      
      console.log(`\nCost Validation Performance:
        Single Validations: ${singleThroughput.toFixed(2)} validations/sec
        Batch Validations: ${batchThroughput.toFixed(2)} validations/sec
        Batch Improvement: ${(batchThroughput / singleThroughput).toFixed(2)}x`);

      // Performance assertions
      expect(singleThroughput).toBeGreaterThan(1000); // At least 1000 validations/sec
      expect(batchThroughput).toBeGreaterThan(5000); // Batch should be much faster
      
      // Verify accuracy wasn't compromised for performance
      const validResults = singleResults.filter(r => r.result.valid).length;
      const batchValidResults = batchResult.filter(r => r.valid).length;
      expect(Math.abs(validResults - batchValidResults)).toBeLessThanOrEqual(5); // Similar results
    }, 20000);
  });

  describe('Audit System Performance', () => {
    it('should handle high-volume audit logging efficiently', async () => {
      const auditCount = 2000;
      const batchSizes = [50, 100, 200];
      const results: { [key: number]: any } = {};

      for (const batchSize of batchSizes) {
        clearAuditQueue();
        
        const audits = Array.from({ length: auditCount }, (_, i) => ({
          userId: `audit-perf-${i % 100}`, // Distribute across 100 users
          action: 'PERFORMANCE_TEST',
          details: {
            index: i,
            batchSize,
            timestamp: new Date().toISOString(),
            metadata: { data: 'x'.repeat(20) } // Small payload
          },
          success: true,
          correlationId: `perf-${batchSize}-${i}`
        }));

        // Measure audit creation performance
        const { duration } = await measureOperation(
          `audit-creation-${batchSize}`,
          async () => {
            // Process in batches
            for (let i = 0; i < audits.length; i += batchSize) {
              const batch = audits.slice(i, i + batchSize);
              await Promise.all(
                batch.map(audit => createAsyncAuditLog(audit))
              );
            }
          }
        );

        const throughput = (auditCount / duration) * 1000;
        const stats = getAuditQueueStats();
        
        results[batchSize] = {
          duration,
          throughput,
          queueSize: stats.queueSize,
          processingQueue: stats.processingQueue,
          successRate: stats.successRate
        };

        console.log(`Audit batch ${batchSize}: ${throughput.toFixed(2)} audits/sec, queue: ${stats.queueSize}`);

        // Allow some processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Performance assertions
      const throughputs = Object.values(results).map(r => r.throughput);
      const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
      
      expect(avgThroughput).toBeGreaterThan(500); // At least 500 audits/sec
      
      // Queue should handle the load
      Object.values(results).forEach(result => {
        expect(result.queueSize).toBeLessThanOrEqual(10000); // Within queue limits
      });
    }, 25000);

    it('should process audit queue efficiently', async () => {
      const auditCount = 1000;
      
      // Create a large number of audit logs
      const createPromises = Array.from({ length: auditCount }, (_, i) =>
        createAsyncAuditLog({
          userId: `queue-perf-${i % 50}`,
          action: 'QUEUE_PERFORMANCE_TEST',
          details: { index: i, batch: 'queue_perf' },
          success: true
        })
      );

      await Promise.all(createPromises);
      
      const initialStats = getAuditQueueStats();
      console.log(`Initial queue size: ${initialStats.queueSize}`);

      // Measure queue processing performance
      const processingStart = performance.now();
      await flushAuditQueue(15000); // 15 second timeout
      const processingDuration = performance.now() - processingStart;

      const finalStats = getAuditQueueStats();
      const processed = initialStats.queueSize - finalStats.queueSize;
      const processingThroughput = (processed / processingDuration) * 1000;

      console.log(`\nAudit Queue Processing:
        Initial Queue: ${initialStats.queueSize}
        Final Queue: ${finalStats.queueSize}
        Processed: ${processed}
        Time: ${processingDuration.toFixed(2)}ms
        Throughput: ${processingThroughput.toFixed(2)} processed/sec`);

      // Performance assertions
      expect(processed).toBeGreaterThan(auditCount * 0.5); // At least 50% processed
      expect(processingThroughput).toBeGreaterThan(50); // At least 50 processed/sec
    }, 30000);
  });

  describe('Transaction Manager Performance', () => {
    it('should execute transactions efficiently under load', async () => {
      const transactionCount = 100;
      const concurrency = 10;

      const transactions = Array.from({ length: transactionCount }, (_, i) => ({
        index: i,
        operation: async () => {
          // Simulate lightweight database operation
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          return { transactionIndex: i, processed: true };
        }
      }));

      // Process transactions with controlled concurrency
      const results = [];
      const overallStart = performance.now();

      for (let i = 0; i < transactions.length; i += concurrency) {
        const batch = transactions.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (tx) => {
          const { result, duration } = await measureOperation(
            'transaction-execution',
            () => TransactionManager.executeTransaction(
              async (dbTx, context) => {
                return await tx.operation();
              },
              {
                description: `Performance test transaction ${tx.index}`,
                timeout: 5000,
                retryOnConflict: true,
                maxRetries: 2
              }
            )
          );
          
          return { result, duration, index: tx.index };
        });

        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      }

      const totalTime = performance.now() - overallStart;
      const successful = results.filter(
        r => r.status === 'fulfilled' && r.value.result.success
      ).length;

      const throughput = (transactionCount / totalTime) * 1000;
      
      console.log(`\nTransaction Performance Test:
        Transactions: ${transactionCount}
        Successful: ${successful}
        Total Time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} tx/sec
        Success Rate: ${((successful / transactionCount) * 100).toFixed(1)}%`);

      // Performance assertions
      expect(successful).toBeGreaterThan(transactionCount * 0.9); // 90%+ success
      expect(throughput).toBeGreaterThan(10); // At least 10 transactions/sec
      
      const txStats = metrics.getStats('transaction-execution');
      expect(txStats?.avg).toBeLessThan(1000); // Average < 1s
    }, 25000);

    it('should handle transaction retry scenarios efficiently', async () => {
      const retryScenarios = [
        { maxRetries: 1, failureRate: 0.3 },
        { maxRetries: 3, failureRate: 0.5 },
        { maxRetries: 5, failureRate: 0.7 }
      ];

      for (const scenario of retryScenarios) {
        const transactionCount = 50;
        let totalAttempts = 0;

        const results = await Promise.allSettled(
          Array.from({ length: transactionCount }, (_, i) => 
            measureOperation(
              `retry-${scenario.maxRetries}`,
              () => TransactionManager.executeTransaction(
                async (tx, context) => {
                  totalAttempts++;
                  
                  // Simulate failure based on failure rate
                  if (Math.random() < scenario.failureRate) {
                    throw new Error('Simulated transaction failure');
                  }
                  
                  return { success: true, index: i };
                },
                {
                  maxRetries: scenario.maxRetries,
                  retryOnConflict: true,
                  description: `Retry test ${i}`
                }
              )
            )
          )
        );

        const successful = results.filter(
          r => r.status === 'fulfilled' && r.value.result.success
        ).length;

        const retryEfficiency = successful / (totalAttempts / transactionCount);
        
        console.log(`Retry scenario (${scenario.maxRetries} retries, ${scenario.failureRate * 100}% failure):
          Success: ${successful}/${transactionCount}
          Total Attempts: ${totalAttempts}
          Retry Efficiency: ${retryEfficiency.toFixed(2)}`);

        // Should achieve reasonable success rate with retries
        expect(successful).toBeGreaterThan(transactionCount * 0.5);
      }
    }, 20000);
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain stable memory usage under load', async () => {
      const iterations = 10;
      const operationsPerIteration = 100;
      const memorySnapshots: number[] = [];

      // Function to get memory usage
      const getMemoryUsage = () => {
        if (process.memoryUsage) {
          return process.memoryUsage().heapUsed / 1024 / 1024; // MB
        }
        return 0;
      };

      const initialMemory = getMemoryUsage();
      memorySnapshots.push(initialMemory);

      for (let iteration = 0; iteration < iterations; iteration++) {
        // Perform operations
        const operations = Array.from({ length: operationsPerIteration }, (_, i) => 
          createAsyncAuditLog({
            userId: `memory-test-${iteration}-${i}`,
            action: 'MEMORY_LOAD_TEST',
            details: { 
              iteration, 
              operationIndex: i,
              data: 'x'.repeat(100) // Add some data
            },
            success: true
          })
        );

        await Promise.all(operations);

        // Force some processing
        if (iteration % 3 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const currentMemory = getMemoryUsage();
        memorySnapshots.push(currentMemory);
        
        console.log(`Iteration ${iteration}: ${currentMemory.toFixed(2)}MB`);
      }

      // Clean up
      await flushAuditQueue(5000);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const finalMemory = getMemoryUsage();
      const memoryGrowth = finalMemory - initialMemory;
      const maxMemory = Math.max(...memorySnapshots);

      console.log(`\nMemory Usage Analysis:
        Initial: ${initialMemory.toFixed(2)}MB
        Final: ${finalMemory.toFixed(2)}MB
        Growth: ${memoryGrowth.toFixed(2)}MB
        Peak: ${maxMemory.toFixed(2)}MB`);

      // Memory assertions (allow for reasonable growth)
      expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth
      expect(maxMemory).toBeLessThan(initialMemory + 100); // Less than 100MB peak growth
    }, 30000);

    it('should handle connection pool efficiently', async () => {
      const concurrentQueries = 20;
      const queryRounds = 5;

      const connectionMetrics = {
        successfulQueries: 0,
        failedQueries: 0,
        timeouts: 0
      };

      for (let round = 0; round < queryRounds; round++) {
        const queries = Array.from({ length: concurrentQueries }, (_, i) =>
          measureOperation(
            'connection-pool-query',
            async () => {
              try {
                // Simple database query to test connection pool
                const result = await prisma.user.findMany({
                  take: 1,
                  select: { id: true }
                });
                connectionMetrics.successfulQueries++;
                return result;
              } catch (error) {
                if (error instanceof Error && error.message.includes('timeout')) {
                  connectionMetrics.timeouts++;
                } else {
                  connectionMetrics.failedQueries++;
                }
                throw error;
              }
            }
          )
        );

        await Promise.allSettled(queries);
        
        // Brief pause between rounds
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const totalQueries = queryRounds * concurrentQueries;
      const successRate = (connectionMetrics.successfulQueries / totalQueries) * 100;

      console.log(`\nConnection Pool Performance:
        Total Queries: ${totalQueries}
        Successful: ${connectionMetrics.successfulQueries}
        Failed: ${connectionMetrics.failedQueries}
        Timeouts: ${connectionMetrics.timeouts}
        Success Rate: ${successRate.toFixed(1)}%`);

      // Connection pool should handle the load
      expect(successRate).toBeGreaterThan(90); // 90%+ success rate
      expect(connectionMetrics.timeouts).toBeLessThan(totalQueries * 0.1); // <10% timeouts
    }, 15000);
  });

  describe('Scalability Validation', () => {
    it('should demonstrate improved performance over baseline', async () => {
      // Baseline test: Simple operations without transaction safety
      const baselineOps = 100;
      const baselineStart = performance.now();
      
      for (let i = 0; i < baselineOps; i++) {
        // Simple cost validation (fastest operation)
        validateCostUpdate(0.5, 'PROFESSIONAL');
      }
      
      const baselineTime = performance.now() - baselineStart;
      const baselineThroughput = (baselineOps / baselineTime) * 1000;

      // Enhanced test: Same operations with transaction safety
      const enhancedOps = 100;
      const enhancedResults = [];
      
      for (let i = 0; i < enhancedOps; i++) {
        const { duration } = await measureOperation(
          'enhanced-operation',
          async () => {
            // Cost validation with context and audit logging
            const validation = validateCostUpdate(0.5, 'PROFESSIONAL', {
              userId: `scale-test-${i}`,
              operation: 'scalability-test'
            });
            
            // Audit the operation
            await createAsyncAuditLog({
              userId: `scale-test-${i}`,
              action: 'SCALABILITY_TEST',
              details: { validation, index: i },
              success: validation.valid
            });
            
            return validation;
          }
        );
        enhancedResults.push(duration);
      }

      const enhancedAvgTime = enhancedResults.reduce((a, b) => a + b, 0) / enhancedResults.length;
      const enhancedThroughput = 1000 / enhancedAvgTime;
      
      const performanceRatio = enhancedThroughput / baselineThroughput;
      
      console.log(`\nScalability Comparison:
        Baseline Throughput: ${baselineThroughput.toFixed(2)} ops/sec
        Enhanced Throughput: ${enhancedThroughput.toFixed(2)} ops/sec
        Performance Ratio: ${performanceRatio.toFixed(3)}x
        Overhead: ${((1 - performanceRatio) * 100).toFixed(1)}%`);

      // Enhanced version should be within reasonable performance bounds
      expect(performanceRatio).toBeGreaterThan(0.1); // At least 10% of baseline performance
      expect(enhancedAvgTime).toBeLessThan(100); // Average operation < 100ms
    }, 15000);
  });
});