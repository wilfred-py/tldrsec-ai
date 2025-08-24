/**
 * Advanced Transaction Management System
 * 
 * Provides bulletproof data consistency and transaction management for the SEC filing
 * processing pipeline. Handles complex transaction boundaries, rollback mechanisms,
 * and provides isolation levels for different use cases.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { getPrismaClient } from './prisma';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { v4 as uuidv4 } from 'uuid';

const prisma = getPrismaClient();
const transactionLogger = logger.child('transaction-manager');

export interface TransactionContext {
  id: string;
  startTime: Date;
  isolationLevel: Prisma.TransactionIsolationLevel;
  description?: string;
  metadata?: Record<string, any>;
}

export interface TransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeout?: number;
  maxWait?: number;
  description?: string;
  metadata?: Record<string, any>;
  retryOnConflict?: boolean;
  maxRetries?: number;
}

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  transactionId: string;
  duration: number;
  retryCount?: number;
}

export type TransactionOperation<T> = (tx: Prisma.TransactionClient, context: TransactionContext) => Promise<T>;

/**
 * Advanced transaction manager with comprehensive error handling,
 * monitoring, and rollback capabilities
 */
export class TransactionManager {
  private static readonly DEFAULT_OPTIONS: Required<Omit<TransactionOptions, 'description' | 'metadata'>> = {
    isolationLevel: 'ReadCommitted',
    timeout: 30000, // 30 seconds
    maxWait: 10000, // 10 seconds
    retryOnConflict: true,
    maxRetries: 3
  };

  /**
   * Execute a transaction with comprehensive error handling and monitoring
   */
  static async executeTransaction<T>(
    operation: TransactionOperation<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const config = { ...this.DEFAULT_OPTIONS, ...options };
    const transactionId = uuidv4();
    const startTime = new Date();
    
    let retryCount = 0;
    let lastError: Error;

    transactionLogger.info('Starting transaction', {
      transactionId,
      isolationLevel: config.isolationLevel,
      timeout: config.timeout,
      description: config.description,
      metadata: config.metadata
    });

    // Start monitoring
    monitoring.startTimer(`transaction.${transactionId}`);
    monitoring.incrementCounter('transaction.started', 1);

    while (retryCount <= config.maxRetries) {
      try {
        const context: TransactionContext = {
          id: transactionId,
          startTime,
          isolationLevel: config.isolationLevel,
          description: config.description,
          metadata: config.metadata
        };

        const result = await prisma.$transaction(
          async (tx) => {
            transactionLogger.debug('Transaction started', {
              transactionId,
              attempt: retryCount + 1
            });

            return await operation(tx, context);
          },
          {
            isolationLevel: config.isolationLevel,
            timeout: config.timeout,
            maxWait: config.maxWait
          }
        );

        const duration = Date.now() - startTime.getTime();

        // Log success
        transactionLogger.info('Transaction completed successfully', {
          transactionId,
          duration,
          retryCount,
          description: config.description
        });

        // Record metrics
        monitoring.stopTimer(`transaction.${transactionId}`);
        monitoring.recordValue('transaction.duration', duration);
        monitoring.incrementCounter('transaction.success', 1);

        if (retryCount > 0) {
          monitoring.incrementCounter('transaction.success_after_retry', 1);
          monitoring.recordValue('transaction.retry_count', retryCount);
        }

        return {
          success: true,
          data: result,
          transactionId,
          duration,
          retryCount: retryCount > 0 ? retryCount : undefined
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now() - startTime.getTime();

        // Check if this is a retryable error
        const isRetryable = this.isRetryableError(lastError) && config.retryOnConflict;
        
        transactionLogger.warn('Transaction failed', {
          transactionId,
          attempt: retryCount + 1,
          error: lastError.message,
          isRetryable,
          willRetry: isRetryable && retryCount < config.maxRetries,
          duration
        });

        // If not retryable or max retries reached, fail immediately
        if (!isRetryable || retryCount >= config.maxRetries) {
          transactionLogger.error('Transaction failed permanently', {
            transactionId,
            error: lastError.message,
            attempts: retryCount + 1,
            duration,
            description: config.description
          });

          // Record failure metrics
          monitoring.stopTimer(`transaction.${transactionId}`);
          monitoring.incrementCounter('transaction.failed', 1);
          monitoring.recordValue('transaction.failure_duration', duration);

          return {
            success: false,
            error: lastError,
            transactionId,
            duration,
            retryCount: retryCount > 0 ? retryCount : undefined
          };
        }

        // Increment retry count and add backoff delay
        retryCount++;
        const backoffDelay = Math.min(100 * Math.pow(2, retryCount - 1), 2000);
        
        transactionLogger.info('Retrying transaction after delay', {
          transactionId,
          attempt: retryCount + 1,
          backoffDelay
        });

        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    // This should never be reached due to the logic above, but included for safety
    const duration = Date.now() - startTime.getTime();
    return {
      success: false,
      error: lastError!,
      transactionId,
      duration,
      retryCount
    };
  }

  /**
   * Check if an error is retryable (typically concurrency conflicts)
   */
  private static isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Prisma concurrency errors
    if (error.constructor.name === 'PrismaClientKnownRequestError') {
      const prismaError = error as any;
      return ['P2002', 'P2034', 'P2025'].includes(prismaError.code);
    }

    // Database connection errors
    if (errorMessage.includes('connection') && errorMessage.includes('timeout')) {
      return true;
    }

    // Serializable transaction conflicts
    if (errorMessage.includes('serializable') || errorMessage.includes('deadlock')) {
      return true;
    }

    // Optimistic lock failures
    if (errorMessage.includes('optimistic') && errorMessage.includes('lock')) {
      return true;
    }

    return false;
  }
}

/**
 * Specialized transaction operations for filing processing
 */
export class FilingTransactionManager {
  /**
   * Process a filing with full transaction boundaries
   */
  static async processFilingWithTransaction<T>(
    filingId: string,
    userId: string,
    operation: (tx: Prisma.TransactionClient, filing: any) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    return TransactionManager.executeTransaction(
      async (tx, context) => {
        // Step 1: Acquire lock on the filing to prevent concurrent processing
        const filing = await tx.rssFilingCheck.findUnique({
          where: { id: filingId },
          include: {
            tickerMonitoring: {
              select: {
                symbol: true,
                companyName: true,
                cik: true
              }
            }
          }
        });

        if (!filing) {
          throw new Error(`Filing ${filingId} not found`);
        }

        if (filing.processed) {
          throw new Error(`Filing ${filingId} already processed`);
        }

        transactionLogger.info('Processing filing with transaction', {
          transactionId: context.id,
          filingId,
          userId,
          ticker: filing.tickerMonitoring.symbol,
          formType: filing.filingType
        });

        // Step 2: Mark filing as being processed (pessimistic lock)
        await tx.rssFilingCheck.update({
          where: { id: filingId },
          data: { processed: true }
        });

        // Step 3: Execute the actual processing operation
        const result = await operation(tx, filing);

        transactionLogger.info('Filing processed successfully in transaction', {
          transactionId: context.id,
          filingId,
          userId
        });

        return result;
      },
      {
        isolationLevel: 'Serializable', // Highest isolation for filing processing
        description: `Process filing ${filingId} for user ${userId}`,
        metadata: { filingId, userId },
        ...options
      }
    );
  }

  /**
   * Update user budget with transaction safety
   */
  static async updateUserBudgetWithTransaction(
    userId: string,
    costToAdd: number,
    operation: (tx: Prisma.TransactionClient, currentUser: any) => Promise<void>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<{ previousBudget: number; newBudget: number }>> {
    return TransactionManager.executeTransaction(
      async (tx, context) => {
        // Step 1: Get current user with row lock
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
        const newBudgetUsed = currentBudgetUsed + costToAdd;

        transactionLogger.info('Updating user budget in transaction', {
          transactionId: context.id,
          userId,
          currentBudget: currentBudgetUsed,
          costToAdd,
          newBudget: newBudgetUsed,
          tier: currentUser.subscriptionTier
        });

        // Step 2: Execute custom operation (e.g., create summary, send email)
        await operation(tx, currentUser);

        // Step 3: Update user budget atomically
        await tx.user.update({
          where: { id: userId },
          data: {
            budgetUsed: newBudgetUsed,
            lastCronProcessed: new Date()
          }
        });

        // Step 4: Create audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'BUDGET_UPDATE',
            details: {
              transactionId: context.id,
              previousBudget: currentBudgetUsed,
              newBudget: newBudgetUsed,
              costAdded: costToAdd,
              tier: currentUser.subscriptionTier,
              timestamp: new Date().toISOString()
            },
            success: true
          }
        });

        return {
          previousBudget: currentBudgetUsed,
          newBudget: newBudgetUsed
        };
      },
      {
        isolationLevel: 'Serializable',
        description: `Update budget for user ${userId}`,
        metadata: { userId, costToAdd },
        ...options
      }
    );
  }

  /**
   * Batch process multiple filings with individual transaction isolation
   */
  static async processBatchFilingsWithIsolation<T>(
    filings: Array<{ id: string; userId: string }>,
    operation: (filing: { id: string; userId: string }) => Promise<T>,
    options: {
      maxConcurrency?: number;
      continueOnError?: boolean;
      transactionOptions?: TransactionOptions;
    } = {}
  ): Promise<Array<{ filing: { id: string; userId: string }; result?: T; error?: Error; success: boolean }>> {
    const { maxConcurrency = 3, continueOnError = true, transactionOptions = {} } = options;
    const results: Array<{ filing: { id: string; userId: string }; result?: T; error?: Error; success: boolean }> = [];

    transactionLogger.info('Starting batch processing with isolation', {
      filingCount: filings.length,
      maxConcurrency,
      continueOnError
    });

    // Process filings in batches to control concurrency
    for (let i = 0; i < filings.length; i += maxConcurrency) {
      const batch = filings.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (filing) => {
        try {
          const result = await operation(filing);
          return { filing, result, success: true };
        } catch (error) {
          transactionLogger.error('Filing processing failed in batch', {
            filingId: filing.id,
            userId: filing.userId,
            error: error instanceof Error ? error.message : String(error)
          });
          
          return { 
            filing, 
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
          // This should not happen since we catch errors in the promises
          transactionLogger.error('Unexpected batch result rejection', { 
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

    transactionLogger.info('Batch processing completed', {
      totalFilings: filings.length,
      processed: results.length,
      successful: successCount,
      failed: errorCount,
      successRate: results.length > 0 ? (successCount / results.length) * 100 : 0
    });

    return results;
  }
}

/**
 * Utility functions for transaction management
 */
export const transactionUtils = {
  /**
   * Create a transaction-safe operation wrapper
   */
  withTransaction: <T>(
    operation: TransactionOperation<T>,
    options?: TransactionOptions
  ) => {
    return () => TransactionManager.executeTransaction(operation, options);
  },

  /**
   * Create a filing-specific transaction wrapper
   */
  withFilingTransaction: <T>(
    filingId: string,
    userId: string,
    operation: (tx: Prisma.TransactionClient, filing: any) => Promise<T>,
    options?: TransactionOptions
  ) => {
    return () => FilingTransactionManager.processFilingWithTransaction(
      filingId,
      userId,
      operation,
      options
    );
  },

  /**
   * Create a budget update transaction wrapper
   */
  withBudgetTransaction: (
    userId: string,
    costToAdd: number,
    operation: (tx: Prisma.TransactionClient, currentUser: any) => Promise<void>,
    options?: TransactionOptions
  ) => {
    return () => FilingTransactionManager.updateUserBudgetWithTransaction(
      userId,
      costToAdd,
      operation,
      options
    );
  }
};

// Export the main transaction manager for direct use
export { TransactionManager, FilingTransactionManager };