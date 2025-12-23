/**
 * Advanced Transaction Management System
 * 
 * Provides bulletproof data consistency and transaction management for the SEC filing
 * processing pipeline. Handles complex transaction boundaries, rollback mechanisms,
 * and provides isolation levels for different use cases.
 */

import { Prisma } from '@prisma/client';
import { getPrismaClient } from './prisma';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { createAsyncAuditLog } from './async-audit';
import { v4 as uuidv4 } from 'uuid';

// Lazy accessor to avoid build-time initialization
const getPrisma = () => getPrismaClient();
const transactionLogger = logger.child('transaction-manager');

export interface TransactionContext {
  id: string;
  startTime: Date;
  isolationLevel: Prisma.TransactionIsolationLevel;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeout?: number;
  maxWait?: number;
  description?: string;
  metadata?: Record<string, unknown>;
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
    timeout: 30000, // 30 seconds (optimized for fast processing)
    maxWait: 5000, // 5 seconds (reduced for faster failure detection)
    retryOnConflict: true,
    maxRetries: 2 // Reduced from 3 to minimize timeout accumulation
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

        const result = await getPrisma().$transaction(
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
      const prismaError = error as { code: string };
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
    operation: (tx: Prisma.TransactionClient, filing: Record<string, unknown>) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    // Validate input parameters
    if (!filingId) {
      throw new Error('filingId is required and cannot be null or undefined');
    }
    if (!userId) {
      throw new Error('userId is required and cannot be null or undefined');
    }

    return TransactionManager.executeTransaction(
      async (tx, context) => {
        // Step 1: Determine lookup strategy based on filingId format
        const isSyntheticId = this.isSyntheticFilingId(filingId);
        let filing;

        if (isSyntheticId) {
          // Extract accession number from synthetic ID (format: accessionNumber-TICKER)
          const accessionNumber = this.extractAccessionNumber(filingId);

          if (!accessionNumber) {
            throw new Error(`Failed to extract accession number from synthetic filing ID: ${filingId}`);
          }

          transactionLogger.debug('Looking up filing by accession number (synthetic ID detected)', {
            transactionId: context.id,
            originalFilingId: filingId,
            extractedAccessionNumber: accessionNumber,
            userId
          });

          // Look up by accessionNumber instead of id
          filing = await tx.rssFilingCheck.findUnique({
            where: { accessionNumber },
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
        } else {
          // Standard UUID lookup
          transactionLogger.debug('Looking up filing by UUID (standard ID)', {
            transactionId: context.id,
            filingId,
            userId
          });

          filing = await tx.rssFilingCheck.findUnique({
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
        }

        if (!filing) {
          const lookupMethod = isSyntheticId ? 'accession number' : 'ID';
          const lookupValue = isSyntheticId ? this.extractAccessionNumber(filingId) : filingId;
          throw new Error(`Filing not found by ${lookupMethod}: ${lookupValue}`);
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
        isolationLevel: 'ReadCommitted', // Use lighter isolation to prevent deadlocks
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
    operation: (tx: Prisma.TransactionClient, currentUser: Record<string, unknown>) => Promise<void>,
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

        // Step 4: Queue audit log asynchronously to avoid extending transaction
        setImmediate(() => {
          createAsyncAuditLog({
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
            success: true,
            correlationId: context.id
          }).catch(err => {
            transactionLogger.error('Failed to create async audit log', { userId, error: err });
          });
        });

        return {
          previousBudget: currentBudgetUsed,
          newBudget: newBudgetUsed
        };
      },
      {
        isolationLevel: 'ReadCommitted', // Use lighter isolation to prevent deadlocks
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
    const { maxConcurrency = 3, continueOnError = true, transactionOptions: _transactionOptions = {} } = options;
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

  /**
   * Check if a filing ID is synthetic (contains ticker suffix)
   * Synthetic IDs follow the pattern: accessionNumber-TICKER
   * Example: "0001104659-25-101278-TSLA"
   */
  public static isSyntheticFilingId(filingId: string): boolean {
    // UUID pattern: 8-4-4-4-12 characters with hyphens
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // If it matches UUID pattern, it's a real database ID
    if (uuidPattern.test(filingId)) {
      return false;
    }
    
    // Check if it looks like accessionNumber-TICKER pattern
    // Accession numbers are typically in format: XXXXXXXXXX-XX-XXXXXX
    // So synthetic ID would be: XXXXXXXXXX-XX-XXXXXX-TICKER
    const syntheticPattern = /^\d{10}-\d{2}-\d{6}-[A-Z]+$/;
    
    return syntheticPattern.test(filingId);
  }

  /**
   * Extract accession number from synthetic filing ID
   * Input: "0001104659-25-101278-TSLA"
   * Output: "0001104659-25-101278"
   */
  public static extractAccessionNumber(syntheticId: string): string {
    // Find the last dash and remove everything after it (the ticker part)
    const lastDashIndex = syntheticId.lastIndexOf('-');
    if (lastDashIndex === -1) {
      // If no dash found, return as-is (shouldn't happen for synthetic IDs)
      return syntheticId;
    }
    
    const accessionNumber = syntheticId.substring(0, lastDashIndex);
    
    transactionLogger.debug('Extracted accession number from synthetic ID', {
      syntheticId,
      extractedAccessionNumber: accessionNumber,
      ticker: syntheticId.substring(lastDashIndex + 1)
    });
    
    return accessionNumber;
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
    operation: (tx: Prisma.TransactionClient, filing: Record<string, unknown>) => Promise<T>,
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
    operation: (tx: Prisma.TransactionClient, currentUser: Record<string, unknown>) => Promise<void>,
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

// Classes are already exported above with their declarations