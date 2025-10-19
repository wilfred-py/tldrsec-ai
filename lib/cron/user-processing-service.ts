/**
 * User processing service for tier-aware cron jobs
 * Handles user eligibility, batch processing, and concurrent execution
 * Extracted from app/api/cron/tier-aware/route.ts
 */

import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';
import { getUserProcessingStatuses, getEligibleUsers } from './market-hours';
import { optimizeCronProcessing } from './ticker-deduplication';
import { isConcurrencyError } from '../db/concurrency';
import { CronJobMonitor } from '../monitoring/cron-monitor';
import { CronBudgetService } from './budget-service';
import { lockUtils } from '../db/distributed-lock';
import type {
  DatabaseUser,
  EligibleUser,
  ProcessUserResult,
  TierStatus,
  CronResults,
  UserFilingResult,
  // User,
  MarketContext,
  EligibilityOptions
} from './types';
import { TIER_BATCH_SIZES, MAX_CONCURRENT_USER_PROCESSING, ERROR_TYPES } from './types';

const processingLogger = logger.child('cron-user-processing');

// Initialize Prisma client lazily to avoid build-time database connections
let prisma: ReturnType<typeof getPrismaClient>;
function getPrisma() {
  if (!prisma) {
    prisma = getPrismaClient();
  }
  return prisma;
}

export class CronUserProcessingService {
  /**
   * Get all users eligible for processing based on market context and subscription tiers
   */
  static async getEligibleUsersForProcessing(
    marketContext: MarketContext,
    options: EligibilityOptions = {
      maxUsersPerCycle: 100,
      respectBudgetLimits: true,
      budgetThreshold: 90
    }
  ): Promise<{ allUsers: DatabaseUser[]; eligibleUsers: EligibleUser[] }> {
    try {
      processingLogger.debug('Fetching users for processing eligibility check');

      // Get all users with subscription tiers and last processing times
      const allUsers = await getPrisma().user.findMany({
        where: {
          tickers: {
            some: {} // Only users who follow at least one ticker
          }
        },
        select: {
          id: true,
          email: true,
          subscriptionTier: true,
          lastCronProcessed: true,
          processingBudget: true,
          budgetUsed: true,
          tickers: {
            select: {
              id: true,
              symbol: true,
              companyName: true
            }
          }
        }
      }) as DatabaseUser[];

      processingLogger.debug('Users query completed', { userCount: allUsers.length });

      // Get processing statuses with eligibility (with null safety)
      const userStatuses = getUserProcessingStatuses(
        allUsers
          .filter(u => u && u.id && u.subscriptionTier) // Filter out invalid users
          .map(u => ({
            id: u.id,
            subscriptionTier: CronBudgetService.normalizeTier(u.subscriptionTier), // Normalize tier to HOBBY/PRO
            lastProcessedAt: u.lastCronProcessed,
            budgetUsed: u.budgetUsed || 0
          })),
        marketContext
      );

      processingLogger.debug('User processing statuses calculated', { statusCount: userStatuses.length });

      // Get eligible users based on processing frequency and budget limits
      const eligibleUsers = getEligibleUsers(userStatuses, options);

      processingLogger.info(`Found ${eligibleUsers.length} eligible users for processing`, {
        totalUsers: allUsers.length,
        eligibleCount: eligibleUsers.length
      });

      return { allUsers, eligibleUsers };

    } catch (error) {
      processingLogger.error('Failed to get eligible users', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process eligible users by tier with ticker deduplication optimization
   */
  static async processEligibleUsers(
    eligibleUsers: EligibleUser[],
    allUsers: DatabaseUser[],
    monitor: CronJobMonitor,
    filingProcessor: (user: DatabaseUser, tier: string, userFilingResults?: UserFilingResult[]) => Promise<{ filingsProcessed: number; cost: number }>
  ): Promise<CronResults> {
    const results: CronResults = {
      usersProcessed: 0,
      filingsProcessed: 0,
      totalCost: 0,
      tierBreakdown: {},
      errors: 0,
      errorBreakdown: {
        concurrencyConflicts: 0,
        budgetExceeded: 0,
        costValidationFailed: 0,
        tierMismatch: 0,
        unknownErrors: 0
      },
      cacheMetrics: {
        hits: 0,
        misses: 0,
        hitRatio: 0,
        apiCallsSaved: 0
      }
    };

    // Get eligible users with full database records
    const eligibleUserRecords = allUsers.filter(user => 
      eligibleUsers.some(eligible => eligible.userId === user.id)
    );

    if (eligibleUserRecords.length === 0) {
      processingLogger.info('No eligible users found for processing');
      return results;
    }

    try {
      // Apply ticker deduplication optimization
      processingLogger.info(`Starting ticker deduplication optimization for ${eligibleUserRecords.length} eligible users`);
      
      const deduplicationResult = await optimizeCronProcessing(eligibleUserRecords);
      
      processingLogger.info('Ticker deduplication optimization completed', {
        totalTickers: deduplicationResult.totalTickers,
        uniqueTickers: deduplicationResult.uniqueTickers,
        deduplicationRatio: Math.round(deduplicationResult.deduplicationRatio * 100) + '%',
        apiCallsSaved: deduplicationResult.apiCallsSaved,
        cacheHitRatio: Math.round(deduplicationResult.cacheMetrics.hitRatio * 100) + '%'
      });

      // Update cache metrics
      results.cacheMetrics = {
        hits: deduplicationResult.cacheMetrics.hits,
        misses: deduplicationResult.cacheMetrics.misses,
        hitRatio: deduplicationResult.cacheMetrics.hitRatio,
        apiCallsSaved: deduplicationResult.apiCallsSaved
      };

      // Record deduplication metrics in monitoring
      if (monitor) {
        await monitor.recordMetric('ticker_deduplication', {
          totalTickers: deduplicationResult.totalTickers,
          uniqueTickers: deduplicationResult.uniqueTickers,
          deduplicationRatio: deduplicationResult.deduplicationRatio,
          apiCallsSaved: deduplicationResult.apiCallsSaved,
          cacheHitRatio: deduplicationResult.cacheMetrics.hitRatio
        });
      }

      // Group eligible users by tier to build tier breakdown
      const tierUserCounts = eligibleUsers.reduce((acc, user) => {
        acc[user.tier] = (acc[user.tier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Populate tier breakdown with user counts
      results.tierBreakdown = tierUserCounts;

      // Process users by tier using optimized filing results
      const tierResults = await this.processUsersByTier(
        eligibleUsers,
        allUsers,
        deduplicationResult.filingResults,
        monitor,
        filingProcessor
      );

      for (const tierResult of tierResults) {
        results.usersProcessed += tierResult.processed;
        results.filingsProcessed += tierResult.filings;
        results.totalCost += tierResult.cost;
        results.errors += tierResult.errors;

        // Accumulate error breakdown
        if (tierResult.errorBreakdown) {
          results.errorBreakdown.concurrencyConflicts += tierResult.errorBreakdown.concurrencyConflicts || 0;
          results.errorBreakdown.budgetExceeded += tierResult.errorBreakdown.budgetExceeded || 0;
          results.errorBreakdown.costValidationFailed += tierResult.errorBreakdown.costValidationFailed || 0;
          results.errorBreakdown.tierMismatch += tierResult.errorBreakdown.tierMismatch || 0;
          results.errorBreakdown.unknownErrors += tierResult.errorBreakdown.unknownErrors || 0;
        }
      }

      return results;

    } catch (deduplicationError) {
      processingLogger.error('Ticker deduplication failed, falling back to individual processing', {
        error: deduplicationError instanceof Error ? deduplicationError.message : 'Unknown error',
        eligibleUsers: eligibleUserRecords.length
      });

      // Group eligible users by tier to build tier breakdown (fallback case)
      const tierUserCounts = eligibleUsers.reduce((acc, user) => {
        acc[user.tier] = (acc[user.tier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Populate tier breakdown with user counts
      results.tierBreakdown = tierUserCounts;

      // Fallback to original processing method without deduplication
      const tierResults = await this.processUsersByTier(
        eligibleUsers,
        allUsers,
        undefined, // No filing results from deduplication
        monitor,
        filingProcessor
      );

      // Accumulate fallback results
      for (const tierResult of tierResults) {
        results.usersProcessed += tierResult.processed;
        results.filingsProcessed += tierResult.filings;
        results.totalCost += tierResult.cost;
        results.errors += tierResult.errors;

        if (tierResult.errorBreakdown) {
          results.errorBreakdown.concurrencyConflicts += tierResult.errorBreakdown.concurrencyConflicts || 0;
          results.errorBreakdown.budgetExceeded += tierResult.errorBreakdown.budgetExceeded || 0;
          results.errorBreakdown.costValidationFailed += tierResult.errorBreakdown.costValidationFailed || 0;
          results.errorBreakdown.tierMismatch += tierResult.errorBreakdown.tierMismatch || 0;
          results.errorBreakdown.unknownErrors += tierResult.errorBreakdown.unknownErrors || 0;
        }
      }

      return results;
    }
  }

  /**
   * Process users grouped by tier with appropriate batch sizes
   */
  private static async processUsersByTier(
    eligibleUsers: EligibleUser[],
    allUsers: DatabaseUser[],
    filingResults: UserFilingResult[] | undefined,
    monitor: CronJobMonitor,
    filingProcessor: (user: DatabaseUser, tier: string, userFilingResults?: UserFilingResult[]) => Promise<{ filingsProcessed: number; cost: number }>
  ): Promise<TierStatus[]> {
    const results: TierStatus[] = [];

    // Group users by tier for budget management and processing limits
    const usersByTier = eligibleUsers.reduce((acc, userStatus) => {
      const tier = userStatus.tier;
      if (!acc[tier]) acc[tier] = [];
      acc[tier].push(userStatus);
      return acc;
    }, {} as Record<string, EligibleUser[]>);

    // Process each tier with their respective filing results
    for (const [tier, userStatuses] of Object.entries(usersByTier)) {
      const typedUserStatuses = userStatuses as EligibleUser[];
      if (typedUserStatuses.length === 0) continue;

      const batchSize = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
      
      let tierResult: TierStatus;
      if (filingResults) {
        // Use deduplication results
        tierResult = await this.processTierBatchWithDeduplication(
          tier,
          typedUserStatuses,
          batchSize,
          allUsers,
          filingResults,
          monitor,
          filingProcessor
        );
      } else {
        // Fallback to original processing
        tierResult = await this.processTierBatch(
          tier,
          typedUserStatuses,
          batchSize,
          allUsers,
          monitor,
          filingProcessor
        );
      }

      results.push(tierResult);

      processingLogger.info(`Completed ${tier} tier processing`, {
        ...tierResult,
        optimized: !!filingResults
      });
    }

    return results;
  }

  /**
   * Process a batch of users from a specific tier using deduplicated filing results
   */
  private static async processTierBatchWithDeduplication(
    tier: string,
    userStatuses: EligibleUser[],
    batchSize: number,
    allUsers: DatabaseUser[],
    filingResults: UserFilingResult[],
    monitor: CronJobMonitor,
    filingProcessor: (user: DatabaseUser, tier: string, userFilingResults?: UserFilingResult[]) => Promise<{ filingsProcessed: number; cost: number }>
  ): Promise<TierStatus> {
    const results = this.initializeTierStatus();

    // Limit batch size and implement concurrent processing
    const batchUsers = (userStatuses || []).slice(0, batchSize);
    
    // Process users concurrently with controlled concurrency
    const processingPromises = await this.createUserProcessingPromises(
      batchUsers,
      allUsers,
      tier,
      monitor,
      (user, userTier) => {
        // Find relevant filing results for this user's tickers
        const userFilingResults = filingResults.filter(result => 
          result.users.some(u => u.userId === user.id)
        );
        return filingProcessor(user, userTier, userFilingResults);
      }
    );
    
    // Wait for all processing to complete and aggregate results
    await this.aggregateProcessingResults(processingPromises, results);

    return results;
  }

  /**
   * Process a batch of users from a specific tier (original method - fallback)
   */
  private static async processTierBatch(
    tier: string,
    userStatuses: EligibleUser[],
    batchSize: number,
    allUsers: DatabaseUser[],
    monitor: CronJobMonitor,
    filingProcessor: (user: DatabaseUser, tier: string) => Promise<{ filingsProcessed: number; cost: number }>
  ): Promise<TierStatus> {
    const results = this.initializeTierStatus();

    // Limit batch size and implement concurrent processing
    const batchUsers = (userStatuses || []).slice(0, batchSize);
    
    // Process users concurrently with controlled concurrency
    const processingPromises = await this.createUserProcessingPromises(
      batchUsers,
      allUsers,
      tier,
      monitor,
      filingProcessor
    );
    
    // Wait for all processing to complete and aggregate results
    await this.aggregateProcessingResults(processingPromises, results);

    return results;
  }

  /**
   * Initialize empty tier status for accumulating results
   */
  private static initializeTierStatus(): TierStatus {
    return {
      processed: 0,
      filings: 0,
      cost: 0,
      errors: 0,
      errorBreakdown: {
        concurrencyConflicts: 0,
        budgetExceeded: 0,
        costValidationFailed: 0,
        tierMismatch: 0,
        unknownErrors: 0
      }
    };
  }

  /**
   * Create promises for concurrent user processing with controlled concurrency
   */
  private static async createUserProcessingPromises(
    batchUsers: EligibleUser[],
    allUsers: DatabaseUser[],
    tier: string,
    monitor: CronJobMonitor,
    filingProcessor: (user: DatabaseUser, tier: string, ...args: unknown[]) => Promise<{ filingsProcessed: number; cost: number }>
  ): Promise<Promise<ProcessUserResult>[]> {
    const maxConcurrency = Math.min(MAX_CONCURRENT_USER_PROCESSING, batchUsers.length);
    const processingPromises: Promise<ProcessUserResult>[] = [];
    
    for (let i = 0; i < batchUsers.length; i += maxConcurrency) {
      const chunk = batchUsers.slice(i, i + maxConcurrency);
      
      const chunkPromises = (chunk || []).map(async (userStatus) => {
        return await this.processIndividualUser(userStatus, allUsers, tier, monitor, filingProcessor);
      });
      
      processingPromises.push(...chunkPromises);
    }
    
    return processingPromises;
  }

  /**
   * Process an individual user with comprehensive error handling and user-level locking
   */
  private static async processIndividualUser(
    userStatus: EligibleUser,
    allUsers: DatabaseUser[],
    tier: string,
    monitor: CronJobMonitor,
    filingProcessor: (user: DatabaseUser, tier: string, ...args: unknown[]) => Promise<{ filingsProcessed: number; cost: number }>
  ): Promise<ProcessUserResult> {
    try {
      // Validate userStatus object structure
      if (!userStatus || !userStatus.userId) {
        processingLogger.error('Invalid userStatus object', { userStatus });
        return { success: false, error: 'Invalid userStatus object', userId: 'unknown' };
      }

      // Use distributed lock manager for proper user-level locking
      return await lockUtils.withUserLock(
        userStatus.userId,
        async () => {
          processingLogger.debug(`Successfully acquired processing lock for user ${userStatus.userId}`);
          return await this.executeUserProcessing(userStatus, allUsers, tier, monitor, filingProcessor);
        },
        {
          ttlMs: 10 * 60 * 1000, // 10 minutes
          timeoutMs: 5000 // 5 seconds to acquire lock
        }
      );
      
    } catch (lockError: unknown) {
      if (lockError instanceof Error && lockError.message.includes('Failed to acquire lock')) {
        processingLogger.info(`User ${userStatus.userId} is already being processed by another cron run, skipping`);
        return { 
          success: false, 
          error: 'User already being processed', 
          userId: userStatus.userId,
          errorType: ERROR_TYPES.CONCURRENCY_CONFLICT
        };
      }
      throw lockError;
    }
  }

  /**
   * Execute the actual user processing within the lock
   */
  private static async executeUserProcessing(
    userStatus: EligibleUser,
    allUsers: DatabaseUser[],
    tier: string,
    monitor: CronJobMonitor,
    filingProcessor: (user: DatabaseUser, tier: string, ...args: unknown[]) => Promise<{ filingsProcessed: number; cost: number }>
  ): Promise<ProcessUserResult> {
    try {
      // Find full user data with null safety
      const fullUser = (allUsers || []).find(u => u && u.id === userStatus.userId);
      if (!fullUser) {
        processingLogger.warn(`User ${userStatus.userId} not found in full user data`, {
          userId: userStatus.userId,
          availableUserIds: (allUsers || []).map(u => u?.id).filter(Boolean)
        });
        return { success: false, error: 'User not found', userId: userStatus.userId };
      }

      // Validate user data structure
      if (!fullUser.tickers || !Array.isArray(fullUser.tickers)) {
        processingLogger.error(`User ${userStatus.userId} has invalid tickers data`, {
          userId: userStatus.userId,
          tickersType: typeof fullUser.tickers,
          tickersValue: fullUser.tickers
        });
        return { success: false, error: 'Invalid user tickers data', userId: userStatus.userId };
      }

      // Process user's filings
      const userResult = await filingProcessor(fullUser, tier);

      // Validate and update budget
      const budgetResult = await this.validateAndUpdateUserBudget(userStatus.userId, userResult.cost, tier);
      if (!budgetResult.success) {
        return {
          success: false,
          userId: userStatus.userId,
          error: budgetResult.error,
          errorType: budgetResult.errorType
        };
      }

      // Record metrics
      if (monitor) {
        await monitor.recordMetric('user_processed', {
          userId: userStatus.userId,
          tier,
          filingsProcessed: userResult.filingsProcessed,
          cost: userResult.cost
        });
      }

      return {
        success: true,
        userId: userStatus.userId,
        filingsProcessed: userResult?.filingsProcessed || 0,
        cost: userResult.cost,
        budgetUpdate: budgetResult.budgetUpdate
      };

    } catch (error) {
      return this.handleUserProcessingError(error, userStatus, tier);
    }
  }

  /**
   * Validate cost and update user budget with comprehensive error handling
   */
  private static async validateAndUpdateUserBudget(
    userId: string,
    cost: number,
    tier: string
  ): Promise<{ success: boolean; error?: string; errorType?: string; budgetUpdate?: unknown }> {
    try {
      // Comprehensive cost validation
      const costValidation = CronBudgetService.validateProcessingCost(cost, tier, {
        userId,
        tier,
        operation: 'tier-aware-cron-processing',
        operationType: cost === 0 ? 'cached_summary' : 'ai_generation',
        isCached: cost === 0
      });

      if (!costValidation.valid) {
        return {
          success: false,
          error: costValidation.error,
          errorType: ERROR_TYPES.COST_VALIDATION_FAILED
        };
      }

      // Get current user budget
      const currentUser = await getPrisma().user.findUnique({
        where: { id: userId },
        select: {
          budgetUsed: true,
          subscriptionTier: true
        }
      });

      if (!currentUser) {
        throw new Error(`User ${userId} not found`);
      }

      // Verify subscription tier hasn't changed
      const tierCompatibility = CronBudgetService.validateTierCompatibility(tier, currentUser.subscriptionTier);
      if (!tierCompatibility.isValid) {
        return {
          success: false,
          error: tierCompatibility.error,
          errorType: ERROR_TYPES.TIER_MISMATCH
        };
      }

      const currentBudgetUsed = currentUser.budgetUsed || 0;

      // Update budget atomically
      const budgetUpdate = await CronBudgetService.updateUserBudget(
        userId,
        costValidation.sanitizedCost,
        currentBudgetUsed,
        tier
      );

      return {
        success: true,
        budgetUpdate: {
          previousBudget: budgetUpdate.previousBudget,
          newBudget: budgetUpdate.newBudget,
          costAdded: costValidation.sanitizedCost
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('Budget limit exceeded')) {
        return {
          success: false,
          error: errorMessage,
          errorType: ERROR_TYPES.BUDGET_EXCEEDED
        };
      }

      throw error; // Re-throw for higher level error categorization
    }
  }

  /**
   * Handle user processing errors with categorization
   */
  private static handleUserProcessingError(
    error: unknown,
    userStatus: EligibleUser,
    tier: string
  ): ProcessUserResult {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let errorType = ERROR_TYPES.UNKNOWN_ERROR;

    // Categorize concurrency errors
    if (isConcurrencyError(error)) {
      errorType = ERROR_TYPES.CONCURRENCY_CONFLICT;
      processingLogger.warn(`Concurrency conflict processing user ${userStatus.userId}`, {
        error: errorMessage,
        tier,
        userStatus: userStatus.userId
      });
    } else if (errorMessage.includes('Budget limit exceeded')) {
      errorType = ERROR_TYPES.BUDGET_EXCEEDED;
      processingLogger.info(`User ${userStatus.userId} budget limit reached`, {
        tier,
        error: errorMessage
      });
    } else if (errorMessage.includes('Cost validation failed')) {
      errorType = ERROR_TYPES.COST_VALIDATION_FAILED;
      processingLogger.error(`Cost validation failed for user ${userStatus.userId}`, {
        tier,
        error: errorMessage
      });
    } else if (errorMessage.includes('Subscription tier mismatch')) {
      errorType = ERROR_TYPES.TIER_MISMATCH;
      processingLogger.warn(`Subscription tier changed during processing for user ${userStatus.userId}`, {
        tier,
        error: errorMessage
      });
    } else {
      processingLogger.error(`Unexpected error processing user ${userStatus.userId}`, {
        error: errorMessage,
        tier,
        errorType: typeof error
      });
    }

    return {
      success: false,
      userId: userStatus?.userId || 'unknown',
      error: errorMessage,
      errorType
    };
  }

  /**
   * Aggregate processing results from completed promises
   */
  private static async aggregateProcessingResults(
    processingPromises: Promise<ProcessUserResult>[],
    results: TierStatus
  ): Promise<void> {
    const processingResults = await Promise.allSettled(processingPromises);

    for (const result of processingResults || []) {
      try {
        if (result && result.status === 'fulfilled' && result.value && result.value.success) {
          results.processed++;
          results.filings += result.value.filingsProcessed || 0;
          results.cost += result.value.cost || 0;
        } else {
          results.errors++;

          // Track error breakdown with null safety
          if (result && result.status === 'fulfilled' && result.value && result.value.errorType) {
            switch (result.value.errorType) {
              case ERROR_TYPES.CONCURRENCY_CONFLICT:
                results.errorBreakdown!.concurrencyConflicts++;
                break;
              case ERROR_TYPES.BUDGET_EXCEEDED:
                results.errorBreakdown!.budgetExceeded++;
                break;
              case ERROR_TYPES.COST_VALIDATION_FAILED:
                results.errorBreakdown!.costValidationFailed++;
                break;
              case ERROR_TYPES.TIER_MISMATCH:
                results.errorBreakdown!.tierMismatch++;
                break;
              default:
                results.errorBreakdown!.unknownErrors++;
            }
          } else {
            results.errorBreakdown!.unknownErrors++;
          }
        }
      } catch (aggregationError) {
        processingLogger.error('Error during result aggregation', {
          error: aggregationError instanceof Error ? aggregationError.message : 'Unknown aggregation error',
          resultStatus: result?.status,
          resultValue: result?.status === 'fulfilled' ? result.value : undefined
        });
        results.errors++;
        results.errorBreakdown!.unknownErrors++;
      }
    }
  }
}