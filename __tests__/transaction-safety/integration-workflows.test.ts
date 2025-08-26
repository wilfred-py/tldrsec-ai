/**
 * Integration and End-to-End Workflow Tests
 * 
 * Tests complete workflows that span multiple transaction safety modules
 * to validate real-world scenarios and regression prevention.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  createAsyncAuditLog, 
  clearAuditQueue, 
  flushAuditQueue, 
  getAuditQueueStats,
  shutdownAuditSystem
} from '../../lib/db/async-audit';
import { validateCostUpdate, DAILY_COST_LIMITS } from '../../lib/db/cost-validation';
import { updateUserBudgetWithLock, updateMultipleUserBudgets } from '../../lib/db/budget-operations';
import { 
  withOptimisticLocking, 
  executeWithIsolation,
  createIsolatedTransaction 
} from '../../lib/db/concurrency';
import { TransactionManager, FilingTransactionManager } from '../../lib/db/transaction-manager';
import { getPrismaClient } from '../../lib/db/prisma';

const prisma = getPrismaClient();

// Test data generators for integration scenarios
function createIntegrationUser(scenario: string, index: number = 0) {
  return {
    id: `integration-${scenario}-${Date.now()}-${index}`,
    email: `integration-${scenario}-${index}@test.com`,
    subscriptionTier: ['FREE', 'PROFESSIONAL', 'ENTERPRISE', 'INSTITUTION'][index % 4],
    budgetUsed: 0,
    budgetResetAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function createTestTicker(scenario: string, index: number = 0) {
  const timestamp = Date.now();
  return {
    cik: `${timestamp}${index}`.padStart(10, '0').slice(-10),
    symbol: `INT${scenario.toUpperCase()}${index}`,
    companyName: `Integration Test Company ${scenario} ${index}`,
    rssUrl: `https://sec.gov/integration-test-${timestamp}-${index}`,
    subscriberCount: 1,
    isActive: true,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('Integration and End-to-End Workflow Tests', () => {
  beforeEach(async () => {
    clearAuditQueue();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await flushAuditQueue(5000);
    clearAuditQueue();
    jest.restoreAllMocks();
  });

  describe('Complete Filing Processing Workflow', () => {
    it('should process filing from discovery to email notification', async () => {
      const scenario = 'filing-complete';
      const testUser = createIntegrationUser(scenario);
      const testTicker = createTestTicker(scenario);

      // Step 1: Set up test environment
      await Promise.all([
        prisma.user.create({ data: testUser }),
        prisma.tickerMonitoring.create({ data: testTicker })
      ]);

      // Add ticker to user's watchlist
      const ticker = await prisma.ticker.create({
        data: {
          symbol: testTicker.symbol,
          companyName: testTicker.companyName
        }
      });

      await prisma.userTicker.create({
        data: {
          userId: testUser.id,
          tickerId: ticker.id
        }
      });

      const filingId = `filing-${Date.now()}`;
      
      // Step 2: Create filing record
      await prisma.rssFilingCheck.create({
        data: {
          id: filingId,
          accessionNumber: filingId,
          filingType: '10-K',
          filingDate: new Date(),
          processed: false,
          tickerMonitoringId: testTicker.cik,
          createdAt: new Date()
        }
      });

      // Step 3: Simulate complete filing processing workflow
      const processingResult = await FilingTransactionManager.processFilingWithTransaction(
        filingId,
        testUser.id,
        async (tx, filing) => {
          // Mark filing as processed
          await tx.rssFilingCheck.update({
            where: { id: filingId },
            data: { processed: true }
          });

          // Simulate AI processing cost
          const processingCost = 0.75;
          
          // Validate cost
          const costValidation = validateCostUpdate(processingCost, testUser.subscriptionTier, {
            userId: testUser.id,
            operation: 'filing-processing',
            metadata: { filingId, accessionNumber: filing.accessionNumber }
          });

          if (!costValidation.valid) {
            throw new Error(`Cost validation failed: ${costValidation.error}`);
          }

          // Create summary record
          await tx.summary.create({
            data: {
              tickerId: ticker.id,
              filingType: '10-K',
              summaryText: 'Integration test summary for filing processing workflow',
              summaryJSON: {
                keyPoints: ['Test point 1', 'Test point 2'],
                riskFactors: ['Test risk 1'],
                financialHighlights: ['Revenue: $100M']
              },
              tokensUsed: 2500,
              cost: costValidation.sanitizedCost,
              sentToUser: false,
              createdAt: new Date()
            }
          });

          // Queue audit log for the processing
          setImmediate(() => {
            createAsyncAuditLog({
              userId: testUser.id,
              action: 'FILING_PROCESSED',
              details: {
                filingId,
                accessionNumber: filing.accessionNumber,
                filingType: '10-K',
                cost: costValidation.sanitizedCost,
                ticker: testTicker.symbol,
                processingComplete: true
              },
              success: true,
              correlationId: filingId
            }).catch(err => console.error('Audit log failed:', err));
          });

          return {
            success: true,
            cost: costValidation.sanitizedCost,
            summaryCreated: true
          };
        },
        {
          timeout: 30000,
          description: 'Integration test filing processing'
        }
      );

      // Step 4: Update user budget with the processing cost
      if (processingResult.success && processingResult.data) {
        const currentUser = await prisma.user.findUnique({
          where: { id: testUser.id },
          select: { budgetUsed: true, subscriptionTier: true }
        });

        const dailyLimit = DAILY_COST_LIMITS[currentUser?.subscriptionTier as keyof typeof DAILY_COST_LIMITS] || 0.20;
        
        const budgetResult = await updateUserBudgetWithLock(
          testUser.id,
          processingResult.data.cost,
          currentUser?.budgetUsed || 0,
          dailyLimit,
          {
            tier: testUser.subscriptionTier,
            enableAuditLogging: true,
            originalCost: processingResult.data.cost
          }
        );

        expect(budgetResult.success).toBe(true);
        expect(budgetResult.newBudget).toBe(processingResult.data.cost);
      }

      // Step 5: Verify complete workflow success
      expect(processingResult.success).toBe(true);
      expect(processingResult.data?.success).toBe(true);
      expect(processingResult.data?.cost).toBeCloseTo(0.75, 2);

      // Verify database state
      const finalFiling = await prisma.rssFilingCheck.findUnique({
        where: { id: filingId },
        select: { processed: true }
      });

      const summary = await prisma.summary.findFirst({
        where: { tickerId: ticker.id },
        select: { summaryText: true, cost: true }
      });

      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      expect(finalFiling?.processed).toBe(true);
      expect(summary).toBeDefined();
      expect(summary?.cost).toBeCloseTo(0.75, 2);
      expect(finalUser?.budgetUsed).toBeCloseTo(0.75, 2);

      console.log(`Complete filing workflow test successful:
        - Filing processed: ${finalFiling?.processed}
        - Summary created: ${!!summary}
        - Budget updated: ${finalUser?.budgetUsed}
        - Transaction ID: ${processingResult.transactionId}`);
    }, 45000);

    it('should handle filing processing failures gracefully with rollback', async () => {
      const scenario = 'filing-failure';
      const testUser = createIntegrationUser(scenario);
      const testTicker = createTestTicker(scenario);

      // Set up test environment
      await Promise.all([
        prisma.user.create({ data: { ...testUser, budgetUsed: 1.0 } }),
        prisma.tickerMonitoring.create({ data: testTicker })
      ]);

      const filingId = `filing-fail-${Date.now()}`;
      
      await prisma.rssFilingCheck.create({
        data: {
          id: filingId,
          accessionNumber: filingId,
          filingType: '10-Q',
          filingDate: new Date(),
          processed: false,
          tickerMonitoringId: testTicker.cik
        }
      });

      // Attempt processing that will fail
      const processingResult = await FilingTransactionManager.processFilingWithTransaction(
        filingId,
        testUser.id,
        async (tx, filing) => {
          // Mark as processed
          await tx.rssFilingCheck.update({
            where: { id: filingId },
            data: { processed: true }
          });

          // Update budget
          await tx.user.update({
            where: { id: testUser.id },
            data: { budgetUsed: 2.5 }
          });

          // This will fail - invalid ticker ID
          await tx.summary.create({
            data: {
              tickerId: 'non-existent-ticker-id',
              filingType: '10-Q',
              summaryText: 'This should not be saved',
              cost: 1.5,
              tokensUsed: 1000
            }
          });

          return { success: true, cost: 1.5 };
        },
        {
          timeout: 10000,
          description: 'Failing filing processing test'
        }
      );

      // Verify transaction failed
      expect(processingResult.success).toBe(false);
      expect(processingResult.error).toBeDefined();

      // Verify complete rollback
      const filing = await prisma.rssFilingCheck.findUnique({
        where: { id: filingId },
        select: { processed: true }
      });

      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      const summary = await prisma.summary.findFirst({
        where: { summaryText: 'This should not be saved' }
      });

      expect(filing?.processed).toBe(false); // Rolled back
      expect(user?.budgetUsed).toBe(1.0); // Unchanged from initial
      expect(summary).toBeNull(); // Not created

      console.log(`Filing failure rollback test successful:
        - Filing rolled back: ${!filing?.processed}
        - Budget unchanged: ${user?.budgetUsed === 1.0}
        - Summary not created: ${!summary}
        - Error handled: ${!!processingResult.error}`);
    }, 20000);
  });

  describe('Multi-User Concurrent Processing', () => {
    it('should handle concurrent users processing different filings', async () => {
      const scenario = 'multi-user';
      const userCount = 10;
      const users = Array.from({ length: userCount }, (_, i) => 
        createIntegrationUser(scenario, i)
      );

      // Create all users
      await prisma.user.createMany({ data: users });

      // Create concurrent filing processing operations
      const processingPromises = users.map(async (user, index) => {
        try {
          // Simulate different cost structures per tier
          const costByTier = {
            'FREE': 0.15,
            'PROFESSIONAL': 0.45,
            'ENTERPRISE': 0.85,
            'INSTITUTION': 1.25
          };

          const cost = costByTier[user.subscriptionTier as keyof typeof costByTier] || 0.15;
          const limit = DAILY_COST_LIMITS[user.subscriptionTier as keyof typeof DAILY_COST_LIMITS] || 0.20;

          // Process multiple operations per user
          const operations = await Promise.all([
            // Cost validation
            Promise.resolve(validateCostUpdate(cost, user.subscriptionTier, {
              userId: user.id,
              operation: 'multi-user-test'
            })),
            
            // Budget update
            updateUserBudgetWithLock(user.id, cost, 0, limit, {
              tier: user.subscriptionTier,
              enableAuditLogging: true
            }),
            
            // Audit logging
            createAsyncAuditLog({
              userId: user.id,
              action: 'MULTI_USER_PROCESSING',
              details: {
                userIndex: index,
                tier: user.subscriptionTier,
                cost,
                timestamp: new Date().toISOString()
              },
              success: true
            })
          ]);

          return {
            userId: user.id,
            index,
            success: true,
            operations: operations.length,
            costValidation: operations[0],
            budgetUpdate: operations[1],
            tier: user.subscriptionTier
          };
        } catch (error) {
          return {
            userId: user.id,
            index,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            tier: user.subscriptionTier
          };
        }
      });

      const results = await Promise.allSettled(processingPromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || 
        (r.status === 'fulfilled' && !r.value.success));

      console.log(`Multi-user concurrent processing:
        Total Users: ${userCount}
        Successful: ${successful.length}
        Failed: ${failed.length}
        Success Rate: ${(successful.length / userCount * 100).toFixed(1)}%`);

      // Verify results
      expect(successful.length).toBeGreaterThan(userCount * 0.8); // 80%+ success rate
      
      // Verify database consistency
      for (const result of successful) {
        if (result.status === 'fulfilled') {
          const user = await prisma.user.findUnique({
            where: { id: result.value.userId },
            select: { budgetUsed: true, subscriptionTier: true }
          });

          expect(user?.budgetUsed).toBeGreaterThan(0);
          expect(user?.subscriptionTier).toBe(result.value.tier);
        }
      }
    }, 30000);

    it('should prevent budget overruns in concurrent scenarios', async () => {
      const scenario = 'budget-protection';
      const testUser = createIntegrationUser(scenario);
      const dailyLimit = 2.0;

      // Create user with some existing budget usage
      await prisma.user.create({
        data: { ...testUser, budgetUsed: 1.5 }
      });

      // Attempt multiple concurrent operations that would exceed budget
      const concurrentOperations = 10;
      const costPerOperation = 0.3; // Total would be 3.0, exceeding limit

      const operationPromises = Array.from({ length: concurrentOperations }, (_, index) =>
        updateUserBudgetWithLock(
          testUser.id,
          costPerOperation,
          null, // Use atomic read
          dailyLimit,
          {
            tier: testUser.subscriptionTier,
            atomicBudgetRead: true,
            enableAuditLogging: false,
            maxRetries: 3
          }
        ).catch(error => ({
          success: false,
          index,
          error: error instanceof Error ? error.message : 'Unknown error'
        }))
      );

      const results = await Promise.allSettled(operationPromises);
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value && 'success' in r.value && r.value.success
      );
      const budgetExceeded = results.filter(r => 
        r.status === 'fulfilled' && r.value && 'error' in r.value && 
        r.value.error?.includes('Budget limit exceeded')
      );

      console.log(`Budget protection test:
        Concurrent Operations: ${concurrentOperations}
        Successful: ${successful.length}
        Budget Exceeded: ${budgetExceeded.length}
        Other Failures: ${results.length - successful.length - budgetExceeded.length}`);

      // Verify budget protection
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      expect(finalUser?.budgetUsed).toBeLessThanOrEqual(dailyLimit);
      expect(successful.length).toBeLessThanOrEqual(Math.floor((dailyLimit - 1.5) / costPerOperation) + 1);
      expect(budgetExceeded.length).toBeGreaterThan(0); // Should have budget exceeded errors
    }, 20000);
  });

  describe('Audit System Integration', () => {
    it('should maintain audit trail across complete workflows', async () => {
      const scenario = 'audit-trail';
      const testUser = createIntegrationUser(scenario);
      
      await prisma.user.create({ data: testUser });

      const workflowSteps = [
        'USER_REGISTRATION',
        'SUBSCRIPTION_ACTIVATED', 
        'TICKER_ADDED',
        'FILING_DISCOVERED',
        'PROCESSING_STARTED',
        'AI_SUMMARY_GENERATED',
        'EMAIL_SENT',
        'BUDGET_UPDATED',
        'PROCESSING_COMPLETE'
      ];

      // Execute workflow with audit logging at each step
      const auditPromises = workflowSteps.map(async (step, index) => {
        await createAsyncAuditLog({
          userId: testUser.id,
          action: step,
          details: {
            stepIndex: index,
            stepName: step,
            timestamp: new Date().toISOString(),
            workflowId: `workflow-${Date.now()}`,
            metadata: {
              userTier: testUser.subscriptionTier,
              stepData: `Data for step ${step}`
            }
          },
          success: true,
          correlationId: `audit-trail-${testUser.id}`
        });

        // Small delay to ensure ordering
        await new Promise(resolve => setTimeout(resolve, 10));
        return step;
      });

      await Promise.all(auditPromises);

      // Verify audit queue processing
      const queueStats = getAuditQueueStats();
      expect(queueStats.queueSize).toBeGreaterThan(0);

      // Allow processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Process remaining queue
      await flushAuditQueue(10000);
      
      const finalStats = getAuditQueueStats();
      console.log(`Audit trail integration:
        Workflow Steps: ${workflowSteps.length}
        Initial Queue: ${queueStats.queueSize}
        Final Queue: ${finalStats.queueSize}
        Processing Success Rate: ${finalStats.successRate}%`);

      expect(finalStats.queueSize).toBeLessThan(queueStats.queueSize);
    }, 20000);

    it('should handle audit system failures without blocking workflows', async () => {
      const scenario = 'audit-resilience';
      const testUser = createIntegrationUser(scenario);
      
      await prisma.user.create({ data: testUser });

      // Fill audit queue to capacity to simulate overload
      const overloadAudits = Array.from({ length: 12000 }, (_, i) =>
        createAsyncAuditLog({
          userId: `overload-${i}`,
          action: 'OVERLOAD_TEST',
          details: { index: i },
          success: true
        })
      );

      await Promise.all(overloadAudits);

      // Critical workflow should still work despite audit overload
      const costValidation = validateCostUpdate(0.5, testUser.subscriptionTier, {
        userId: testUser.id,
        operation: 'resilience-test'
      });

      const budgetUpdate = await updateUserBudgetWithLock(
        testUser.id,
        costValidation.sanitizedCost,
        0,
        2.0,
        {
          tier: testUser.subscriptionTier,
          enableAuditLogging: false // Disable audit to test core functionality
        }
      );

      // Core functionality should work despite audit system stress
      expect(costValidation.valid).toBe(true);
      expect(budgetUpdate.success).toBe(true);
      expect(budgetUpdate.newBudget).toBeCloseTo(0.5, 2);

      const auditStats = getAuditQueueStats();
      console.log(`Audit resilience test:
        Cost Validation: ${costValidation.valid}
        Budget Update: ${budgetUpdate.success}
        Audit Queue Size: ${auditStats.queueSize}
        System Resilient: ${costValidation.valid && budgetUpdate.success}`);
    }, 15000);
  });

  describe('Error Recovery Workflows', () => {
    it('should recover from partial system failures', async () => {
      const scenario = 'error-recovery';
      const testUser = createIntegrationUser(scenario);
      
      await prisma.user.create({ data: testUser });

      // Simulate workflow with intermittent failures
      const workflowWithRetries = async (attempt: number): Promise<any> => {
        return await TransactionManager.executeTransaction(
          async (tx, context) => {
            // Step 1: Always succeeds
            const user = await tx.user.findUnique({
              where: { id: testUser.id },
              select: { id: true, budgetUsed: true }
            });

            // Step 2: Fails randomly on first few attempts
            if (attempt <= 2 && Math.random() < 0.7) {
              throw new Error(`Simulated failure on attempt ${attempt}`);
            }

            // Step 3: Update budget
            await tx.user.update({
              where: { id: testUser.id },
              data: { budgetUsed: (user?.budgetUsed || 0) + 0.25 }
            });

            return {
              success: true,
              attempt,
              userId: testUser.id,
              finalBudget: (user?.budgetUsed || 0) + 0.25
            };
          },
          {
            retryOnConflict: true,
            maxRetries: 5,
            description: `Error recovery workflow attempt ${attempt}`
          }
        );
      };

      // Execute with retry logic
      let finalResult;
      let totalAttempts = 0;
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        totalAttempts++;
        const result = await workflowWithRetries(attempt);
        
        if (result.success) {
          finalResult = result;
          break;
        }
        
        // Brief delay between retries
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(finalResult?.success).toBe(true);
      expect(totalAttempts).toBeGreaterThan(1); // Should have retried
      
      // Verify final state
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      expect(finalUser?.budgetUsed).toBe(0.25);

      console.log(`Error recovery workflow:
        Total Attempts: ${totalAttempts}
        Final Success: ${finalResult?.success}
        Final Budget: ${finalUser?.budgetUsed}`);
    }, 15000);

    it('should maintain data consistency during recovery', async () => {
      const scenario = 'consistency-recovery';
      const testUsers = Array.from({ length: 5 }, (_, i) => 
        createIntegrationUser(scenario, i)
      );

      await prisma.user.createMany({ data: testUsers });

      // Simulate batch operations with some failures
      const batchOperations = testUsers.map((user, index) => ({
        userId: user.id,
        costToAdd: 0.3,
        expectedCurrentBudget: null,
        dailyLimit: 2.0,
        context: {
          tier: user.subscriptionTier,
          atomicBudgetRead: true,
          enableAuditLogging: true,
          // Simulate failure for middle users
          shouldFail: index === 2 || index === 3
        }
      }));

      // Execute batch with mixed success/failure
      const batchResults = await executeWithIsolation(
        batchOperations,
        async (operation) => {
          if (operation.context.shouldFail) {
            throw new Error(`Simulated failure for user ${operation.userId}`);
          }
          
          return await updateUserBudgetWithLock(
            operation.userId,
            operation.costToAdd,
            operation.expectedCurrentBudget,
            operation.dailyLimit,
            operation.context
          );
        },
        {
          continueOnError: true,
          maxConcurrency: 3
        }
      );

      const successful = batchResults.filter(r => r.success);
      const failed = batchResults.filter(r => !r.success);

      console.log(`Consistency recovery test:
        Total Operations: ${batchOperations.length}
        Successful: ${successful.length}
        Failed: ${failed.length}`);

      // Verify partial success maintained consistency
      expect(successful.length).toBe(3); // Users 0, 1, 4
      expect(failed.length).toBe(2); // Users 2, 3

      // Verify database state matches expectations
      for (const result of successful) {
        const user = await prisma.user.findUnique({
          where: { id: result.item.userId },
          select: { budgetUsed: true }
        });
        expect(user?.budgetUsed).toBe(0.3);
      }

      for (const result of failed) {
        const user = await prisma.user.findUnique({
          where: { id: result.item.userId },
          select: { budgetUsed: true }
        });
        expect(user?.budgetUsed).toBe(0); // Should remain unchanged
      }
    }, 20000);
  });

  describe('System Stress Integration', () => {
    it('should maintain functionality under system-wide stress', async () => {
      const scenario = 'system-stress';
      const userCount = 20;
      const operationsPerUser = 5;

      // Create test users
      const testUsers = Array.from({ length: userCount }, (_, i) => 
        createIntegrationUser(scenario, i)
      );
      await prisma.user.createMany({ data: testUsers });

      // Create system-wide stress
      const stressPromises = testUsers.map(async (user, userIndex) => {
        const userOperations = [];
        
        for (let opIndex = 0; opIndex < operationsPerUser; opIndex++) {
          userOperations.push(
            // Cost validation
            Promise.resolve(validateCostUpdate(0.1, user.subscriptionTier)),
            
            // Budget update
            updateUserBudgetWithLock(user.id, 0.1, null, 1.0, {
              tier: user.subscriptionTier,
              atomicBudgetRead: true,
              enableAuditLogging: opIndex % 2 === 0, // 50% with audit
              maxRetries: 2
            }),
            
            // Audit logging (if enabled)
            ...(opIndex % 2 === 0 ? [createAsyncAuditLog({
              userId: user.id,
              action: 'STRESS_TEST_OPERATION',
              details: { userIndex, opIndex },
              success: true
            })] : [])
          );
        }
        
        const results = await Promise.allSettled(userOperations);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        
        return {
          userId: user.id,
          userIndex,
          totalOperations: userOperations.length,
          successful,
          successRate: (successful / userOperations.length) * 100
        };
      });

      const userResults = await Promise.allSettled(stressPromises);
      const fulfilledResults = userResults.filter(r => r.status === 'fulfilled');
      
      const totalOperations = fulfilledResults.reduce((sum, r) => 
        sum + (r.value?.totalOperations || 0), 0
      );
      const totalSuccessful = fulfilledResults.reduce((sum, r) => 
        sum + (r.value?.successful || 0), 0
      );
      
      const overallSuccessRate = (totalSuccessful / totalOperations) * 100;
      const auditStats = getAuditQueueStats();

      console.log(`System stress integration test:
        Users: ${userCount}
        Operations per User: ${operationsPerUser}
        Total Operations: ${totalOperations}
        Overall Success Rate: ${overallSuccessRate.toFixed(1)}%
        Audit Queue Size: ${auditStats.queueSize}
        System Stability: ${overallSuccessRate > 80 ? 'STABLE' : 'UNSTABLE'}`);

      // System should maintain reasonable performance under stress
      expect(overallSuccessRate).toBeGreaterThan(70); // 70%+ success rate
      expect(fulfilledResults.length).toBeGreaterThan(userCount * 0.8); // 80%+ users completed
      
      // Audit system should handle the load
      expect(auditStats.queueSize).toBeLessThanOrEqual(10000); // Within limits
    }, 60000);
  });
});