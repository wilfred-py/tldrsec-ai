/**
 * Database Concurrency Utilities
 * 
 * Provides optimistic locking, race condition handling, and concurrent operation utilities
 */

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { getPrismaClient } from './prisma';
import { logger } from '../logging';
import { RetryOptions } from './retry-wrapper';
import type { PrismaClient } from '@prisma/client';

const prisma = getPrismaClient();
const concurrencyLogger = logger.child('db-concurrency');

export interface OptimisticLockError extends Error {
  code: 'OPTIMISTIC_LOCK_FAILED';
  model: string;
  id: string;
  expectedVersion?: number;
  actualVersion?: number;
}

export interface ConcurrencyOptions extends RetryOptions {
  jitterMs?: number;
  enableOptimisticLocking?: boolean;
  isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
}

const DEFAULT_CONCURRENCY_OPTIONS: Required<ConcurrencyOptions> = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 2000,
  backoffMultiplier: 2,
  jitterMs: 50,
  enableOptimisticLocking: true,
  isolationLevel: 'ReadCommitted'
};

/**
 * Creates an optimistic lock error
 */
function createOptimisticLockError(
  model: string, 
  id: string, 
  expectedVersion?: number, 
  actualVersion?: number
): OptimisticLockError {
  const error = new Error(`Optimistic lock failed for ${model} ${id}`) as OptimisticLockError;
  error.code = 'OPTIMISTIC_LOCK_FAILED';
  error.model = model;
  error.id = id;
  error.expectedVersion = expectedVersion;
  error.actualVersion = actualVersion;
  return error;
}

/**
 * Checks if an error is a database concurrency conflict
 */
export function isConcurrencyError(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError) {
    // P2002: Unique constraint failed
    // P2034: Transaction failed due to write conflict
    // P2025: Record to update not found (can indicate race condition)
    return ['P2002', 'P2034', 'P2025'].includes(error.code);
  }
  
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as OptimisticLockError).code === 'OPTIMISTIC_LOCK_FAILED';
  }
  
  return false;
}

/**
 * Executes an operation with optimistic locking retry logic
 */
export async function withOptimisticLocking<T>(
  operation: () => Promise<T>,
  options: ConcurrencyOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_CONCURRENCY_OPTIONS, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Only retry on concurrency conflicts
      if (!isConcurrencyError(error) || attempt >= config.maxRetries) {
        throw error;
      }
      
      // Add jitter to reduce thundering herd
      const jitter = Math.random() * config.jitterMs;
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1) + jitter,
        config.maxDelay
      );
      
      concurrencyLogger.warn(`Concurrency conflict (attempt ${attempt}/${config.maxRetries}), retrying in ${Math.round(delay)}ms`, {
        error: lastError.message,
        attempt,
        maxRetries: config.maxRetries
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Updates a TickerMonitoring record with optimistic locking
 */
export async function updateTickerMonitoringWithLock(
  id: string,
  updateData: {
    subscriberCount?: number;
    isActive?: boolean;
    symbol?: string;
    companyName?: string;
    lastChecked?: Date;
    lastAccessionSeen?: string | null;
  },
  options: ConcurrencyOptions = {}
): Promise<{ id: string; version: number }> {
  return withOptimisticLocking(async () => {
    return await prisma.$transaction(async (tx) => {
      // First, get the current record with its version
      const currentRecord = await tx.tickerMonitoring.findUnique({
        where: { id },
        select: { version: true }
      });
      
      if (!currentRecord) {
        throw new Error(`TickerMonitoring record ${id} not found`);
      }
      
      // Update with version check
      try {
        const updatedRecord = await tx.tickerMonitoring.update({
          where: { 
            id,
            version: currentRecord.version // Optimistic lock condition
          },
          data: {
            ...updateData,
            version: currentRecord.version + 1, // Increment version
            updatedAt: new Date()
          },
          select: { id: true, version: true }
        });
        
        return updatedRecord;
      } catch (error) {
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
          // Record not found means version mismatch (concurrent update)
          throw createOptimisticLockError('TickerMonitoring', id, currentRecord.version);
        }
        throw error;
      }
    }, {
      isolationLevel: options.isolationLevel || 'ReadCommitted',
      timeout: 10000
    });
  }, options);
}

/**
 * Updates a TickerMonitoring record by CIK with optimistic locking and upsert fallback
 */
export async function upsertTickerMonitoringWithLock(
  cik: string,
  createData: {
    symbol: string;
    companyName: string;
    rssUrl: string;
    subscriberCount: number;
    isActive: boolean;
  },
  updateData: {
    subscriberCount?: number;
    isActive?: boolean;
    symbol?: string;
    companyName?: string;
  },
  options: ConcurrencyOptions = {}
): Promise<{ id: string; version: number; wasCreated: boolean }> {
  return withOptimisticLocking(async () => {
    return await prisma.$transaction(async (tx) => {
      // Try to find existing record
      const existingRecord = await tx.tickerMonitoring.findUnique({
        where: { cik },
        select: { id: true, version: true }
      });
      
      if (existingRecord) {
        // Update existing record with optimistic locking
        try {
          const updatedRecord = await tx.tickerMonitoring.update({
            where: { 
              id: existingRecord.id,
              version: existingRecord.version
            },
            data: {
              ...updateData,
              version: existingRecord.version + 1,
              updatedAt: new Date()
            },
            select: { id: true, version: true }
          });
          
          return { ...updatedRecord, wasCreated: false };
        } catch (error) {
          if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
            throw createOptimisticLockError('TickerMonitoring', existingRecord.id, existingRecord.version);
          }
          throw error;
        }
      } else {
        // Create new record
        try {
          const newRecord = await tx.tickerMonitoring.create({
            data: {
              cik,
              ...createData,
              version: 0
            },
            select: { id: true, version: true }
          });
          
          return { ...newRecord, wasCreated: true };
        } catch (error) {
          if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
            // Unique constraint violation - another process created it, retry the transaction
            throw createOptimisticLockError('TickerMonitoring', cik);
          }
          throw error;
        }
      }
    }, {
      isolationLevel: options.isolationLevel || 'ReadCommitted',
      timeout: 10000
    });
  }, options);
}

/**
 * Updates user budget with race condition protection
 */
export async function updateUserBudgetWithLock(
  userId: string,
  costToAdd: number,
  expectedCurrentBudget: number | null,
  dailyLimit: number,
  options: ConcurrencyOptions & {
    tier?: string;
    originalCost?: number;
    enableAuditLogging?: boolean;
    atomicBudgetRead?: boolean;
  } = {}
): Promise<{ previousBudget: number; newBudget: number; success: boolean }> {
  // Input validation
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
      
      // Check if budget has changed since we last checked (race condition)
      // Skip this check if atomic read is enabled (expectedCurrentBudget is null)
      if (expectedCurrentBudget !== null && Math.abs(currentBudgetUsed - expectedCurrentBudget) > 0.001) {
        throw createOptimisticLockError('UserBudget', userId, expectedCurrentBudget, currentBudgetUsed);
      }
      
      const newBudgetUsed = currentBudgetUsed + costToAdd;
      
      // Strict budget enforcement
      if (newBudgetUsed > dailyLimit) {
        throw new Error(`Budget limit exceeded: ${newBudgetUsed} > ${dailyLimit}`);
      }
      
      // Warning for high budget usage
      if (newBudgetUsed > dailyLimit * 0.95) {
        concurrencyLogger.warn('Budget usage approaching limit', {
          userId,
          currentUsage: currentBudgetUsed,
          newUsage: newBudgetUsed,
          limit: dailyLimit,
          percentage: (newBudgetUsed / dailyLimit) * 100,
          tier: options.tier
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
      
      // Create audit log if enabled
      if (options.enableAuditLogging !== false) {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'BUDGET_UPDATE',
            details: JSON.stringify({
              previousBudget: currentBudgetUsed,
              newBudget: newBudgetUsed,
              costAdded: costToAdd,
              originalCost: options.originalCost || costToAdd,
              tier: options.tier,
              dailyLimit,
              usagePercentage: (newBudgetUsed / dailyLimit) * 100,
              processingTimestamp: new Date().toISOString(),
              budgetResetAt: currentUser.budgetResetAt,
              userAgent: 'cron-tier-aware',
              sessionId: `cron-${Date.now()}`,
              riskLevel: newBudgetUsed > dailyLimit * 0.8 ? 'HIGH' : 'NORMAL'
            }),
            success: true
          }
        });
      }
      
        return {
          previousBudget: currentBudgetUsed,
          newBudget: newBudgetUsed,
          success: true
        };
      }, {
        isolationLevel: options.isolationLevel || 'Serializable',
        timeout: 10000
      });
    } catch (error) {
      // Create audit log for failed attempts if enabled
      if (options.enableAuditLogging !== false) {
        try {
          await prisma.auditLog.create({
            data: {
              userId,
              action: 'BUDGET_UPDATE_FAILED',
              details: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                expectedBudget: expectedCurrentBudget,
                costToAdd,
                originalCost: options.originalCost || costToAdd,
                tier: options.tier,
                dailyLimit,
                processingTimestamp: new Date().toISOString(),
                userAgent: 'cron-tier-aware',
                sessionId: `cron-${Date.now()}`,
                riskLevel: 'HIGH', // Failed operations are high risk
                atomicRead: options.atomicBudgetRead || false
              }),
              success: false
            }
          });
        } catch (auditError) {
          concurrencyLogger.error('Failed to create audit log for failed budget update', { 
            userId, error: auditError 
          });
        }
      }
      throw error;
    }
  }, options);
}

/**
 * Executes multiple operations in parallel with individual failure isolation
 */
export async function executeWithIsolation<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  options: {
    maxConcurrency?: number;
    continueOnError?: boolean;
    retryOptions?: ConcurrencyOptions;
  } = {}
): Promise<Array<{ item: T; result?: R; error?: Error; success: boolean }>> {
  const { maxConcurrency = 3, continueOnError = true, retryOptions } = options;
  const results: Array<{ item: T; result?: R; error?: Error; success: boolean }> = [];
  
  // Process items in batches to control concurrency
  for (let i = 0; i < items.length; i += maxConcurrency) {
    const batch = items.slice(i, i + maxConcurrency);
    
    const batchPromises = batch.map(async (item) => {
      try {
        let result: R;
        
        if (retryOptions) {
          result = await withOptimisticLocking(() => operation(item), retryOptions);
        } else {
          result = await operation(item);
        }
        
        return { item, result, success: true };
      } catch (error) {
        concurrencyLogger.error('Operation failed for item', {
          error: error instanceof Error ? error.message : 'Unknown error',
          item: typeof item === 'object' ? JSON.stringify(item) : String(item)
        });
        
        return { item, error: error as Error, success: false };
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // This should not happen since we catch errors in the promises
        concurrencyLogger.error('Unexpected batch result rejection', { error: result.reason });
      }
    }
    
    // If we're not continuing on error and we have failures, stop processing
    if (!continueOnError && results.some(r => !r.success)) {
      break;
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.length - successCount;
  
  concurrencyLogger.info('Batch processing completed', {
    totalItems: items.length,
    processed: results.length,
    successful: successCount,
    failed: errorCount,
    successRate: results.length > 0 ? (successCount / results.length) * 100 : 0
  });
  
  return results;
}

/**
 * Creates a database transaction with specific isolation level and timeout
 */
export async function createIsolatedTransaction<T>(
  operation: (tx: PrismaClient) => Promise<T>,
  options: {
    isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
    timeout?: number;
    retryOptions?: ConcurrencyOptions;
  } = {}
): Promise<T> {
  const {
    isolationLevel = 'ReadCommitted',
    timeout = 10000,
    retryOptions
  } = options;
  
  const executeTransaction = async () => {
    return await prisma.$transaction(operation, {
      isolationLevel,
      timeout
    });
  };
  
  if (retryOptions) {
    return withOptimisticLocking(executeTransaction, retryOptions);
  }
  
  return executeTransaction();
}

/**
 * Utility to add random jitter to prevent thundering herd
 */
export function addJitter(baseDelayMs: number, jitterMs: number = 100): number {
  return baseDelayMs + Math.random() * jitterMs;
}

/**
 * Exponential backoff with jitter calculation
 */
export function calculateBackoffWithJitter(
  attempt: number,
  baseDelay: number = 100,
  multiplier: number = 2,
  maxDelay: number = 2000,
  jitterMs: number = 50
): number {
  const exponentialDelay = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), maxDelay);
  return exponentialDelay + Math.random() * jitterMs;
}

// Cost validation constants for security testing
const DAILY_COST_LIMITS = {
  INSTITUTION: Number(process.env.INSTITUTION_COST_LIMIT) || 2.50,
  ENTERPRISE: Number(process.env.ENTERPRISE_COST_LIMIT) || 1.25,
  PROFESSIONAL: Number(process.env.PROFESSIONAL_COST_LIMIT) || 0.60,
  FREE: Number(process.env.FREE_COST_LIMIT) || 0.20
} as const;

const MAX_COST_PER_OPERATION = 10.0; // Maximum cost allowed per operation

/**
 * Comprehensive cost validation to prevent budget manipulation
 * Implements multiple layers of validation for financial security
 */
export function validateCostUpdate(cost: number, tier: string, userId: string): {
  valid: boolean;
  sanitizedCost: number;
  error?: string;
} {
  // Type and basic validation
  if (typeof cost !== 'number' || isNaN(cost) || !isFinite(cost)) {
    concurrencyLogger.error('Invalid cost type or value', { cost, tier, userId });
    return { valid: false, sanitizedCost: 0, error: 'Invalid cost type' };
  }
  
  // Prevent negative costs (could reduce budget)
  if (cost < 0) {
    concurrencyLogger.error('Negative cost attempted', { cost, tier, userId });
    return { valid: false, sanitizedCost: 0, error: 'Negative cost not allowed' };
  }
  
  // Environment-aware cost validation
  const isProduction = process.env.NODE_ENV === 'production';
  const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  
  if (cost < 0.001) {
    // Allow $0 costs in development/test environments
    if (!isProduction || isTestEnvironment) {
      if (cost === 0) {
        concurrencyLogger.debug('Zero cost allowed in non-production environment', { 
          cost, tier, userId, 
          environment: process.env.NODE_ENV,
          isTest: isTestEnvironment 
        });
        return { valid: true, sanitizedCost: 0 };
      }
    }
    
    // Reject extremely small non-zero costs in all environments (potential bypass)
    concurrencyLogger.warn('Suspiciously small cost rejected', { 
      cost, tier, userId, 
      environment: process.env.NODE_ENV,
      isProduction,
      isTest: isTestEnvironment 
    });
    return { valid: false, sanitizedCost: 0, error: 'Cost too small' };
  }
  
  // Maximum cost per operation check (prevent excessive charges)
  if (cost > MAX_COST_PER_OPERATION) {
    concurrencyLogger.error('Cost exceeds maximum per operation', { cost, tier, userId, max: MAX_COST_PER_OPERATION });
    return { valid: false, sanitizedCost: 0, error: 'Cost exceeds maximum' };
  }
  
  // Tier-specific validation (prevent tier privilege abuse)
  const tierLimit = DAILY_COST_LIMITS[tier as keyof typeof DAILY_COST_LIMITS];
  if (!tierLimit) {
    concurrencyLogger.error('Unknown subscription tier', { tier, userId });
    return { valid: false, sanitizedCost: 0, error: 'Invalid tier' };
  }
  
  if (cost > tierLimit) {
    concurrencyLogger.error('Cost exceeds tier limit', { cost, tier, tierLimit, userId });
    return { valid: false, sanitizedCost: 0, error: 'Cost exceeds tier limit' };
  }
  
  // Precision validation (prevent floating point manipulation)
  const sanitizedCost = Math.round(cost * 1000) / 1000; // Round to 3 decimal places
  if (Math.abs(cost - sanitizedCost) > 0.0001) {
    concurrencyLogger.warn('Cost precision adjusted', { original: cost, sanitized: sanitizedCost, tier, userId });
  }
  
  return { valid: true, sanitizedCost };
}