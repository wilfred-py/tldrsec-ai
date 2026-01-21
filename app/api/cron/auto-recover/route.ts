/**
 * Comprehensive Self-Healing Auto-Recovery Endpoint
 *
 * Phase 2 of 100% Pipeline Uptime implementation.
 * This endpoint runs cleanup checks EVERY execution (not just on CRITICAL status)
 * and immediately fixes ALL stuck job conditions.
 *
 * Key Design Principle: Every auto-recovery execution should:
 * 1. Check for ALL stuck job conditions (not just locks)
 * 2. Immediately clean up ANY stuck jobs found
 * 3. Report all actions taken via Slack
 *
 * Recovery state is now PERSISTED in database to survive Vercel deployments.
 * Previously, in-memory state would reset on every deploy, causing:
 * - False healthy signals after deploys during ongoing incidents
 * - Reset of consecutiveDegraded counters before action thresholds
 * - Loss of cleanup/redeploy history
 *
 * Phase 6 Enhancements (Eliminate Manual Pipeline Intervention):
 * - Integrates CronExecutionGapDetector to detect and alert on cron gaps
 * - Integrates OrphanedFilingDetector to recover orphaned filings
 * - Response includes cronGapCheck and orphanedFilings counts
 *
 * @see docs/plans/2026-01-05-100-percent-pipeline-uptime.md
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 1, 6
 */

import { NextRequest, NextResponse } from 'next/server';
import { RecoveryStateService } from '@/lib/cron/recovery-state-service';
import { CronExecutionGapDetector } from '@/lib/cron/execution-gap-detector';
import { OrphanedFilingDetector } from '@/lib/cron/orphaned-filing-detector';
import { validateCronRequestHmac } from '@/lib/security/hmac-auth';

// For testing only - reset recovery state (now uses persistent service)
export async function _resetRecoveryStateForTesting(): Promise<void> {
  await RecoveryStateService.reset();
}

// Thresholds
const STALL_CRITICAL_MINUTES = 120;
const CLEANUP_TO_REDEPLOY_WAIT_MS = 10 * 60 * 1000; // 10 minutes
const REDEPLOY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const DEGRADED_ACTION_THRESHOLD = 6; // 6 checks * 5 min = 30 min of degraded
const STALE_PROCESSING_MINUTES = 15;

/**
 * Valid job types that have handlers in the system.
 * Jobs with types not in this list are considered invalid.
 */
const VALID_JOB_TYPES = [
  'ASYNC_DISCOVER_FILINGS',
  'ASYNC_FETCH_FILING',
  'ASYNC_SUMMARIZE_CACHED'
];

/**
 * Results from running immediate cleanup of stuck jobs
 */
interface CleanupResults {
  exhaustedRetrying: number;
  invalidJobTypes: number;
  staleProcessing: number;
  staleLocks: number;
  orphanedFilings: number;  // Phase 6: Orphaned filings recovered
  total: number;
  errors: string[];  // Track any errors during cleanup operations
}

/**
 * Result from cron gap detection check
 */
interface CronGapCheckResult {
  checked: boolean;
  gapsFound: number;
  alerted: boolean;
}

async function authenticateRequest(request: NextRequest): Promise<boolean> {
  // Check HMAC authentication first (used by Cloudflare Worker)
  const hmacSignature = request.headers.get('x-hmac-signature');
  const hmacTimestamp = request.headers.get('x-hmac-timestamp');
  
  if (hmacSignature && hmacTimestamp) {
    const hmacValidation = validateCronRequestHmac(request);
    if (hmacValidation.isValid) {
      return true;
    }
  }
  
  // Check if middleware already validated the request (HMAC auth)
  const securityValidated = request.headers.get('x-security-validated');
  const authMethod = request.headers.get('x-auth-method');
  if (securityValidated === 'true' && authMethod === 'hmac') {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Check header (legacy support for direct calls)
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  // Check query param (for Vercel cron) - use URL constructor for test compatibility
  const url = new URL(request.url);
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
  locks: {
    healthStatus: string;
    staleCount: number;
    activeCount: number;
  };
}

async function getPipelineHealth(): Promise<PipelineHealth> {
  // Use production URL for public health endpoint to avoid deployment protection
  const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
  const response = await fetch(`${baseUrl}/api/health/pipeline`, {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json() as Promise<PipelineHealth>;
}

async function triggerForceCleanup(): Promise<{ success: boolean; locksCleared: number }> {
  // Use production URL for admin endpoints to avoid deployment protection
  const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
  const adminSecret = process.env.ADMIN_API_SECRET;

  const response = await fetch(`${baseUrl}/api/admin/force-cleanup?source=auto-recover`, {
    headers: {
      'Authorization': `Bearer ${adminSecret}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Force cleanup failed: ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean; locksCleared: number }>;
}

async function triggerRedeploy(reason: string): Promise<{ success: boolean; deploymentId: string }> {
  // Use production URL for admin endpoints to avoid deployment protection
  const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
  const adminSecret = process.env.ADMIN_API_SECRET;

  const response = await fetch(`${baseUrl}/api/admin/trigger-redeploy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason, source: 'auto-recover' }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(`Redeploy failed: ${response.status} - ${error.error || 'Unknown'}`);
  }

  return response.json() as Promise<{ success: boolean; deploymentId: string }>;
}

/**
 * Run immediate cleanup of ALL stuck job conditions.
 * This runs BEFORE checking health status for other actions.
 *
 * Cleans up:
 * 1. Exhausted RETRYING jobs (retryCount >= maxRetries) - mark as FAILED
 * 2. Invalid job types (no handler exists) - mark as FAILED
 * 3. Stale PROCESSING jobs (>15 min) - reset to PENDING for retry
 * 4. Stale locks - via force-cleanup endpoint
 */
async function runImmediateCleanup(health: PipelineHealth): Promise<CleanupResults> {
  const { getPrismaClient } = await import('@/lib/db/prisma');
  const prisma = getPrismaClient();

  const results: CleanupResults = {
    exhaustedRetrying: 0,
    invalidJobTypes: 0,
    staleProcessing: 0,
    staleLocks: 0,
    orphanedFilings: 0,  // Phase 6
    total: 0,
    errors: [],
  };

  // 1. Clean exhausted RETRYING jobs (CRITICAL - clean immediately)
  // These are jobs stuck in RETRYING with retryCount >= maxRetries
  if (health.jobs.exhaustedRetrying && health.jobs.exhaustedRetrying > 0) {
    try {
      const exhaustedResult = await prisma.$executeRaw`
        UPDATE pipeline."JobQueue"
        SET
          status = 'FAILED',
          "failedAt" = NOW(),
          "lastError" = 'Auto-recovery: Exhausted retry jobs cleaned up (retryCount >= maxRetries)'
        WHERE status = 'RETRYING'
          AND "retryCount" >= "maxRetries"
      `;
      results.exhaustedRetrying = Number(exhaustedResult);
    } catch (error) {
      const errorMsg = `exhaustedRetrying: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('[AutoRecover] Failed to clean exhausted RETRYING jobs:', error);
      results.errors.push(errorMsg);
    }
  }

  // 2. Clean invalid job types (CRITICAL - clean immediately)
  // These are jobs with types that have no handler
  if (health.jobs.invalidJobTypes && health.jobs.invalidJobTypes > 0) {
    try {
      const invalidResult = await prisma.$executeRaw`
        UPDATE pipeline."JobQueue"
        SET
          status = 'FAILED',
          "failedAt" = NOW(),
          "lastError" = 'Auto-recovery: Invalid job type - no handler exists'
        WHERE status IN ('PENDING', 'RETRYING')
          AND "jobType" NOT IN (${VALID_JOB_TYPES[0]}, ${VALID_JOB_TYPES[1]}, ${VALID_JOB_TYPES[2]})
      `;
      results.invalidJobTypes = Number(invalidResult);
    } catch (error) {
      const errorMsg = `invalidJobTypes: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('[AutoRecover] Failed to clean invalid job types:', error);
      results.errors.push(errorMsg);
    }
  }

  // 3. Reset stale PROCESSING jobs back to PENDING for retry
  // Jobs stuck in PROCESSING for >15 minutes are likely from crashed workers
  if (health.jobs.staleProcessing && health.jobs.staleProcessing > 0) {
    try {
      const staleResult = await prisma.$executeRaw`
        UPDATE pipeline."JobQueue"
        SET
          status = 'PENDING',
          "startedAt" = NULL,
          "lastError" = 'Auto-recovery: Reset stale PROCESSING job (stuck >${STALE_PROCESSING_MINUTES} minutes)'
        WHERE status = 'PROCESSING'
          AND "startedAt" < NOW() - INTERVAL '${STALE_PROCESSING_MINUTES} minutes'
      `;
      results.staleProcessing = Number(staleResult);
    } catch (error) {
      const errorMsg = `staleProcessing: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('[AutoRecover] Failed to reset stale PROCESSING jobs:', error);
      results.errors.push(errorMsg);
    }
  }

  // 4. Clean stale locks (existing functionality)
  if (health.locks.staleCount > 0) {
    try {
      const lockCleanup = await triggerForceCleanup();
      results.staleLocks = lockCleanup.locksCleared;
    } catch (error) {
      const errorMsg = `staleLocks: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('[AutoRecover] Failed to clean stale locks:', error);
      results.errors.push(errorMsg);
    }
  }

  // 5. Phase 6: Recover orphaned filings (processed=false but no jobs)
  try {
    const orphanedResult = await OrphanedFilingDetector.checkAndRecover();
    results.orphanedFilings = orphanedResult.recovered;
    if (orphanedResult.recovered > 0) {
      console.log('[AutoRecover] Recovered orphaned filings:', {
        recovered: orphanedResult.recovered,
        filings: orphanedResult.filings.map(f => f.accessionNumber),
      });
    }
  } catch (error) {
    const errorMsg = `orphanedFilings: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('[AutoRecover] Failed to recover orphaned filings:', error);
    results.errors.push(errorMsg);
  }

  results.total = results.exhaustedRetrying + results.invalidJobTypes +
                  results.staleProcessing + results.staleLocks + results.orphanedFilings;

  return results;
}

/**
 * Send Slack notification with cleanup summary
 */
async function sendSlackCleanupNotification(results: CleanupResults): Promise<void> {
  // Send notification if any jobs were cleaned OR if there were errors
  if (results.total === 0 && results.errors.length === 0) return;

  try {
    const { slackWebhookService } = await import('@/lib/slack/webhook-service');

    if (!slackWebhookService.isConfigured()) {
      console.log('[AutoRecover] Slack not configured, skipping notification');
      return;
    }

    const hasErrors = results.errors.length > 0;
    const emoji = hasErrors ? ':x:' : ':warning:';
    const title = hasErrors
      ? `Auto-Recovery: ${results.errors.length} Cleanup Errors`
      : `Auto-Recovery Cleaned ${results.total} Stuck Jobs`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${title}*`,
        },
      },
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

    // Add error details if there were failures
    if (hasErrors) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Errors:*\n${results.errors.map(e => `• ${e}`).join('\n')}`,
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Cleaned at ${new Date().toISOString()}`,
        },
      ],
    });

    const payload = {
      text: title,
      blocks,
    };

    await slackWebhookService.postRaw(payload);
  } catch (error) {
    console.error('[AutoRecover] Failed to send Slack notification:', error);
  }
}

/**
 * Send Slack alert for critical failures (health endpoint failure, etc.)
 */
async function sendSlackCriticalAlert(errorType: string, error: Error): Promise<void> {
  try {
    const { slackWebhookService } = await import('@/lib/slack/webhook-service');

    if (!slackWebhookService.isConfigured()) {
      console.log('[AutoRecover] Slack not configured, skipping critical alert');
      return;
    }

    const payload = {
      text: `🚨 Auto-Recovery Critical Failure: ${errorType}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:rotating_light: *Auto-Recovery Critical Failure*`,
          },
        },
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
    };

    await slackWebhookService.postRaw(payload);
  } catch (slackError) {
    console.error('[AutoRecover] Failed to send critical Slack alert:', slackError);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Authentication
  if (!await authenticateRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get pipeline health
    const health = await getPipelineHealth();
    const now = Date.now();

    // Get current recovery state from persistent storage (survives Vercel deploys)
    const persistentState = await RecoveryStateService.getState();

    // =========================================================================
    // PHASE 2: Run immediate cleanup FIRST, before any other decision logic
    // This ensures stuck jobs are cleaned up every execution
    // =========================================================================
    const cleanupResults = await runImmediateCleanup(health);

    // =========================================================================
    // PHASE 6: Cron execution gap detection
    // Check for gaps in cron executions that may indicate Cloudflare Worker issues
    // =========================================================================
    let cronGapCheck: CronGapCheckResult = {
      checked: false,
      gapsFound: 0,
      alerted: false,
    };
    try {
      const gapResult = await CronExecutionGapDetector.checkAndAlert();
      cronGapCheck = {
        checked: true,
        gapsFound: gapResult.gaps?.length ?? 0,
        alerted: gapResult.alerted,
      };
    } catch (error) {
      console.error('[AutoRecover] Cron gap detection failed:', error);
      // Continue execution - gap detection is not critical
    }

    // Log and report if any jobs were cleaned OR if there were errors
    if (cleanupResults.total > 0 || cleanupResults.errors.length > 0) {
      console.log('[AutoRecover] Immediate cleanup completed:', {
        exhaustedRetrying: cleanupResults.exhaustedRetrying,
        invalidJobTypes: cleanupResults.invalidJobTypes,
        staleProcessing: cleanupResults.staleProcessing,
        staleLocks: cleanupResults.staleLocks,
        orphanedFilings: cleanupResults.orphanedFilings,
        total: cleanupResults.total,
        errors: cleanupResults.errors,
      });

      // Send Slack notification for cleanup (handles both success and error cases)
      await sendSlackCleanupNotification(cleanupResults);

      if (cleanupResults.total > 0) {
        // Record cleanup in persistent storage
        await RecoveryStateService.recordCleanup();
      }

      // Get updated state for response
      const updatedState = await RecoveryStateService.getState();

      // Return immediately with cleanup results
      const duration = Date.now() - startTime;
      return NextResponse.json({
        action: cleanupResults.errors.length > 0 ? 'cleanup-with-errors' : 'immediate-cleanup',
        reason: cleanupResults.errors.length > 0
          ? `Cleanup had ${cleanupResults.errors.length} errors (${cleanupResults.total} jobs cleaned)`
          : `Cleaned ${cleanupResults.total} stuck jobs`,
        cleanupResults,  // Phase 6: Use cleanupResults instead of cleanup
        cronGapCheck,    // Phase 6: Include cron gap check results
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

    // =========================================================================
    // Original decision logic (after cleanup check)
    // =========================================================================
    let action: 'none' | 'cleanup' | 'redeploy' | 'monitoring' | 'proactive-investigation' = 'none';
    let reason = '';
    let result: Record<string, unknown> = {};

    // If healthy, reset counters and return
    if (health.status === 'HEALTHY') {
      // Reset degraded counter on healthy (preserves cleanup/redeploy history)
      await RecoveryStateService.resetOnHealthy();
      const healthyState = await RecoveryStateService.getState();

      return NextResponse.json({
        action: 'none',
        reason: 'Pipeline is healthy',
        cleanupResults,  // Phase 6
        cronGapCheck,    // Phase 6
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

    // Check if stale locks need cleanup (already handled above, but keep for lock-only case)
    if (health.locks.staleCount > 0) {
      action = 'cleanup';
      reason = `${health.locks.staleCount} stale locks detected`;

      const cleanupResult = await triggerForceCleanup();
      result = cleanupResult;

      // Record cleanup in persistent storage
      await RecoveryStateService.recordCleanup();
      const cleanupState = await RecoveryStateService.getState();

      console.log('[AutoRecover] Lock cleanup triggered:', {
        reason,
        locksCleared: cleanupResult.locksCleared,
        consecutiveCleanups: cleanupState.consecutiveCleanups,
        pipelineStatus: health.status,
      });
    }
    // Check if redeploy is needed (critical stall, no stale locks, cooldown passed)
    else if (
      health.status === 'CRITICAL' &&
      health.minutesSinceLastCompletion !== null &&
      health.minutesSinceLastCompletion >= STALL_CRITICAL_MINUTES
    ) {
      // Check if we should wait after cleanup (using persistent timestamps)
      if (
        persistentState.lastCleanupTime &&
        now - persistentState.lastCleanupTime.getTime() < CLEANUP_TO_REDEPLOY_WAIT_MS
      ) {
        const waitRemaining = Math.ceil(
          (CLEANUP_TO_REDEPLOY_WAIT_MS - (now - persistentState.lastCleanupTime.getTime())) / 60000
        );

        return NextResponse.json({
          action: 'wait',
          reason: `Waiting ${waitRemaining} minutes after cleanup before redeploying`,
          cleanupResults,  // Phase 6
          cronGapCheck,    // Phase 6
          status: health.status,
          recoveryState: {
            consecutiveCleanups: persistentState.consecutiveCleanups,
            consecutiveRedeploys: persistentState.consecutiveRedeploys,
            consecutiveDegraded: persistentState.consecutiveDegraded,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Check redeploy cooldown (using persistent timestamps)
      if (
        persistentState.lastRedeployTime &&
        now - persistentState.lastRedeployTime.getTime() < REDEPLOY_COOLDOWN_MS
      ) {
        const cooldownRemaining = Math.ceil(
          (REDEPLOY_COOLDOWN_MS - (now - persistentState.lastRedeployTime.getTime())) / 60000
        );

        return NextResponse.json({
          action: 'cooldown',
          reason: `Redeploy cooldown active. ${cooldownRemaining} minutes remaining`,
          cleanupResults,  // Phase 6
          cronGapCheck,    // Phase 6
          status: health.status,
          recoveryState: {
            consecutiveCleanups: persistentState.consecutiveCleanups,
            consecutiveRedeploys: persistentState.consecutiveRedeploys,
            consecutiveDegraded: persistentState.consecutiveDegraded,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Trigger redeploy
      action = 'redeploy';
      reason = `Pipeline stalled for ${health.minutesSinceLastCompletion} minutes`;

      const redeployResult = await triggerRedeploy(reason);
      result = redeployResult;

      // Record redeploy in persistent storage
      await RecoveryStateService.recordRedeploy();
      const redeployState = await RecoveryStateService.getState();

      console.log('[AutoRecover] Redeploy triggered:', {
        reason,
        deploymentId: redeployResult.deploymentId,
        consecutiveRedeploys: redeployState.consecutiveRedeploys,
      });
    }
    // Degraded but not critical - track consecutive degraded count
    else if (health.status === 'DEGRADED') {
      // Increment degraded counter in persistent storage
      await RecoveryStateService.incrementConsecutiveDegraded();
      const degradedState = await RecoveryStateService.getState();

      // After prolonged DEGRADED state, trigger proactive investigation
      if (degradedState.consecutiveDegraded >= DEGRADED_ACTION_THRESHOLD) {
        action = 'proactive-investigation';
        reason = `Pipeline degraded for ${degradedState.consecutiveDegraded * 5} minutes`;

        // Reset degraded counter after action (but via resetOnHealthy which preserves history)
        await RecoveryStateService.resetOnHealthy();
        const resetState = await RecoveryStateService.getState();

        console.log('[AutoRecover] Proactive investigation triggered:', {
          reason,
          previousConsecutiveDegraded: DEGRADED_ACTION_THRESHOLD,
        });

        return NextResponse.json({
          action,
          reason,
          cleanupResults,  // Phase 6
          cronGapCheck,    // Phase 6
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
        cleanupResults,  // Phase 6
        cronGapCheck,    // Phase 6
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

    // Get final state for response
    const finalState = await RecoveryStateService.getState();

    return NextResponse.json({
      action,
      reason,
      ...result,
      cleanupResults,  // Phase 6
      cronGapCheck,    // Phase 6
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

    // CRITICAL: Send Slack alert for auto-recovery system failure
    // This catches health endpoint failures, database connection issues, etc.
    const errorObj = error instanceof Error ? error : new Error('Unknown error');
    await sendSlackCriticalAlert('Auto-Recovery Execution Failed', errorObj);

    return NextResponse.json(
      { error: errorObj.message },
      { status: 500 }
    );
  }
}
