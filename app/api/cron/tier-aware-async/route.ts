/**
 * Tier-aware SEC filing monitoring cron job with Async Processing (Phase 2)
 * 
 * Enhanced Features:
 * 1. Immediate HTTP response with job tracking
 * 2. Background AI processing via job queue
 * 3. Event-driven architecture for <1% timeout rate
 * 4. Maintains compatibility with existing tier system
 * 5. Webhook notifications for completion
 * 
 * Runs every 10 minutes with async processing for scalability
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging/index';
import { getMarketHoursContext } from '../../../../lib/cron/market-hours';
import { CronJobMonitor } from '../../../../lib/monitoring/cron-monitor';
// import { CronJobStatus } from '../../../../types/cron'; // TODO: Add back when needed
import { generateSecureExecutionId } from '../../../../lib/security/secure-random';

// Import our enhanced async services
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { CronUserProcessingService } from '../../../../lib/cron/user-processing-service';
import { CronSecFilingService } from '../../../../lib/cron/sec-filing-service';
import { AsyncResponseService } from '../../../../lib/cron/async-response-service';
// Note: Imports will be used dynamically to avoid unused import warnings
// import { AsyncFilingProcessor } from '../../../../lib/job-queue/async-filing-processor';
// import type { CronResults } from '../../../../lib/cron/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cronLogger = logger.child('tier-aware-async-cron');

/**
 * Main async cron endpoint handler - Phase 2 implementation
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  // Use secure random generation for execution IDs
  const secureExecutionId = generateSecureExecutionId('async');
  
  const executionId = request.headers.get('x-execution-id') || secureExecutionId;
  
  // Enhanced timeout configuration for async processing
  const parseTimeoutHeader = (header: string | null, defaultValue: number): number => {
    if (!header) return defaultValue;
    const parsed = parseInt(header);
    return isNaN(parsed) || parsed <= 0 ? defaultValue : Math.min(parsed, 290000); // Max 290s for safety
  };
  
  const timeoutMs = parseTimeoutHeader(request.headers.get('x-timeout'), 30000); // Default 30s for async
  const remainingTime = timeoutMs - 5000; // Reserve 5s for response generation
  
  cronLogger.info('Starting tier-aware async cron job', {
    executionId,
    timeoutMs,
    remainingTime,
    timestamp: new Date().toISOString()
  });

  // Initialize monitoring
  const monitor = await CronJobMonitor.create('tier-aware-async', 'VERCEL_CRON');
  
  try {
    // Step 1: Authentication (Fast - should complete in <1s)
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      cronLogger.error('Authentication failed', {
        executionId,
        error: authResult.error,
        clientIP: authResult.clientIP
      });
      
      return NextResponse.json(
        { 
          success: false, 
          executionId,
          error: 'Authentication failed',
          reason: authResult.error || 'Invalid credentials'
        },
        { status: 401 }
      );
    }

    // Step 2: Market hours context (Fast - <500ms)
    const marketContext = await getMarketHoursContext();
    monitor.recordMetric('market_context_ready', { timestamp: Date.now() });

    // Step 3: Get eligible users for processing (Optimized - <2s)
    const userResults = await CronUserProcessingService.getEligibleUsersForProcessing(
      marketContext,
      {
        maxUsersPerCycle: 50,
        respectBudgetLimits: true,
        budgetThreshold: 90
      }
    );

    const eligibleUsers = userResults.eligibleUsers;

    if (eligibleUsers.length === 0) {
      cronLogger.info('No eligible users found for processing', { executionId });
      
      return NextResponse.json({
        success: true,
        executionId,
        message: 'No eligible users for processing',
        usersProcessed: 0,
        mode: 'async',
        timestamp: new Date().toISOString()
      });
    }

    monitor.recordMetric('users_identified', { count: eligibleUsers.length, timestamp: Date.now() });

    // Step 4: Determine processing mode based on load and remaining time
    const totalFilings = eligibleUsers.reduce((sum, user) => {
      // Get the user data from allUsers to access tickers
      const userData = userResults.allUsers.find(u => u.id === user.userId);
      return sum + (userData?.tickers?.length || 0);
    }, 0);
    
    const shouldUseAsync = AsyncResponseService.shouldUseAsyncProcessing(
      totalFilings,
      'mixed', // Mixed user tiers
      remainingTime
    );

    if (!shouldUseAsync) {
      // Fallback to synchronous processing for small loads
      cronLogger.info('Using synchronous processing for small load', {
        executionId,
        totalFilings,
        remainingTime
      });
      
      // Import and use existing synchronous processor
      const { CronFilingProcessor: _CronFilingProcessor } = await import('../../../../lib/cron/filing-processor');
      
      // Convert eligible users to the format expected by processSynchronously
      const usersForSync = eligibleUsers.map(user => {
        const userData = userResults.allUsers.find(u => u.id === user.userId);
        return {
          id: user.userId,
          email: userData?.email || '',
          subscriptionTier: user.tier,
          tickers: userData?.tickers || [],
          processingBudget: userData?.processingBudget || 0,
          budgetUsed: userData?.budgetUsed || 0,
          lastCronProcessed: userData?.lastCronProcessed
        };
      }).filter(user => user.email); // Only process users with email addresses

      // Process synchronously with reduced timeout
      const syncResults = await processSynchronously(
        usersForSync,
        remainingTime * 0.8, // Use 80% of remaining time
        executionId
      );
      
      return NextResponse.json({
        success: true,
        executionId,
        mode: 'synchronous',
        ...syncResults,
        timestamp: new Date().toISOString()
      });
    }

    // Step 5: Async Processing Mode - Queue jobs and return immediately
    cronLogger.info('Using async processing mode', {
      executionId,
      totalFilings,
      userCount: eligibleUsers.length,
      remainingTime
    });

    // Convert eligible users to format expected by processAsynchronously  
    const usersForAsync = eligibleUsers.map(user => {
      const userData = userResults.allUsers.find(u => u.id === user.userId);
      return {
        id: user.userId,
        email: userData?.email || '',
        subscriptionTier: user.tier,
        tickers: userData?.tickers || [],
        processingBudget: userData?.processingBudget || 0,
        budgetUsed: userData?.budgetUsed || 0,
        lastCronProcessed: userData?.lastCronProcessed
      };
    }).filter(user => user.email); // Only process users with email addresses

    const asyncResults = await processAsynchronously(
      usersForAsync,
      executionId,
      marketContext
    );

    monitor.recordMetric('async_jobs_queued', { jobsQueued: asyncResults.data.filingsQueued, timestamp: Date.now() });
    
    // Step 6: Return immediate response
    const response = AsyncResponseService.createImmediateResponse(asyncResults);
    
    const totalTime = Date.now() - startTime;
    monitor.recordMetric('execution_completed', {
      duration: totalTime,
      status: 'SUCCESS',
      usersProcessed: eligibleUsers.length,
      mode: 'async',
      timestamp: Date.now()
    });

    cronLogger.info('Async cron job completed', {
      executionId,
      totalTime,
      usersProcessed: eligibleUsers.length,
      jobsQueued: asyncResults.data.filingsQueued
    });

    return response;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    monitor.recordMetric('execution_failed', {
      duration: totalTime,
      status: 'FAILED',
      error: errorMessage,
      timestamp: Date.now()
    });

    cronLogger.error('Async cron job failed', {
      executionId,
      error: errorMessage,
      totalTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return structured error response
    const errorResponse = AsyncResponseService.createErrorResponse({
      success: false,
      executionId,
      error: errorMessage,
      code: 'CRON_PROCESSING_ERROR',
      metadata: {
        processingTime: totalTime,
        retryable: true
      }
    });

    return errorResponse;
  }
}

/**
 * Process users asynchronously by queueing jobs
 */
async function processAsynchronously(
  eligibleUsers: Array<{ id: string; email: string; [key: string]: unknown }>,
  executionId: string,
  _marketContext: Record<string, unknown>
) {
  const allFilingsToQueue: Array<{
    userId: string;
    userTier: string;
    filings: Array<{
      filingId: string;
      ticker: string;
      formType: string;
      filingUrl: string;
    }>;
  }> = [];

  // Step 1: Collect all filings that need processing
  for (const user of eligibleUsers) {
    const userFilings: Array<{
      filingId: string;
      ticker: string;
      formType: string;
      filingUrl: string;
    }> = [];

    const userTickers = (user as Record<string, unknown>).tickers || (user as Record<string, unknown>).tickerMonitoring || [];
    
    for (const ticker of userTickers) {
      try {
        // Get unprocessed filings for this user and ticker
        const unprocessedFilings = await CronSecFilingService.getUnprocessedFilingsForUser(
          ticker.symbol,
          user.id
        );

        // Take only the latest few filings for async processing to avoid overwhelming the queue
        const latestFilings = unprocessedFilings.slice(0, 2); // Limit to 2 latest per ticker
        
        for (const filing of latestFilings) {
          userFilings.push({
            filingId: filing.accessionNumber,
            ticker: ticker.symbol,
            formType: filing.filingType || 'Unknown',
            filingUrl: filing.filingUrl || ''
          });
        }
      } catch (error) {
        cronLogger.error('Failed to get filings for ticker', {
          executionId,
          userId: user.id,
          ticker: ticker.symbol,
          error
        });
      }
    }

    if (userFilings.length > 0) {
      allFilingsToQueue.push({
        userId: user.id,
        userTier: (user as Record<string, unknown>).subscriptionTier as string || 'free',
        filings: userFilings
      });
    }
  }

  // Step 2: Queue all filings for async processing
  let totalJobsQueued = 0;
  const allJobIds: string[] = [];
  let latestCompletionTime = new Date();

  for (const userGroup of allFilingsToQueue) {
    try {
      const result = await AsyncResponseService.processUserFilingsAsync(
        userGroup.userId,
        userGroup.userTier,
        userGroup.filings,
        executionId
      );

      totalJobsQueued += result.data.filingsQueued;
      allJobIds.push(...result.data.jobIds);
      
      if (result.data.estimatedCompletionTime > latestCompletionTime) {
        latestCompletionTime = result.data.estimatedCompletionTime;
      }
    } catch (error) {
      cronLogger.error('Failed to queue user filings', {
        executionId,
        userId: userGroup.userId,
        error
      });
    }
  }

  return {
    success: true,
    executionId,
    message: `Queued ${totalJobsQueued} filings for async processing`,
    data: {
      filingsQueued: totalJobsQueued,
      jobIds: allJobIds,
      estimatedCompletionTime: latestCompletionTime
    },
    metadata: {
      processingTime: Date.now(),
      userTier: 'mixed'
    }
  };
}

/**
 * Fallback synchronous processing for small loads
 * Implements real filing processing using the existing CronFilingProcessor
 */
async function processSynchronously(
  eligibleUsers: Array<{ id: string; email: string; [key: string]: unknown }>,
  timeoutMs: number,
  executionId: string
): Promise<{
  usersProcessed: number;
  filingsProcessed: number;
  cost: number;
  errors: number;
  emailsSent: number;
  totalCostUSD: number;
  processingTime: number;
}> {
  const startTime = Date.now();
  const results = {
    usersProcessed: 0,
    filingsProcessed: 0,
    cost: 0,
    errors: 0,
    emailsSent: 0,
    totalCostUSD: 0,
    processingTime: 0
  };

  cronLogger.info('Starting synchronous processing (fallback mode)', {
    executionId,
    userCount: eligibleUsers.length,
    timeoutMs,
    mode: 'synchronous_fallback'
  });

  try {
    // Import CronFilingProcessor dynamically to avoid build issues
    const { CronFilingProcessor } = await import('../../../../lib/cron/filing-processor');
    
    // Validate the import
    if (!CronFilingProcessor || typeof CronFilingProcessor.processUserTierFilings !== 'function') {
      throw new Error('CronFilingProcessor not properly imported or processUserTierFilings method not available');
    }

    // Process each eligible user with timeout protection
    const remainingTime = timeoutMs;
    const timePerUser = remainingTime / Math.max(eligibleUsers.length, 1);
    
    cronLogger.info('Processing users with time allocation', {
      executionId,
      totalUsers: eligibleUsers.length,
      remainingTime,
      timePerUser: Math.floor(timePerUser)
    });

    for (let index = 0; index < eligibleUsers.length; index++) {
      const user = eligibleUsers[index];
      const userStartTime = Date.now();
      const elapsedTotal = userStartTime - startTime;
      
      // Check if we're approaching timeout
      if (elapsedTotal >= timeoutMs * 0.9) { // Use 90% of timeout as safety margin
        cronLogger.warn('Approaching timeout, stopping synchronous processing', {
          executionId,
          elapsedTime: elapsedTotal,
          timeoutMs,
          usersProcessed: index,
          totalUsers: eligibleUsers.length
        });
        break;
      }

      try {
        // Validate user object structure
        if (!user.id || !user.email) {
          cronLogger.warn('Invalid user object in synchronous processing', {
            executionId,
            userId: user.id || 'missing',
            hasEmail: !!user.email,
            userIndex: index
          });
          results.errors++;
          continue;
        }

        // Extract user tier from the user object
        const userTier = (user as Record<string, unknown>).subscriptionTier as string || 'free';
        
        cronLogger.info(`Processing user ${index + 1}/${eligibleUsers.length} synchronously`, {
          executionId,
          userId: user.id,
          tier: userTier,
          email: user.email
        });

        // Convert user object to the format expected by CronFilingProcessor
        const userForProcessing = {
          id: user.id,
          email: user.email,
          subscriptionTier: userTier,
          tickers: (user as Record<string, unknown>).tickers || (user as Record<string, unknown>).tickerMonitoring || [],
          processingBudget: (user as Record<string, unknown>).processingBudget as number || 0,
          budgetUsed: (user as Record<string, unknown>).budgetUsed as number || 0,
          lastCronProcessed: (user as Record<string, unknown>).lastCronProcessed as Date | null || null
        };

        // Validate tickers exist
        if (!userForProcessing.tickers || userForProcessing.tickers.length === 0) {
          cronLogger.warn('User has no tickers to process', {
            executionId,
            userId: user.id,
            userIndex: index
          });
          results.usersProcessed++;
          continue;
        }

        // Process user's filings using the existing processor
        const userResult = await CronFilingProcessor.processUserTierFilings(
          userForProcessing,
          userTier
        );

        // Accumulate results
        results.filingsProcessed += userResult.filingsProcessed;
        results.cost += userResult.cost;
        results.totalCostUSD += userResult.cost;
        results.usersProcessed++;

        // Count emails sent (assuming 1 email per processed filing)
        results.emailsSent += userResult.filingsProcessed;

        const userProcessingTime = Date.now() - userStartTime;
        cronLogger.info(`User processed successfully in synchronous mode`, {
          executionId,
          userId: user.id,
          tier: userTier,
          filingsProcessed: userResult.filingsProcessed,
          cost: userResult.cost,
          processingTime: userProcessingTime,
          userIndex: index + 1,
          totalUsers: eligibleUsers.length
        });

      } catch (userError) {
        results.errors++;
        const errorMessage = userError instanceof Error ? userError.message : String(userError);
        
        cronLogger.error('Failed to process user in synchronous mode', {
          executionId,
          userId: user.id,
          error: errorMessage,
          userIndex: index + 1,
          totalUsers: eligibleUsers.length
        });

        // Continue processing other users even if one fails
        continue;
      }
    }

    results.processingTime = Date.now() - startTime;

    cronLogger.info('Synchronous processing completed', {
      executionId,
      ...results,
      avgTimePerUser: results.usersProcessed > 0 ? Math.floor(results.processingTime / results.usersProcessed) : 0,
      successRate: results.usersProcessed > 0 ? ((results.usersProcessed - results.errors) / results.usersProcessed * 100).toFixed(1) + '%' : '0%'
    });

    return results;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.processingTime = Date.now() - startTime;
    results.errors = eligibleUsers.length; // Mark all as failed
    
    cronLogger.error('Synchronous processing failed completely', {
      executionId,
      error: errorMessage,
      totalUsers: eligibleUsers.length,
      processingTime: results.processingTime
    });

    // Return partial results even on failure
    return results;
  }
}