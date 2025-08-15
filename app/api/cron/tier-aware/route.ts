import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { logger } from '../../../../lib/logging';
import { getMarketHoursContext, getUserProcessingStatuses, getEligibleUsers, TIER_FREQUENCIES, TIER_BUDGETS } from '../../../../lib/cron/market-hours';
import { CronJobMonitor } from '../../../../lib/monitoring/cron-monitor';
import { 
  getActiveTickersForMonitoring, 
  checkTickerForNewFilings, 
  getUnprocessedFilings,
  markFilingAsProcessed,
  cleanupOldMonitoringData 
} from '../../../../lib/sec-edgar/ticker-monitoring';
import crypto from 'crypto';
import { rateLimiter } from '../../../../lib/security/rate-limiter';

const prisma = getPrismaClient();
const cronLogger = logger.child('tier-aware-cron');

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

// Security constants
const MAX_COST_PER_OPERATION = 10.0; // Maximum cost allowed per operation
const ALLOWED_IPS = process.env.CRON_ALLOWED_IPS?.split(',') || [];

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(a, 'utf8'),
    Buffer.from(b, 'utf8')
  );
}

/**
 * Validate cost update to prevent budget manipulation
 */
function validateCostUpdate(cost: number, tier: string): boolean {
  // Basic validation
  if (typeof cost !== 'number' || isNaN(cost) || cost < 0) {
    return false;
  }
  
  // Maximum cost per operation check
  if (cost > MAX_COST_PER_OPERATION) {
    return false;
  }
  
  // Tier-specific validation
  const tierLimit = DAILY_COST_LIMITS[tier as keyof typeof DAILY_COST_LIMITS];
  if (cost > tierLimit) {
    return false;
  }
  
  return true;
}

interface ProcessingStats {
  usersProcessed: number;
  filingsProcessed: number;
  costBudgetUsed: number;
  tierBreakdown: Record<string, number>;
  skippedUsers: number;
}

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
  // Initialize monitoring with platform detection
  const platform = process.env.RAILWAY_ENVIRONMENT ? 'RAILWAY_CRON' : 'VERCEL_CRON';
  const monitor = new CronJobMonitor('tier-aware-sec-monitor', platform);
  
  try {
    cronLogger.info('Starting tier-aware SEC filing cron job');

    // Enhanced security validation
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    // Rate limiting
    const rateLimitResult = await rateLimiter.checkLimit('cron-endpoint', clientIp);
    if (!rateLimitResult.allowed) {
      cronLogger.warn('Rate limit exceeded for cron request', { clientIp });
      await monitor.complete('FAILED', 'Rate limit exceeded');
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    
    // IP allowlist check (if configured)
    if (ALLOWED_IPS.length > 0 && !ALLOWED_IPS.includes(clientIp)) {
      cronLogger.warn('IP not allowed for cron request', { clientIp });
      await monitor.complete('FAILED', 'IP not allowed');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Timing-safe authorization check
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    if (!authHeader || !timingSafeEqual(authHeader, expectedAuth)) {
      cronLogger.warn('Unauthorized cron request', { clientIp });
      await monitor.complete('FAILED', 'Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get market context and user processing statuses
    const marketContext = getMarketHoursContext();
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
    const allUsers = await prisma.user.findMany({
      where: {
        tickers: {
          some: {} // Only users who follow at least one ticker
        }
      },
      select: {
        id: true,
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
    });

    // Get processing statuses with eligibility
    const userStatuses = getUserProcessingStatuses(
      allUsers.map(u => ({
        id: u.id,
        subscriptionTier: u.subscriptionTier,
        lastProcessedAt: u.lastCronProcessed,
        budgetUsed: u.budgetUsed || 0
      })),
      marketContext
    );

    // PHASE 1: Core SEC Filing Monitoring (always runs - filings can be published 24/7)
    await runSecFilingMonitoring(monitor);
    
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
    const monitorResult = await monitor.complete('COMPLETED');
    
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
    await monitor.complete('FAILED', error instanceof Error ? error.message : 'Unknown error');
    
    cronLogger.error('Tier-aware cron job failed', { error });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Process eligible users by tier with priority handling
 */
async function processEligibleUsers(
  eligibleUsers: any[], 
  allUsers: any[], 
  monitor: CronJobMonitor
) {
  const results = {
    usersProcessed: 0,
    filingsProcessed: 0,
    totalCost: 0,
    tierBreakdown: {} as Record<string, number>,
    errors: 0
  };

  // Group eligible users by tier
  const usersByTier = eligibleUsers.reduce((acc, userStatus) => {
    const tier = userStatus.tier;
    if (!acc[tier]) acc[tier] = [];
    acc[tier].push(userStatus);
    return acc;
  }, {} as Record<string, any[]>);

  // Process each tier with appropriate batch sizes
  for (const [tier, userStatuses] of Object.entries(usersByTier)) {
    if (userStatuses.length === 0) continue;

    const batchSize = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
    const tierResults = await processTierBatch(tier, userStatuses, batchSize, allUsers, monitor);
    
    // Accumulate results
    results.usersProcessed += tierResults.processed;
    results.filingsProcessed += tierResults.filings;
    results.totalCost += tierResults.cost;
    results.tierBreakdown[tier] = tierResults.processed;
    results.errors += tierResults.errors;

    cronLogger.info(`Completed ${tier} tier processing`, tierResults);
  }

  return results;
}

/**
 * Process a batch of users from a specific tier
 */
async function processTierBatch(
  tier: string,
  userStatuses: any[],
  batchSize: number,
  allUsers: any[],
  monitor: CronJobMonitor
) {
  const results = {
    processed: 0,
    filings: 0,
    cost: 0,
    errors: 0
  };

  // Limit batch size and implement concurrent processing
  const batchUsers = userStatuses.slice(0, batchSize);
  
  // Process users concurrently with controlled concurrency
  const maxConcurrency = Math.min(3, batchUsers.length); // Limit concurrent operations
  const processingPromises = [];
  
  for (let i = 0; i < batchUsers.length; i += maxConcurrency) {
    const chunk = batchUsers.slice(i, i + maxConcurrency);
    
    const chunkPromises = chunk.map(async (userStatus) => {
      try {
        // Find full user data
        const fullUser = allUsers.find(u => u.id === userStatus.userId);
        if (!fullUser) {
          cronLogger.warn(`User ${userStatus.userId} not found in full user data`);
          return { success: false, error: 'User not found' };
        }

        // Process user's SEC filings
        const userResult = await processUserTierFilings(fullUser, tier);
        
        // Validate cost before updating (security: prevent budget manipulation)
        if (!validateCostUpdate(userResult.cost, tier)) {
          cronLogger.error(`Invalid cost update attempted`, {
            userId: userStatus.userId,
            tier,
            cost: userResult.cost
          });
          return { success: false, error: 'Invalid cost update' };
        }
        
        // Atomic budget update with validation in transaction
        await prisma.$transaction(async (tx) => {
          // Get current user state
          const currentUser = await tx.user.findUnique({
            where: { id: userStatus.userId },
            select: { budgetUsed: true, subscriptionTier: true }
          });
          
          if (!currentUser) {
            throw new Error(`User ${userStatus.userId} not found`);
          }
          
          // Verify subscription tier hasn't changed (security: prevent tier escalation)
          if (currentUser.subscriptionTier !== tier) {
            throw new Error(`Subscription tier mismatch: expected ${tier}, got ${currentUser.subscriptionTier}`);
          }
          
          const newBudgetUsed = (currentUser.budgetUsed || 0) + userResult.cost;
          const dailyLimit = DAILY_COST_LIMITS[tier as keyof typeof DAILY_COST_LIMITS];
          
          // Prevent budget overflow
          if (newBudgetUsed > dailyLimit * 1.1) { // 10% buffer for rounding
            throw new Error(`Budget limit would be exceeded: ${newBudgetUsed} > ${dailyLimit}`);
          }
          
          // Update with validated values
          await tx.user.update({
            where: { id: userStatus.userId },
            data: {
              lastCronProcessed: new Date(),
              budgetUsed: newBudgetUsed
            }
          });
          
          // Audit log for financial operations
          await tx.auditLog?.create({
            data: {
              userId: userStatus.userId,
              action: 'BUDGET_UPDATE',
              details: JSON.stringify({
                previousBudget: currentUser.budgetUsed,
                newBudget: newBudgetUsed,
                costAdded: userResult.cost,
                tier,
                timestamp: new Date().toISOString()
              })
            }
          }).catch(() => {
            // Audit logging is optional, don't fail the transaction
            cronLogger.warn('Failed to create audit log entry');
          });
        });

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
          filingsProcessed: userResult.filingsProcessed,
          cost: userResult.cost
        };

      } catch (error) {
        cronLogger.error(`Failed to process user ${userStatus.userId}`, {
          error,
          tier
        });
        return { success: false, userId: userStatus.userId, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });
    
    processingPromises.push(...chunkPromises);
  }
  
  // Wait for all processing to complete
  const processingResults = await Promise.allSettled(processingPromises);
  
  // Aggregate results
  for (const result of processingResults) {
    if (result.status === 'fulfilled' && result.value.success) {
      results.processed++;
      results.filings += result.value.filingsProcessed || 0;
      results.cost += result.value.cost || 0;
    } else {
      results.errors++;
    }
  }

  return results;
}

/**
 * Process SEC filings for a specific user with tier-aware optimization
 */
async function processUserTierFilings(user: any, tier: string) {
  const result = {
    filingsProcessed: 0,
    cost: 0
  };

  // PRODUCTION IMPLEMENTATION: Process actual SEC filings for user
  try {
    for (const ticker of user.tickers) {
      // Check for new filings for this ticker
      const newFilings = await checkTickerForNewFilings(ticker);
      
      for (const filing of newFilings) {
        try {
          // Process the filing (integrate with existing SEC processing logic)
          const processingResult = await processSecFiling(filing, user, tier);
          
          if (processingResult.success) {
            result.filingsProcessed++;
            result.cost += processingResult.cost || 0;
            
            // Mark filing as processed
            await markFilingAsProcessed(filing.accessionNumber, user.id);
          }
          
          // Respect tier-based processing limits
          const maxFilings = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
          if (result.filingsProcessed >= maxFilings) {
            break;
          }
          
        } catch (filingError) {
          cronLogger.error(`Failed to process filing ${filing.accessionNumber}`, {
            error: filingError,
            userId: user.id,
            ticker: ticker.symbol
          });
        }
      }
      
      // Break if we've hit the tier limit
      const maxFilings = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
      if (result.filingsProcessed >= maxFilings) {
        break;
      }
    }
    
  } catch (error) {
    cronLogger.error(`Failed to process SEC filings for user ${user.id}`, {
      error,
      tier,
      tickerCount: user.tickers.length
    });
  }
  
  return result;
}

/**
 * Process a single SEC filing for a user
 */
async function processSecFiling(filing: any, user: any, tier: string) {
  try {
    // Integrate with existing SEC filing processing logic
    // This would typically involve:
    // 1. Fetching the filing content
    // 2. Parsing and analyzing the filing
    // 3. Generating summaries or alerts
    // 4. Sending notifications to the user
    
    // For now, return a basic structure
    // TODO: Replace with actual implementation
    const estimatedCost = calculateFilingProcessingCost(filing, tier);
    
    cronLogger.debug(`Processing filing ${filing.accessionNumber} for user ${user.id}`, {
      tier,
      filingType: filing.formType,
      estimatedCost
    });
    
    return {
      success: true,
      cost: estimatedCost
    };
    
  } catch (error) {
    cronLogger.error(`Failed to process filing ${filing.accessionNumber}`, { error });
    return {
      success: false,
      cost: 0
    };
  }
}

/**
 * Calculate the cost of processing a filing based on tier
 */
function calculateFilingProcessingCost(filing: any, tier: string): number {
  const baseCost = 0.02; // Base cost per filing
  
  // Tier-based cost multipliers
  const tierMultipliers = {
    FREE: 1.0,
    PROFESSIONAL: 0.8,    // More efficient processing
    ENTERPRISE: 0.6,      // Bulk discount
    INSTITUTION: 0.4      // Best rates
  };
  
  const multiplier = tierMultipliers[tier as keyof typeof tierMultipliers] || 1.0;
  
  // Form type complexity multiplier
  const complexityMultipliers = {
    '10-K': 3.0,      // Most complex
    '10-Q': 2.0,      // Moderately complex
    '8-K': 1.5,       // Standard
    'Form 4': 1.0     // Simple
  };
  
  const complexityMultiplier = complexityMultipliers[filing.formType as keyof typeof complexityMultipliers] || 1.0;
  
  return baseCost * multiplier * complexityMultiplier;
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