/**
 * Dedicated Budget Operations Module
 * 
 * Handles user budget updates with optimistic locking and race condition protection.
 * Separated from concurrency module for better maintainability and single responsibility.
 */

import { getPrismaClient } from './prisma';
import { logger } from '../logging';
import { createAsyncAuditLog } from './async-audit';
import { validateCostUpdate, type CostValidationContext } from './cost-validation';
import { 
  withOptimisticLocking, 
  createOptimisticLockError, 
  type ConcurrencyOptions 
} from './concurrency';

const prisma = getPrismaClient();
const budgetLogger = logger.child('budget-operations');

// Specialized options for budget operations to prevent deadlocks
const BUDGET_CONCURRENCY_OPTIONS: Required<ConcurrencyOptions> = {
  maxRetries: 5,
  baseDelay: 50,
  maxDelay: 1000,
  backoffMultiplier: 1.5,
  jitterMs: 25,
  enableOptimisticLocking: true,
  isolationLevel: 'ReadCommitted' // Use lighter isolation for budget updates
};

export interface BudgetUpdateContext extends Partial<CostValidationContext> {
  tier?: string;
  originalCost?: number;
  enableAuditLogging?: boolean;
  atomicBudgetRead?: boolean;
}

export interface BudgetUpdateResult {
  previousBudget: number;
  newBudget: number;
  success: boolean;
}

/**
 * Input validation for budget update parameters
 */
function validateBudgetUpdateInputs(
  userId: string,
  costToAdd: number,
  expectedCurrentBudget: number | null,
  dailyLimit: number
): void {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('Invalid user ID provided');
  }
  
  if (typeof costToAdd !== 'number' || !isFinite(costToAdd)) {
    throw new Error('Invalid cost amount provided');
  }
  
  if (expectedCurrentBudget !== null && (typeof expectedCurrentBudget !== 'number' || !isFinite(expectedCurrentBudget))) {
    throw new Error('Invalid expected budget provided');
  }
  
  if (typeof dailyLimit !== 'number' || !isFinite(dailyLimit) || dailyLimit <= 0) {
    throw new Error('Invalid daily limit provided');
  }
}

/**
 * Creates audit log data for budget operations
 */
function createBudgetAuditData(
  userId: string,
  action: 'BUDGET_UPDATE' | 'BUDGET_UPDATE_FAILED',
  currentBudgetUsed: number,
  newBudgetUsed: number,
  costToAdd: number,
  context: BudgetUpdateContext,
  dailyLimit: number,
  success: boolean,
  error?: string
) {
  return {
    userId,
    action,
    details: {
      previousBudget: currentBudgetUsed,
      newBudget: newBudgetUsed,
      costAdded: costToAdd,
      originalCost: context.originalCost || costToAdd,
      tier: context.tier,
      dailyLimit,
      usagePercentage: (newBudgetUsed / dailyLimit) * 100,
      processingTimestamp: new Date().toISOString(),
      userAgent: 'budget-operations',
      sessionId: `budget-${Date.now()}`,
      riskLevel: newBudgetUsed > dailyLimit * 0.8 ? 'HIGH' : 'NORMAL',
      atomicRead: context.atomicBudgetRead || false,
      ...(error && { error })
    },
    success
  };
}

/**
 * Queue audit log asynchronously to prevent transaction extension
 */
function queueBudgetAudit(
  userId: string,
  action: 'BUDGET_UPDATE' | 'BUDGET_UPDATE_FAILED',
  currentBudgetUsed: number,
  newBudgetUsed: number,
  costToAdd: number,
  context: BudgetUpdateContext,
  dailyLimit: number,
  success: boolean,
  error?: string
): void {
  if (context.enableAuditLogging === false) {
    return;
  }

  setImmediate(() => {
    createAsyncAuditLog(
      createBudgetAuditData(
        userId, action, currentBudgetUsed, newBudgetUsed,
        costToAdd, context, dailyLimit, success, error
      )
    ).catch(auditError => {
      budgetLogger.error('Failed to create async audit log for budget operation', {
        userId,
        action,
        error: auditError instanceof Error ? auditError.message : 'Unknown audit error'
      });
    });
  });
}

/**
 * Updates user budget with race condition protection using optimistic locking
 * 
 * This function now uses READ_COMMITTED isolation to prevent deadlocks while
 * maintaining data consistency through optimistic locking patterns.
 */
export async function updateUserBudgetWithLock(
  userId: string,
  costToAdd: number,
  expectedCurrentBudget: number | null,
  dailyLimit: number,
  context: BudgetUpdateContext = {}
): Promise<BudgetUpdateResult> {
  // Input validation
  validateBudgetUpdateInputs(userId, costToAdd, expectedCurrentBudget, dailyLimit);

  // Validate cost before processing
  const costValidation = validateCostUpdate(costToAdd, context.tier || 'UNKNOWN', {
    userId,
    operation: 'budget-update',
    metadata: context
  });

  if (!costValidation.valid) {
    const error = `Cost validation failed: ${costValidation.error}`;
    budgetLogger.error(error, { userId, cost: costToAdd, tier: context.tier });
    
    // Queue failed validation audit log
    queueBudgetAudit(
      userId, 'BUDGET_UPDATE_FAILED', 0, 0, costToAdd,
      context, dailyLimit, false, error
    );
    
    throw new Error(error);
  }

  const validatedCost = costValidation.sanitizedCost;
  
  // Use specialized budget options with lighter isolation
  const budgetOptions = { ...BUDGET_CONCURRENCY_OPTIONS, ...context };
  
  return withOptimisticLocking(async () => {
    try {
      return await prisma.$transaction(async (tx) => {
        // Get current user state with row lock
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: { 
            budgetUsed: true, 
            subscriptionTier: true,
            budgetResetAt: true
          }
        });
        
        if (!currentUser) {
          throw new Error(`User ${userId} not found`);
        }
        
        const currentBudgetUsed = currentUser.budgetUsed || 0;
        
        // Check if budget has changed since we last checked (race condition detection)
        // Skip this check if atomic read is enabled (expectedCurrentBudget is null)
        if (expectedCurrentBudget !== null && Math.abs(currentBudgetUsed - expectedCurrentBudget) > 0.001) {
          throw createOptimisticLockError('UserBudget', userId, expectedCurrentBudget, currentBudgetUsed);
        }
        
        const newBudgetUsed = currentBudgetUsed + validatedCost;
        
        // Strict budget enforcement
        if (newBudgetUsed > dailyLimit) {
          throw new Error(`Budget limit exceeded: ${newBudgetUsed} > ${dailyLimit}`);
        }
        
        // Warning for high budget usage
        if (newBudgetUsed > dailyLimit * 0.95) {
          budgetLogger.warn('Budget usage approaching limit', {
            userId,
            currentUsage: currentBudgetUsed,
            newUsage: newBudgetUsed,
            limit: dailyLimit,
            percentage: (newBudgetUsed / dailyLimit) * 100,
            tier: context.tier
          });
        }
        
        // Atomic update with condition
        const updateResult = await tx.user.updateMany({
          where: { 
            id: userId,
            budgetUsed: currentBudgetUsed // Ensure budget hasn't changed
          },
          data: {
            budgetUsed: newBudgetUsed,
            lastCronProcessed: new Date()
          }
        });
        
        // Check if update actually happened (race condition detection)
        if (updateResult.count === 0) {
          throw createOptimisticLockError('UserBudget', userId, expectedCurrentBudget || currentBudgetUsed);
        }
        
        // Queue successful audit log asynchronously
        queueBudgetAudit(
          userId, 'BUDGET_UPDATE', currentBudgetUsed, newBudgetUsed,
          validatedCost, context, dailyLimit, true
        );
        
        return {
          previousBudget: currentBudgetUsed,
          newBudget: newBudgetUsed,
          success: true
        };
      }, {
        isolationLevel: budgetOptions.isolationLevel,
        timeout: 5000 // Reduced timeout to prevent long locks
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Queue failed audit log asynchronously
      queueBudgetAudit(
        userId, 'BUDGET_UPDATE_FAILED', 0, 0, validatedCost,
        context, dailyLimit, false, errorMessage
      );
      
      throw error;
    }
  }, budgetOptions);
}

/**
 * Batch budget updates with individual error isolation
 */
export async function updateMultipleUserBudgets(
  updates: Array<{
    userId: string;
    costToAdd: number;
    expectedCurrentBudget: number | null;
    dailyLimit: number;
    context?: BudgetUpdateContext;
  }>,
  options: {
    maxConcurrency?: number;
    continueOnError?: boolean;
  } = {}
): Promise<Array<{
  userId: string;
  result?: BudgetUpdateResult;
  error?: Error;
  success: boolean;
}>> {
  const { maxConcurrency = 3, continueOnError = true } = options;
  const results: Array<{
    userId: string;
    result?: BudgetUpdateResult;
    error?: Error;
    success: boolean;
  }> = [];
  
  budgetLogger.info('Starting batch budget updates', {
    updateCount: updates.length,
    maxConcurrency,
    continueOnError
  });
  
  // Process updates in batches to control concurrency
  for (let i = 0; i < updates.length; i += maxConcurrency) {
    const batch = updates.slice(i, i + maxConcurrency);
    
    const batchPromises = batch.map(async (update) => {
      try {
        const result = await updateUserBudgetWithLock(
          update.userId,
          update.costToAdd,
          update.expectedCurrentBudget,
          update.dailyLimit,
          update.context
        );
        
        return { userId: update.userId, result, success: true };
      } catch (error) {
        budgetLogger.error('Budget update failed in batch', {
          userId: update.userId,
          error: error instanceof Error ? error.message : String(error)
        });
        
        return { 
          userId: update.userId,
          error: error instanceof Error ? error : new Error(String(error)),
          success: false 
        };
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        budgetLogger.error('Unexpected batch result rejection', { 
          error: result.reason 
        });
      }
    }
    
    // If we're not continuing on error and we have failures, stop processing
    if (!continueOnError && results.some(r => !r.success)) {
      break;
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.length - successCount;
  
  budgetLogger.info('Batch budget updates completed', {
    totalUpdates: updates.length,
    processed: results.length,
    successful: successCount,
    failed: errorCount,
    successRate: results.length > 0 ? (successCount / results.length) * 100 : 0
  });
  
  return results;
}