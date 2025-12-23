/**
 * Tier-aware SEC filing monitoring cron job (Refactored)
 *
 * Core Functions:
 * 1. Monitor SEC RSS feeds for new filings (24/7 - filings can be published anytime)
 * 2. Process users based on subscription tiers and frequency eligibility
 * 3. Apply priority-based resource allocation
 * 4. Respect monthly cost budget limits
 *
 * Runs every 10 minutes continuously since SEC filings can be published 24/7
 * Processing frequency is tier-based only (PRO: 5 min, HOBBY: 120 min)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { CronJobMonitor } from '../../../../lib/monitoring/cron-monitor';
import { CronJobStatus } from '../../../../types/cron';
import { generateSecureExecutionId } from '../../../../lib/security/secure-random';
// LockService will be imported dynamically to avoid Node.js module resolution issues in tests
import { withVercelRateLimit } from '../../../../lib/infrastructure/rate-limiting/vercel-endpoint-enhancer';
import { rateLimitMonitor, RateLimitEventType } from '../../../../lib/infrastructure/rate-limiting/rate-limit-monitor';

// Import our new service layer
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { CronUserProcessingService } from '../../../../lib/cron/user-processing-service';
import { CronSecFilingService } from '../../../../lib/cron/sec-filing-service';
// Removed unused import: CronFilingProcessor
import type { CronResults } from '../../../../lib/cron/types';
import { AsyncFilingQueue, type FilingJobPayload } from '../../../../lib/cron/async-filing-queue';
import { QueueMonitoringService } from '../../../../lib/cron/queue-monitoring';
import { slackWebhookService } from '../../../../lib/slack/webhook-service';
import { evaluateAlertRules } from '../../../../lib/slack/alert-rules';
import type { CronExecutionResult } from '../../../../lib/slack/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cronLogger = logger.child('tier-aware-cron');

/**
 * Main cron endpoint handler with enhanced rate limiting protection
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  // Use secure random generation for execution IDs
  const secureExecutionId = generateSecureExecutionId('api');
  
  const executionId = request.headers.get('x-execution-id') || secureExecutionId;
  
  // Apply enhanced rate limiting protection
  try {
    const rateLimitResponse = await withVercelRateLimit(request);
    if (rateLimitResponse) {
      // Record rate limiting event
      rateLimitMonitor.recordEvent(
        'vercel-endpoint',
        'tier-aware-cron',
        RateLimitEventType.RATE_LIMIT_HIT,
        {
          executionId,
          clientIP: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
          endpoint: '/api/cron/tier-aware'
        },
        { requestsBlocked: 1 }
      );
      
      cronLogger.warn(`Rate limit applied to request ${executionId}`, {
        status: rateLimitResponse.status,
        clientIP: request.headers.get('x-forwarded-for')
      });
      
      return rateLimitResponse;
    }
  } catch (rateLimitError) {
    // Record rate limiting error
    rateLimitMonitor.recordEvent(
      'vercel-endpoint',
      'tier-aware-cron',
      RateLimitEventType.PERFORMANCE_DEGRADATION,
      {
        executionId,
        error: rateLimitError.message,
        endpoint: '/api/cron/tier-aware'
      }
    );
    
    // Continue without rate limiting on error (fail open for critical cron requests)
    cronLogger.warn(`Rate limiting error for request ${executionId}, continuing without rate limit`, {
      error: rateLimitError.message
    });
  }
  
  // Timeout configuration based on Cloudflare Worker headers with input validation
  const parseTimeoutHeader = (header: string | null, defaultValue: number): number => {
    if (!header) return defaultValue;
    const parsed = parseInt(header);
    if (isNaN(parsed) || parsed < 0) return defaultValue;
    return Math.min(parsed, 600000); // Cap at 10 minutes maximum
  };
  
  const workerTimeoutMs = parseTimeoutHeader(request.headers.get('x-worker-timeout'), 300000); // 5 minutes default (Vercel limit)
  const effectiveTimeoutMs = parseTimeoutHeader(request.headers.get('x-effective-timeout'), 270000); // 4.5 minutes default (fits Vercel's 5-min limit)
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

  // Distributed lock variables for cleanup in catch/finally
  let lock = null;
  let lockName = '';
  let lockId = '';

  try {
    cronLogger.info(`[${executionId}] Starting tier-aware SEC filing cron job with bulletproof duplicate email prevention`);
    cronLogger.debug(`[${executionId}] Checkpoint 1: Route function started with enhanced security features`);

    // FEATURE FLAG: 3-Phase Async Pipeline with 202 Pattern
    // Set USE_3_PHASE_PIPELINE=true to enable simplified discovery-based processing
    const use3PhasePipeline = process.env.USE_3_PHASE_PIPELINE === 'true';

    // DEBUG: Log environment variable value to diagnose why 3-phase pipeline isn't activating
    cronLogger.info(`[${executionId}] Feature flag check: USE_3_PHASE_PIPELINE="${process.env.USE_3_PHASE_PIPELINE}" (type: ${typeof process.env.USE_3_PHASE_PIPELINE}, evaluated: ${use3PhasePipeline})`);

    if (use3PhasePipeline) {
      cronLogger.info(`[${executionId}] Using 3-phase async pipeline mode`);

      // Simplified 202 pattern: Queue single ASYNC_DISCOVER_FILINGS job and return immediately
      try {
        const { JobQueueService } = await import('../../../../lib/job-queue');

        const discoveryJob = await JobQueueService.addJob({
          jobType: 'ASYNC_DISCOVER_FILINGS',
          payload: {
            executionId,
            cronTriggerTime: new Date().toISOString()
          },
          priority: 10, // High priority for discovery jobs
          maxAttempts: 3
        });

        if (!discoveryJob) {
          throw new Error('Failed to queue discovery job');
        }

        const duration = Date.now() - startTime;

        cronLogger.info(`[${executionId}] Discovery job queued successfully (3-phase pipeline)`, {
          discoveryJobId: discoveryJob.id,
          duration,
          mode: '3-phase-async'
        });

        // Complete monitoring
        if (monitor) {
          await monitor.complete(CronJobStatus.SUCCESS, '3-phase pipeline: discovery job queued');
        }

        clearTimeout(timeoutId);

        return NextResponse.json({
          success: true,
          executionId,
          duration,
          processingMode: '3-phase-async',
          message: 'Discovery job queued for 3-phase async processing',
          discoveryJob: {
            id: discoveryJob.id,
            status: discoveryJob.status
          }
        }, {
          status: 202, // 202 Accepted - processing will happen asynchronously
          headers: {
            'X-Processing-Mode': '3-phase-async',
            'X-Execution-ID': executionId,
            'X-Discovery-Job-ID': discoveryJob.id
          }
        });

      } catch (pipelineError) {
        cronLogger.error(`[${executionId}] Failed to queue discovery job in 3-phase pipeline`, {
          error: pipelineError instanceof Error ? pipelineError.message : 'Unknown error'
        });

        // Fall through to legacy processing on error
        cronLogger.warn(`[${executionId}] Falling back to legacy processing due to 3-phase pipeline error`);
      }
    }

    // LEGACY PROCESSING: Complex backlog queueing (original implementation)
    cronLogger.debug(`[${executionId}] Using legacy backlog processing mode`);

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
        // Use consistent error message for monitoring (tests expect this specific message)
        if (monitor) await monitor.complete(CronJobStatus.FAILED, 'Unauthorized access attempt');
        
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

    // STEP 1.5: Acquire Distributed Lock to Prevent Concurrent Executions
    const environment = process.env.NODE_ENV || 'development';
    lockName = `tier-aware-cron-execution-${environment}`;
    lockId = `${platform}-${executionId}`;
    
    try {
      // Proactive cleanup of expired locks before acquisition
      const { LockService } = await import('../../../../lib/job-queue/lock-service');
      await LockService.cleanupExpiredLocks();
      
      cronLogger.debug(`[${executionId}] Attempting to acquire distributed lock`, {
        lockName,
        lockId,
        platform,
        environment
      });
      
      lock = await LockService.acquireLock(lockName, lockId, 12); // 12-minute TTL - optimized for 10-minute cron frequency
      
      if (!lock) {
        // Another cron execution is already in progress
        cronLogger.warn(`[${executionId}] Concurrent execution detected - another cron is running`, {
          lockName,
          lockId,
          platform,
          environment,
          ttlMinutes: 12
        });
        
        // Check who holds the lock for debugging
        const existingLock = await LockService.checkLock(lockName);
        if (existingLock) {
          cronLogger.info(`[${executionId}] Lock currently held by: ${existingLock.acquiredBy}`, {
            acquiredAt: existingLock.acquiredAt,
            expiresAt: existingLock.expiresAt
          });
        }
        
        clearTimeout(timeoutId);
        if (monitor) await monitor.complete(CronJobStatus.SUCCESS, 'Skipped due to concurrent execution');
        
        return NextResponse.json({
          success: true,
          message: 'Concurrent execution detected - skipped to prevent conflicts',
          executionId,
          duration: Date.now() - startTime,
          lockInfo: {
            lockName,
            currentHolder: existingLock?.acquiredBy || 'Unknown',
            acquiredAt: existingLock?.acquiredAt?.toISOString(),
            expiresAt: existingLock?.expiresAt?.toISOString()
          }
        }, { status: 429 });
      }
      
      cronLogger.info(`[${executionId}] Distributed lock acquired successfully`, {
        lockName,
        lockId,
        platform,
        environment,
        ttlMinutes: 12,
        expiresAt: new Date(Date.now() + 12 * 60 * 1000).toISOString()
      });
      
    } catch (lockError) {
      cronLogger.error(`[${executionId}] Failed to acquire distributed lock after all attempts`, {
        error: lockError instanceof Error ? lockError.message : 'Unknown error',
        lockName,
        lockId,
        platform,
        ttlMinutes: 30,
        errorType: lockError instanceof Error ? lockError.constructor.name : 'Unknown',
        alertLevel: 'LOCK_CONTENTION_HIGH',
        recommendation: 'Check for long-running cron jobs or database connectivity issues'
      });
      
      // Record lock failure metrics
      if (monitor) {
        await monitor.recordMetric('cron_lock_failure', {
          lockName,
          lockId,
          platform,
          errorMessage: lockError instanceof Error ? lockError.message : 'Unknown error'
        });
      }
      
      // Continue without lock to avoid blocking service
      cronLogger.warn(`[${executionId}] Continuing without lock - increased risk of concurrent execution`, {
        riskLevel: 'HIGH',
        mitigation: 'Relying on individual user locks for protection'
      });
    }

    // STEP 1.6: Reset Daily Budgets for Eligible Users
    cronLogger.debug(`[${executionId}] Checking for users needing daily budget reset`);
    try {
      const { CronBudgetService } = await import('../../../../lib/cron/budget-service');
      const budgetResetResults = await CronBudgetService.resetAllEligibleDailyBudgets();
      
      if (budgetResetResults.length > 0) {
        const successCount = budgetResetResults.filter(r => r.success).length;
        cronLogger.info(`[${executionId}] Daily budget reset completed`, {
          totalUsers: budgetResetResults.length,
          successful: successCount,
          errors: budgetResetResults.length - successCount
        });
      }
    } catch (budgetError) {
      cronLogger.warn(`[${executionId}] Budget reset failed but continuing processing`, {
        error: budgetError instanceof Error ? budgetError.message : 'Unknown error'
      });
    }

    // STEP 2: Get User Eligibility (tier-based, 24/7 processing)
    cronLogger.debug(`[${executionId}] Checkpoint 2: Starting user eligibility check`);

    // Check timeout before expensive operations
    timeCheck = checkTimeRemaining();
    if (!timeCheck.shouldContinue) {
      throw new Error(`Timeout approaching before user processing: ${timeCheck.remaining}ms remaining`);
    }

    // Get eligible users for processing with timeout awareness
    cronLogger.debug(`[${executionId}] Checkpoint 3: Getting eligible users for processing`);
    const maxUsersForTimeRemaining = Math.min(100, Math.floor(timeCheck.remaining / 60000) * 10); // ~10 users per minute

    const { allUsers: _allUsers, eligibleUsers } = await CronUserProcessingService.getEligibleUsersForProcessing({
      maxUsersPerCycle: maxUsersForTimeRemaining,
      respectBudgetLimits: true,
      budgetThreshold: 90
    });
    cronLogger.debug(`[${executionId}] Checkpoint 4: User eligibility check completed`, {
      maxUsersForTimeRemaining,
      eligibleUsers: eligibleUsers.length
    });

    // STEP 2.5: Backlog Processing Phase - Queue unprocessed filings for async processing
    cronLogger.debug(`[${executionId}] Checkpoint 5.5: Starting backlog queueing for unprocessed filings`);

    let unprocessedCount = 0;
    let backlogQueuedCount = 0;

    try {
      // Check timeout before starting backlog queueing
      timeCheck = checkTimeRemaining();
      if (!timeCheck.shouldContinue) {
        throw new Error(`Timeout approaching before backlog queueing: ${timeCheck.remaining}ms remaining`);
      }

      // Get unprocessed filings from database
      const unprocessedFilings = await import('../../../../lib/sec-edgar/ticker-monitoring').then(m => m.getUnprocessedFilings(100));
      unprocessedCount = unprocessedFilings.length;

      // Determine if we should skip backlog due to time constraints
      const backlogTimeRemainingMs = effectiveTimeoutMs - (Date.now() - startTime);
      const skipBacklogDueToTimeConstraints = backlogTimeRemainingMs < 30000;

      cronLogger.info(`[${executionId}] Backlog queueing decision`, {
        unprocessedCount,
        backlogTimeRemainingMs,
        skipBacklogDueToTimeConstraints,
        effectiveTimeoutMs,
        elapsed: Date.now() - startTime
      });

      if (unprocessedCount > 0 && !skipBacklogDueToTimeConstraints) {
        const queueStartTime = Date.now();

        cronLogger.info(`[${executionId}] Queueing ${unprocessedCount} backlog filings for async processing`);

        // Record backlog metrics
        if (monitor) {
          await monitor.recordMetric('unprocessed_filings_backlog', {
            count: unprocessedCount,
            alertLevel: unprocessedCount > 10 ? 'HIGH' : unprocessedCount > 5 ? 'MEDIUM' : 'LOW'
          });
        }

        // Collect all filings to queue (limit to prevent timeout)
        const maxBacklogFilings = Math.min(50, unprocessedCount);
        const backlogFilings = unprocessedFilings.slice(0, maxBacklogFilings);
        const filingsToQueue: FilingJobPayload[] = [];

        // Get database client
        const { getPrismaClient } = await import('../../../../lib/db/prisma');
        const prisma = getPrismaClient();

        for (const filing of backlogFilings) {
          if (!filing?.accessionNumber) continue;

          // Get users subscribed to this ticker
          const usersForTicker = await prisma.user.findMany({
            where: {
              tickers: {
                some: { symbol: filing.ticker.symbol }
              }
            },
            select: {
              id: true,
              email: true,
              subscriptionTier: true,
            }
          });

          // Queue job for each user
          for (const user of usersForTicker) {
            filingsToQueue.push({
              userId: user.id,
              userEmail: user.email,
              userTier: user.subscriptionTier,
              ticker: {
                symbol: filing.ticker.symbol,
                companyName: filing.ticker.companyName,
                cik: filing.ticker.cik,
              },
              filing: {
                filingId: filing.id, // Fixed: use filing.id from getUnprocessedFilings(), not filingId
                formType: filing.filingType,
                filingDate: filing.filingDate,
                filingUrl: filing.filingUrl,
                accessionNumber: filing.accessionNumber,
              },
              executionContext: {
                executionId,
                cronTriggerTime: new Date().toISOString(),
                sourceContext: 'backlog',
              },
            });
          }
        }

        // Queue all filings in batch (FAST - returns immediately)
        const queueResults = await AsyncFilingQueue.queueMultipleFilings(filingsToQueue);

        const queueDuration = Date.now() - queueStartTime;
        const successCount = queueResults.filter(r => r.success).length;

        cronLogger.info(`[${executionId}] Backlog filings queued`, {
          totalFilings: filingsToQueue.length,
          successfullyQueued: successCount,
          failed: filingsToQueue.length - successCount,
          queueDuration,
          averageQueueTime: queueDuration / filingsToQueue.length,
        });

        backlogQueuedCount = successCount;
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
      cronLogger.error(`[${executionId}] Failed to check/queue backlog`, {
        error: backlogCheckError instanceof Error ? backlogCheckError.message : 'Unknown error'
      });
    }
    
    cronLogger.debug(`[${executionId}] Checkpoint 5.6: Backlog queueing completed`, {
      unprocessedFilingsFound: unprocessedCount,
      backlogQueued: backlogQueuedCount
    });

    // ENHANCED MONITORING: Track backlog queueing health
    if (unprocessedCount > 0) {
      const backlogQueueingRate = (backlogQueuedCount / unprocessedCount * 100).toFixed(2);

      cronLogger.info(`[${executionId}] BACKLOG QUEUEING HEALTH CHECK`, {
        totalBacklogFound: unprocessedCount,
        successfullyQueued: backlogQueuedCount,
        queueingRate: `${backlogQueueingRate}%`,
        processingMode: 'async',
        healthStatus: backlogQueuedCount > 0 ? 'QUEUED' : 'FAILED'
      });

      // Alert if backlog queueing completely failed
      if (backlogQueuedCount === 0 && monitor) {
        await monitor.createAlert('BACKLOG_QUEUEING_FAILURE', {
          severity: 'HIGH',
          message: `Backlog of ${unprocessedCount} filings found but none were successfully queued`,
          details: {
            unprocessedFilingsFound: unprocessedCount,
            backlogQueued: backlogQueuedCount,
            possibleCause: 'Job queue system may be unavailable'
          }
        });
      }

      // Alert if significant backlog exists
      if (unprocessedCount > 10 && monitor) {
        await monitor.createAlert('LARGE_BACKLOG_DETECTED', {
          severity: 'MEDIUM',
          message: `Large backlog of ${unprocessedCount} unprocessed filings detected`,
          details: {
            totalBacklogFound: unprocessedCount,
            queuedThisRun: backlogQueuedCount,
            processingMode: 'async'
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

      // Release lock before returning
      if (lock) {
        try {
          const { LockService } = await import('../../../../lib/job-queue/lock-service');
          await LockService.releaseLock(lockName, lockId);
          cronLogger.info(`[${executionId}] Lock released during timeout handling`);
        } catch (lockError) {
          cronLogger.error(`[${executionId}] Failed to release lock during timeout`, {
            error: lockError instanceof Error ? lockError.message : 'Unknown error'
          });
        }
      }

      clearTimeout(timeoutId);
      return NextResponse.json({
        success: true,
        executionId: monitorResult.executionId,
        duration: monitorResult.duration,
        results: partialResults,
        warning: 'Processing completed partially due to timeout constraints'
      });
    }

    // STEP 4: Skip placeholder job creation (DISABLED)
    // NOTE: Previously this created jobs with empty filing IDs which caused all jobs to fail
    // with "Filing record missing required id field" error.
    // Filing processing now relies entirely on the backlog queueing mechanism (STEP 3)
    // which properly queues jobs with real filing data from unprocessed SecFiling records.
    cronLogger.debug(`[${executionId}] Checkpoint 8: Skipping placeholder job creation (using backlog queueing only)`);

    // Count eligible users for reporting purposes only
    const successCount = 0; // No jobs queued in this step anymore
    const _userQueueDuration = 0; // Placeholder for future metrics

    cronLogger.info(`[${executionId}] User filing queueing skipped - relying on backlog mechanism`, {
      eligibleUsers: eligibleUsers.length,
      reason: 'Placeholder jobs with empty filingId caused failures; backlog queueing provides real filing data',
      backlogQueuedThisRun: backlogQueuedCount,
    });

    // Build processing results from queue operation
    const processingResults = {
      usersProcessed: eligibleUsers.length,
      filingsProcessed: 0, // Filings will be processed async
      emailsSent: 0, // Emails will be sent async
      totalCostUSD: 0, // Cost will be tracked async
      tierBreakdown: eligibleUsers.reduce((acc, user) => {
        acc[user.tier] = (acc[user.tier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      errorBreakdown: {
        budgetExceeded: 0,
        concurrencyConflicts: 0,
        costValidationFailed: 0,
        tierMismatch: 0,
        unknownErrors: 0, // No placeholder jobs queued anymore
      },
      cacheMetrics: {
        hits: 0,
        misses: 0,
        hitRatio: 0,
        apiCallsSaved: 0,
      },
    };

    cronLogger.debug(`[${executionId}] Checkpoint 9: User filing queueing completed`);

    // STEP 5: Prepare Final Results
    const results: CronResults & {
      filingMonitoring: {
        tickersChecked: number;
        newFilingsFound: number;
        errors: number;
      };
      backlogQueueing: {
        unprocessedFound: number;
        backlogQueued: number;
      };
    } = {
      ...processingResults,
      filingMonitoring: filingMonitoringResults,
      backlogQueueing: {
        unprocessedFound: unprocessedCount,
        backlogQueued: backlogQueuedCount
      }
    };

    // ASYNC PROCESSING MONITORING: Track queueing health (processing happens in background)
    if (backlogQueuedCount > 0) {
      cronLogger.info(`[${executionId}] BACKLOG QUEUED: Successfully queued ${backlogQueuedCount} backlog filings for async processing`, {
        backlogQueued: backlogQueuedCount,
        unprocessedFilings: unprocessedCount,
        processingMode: 'async'
      });
    }

    // Complete monitoring
    const monitorResult = monitor ? 
      await monitor.complete(CronJobStatus.SUCCESS) : 
      { executionId: 'test', duration: 0 };
    
    // Release distributed lock
    if (lock) {
      try {
        const { LockService } = await import('../../../../lib/job-queue/lock-service');
        const released = await LockService.releaseLock(lockName, lockId);
        cronLogger.info(`[${executionId}] Distributed lock released`, {
          lockName,
          lockId,
          released
        });
      } catch (lockReleaseError) {
        cronLogger.error(`[${executionId}] Failed to release distributed lock`, {
          error: lockReleaseError instanceof Error ? lockReleaseError.message : 'Unknown error',
          lockName,
          lockId
        });
      }
    }
    
    clearTimeout(timeoutId);

    cronLogger.info(`[${executionId}] Tier-aware cron job completed successfully with async queueing`, {
      ...results,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      duplicatePreventionActive: true,
      distributedLockUsed: lock !== null,
      processingMode: 'async',
      backlogStatus: backlogQueuedCount > 0 ? `${backlogQueuedCount} jobs queued` : 'No backlog'
    });

    // Check queue health before returning response
    const queueHealth = await QueueMonitoringService.checkQueueHealth();

    if (!queueHealth.healthy) {
      cronLogger.warn(`[${executionId}] Queue health issues detected`, {
        issues: queueHealth.issues,
        metrics: queueHealth.metrics,
      });
    }

    // Post to Slack (fire-and-forget to avoid blocking response)
    const cronResult: CronExecutionResult = {
      success: true,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      processingMode: 'async',
      message: 'Filings queued for async processing',
      queue: {
        filingsQueued: backlogQueuedCount || 0,
        userFilingsQueued: successCount || 0,
        totalQueued: (backlogQueuedCount || 0) + (successCount || 0),
        queueDepth: queueHealth.metrics.queueDepth,
        estimatedCompletionMinutes: queueHealth.metrics.estimatedProcessingTime,
        healthy: queueHealth.healthy,
      },
      results: {
        filingMonitoring: filingMonitoringResults,
        backlogQueueing: {
          unprocessedFound: unprocessedCount,
          backlogQueued: backlogQueuedCount,
        },
      },
    };

    // Evaluate alert rules and post to Slack
    const triggeredAlerts = evaluateAlertRules(cronResult, queueHealth);

    // Post cron results to Slack (async, non-blocking)
    slackWebhookService.postCronResults(cronResult, queueHealth).catch(err => {
      cronLogger.warn(`[${executionId}] Failed to post to Slack`, { error: err.message });
    });

    // Post alerts if any were triggered
    if (triggeredAlerts.length > 0) {
      cronLogger.info(`[${executionId}] ${triggeredAlerts.length} alerts triggered`, {
        alerts: triggeredAlerts.map(a => a.rule.id),
      });
      slackWebhookService.postAlerts(triggeredAlerts, cronResult, queueHealth).catch(err => {
        cronLogger.warn(`[${executionId}] Failed to post alerts to Slack`, { error: err.message });
      });
    }

    return NextResponse.json({
      success: true,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      processingMode: 'async',
      message: 'Filings queued for async processing',
      queue: {
        filingsQueued: backlogQueuedCount || 0,
        userFilingsQueued: successCount || 0,
        totalQueued: (backlogQueuedCount || 0) + (successCount || 0),
        queueDepth: queueHealth.metrics.queueDepth,
        estimatedCompletionMinutes: queueHealth.metrics.estimatedProcessingTime,
        healthy: queueHealth.healthy,
      },
      results
    }, {
      status: 202, // 202 Accepted - processing will happen asynchronously
      headers: {
        'X-Processing-Mode': 'async',
        'X-Execution-ID': executionId,
        'X-Filings-Queued': String((backlogQueuedCount || 0) + (successCount || 0)),
      }
    });

  } catch (error) {
    // Release distributed lock in case of error
    if (lock && lockName && lockId) {
      try {
        const { LockService } = await import('../../../../lib/job-queue/lock-service');
        await LockService.releaseLock(lockName, lockId);
        cronLogger.info(`[${executionId}] Distributed lock released after error`, {
          lockName,
          lockId
        });
      } catch (lockReleaseError) {
        cronLogger.error(`[${executionId}] Failed to release lock after error`, {
          lockError: lockReleaseError instanceof Error ? lockReleaseError.message : 'Unknown error',
          originalError: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
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
async function _resetMonthlyBudgets() {
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
