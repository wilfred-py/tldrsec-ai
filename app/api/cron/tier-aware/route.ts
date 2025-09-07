import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '../../../../lib/logging';
import { getMarketHoursContext, getUserProcessingStatuses, getEligibleUsers } from '../../../../lib/cron/market-hours';
import { CronJobMonitor } from '../../../../lib/monitoring/cron-monitor';
import { CronJobStatus } from '../../../../types/cron';
import { 
  getActiveTickersForMonitoring, 
  checkTickerForNewFilings,
  validateUserTickers,
  getUnprocessedFilingsForTicker,
  markFilingAsProcessedByAccession
} from '../../../../lib/sec-edgar/ticker-monitoring';
// Web Crypto API for Edge Runtime compatibility
import { rateLimiter } from '../../../../lib/security/rate-limiter';
import { updateUserBudgetWithLock, isConcurrencyError } from '../../../../lib/db/concurrency';
import { FilingTransactionManager } from '../../../../lib/db/transaction-manager';
import { createAsyncAuditLog } from '../../../../lib/db/async-audit';
import { validateCostUpdate } from '../../../../lib/db/cost-validation';

const prisma = getPrismaClient();
const cronLogger = logger.child('tier-aware-cron');

// Type definitions
interface User {
  id: string;
  tickers: Array<{ symbol: string; [key: string]: unknown }>;
  email?: string;
  subscriptionTier?: string;
  lastCronProcessed?: Date | null;
  processingBudget?: number;
  budgetUsed?: number;
  [key: string]: unknown;
}

interface EligibleUser {
  tier: string;
  userId: string;
  [key: string]: unknown;
}

// Full user data retrieved from database
interface DatabaseUser {
  id: string;
  email: string | null;
  subscriptionTier: string;
  lastCronProcessed: Date | null;
  processingBudget: number | null;
  budgetUsed: number | null;
  tickers: Array<{
    id: string;
    symbol: string;
    companyName: string | null;
  }>;
}

interface ProcessUserResult {
  success: boolean;
  userId: string;
  filingsProcessed?: number;
  cost?: number;
  budgetUpdate?: {
    previousBudget: number;
    newBudget: number;
    costAdded: number;
  };
  error?: string;
  errorType?: string;
}

interface TierStatus {
  processed: number;
  filings: number;
  cost: number;
  errors: number;
  errorBreakdown?: {
    concurrencyConflicts: number;
    budgetExceeded: number;
    costValidationFailed: number;
    tierMismatch: number;
    unknownErrors: number;
  };
}


// Processing batch sizes per tier (from environment or defaults)
const TIER_BATCH_SIZES = {
  INSTITUTION: Number(process.env.INSTITUTION_BATCH_SIZE) || 10,
  ENTERPRISE: Number(process.env.ENTERPRISE_BATCH_SIZE) || 8, 
  PROFESSIONAL: Number(process.env.PROFESSIONAL_BATCH_SIZE) || 5,
  FREE: Number(process.env.FREE_BATCH_SIZE) || 3
} as const;

// Daily cost budgets (in USD) - from environment or defaults
const DAILY_COST_LIMITS = {
  INSTITUTION: Number(process.env.INSTITUTION_COST_LIMIT) || 2.50,
  ENTERPRISE: Number(process.env.ENTERPRISE_COST_LIMIT) || 1.25,
  PROFESSIONAL: Number(process.env.PROFESSIONAL_COST_LIMIT) || 0.60,
  FREE: Number(process.env.FREE_COST_LIMIT) || 0.20
} as const;

// Security constants - reserved for future cost validation
// const MAX_COST_PER_OPERATION = 10.0; // Maximum cost allowed per operation

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

// Cost validation is now handled by the dedicated cost-validation module


/**
 * Subscription-tier-aware SEC filing monitoring cron job
 * 
 * Core Functions:
 * 1. Monitor SEC RSS feeds for new filings (24/7 - filings can be published anytime)
 * 2. Process users based on subscription tiers and frequency eligibility
 * 3. Apply priority-based resource allocation
 * 4. Respect monthly cost budget limits
 * 5. Adjust processing frequency based on market hours context
 * 
 * Runs every 5 minutes continuously since SEC filings can be published 24/7
 */
export async function GET(request: NextRequest) {
  // DEBUG: Start logging immediately
  cronLogger.debug('Checkpoint 0: GET function entry');
  
  // Initialize monitoring with platform detection using factory pattern
  const platform = process.env.RAILWAY_ENVIRONMENT ? 'RAILWAY_CRON' : 'VERCEL_CRON';
  cronLogger.debug('Checkpoint 0.1: Platform determined', { platform });
  let monitor: CronJobMonitor;
  
  try {
    cronLogger.debug('Checkpoint 0.2: About to create CronJobMonitor');
    monitor = await CronJobMonitor.create('tier-aware-sec-monitor', platform);
    cronLogger.debug('Checkpoint 0.3: CronJobMonitor created successfully');
  } catch (initError) {
    cronLogger.error('Failed to initialize cron job monitor', { error: initError });
    return NextResponse.json({
      success: false,
      error: 'Failed to initialize monitoring'
    }, { status: 500 });
  }
  
  try {
    cronLogger.info('Starting tier-aware SEC filing cron job');
    
    // DEBUG: Add comprehensive logging to isolate error location
    cronLogger.debug('Checkpoint 1: Route function started');

    // Enhanced security validation
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    // Rate limiting
    const rateLimitResult = await rateLimiter.checkLimit('cron-endpoint', clientIp);
    if (!rateLimitResult.allowed) {
      cronLogger.warn('Rate limit exceeded for cron request', { clientIp });
      await monitor.complete(CronJobStatus.FAILED, 'Rate limit exceeded');
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    
    // IP allowlist check (if configured) - read dynamically to support testing
    const allowedIPs = process.env.CRON_ALLOWED_IPS?.split(',') || [];
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIp)) {
      cronLogger.warn('IP not allowed for cron request', { clientIp, allowedIPs });
      await monitor.complete(CronJobStatus.FAILED, 'IP not allowed');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Mandatory timing-safe authorization check - NO BYPASSES
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    // Validate CRON_SECRET exists
    if (!process.env.CRON_SECRET) {
      cronLogger.error('CRON_SECRET environment variable not configured');
      await monitor.complete(CronJobStatus.FAILED, 'Server configuration error');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    // All requests must provide valid authorization - no exceptions
    if (!authHeader || !timingSafeEqual(authHeader, expectedAuth)) {
      cronLogger.warn('Unauthorized cron request', { 
        clientIp, 
        hasAuthHeader: !!authHeader,
        environment: process.env.NODE_ENV 
      });
      await monitor.complete(CronJobStatus.FAILED, 'Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Security audit logging for all successful authentications
    cronLogger.info('Cron request authenticated successfully', {
      clientIp,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    // Get market context and user processing statuses
    cronLogger.debug('Checkpoint 2: Starting market context retrieval');
    const marketContext = getMarketHoursContext();
    cronLogger.debug('Checkpoint 3: Market context retrieved successfully');
    cronLogger.info(`Processing during ${marketContext.isMarketHours ? 'market' : 'off'} hours`, {
      isMarketDay: marketContext.isMarketDay,
      isHoliday: marketContext.isHoliday
    });

    // Record market context in monitoring
    await monitor.recordMetric('market_context', {
      isMarketHours: marketContext.isMarketHours,
      isMarketDay: marketContext.isMarketDay,
      isHoliday: marketContext.isHoliday,
      currentTime: marketContext.currentTime
    });

    // Get all users with subscription tiers and last processing times
    cronLogger.debug('Checkpoint 4: Starting user query');
    const allUsers = await prisma.user.findMany({
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
    cronLogger.debug('Checkpoint 5: User query completed', { userCount: allUsers.length });

    // Get processing statuses with eligibility (with null safety)
    cronLogger.debug('Checkpoint 6: Starting getUserProcessingStatuses');
    const userStatuses = getUserProcessingStatuses(
      allUsers
        .filter(u => u && u.id && u.subscriptionTier) // Filter out invalid users
        .map(u => ({
          id: u.id,
          subscriptionTier: u.subscriptionTier as 'FREE' | 'PROFESSIONAL' | 'ENTERPRISE' | 'INSTITUTION', // Type assertion for Prisma enum compatibility
          lastProcessedAt: u.lastCronProcessed,
          budgetUsed: u.budgetUsed || 0
        })),
      marketContext
    );
    cronLogger.debug('Checkpoint 7: getUserProcessingStatuses completed', { statusCount: userStatuses.length });

    // PHASE 1: Core SEC Filing Monitoring (always runs - filings can be published 24/7)
    cronLogger.debug('Checkpoint 8: Starting SEC filing monitoring');
    await runSecFilingMonitoring(monitor);
    cronLogger.debug('Checkpoint 9: SEC filing monitoring completed');
    
    // PHASE 2: Tier-aware user processing
    const eligibleUsers = getEligibleUsers(userStatuses, {
      maxUsersPerCycle: 100,
      respectBudgetLimits: true,
      budgetThreshold: 90
    });

    cronLogger.info(`Found ${eligibleUsers.length} eligible users for processing`, {
      totalUsers: allUsers.length,
      eligibleCount: eligibleUsers.length
    });

    // Process eligible users by tier
    const results = await processEligibleUsers(eligibleUsers, allUsers, monitor);
    
    // Complete monitoring
    const monitorResult = await monitor.complete(CronJobStatus.SUCCESS);
    
    cronLogger.info('Tier-aware cron job completed successfully', {
      ...results,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration
    });

    return NextResponse.json({
      success: true,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      marketContext: {
        isMarketHours: marketContext.isMarketHours,
        isMarketDay: marketContext.isMarketDay
      },
      results
    });

  } catch (error) {
    await monitor.complete(CronJobStatus.FAILED, error instanceof Error ? error.message : 'Unknown error');
    
    cronLogger.error('Tier-aware cron job failed', { error });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    // CRITICAL: Always disconnect Prisma client to prevent connection pool exhaustion
    try {
      await prisma.$disconnect();
      cronLogger.debug('Prisma client disconnected successfully');
    } catch (disconnectError) {
      cronLogger.warn('Warning: Failed to disconnect Prisma client', { error: disconnectError });
    }
  }
}

/**
 * Process eligible users by tier with priority handling
 */
async function processEligibleUsers(
  eligibleUsers: EligibleUser[], 
  allUsers: DatabaseUser[], 
  monitor: CronJobMonitor
) {
  const results = {
    usersProcessed: 0,
    filingsProcessed: 0,
    totalCost: 0,
    tierBreakdown: {} as Record<string, number>,
    errors: 0,
    errorBreakdown: {
      concurrencyConflicts: 0,
      budgetExceeded: 0,
      costValidationFailed: 0,
      tierMismatch: 0,
      unknownErrors: 0
    }
  };

  // Group eligible users by tier
  const usersByTier = eligibleUsers.reduce((acc, userStatus) => {
    const tier = userStatus.tier;
    if (!acc[tier]) acc[tier] = [];
    acc[tier].push(userStatus);
    return acc;
  }, {} as Record<string, EligibleUser[]>);

  // Process each tier with appropriate batch sizes
  for (const [tier, userStatuses] of Object.entries(usersByTier)) {
    const typedUserStatuses = userStatuses as EligibleUser[];
    if (typedUserStatuses.length === 0) continue;

    const batchSize = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
    const tierResults = await processTierBatch(tier, typedUserStatuses, batchSize, allUsers, monitor);
    
    // Accumulate results
    results.usersProcessed += tierResults.processed;
    results.filingsProcessed += tierResults.filings;
    results.totalCost += tierResults.cost;
    results.tierBreakdown[tier] = tierResults.processed;
    results.errors += tierResults.errors;
    
    // Accumulate error breakdown
    if (tierResults.errorBreakdown) {
      results.errorBreakdown.concurrencyConflicts += tierResults.errorBreakdown.concurrencyConflicts || 0;
      results.errorBreakdown.budgetExceeded += tierResults.errorBreakdown.budgetExceeded || 0;
      results.errorBreakdown.costValidationFailed += tierResults.errorBreakdown.costValidationFailed || 0;
      results.errorBreakdown.tierMismatch += tierResults.errorBreakdown.tierMismatch || 0;
      results.errorBreakdown.unknownErrors += tierResults.errorBreakdown.unknownErrors || 0;
    }

    cronLogger.info(`Completed ${tier} tier processing`, tierResults);
  }

  return results;
}

/**
 * Process a batch of users from a specific tier
 */
async function processTierBatch(
  tier: string,
  userStatuses: EligibleUser[],
  batchSize: number,
  allUsers: DatabaseUser[],
  monitor: CronJobMonitor
): Promise<TierStatus> {
  const results = {
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

  // Limit batch size and implement concurrent processing
  const batchUsers = (userStatuses || []).slice(0, batchSize);
  
  // Process users concurrently with controlled concurrency
  const maxConcurrency = Math.min(3, batchUsers.length); // Limit concurrent operations
  const processingPromises: Promise<ProcessUserResult>[] = [];
  
  for (let i = 0; i < batchUsers.length; i += maxConcurrency) {
    const chunk = batchUsers.slice(i, i + maxConcurrency);
    
    const chunkPromises = (chunk || []).map(async (userStatus) => {
      try {
        // Validate userStatus object structure
        if (!userStatus || !userStatus.userId) {
          cronLogger.error('Invalid userStatus object', { userStatus });
          return { success: false, error: 'Invalid userStatus object', userId: 'unknown' };
        }

        // Find full user data with null safety
        const fullUser = (allUsers || []).find(u => u && u.id === userStatus.userId);
        if (!fullUser) {
          cronLogger.warn(`User ${userStatus.userId} not found in full user data`, {
            userId: userStatus.userId,
            availableUserIds: (allUsers || []).map(u => u?.id).filter(Boolean)
          });
          return { success: false, error: 'User not found', userId: userStatus.userId };
        }

        // Validate user data structure before processing
        if (!fullUser.tickers || !Array.isArray(fullUser.tickers)) {
          cronLogger.error(`User ${userStatus.userId} has invalid tickers data`, {
            userId: userStatus.userId,
            tickersType: typeof fullUser.tickers,
            tickersValue: fullUser.tickers
          });
          return { success: false, error: 'Invalid user tickers data', userId: userStatus.userId };
        }

        // Convert DatabaseUser to User interface for processing
        const userForProcessing: User = {
          id: fullUser.id,
          email: fullUser.email || undefined,
          tickers: fullUser.tickers || [],
          subscriptionTier: fullUser.subscriptionTier,
          lastCronProcessed: fullUser.lastCronProcessed,
          processingBudget: fullUser.processingBudget || 0,
          budgetUsed: fullUser.budgetUsed || 0
        };

        // Process user's SEC filings
        const userResult = await processUserTierFilings(userForProcessing, tier);
        
        // Comprehensive cost validation (security: prevent budget manipulation)
        const costValidation = validateCostUpdate(userResult.cost, tier, {
          userId: userStatus.userId,
          tier,
          operation: 'tier-aware-cron-processing',
          operationType: userResult.cost === 0 ? 'cached_summary' : 'ai_generation',
          isCached: userResult.cost === 0
        });
        if (!costValidation.valid) {
          cronLogger.error(`Cost validation failed`, {
            userId: userStatus.userId,
            tier,
            originalCost: userResult.cost,
            error: costValidation.error
          });
          
          // Queue audit log for failed cost validation asynchronously  
          setImmediate(() => {
            createAsyncAuditLog({
              userId: userStatus.userId,
              action: 'BUDGET_UPDATE_FAILED',
              details: {
                originalCost: userResult.cost,
                tier,
                error: costValidation.error,
                timestamp: new Date().toISOString()
              },
              success: false
            }).catch(err => cronLogger.error('Failed to create async audit log', { err }));
          });
          
          return { success: false, error: `Cost validation failed: ${costValidation.error}` };
        }
        
        const validatedCost = costValidation.sanitizedCost;
        
        // Get current user budget first with proper error handling
        let currentUser;
        try {
          currentUser = await prisma.user.findUnique({
            where: { id: userStatus.userId },
            select: { 
              budgetUsed: true, 
              subscriptionTier: true
            }
          });
        } catch (dbError) {
          cronLogger.error(`Database error fetching user ${userStatus.userId}`, {
            error: dbError instanceof Error ? dbError.message : 'Unknown database error',
            userId: userStatus.userId
          });
          throw new Error(`Database error: Unable to fetch user ${userStatus.userId}`);
        }
        
        if (!currentUser) {
          cronLogger.error(`User ${userStatus.userId} not found in database during budget check`);
          throw new Error(`User ${userStatus.userId} not found`);
        }
        
        // Verify subscription tier hasn't changed (security: prevent tier escalation)
        if (currentUser.subscriptionTier !== tier) {
          throw new Error(`Subscription tier mismatch: expected ${tier}, got ${currentUser.subscriptionTier}`);
        }
        
        const currentBudgetUsed = currentUser.budgetUsed || 0;
        const dailyLimit = DAILY_COST_LIMITS[tier as keyof typeof DAILY_COST_LIMITS];
        
        // Atomic budget update with race condition protection and async audit logging
        const updateResult = await updateUserBudgetWithLock(
          userStatus.userId,
          validatedCost,
          currentBudgetUsed,
          dailyLimit,
          {
            maxRetries: 5, // Increased retries for optimistic locking
            baseDelay: 50, // Faster retry for reduced lock contention
            maxDelay: 1000,
            isolationLevel: 'ReadCommitted', // Changed from Serializable to prevent deadlocks
            tier,
            originalCost: userResult.cost,
            enableAuditLogging: true // Now handled asynchronously
          }
        );

        // Record metrics
        await monitor.recordMetric('user_processed', {
          userId: userStatus.userId,
          tier,
          filingsProcessed: userResult.filingsProcessed,
          cost: userResult.cost
        });

        return {
          success: true,
          userId: userStatus.userId,
          filingsProcessed: userResult?.filingsProcessed || 0,
          cost: validatedCost,
          budgetUpdate: updateResult ? {
            previousBudget: updateResult.previousBudget || 0,
            newBudget: updateResult.newBudget || 0,
            costAdded: validatedCost
          } : undefined
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let errorType = 'UNKNOWN_ERROR';
        
        // Categorize concurrency errors
        if (isConcurrencyError(error)) {
          errorType = 'CONCURRENCY_CONFLICT';
          cronLogger.warn(`Concurrency conflict processing user ${userStatus.userId}`, {
            error: errorMessage,
            tier,
            userStatus: userStatus.userId
          });
        } else if (errorMessage.includes('Budget limit exceeded')) {
          errorType = 'BUDGET_EXCEEDED';
          cronLogger.info(`User ${userStatus.userId} budget limit reached`, {
            tier,
            error: errorMessage
          });
        } else if (errorMessage.includes('Cost validation failed')) {
          errorType = 'COST_VALIDATION_FAILED';
          cronLogger.error(`Cost validation failed for user ${userStatus.userId}`, {
            tier,
            error: errorMessage
          });
        } else if (errorMessage.includes('Subscription tier mismatch')) {
          errorType = 'TIER_MISMATCH';
          cronLogger.warn(`Subscription tier changed during processing for user ${userStatus.userId}`, {
            tier,
            error: errorMessage
          });
        } else {
          cronLogger.error(`Unexpected error processing user ${userStatus.userId}`, {
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
    });
    
    processingPromises.push(...chunkPromises);
  }
  
  // Wait for all processing to complete
  const processingResults = await Promise.allSettled(processingPromises);
  
  // Aggregate results with comprehensive null safety
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
            case 'CONCURRENCY_CONFLICT':
              results.errorBreakdown.concurrencyConflicts++;
              break;
            case 'BUDGET_EXCEEDED':
              results.errorBreakdown.budgetExceeded++;
              break;
            case 'COST_VALIDATION_FAILED':
              results.errorBreakdown.costValidationFailed++;
              break;
            case 'TIER_MISMATCH':
              results.errorBreakdown.tierMismatch++;
              break;
            default:
              results.errorBreakdown.unknownErrors++;
          }
        } else {
          results.errorBreakdown.unknownErrors++;
        }
      }
    } catch (aggregationError) {
      cronLogger.error('Error during result aggregation', {
        error: aggregationError instanceof Error ? aggregationError.message : 'Unknown aggregation error',
        resultStatus: result?.status,
        resultValue: result?.status === 'fulfilled' ? result.value : undefined
      });
      results.errors++;
      results.errorBreakdown.unknownErrors++;
    }
  }

  return results;
}

/**
 * Process SEC filings for a specific user with tier-aware optimization
 */
async function processUserTierFilings(user: User, tier: string) {
  const result = {
    filingsProcessed: 0,
    cost: 0
  };

  // PRODUCTION IMPLEMENTATION: Process actual SEC filings for user
  try {
    // Validate user object structure
    if (!user || !user.id || !user.tickers) {
      cronLogger.error('Invalid user object passed to processUserTierFilings', {
        userId: user?.id || 'unknown',
        hasId: !!user?.id,
        hasTickers: !!user?.tickers,
        tickersType: typeof user?.tickers
      });
      return result;
    }

    // First validate all user tickers have valid CIKs with null safety
    let tickerValidations;
    try {
      tickerValidations = await validateUserTickers(user.id, user.tickers || []);
    } catch (validationError) {
      cronLogger.error(`Failed to validate tickers for user ${user.id}`, {
        error: validationError instanceof Error ? validationError.message : 'Unknown validation error',
        userId: user.id,
        tickerCount: user.tickers?.length || 0
      });
      return result;
    }
    const validTickers = (tickerValidations || []).filter(t => t && t.valid);
    
    if (validTickers.length === 0) {
      cronLogger.warn(`No valid tickers found for user ${user.id}`, {
        userId: user.id,
        totalTickers: user.tickers?.length || 0,
        invalidTickers: (tickerValidations || []).filter(t => t && !t.valid).map(t => t.symbol).filter(Boolean)
      });
      return result;
    }
    
    if (validTickers.length < (user.tickers?.length || 0)) {
      cronLogger.warn(`Some tickers invalid for user ${user.id}`, {
        userId: user.id,
        validCount: validTickers.length,
        totalCount: user.tickers?.length || 0,
        invalidTickers: (tickerValidations || []).filter(t => t && !t.valid).map(t => t.symbol).filter(Boolean)
      });
    }

    for (const tickerValidation of validTickers || []) {
      try {
        // Validate ticker validation object
        if (!tickerValidation || !tickerValidation.symbol) {
          cronLogger.warn('Invalid ticker validation object encountered', {
            userId: user.id,
            tickerValidation
          });
          continue;
        }

        // Find the original ticker object with null safety
        const originalTicker = (user.tickers || []).find(t => t && t.symbol === tickerValidation.symbol);
        if (!originalTicker) {
          cronLogger.warn(`Original ticker not found for ${tickerValidation.symbol}`, {
            userId: user.id,
            searchedSymbol: tickerValidation.symbol,
            availableSymbols: (user.tickers || []).map(t => t?.symbol).filter(Boolean)
          });
          continue;
        }

        // Get unprocessed filings for this ticker from Phase 1 (RSS monitoring)
        // This replaces the second call to checkTickerForNewFilings which was finding no "new" filings
        // because they were already detected and stored in the rssFilingCheck table during Phase 1
        cronLogger.debug(`Phase 2: Getting unprocessed filings for ${tickerValidation.symbol}`, {
          userId: user.id,
          cik: tickerValidation.cik
        });
        
        let newFilings;
        try {
          // Validate CIK exists before processing
          if (!tickerValidation.cik) {
            cronLogger.warn(`No CIK available for ${tickerValidation.symbol}, skipping`, {
              userId: user.id,
              ticker: tickerValidation.symbol
            });
            continue;
          }

          newFilings = await getUnprocessedFilingsForTicker(tickerValidation.symbol, user.id);
          
          // Ensure we got a valid array response
          if (!Array.isArray(newFilings)) {
            cronLogger.error(`Invalid response from getUnprocessedFilingsForTicker for ${tickerValidation.symbol}`, {
              userId: user.id,
              ticker: tickerValidation.symbol,
              responseType: typeof newFilings,
              response: newFilings
            });
            continue;
          }
          
        } catch (filingFetchError) {
          cronLogger.error(`Failed to get unprocessed filings for ${tickerValidation.symbol}`, {
            error: filingFetchError instanceof Error ? filingFetchError.message : 'Unknown error',
            userId: user.id,
            ticker: tickerValidation.symbol,
            errorStack: filingFetchError instanceof Error ? filingFetchError.stack : undefined
          });
          continue; // Skip this ticker and continue with next one
        }
        
        cronLogger.info(`Phase 2: Found ${newFilings.length} unprocessed filings for ${tickerValidation.symbol}`, {
          userId: user.id,
          filingsFound: (newFilings || []).map(f => ({
            accession: f?.accessionNumber || 'unknown',
            type: f?.filingType || 'unknown',
            date: f?.filingDate || 'unknown'
          })).filter(f => f.accession !== 'unknown')
        });
        
        for (const filing of newFilings || []) {
          try {
            // Validate filing object structure
            if (!filing || !filing.id || !filing.accessionNumber) {
              cronLogger.warn('Invalid filing object encountered', {
                userId: user.id,
                ticker: tickerValidation.symbol,
                filing: filing,
                hasId: !!filing?.id,
                hasAccessionNumber: !!filing?.accessionNumber
              });
              continue;
            }

            // Create a unique filing ID for transaction tracking
            const filingForProcessing = {
              id: filing.id, // Use database ID for transaction
              accessionNumber: filing.accessionNumber,
              formType: filing.formType || filing.filingType || 'Unknown',
              filingDate: filing.filingDate || new Date(),
              filingUrl: filing.filingUrl, 
              tickerData: {
                symbol: tickerValidation.symbol,
                cik: tickerValidation.cik,
                companyName: tickerValidation.companyName || originalTicker?.companyName || 'Unknown Company'
              }
            };

            // Process filing with full transaction boundaries
            const transactionResult = await FilingTransactionManager.processFilingWithTransaction(
              filing.id, // Use database ID instead of accession number
              user.id,
              async (tx) => {
                // Execute the actual filing processing within the transaction
                const processingResult = await processSecFilingWithinTransaction(
                  filingForProcessing,
                  user,
                  tier,
                  tx
                );
                
                if (processingResult.success) {
                  // Update filing as processed is already handled by the transaction manager
                  cronLogger.info(`Successfully processed filing ${filing.accessionNumber} for user ${user.id}`, {
                    ticker: tickerValidation.symbol,
                    cost: processingResult.cost
                  });
                  
                  return {
                    success: true,
                    cost: processingResult.cost || 0
                  };
                } else {
                  throw new Error(`Filing processing failed: ${processingResult.error || 'Unknown error'}`);
                }
              },
              {
                timeout: 60000, // 1 minute timeout for filing processing
                description: `Process filing ${filing.accessionNumber} for user ${user.id}`
              }
            );
            
            if (transactionResult.success && transactionResult.data) {
              result.filingsProcessed++;
              result.cost += transactionResult.data.cost;
              
              // Mark the filing as processed in the rssFilingCheck table
              try {
                await markFilingAsProcessedByAccession(
                  filing.accessionNumber, 
                  tickerValidation.symbol, 
                  user.id
                );
                cronLogger.debug(`Marked filing as processed: ${filing.accessionNumber} for ${tickerValidation.symbol}`, {
                  userId: user.id
                });
              } catch (markError) {
                // Log error but don't fail the entire processing - the filing was successfully processed
                cronLogger.warn(`Failed to mark filing as processed, but filing processing was successful`, {
                  filingId: filing.accessionNumber,
                  userId: user.id,
                  ticker: tickerValidation.symbol,
                  error: markError instanceof Error ? markError.message : 'Unknown error'
                });
              }
              
              cronLogger.info(`Filing processed successfully with transaction`, {
                filingId: filing.accessionNumber,
                userId: user.id,
                transactionId: transactionResult.transactionId,
                cost: transactionResult.data.cost
              });
            } else {
              cronLogger.error(`Filing transaction failed`, {
                filingId: filing.accessionNumber,
                userId: user.id,
                error: transactionResult.error?.message,
                transactionId: transactionResult.transactionId
              });
            }
            
            // Respect tier-based processing limits
            const maxFilings = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
            if (result.filingsProcessed >= maxFilings) {
              break;
            }
            
          } catch (filingError) {
            cronLogger.error(`Failed to process filing ${filing.accessionNumber}`, {
              error: filingError instanceof Error ? filingError.message : 'Unknown error',
              userId: user.id,
              ticker: tickerValidation.symbol,
              cik: tickerValidation.cik
            });
          }
        }
        
        // Break if we've hit the tier limit
        const maxFilings = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
        if (result.filingsProcessed >= maxFilings) {
          break;
        }
      } catch (tickerError) {
        cronLogger.error(`Failed to process ticker ${tickerValidation.symbol} for user ${user.id}`, {
          error: tickerError instanceof Error ? tickerError.message : 'Unknown error',
          userId: user.id,
          ticker: tickerValidation.symbol,
          cik: tickerValidation.cik
        });
      }
    }
    
  } catch (error) {
    cronLogger.error(`Failed to process SEC filings for user ${user.id}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      tier,
      tickerCount: user.tickers.length
    });
  }
  
  return result;
}

/**
 * Process SEC filing within a database transaction context
 */
async function processSecFilingWithinTransaction(
  filingForProcessing: {
    id: string;
    accessionNumber: string;
    formType: string;
    filingDate: Date;
    filingUrl?: string; // ✅ ADD THIS LINE
    tickerData: {
      symbol: string;
      cik: string;
      companyName: string;
    };
  },
  user: User,
  tier: string,
  tx: Prisma.TransactionClient
): Promise<{ success: boolean; cost?: number; error?: string }> {
  try {
    // PRODUCTION IMPLEMENTATION: Call actual summarization and email services
    const { generateAISummaryWithRetry } = await import('../../../../services/filing/summaryGenerationService');
    const { sendEmailSummary } = await import('../../../../services/filing/sendEmailSummary');
    
    cronLogger.info(`Processing filing ${filingForProcessing.accessionNumber} for user ${user.id} within transaction`, {
      tier,
      filingType: filingForProcessing.formType,
      userId: user.id,
      ticker: filingForProcessing.tickerData.symbol
    });

    // 1. Generate AI summary for the filing
    const summaryResult = await generateAISummaryWithRetry(
      '', // Content will be fetched within the service
      {
        accessionNumber: filingForProcessing.accessionNumber,
        formType: filingForProcessing.formType,
        filingDate: filingForProcessing.filingDate.toISOString()
      },
      {
        name: filingForProcessing.tickerData.companyName,
        ticker: filingForProcessing.tickerData.symbol
      },
      2 // max retries
    );

    const actualCost = summaryResult.cost || 0;

    // 2. Store the summary in database using transaction context
    try {
      const tickerRecord = await tx.ticker.findFirst({
        where: { symbol: filingForProcessing.tickerData.symbol }
      });

      if (tickerRecord) {
        await tx.summary.create({
          data: {
            tickerId: tickerRecord.id,
            filingType: filingForProcessing.formType,
            filingDate: filingForProcessing.filingDate, // ✅ ADD THIS LINE
            filingUrl: filingForProcessing.filingUrl,   // ✅ ADD THIS LINE
            summaryText: summaryResult.summary,
            summaryJSON: {
              ticker: filingForProcessing.tickerData.symbol,
              accessionNumber: filingForProcessing.accessionNumber,
              filingType: filingForProcessing.formType,
              summaryText: summaryResult.summary,
              keyPoints: summaryResult.keyPoints || [],
              cost: actualCost,
              inputTokens: summaryResult.inputTokens || 0,
              outputTokens: summaryResult.outputTokens || 0
            },
            tokensUsed: summaryResult.tokensUsed || 0,
            cost: actualCost,
            sentToUser: false
          }
        });

        cronLogger.info(`Summary stored for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          cost: actualCost
        });
      }
    } catch (dbError) {
      cronLogger.error(`Failed to store summary for filing ${filingForProcessing.accessionNumber}`, { 
        error: dbError,
        userId: user.id 
      });
      // Don't fail the whole process for DB storage errors in transaction context
      // The transaction will be rolled back if this function throws
    }

    // 3. Send email notification if user has email
    if (user.email) {
      try {
        const emailResult = await sendEmailSummary(
          user.email,
          [filingForProcessing.tickerData.symbol],
          false // not debug mode
        );
        
        if (emailResult.success) {
          cronLogger.info(`Email sent successfully for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            email: user.email,
            ticker: filingForProcessing.tickerData.symbol
          });
        } else {
          cronLogger.warn(`Email sending failed for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            email: user.email,
            error: emailResult.error
          });
        }
      } catch (emailError) {
        cronLogger.error(`Email service error for filing ${filingForProcessing.accessionNumber}`, {
          error: emailError,
          userId: user.id,
          email: user.email
        });
        // Don't fail the whole process for email errors
      }
    } else {
      cronLogger.debug(`No email address for user ${user.id}, skipping email notification`);
    }
    
    cronLogger.info(`Successfully processed filing ${filingForProcessing.accessionNumber} for user ${user.id} within transaction`, {
      tier,
      filingType: filingForProcessing.formType,
      actualCost,
      summaryGenerated: !!summaryResult.summary
    });
    
    return {
      success: true,
      cost: actualCost
    };
    
  } catch (error) {
    cronLogger.error(`Failed to process filing ${filingForProcessing.accessionNumber} within transaction`, { 
      error,
      userId: user.id,
      tier,
      filingType: filingForProcessing.formType
    });
    return {
      success: false,
      cost: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}



/**
 * Core SEC filing monitoring - always runs regardless of market hours
 * SEC filings can be published 24/7 including weekends and holidays
 */
async function runSecFilingMonitoring(monitor: CronJobMonitor) {
  try {
    cronLogger.info('Starting core SEC filing monitoring phase');
    
    // Phase 1: Check for new filings via RSS feeds
    const activeTickers = await getActiveTickersForMonitoring();
    
    if (activeTickers.length === 0) {
      cronLogger.info('No active tickers to monitor');
      return;
    }
    
    cronLogger.info(`Monitoring ${activeTickers.length} active tickers for new SEC filings`);
    
    let newFilingsFound = 0;
    const MAX_CONCURRENT_RSS_CHECKS = 3;
    
    // Process tickers in batches to avoid overwhelming SEC servers
    for (let i = 0; i < activeTickers.length; i += MAX_CONCURRENT_RSS_CHECKS) {
      const batch = activeTickers.slice(i, i + MAX_CONCURRENT_RSS_CHECKS);
      
      const batchPromises = batch.map(async (ticker) => {
        try {
          const newFilings = await checkTickerForNewFilings(ticker);
          newFilingsFound += newFilings.length;
          
          cronLogger.debug(`Checked ${ticker.symbol}: ${newFilings.length} new filings`);
          
        } catch (error) {
          cronLogger.error(`Failed to check ticker ${ticker.symbol}`, { error });
          await monitor.updateMetrics({ errorCount: 1 });
        }
      });

      await Promise.all(batchPromises);
      
      // Brief pause between batches to be respectful to SEC servers
      if (i + MAX_CONCURRENT_RSS_CHECKS < activeTickers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Update monitoring metrics
    await monitor.updateMetrics({
      tickersChecked: activeTickers.length,
      newFilingsFound
    });
    
    cronLogger.info('SEC filing RSS monitoring completed', {
      tickersChecked: activeTickers.length,
      newFilingsFound
    });
    
  } catch (error) {
    cronLogger.error('SEC filing monitoring failed', { error });
    await monitor.updateMetrics({ errorCount: 1 });
    throw error;
  }
}


/**
 * Reset monthly budgets (called from separate cron or admin endpoint)
 */
export async function resetMonthlyBudgets() {
  try {
    const resetCount = await prisma.user.updateMany({
      data: {
        budgetUsed: 0,
        budgetResetAt: new Date()
      }
    });
    
    cronLogger.info(`Monthly processing budgets reset for ${resetCount.count} users`);
    return resetCount.count;
  } catch (error) {
    cronLogger.error('Failed to reset monthly budgets', { error });
    throw error;
  }
}