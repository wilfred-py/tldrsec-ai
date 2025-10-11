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
 * Runs every 10 minutes continuously since SEC filings can be published 24/7
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
  
  const workerTimeoutMs = parseTimeoutHeader(request.headers.get('x-worker-timeout'), 600000); // 10 minutes default
  const effectiveTimeoutMs = parseTimeoutHeader(request.headers.get('x-effective-timeout'), 540000); // 9 minutes default
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

    // STEP 2.5: Backlog Processing Phase - Process unprocessed filings with timeout protection and circuit breaker
    cronLogger.debug(`[${executionId}] Checkpoint 5.5: Starting backlog processing for unprocessed filings`);
    
    let unprocessedCount = 0;
    let backlogProcessedCount = 0;
    let skipBacklogDueToTimeConstraints = false;
    
    try {
      // Check timeout before starting backlog processing
      timeCheck = checkTimeRemaining();
      if (!timeCheck.shouldContinue) {
        throw new Error(`Timeout approaching before backlog processing: ${timeCheck.remaining}ms remaining`);
      }

      // CIRCUIT BREAKER: Skip backlog if we have very limited time (less than 3 minutes)
      const minimumTimeForBacklog = 180000; // 3 minutes
      if (timeCheck.remaining < minimumTimeForBacklog) {
        skipBacklogDueToTimeConstraints = true;
        cronLogger.warn(`[${executionId}] CIRCUIT BREAKER ACTIVE: Skipping backlog processing due to insufficient time`, {
          timeRemaining: timeCheck.remaining,
          minimumRequired: minimumTimeForBacklog,
          reason: 'Prioritizing new filing monitoring over backlog to prevent 524 timeouts'
        });
      }

      const unprocessedFilings = await import('../../../../lib/sec-edgar/ticker-monitoring').then(m => m.getUnprocessedFilings(100));
      unprocessedCount = unprocessedFilings.length;
      
      if (unprocessedCount > 0 && !skipBacklogDueToTimeConstraints) {
        cronLogger.warn(`[${executionId}] BACKLOG DETECTED: ${unprocessedCount} unprocessed filings found - processing with time limit`, {
          backlogSize: unprocessedCount,
          targetFilings: 0,
          timeRemaining: timeCheck.remaining
        });
        
        // Record backlog metrics
        if (monitor) {
          await monitor.recordMetric('unprocessed_filings_backlog', {
            count: unprocessedCount,
            alertLevel: unprocessedCount > 10 ? 'HIGH' : unprocessedCount > 5 ? 'MEDIUM' : 'LOW'
          });
        }

        // Process backlog with optimized limits (max 20 filings with parallel processing)
        const maxBacklogFilings = Math.min(20, unprocessedCount);
        const backlogTimeLimit = Math.min(120000, timeCheck.remaining - 30000); // Reserve 30s for cleanup, allow 2 mins
        
        if (backlogTimeLimit > 10000) { // Only process if we have at least 10 seconds
          cronLogger.info(`[${executionId}] Processing up to ${maxBacklogFilings} backlog filings with ${backlogTimeLimit}ms time limit using parallel processing`);

          const backlogStartTime = Date.now();
          const PARALLEL_BATCH_SIZE = 3; // Process 3 filings simultaneously
          const batches = [];
          const totalBatches = Math.min(maxBacklogFilings, unprocessedFilings.length);

          // Create batches for parallel processing
          for (let i = 0; i < totalBatches; i += PARALLEL_BATCH_SIZE) {
            const batch = unprocessedFilings.slice(i, Math.min(i + PARALLEL_BATCH_SIZE, totalBatches));
            batches.push(batch);
          }

          for (const [batchIndex, batch] of batches.entries()) {
            const timeElapsed = Date.now() - backlogStartTime;
            if (timeElapsed > backlogTimeLimit) {
              cronLogger.warn(`[${executionId}] Backlog processing timeout after ${timeElapsed}ms in batch ${batchIndex}`);
              break;
            }

            if (backlogProcessedCount >= maxBacklogFilings) {
              cronLogger.info(`[${executionId}] Reached max backlog filing limit (${maxBacklogFilings})`);
              break;
            }

            cronLogger.debug(`[${executionId}] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} filings)`);

            // Process batch in parallel with rate limiting
            const batchPromises = batch.map(async (filing, filingIndex) => {
              if (!filing?.accessionNumber) return null;

              try {
                // Add small delay between filings in the same batch to respect SEC rate limits
                if (filingIndex > 0) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }

                // FIXED: Actually process filing with E2E pipeline (summary + email) before marking as processed
                const { getPrismaClient } = await import('../../../../lib/db/prisma');
                const prisma = getPrismaClient();
                
                // Find users who should receive this filing
                const usersForTicker = await prisma.user.findMany({
                  where: {
                    tickers: {
                      some: {
                        symbol: filing.ticker.symbol
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
                        symbol: filing.ticker.symbol
                      },
                      select: {
                        symbol: true,
                        companyName: true
                      }
                    }
                  }
                });

                if (usersForTicker.length === 0) {
                  cronLogger.warn(`[${executionId}] No users found for ticker ${filing.ticker.symbol}, skipping filing ${filing.accessionNumber}`);
                  return null;
                }

                let totalProcessedForFiling = 0;
                
                // Process filing for each user who subscribes to this ticker
                for (const user of usersForTicker) {
                  try {
                    // ENHANCED: Validate processSingleFiling method accessibility before calling
                    if (typeof CronFilingProcessor.processSingleFiling !== 'function') {
                      throw new Error('CronFilingProcessor.processSingleFiling is not accessible or not a function');
                    }

                    cronLogger.debug(`[${executionId}] Calling CronFilingProcessor.processSingleFiling for filing ${filing.accessionNumber}`, {
                      userId: user.id,
                      ticker: filing.ticker.symbol,
                      methodAccessible: typeof CronFilingProcessor.processSingleFiling === 'function'
                    });

                    // Use the PROPER filing processor that does real E2E processing
                    const result = await CronFilingProcessor.processSingleFiling(
                      filing,
                      user,
                      user.subscriptionTier,
                      { symbol: filing.ticker.symbol, cik: filing.ticker.cik },
                      { companyName: filing.ticker.companyName }
                    );

                    // ENHANCED: Validate result structure
                    if (!result || typeof result !== 'object') {
                      throw new Error(`Invalid result returned from processSingleFiling: ${typeof result}`);
                    }

                    if (result.success) {
                      totalProcessedForFiling++;
                      cronLogger.info(`[${executionId}] Successfully processed filing ${filing.accessionNumber} for user ${user.email} (${user.subscriptionTier})`, {
                        cost: result.cost,
                        ticker: filing.ticker.symbol
                      });
                    } else {
                      cronLogger.error(`[${executionId}] Failed to process filing ${filing.accessionNumber} for user ${user.email}`, {
                        error: result.error,
                        ticker: filing.ticker.symbol
                      });
                    }
                  } catch (userProcessingError) {
                    const errorMessage = userProcessingError instanceof Error ? userProcessingError.message : 'Unknown error';
                    
                    // ENHANCED: Detect specific error types for better debugging
                    const isAccessError = errorMessage.includes('private and only accessible') || 
                                          errorMessage.includes('not accessible') ||
                                          errorMessage.includes('not a function');
                    
                    const isTypeError = userProcessingError instanceof TypeError;
                    
                    cronLogger.error(`[${executionId}] CRITICAL: Error processing filing ${filing.accessionNumber} for user ${user.email}`, {
                      error: errorMessage,
                      errorType: userProcessingError?.constructor?.name || 'Unknown',
                      isAccessError,
                      isTypeError,
                      ticker: filing.ticker.symbol,
                      userId: user.id,
                      methodType: typeof CronFilingProcessor.processSingleFiling,
                      alertLevel: isAccessError ? 'CRITICAL_METHOD_ACCESS' : 'ERROR'
                    });
                    
                    // If this is a method access error, we need to track this specifically
                    if (isAccessError || isTypeError) {
                      cronLogger.error(`[${executionId}] SYSTEM ERROR: CronFilingProcessor.processSingleFiling method access issue detected`, {
                        possibleCause: 'Method visibility or import issues',
                        recommendation: 'Check if processSingleFiling is public static and properly exported'
                      });
                    }
                  }
                }

                // Only mark as processed if at least one user was successfully processed
                if (totalProcessedForFiling > 0) {
                  const { markFilingAsProcessedByAccession } = await import('../../../../lib/sec-edgar/ticker-monitoring');
                  await markFilingAsProcessedByAccession(filing.accessionNumber, filing.ticker.symbol);
                  
                  cronLogger.info(`[${executionId}] Successfully processed backlog filing ${filing.accessionNumber} (${filing.ticker.symbol}) for ${totalProcessedForFiling} users`);
                  return totalProcessedForFiling;
                } else {
                  cronLogger.warn(`[${executionId}] Filing ${filing.accessionNumber} (${filing.ticker.symbol}) failed for all users, leaving as unprocessed`);
                  return null;
                }
              } catch (filingError) {
                cronLogger.error(`[${executionId}] Failed to process backlog filing ${filing.accessionNumber}`, {
                  error: filingError instanceof Error ? filingError.message : 'Unknown error'
                });
                return null; // Return null for failed filings
              }
            });

            const batchResults = await Promise.allSettled(batchPromises);

            // Count successful processing
            for (const result of batchResults) {
              if (result.status === 'fulfilled' && result.value !== null) {
                backlogProcessedCount += result.value;
              }
            }

            // Add delay between batches to respect SEC API limits (500ms)
            if (batchIndex < batches.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } else {
          cronLogger.warn(`[${executionId}] Insufficient time for backlog processing (${backlogTimeLimit}ms available)`);
        }
      } else if (skipBacklogDueToTimeConstraints) {
        cronLogger.warn(`[${executionId}] CIRCUIT BREAKER: Backlog exists (${unprocessedCount} filings) but skipped due to time constraints`, {
          unprocessedFilings: unprocessedCount,
          timeRemaining: timeCheck.remaining,
          circuitBreakerActive: true,
          willRetryNextRun: true
        });
      } else {
        cronLogger.info(`[${executionId}] No backlog detected - all filings processed`);
      }
    } catch (backlogCheckError) {
      cronLogger.error(`[${executionId}] Failed to check/process backlog`, {
        error: backlogCheckError instanceof Error ? backlogCheckError.message : 'Unknown error'
      });
    }
    
    cronLogger.debug(`[${executionId}] Checkpoint 5.6: Backlog processing completed`, {
      unprocessedFilingsFound: unprocessedCount,
      backlogProcessed: backlogProcessedCount
    });

    // ENHANCED MONITORING: Track backlog processing health
    if (unprocessedCount > 0) {
      const backlogProcessingRate = (backlogProcessedCount / unprocessedCount * 100).toFixed(2);
      const remainingBacklog = unprocessedCount - backlogProcessedCount;
      
      cronLogger.info(`[${executionId}] BACKLOG PROCESSING HEALTH CHECK`, {
        totalBacklogFound: unprocessedCount,
        successfullyProcessed: backlogProcessedCount,
        processingRate: `${backlogProcessingRate}%`,
        remainingBacklog,
        targetReached: remainingBacklog === 0,
        healthStatus: remainingBacklog === 0 ? 'HEALTHY' : 
                     backlogProcessedCount > 0 ? 'IMPROVING' : 'CRITICAL'
      });

      // Alert if backlog processing completely failed
      if (backlogProcessedCount === 0 && monitor) {
        await monitor.createAlert('BACKLOG_PROCESSING_FAILURE', {
          severity: 'HIGH',
          message: `Backlog of ${unprocessedCount} filings found but none were successfully processed with E2E pipeline`,
          details: {
            unprocessedFilingsFound: unprocessedCount,
            backlogProcessed: backlogProcessedCount,
            possibleCause: 'E2E processing (summary generation or email delivery) failing for all filings'
          }
        });
      }

      // Alert if significant backlog remains
      if (remainingBacklog > 10 && monitor) {
        await monitor.createAlert('LARGE_BACKLOG_REMAINING', {
          severity: 'MEDIUM',
          message: `Large backlog of ${remainingBacklog} unprocessed filings remains after processing`,
          details: {
            totalBacklogFound: unprocessedCount,
            processedThisRun: backlogProcessedCount,
            remainingBacklog,
            processingRate: `${backlogProcessingRate}%`
          }
        });
      }
    } else {
      cronLogger.info(`[${executionId}] BACKLOG STATUS: No unprocessed filings - system healthy ✅`);
    }

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
      backlogProcessing: {
        unprocessedFound: number;
        backlogProcessed: number;
      };
    } = {
      ...processingResults,
      filingMonitoring: filingMonitoringResults,
      backlogProcessing: {
        unprocessedFound: unprocessedCount,
        backlogProcessed: backlogProcessedCount
      }
    };

    // ENHANCED CRITICAL MONITORING: Alert when filings are detected but not processed OR backlog exists
    const totalFilingsAvailable = filingMonitoringResults.newFilingsFound + unprocessedCount;
    const totalFilingsProcessed = processingResults.filingsProcessed + backlogProcessedCount;
    
    // Calculate remaining unprocessed after this run
    const remainingUnprocessed = unprocessedCount - backlogProcessedCount;
    
    if (filingMonitoringResults.newFilingsFound > 0 && totalFilingsProcessed === 0) {
      cronLogger.error(`[${executionId}] CRITICAL: Filings detected but not processed!`, {
        newFilingsFound: filingMonitoringResults.newFilingsFound,
        unprocessedBacklog: unprocessedCount,
        backlogProcessed: backlogProcessedCount,
        totalFilingsAvailable,
        totalFilingsProcessed,
        usersProcessed: processingResults.usersProcessed,
        eligibleUsers: eligibleUsers.length,
        alert: 'FILING_PROCESSING_FAILURE'
      });
      
      // Create alert in monitoring system
      if (monitor) {
        await monitor.createAlert('FILING_PROCESSING_FAILURE', {
          severity: 'CRITICAL',
          message: `${filingMonitoringResults.newFilingsFound} new filings + ${unprocessedCount} backlog filings detected but none processed`,
          details: {
            newFilingsFound: filingMonitoringResults.newFilingsFound,
            unprocessedBacklog: unprocessedCount,
            backlogProcessed: backlogProcessedCount,
            totalFilingsAvailable,
            totalFilingsProcessed,
            usersProcessed: processingResults.usersProcessed,
            target: 'Process ALL filings to reach 0 unprocessed'
          }
        });
      }
    } else if (remainingUnprocessed > 0) {
      cronLogger.warn(`[${executionId}] BACKLOG PROGRESS: ${backlogProcessedCount} processed, ${remainingUnprocessed} remain (Target: 0)`, {
        unprocessedBacklog: unprocessedCount,
        backlogProcessed: backlogProcessedCount,
        remainingUnprocessed,
        newFilingsFound: filingMonitoringResults.newFilingsFound,
        filingsProcessed: processingResults.filingsProcessed,
        target: 'All unprocessed filings should be processed each run'
      });
    } else if (backlogProcessedCount > 0) {
      cronLogger.info(`[${executionId}] BACKLOG CLEARED: Successfully processed ${backlogProcessedCount} backlog filings - target reached!`, {
        backlogProcessed: backlogProcessedCount,
        remainingUnprocessed: 0
      });
    } else if (filingMonitoringResults.newFilingsFound > processingResults.filingsProcessed) {
      cronLogger.warn(`[${executionId}] WARNING: Not all detected filings were processed`, {
        newFilingsFound: filingMonitoringResults.newFilingsFound,
        filingsProcessed: processingResults.filingsProcessed,
        processingRate: (processingResults.filingsProcessed / filingMonitoringResults.newFilingsFound * 100).toFixed(2) + '%'
      });
    }

    // FINAL VALIDATION: Check if summaries were actually created during this run
    if (totalFilingsProcessed > 0) {
      try {
        const { getPrismaClient } = await import('../../../../lib/db/prisma');
        const prisma = getPrismaClient();
        
        // Check summaries created in the last 5 minutes (this cron run)
        const recentSummaries = await prisma.summary.count({
          where: {
            createdAt: {
              gte: new Date(startTime)
            }
          }
        });

        cronLogger.info(`[${executionId}] POST-EXECUTION VALIDATION`, {
          filingsProcessedThisRun: totalFilingsProcessed,
          summariesCreatedThisRun: recentSummaries,
          validationStatus: recentSummaries > 0 ? 'PASS' : 'FAIL',
          alert: recentSummaries === 0 && totalFilingsProcessed > 0 ? 'SUMMARIES_NOT_CREATED' : null
        });

        // Critical alert if filings were processed but no summaries created
        if (totalFilingsProcessed > 0 && recentSummaries === 0 && monitor) {
          await monitor.createAlert('SUMMARIES_NOT_CREATED', {
            severity: 'CRITICAL',
            message: `${totalFilingsProcessed} filings marked as processed but 0 summaries created during this run`,
            details: {
              filingsProcessed: totalFilingsProcessed,
              summariesCreated: recentSummaries,
              executionStartTime: new Date(startTime).toISOString(),
              possibleCause: 'Filing processor may not be calling summary generation or database storage is failing'
            }
          });
        }
      } catch (validationError) {
        cronLogger.error(`[${executionId}] Post-execution validation failed`, {
          error: validationError instanceof Error ? validationError.message : 'Unknown error'
        });
      }
    }

    // Complete monitoring
    const monitorResult = monitor ? 
      await monitor.complete(CronJobStatus.SUCCESS) : 
      { executionId: 'test', duration: 0 };
    
    clearTimeout(timeoutId);
    
    cronLogger.info(`[${executionId}] Tier-aware cron job completed successfully with backlog processing`, {
      ...results,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      duplicatePreventionActive: true,
      processingHealth: remainingUnprocessed === 0 ? 'Healthy - No backlog' : 
                       backlogProcessedCount > 0 ? 'Improving - Backlog reducing' :
                       filingMonitoringResults.newFilingsFound === 0 ? 'No new filings' : 'CRITICAL',
      backlogStatus: remainingUnprocessed === 0 ? 'TARGET REACHED' : `${remainingUnprocessed} remaining`
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
