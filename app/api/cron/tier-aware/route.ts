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
  const startTime = Date.now();
  // Generate secure execution ID
  const generateSecureExecutionId = (): string => {
    const timestamp = Date.now();
    const randomBytes = Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
    const randomHex = randomBytes.toString('hex').substring(0, 16);
    return `api-${timestamp}-${randomHex}`;
  };
  
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId();
  
  // Timeout configuration based on Cloudflare Worker headers with input validation
  const parseTimeoutHeader = (header: string | null, defaultValue: number): number => {
    if (!header) return defaultValue;
    const parsed = parseInt(header);
    if (isNaN(parsed) || parsed < 0) return defaultValue;
    return Math.min(parsed, 600000); // Cap at 10 minutes maximum
  };
  
  const workerTimeoutMs = parseTimeoutHeader(request.headers.get('x-worker-timeout'), 480000); // 8 minutes default
  const effectiveTimeoutMs = parseTimeoutHeader(request.headers.get('x-effective-timeout'), 420000); // 7 minutes default
  const timeoutBuffer = 30000; // 30 seconds buffer for cleanup
  
  cronLogger.info(`[${executionId}] Starting tier-aware cron with timeout protection`, {
    workerTimeoutMs,
    effectiveTimeoutMs,
    timeoutBuffer
  });
  
  // Set up timeout protection
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    cronLogger.warn(`[${executionId}] Approaching timeout, initiating graceful shutdown`);
    timeoutController.abort(new DOMException('Execution timeout approaching', 'TimeoutError'));
  }, effectiveTimeoutMs - timeoutBuffer);
  
  // DEBUG: Start logging immediately
  cronLogger.debug(`[${executionId}] Checkpoint 0: GET function entry`);
  
  // Detect platform and initialize monitoring
  const platform = CronAuthService.detectPlatform();
  cronLogger.debug(`[${executionId}] Checkpoint 0.1: Platform determined`, { platform });
  
  let monitor: CronJobMonitor | undefined;
  
  try {
    cronLogger.debug(`[${executionId}] Checkpoint 0.2: About to create CronJobMonitor`);
    monitor = await CronJobMonitor.create('tier-aware-sec-monitor', platform);
    cronLogger.debug(`[${executionId}] Checkpoint 0.3: CronJobMonitor created successfully`);
  } catch (initError) {
    clearTimeout(timeoutId);
    cronLogger.error(`[${executionId}] Failed to initialize cron job monitor`, { error: initError });
    return NextResponse.json({
      success: false,
      error: 'Failed to initialize monitoring',
      executionId,
      duration: Date.now() - startTime
    }, { status: 500 });
  }

  try {
    cronLogger.info(`[${executionId}] Starting tier-aware SEC filing cron job with bulletproof duplicate email prevention`);
    cronLogger.debug(`[${executionId}] Checkpoint 1: Route function started with enhanced security features`);

    // Check if we're already approaching timeout
    const checkTimeRemaining = () => {
      const elapsed = Date.now() - startTime;
      const remaining = effectiveTimeoutMs - elapsed;
      return { elapsed, remaining, shouldContinue: remaining > timeoutBuffer };
    };

    // STEP 1: Authentication & Security Validation
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      clearTimeout(timeoutId);
      
      // Distinguish between server configuration errors and authentication failures
      const isConfigurationError = authResult.error?.includes('not properly configured');
      
      if (isConfigurationError) {
        cronLogger.error(`[${executionId}] Server configuration error`, { 
          error: authResult.error,
          clientIP: authResult.clientIP 
        });
        if (monitor) await monitor.complete(CronJobStatus.FAILED, 'Server configuration error');
        
        return NextResponse.json({
          success: false,
          error: 'Server configuration error',
          executionId,
          duration: Date.now() - startTime
        }, { status: 500 });
      } else {
        cronLogger.warn(`[${executionId}] Authentication failed`, { 
          error: authResult.error,
          clientIP: authResult.clientIP 
        });
        if (monitor) await monitor.complete(CronJobStatus.FAILED, authResult.error || 'Authentication failed');
        
        return NextResponse.json({
          success: false,
          error: authResult.error || 'Authentication failed',
          executionId,
          duration: Date.now() - startTime
        }, { 
          status: authResult.error?.includes('Rate limit') ? 429 : 
                 authResult.error?.includes('IP not allowed') ? 403 : 401
        });
      }
    }

    cronLogger.info(`[${executionId}] Authentication validated successfully`, {
      clientIP: authResult.clientIP,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    // Check timeout after auth
    let timeCheck = checkTimeRemaining();
    if (!timeCheck.shouldContinue) {
      throw new Error(`Timeout approaching after authentication: ${timeCheck.remaining}ms remaining`);
    }

    // STEP 2: Get Market Context and User Eligibility
    cronLogger.debug(`[${executionId}] Checkpoint 2: Starting market context retrieval`);
    const marketContext = getMarketHoursContext();
    cronLogger.debug(`[${executionId}] Checkpoint 3: Market context retrieved successfully`);
    
    cronLogger.info(`[${executionId}] Processing during ${marketContext.isMarketHours ? 'market' : 'off'} hours`, {
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

    // Check timeout before expensive operations
    timeCheck = checkTimeRemaining();
    if (!timeCheck.shouldContinue) {
      throw new Error(`Timeout approaching before user processing: ${timeCheck.remaining}ms remaining`);
    }

    // Get eligible users for processing with timeout awareness
    cronLogger.debug(`[${executionId}] Checkpoint 4: Getting eligible users for processing`);
    const maxUsersForTimeRemaining = Math.min(100, Math.floor(timeCheck.remaining / 60000) * 10); // ~10 users per minute
    
    const { allUsers, eligibleUsers } = await CronUserProcessingService.getEligibleUsersForProcessing(
      marketContext,
      {
        maxUsersPerCycle: maxUsersForTimeRemaining,
        respectBudgetLimits: true,
        budgetThreshold: 90
      }
    );
    cronLogger.debug(`[${executionId}] Checkpoint 5: User eligibility check completed`, {
      maxUsersForTimeRemaining,
      eligibleUsers: eligibleUsers.length
    });

    // STEP 3: Core SEC Filing Monitoring (always runs - filings can be published 24/7)
    cronLogger.debug(`[${executionId}] Checkpoint 6: Starting SEC filing monitoring`);
    const filingMonitoringResults = await Promise.race([
      CronSecFilingService.runSecFilingMonitoring(monitor),
      new Promise<never>((_, reject) => {
        timeoutController.signal.addEventListener('abort', () => {
          reject(new Error('SEC filing monitoring aborted due to timeout'));
        });
      })
    ]);
    cronLogger.debug(`[${executionId}] Checkpoint 7: SEC filing monitoring completed`);

    // Check timeout before user processing
    timeCheck = checkTimeRemaining();
    if (!timeCheck.shouldContinue) {
      cronLogger.warn(`[${executionId}] Skipping user processing due to timeout constraint`, {
        remainingTime: timeCheck.remaining,
        eligibleUsers: eligibleUsers.length
      });
      
      // Return partial results
      const partialResults = {
        filingMonitoring: filingMonitoringResults,
        usersProcessed: 0,
        emailsSent: 0,
        totalCostUSD: 0,
        skippedDueToTimeout: true,
        timeConstraint: {
          elapsed: timeCheck.elapsed,
          remaining: timeCheck.remaining
        }
      };

      const monitorResult = monitor ? 
        await monitor.complete(CronJobStatus.SUCCESS, 'Partial completion due to timeout') : 
        { executionId: 'test', duration: timeCheck.elapsed };

      clearTimeout(timeoutId);
      return NextResponse.json({
        success: true,
        executionId: monitorResult.executionId,
        duration: monitorResult.duration,
        marketContext: {
          isMarketHours: marketContext.isMarketHours,
          isMarketDay: marketContext.isMarketDay
        },
        results: partialResults,
        warning: 'Processing completed partially due to timeout constraints'
      });
    }

    // STEP 4: Process Eligible Users with Filing Processing (with timeout protection)
    cronLogger.debug(`[${executionId}] Checkpoint 8: Starting user processing pipeline`);
    const processingResults = await Promise.race([
      CronUserProcessingService.processEligibleUsers(
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
      ),
      new Promise<never>((_, reject) => {
        timeoutController.signal.addEventListener('abort', () => {
          reject(new Error('User processing aborted due to timeout'));
        });
      })
    ]);
    cronLogger.debug(`[${executionId}] Checkpoint 9: User processing pipeline completed`);

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
    
    clearTimeout(timeoutId);
    
    cronLogger.info(`[${executionId}] Tier-aware cron job completed successfully with bulletproof duplicate prevention`, {
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
    clearTimeout(timeoutId);
    
    // Only call monitor.complete if monitor was successfully initialized
    if (monitor) {
      await monitor.complete(CronJobStatus.FAILED, error instanceof Error ? error.message : 'Unknown error');
    }
    
    const errorType = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'ERROR';
    
    // Safe error message for external consumption (no stack traces or sensitive info)
    const safeErrorMessage = (() => {
      if (errorType === 'TIMEOUT') return 'Request timeout';
      if (error instanceof Error) {
        // Only include safe error messages
        if (error.message.includes('Database')) return 'Database temporarily unavailable';
        if (error.message.includes('Network')) return 'Network error';
        if (error.message.includes('Authentication')) return 'Authentication failed';
        return 'Internal processing error';
      }
      return 'Unknown error occurred';
    })();
    
    // Log full error details internally (with stack trace) but don't expose to client
    cronLogger.error(`[${executionId}] Tier-aware cron job failed`, { 
      error,
      errorType,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime
    });

    return NextResponse.json({
      success: false,
      error: safeErrorMessage,
      errorType,
      executionId,
      duration: Date.now() - startTime
    }, { status: errorType === 'TIMEOUT' ? 408 : 500 });
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