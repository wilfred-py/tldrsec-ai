/**
 * Tier-aware SEC filing monitoring cron job (Refactored)
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

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { getMarketHoursContext } from '../../../../lib/cron/market-hours';
import { CronJobMonitor } from '../../../../lib/monitoring/cron-monitor';
import { CronJobStatus } from '../../../../types/cron';

// Import our new service layer
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { CronUserProcessingService } from '../../../../lib/cron/user-processing-service';
import { CronSecFilingService } from '../../../../lib/cron/sec-filing-service';
import { CronFilingProcessor } from '../../../../lib/cron/filing-processor';
import type { CronResults } from '../../../../lib/cron/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cronLogger = logger.child('tier-aware-cron');

/**
 * Main cron endpoint handler - now serves as a clean orchestrator
 */
export async function GET(request: NextRequest) {
  // DEBUG: Start logging immediately
  cronLogger.debug('Checkpoint 0: GET function entry');
  
  // Detect platform and initialize monitoring
  const platform = CronAuthService.detectPlatform();
  cronLogger.debug('Checkpoint 0.1: Platform determined', { platform });
  
  let monitor: CronJobMonitor | undefined;
  
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
    cronLogger.info('Starting tier-aware SEC filing cron job with bulletproof duplicate email prevention');
    cronLogger.debug('Checkpoint 1: Route function started with enhanced security features');

    // STEP 1: Authentication & Security Validation
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      cronLogger.warn('Authentication failed', { 
        error: authResult.error,
        clientIP: authResult.clientIP 
      });
      if (monitor) await monitor.complete(CronJobStatus.FAILED, authResult.error || 'Authentication failed');
      
      return NextResponse.json({
        success: false,
        error: authResult.error || 'Authentication failed'
      }, { 
        status: authResult.error?.includes('Rate limit') ? 429 : 
               authResult.error?.includes('IP not allowed') ? 403 : 401
      });
    }

    cronLogger.info('Authentication validated successfully', {
      clientIP: authResult.clientIP,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    // STEP 2: Get Market Context and User Eligibility
    cronLogger.debug('Checkpoint 2: Starting market context retrieval');
    const marketContext = getMarketHoursContext();
    cronLogger.debug('Checkpoint 3: Market context retrieved successfully');
    
    cronLogger.info(`Processing during ${marketContext.isMarketHours ? 'market' : 'off'} hours`, {
      isMarketDay: marketContext.isMarketDay,
      isHoliday: marketContext.isHoliday
    });

    // Record market context in monitoring
    if (monitor) {
      await monitor.recordMetric('market_context', {
        isMarketHours: marketContext.isMarketHours,
        isMarketDay: marketContext.isMarketDay,
        isHoliday: marketContext.isHoliday,
        currentTime: marketContext.currentTime
      });
    }

    // Get eligible users for processing
    cronLogger.debug('Checkpoint 4: Getting eligible users for processing');
    const { allUsers, eligibleUsers } = await CronUserProcessingService.getEligibleUsersForProcessing(
      marketContext,
      {
        maxUsersPerCycle: 100,
        respectBudgetLimits: true,
        budgetThreshold: 90
      }
    );
    cronLogger.debug('Checkpoint 5: User eligibility check completed');

    // STEP 3: Core SEC Filing Monitoring (always runs - filings can be published 24/7)
    cronLogger.debug('Checkpoint 6: Starting SEC filing monitoring');
    const filingMonitoringResults = await CronSecFilingService.runSecFilingMonitoring(monitor);
    cronLogger.debug('Checkpoint 7: SEC filing monitoring completed');

    // STEP 4: Process Eligible Users with Filing Processing
    cronLogger.debug('Checkpoint 8: Starting user processing pipeline');
    const processingResults = await CronUserProcessingService.processEligibleUsers(
      eligibleUsers,
      allUsers,
      monitor,
      // Filing processor function - bridges the service layers
      async (user, tier, userFilingResults) => {
        if (userFilingResults) {
          // Use optimized deduplication processing
          return await CronFilingProcessor.processUserWithDeduplicatedFilings(
            user,
            tier,
            userFilingResults
          );
        } else {
          // Fallback to original processing method
          return await CronFilingProcessor.processUserTierFilings(user, tier);
        }
      }
    );
    cronLogger.debug('Checkpoint 9: User processing pipeline completed');

    // STEP 5: Prepare Final Results
    const results: CronResults & {
      filingMonitoring: {
        tickersChecked: number;
        newFilingsFound: number;
        errors: number;
      };
    } = {
      ...processingResults,
      filingMonitoring: filingMonitoringResults
    };

    // Complete monitoring
    const monitorResult = monitor ? 
      await monitor.complete(CronJobStatus.SUCCESS) : 
      { executionId: 'test', duration: 0 };
    
    cronLogger.info('Tier-aware cron job completed successfully with bulletproof duplicate prevention', {
      ...results,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      duplicatePreventionActive: true
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
    // Only call monitor.complete if monitor was successfully initialized
    if (monitor) {
      await monitor.complete(CronJobStatus.FAILED, error instanceof Error ? error.message : 'Unknown error');
    }
    
    cronLogger.error('Tier-aware cron job failed', { 
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Reset monthly budgets (called from separate cron or admin endpoint)
 * Extracted utility function - kept in route file for backward compatibility
 */
export async function resetMonthlyBudgets() {
  try {
    const { getPrismaClient } = await import('../../../../lib/db/prisma');
    const prisma = getPrismaClient();
    
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