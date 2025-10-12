/**
 * Batch Filing Processor - Eliminates N+1 query patterns
 * 
 * Performance optimizations:
 * - Single database query for all filing-user relationships
 * - Parallel AI processing with controlled concurrency
 * - Efficient memory usage with streaming processing
 * - Circuit breaker integration for timeout protection
 */

import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';
import { CronFilingProcessor } from './filing-processor';
import { performanceMetrics } from '../monitoring/performanceMetrics';
import { ParallelAIProcessor, type ParallelAITask } from './parallel-ai-processor';
import type { IntelligentCircuitBreaker } from '../services/circuitBreaker';

const batchLogger = logger.child('batch-filing-processor');

export interface BatchFilingItem {
  filing: Record<string, unknown>;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BACKLOG';
  estimatedProcessingTime: number;
}

export interface BatchProcessingResult {
  totalFilings: number;
  processedFilings: number;
  successfulUsers: number;
  skippedFilings: number;
  errors: string[];
  processingTime: number;
  parallelProcessingMetrics?: {
    concurrencyAchieved: number;
    averageProcessingTime: number;
    cacheHitRate: number;
    totalTokens: number;
  };
}

export interface UserTickerMapping {
  userId: string;
  email: string;
  subscriptionTier: string;
  processingBudget: number;
  budgetUsed: number;
  tickers: {
    symbol: string;
    companyName: string;
  }[];
}

export class BatchFilingProcessor {
  
  /**
   * Process multiple filings efficiently using batch database queries and parallel AI processing
   * Eliminates N+1 query pattern by fetching all user-ticker relationships once
   * Uses parallel AI processing for maximum throughput within timeout constraints
   */
  static async processBatchFilings(
    filings: BatchFilingItem[],
    circuitBreaker: IntelligentCircuitBreaker,
    maxConcurrency: number = 3
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const results: BatchProcessingResult = {
      totalFilings: filings.length,
      processedFilings: 0,
      successfulUsers: 0,
      skippedFilings: 0,
      errors: [],
      processingTime: 0
    };

    if (filings.length === 0) {
      results.processingTime = Date.now() - startTime;
      return results;
    }

    batchLogger.info(`Starting optimized batch processing of ${filings.length} filings with parallel AI processing (max concurrency: ${maxConcurrency})`);

    try {
      // OPTIMIZATION 1: Single database query for all ticker symbols
      const tickerSymbols = [...new Set(filings.map(f => f.filing.ticker.symbol))];
      
      const userTickerMappings = await this.getBatchUserTickerMappings(tickerSymbols);
      
      batchLogger.info(`Fetched user mappings for ${tickerSymbols.length} tickers`, {
        totalUsers: userTickerMappings.length,
        tickerSymbols
      });

      // OPTIMIZATION 2: Create AI processing tasks for all filing-user combinations
      const aiTasks = await this.createParallelAITasks(filings, userTickerMappings);
      
      batchLogger.info(`Created ${aiTasks.length} AI processing tasks from ${filings.length} filings and ${userTickerMappings.length} users`);

      // OPTIMIZATION 3: Process all tasks using parallel AI processor
      if (aiTasks.length > 0) {
        const parallelProcessor = new ParallelAIProcessor(maxConcurrency, circuitBreaker);
        
        // Calculate remaining time for AI processing
        const timeConstraints = circuitBreaker.calculateTimeConstraints();
        const maxProcessingTime = Math.min(timeConstraints.remaining - 30000, 240000); // Leave 30s buffer, max 4 minutes
        
        batchLogger.info(`Starting parallel AI processing with ${maxProcessingTime}ms time limit`, {
          totalTasks: aiTasks.length,
          maxConcurrency,
          remainingTime: timeConstraints.remaining
        });

        const parallelResult = await parallelProcessor.processParallelAITasks(aiTasks, maxProcessingTime);
        
        // Map parallel processing results back to batch results
        results.processedFilings = parallelResult.completedTasks;
        results.successfulUsers = parallelResult.successfulTasks;
        results.skippedFilings = parallelResult.totalTasks - parallelResult.completedTasks;
        results.errors.push(...parallelResult.errors);
        
        // Add parallel processing metrics
        results.parallelProcessingMetrics = {
          concurrencyAchieved: parallelResult.concurrencyAchieved,
          averageProcessingTime: parallelResult.averageProcessingTime,
          cacheHitRate: parallelResult.cacheHitRate,
          totalTokens: parallelResult.totalTokens
        };

        batchLogger.info(`Parallel AI processing completed`, {
          completedTasks: parallelResult.completedTasks,
          successfulTasks: parallelResult.successfulTasks,
          failedTasks: parallelResult.failedTasks,
          concurrencyAchieved: parallelResult.concurrencyAchieved,
          cacheHitRate: (parallelResult.cacheHitRate * 100).toFixed(1) + '%',
          totalCost: parallelResult.totalCost,
          processingTime: parallelResult.processingTime
        });
      }

      batchLogger.info(`Optimized batch processing completed`, {
        ...results,
        processingTime: Date.now() - startTime,
        optimizationUsed: 'parallel-ai-processing'
      });

    } catch (error) {
      batchLogger.error('Optimized batch processing failed', { error });
      results.errors.push(error instanceof Error ? error.message : 'Unknown batch processing error');
    }

    results.processingTime = Date.now() - startTime;
    performanceMetrics.recordBatchProcessingMetrics(results);
    
    return results;
  }

  /**
   * OPTIMIZATION: Single database query to get all user-ticker relationships
   * Replaces N individual queries with one efficient batch query
   */
  private static async getBatchUserTickerMappings(tickerSymbols: string[]): Promise<UserTickerMapping[]> {
    const prisma = getPrismaClient();
    
    const users = await prisma.user.findMany({
      where: {
        tickers: {
          some: {
            symbol: {
              in: tickerSymbols
            }
          }
        }
      },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        processingBudget: true,
        budgetUsed: true,
        tickers: {
          where: {
            symbol: {
              in: tickerSymbols
            }
          },
          select: {
            symbol: true,
            companyName: true
          }
        }
      }
    });

    return users.map(user => ({
      userId: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      processingBudget: user.processingBudget || 0,
      budgetUsed: user.budgetUsed || 0,
      tickers: user.tickers
    }));
  }

  /**
   * Group filings by ticker symbol for efficient batch processing
   */
  private static groupFilingsByTicker(filings: BatchFilingItem[]): Map<string, BatchFilingItem[]> {
    const grouped = new Map<string, BatchFilingItem[]>();
    
    for (const filing of filings) {
      const symbol = filing.filing.ticker.symbol;
      if (!grouped.has(symbol)) {
        grouped.set(symbol, []);
      }
      grouped.get(symbol)!.push(filing);
    }
    
    return grouped;
  }

  /**
   * Process all filings for a specific ticker
   */
  private static async processTickerFilings(
    tickerSymbol: string,
    filings: BatchFilingItem[],
    userMappings: UserTickerMapping[],
    circuitBreaker: IntelligentCircuitBreaker,
    results: BatchProcessingResult
  ): Promise<void> {
    // Find users interested in this ticker
    const interestedUsers = userMappings.filter(user => 
      user.tickers.some(ticker => ticker.symbol === tickerSymbol)
    );

    if (interestedUsers.length === 0) {
      batchLogger.debug(`No users found for ticker ${tickerSymbol}, skipping ${filings.length} filings`);
      results.skippedFilings += filings.length;
      return;
    }

    batchLogger.debug(`Processing ${filings.length} filings for ticker ${tickerSymbol} with ${interestedUsers.length} users`);

    // Process each filing for all interested users
    for (const filing of filings) {
      try {
        // Check circuit breaker before each filing
        const shouldProcess = circuitBreaker.shouldProcessFiling(filing.priority);
        if (!shouldProcess.shouldProcess) {
          batchLogger.debug(`Circuit breaker skipping filing`, {
            ticker: tickerSymbol,
            reason: shouldProcess.reason
          });
          results.skippedFilings++;
          continue;
        }

        // Process filing for all interested users
        const filingResult = await this.processFilingForUsers(
          filing,
          interestedUsers,
          circuitBreaker
        );

        results.processedFilings++;
        results.successfulUsers += filingResult.successfulUsers;
        
        if (filingResult.errors.length > 0) {
          results.errors.push(...filingResult.errors);
        }

      } catch (error) {
        batchLogger.error(`Failed to process filing for ticker ${tickerSymbol}`, { error });
        results.errors.push(`Filing processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Process a single filing for multiple users efficiently
   */
  private static async processFilingForUsers(
    batchFiling: BatchFilingItem,
    users: UserTickerMapping[],
    circuitBreaker: IntelligentCircuitBreaker
  ): Promise<{ successfulUsers: number; errors: string[] }> {
    const result = { successfulUsers: 0, errors: [] };
    
    // Process users in parallel with controlled concurrency
    const userPromises = users.map(async (user) => {
      try {
        const processingStartTime = Date.now();
        
        const tickerInfo = user.tickers.find(t => t.symbol === batchFiling.filing.ticker.symbol);
        if (!tickerInfo) {
          return false;
        }

        // Use circuit breaker wrapper for individual user processing
        const processResult = await circuitBreaker.wrapProcessing(async () => {
          return await CronFilingProcessor.processSingleFiling(
            batchFiling.filing,
            {
              id: user.userId,
              email: user.email,
              subscriptionTier: user.subscriptionTier,
              processingBudget: user.processingBudget,
              budgetUsed: user.budgetUsed
            },
            user.subscriptionTier,
            { 
              symbol: batchFiling.filing.ticker.symbol, 
              cik: batchFiling.filing.ticker.cik 
            },
            { companyName: tickerInfo.companyName }
          );
        }, batchFiling.priority, batchFiling.estimatedProcessingTime);

        if (!processResult.skipped && processResult.result?.success) {
          const processingTime = Date.now() - processingStartTime;
          performanceMetrics.recordProcessingTime(processingTime, true);
          return true;
        }
        
        return false;
        
      } catch (error) {
        result.errors.push(`User ${user.userId} processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
      }
    });

    const userResults = await Promise.allSettled(userPromises);
    result.successfulUsers = userResults.filter(r => r.status === 'fulfilled' && r.value === true).length;

    return result;
  }

  /**
   * Create parallel AI processing tasks from filings and user mappings
   */
  private static async createParallelAITasks(
    filings: BatchFilingItem[],
    userMappings: UserTickerMapping[]
  ): Promise<ParallelAITask[]> {
    const tasks: ParallelAITask[] = [];
    let taskIdCounter = 0;

    for (const filing of filings) {
      const tickerSymbol = filing.filing.ticker.symbol;
      
      // Find all users interested in this ticker
      const interestedUsers = userMappings.filter(user => 
        user.tickers.some(ticker => ticker.symbol === tickerSymbol)
      );

      for (const user of interestedUsers) {
        const tickerInfo = user.tickers.find(t => t.symbol === tickerSymbol);
        if (!tickerInfo) continue;

        tasks.push({
          id: `task_${++taskIdCounter}_${filing.filing.accessionNumber}_${user.userId}`,
          filing: filing.filing,
          user: {
            id: user.userId,
            email: user.email,
            subscriptionTier: user.subscriptionTier,
            processingBudget: user.processingBudget,
            budgetUsed: user.budgetUsed,
            tickers: user.tickers
          },
          tier: user.subscriptionTier,
          tickerData: {
            symbol: tickerSymbol,
            cik: filing.filing.ticker.cik || 'unknown',
            companyName: tickerInfo.companyName
          },
          priority: filing.priority,
          estimatedProcessingTime: filing.estimatedProcessingTime
        });
      }
    }

    return tasks;
  }

  /**
   * Helper to check if a promise is complete (resolved or rejected)
   */
  private static isPromiseComplete(_promise: Promise<unknown>): boolean {
    // This is a simplified approach - in practice, we'd track promise states
    return false; // Assume not complete for conservative concurrency control
  }
}