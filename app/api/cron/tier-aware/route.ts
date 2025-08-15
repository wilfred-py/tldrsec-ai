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

const prisma = getPrismaClient();
const cronLogger = logger.child('tier-aware-cron');

// Processing batch sizes per tier
const TIER_BATCH_SIZES = {
  INSTITUTION: 10,
  ENTERPRISE: 8, 
  PROFESSIONAL: 5,
  FREE: 3
} as const;

// Daily cost budgets (in USD)
const DAILY_COST_LIMITS = {
  INSTITUTION: 2.50,
  ENTERPRISE: 1.25,
  PROFESSIONAL: 0.60,
  FREE: 0.20
} as const;

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

    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      cronLogger.warn('Unauthorized cron request');
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

  // Limit batch size
  const batchUsers = userStatuses.slice(0, batchSize);
  
  for (const userStatus of batchUsers) {
    try {
      // Find full user data
      const fullUser = allUsers.find(u => u.id === userStatus.userId);
      if (!fullUser) {
        cronLogger.warn(`User ${userStatus.userId} not found in full user data`);
        continue;
      }

      // Process user's SEC filings
      const userResult = await processUserTierFilings(fullUser, tier);
      
      // Update user's processing timestamp
      await prisma.user.update({
        where: { id: userStatus.userId },
        data: {
          lastCronProcessed: new Date(),
          budgetUsed: {
            increment: userResult.cost
          }
        }
      });

      results.processed++;
      results.filings += userResult.filingsProcessed;
      results.cost += userResult.cost;

      // Record metrics
      await monitor.recordMetric('user_processed', {
        userId: userStatus.userId,
        tier,
        filingsProcessed: userResult.filingsProcessed,
        cost: userResult.cost
      });

    } catch (error) {
      results.errors++;
      cronLogger.error(`Failed to process user ${userStatus.userId}`, {
        error,
        tier
      });
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

  // For now, simulate processing based on tier
  // In a real implementation, this would integrate with existing SEC filing logic
  const tickerCount = user.tickers.length;
  const maxFilings = TIER_BATCH_SIZES[tier as keyof typeof TIER_BATCH_SIZES] || 3;
  
  // Simulate tier-based processing intensity
  const filingsToProcess = Math.min(tickerCount * 2, maxFilings);
  const costPerFiling = DAILY_COST_LIMITS[tier as keyof typeof DAILY_COST_LIMITS] / 10; // Rough estimate
  
  result.filingsProcessed = filingsToProcess;
  result.cost = filingsToProcess * costPerFiling;
  
  cronLogger.debug(`Simulated processing for ${tier} user ${user.id}`, {
    tickerCount,
    filingsProcessed: result.filingsProcessed,
    estimatedCost: result.cost
  });
  
  return result;
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