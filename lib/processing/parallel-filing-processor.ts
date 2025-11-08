/**
 * Parallel Filing Processor
 * 
 * Implements controlled parallel execution for SEC filing processing
 * to eliminate synchronous bottlenecks and reduce processing times
 * from 40-100 seconds to under 20 seconds for 20 filings.
 */

import { logger } from '../logging';
import { CronFilingProcessor } from '../cron/filing-processor';
import { optimizedConnectionManager } from '../db/optimized-connection-manager';
// import { monitoring } from '../monitoring'; // TODO: Add monitoring integration
import { EventEmitter } from 'events';

const componentLogger = logger.child('parallel-filing-processor');

/**
 * Filing data structure for processing
 */
export interface Filing {
  id?: string;
  accessionNumber: string;
  documentType: string;
  filedDate: string;
  ticker: {
    symbol: string;
    cik: string;
    companyName: string;
  };
}

/**
 * User data structure for processing
 */
export interface User {
  id: string;
  email: string;
  subscriptionTier: string;
  tickers?: Array<{ symbol: string }>;
}

/**
 * Processing result for individual filing
 */
export interface ProcessingResult {
  filing: Filing;
  user: User;
  success: boolean;
  error?: string;
  cost?: number;
  executionTimeMs: number;
  attemptNumber: number;
}

/**
 * Batch processing configuration
 */
export interface BatchConfig {
  concurrencyLimit: number;
  batchSize: number;
  retryAttempts: number;
  delayBetweenBatches: number;
  respectRateLimits: boolean;
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
  totalFilings: number;
  totalUsers: number;
  successfulProcessing: number;
  failedProcessing: number;
  totalExecutionTime: number;
  averageProcessingTime: number;
  batchesProcessed: number;
  concurrencyUtilization: number;
}

/**
 * Parallel Filing Processor Class
 * 
 * Provides controlled parallel execution with:
 * - Configurable concurrency limits
 * - Batch processing with error isolation
 * - Rate limiting compliance
 * - Comprehensive error handling
 * - Performance monitoring
 */
export class ParallelFilingProcessor extends EventEmitter {
  private readonly defaultConfig: BatchConfig = {
    concurrencyLimit: 5,
    batchSize: 10,
    retryAttempts: 3,
    delayBetweenBatches: 1000, // 1 second
    respectRateLimits: true
  };

  private stats: ProcessingStats = {
    totalFilings: 0,
    totalUsers: 0,
    successfulProcessing: 0,
    failedProcessing: 0,
    totalExecutionTime: 0,
    averageProcessingTime: 0,
    batchesProcessed: 0,
    concurrencyUtilization: 0
  };

  private activeWorkers = 0;
  private maxActiveWorkers = 0;

  /**
   * Process multiple filings concurrently with controlled batching
   */
  async processFilingsConcurrently(
    filings: Filing[],
    config: Partial<BatchConfig> = {}
  ): Promise<ProcessingResult[]> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    
    componentLogger.info('Starting parallel filing processing', {
      totalFilings: filings.length,
      concurrencyLimit: mergedConfig.concurrencyLimit,
      batchSize: mergedConfig.batchSize
    });

    // Initialize stats
    this.stats = {
      totalFilings: filings.length,
      totalUsers: 0,
      successfulProcessing: 0,
      failedProcessing: 0,
      totalExecutionTime: 0,
      averageProcessingTime: 0,
      batchesProcessed: 0,
      concurrencyUtilization: 0
    };

    // Create batches for controlled processing
    const batches = this.createBatches(filings, mergedConfig.batchSize);
    const allResults: ProcessingResult[] = [];

    // Emit processing start event
    this.emit('processing-started', {
      totalFilings: filings.length,
      batchCount: batches.length,
      config: mergedConfig
    });

    try {
      // Process batches sequentially to manage resource usage
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        componentLogger.info(`Processing batch ${batchIndex + 1}/${batches.length}`, {
          batchSize: batch.length,
          remainingBatches: batches.length - batchIndex - 1
        });

        // Process current batch with concurrency control
        const batchResults = await this.processBatchConcurrently(
          batch,
          mergedConfig
        );

        allResults.push(...batchResults);
        this.stats.batchesProcessed++;

        // Emit batch completion event
        this.emit('batch-completed', {
          batchIndex: batchIndex + 1,
          batchResults,
          totalProgress: (batchIndex + 1) / batches.length
        });

        // Add delay between batches if configured
        if (batchIndex < batches.length - 1 && mergedConfig.delayBetweenBatches > 0) {
          await this.sleep(mergedConfig.delayBetweenBatches);
        }
      }

      // Calculate final stats
      const endTime = Date.now();
      this.stats.totalExecutionTime = endTime - startTime;
      this.stats.averageProcessingTime = this.stats.totalExecutionTime / this.stats.totalFilings;
      this.stats.concurrencyUtilization = this.maxActiveWorkers / mergedConfig.concurrencyLimit;

      componentLogger.info('Parallel filing processing completed', {
        ...this.stats,
        successRate: (this.stats.successfulProcessing / (this.stats.successfulProcessing + this.stats.failedProcessing)) * 100
      });

      // Emit completion event
      this.emit('processing-completed', {
        results: allResults,
        stats: this.stats
      });

      return allResults;

    } catch (error) {
      componentLogger.error('Critical error in parallel processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processedFilings: allResults.length,
        totalFilings: filings.length
      });

      this.emit('processing-error', {
        error,
        partialResults: allResults
      });

      throw error;
    }
  }

  /**
   * Process a single batch of filings with concurrency control
   */
  private async processBatchConcurrently(
    batch: Filing[],
    config: BatchConfig
  ): Promise<ProcessingResult[]> {
    // Create semaphore for concurrency control
    const semaphore = new Semaphore(config.concurrencyLimit);
    const batchStartTime = Date.now();

    // Process all filings in batch with concurrency limit
    const batchPromises = batch.map(async (filing) => {
      return semaphore.acquire(async () => {
        this.activeWorkers++;
        this.maxActiveWorkers = Math.max(this.maxActiveWorkers, this.activeWorkers);

        try {
          return await this.processFilingForAllUsers(filing, config);
        } finally {
          this.activeWorkers--;
        }
      });
    });

    // Wait for all batch processing to complete
    const batchResults = await Promise.allSettled(batchPromises);
    const flatResults: ProcessingResult[] = [];

    // Process results and handle any failures
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        flatResults.push(...result.value);
      } else {
        componentLogger.error('Batch processing promise failed', {
          error: result.reason
        });
        // Create error result for failed promise
        flatResults.push({
          filing: { accessionNumber: 'unknown', documentType: 'unknown', filedDate: '', ticker: { symbol: 'unknown', cik: '', companyName: '' } },
          user: { id: 'unknown', email: 'unknown', subscriptionTier: 'unknown' },
          success: false,
          error: result.reason instanceof Error ? result.reason.message : 'Promise rejection',
          executionTimeMs: Date.now() - batchStartTime,
          attemptNumber: 1
        });
      }
    }

    return flatResults;
  }

  /**
   * Process a single filing for all subscribed users
   */
  private async processFilingForAllUsers(
    filing: Filing,
    config: BatchConfig
  ): Promise<ProcessingResult[]> {
    const filingStartTime = Date.now();
    const results: ProcessingResult[] = [];

    try {
      // Get all users subscribed to this ticker using optimized query
      const usersForTicker = await optimizedConnectionManager.getUsersWithRelatedData(
        filing.ticker.symbol,
        { includeRelations: false }
      );

      this.stats.totalUsers += usersForTicker.length;

      if (usersForTicker.length === 0) {
        componentLogger.warn('No users found for ticker', {
          ticker: filing.ticker.symbol,
          filing: filing.accessionNumber
        });
        return results;
      }

      // Process filing for each user with retry logic
      const userPromises = usersForTicker.map(async (user) => {
        return this.processFilingForUser(filing, user, config);
      });

      // Wait for all user processing to complete
      const userResults = await Promise.allSettled(userPromises);

      // Collect results
      for (const result of userResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.success) {
            this.stats.successfulProcessing++;
          } else {
            this.stats.failedProcessing++;
          }
        } else {
          this.stats.failedProcessing++;
          componentLogger.error('User processing promise failed', {
            filing: filing.accessionNumber,
            error: result.reason
          });
        }
      }

      // Mark filing as processed if at least one user was successful
      const successfulProcessing = results.filter(r => r.success).length;
      if (successfulProcessing > 0) {
        try {
          const { markFilingAsProcessedByAccession } = await import('../sec-edgar/ticker-monitoring');
          await markFilingAsProcessedByAccession(filing.accessionNumber, filing.ticker.symbol);
        } catch (markError) {
          componentLogger.error('Failed to mark filing as processed', {
            filing: filing.accessionNumber,
            error: markError instanceof Error ? markError.message : 'Unknown error'
          });
        }
      }

    } catch (error) {
      componentLogger.error('Failed to process filing for users', {
        filing: filing.accessionNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Create error result
      results.push({
        filing,
        user: { id: 'unknown', email: 'unknown', subscriptionTier: 'unknown' },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - filingStartTime,
        attemptNumber: 1
      });
    }

    return results;
  }

  /**
   * Process a filing for a single user with retry logic
   */
  private async processFilingForUser(
    filing: Filing,
    user: User,
    config: BatchConfig
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    let lastError: string | undefined;

    // Respect rate limits by adding delay
    if (config.respectRateLimits) {
      await this.sleep(200); // 200ms delay between SEC requests
    }

    // Retry logic
    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        // Use the existing filing processor
        const result = await CronFilingProcessor.processSingleFiling(
          filing,
          user,
          user.subscriptionTier,
          { symbol: filing.ticker.symbol, cik: filing.ticker.cik },
          { companyName: filing.ticker.companyName }
        );

        // Return successful result
        return {
          filing,
          user,
          success: result.success,
          error: result.success ? undefined : result.error,
          cost: result.cost,
          executionTimeMs: Date.now() - startTime,
          attemptNumber: attempt
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        componentLogger.warn('Filing processing attempt failed', {
          filing: filing.accessionNumber,
          user: user.email,
          attempt,
          maxAttempts: config.retryAttempts,
          error: lastError
        });

        // If this isn't the last attempt, wait before retrying
        if (attempt < config.retryAttempts) {
          await this.sleep(1000 * attempt); // Exponential backoff
        }
      }
    }

    // All attempts failed
    return {
      filing,
      user,
      success: false,
      error: lastError || 'All retry attempts failed',
      executionTimeMs: Date.now() - startTime,
      attemptNumber: config.retryAttempts
    };
  }

  /**
   * Create batches from array of filings
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalFilings: 0,
      totalUsers: 0,
      successfulProcessing: 0,
      failedProcessing: 0,
      totalExecutionTime: 0,
      averageProcessingTime: 0,
      batchesProcessed: 0,
      concurrencyUtilization: 0
    };
    this.maxActiveWorkers = 0;
  }
}

/**
 * Semaphore implementation for concurrency control
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire<T>(task: () => Promise<T>): Promise<T> {
    await this.acquirePermit();
    try {
      return await task();
    } finally {
      this.releasePermit();
    }
  }

  private async acquirePermit(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private releasePermit(): void {
    const nextResolve = this.waitQueue.shift();
    if (nextResolve) {
      nextResolve();
    } else {
      this.permits++;
    }
  }
}

// Export singleton instance
export const parallelFilingProcessor = new ParallelFilingProcessor();