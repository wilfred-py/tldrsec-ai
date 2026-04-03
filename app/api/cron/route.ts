/**
 * Consolidated Cron API Route
 *
 * Routes to the correct handler based on `?action=` query parameter.
 *
 * GET actions:
 *   - tier-aware          (SEC filing pipeline)
 *   - process-queue       (background filing queue processor, optional &jobTypes=X)
 *   - auto-recover        (self-healing recovery)
 *   - final-backup        (last-resort pipeline trigger)
 *   - cleanup-locks       (proactive lock cleanup)
 *   - check-trials        (trial expiration check)
 *   - update-daily-count  (info only)
 *
 * POST actions:
 *   - cleanup-dlq         (dead letter queue cleanup)
 *   - update-daily-count  (daily waitlist count cache)
 */

import { NextRequest, NextResponse } from 'next/server';

// Re-exported for test compatibility (auto-recover)
export async function _resetRecoveryStateForTesting(): Promise<void> {
  const { RecoveryStateService } = await import('@/lib/cron/recovery-state-service');
  await RecoveryStateService.reset();
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Module-level cooldown for pipeline stall alerts (resets on cold start, which is fine)
let lastStallAlertSentAt = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GET_ACTIONS = [
  'tier-aware',
  'fast-poll',
  'process-queue',
  'auto-recover',
  'final-backup',
  'cleanup-locks',
  'check-trials',
  'update-daily-count',
] as const;

const POST_ACTIONS = [
  'cleanup-dlq',
  'update-daily-count',
  'send-alert',
] as const;

function missingActionResponse(method: string) {
  const available = method === 'POST' ? POST_ACTIONS : GET_ACTIONS;
  return NextResponse.json(
    {
      error: 'Missing or invalid action parameter',
      usage: `?action=<action>`,
      available,
    },
    { status: 400 }
  );
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (!action || !(GET_ACTIONS as readonly string[]).includes(action)) {
    return missingActionResponse('GET');
  }

  switch (action) {
    case 'tier-aware':
      return handleTierAware(request);
    case 'fast-poll':
      return handleFastPollAction(request);
    case 'process-queue':
      return handleProcessQueue(request);
    case 'auto-recover':
      return handleAutoRecover(request);
    case 'final-backup':
      return handleFinalBackup(request);
    case 'cleanup-locks':
      return handleCleanupLocks(request);
    case 'check-trials':
      return handleCheckTrials(request);
    case 'update-daily-count':
      return handleUpdateDailyCountGET();
    default:
      return missingActionResponse('GET');
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (!action || !(POST_ACTIONS as readonly string[]).includes(action)) {
    return missingActionResponse('POST');
  }

  switch (action) {
    case 'cleanup-dlq':
      return handleCleanupDlq(request);
    case 'update-daily-count':
      return handleUpdateDailyCountPOST(request);
    case 'send-alert':
      return handleSendAlert(request);
    default:
      return missingActionResponse('POST');
  }
}

// ===========================================================================
// ACTION: fast-poll
// SEC EDGAR Submissions API polling for near-real-time filing detection
// ===========================================================================

async function handleFastPollAction(request: NextRequest) {
  const { logger } = await import('@/lib/logging');
  const fastPollLogger = logger.child('cron-fast-poll');

  try {
    // Validate cron auth
    const { CronAuthService } = await import('@/lib/cron/auth-service');
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { handleFastPoll } = await import('@/lib/cron/handlers/fast-poll-handler');
    const result = await handleFastPoll();

    const statusCode = result.status === 'skipped' ? 200 : 202;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    fastPollLogger.error('Fast-poll handler error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Fast-poll failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ===========================================================================
// ACTION: tier-aware
// Original: app/api/cron/tier-aware/route.ts
// ===========================================================================

async function handleTierAware(request: NextRequest) {
  const { logger } = await import('@/lib/logging');
  const { CronJobMonitor } = await import('@/lib/monitoring/cron-monitor');
  const { CronJobStatus } = await import('@/types/cron');
  const { generateSecureExecutionId } = await import('@/lib/security/secure-random');
  const { withVercelRateLimit } = await import('@/lib/infrastructure/rate-limiting/vercel-endpoint-enhancer');
  const { rateLimitMonitor, RateLimitEventType } = await import('@/lib/infrastructure/rate-limiting/rate-limit-monitor');
  const { CronAuthService } = await import('@/lib/cron/auth-service');
  const { CronUserProcessingService } = await import('@/lib/cron/user-processing-service');
  const { CronSecFilingService } = await import('@/lib/cron/sec-filing-service');
  const { AsyncFilingQueue } = await import('@/lib/cron/async-filing-queue');
  const { QueueMonitoringService } = await import('@/lib/cron/queue-monitoring');
  const { slackWebhookService } = await import('@/lib/slack/webhook-service');
  const { evaluateAlertRules } = await import('@/lib/slack/alert-rules');

  const cronLogger = logger.child('tier-aware-cron');

  const startTime = Date.now();
  const secureExecutionId = generateSecureExecutionId('api');
  const executionId = request.headers.get('x-execution-id') || secureExecutionId;

  // Apply enhanced rate limiting protection
  try {
    const rateLimitResponse = await withVercelRateLimit(request);
    if (rateLimitResponse) {
      rateLimitMonitor.recordEvent(
        'vercel-endpoint',
        'tier-aware-cron',
        RateLimitEventType.RATE_LIMIT_HIT,
        {
          executionId,
          clientIP: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
          endpoint: '/api/cron?action=tier-aware',
        },
        { requestsBlocked: 1 }
      );
      cronLogger.warn(`Rate limit applied to request ${executionId}`, {
        status: rateLimitResponse.status,
        clientIP: request.headers.get('x-forwarded-for'),
      });
      return rateLimitResponse;
    }
  } catch (rateLimitError) {
    rateLimitMonitor.recordEvent(
      'vercel-endpoint',
      'tier-aware-cron',
      RateLimitEventType.PERFORMANCE_DEGRADATION,
      {
        executionId,
        error: (rateLimitError as Error).message,
        endpoint: '/api/cron?action=tier-aware',
      }
    );
    cronLogger.warn(`Rate limiting error for request ${executionId}, continuing without rate limit`, {
      error: (rateLimitError as Error).message,
    });
  }

  // Timeout configuration
  const parseTimeoutHeader = (header: string | null, defaultValue: number): number => {
    if (!header) return defaultValue;
    const parsed = parseInt(header);
    if (isNaN(parsed) || parsed < 0) return defaultValue;
    return Math.min(parsed, 600000);
  };

  const workerTimeoutMs = parseTimeoutHeader(request.headers.get('x-worker-timeout'), 300000);
  const effectiveTimeoutMs = parseTimeoutHeader(request.headers.get('x-effective-timeout'), 270000);
  const timeoutBuffer = 30000;

  cronLogger.info(`[${executionId}] Starting tier-aware cron with timeout protection`, {
    workerTimeoutMs,
    effectiveTimeoutMs,
    timeoutBuffer,
  });

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    cronLogger.warn(`[${executionId}] Approaching timeout, initiating graceful shutdown`);
    timeoutController.abort(new DOMException('Execution timeout approaching', 'TimeoutError'));
  }, effectiveTimeoutMs - timeoutBuffer);

  cronLogger.debug(`[${executionId}] Checkpoint 0: GET function entry`);

  const platform = CronAuthService.detectPlatform();
  cronLogger.debug(`[${executionId}] Checkpoint 0.1: Platform determined`, { platform });

  let monitor: InstanceType<typeof CronJobMonitor> | undefined;

  try {
    cronLogger.debug(`[${executionId}] Checkpoint 0.2: About to create CronJobMonitor`);
    monitor = await CronJobMonitor.create('tier-aware-sec-monitor', platform);
    cronLogger.debug(`[${executionId}] Checkpoint 0.3: CronJobMonitor created successfully`);
  } catch (initError) {
    clearTimeout(timeoutId);
    cronLogger.error(`[${executionId}] Failed to initialize cron job monitor`, { error: initError });
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to initialize monitoring',
        executionId,
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }

  let lock: unknown = null;
  let lockName = '';
  let lockId = '';

  try {
    cronLogger.info(`[${executionId}] Starting tier-aware SEC filing cron job with bulletproof duplicate email prevention`);
    cronLogger.debug(`[${executionId}] Checkpoint 1: Route function started with enhanced security features`);

    const use3PhasePipeline = process.env.USE_3_PHASE_PIPELINE !== 'false';
    cronLogger.info(
      `[${executionId}] 3-phase pipeline: ${use3PhasePipeline ? 'ENABLED (default)' : 'DISABLED (explicit opt-out)'} [USE_3_PHASE_PIPELINE=${process.env.USE_3_PHASE_PIPELINE || 'not set'}]`
    );

    // Skip discovery during EDGAR quiet hours
    const { isEdgarOpen } = await import('@/lib/cron/edgar-schedule');
    if (process.env.NODE_ENV === 'production' && !isEdgarOpen()) {
      clearTimeout(timeoutId);
      if (monitor) await monitor.complete(CronJobStatus.SUCCESS, 'Skipped: EDGAR quiet hours');
      cronLogger.info(`[${executionId}] Skipping pipeline: EDGAR quiet hours`, {
        duration: Date.now() - startTime,
      });
      return NextResponse.json(
        {
          success: true,
          status: 'skipped',
          reason: 'EDGAR quiet hours',
          executionId,
          duration: Date.now() - startTime,
        },
        { status: 200 }
      );
    }

    if (use3PhasePipeline) {
      cronLogger.info(`[${executionId}] Using 3-phase async pipeline mode`);

      try {
        const { JobQueueService } = await import('@/lib/job-queue');

        const discoveryJob = await JobQueueService.addJob({
          jobType: 'ASYNC_DISCOVER_FILINGS',
          payload: {
            executionId,
            cronTriggerTime: new Date().toISOString(),
          },
          priority: 10,
          maxAttempts: 3,
        });

        if (!discoveryJob) {
          throw new Error('Failed to queue discovery job');
        }

        const discoveryPending = await JobQueueService.getQueueDepth('ASYNC_DISCOVER_FILINGS');
        const fetchPending = await JobQueueService.getQueueDepth('ASYNC_FETCH_FILING');
        const summarizePending = await JobQueueService.getQueueDepth('ASYNC_SUMMARIZE_CACHED');
        const totalPending = discoveryPending + fetchPending + summarizePending;

        if (totalPending > 0) {
          cronLogger.info(
            `[${executionId}] Pending jobs backlog: discovery=${discoveryPending}, fetch=${fetchPending}, summarize=${summarizePending}, total=${totalPending}`
          );
        }

        const duration = Date.now() - startTime;

        cronLogger.info(`[${executionId}] Discovery job queued successfully (3-phase pipeline)`, {
          discoveryJobId: discoveryJob.id,
          duration,
          mode: '3-phase-async',
        });

        if (monitor) {
          await monitor.complete(CronJobStatus.SUCCESS, '3-phase pipeline: discovery job queued');
        }

        clearTimeout(timeoutId);

        return NextResponse.json(
          {
            success: true,
            executionId,
            duration,
            processingMode: '3-phase-async',
            message: 'Discovery job queued for 3-phase async processing',
            discoveryJob: {
              id: discoveryJob.id,
              status: discoveryJob.status,
            },
            backlog: {
              discovery: discoveryPending,
              fetch: fetchPending,
              summarize: summarizePending,
              total: totalPending,
            },
          },
          {
            status: 202,
            headers: {
              'X-Processing-Mode': '3-phase-async',
              'X-Execution-ID': executionId,
              'X-Discovery-Job-ID': discoveryJob.id,
              'X-Backlog-Total': totalPending.toString(),
            },
          }
        );
      } catch (pipelineError) {
        cronLogger.error(`[${executionId}] Failed to queue discovery job in 3-phase pipeline`, {
          error: pipelineError instanceof Error ? pipelineError.message : 'Unknown error',
        });
        cronLogger.warn(`[${executionId}] Falling back to legacy processing due to 3-phase pipeline error`);
      }
    }

    // LEGACY PROCESSING
    cronLogger.debug(`[${executionId}] Using legacy backlog processing mode`);

    const checkTimeRemaining = () => {
      const elapsed = Date.now() - startTime;
      const remaining = effectiveTimeoutMs - elapsed;
      return { elapsed, remaining, shouldContinue: remaining > timeoutBuffer };
    };

    // Auth
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      clearTimeout(timeoutId);
      const isConfigurationError = authResult.error?.includes('not properly configured');

      if (isConfigurationError) {
        cronLogger.error(`[${executionId}] Server configuration error`, {
          error: authResult.error,
          clientIP: authResult.clientIP,
        });
        if (monitor) await monitor.complete(CronJobStatus.FAILED, 'Server configuration error');
        return NextResponse.json(
          { success: false, error: 'Server configuration error', executionId, duration: Date.now() - startTime },
          { status: 500 }
        );
      } else {
        cronLogger.warn(`[${executionId}] Authentication failed`, {
          error: authResult.error,
          clientIP: authResult.clientIP,
        });
        if (monitor) await monitor.complete(CronJobStatus.FAILED, 'Unauthorized access attempt');
        return NextResponse.json(
          { success: false, error: authResult.error || 'Authentication failed', executionId, duration: Date.now() - startTime },
          {
            status: authResult.error?.includes('Rate limit')
              ? 429
              : authResult.error?.includes('IP not allowed')
                ? 403
                : 401,
          }
        );
      }
    }

    cronLogger.info(`[${executionId}] Authentication validated successfully`, {
      clientIP: authResult.clientIP,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });

    let timeCheck = checkTimeRemaining();
    if (!timeCheck.shouldContinue) {
      throw new Error(`Timeout approaching after authentication: ${timeCheck.remaining}ms remaining`);
    }

    // Distributed lock
    const environment = process.env.NODE_ENV || 'development';
    lockName = `tier-aware-cron-execution-${environment}`;
    lockId = `${platform}-${executionId}`;

    try {
      const { LockService } = await import('@/lib/job-queue/lock-service');
      await LockService.cleanupExpiredLocks();

      cronLogger.debug(`[${executionId}] Attempting to acquire distributed lock`, {
        lockName,
        lockId,
        platform,
        environment,
      });

      lock = await LockService.acquireLock(lockName, lockId, 12);

      if (!lock) {
        cronLogger.warn(`[${executionId}] Concurrent execution detected - another cron is running`, {
          lockName,
          lockId,
          platform,
          environment,
          ttlMinutes: 12,
        });

        const existingLock = await LockService.checkLock(lockName);
        if (existingLock) {
          cronLogger.info(`[${executionId}] Lock currently held by: ${existingLock.acquiredBy}`, {
            acquiredAt: existingLock.acquiredAt,
            expiresAt: existingLock.expiresAt,
          });
        }

        clearTimeout(timeoutId);
        if (monitor) await monitor.complete(CronJobStatus.SUCCESS, 'Skipped due to concurrent execution');

        return NextResponse.json(
          {
            success: true,
            message: 'Concurrent execution detected - skipped to prevent conflicts',
            executionId,
            duration: Date.now() - startTime,
            lockInfo: {
              lockName,
              currentHolder: existingLock?.acquiredBy || 'Unknown',
              acquiredAt: existingLock?.acquiredAt?.toISOString(),
              expiresAt: existingLock?.expiresAt?.toISOString(),
            },
          },
          { status: 429 }
        );
      }

      cronLogger.info(`[${executionId}] Distributed lock acquired successfully`, {
        lockName,
        lockId,
        platform,
        environment,
        ttlMinutes: 12,
        expiresAt: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
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
        recommendation: 'Check for long-running cron jobs or database connectivity issues',
      });

      if (monitor) {
        await monitor.recordMetric('cron_lock_failure', {
          lockName,
          lockId,
          platform,
          errorMessage: lockError instanceof Error ? lockError.message : 'Unknown error',
        });
      }

      cronLogger.warn(`[${executionId}] Continuing without lock - increased risk of concurrent execution`, {
        riskLevel: 'HIGH',
        mitigation: 'Relying on individual user locks for protection',
      });
    }

    // Get eligible users
    cronLogger.debug(`[${executionId}] Checkpoint 2: Starting user eligibility check`);

    timeCheck = checkTimeRemaining();
    if (!timeCheck.shouldContinue) {
      throw new Error(`Timeout approaching before user processing: ${timeCheck.remaining}ms remaining`);
    }

    cronLogger.debug(`[${executionId}] Checkpoint 3: Getting eligible users for processing`);
    const maxUsersForTimeRemaining = Math.min(100, Math.floor(timeCheck.remaining / 60000) * 10);

    const { allUsers: _allUsers, eligibleUsers } = await CronUserProcessingService.getEligibleUsersForProcessing({
      maxUsersPerCycle: maxUsersForTimeRemaining,
    });
    cronLogger.debug(`[${executionId}] Checkpoint 4: User eligibility check completed`, {
      maxUsersForTimeRemaining,
      eligibleUsers: eligibleUsers.length,
    });

    // Backlog processing
    cronLogger.debug(`[${executionId}] Checkpoint 5.5: Starting backlog queueing for unprocessed filings`);

    let unprocessedCount = 0;
    let backlogQueuedCount = 0;

    try {
      timeCheck = checkTimeRemaining();
      if (!timeCheck.shouldContinue) {
        throw new Error(`Timeout approaching before backlog queueing: ${timeCheck.remaining}ms remaining`);
      }

      const unprocessedFilings = await import('@/lib/sec-edgar/ticker-monitoring').then((m) =>
        m.getUnprocessedFilings(100)
      );
      unprocessedCount = unprocessedFilings.length;

      const backlogTimeRemainingMs = effectiveTimeoutMs - (Date.now() - startTime);
      const skipBacklogDueToTimeConstraints = backlogTimeRemainingMs < 30000;

      cronLogger.info(`[${executionId}] Backlog queueing decision`, {
        unprocessedCount,
        backlogTimeRemainingMs,
        skipBacklogDueToTimeConstraints,
        effectiveTimeoutMs,
        elapsed: Date.now() - startTime,
      });

      if (unprocessedCount > 0 && !skipBacklogDueToTimeConstraints) {
        const queueStartTime = Date.now();
        cronLogger.info(`[${executionId}] Queueing ${unprocessedCount} backlog filings for async processing`);

        if (monitor) {
          await monitor.recordMetric('unprocessed_filings_backlog', {
            count: unprocessedCount,
            alertLevel: unprocessedCount > 10 ? 'HIGH' : unprocessedCount > 5 ? 'MEDIUM' : 'LOW',
          });
        }

        const maxBacklogFilings = Math.min(50, unprocessedCount);
        const backlogFilings = unprocessedFilings.slice(0, maxBacklogFilings);
        const filingsToQueue: InstanceType<typeof Object>[] = [];

        const { getPrismaClient } = await import('@/lib/db/prisma');
        const prisma = getPrismaClient();

        for (const filing of backlogFilings) {
          if (!filing?.accessionNumber) continue;

          const usersForTicker = await prisma.user.findMany({
            where: { tickers: { some: { symbol: filing.ticker.symbol } } },
            select: { id: true, email: true, subscriptionTier: true },
          });

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
                filingId: filing.id,
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

        const queueResults = await AsyncFilingQueue.queueMultipleFilings(
          filingsToQueue as Parameters<typeof AsyncFilingQueue.queueMultipleFilings>[0]
        );

        const queueDuration = Date.now() - queueStartTime;
        const successCount = queueResults.filter((r: { success: boolean }) => r.success).length;

        cronLogger.info(`[${executionId}] Backlog filings queued`, {
          totalFilings: filingsToQueue.length,
          successfullyQueued: successCount,
          failed: filingsToQueue.length - successCount,
          queueDuration,
          averageQueueTime: queueDuration / filingsToQueue.length,
        });

        backlogQueuedCount = successCount;
      } else if (skipBacklogDueToTimeConstraints) {
        cronLogger.warn(
          `[${executionId}] CIRCUIT BREAKER: Backlog exists (${unprocessedCount} filings) but skipped due to time constraints`,
          {
            unprocessedFilings: unprocessedCount,
            timeRemaining: timeCheck.remaining,
            circuitBreakerActive: true,
            willRetryNextRun: true,
          }
        );
      } else {
        cronLogger.info(`[${executionId}] No backlog detected - all filings processed`);
      }
    } catch (backlogCheckError) {
      cronLogger.error(`[${executionId}] Failed to check/queue backlog`, {
        error: backlogCheckError instanceof Error ? backlogCheckError.message : 'Unknown error',
      });
    }

    cronLogger.debug(`[${executionId}] Checkpoint 5.6: Backlog queueing completed`, {
      unprocessedFilingsFound: unprocessedCount,
      backlogQueued: backlogQueuedCount,
    });

    // Backlog health monitoring
    if (unprocessedCount > 0) {
      const backlogQueueingRate = ((backlogQueuedCount / unprocessedCount) * 100).toFixed(2);
      cronLogger.info(`[${executionId}] BACKLOG QUEUEING HEALTH CHECK`, {
        totalBacklogFound: unprocessedCount,
        successfullyQueued: backlogQueuedCount,
        queueingRate: `${backlogQueueingRate}%`,
        processingMode: 'async',
        healthStatus: backlogQueuedCount > 0 ? 'QUEUED' : 'FAILED',
      });

      if (backlogQueuedCount === 0 && monitor) {
        await monitor.createAlert('BACKLOG_QUEUEING_FAILURE', {
          severity: 'HIGH',
          message: `Backlog of ${unprocessedCount} filings found but none were successfully queued`,
          details: {
            unprocessedFilingsFound: unprocessedCount,
            backlogQueued: backlogQueuedCount,
            possibleCause: 'Job queue system may be unavailable',
          },
        });
      }

      if (unprocessedCount > 10 && monitor) {
        await monitor.createAlert('LARGE_BACKLOG_DETECTED', {
          severity: 'MEDIUM',
          message: `Large backlog of ${unprocessedCount} unprocessed filings detected`,
          details: {
            totalBacklogFound: unprocessedCount,
            queuedThisRun: backlogQueuedCount,
            processingMode: 'async',
          },
        });
      }
    } else {
      cronLogger.info(`[${executionId}] BACKLOG STATUS: No unprocessed filings - system healthy`);
    }

    // SEC Filing Monitoring
    cronLogger.debug(`[${executionId}] Checkpoint 6: Starting SEC filing monitoring`);
    const filingMonitoringResults = await Promise.race([
      CronSecFilingService.runSecFilingMonitoring(monitor),
      new Promise<never>((_, reject) => {
        timeoutController.signal.addEventListener('abort', () => {
          reject(new Error('SEC filing monitoring aborted due to timeout'));
        });
      }),
    ]);
    cronLogger.debug(`[${executionId}] Checkpoint 7: SEC filing monitoring completed`);

    timeCheck = checkTimeRemaining();
    if (!timeCheck.shouldContinue) {
      cronLogger.warn(`[${executionId}] Skipping user processing due to timeout constraint`, {
        remainingTime: timeCheck.remaining,
        eligibleUsers: eligibleUsers.length,
      });

      const partialResults = {
        filingMonitoring: filingMonitoringResults,
        usersProcessed: 0,
        emailsSent: 0,
        totalCostUSD: 0,
        skippedDueToTimeout: true,
        timeConstraint: { elapsed: timeCheck.elapsed, remaining: timeCheck.remaining },
      };

      const monitorResult = monitor
        ? await monitor.complete(CronJobStatus.SUCCESS, 'Partial completion due to timeout')
        : { executionId: 'test', duration: timeCheck.elapsed };

      if (lock) {
        try {
          const { LockService } = await import('@/lib/job-queue/lock-service');
          await LockService.releaseLock(lockName, lockId);
          cronLogger.info(`[${executionId}] Lock released during timeout handling`);
        } catch (lockError) {
          cronLogger.error(`[${executionId}] Failed to release lock during timeout`, {
            error: lockError instanceof Error ? lockError.message : 'Unknown error',
          });
        }
      }

      clearTimeout(timeoutId);
      return NextResponse.json({
        success: true,
        executionId: monitorResult.executionId,
        duration: monitorResult.duration,
        results: partialResults,
        warning: 'Processing completed partially due to timeout constraints',
      });
    }

    // Build processing results
    cronLogger.debug(`[${executionId}] Checkpoint 8: Skipping placeholder job creation (using backlog queueing only)`);

    const successCount = 0;

    cronLogger.info(`[${executionId}] User filing queueing skipped - relying on backlog mechanism`, {
      eligibleUsers: eligibleUsers.length,
      reason: 'Placeholder jobs with empty filingId caused failures; backlog queueing provides real filing data',
      backlogQueuedThisRun: backlogQueuedCount,
    });

    const processingResults = {
      usersProcessed: eligibleUsers.length,
      filingsProcessed: 0,
      totalCost: 0,
      tierBreakdown: eligibleUsers.reduce(
        (acc: Record<string, number>, user: { tier: string }) => {
          acc[user.tier] = (acc[user.tier] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      errors: 0,
      errorBreakdown: {
        concurrencyConflicts: 0,
        costValidationFailed: 0,
        tierMismatch: 0,
        unknownErrors: 0,
      },
      cacheMetrics: { hits: 0, misses: 0, hitRatio: 0, apiCallsSaved: 0 },
    };

    cronLogger.debug(`[${executionId}] Checkpoint 9: User filing queueing completed`);

    const results = {
      ...processingResults,
      filingMonitoring: filingMonitoringResults,
      backlogQueueing: { unprocessedFound: unprocessedCount, backlogQueued: backlogQueuedCount },
    };

    if (backlogQueuedCount > 0) {
      cronLogger.info(
        `[${executionId}] BACKLOG QUEUED: Successfully queued ${backlogQueuedCount} backlog filings for async processing`,
        { backlogQueued: backlogQueuedCount, unprocessedFilings: unprocessedCount, processingMode: 'async' }
      );
    }

    const monitorResult = monitor
      ? await monitor.complete(CronJobStatus.SUCCESS)
      : { executionId: 'test', duration: 0 };

    if (lock) {
      try {
        const { LockService } = await import('@/lib/job-queue/lock-service');
        const released = await LockService.releaseLock(lockName, lockId);
        cronLogger.info(`[${executionId}] Distributed lock released`, { lockName, lockId, released });
      } catch (lockReleaseError) {
        cronLogger.error(`[${executionId}] Failed to release distributed lock`, {
          error: lockReleaseError instanceof Error ? lockReleaseError.message : 'Unknown error',
          lockName,
          lockId,
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
      backlogStatus: backlogQueuedCount > 0 ? `${backlogQueuedCount} jobs queued` : 'No backlog',
    });

    const queueHealth = await QueueMonitoringService.checkQueueHealth();

    if (!queueHealth.healthy) {
      cronLogger.warn(`[${executionId}] Queue health issues detected`, {
        issues: queueHealth.issues,
        metrics: queueHealth.metrics,
      });
    }

    const cronResult: Parameters<typeof slackWebhookService.postCronResults>[0] = {
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
        backlogQueueing: { unprocessedFound: unprocessedCount, backlogQueued: backlogQueuedCount },
      },
    };

    const triggeredAlerts = evaluateAlertRules(cronResult, queueHealth);

    slackWebhookService.postCronResults(cronResult, queueHealth).catch((err: Error) => {
      cronLogger.warn(`[${executionId}] Failed to post to Slack`, { error: err.message });
    });

    if (triggeredAlerts.length > 0) {
      cronLogger.info(`[${executionId}] ${triggeredAlerts.length} alerts triggered`, {
        alerts: triggeredAlerts.map((a: { rule: { id: string } }) => a.rule.id),
      });
      slackWebhookService.postAlerts(triggeredAlerts, cronResult, queueHealth).catch((err: Error) => {
        cronLogger.warn(`[${executionId}] Failed to post alerts to Slack`, { error: err.message });
      });
    }

    return NextResponse.json(
      {
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
        results,
      },
      {
        status: 202,
        headers: {
          'X-Processing-Mode': 'async',
          'X-Execution-ID': executionId,
          'X-Filings-Queued': String((backlogQueuedCount || 0) + (successCount || 0)),
        },
      }
    );
  } catch (error) {
    if (lock && lockName && lockId) {
      try {
        const { LockService } = await import('@/lib/job-queue/lock-service');
        await LockService.releaseLock(lockName, lockId);
        cronLogger.info(`[${executionId}] Distributed lock released after error`, { lockName, lockId });
      } catch (lockReleaseError) {
        cronLogger.error(`[${executionId}] Failed to release lock after error`, {
          lockError: lockReleaseError instanceof Error ? lockReleaseError.message : 'Unknown error',
          originalError: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    clearTimeout(timeoutId);

    if (monitor) {
      await monitor.complete(CronJobStatus.FAILED, error instanceof Error ? error.message : 'Unknown error');
    }

    const errorType = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'ERROR';

    const safeErrorMessage = (() => {
      if (errorType === 'TIMEOUT') return 'Request timeout';
      if (error instanceof Error) {
        if (error.message.includes('Database')) return 'Database temporarily unavailable';
        if (error.message.includes('Network')) return 'Network error';
        if (error.message.includes('Authentication')) return 'Authentication failed';
        return 'Internal processing error';
      }
      return 'Unknown error occurred';
    })();

    cronLogger.error(`[${executionId}] Tier-aware cron job failed`, {
      error,
      errorType,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      { success: false, error: safeErrorMessage, errorType, executionId, duration: Date.now() - startTime },
      { status: errorType === 'TIMEOUT' ? 408 : 500 }
    );
  }
}

// ===========================================================================
// ACTION: process-queue
// Original: app/api/cron/process-filing-queue/route.ts
// ===========================================================================

async function handleProcessQueue(request: NextRequest) {
  const { BackgroundFilingWorker } = await import('@/lib/cron/background-filing-worker');
  const { logger } = await import('@/lib/logging');
  const { CronAuthService } = await import('@/lib/cron/auth-service');
  const { slackWebhookService } = await import('@/lib/slack/webhook-service');

  const routeLogger = logger.child('process-filing-queue');

  type JobType = 'ASYNC_DISCOVER_FILINGS' | 'ASYNC_FETCH_FILING' | 'ASYNC_SUMMARIZE_CACHED';
  type SlackJobType = JobType;
  interface JobProcessingStats {
    total: number;
    successful: number;
    failed: number;
    averageTimeMs: number;
  }
  interface PipelineMetrics {
    discovery: { jobsRun: number; filingsDiscovered: number; fetchJobsQueued: number; eligibleUsers: number; uniqueTickers: number };
    fetch: { jobsRun: number; contentsFetched: number; cacheHits: number; summarizeJobsQueued: number };
    summarize: { jobsRun: number; summariesGenerated: number; emailsSent: number; totalCost: number; totalInputTokens: number; totalOutputTokens: number };
    uniqueTickers: string[];
    uniqueFormTypes: string[];
  }

  const executionId = `queue-processor-${Date.now()}`;
  routeLogger.info('Filing queue processing triggered', { executionId });

  const processQueueUrl = new URL(request.url);
  const jobTypesParam = processQueueUrl.searchParams.get('jobTypes');

  let jobTypesFilter: JobType[] | undefined;
  if (jobTypesParam) {
    const requestedTypes = jobTypesParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const allowedTypes: JobType[] = ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'];
    const invalidTypes = requestedTypes.filter((t) => !allowedTypes.includes(t as JobType));
    if (invalidTypes.length > 0) {
      routeLogger.warn('Invalid job types requested', { executionId, invalidTypes, requestedTypes });
      return NextResponse.json({ error: 'Invalid job types', invalidTypes }, { status: 400 });
    }
    jobTypesFilter = requestedTypes as JobType[];
    routeLogger.info('Job type filter applied', { executionId, jobTypes: jobTypesFilter });
  }

  try {
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      routeLogger.warn('Unauthorized filing queue processing attempt', {
        executionId,
        error: authResult.error,
        clientIP: authResult.clientIP,
      });
      return NextResponse.json({ error: 'Unauthorized', details: authResult.error }, { status: 401 });
    }

    routeLogger.info('Authentication successful', { executionId, clientIP: authResult.clientIP });

    const worker = new BackgroundFilingWorker({
      batchSize: 10,
      processingInterval: 0,
      jobTypes: jobTypesFilter,
    });

    const startTime = Date.now();
    const batchResult = await worker.processBatch();
    const duration = Date.now() - startTime;

    routeLogger.info('Filing queue batch processed', {
      executionId,
      duration,
      jobsProcessed: batchResult.jobsProcessed.length,
      recoveredStaleJobs: batchResult.recoveredStaleJobs,
    });

    // Build Slack-compatible result
    if (batchResult.jobsProcessed.length > 0) {
      const byType: Record<SlackJobType, JobProcessingStats> = {
        ASYNC_DISCOVER_FILINGS: { total: 0, successful: 0, failed: 0, averageTimeMs: 0 },
        ASYNC_FETCH_FILING: { total: 0, successful: 0, failed: 0, averageTimeMs: 0 },
        ASYNC_SUMMARIZE_CACHED: { total: 0, successful: 0, failed: 0, averageTimeMs: 0 },
      };
      const timeSums: Record<SlackJobType, number> = {
        ASYNC_DISCOVER_FILINGS: 0,
        ASYNC_FETCH_FILING: 0,
        ASYNC_SUMMARIZE_CACHED: 0,
      };
      const pipeline: PipelineMetrics = {
        discovery: { jobsRun: 0, filingsDiscovered: 0, fetchJobsQueued: 0, eligibleUsers: 0, uniqueTickers: 0 },
        fetch: { jobsRun: 0, contentsFetched: 0, cacheHits: 0, summarizeJobsQueued: 0 },
        summarize: { jobsRun: 0, summariesGenerated: 0, emailsSent: 0, totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 },
        uniqueTickers: [],
        uniqueFormTypes: [],
      };
      const tickerSet = new Set<string>();
      const formTypeSet = new Set<string>();

      for (const job of batchResult.jobsProcessed) {
        const jobType = job.jobType as SlackJobType;
        if (byType[jobType]) {
          byType[jobType].total++;
          if (job.success) byType[jobType].successful++;
          else byType[jobType].failed++;
          timeSums[jobType] += job.durationMs;
        }
        if (job.ticker) tickerSet.add(job.ticker);
        if (job.formType) formTypeSet.add(job.formType);

        if (job.success) {
          if (jobType === 'ASYNC_DISCOVER_FILINGS' && job.discovery) {
            pipeline.discovery.jobsRun++;
            pipeline.discovery.filingsDiscovered += job.discovery.filingsDiscovered;
            pipeline.discovery.fetchJobsQueued += job.discovery.fetchJobsQueued;
            pipeline.discovery.eligibleUsers += job.discovery.eligibleUsers;
            pipeline.discovery.uniqueTickers += job.discovery.uniqueTickers;
          } else if (jobType === 'ASYNC_FETCH_FILING' && job.fetch) {
            pipeline.fetch.jobsRun++;
            pipeline.fetch.contentsFetched++;
            if (job.fetch.cached) pipeline.fetch.cacheHits++;
            if (job.fetch.summarizeJobQueued) pipeline.fetch.summarizeJobsQueued++;
          } else if (jobType === 'ASYNC_SUMMARIZE_CACHED' && job.summarize) {
            pipeline.summarize.jobsRun++;
            if (job.summarize.summaryId) pipeline.summarize.summariesGenerated++;
            if (job.summarize.emailSent) pipeline.summarize.emailsSent++;
            pipeline.summarize.totalCost += job.summarize.cost || 0;
            pipeline.summarize.totalInputTokens += job.summarize.inputTokens || 0;
            pipeline.summarize.totalOutputTokens += job.summarize.outputTokens || 0;
          }
        }
      }

      pipeline.uniqueTickers = Array.from(tickerSet);
      pipeline.uniqueFormTypes = Array.from(formTypeSet);

      for (const jt of Object.keys(byType) as SlackJobType[]) {
        if (byType[jt].total > 0) {
          byType[jt].averageTimeMs = timeSums[jt] / byType[jt].total;
        }
      }

      const slackResult = {
        executionId,
        duration,
        jobTypesFilter: (jobTypesFilter as SlackJobType[]) || 'all',
        jobs: {
          total: batchResult.jobsProcessed.length,
          byType,
          processed: batchResult.jobsProcessed.map((job: (typeof batchResult.jobsProcessed)[number]) => ({
            jobId: job.jobId,
            jobType: job.jobType as SlackJobType,
            ticker: job.ticker,
            formType: job.formType,
            success: job.success,
            durationMs: job.durationMs,
            error: job.error,
            discovery: job.discovery,
            fetch: job.fetch,
            summarize: job.summarize,
          })),
        },
        recoveredStaleJobs: batchResult.recoveredStaleJobs,
        pipeline,
      };

      slackWebhookService.postJobProcessingResults(slackResult).catch((err: Error) => {
        routeLogger.warn('Failed to post to Slack', { error: err.message });
      });
    }

    return NextResponse.json({
      success: true,
      executionId,
      duration,
      message: 'Filing queue batch processed',
      jobTypesFilter: jobTypesFilter || 'all',
      jobsProcessed: batchResult.jobsProcessed.length,
      recoveredStaleJobs: batchResult.recoveredStaleJobs,
    });
  } catch (error) {
    routeLogger.error('Filing queue processing failed', {
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { success: false, executionId, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ===========================================================================
// ACTION: auto-recover
// Original: app/api/cron/auto-recover/route.ts
// ===========================================================================

async function handleAutoRecover(request: NextRequest) {
  const { RecoveryStateService } = await import('@/lib/cron/recovery-state-service');
  const { CronExecutionGapDetector } = await import('@/lib/cron/execution-gap-detector');
  const { OrphanedFilingDetector } = await import('@/lib/cron/orphaned-filing-detector');
  const { validateCronRequestHmac } = await import('@/lib/security/hmac-auth');

  // Thresholds
  const STALL_CRITICAL_MINUTES = 120;
  const CLEANUP_TO_REDEPLOY_WAIT_MS = 10 * 60 * 1000;
  const REDEPLOY_COOLDOWN_MS = 60 * 60 * 1000;
  const DEGRADED_ACTION_THRESHOLD = 6;
  const STALE_PROCESSING_MINUTES = 15;
  const VALID_JOB_TYPES = ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'];

  // Auth
  async function authenticateRequest(req: NextRequest): Promise<boolean> {
    const hmacSignature = req.headers.get('x-hmac-signature');
    const hmacTimestamp = req.headers.get('x-hmac-timestamp');
    if (hmacSignature && hmacTimestamp) {
      const hmacValidation = validateCronRequestHmac(req);
      if (hmacValidation.isValid) return true;
    }
    const securityValidated = req.headers.get('x-security-validated');
    const authMethod = req.headers.get('x-auth-method');
    if (securityValidated === 'true' && authMethod === 'hmac') return true;
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return false;
    const headerSecret = req.headers.get('x-cron-secret');
    if (headerSecret === cronSecret) return true;
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret');
    if (querySecret === cronSecret) return true;
    return false;
  }

  interface PipelineHealth {
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
    minutesSinceLastCompletion: number | null;
    jobs: {
      pending: number;
      processing: number;
      completedLast1h: number;
      completedLast24h: number;
      deadLetter: number;
      retrying: number;
      exhaustedRetrying?: number;
      invalidJobTypes?: number;
      staleProcessing?: number;
    };
    locks: { healthStatus: string; staleCount: number; activeCount: number };
  }

  interface CleanupResults {
    exhaustedRetrying: number;
    invalidJobTypes: number;
    staleProcessing: number;
    staleLocks: number;
    orphanedFilings: number;
    total: number;
    errors: string[];
  }

  interface CronGapCheckResult {
    checked: boolean;
    gapsFound: number;
    alerted: boolean;
  }

  async function getPipelineHealth(): Promise<PipelineHealth> {
    const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
    const response = await fetch(`${baseUrl}/api/health`, { headers: { 'Cache-Control': 'no-cache' } });
    if (response.status === 500) throw new Error(`Health check failed: ${response.status}`);
    return response.json() as Promise<PipelineHealth>;
  }

  async function triggerForceCleanup(): Promise<{ success: boolean; locksCleared: number }> {
    const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
    const adminSecret = process.env.ADMIN_API_SECRET;
    const response = await fetch(`${baseUrl}/api/admin/force-cleanup?source=auto-recover`, {
      headers: { Authorization: `Bearer ${adminSecret}` },
    });
    if (!response.ok) throw new Error(`Force cleanup failed: ${response.status}`);
    return response.json() as Promise<{ success: boolean; locksCleared: number }>;
  }

  async function triggerRedeploy(reason: string): Promise<{ success: boolean; deploymentId: string }> {
    const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
    const adminSecret = process.env.ADMIN_API_SECRET;
    const response = await fetch(`${baseUrl}/api/admin/trigger-redeploy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, source: 'auto-recover' }),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(`Redeploy failed: ${response.status} - ${error.error || 'Unknown'}`);
    }
    return response.json() as Promise<{ success: boolean; deploymentId: string }>;
  }

  async function runImmediateCleanup(health: PipelineHealth): Promise<CleanupResults> {
    const { getPrismaClient } = await import('@/lib/db/prisma');
    const prisma = getPrismaClient();
    const results: CleanupResults = {
      exhaustedRetrying: 0,
      invalidJobTypes: 0,
      staleProcessing: 0,
      staleLocks: 0,
      orphanedFilings: 0,
      total: 0,
      errors: [],
    };

    if (health.jobs.exhaustedRetrying && health.jobs.exhaustedRetrying > 0) {
      try {
        const exhaustedResult = await prisma.$executeRaw`
          UPDATE pipeline."JobQueue"
          SET status = 'FAILED', "failedAt" = NOW(),
              "lastError" = 'Auto-recovery: Exhausted retry jobs cleaned up (retryCount >= maxRetries)'
          WHERE status = 'RETRYING' AND "retryCount" >= "maxRetries"
        `;
        results.exhaustedRetrying = Number(exhaustedResult);
      } catch (error) {
        results.errors.push(`exhaustedRetrying: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('[AutoRecover] Failed to clean exhausted RETRYING jobs:', error);
      }
    }

    if (health.jobs.invalidJobTypes && health.jobs.invalidJobTypes > 0) {
      try {
        const invalidResult = await prisma.$executeRaw`
          UPDATE pipeline."JobQueue"
          SET status = 'FAILED', "failedAt" = NOW(),
              "lastError" = 'Auto-recovery: Invalid job type - no handler exists'
          WHERE status IN ('PENDING', 'RETRYING')
            AND "jobType" NOT IN (${VALID_JOB_TYPES[0]}, ${VALID_JOB_TYPES[1]}, ${VALID_JOB_TYPES[2]})
        `;
        results.invalidJobTypes = Number(invalidResult);
      } catch (error) {
        results.errors.push(`invalidJobTypes: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('[AutoRecover] Failed to clean invalid job types:', error);
      }
    }

    if (health.jobs.staleProcessing && health.jobs.staleProcessing > 0) {
      try {
        const staleResult = await prisma.$executeRaw`
          UPDATE pipeline."JobQueue"
          SET status = 'PENDING', "startedAt" = NULL,
              "lastError" = 'Auto-recovery: Reset stale PROCESSING job (stuck >${STALE_PROCESSING_MINUTES} minutes)'
          WHERE status = 'PROCESSING'
            AND "startedAt" < NOW() - INTERVAL '${STALE_PROCESSING_MINUTES} minutes'
        `;
        results.staleProcessing = Number(staleResult);
      } catch (error) {
        results.errors.push(`staleProcessing: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('[AutoRecover] Failed to reset stale PROCESSING jobs:', error);
      }
    }

    if (health.locks.staleCount > 0) {
      try {
        const lockCleanup = await triggerForceCleanup();
        results.staleLocks = lockCleanup.locksCleared;
      } catch (error) {
        results.errors.push(`staleLocks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('[AutoRecover] Failed to clean stale locks:', error);
      }
    }

    try {
      const orphanedResult = await OrphanedFilingDetector.checkAndRecover();
      results.orphanedFilings = orphanedResult.recovered;
      if (orphanedResult.recovered > 0) {
        console.log('[AutoRecover] Recovered orphaned filings:', {
          recovered: orphanedResult.recovered,
          filings: orphanedResult.filings.map((f: { accessionNumber: string }) => f.accessionNumber),
        });
      }
    } catch (error) {
      results.errors.push(`orphanedFilings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('[AutoRecover] Failed to recover orphaned filings:', error);
    }

    results.total =
      results.exhaustedRetrying + results.invalidJobTypes + results.staleProcessing + results.staleLocks + results.orphanedFilings;
    return results;
  }

  async function sendSlackCleanupNotification(results: CleanupResults): Promise<void> {
    if (results.total === 0 && results.errors.length === 0) return;
    try {
      const { slackWebhookService } = await import('@/lib/slack/webhook-service');
      if (!slackWebhookService.isConfigured()) return;
      const hasErrors = results.errors.length > 0;
      const emoji = hasErrors ? ':x:' : ':warning:';
      const title = hasErrors
        ? `Auto-Recovery: ${results.errors.length} Cleanup Errors`
        : `Auto-Recovery Cleaned ${results.total} Stuck Jobs`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks: any[] = [
        { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *${title}*` } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Exhausted Retrying:* ${results.exhaustedRetrying}` },
            { type: 'mrkdwn', text: `*Invalid Job Types:* ${results.invalidJobTypes}` },
            { type: 'mrkdwn', text: `*Stale Processing:* ${results.staleProcessing}` },
            { type: 'mrkdwn', text: `*Stale Locks:* ${results.staleLocks}` },
            { type: 'mrkdwn', text: `*Orphaned Filings:* ${results.orphanedFilings}` },
          ],
        },
      ];
      if (hasErrors) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*Errors:*\n${results.errors.map((e) => `\u2022 ${e}`).join('\n')}` },
        });
      }
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Cleaned at ${new Date().toISOString()}` }],
      });
      await slackWebhookService.postRaw({ text: title, blocks });
    } catch (error) {
      console.error('[AutoRecover] Failed to send Slack notification:', error);
    }
  }

  async function sendSlackCriticalAlert(errorType: string, error: Error): Promise<void> {
    try {
      const { slackWebhookService } = await import('@/lib/slack/webhook-service');
      if (!slackWebhookService.isConfigured()) return;
      await slackWebhookService.postRaw({
        text: `Auto-Recovery Critical Failure: ${errorType}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `:rotating_light: *Auto-Recovery Critical Failure*` } },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Error Type:* ${errorType}` },
              { type: 'mrkdwn', text: `*Message:* ${error.message}` },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Failed at ${new Date().toISOString()} | This indicates the auto-recovery system itself is failing`,
              },
            ],
          },
        ],
      });
    } catch (slackError) {
      console.error('[AutoRecover] Failed to send critical Slack alert:', slackError);
    }
  }

  // --- Main handler logic ---
  const startTime = Date.now();

  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const health = await getPipelineHealth();
    const now = Date.now();
    const persistentState = await RecoveryStateService.getState();

    // Pipeline stall detection: if no summaries created in 4+ hours during EDGAR open hours, send email alert
    try {
      const { isEdgarOpen } = await import('@/lib/cron/edgar-schedule');
      if (isEdgarOpen()) {
        const { getPrismaClient } = await import('@/lib/db/prisma');
        const db = getPrismaClient();
        const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000);
        const recentSummaryCount = await db.summary.count({
          where: { createdAt: { gte: fourHoursAgo } },
        });
        if (recentSummaryCount === 0) {
          const alertCooldownMs = 4 * 60 * 60 * 1000;
          if (now - lastStallAlertSentAt > alertCooldownMs) {
            console.warn('[AutoRecover] PIPELINE STALL: No summaries created in 4+ hours during EDGAR open hours');
            const alertEmail = process.env.ALERT_EMAIL_RECIPIENTS;
            if (alertEmail) {
              const { sendEmail } = await import('@/lib/email');
              const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              await sendEmail({
                to: alertEmail.split(',').map((e: string) => e.trim()),
                subject: '[CRITICAL] Pipeline Stall: No summaries in 4+ hours',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px;">
                    <h2 style="color: #dc2626;">Pipeline Stall Detected</h2>
                    <p>No new summaries have been created in the last 4 hours during EDGAR open hours.</p>
                    <table style="border-collapse: collapse; width: 100%;">
                      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Pipeline Status</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(health.status)}</td></tr>
                      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Minutes Since Last Completion</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(health.minutesSinceLastCompletion ?? 'unknown')}</td></tr>
                      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Pending Jobs</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(health.jobs.pending)}</td></tr>
                      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Dead Letter</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(health.jobs.deadLetter)}</td></tr>
                      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Time</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(new Date().toISOString())}</td></tr>
                    </table>
                    <p style="margin-top: 16px;">Check <a href="https://tldrsec.app/api/health?type=pipeline">pipeline health</a> and Cloudflare Worker logs.</p>
                    <p style="color: #6b7280; font-size: 12px;">Sent by tldrsec.app auto-recovery</p>
                  </div>
                `,
                text: `CRITICAL: No summaries created in 4+ hours. Pipeline status: ${health.status}. Pending: ${health.jobs.pending}. Dead letter: ${health.jobs.deadLetter}.`,
                tags: [{ name: 'type', value: 'pipeline-stall' }],
              });
              lastStallAlertSentAt = now;
              console.log('[AutoRecover] Pipeline stall alert email sent');
            } else {
              console.warn('[AutoRecover] ALERT_EMAIL_RECIPIENTS not set, cannot send stall alert');
            }
          }
        }
      }
    } catch (stallCheckError) {
      console.error('[AutoRecover] Stall detection check failed:', stallCheckError);
    }

    const cleanupResults = await runImmediateCleanup(health);

    let cronGapCheck: CronGapCheckResult = { checked: false, gapsFound: 0, alerted: false };
    try {
      const gapResult = await CronExecutionGapDetector.checkAndAlert();
      cronGapCheck = { checked: true, gapsFound: gapResult.gaps?.length ?? 0, alerted: gapResult.alerted };
    } catch (error) {
      console.error('[AutoRecover] Cron gap detection failed:', error);
    }

    if (cleanupResults.total > 0 || cleanupResults.errors.length > 0) {
      console.log('[AutoRecover] Immediate cleanup completed:', cleanupResults);
      await sendSlackCleanupNotification(cleanupResults);
      if (cleanupResults.total > 0) await RecoveryStateService.recordCleanup();
      const updatedState = await RecoveryStateService.getState();
      const duration = Date.now() - startTime;
      return NextResponse.json({
        action: cleanupResults.errors.length > 0 ? 'cleanup-with-errors' : 'immediate-cleanup',
        reason:
          cleanupResults.errors.length > 0
            ? `Cleanup had ${cleanupResults.errors.length} errors (${cleanupResults.total} jobs cleaned)`
            : `Cleaned ${cleanupResults.total} stuck jobs`,
        cleanupResults,
        cronGapCheck,
        status: health.status,
        duration,
        recoveryState: {
          consecutiveCleanups: updatedState.consecutiveCleanups,
          consecutiveRedeploys: updatedState.consecutiveRedeploys,
          consecutiveDegraded: updatedState.consecutiveDegraded,
        },
        timestamp: new Date().toISOString(),
      });
    }

    let action: 'none' | 'cleanup' | 'redeploy' | 'monitoring' | 'proactive-investigation' = 'none';
    let reason = '';
    let result: Record<string, unknown> = {};

    if (health.status === 'HEALTHY') {
      await RecoveryStateService.resetOnHealthy();
      const healthyState = await RecoveryStateService.getState();
      return NextResponse.json({
        action: 'none',
        reason: 'Pipeline is healthy',
        cleanupResults,
        cronGapCheck,
        status: health.status,
        minutesSinceLastCompletion: health.minutesSinceLastCompletion,
        recoveryState: {
          consecutiveCleanups: healthyState.consecutiveCleanups,
          consecutiveRedeploys: healthyState.consecutiveRedeploys,
          consecutiveDegraded: healthyState.consecutiveDegraded,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (health.locks.staleCount > 0) {
      action = 'cleanup';
      reason = `${health.locks.staleCount} stale locks detected`;
      const cleanupResult = await triggerForceCleanup();
      result = cleanupResult;
      await RecoveryStateService.recordCleanup();
      const cleanupState = await RecoveryStateService.getState();
      console.log('[AutoRecover] Lock cleanup triggered:', {
        reason,
        locksCleared: cleanupResult.locksCleared,
        consecutiveCleanups: cleanupState.consecutiveCleanups,
        pipelineStatus: health.status,
      });
    } else if (
      health.status === 'CRITICAL' &&
      health.minutesSinceLastCompletion !== null &&
      health.minutesSinceLastCompletion >= STALL_CRITICAL_MINUTES
    ) {
      if (persistentState.lastCleanupTime && now - persistentState.lastCleanupTime.getTime() < CLEANUP_TO_REDEPLOY_WAIT_MS) {
        const waitRemaining = Math.ceil(
          (CLEANUP_TO_REDEPLOY_WAIT_MS - (now - persistentState.lastCleanupTime.getTime())) / 60000
        );
        return NextResponse.json({
          action: 'wait',
          reason: `Waiting ${waitRemaining} minutes after cleanup before redeploying`,
          cleanupResults,
          cronGapCheck,
          status: health.status,
          recoveryState: {
            consecutiveCleanups: persistentState.consecutiveCleanups,
            consecutiveRedeploys: persistentState.consecutiveRedeploys,
            consecutiveDegraded: persistentState.consecutiveDegraded,
          },
          timestamp: new Date().toISOString(),
        });
      }

      if (persistentState.lastRedeployTime && now - persistentState.lastRedeployTime.getTime() < REDEPLOY_COOLDOWN_MS) {
        const cooldownRemaining = Math.ceil(
          (REDEPLOY_COOLDOWN_MS - (now - persistentState.lastRedeployTime.getTime())) / 60000
        );
        return NextResponse.json({
          action: 'cooldown',
          reason: `Redeploy cooldown active. ${cooldownRemaining} minutes remaining`,
          cleanupResults,
          cronGapCheck,
          status: health.status,
          recoveryState: {
            consecutiveCleanups: persistentState.consecutiveCleanups,
            consecutiveRedeploys: persistentState.consecutiveRedeploys,
            consecutiveDegraded: persistentState.consecutiveDegraded,
          },
          timestamp: new Date().toISOString(),
        });
      }

      action = 'redeploy';
      reason = `Pipeline stalled for ${health.minutesSinceLastCompletion} minutes`;
      const redeployResult = await triggerRedeploy(reason);
      result = redeployResult;
      await RecoveryStateService.recordRedeploy();
      const redeployState = await RecoveryStateService.getState();
      console.log('[AutoRecover] Redeploy triggered:', {
        reason,
        deploymentId: redeployResult.deploymentId,
        consecutiveRedeploys: redeployState.consecutiveRedeploys,
      });
    } else if (health.status === 'DEGRADED') {
      await RecoveryStateService.incrementConsecutiveDegraded();
      const degradedState = await RecoveryStateService.getState();

      if (degradedState.consecutiveDegraded >= DEGRADED_ACTION_THRESHOLD) {
        action = 'proactive-investigation';
        reason = `Pipeline degraded for ${degradedState.consecutiveDegraded * 5} minutes`;
        await RecoveryStateService.resetOnHealthy();
        const resetState = await RecoveryStateService.getState();
        console.log('[AutoRecover] Proactive investigation triggered:', {
          reason,
          previousConsecutiveDegraded: DEGRADED_ACTION_THRESHOLD,
        });
        return NextResponse.json({
          action,
          reason,
          cleanupResults,
          cronGapCheck,
          status: health.status,
          minutesSinceLastCompletion: health.minutesSinceLastCompletion,
          recoveryState: {
            consecutiveCleanups: resetState.consecutiveCleanups,
            consecutiveRedeploys: resetState.consecutiveRedeploys,
            consecutiveDegraded: resetState.consecutiveDegraded,
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        action = 'monitoring';
        reason = 'Pipeline degraded, monitoring for recovery';
      }

      return NextResponse.json({
        action,
        reason,
        cleanupResults,
        cronGapCheck,
        status: health.status,
        minutesSinceLastCompletion: health.minutesSinceLastCompletion,
        recoveryState: {
          consecutiveCleanups: degradedState.consecutiveCleanups,
          consecutiveRedeploys: degradedState.consecutiveRedeploys,
          consecutiveDegraded: degradedState.consecutiveDegraded,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;
    const finalState = await RecoveryStateService.getState();

    return NextResponse.json({
      action,
      reason,
      ...result,
      cleanupResults,
      cronGapCheck,
      status: health.status,
      duration,
      recoveryState: {
        consecutiveCleanups: finalState.consecutiveCleanups,
        consecutiveRedeploys: finalState.consecutiveRedeploys,
        consecutiveDegraded: finalState.consecutiveDegraded,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AutoRecover] Failed:', error);
    const errorObj = error instanceof Error ? error : new Error('Unknown error');
    await sendSlackCriticalAlert('Auto-Recovery Execution Failed', errorObj);
    return NextResponse.json({ error: errorObj.message }, { status: 500 });
  }
}

// ===========================================================================
// ACTION: final-backup
// Original: app/api/cron/final-backup/route.ts
// ===========================================================================

async function handleFinalBackup(request: NextRequest) {
  // Auth
  function authenticateFinalBackup(req: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return false;
    const authHeader = req.headers.get('authorization');
    if (authHeader === `Bearer ${cronSecret}`) return true;
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret');
    if (querySecret === cronSecret) return true;
    return false;
  }

  if (!authenticateFinalBackup(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check for recent executions
    const { getPrismaClient } = await import('@/lib/db/prisma');
    const prisma = getPrismaClient();
    const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000);

    const recentExecution = await prisma.cronJobExecution.findFirst({
      where: { triggeredAt: { gte: twentyFiveMinutesAgo } },
      orderBy: { triggeredAt: 'desc' },
    });

    if (recentExecution) {
      console.log(
        `[FinalBackup] Skipping - recent execution found from ${recentExecution.source} at ${recentExecution.triggeredAt}`
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Recent execution found',
        lastExecution: recentExecution.triggeredAt,
        source: recentExecution.source,
      });
    }

    console.log('[FinalBackup] No recent executions found - triggering emergency pipeline');

    // Emergency Slack alert
    const webhookUrl = process.env.SLACK_ALERTS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text:
              `:sos: *EMERGENCY: Final Backup Triggered*\n\n` +
              `No pipeline executions detected in the last 25 minutes!\n` +
              `Both primary Cloudflare Worker and watchdog appear to have failed.\n\n` +
              `*Running emergency pipeline now...*`,
          }),
        });
      } catch (alertErr) {
        console.error('[FinalBackup] Failed to send Slack alert:', alertErr);
      }
    }

    // Trigger pipeline
    const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
    const cronSecret = process.env.CRON_SECRET;
    let pipelineResult: { success: boolean; result?: unknown; error?: string };

    try {
      const response = await fetch(`${baseUrl}/api/cron?action=tier-aware&source=final-backup`, {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          'x-final-backup-source': 'true',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        pipelineResult = {
          success: false,
          error: `Pipeline trigger failed: ${response.status} - ${errorData.error || 'Unknown error'}`,
        };
      } else {
        const result = await response.json();
        pipelineResult = { success: true, result };
      }
    } catch (fetchErr) {
      pipelineResult = {
        success: false,
        error: `Pipeline trigger error: ${fetchErr instanceof Error ? fetchErr.message : 'Unknown error'}`,
      };
    }

    if (!pipelineResult.success) {
      console.error('[FinalBackup] Pipeline trigger failed:', pipelineResult.error);
      return NextResponse.json({ success: false, error: pipelineResult.error }, { status: 500 });
    }

    // Log execution
    await prisma.cronJobExecution.create({
      data: {
        jobType: 'sec-filing-monitor',
        source: 'final-backup',
        triggeredAt: new Date(),
        completedAt: new Date(),
        status: 'COMPLETED',
        metadata: { result: pipelineResult.result },
      },
    });

    return NextResponse.json({ success: true, source: 'final-backup', result: pipelineResult.result });
  } catch (error) {
    console.error('[FinalBackup] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ===========================================================================
// ACTION: cleanup-locks
// Original: app/api/cron/cleanup-locks/route.ts
// ===========================================================================

async function handleCleanupLocks(request: NextRequest) {
  const { logger } = await import('@/lib/logging');
  const { generateSecureExecutionId } = await import('@/lib/security/secure-random');
  const { CronAuthService } = await import('@/lib/cron/auth-service');

  const cleanupLogger = logger.child('cleanup-locks');
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('cleanup');

  cleanupLogger.info(`[${executionId}] Proactive lock cleanup endpoint called`);

  try {
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      cleanupLogger.warn(`[${executionId}] Authentication failed`, {
        error: authResult.error,
        clientIP: authResult.clientIP,
      });
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed', executionId, duration: Date.now() - startTime },
        {
          status: authResult.error?.includes('Rate limit')
            ? 429
            : authResult.error?.includes('IP not allowed')
              ? 403
              : 401,
        }
      );
    }

    const { LockService } = await import('@/lib/job-queue/lock-service');
    const cleanedCount = await LockService.cleanupExpiredLocks();
    const healthMetrics = await LockService.getLockHealthMetrics();
    const duration = Date.now() - startTime;

    cleanupLogger.info(`[${executionId}] Lock cleanup completed`, {
      cleanedCount,
      healthStatus: healthMetrics.healthStatus,
      activeLocks: healthMetrics.activeLocks,
      staleLocksCount: healthMetrics.staleLocksCount,
      duration,
    });

    return NextResponse.json(
      {
        success: true,
        executionId,
        duration,
        cleanup: { expiredLocksCleared: cleanedCount, timestamp: new Date().toISOString() },
        health: {
          status: healthMetrics.healthStatus,
          activeLocks: healthMetrics.activeLocks,
          staleLocksCount: healthMetrics.staleLocksCount,
          recentLocks: healthMetrics.recentLocks,
          locksByType: healthMetrics.locksByType,
        },
        message: cleanedCount > 0 ? `Cleared ${cleanedCount} expired lock(s)` : 'No expired locks found',
      },
      {
        headers: {
          'X-Execution-ID': executionId,
          'X-Locks-Cleaned': String(cleanedCount),
          'X-Health-Status': healthMetrics.healthStatus,
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    cleanupLogger.error(`[${executionId}] Lock cleanup failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });
    return NextResponse.json({ success: false, error: 'Internal system error during cleanup', executionId, duration }, { status: 500 });
  }
}

// ===========================================================================
// ACTION: cleanup-dlq (POST only)
// Original: app/api/cron/cleanup-dlq/route.ts
// ===========================================================================

async function handleCleanupDlq(request: NextRequest) {
  const { getPrismaClient } = await import('@/lib/db/prisma');
  const { DeadLetterQueueService } = await import('@/lib/job-queue/dead-letter-queue');
  const { CronJobMonitor } = await import('@/lib/monitoring/cron-monitor');
  const { CronAuthService } = await import('@/lib/cron/auth-service');

  const monitor = CronJobMonitor.start('cleanup-dlq');

  try {
    const authResult = await CronAuthService.authenticateRequest(request);
    if (!authResult.authenticated) {
      console.error('DLQ cleanup authentication failed:', authResult.error);
      return NextResponse.json({ error: 'Unauthorized', message: authResult.error }, { status: 401 });
    }

    console.log('Starting DLQ cleanup job');

    const prisma = getPrismaClient();
    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      dlqCleaned: 0,
      failedJobsCleaned: 0,
      dlqMetrics: { pendingCount: 0, reprocessedCount: 0, errorPatterns: {}, ageDistribution: {} },
      alerts: [],
    };

    // Step 1: Clean reprocessed DLQ entries older than 30 days
    try {
      console.log('Cleaning old reprocessed DLQ entries (>30 days)');
      const cleanedReprocessed = await DeadLetterQueueService.cleanupOldEntries(30);
      results.dlqCleaned = cleanedReprocessed;
      console.log(`Cleaned ${cleanedReprocessed} old reprocessed DLQ entries`);
    } catch (error) {
      console.error('Error cleaning DLQ entries:', error);
      results.errors = results.errors || [];
      (results.errors as unknown[]).push({
        step: 'dlq_cleanup',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 2: Clean old FAILED jobs (>14 days)
    try {
      console.log('Cleaning old FAILED jobs from main queue (>14 days)');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14);
      const oldFailedJobs = await prisma.jobQueue.deleteMany({
        where: { status: 'FAILED', createdAt: { lt: cutoffDate } },
      });
      results.failedJobsCleaned = oldFailedJobs.count;
      console.log(`Cleaned ${oldFailedJobs.count} old FAILED jobs from main queue`);
    } catch (error) {
      console.error('Error cleaning old FAILED jobs:', error);
      results.errors = results.errors || [];
      (results.errors as unknown[]).push({
        step: 'failed_jobs_cleanup',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 3: Get DLQ metrics
    try {
      console.log('Gathering DLQ metrics');
      const [pendingCount, reprocessedCount] = await Promise.all([
        prisma.deadLetterQueue.count({ where: { reprocessed: false } }),
        prisma.deadLetterQueue.count({ where: { reprocessed: true } }),
      ]);

      (results.dlqMetrics as Record<string, unknown>).pendingCount = pendingCount;
      (results.dlqMetrics as Record<string, unknown>).reprocessedCount = reprocessedCount;

      const pendingEntries = await prisma.deadLetterQueue.findMany({
        where: { reprocessed: false },
        select: { lastError: true, createdAt: true },
      });

      const errorPatterns: Record<string, number> = {};
      const ageDistribution = { lessThan1Hour: 0, lessThan1Day: 0, lessThan1Week: 0, moreThan1Week: 0 };
      const now = Date.now();

      for (const entry of pendingEntries) {
        if (entry.lastError) {
          const errorKey = entry.lastError.substring(0, 50);
          errorPatterns[errorKey] = (errorPatterns[errorKey] || 0) + 1;
        }
        const age = now - entry.createdAt.getTime();
        const hourMs = 60 * 60 * 1000;
        const dayMs = 24 * hourMs;
        const weekMs = 7 * dayMs;
        if (age < hourMs) ageDistribution.lessThan1Hour++;
        else if (age < dayMs) ageDistribution.lessThan1Day++;
        else if (age < weekMs) ageDistribution.lessThan1Week++;
        else ageDistribution.moreThan1Week++;
      }

      (results.dlqMetrics as Record<string, unknown>).errorPatterns = errorPatterns;
      (results.dlqMetrics as Record<string, unknown>).ageDistribution = ageDistribution;

      console.log('DLQ metrics:', { pending: pendingCount, reprocessed: reprocessedCount, errorPatterns: Object.keys(errorPatterns).length });
    } catch (error) {
      console.error('Error gathering DLQ metrics:', error);
      results.errors = results.errors || [];
      (results.errors as unknown[]).push({
        step: 'dlq_metrics',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 4: Alert thresholds
    const dlqCount = (results.dlqMetrics as Record<string, unknown>).pendingCount as number;
    let alertLevel: 'WARNING' | 'CRITICAL' | null = null;

    if (dlqCount >= 100) {
      alertLevel = 'CRITICAL';
      (results.alerts as unknown[]).push({
        level: 'CRITICAL',
        message: `DLQ has ${dlqCount} pending entries (>= 100 threshold)`,
        recommendation: 'Investigate failed jobs immediately and address systemic issues',
      });
    } else if (dlqCount >= 50) {
      alertLevel = 'WARNING';
      (results.alerts as unknown[]).push({
        level: 'WARNING',
        message: `DLQ has ${dlqCount} pending entries (>= 50 threshold)`,
        recommendation: 'Monitor DLQ growth and investigate error patterns',
      });
    }

    if (alertLevel) {
      console.warn(`DLQ alert: ${alertLevel} - ${dlqCount} pending entries`);
    }

    monitor.complete({
      source: 'cleanup-dlq',
      dlqCleaned: results.dlqCleaned,
      failedJobsCleaned: results.failedJobsCleaned,
      dlqPendingCount: (results.dlqMetrics as Record<string, unknown>).pendingCount,
      alertLevel: alertLevel || 'NONE',
    });

    console.log('DLQ cleanup job completed successfully');
    return NextResponse.json({ success: true, ...results }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('DLQ cleanup job failed:', errorMessage);
    monitor.fail(errorMessage);
    return NextResponse.json({ success: false, error: errorMessage, timestamp: new Date().toISOString() }, { status: 500 });
  }
}

// ===========================================================================
// ACTION: check-trials
// Original: app/api/cron/check-trial-expiration/route.ts
// ===========================================================================

async function handleCheckTrials(request: NextRequest) {
  const { logger } = await import('@/lib/logging');
  const { generateSecureExecutionId } = await import('@/lib/security/secure-random');
  const { CronAuthService } = await import('@/lib/cron/auth-service');
  const { getPrismaClient } = await import('@/lib/db/prisma');

  const trialLogger = logger.child('check-trial-expiration');
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('trial');

  trialLogger.info(`[${executionId}] Trial expiration check triggered`);

  try {
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      trialLogger.warn(`[${executionId}] Authentication failed`, {
        error: authResult.error,
        clientIP: authResult.clientIP,
      });
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed', executionId, duration: Date.now() - startTime },
        {
          status: authResult.error?.includes('Rate limit')
            ? 429
            : authResult.error?.includes('IP not allowed')
              ? 403
              : 401,
        }
      );
    }

    const prisma = getPrismaClient();
    const now = new Date();

    const expiredTrials = await prisma.user.findMany({
      where: { isTrialing: true, trialEndsAt: { lte: now } },
      select: { id: true, email: true, trialEndsAt: true },
    });

    trialLogger.info(`[${executionId}] Found ${expiredTrials.length} expired trials`);

    let processed = 0;
    let emailsSent = 0;
    const errors: string[] = [];

    for (const user of expiredTrials) {
      try {
        const { handleTrialExpiration } = await import('@/lib/cron/handlers/trial-expiration-handler');
        const result = await handleTrialExpiration({
          userId: user.id,
          userEmail: user.email,
          trialExpiresAt: user.trialEndsAt!.toISOString(),
          executionId,
        });
        if (result.success) {
          processed++;
          if (result.emailSent) emailsSent++;
        } else if (result.error) {
          errors.push(`${user.id}: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${user.id}: ${msg}`);
        trialLogger.error(`[${executionId}] Failed to process trial expiration for ${user.id}`, { error: msg });
      }
    }

    const duration = Date.now() - startTime;
    trialLogger.info(`[${executionId}] Trial expiration check completed`, {
      expiredTrialsFound: expiredTrials.length,
      processed,
      emailsSent,
      errors: errors.length,
      duration,
    });

    return NextResponse.json(
      {
        success: true,
        executionId,
        duration,
        expiredTrials: expiredTrials.length,
        processed,
        emailsSent,
        errors: errors.length > 0 ? errors : undefined,
      },
      { headers: { 'X-Execution-ID': executionId, 'X-Processed': String(processed) } }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    trialLogger.error(`[${executionId}] Trial expiration check failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });
    return NextResponse.json({ success: false, error: 'Internal system error', executionId, duration }, { status: 500 });
  }
}

// ===========================================================================
// ACTION: update-daily-count (GET - info only)
// Original: app/api/cron/update-daily-count/route.ts
// ===========================================================================

async function handleUpdateDailyCountGET() {
  return NextResponse.json({
    message: 'Daily count update endpoint. Use POST with proper authorization.',
    formula: 'baseCount = 147 + totalSubscribers, display = baseCount + (currentSubscribers - subscriberCountAtEOD)',
  });
}

// ===========================================================================
// ACTION: update-daily-count (POST)
// Original: app/api/cron/update-daily-count/route.ts
// ===========================================================================

async function handleUpdateDailyCountPOST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Daily Count Update API] Starting cron job at:', new Date().toISOString());

  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (!cronSecret) {
      console.error('[Daily Count Update API] CRON_SECRET not configured');
      return NextResponse.json({ success: false, error: 'Cron secret not configured' }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Daily Count Update API] Unauthorized cron request');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { getPrismaClient } = await import('@/lib/db/prisma');
    const { createSupabaseServiceClient } = await import('@/lib/supabase/server-client');

    const prisma = getPrismaClient();
    const supabase = createSupabaseServiceClient();
    const INITIAL_SEED = 147;

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    console.log('[Daily Count Update API] Creating cache for:', tomorrow.toISOString());

    const existingEntry = await prisma.dailyWaitlistCache.findUnique({ where: { date: tomorrow } });
    if (existingEntry) {
      console.log('[Daily Count Update API] Cache entry already exists for tomorrow:', existingEntry.baseCount);
      return NextResponse.json({
        success: true,
        message: 'Cache already exists for tomorrow',
        baseCount: existingEntry.baseCount,
        subscriberCountAtEOD: existingEntry.subscriberCountAtEOD,
        date: tomorrow.toISOString(),
        processingTime: Date.now() - startTime,
      });
    }

    const { count: currentSubscriberCount, error } = await supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[Daily Count Update API] Supabase error:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch subscriber count',
          debug: { errorMessage: error.message, errorCode: error.code },
        },
        { status: 500 }
      );
    }

    const subscriberCount = currentSubscriberCount || 0;
    const baseCount = INITIAL_SEED + subscriberCount;

    console.log('[Daily Count Update API] Calculating cache values:', {
      initialSeed: INITIAL_SEED,
      currentSubscriberCount: subscriberCount,
      baseCount,
    });

    await prisma.dailyWaitlistCache.create({
      data: { date: tomorrow, baseCount, subscriberCountAtEOD: subscriberCount },
    });

    console.log('[Daily Count Update API] Success:', {
      storedForDate: tomorrow.toISOString(),
      baseCount,
      subscriberCountAtEOD: subscriberCount,
      processingTime: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      message: 'Daily count cache created successfully',
      storedForDate: tomorrow.toISOString(),
      initialSeed: INITIAL_SEED,
      subscriberCountAtEOD: subscriberCount,
      baseCount,
      processingTime: Date.now() - startTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[Daily Count Update API] Critical error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      processingTime,
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Critical error during daily count update',
        debug: { errorMessage: error instanceof Error ? error.message : 'Unknown error', processingTime },
      },
      { status: 500 }
    );
  }
}

// ===========================================================================
// ACTION: send-alert
// Email alert endpoint for Cloudflare Worker pipeline failure notifications
// ===========================================================================

async function handleSendAlert(request: NextRequest) {
  const { logger } = await import('@/lib/logging');
  const { CronAuthService } = await import('@/lib/cron/auth-service');
  const alertLogger = logger.child('cron-send-alert');

  try {
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { handler, error: errorMessage, consecutiveFailures, executionId } = body;

    if (typeof handler !== 'string' || typeof errorMessage !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid handler/error' }, { status: 400 });
    }

    const alertEmail = process.env.ALERT_EMAIL_RECIPIENTS;
    if (!alertEmail) {
      alertLogger.warn('ALERT_EMAIL_RECIPIENTS not set, skipping alert email');
      return NextResponse.json({ success: false, error: 'No alert recipients configured' }, { status: 200 });
    }
    const { sendEmail } = await import('@/lib/email');

    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeHandler = esc(handler.slice(0, 100));
    const safeError = esc(errorMessage.slice(0, 500));
    const safeFailures = esc(typeof consecutiveFailures === 'number' ? consecutiveFailures : 'unknown');
    const safeExecId = esc(typeof executionId === 'string' ? executionId.slice(0, 100) : 'unknown');

    const severity = (typeof consecutiveFailures === 'number' && consecutiveFailures >= 3) ? 'CRITICAL' : 'WARNING';
    const result = await sendEmail({
      to: alertEmail.split(',').map((e: string) => e.trim()),
      subject: `[${severity}] Pipeline Alert: ${handler.slice(0, 50)} failed`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: ${severity === 'CRITICAL' ? '#dc2626' : '#d97706'};">${severity}: Pipeline Handler Failure</h2>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Handler</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${safeHandler}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Error</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${safeError}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Consecutive Failures</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${safeFailures}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Execution ID</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${safeExecId}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Time</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(new Date().toISOString())}</td></tr>
          </table>
          <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">Sent by tldrsec.app pipeline monitoring</p>
        </div>
      `,
      text: `${severity}: ${handler} failed - ${errorMessage} (${typeof consecutiveFailures === 'number' ? consecutiveFailures : 0} consecutive failures)`,
      tags: [{ name: 'type', value: 'pipeline-alert' }, { name: 'severity', value: severity.toLowerCase() }],
    });

    alertLogger.info('Pipeline alert email sent', { handler, severity, success: result.success });
    return NextResponse.json({ success: result.success, severity });
  } catch (err) {
    alertLogger.error('Failed to send pipeline alert', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Alert send failed' }, { status: 500 });
  }
}
