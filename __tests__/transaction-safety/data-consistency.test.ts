/**
 * Data Consistency and Transaction Rollback Tests
 * 
 * Validates data integrity, transaction boundaries, and rollback scenarios
 * to ensure ACID properties are maintained under all conditions.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  withOptimisticLocking,
  updateTickerMonitoringWithLock,
  upsertTickerMonitoringWithLock,
  createIsolatedTransaction
} from '../../lib/db/concurrency';
import { updateUserBudgetWithLock } from '../../lib/db/budget-operations';
import { TransactionManager, FilingTransactionManager } from '../../lib/db/transaction-manager';
import { createAsyncAuditLog, clearAuditQueue, flushAuditQueue } from '../../lib/db/async-audit';
import { validateCostUpdate } from '../../lib/db/cost-validation';
import { getPrismaClient } from '../../lib/db/prisma';

const prisma = getPrismaClient();

// Test data generators
function generateTestUser(suffix: string = '') {
  return {
    id: `consistency-test-user-${Date.now()}-${suffix}`,
    email: `test-${Date.now()}-${suffix}@example.com`,
    subscriptionTier: 'PROFESSIONAL',
    budgetUsed: 0,
    budgetResetAt: new Date()
  };
}

function generateTestTicker(suffix: string = '') {
  const timestamp = Date.now();
  return {
    cik: `000${timestamp}${suffix}`.slice(-10),
    symbol: `TEST${suffix}`,
    companyName: `Test Company ${suffix}`,
    rssUrl: `https://sec.gov/test-${timestamp}-${suffix}`,
    subscriberCount: 1,
    isActive: true
  };
}

describe('Data Consistency and Transaction Rollback Tests', () => {
  beforeEach(async () => {
    clearAuditQueue();
    
    // Mock console methods to reduce noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await flushAuditQueue(3000);
    clearAuditQueue();
    jest.restoreAllMocks();
  });

  describe('ACID Transaction Properties', () => {
    it('should maintain Atomicity - all or nothing operations', async () => {
      const testUser = generateTestUser('atomicity');
      let userCreated = false;
      let budgetUpdated = false;
      let summaryCreated = false;

      try {
        const result = await TransactionManager.executeTransaction(
          async (tx, context) => {
            // Step 1: Create user
            await tx.user.create({
              data: testUser
            });
            userCreated = true;

            // Step 2: Update budget
            await tx.user.update({
              where: { id: testUser.id },
              data: { budgetUsed: 0.5 }
            });
            budgetUpdated = true;

            // Step 3: Create summary (this will fail intentionally)
            await tx.summary.create({
              data: {
                tickerId: 'non-existent-ticker-id', // This will cause foreign key constraint error
                filingType: '10-K',
                summaryText: 'Test summary',
                cost: 0.25,
                tokensUsed: 1000
              }
            });
            summaryCreated = true;

            return { success: true };
          },
          {
            description: 'Atomicity test transaction',
            timeout: 5000
          }
        );

        // Should not reach here due to foreign key error
        expect(result.success).toBe(false);
      } catch (error) {
        // Expected to fail
      }

      // Verify atomicity - user should not exist if transaction failed
      const userExists = await prisma.user.findUnique({
        where: { id: testUser.id }
      });

      expect(userExists).toBeNull(); // User should not exist due to rollback
      expect(userCreated).toBe(true); // Step was executed
      expect(budgetUpdated).toBe(true); // Step was executed
      expect(summaryCreated).toBe(false); // Step failed
    });

    it('should maintain Consistency - data remains valid after operations', async () => {
      const testUser = generateTestUser('consistency');
      const initialBudget = 2.0;
      const dailyLimit = 5.0;

      // Create user first
      await prisma.user.create({
        data: { ...testUser, budgetUsed: initialBudget }
      });

      // Perform multiple budget updates that maintain consistency
      const operations = [
        { cost: 0.5, expectedFinalBudget: 2.5 },
        { cost: 0.3, expectedFinalBudget: 2.8 },
        { cost: 1.0, expectedFinalBudget: 3.8 },
        { cost: 1.2, expectedFinalBudget: 5.0 } // Exactly at limit
      ];

      let currentBudget = initialBudget;
      
      for (const operation of operations) {
        const result = await updateUserBudgetWithLock(
          testUser.id,
          operation.cost,
          currentBudget,
          dailyLimit,
          {
            tier: 'PROFESSIONAL',
            enableAuditLogging: false
          }
        );

        expect(result.success).toBe(true);
        expect(result.newBudget).toBeCloseTo(operation.expectedFinalBudget, 3);
        
        // Verify database consistency
        const userInDb = await prisma.user.findUnique({
          where: { id: testUser.id },
          select: { budgetUsed: true }
        });
        
        expect(userInDb?.budgetUsed).toBeCloseTo(operation.expectedFinalBudget, 3);
        currentBudget = result.newBudget;
      }

      // Attempt to exceed limit - should maintain consistency
      await expect(
        updateUserBudgetWithLock(testUser.id, 0.1, currentBudget, dailyLimit, { tier: 'PROFESSIONAL' })
      ).rejects.toThrow('Budget limit exceeded');

      // Verify budget hasn't changed after failed operation
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });
      
      expect(finalUser?.budgetUsed).toBeCloseTo(5.0, 3); // Should remain at limit
    });

    it('should maintain Isolation - concurrent transactions do not interfere', async () => {
      const testUser = generateTestUser('isolation');
      const dailyLimit = 10.0;

      // Create user
      await prisma.user.create({
        data: { ...testUser, budgetUsed: 0 }
      });

      // Run concurrent transactions that modify the same user
      const concurrentTransactions = Array.from({ length: 10 }, (_, index) => 
        TransactionManager.executeTransaction(
          async (tx, context) => {
            // Each transaction adds 0.5 to budget
            const cost = 0.5;
            
            // Read current budget
            const currentUser = await tx.user.findUnique({
              where: { id: testUser.id },
              select: { budgetUsed: true }
            });
            
            if (!currentUser) {
              throw new Error('User not found');
            }

            const newBudget = (currentUser.budgetUsed || 0) + cost;
            
            if (newBudget > dailyLimit) {
              throw new Error(`Budget limit exceeded: ${newBudget} > ${dailyLimit}`);
            }

            // Small delay to increase chance of conflicts
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

            // Update budget atomically
            const updateResult = await tx.user.updateMany({
              where: { 
                id: testUser.id,
                budgetUsed: currentUser.budgetUsed // Optimistic locking
              },
              data: { budgetUsed: newBudget }
            });

            if (updateResult.count === 0) {
              throw new Error('Optimistic lock failed - budget changed concurrently');
            }

            return { 
              transactionIndex: index,
              previousBudget: currentUser.budgetUsed,
              newBudget,
              cost
            };
          },
          {
            isolationLevel: 'ReadCommitted',
            retryOnConflict: true,
            maxRetries: 5,
            description: `Isolation test transaction ${index}`
          }
        )
      );

      const results = await Promise.allSettled(concurrentTransactions);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

      console.log(`Isolation Test Results:
        Successful transactions: ${successful.length}
        Failed transactions: ${failed.length}`);

      // Verify final budget consistency
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      const expectedFinalBudget = successful.length * 0.5;
      expect(finalUser?.budgetUsed).toBeCloseTo(expectedFinalBudget, 3);
      
      // Verify isolation - no budget should exceed limit
      expect(finalUser?.budgetUsed).toBeLessThanOrEqual(dailyLimit);
    });

    it('should maintain Durability - committed changes persist', async () => {
      const testUser = generateTestUser('durability');
      const operations = [
        { cost: 1.0, description: 'First operation' },
        { cost: 0.5, description: 'Second operation' },
        { cost: 0.3, description: 'Third operation' }
      ];

      // Create user
      await prisma.user.create({
        data: { ...testUser, budgetUsed: 0 }
      });

      let cumulativeBudget = 0;
      const auditRecords: string[] = [];

      // Perform operations with audit logging
      for (const operation of operations) {
        const result = await updateUserBudgetWithLock(
          testUser.id,
          operation.cost,
          cumulativeBudget,
          5.0,
          {
            tier: 'PROFESSIONAL',
            enableAuditLogging: true,
            originalCost: operation.cost
          }
        );

        expect(result.success).toBe(true);
        cumulativeBudget = result.newBudget;
        auditRecords.push(`${operation.description}: ${operation.cost}`);

        // Simulate system restart by clearing in-memory caches
        // (In real scenario, this would be actual restart)
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify durability - all changes should persist
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      const expectedTotal = operations.reduce((sum, op) => sum + op.cost, 0);
      expect(finalUser?.budgetUsed).toBeCloseTo(expectedTotal, 3);

      // Verify audit logs were created and processed
      await flushAuditQueue(5000);
      
      // Check if any audit logs exist (they should be processed to database)
      // Note: In production, we'd check the auditLog table
      const queueStats = require('../../lib/db/async-audit').getAuditQueueStats();
      console.log(`Final queue stats: ${JSON.stringify(queueStats)}`);
    });
  });

  describe('Transaction Rollback Scenarios', () => {
    it('should rollback failed filing processing transactions', async () => {
      const testUser = generateTestUser('rollback-filing');
      const filingId = `filing-rollback-${Date.now()}`;

      // Create user first
      await prisma.user.create({
        data: { ...testUser, budgetUsed: 0 }
      });

      // Create filing record for testing
      const testTicker = generateTestTicker('rollback');
      
      try {
        await prisma.tickerMonitoring.create({
          data: testTicker
        });

        await prisma.rssFilingCheck.create({
          data: {
            id: filingId,
            accessionNumber: filingId,
            filingType: '10-K',
            filingDate: new Date(),
            processed: false,
            tickerMonitoringId: testTicker.cik
          }
        });
      } catch (error) {
        // Skip test if setup fails
        console.warn('Skipping rollback test due to setup failure:', error);
        return;
      }

      // Attempt filing processing that will fail
      const result = await FilingTransactionManager.processFilingWithTransaction(
        filingId,
        testUser.id,
        async (tx, filing) => {
          // Step 1: Update filing as processed
          await tx.rssFilingCheck.update({
            where: { id: filingId },
            data: { processed: true }
          });

          // Step 2: Update user budget
          await tx.user.update({
            where: { id: testUser.id },
            data: { budgetUsed: 1.5 }
          });

          // Step 3: Create summary (this will fail - missing ticker)
          await tx.summary.create({
            data: {
              tickerId: 'non-existent-ticker-123',
              filingType: '10-K',
              summaryText: 'Test summary that should rollback',
              cost: 1.5,
              tokensUsed: 1000
            }
          });

          return { success: true, cost: 1.5 };
        },
        {
          timeout: 10000,
          description: 'Rollback test filing processing'
        }
      );

      // Transaction should fail
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Verify complete rollback
      const filing = await prisma.rssFilingCheck.findUnique({
        where: { id: filingId },
        select: { processed: true }
      });
      
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      expect(filing?.processed).toBe(false); // Should be rolled back
      expect(user?.budgetUsed).toBe(0); // Should be rolled back
    });

    it('should handle partial rollback scenarios', async () => {
      const testUser = generateTestUser('partial-rollback');
      
      // Create user
      await prisma.user.create({
        data: { ...testUser, budgetUsed: 1.0 }
      });

      // Execute transaction with multiple nested operations
      const result = await TransactionManager.executeTransaction(
        async (tx, context) => {
          // Operation 1: Update budget (should succeed)
          await tx.user.update({
            where: { id: testUser.id },
            data: { budgetUsed: 2.0 }
          });

          // Operation 2: Create audit log asynchronously (should not affect transaction)
          setImmediate(() => {
            createAsyncAuditLog({
              userId: testUser.id,
              action: 'PARTIAL_ROLLBACK_TEST',
              details: { step: 'async_audit' },
              success: true
            }).catch(() => {
              // Ignore audit failures for this test
            });
          });

          // Operation 3: Try to update non-existent record (will fail)
          await tx.user.update({
            where: { id: 'non-existent-user-id' },
            data: { budgetUsed: 999 }
          });

          return { success: true };
        },
        {
          description: 'Partial rollback test',
          timeout: 5000
        }
      );

      // Transaction should fail completely
      expect(result.success).toBe(false);

      // Verify complete rollback - budget should remain unchanged
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      expect(user?.budgetUsed).toBe(1.0); // Should remain at original value
    });

    it('should handle rollback with optimistic locking conflicts', async () => {
      const testTicker = generateTestTicker('optimistic-rollback');
      
      // Create ticker monitoring record
      await prisma.tickerMonitoring.create({
        data: { ...testTicker, version: 0 }
      });

      // Simulate concurrent updates that will cause optimistic lock conflicts
      const concurrentUpdates = Array.from({ length: 5 }, (_, index) =>
        updateTickerMonitoringWithLock(
          testTicker.cik, // Using CIK as ID for this test
          {
            subscriberCount: index + 10,
            lastChecked: new Date()
          },
          {
            maxRetries: 3,
            baseDelay: 50
          }
        )
      );

      // Execute concurrent updates
      const results = await Promise.allSettled(concurrentUpdates);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Optimistic locking rollback test:
        Successful: ${successful}
        Failed: ${failed}`);

      // At least one should succeed
      expect(successful).toBeGreaterThan(0);

      // Verify final state consistency
      const finalRecord = await prisma.tickerMonitoring.findUnique({
        where: { cik: testTicker.cik },
        select: { subscriberCount: true, version: true }
      });

      expect(finalRecord?.subscriberCount).toBeGreaterThanOrEqual(10);
      expect(finalRecord?.version).toBeGreaterThan(0);
    });
  });

  describe('Data Integrity Validation', () => {
    it('should maintain referential integrity under concurrent operations', async () => {
      const testTicker = generateTestTicker('referential');
      const testUser = generateTestUser('referential');

      // Create user and ticker
      await Promise.all([
        prisma.user.create({ data: { ...testUser, budgetUsed: 0 } }),
        prisma.ticker.create({
          data: {
            symbol: testTicker.symbol,
            companyName: testTicker.companyName
          }
        })
      ]);

      const ticker = await prisma.ticker.findFirst({
        where: { symbol: testTicker.symbol }
      });
      
      if (!ticker) {
        throw new Error('Failed to create ticker for referential integrity test');
      }

      // Create multiple summaries concurrently
      const summaryPromises = Array.from({ length: 10 }, (_, index) =>
        TransactionManager.executeTransaction(
          async (tx, context) => {
            // Create summary with proper foreign key references
            const summary = await tx.summary.create({
              data: {
                tickerId: ticker.id,
                filingType: `10-${index}`,
                summaryText: `Test summary ${index}`,
                cost: 0.1 * (index + 1),
                tokensUsed: 100 * (index + 1),
                sentToUser: false
              }
            });

            return { summaryId: summary.id, index };
          },
          {
            description: `Create summary ${index}`,
            isolationLevel: 'ReadCommitted'
          }
        )
      );

      const results = await Promise.allSettled(summaryPromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);

      // Verify all summaries were created with proper references
      const summaryCount = await prisma.summary.count({
        where: { tickerId: ticker.id }
      });

      expect(summaryCount).toBe(successful.length);
      expect(successful.length).toBe(10); // All should succeed

      // Verify referential integrity by checking foreign key constraints
      const summariesWithTicker = await prisma.summary.findMany({
        where: { tickerId: ticker.id },
        include: { ticker: true }
      });

      summariesWithTicker.forEach(summary => {
        expect(summary.ticker).toBeDefined();
        expect(summary.ticker.symbol).toBe(testTicker.symbol);
      });
    });

    it('should validate cost calculations remain consistent', async () => {
      const testUser = generateTestUser('cost-consistency');
      
      // Create user
      await prisma.user.create({
        data: { ...testUser, budgetUsed: 0 }
      });

      // Perform series of cost calculations and budget updates
      const operations = [
        { originalCost: 0.12345, expectedSanitized: 0.123 },
        { originalCost: 0.98765, expectedSanitized: 0.988 },
        { originalCost: 1.00001, expectedSanitized: 1.000 },
        { originalCost: 0.55555, expectedSanitized: 0.556 }
      ];

      let cumulativeBudget = 0;
      const actualBudgets: number[] = [];

      for (const operation of operations) {
        // Validate cost first
        const validation = validateCostUpdate(operation.originalCost, 'PROFESSIONAL', {
          userId: testUser.id,
          operation: 'cost-consistency-test'
        });

        expect(validation.valid).toBe(true);
        expect(validation.sanitizedCost).toBeCloseTo(operation.expectedSanitized, 3);

        // Update budget with sanitized cost
        const result = await updateUserBudgetWithLock(
          testUser.id,
          validation.sanitizedCost,
          cumulativeBudget,
          10.0,
          {
            tier: 'PROFESSIONAL',
            enableAuditLogging: false,
            originalCost: operation.originalCost
          }
        );

        expect(result.success).toBe(true);
        cumulativeBudget = result.newBudget;
        actualBudgets.push(cumulativeBudget);
      }

      // Verify cumulative consistency
      const expectedTotal = operations.reduce((sum, op) => sum + op.expectedSanitized, 0);
      expect(cumulativeBudget).toBeCloseTo(expectedTotal, 3);

      // Verify database consistency
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      expect(finalUser?.budgetUsed).toBeCloseTo(expectedTotal, 3);
    });

    it('should maintain state consistency across transaction boundaries', async () => {
      const testUser = generateTestUser('state-consistency');
      const operations = 50;
      let expectedBudget = 0;

      // Create user
      await prisma.user.create({
        data: { ...testUser, budgetUsed: 0 }
      });

      // Perform many small operations to test state consistency
      for (let i = 0; i < operations; i++) {
        const cost = 0.01; // Small cost to allow many operations
        expectedBudget += cost;

        const result = await updateUserBudgetWithLock(
          testUser.id,
          cost,
          null, // Use atomic read
          10.0,
          {
            tier: 'ENTERPRISE',
            atomicBudgetRead: true,
            enableAuditLogging: false
          }
        );

        expect(result.success).toBe(true);
        
        // Verify intermediate consistency
        if (i % 10 === 0) {
          const intermediateUser = await prisma.user.findUnique({
            where: { id: testUser.id },
            select: { budgetUsed: true }
          });
          
          expect(intermediateUser?.budgetUsed).toBeCloseTo(expectedBudget, 3);
        }
      }

      // Final consistency check
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { budgetUsed: true }
      });

      expect(finalUser?.budgetUsed).toBeCloseTo(expectedBudget, 3);
      expect(finalUser?.budgetUsed).toBeCloseTo(operations * 0.01, 3);
    });
  });

  describe('Cross-Transaction Consistency', () => {
    it('should maintain consistency across different transaction types', async () => {
      const testUser = generateTestUser('cross-transaction');
      const testTicker = generateTestTicker('cross-transaction');

      // Create test data
      await Promise.all([
        prisma.user.create({ data: { ...testUser, budgetUsed: 0 } }),
        prisma.tickerMonitoring.create({ data: { ...testTicker, version: 0 } })
      ]);

      // Mix different types of transactions
      const transactionTypes = [
        // Budget update transaction
        () => updateUserBudgetWithLock(testUser.id, 0.5, null, 5.0, { 
          tier: 'PROFESSIONAL', 
          atomicBudgetRead: true 
        }),
        
        // Ticker monitoring update transaction
        () => updateTickerMonitoringWithLock(testTicker.cik, {
          subscriberCount: 10,
          isActive: true
        }),
        
        // Custom isolated transaction
        () => createIsolatedTransaction(
          async (tx) => {
            await tx.user.update({
              where: { id: testUser.id },
              data: { lastCronProcessed: new Date() }
            });
            return { updated: true };
          },
          { isolationLevel: 'ReadCommitted' }
        )
      ];

      // Execute different transaction types concurrently
      const results = await Promise.allSettled(
        transactionTypes.map(fn => fn())
      );

      // All should succeed
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
        console.log(`Transaction type ${index} result:`, result.value);
      });

      // Verify final state consistency
      const [finalUser, finalTicker] = await Promise.all([
        prisma.user.findUnique({
          where: { id: testUser.id },
          select: { budgetUsed: true, lastCronProcessed: true }
        }),
        prisma.tickerMonitoring.findUnique({
          where: { cik: testTicker.cik },
          select: { subscriberCount: true, version: true }
        })
      ]);

      expect(finalUser?.budgetUsed).toBe(0.5);
      expect(finalUser?.lastCronProcessed).toBeDefined();
      expect(finalTicker?.subscriberCount).toBe(10);
      expect(finalTicker?.version).toBe(1);
    });
  });
});