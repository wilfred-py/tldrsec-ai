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

// Lazy accessor to avoid build-time initialization
const getPrisma = () => getPrismaClient();
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

// Budget concurrency options have been moved to budget-operations module

/**
 * Creates an optimistic lock error
 */
export function createOptimisticLockError(
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
  // Check for optimistic lock errors first
  if (error && typeof error === 'object' && 'code' in error) {
    const errorCode = (error as { code: string }).code;
    if (errorCode === 'OPTIMISTIC_LOCK_FAILED') {
      return true;
    }
  }
  
  if (error instanceof PrismaClientKnownRequestError || 
      (error && typeof error === 'object' && 'code' in error && 
       typeof (error as { code: unknown }).code === 'string')) {
    // P2002: Unique constraint failed
    // P2034: Transaction failed due to write conflict
    // P2025: Record to update not found (can indicate race condition)
    // P2024: Timed out waiting for connection from pool
    // P5008: Queries timed out  
    const errorCode = (error as { code: string }).code;
    return ['P2002', 'P2034', 'P2025', 'P2024', 'P5008'].includes(errorCode);
  }

  // Check for deadlock errors in error message
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('deadlock') || 
        errorMessage.includes('serialization failure') ||
        errorMessage.includes('could not serialize access') ||
        errorMessage.includes('lock wait timeout')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Enhanced deadlock recovery with intelligent backoff
 */
export function calculateIntelligentBackoff(
  attempt: number,
  error: unknown,
  baseDelay: number = 50
): number {
  // Identify error type for specialized backoff
  const isDeadlock = error instanceof Error && 
    error.message.toLowerCase().includes('deadlock');
  const isTimeout = error instanceof PrismaClientKnownRequestError && 
    ['P2024', 'P5008'].includes(error.code);
  
  // Use different strategies based on error type
  if (isDeadlock) {
    // Deadlocks need random jitter to break synchronization
    return Math.random() * baseDelay * Math.pow(1.8, attempt);
  } else if (isTimeout) {
    // Timeouts need longer delays
    return baseDelay * Math.pow(2.5, attempt) + Math.random() * 100;
  } else {
    // Standard optimistic locking conflicts
    return baseDelay * Math.pow(1.5, attempt) + Math.random() * 25;
  }
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
      
      // Use intelligent backoff based on error type
      const delay = Math.min(
        calculateIntelligentBackoff(attempt - 1, error, config.baseDelay),
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
    return await getPrisma().$transaction(async (tx) => {
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
    return await getPrisma().$transaction(async (tx) => {
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

// Budget operations have been moved to dedicated module for better organization
// Import and re-export for backwards compatibility
export { updateUserBudgetWithLock } from './budget-operations';

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
    return await getPrisma().$transaction(operation, {
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

// Note: Cost validation has been moved to a dedicated module
// Import from the shared validation module instead
import { validateCostUpdate as sharedValidateCostUpdate } from './cost-validation';

/**
 * Re-export cost validation for backwards compatibility
 * @deprecated Use direct import from './cost-validation' instead
 */
export const validateCostUpdate = sharedValidateCostUpdate;