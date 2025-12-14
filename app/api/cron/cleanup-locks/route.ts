/**
 * Proactive Lock Cleanup Endpoint
 *
 * This endpoint is called as Step 0 by the Cloudflare Worker before any other
 * cron operations. It ensures stale locks are cleaned up proactively, preventing
 * pipeline stalls caused by abandoned locks.
 *
 * Why This Exists:
 * - The pipeline was stalled for 8 days because a production lock expired but was
 *   never cleaned up (the lock cleanup was reactive, only running during lock acquisition)
 * - If Cloudflare Worker gets 429 responses or fails to acquire locks, cleanup never runs
 * - This endpoint runs BEFORE lock acquisition, ensuring cleanup always happens
 *
 * Security: Requires HMAC authentication from Cloudflare Worker
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { generateSecureExecutionId } from '../../../../lib/security/secure-random';
import { CronAuthService } from '../../../../lib/cron/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cleanupLogger = logger.child('cleanup-locks');

/**
 * GET /api/cron/cleanup-locks
 *
 * Proactively cleans up expired locks and returns health metrics.
 * Called as Step 0 by Cloudflare Worker before tier-aware/fetch/summarize steps.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('cleanup');

  cleanupLogger.info(`[${executionId}] Proactive lock cleanup endpoint called`);

  try {
    // Validate authentication (same as other cron endpoints)
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      cleanupLogger.warn(`[${executionId}] Authentication failed`, {
        error: authResult.error,
        clientIP: authResult.clientIP
      });

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

    // Import LockService dynamically to avoid issues during build
    const { LockService } = await import('../../../../lib/job-queue/lock-service');

    // Step 1: Clean up expired locks
    const cleanedCount = await LockService.cleanupExpiredLocks();

    // Step 2: Get lock health metrics
    const healthMetrics = await LockService.getLockHealthMetrics();

    const duration = Date.now() - startTime;

    cleanupLogger.info(`[${executionId}] Lock cleanup completed`, {
      cleanedCount,
      healthStatus: healthMetrics.healthStatus,
      activeLocks: healthMetrics.activeLocks,
      staleLocksCount: healthMetrics.staleLocksCount,
      duration
    });

    // Return health metrics for monitoring
    return NextResponse.json({
      success: true,
      executionId,
      duration,
      cleanup: {
        expiredLocksCleared: cleanedCount,
        timestamp: new Date().toISOString()
      },
      health: {
        status: healthMetrics.healthStatus,
        activeLocks: healthMetrics.activeLocks,
        staleLocksCount: healthMetrics.staleLocksCount,
        recentLocks: healthMetrics.recentLocks,
        locksByType: healthMetrics.locksByType
      },
      message: cleanedCount > 0
        ? `Cleared ${cleanedCount} expired lock(s)`
        : 'No expired locks found'
    }, {
      headers: {
        'X-Execution-ID': executionId,
        'X-Locks-Cleaned': String(cleanedCount),
        'X-Health-Status': healthMetrics.healthStatus
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    cleanupLogger.error(`[${executionId}] Lock cleanup failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration
    });

    return NextResponse.json({
      success: false,
      error: 'Lock cleanup failed',
      executionId,
      duration
    }, { status: 500 });
  }
}
