/**
 * Backup Trigger Endpoint
 *
 * Called by the external watchdog worker when the primary Cloudflare Worker
 * appears to have failed. This provides redundant pipeline triggering.
 *
 * Features:
 * - Authentication via BACKUP_TRIGGER_SECRET
 * - Mutual exclusion check (skips if primary ran recently)
 * - Queues discovery job same as primary trigger
 * - Logs execution for monitoring
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 4
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { generateSecureExecutionId } from '@/lib/security/secure-random';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const backupLogger = logger.child('backup-trigger');

/**
 * POST /api/cron/backup-trigger
 *
 * Triggers the SEC filing pipeline as a backup when watchdog detects
 * that the primary Cloudflare Worker has stopped executing.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const executionId = generateSecureExecutionId('backup');

  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.BACKUP_TRIGGER_SECRET;

  if (!expectedToken) {
    backupLogger.warn(`[${executionId}] BACKUP_TRIGGER_SECRET not configured`);
    return NextResponse.json(
      { error: 'Backup trigger not configured', executionId },
      { status: 503 }
    );
  }

  if (authHeader !== `Bearer ${expectedToken}`) {
    backupLogger.warn(`[${executionId}] Unauthorized backup trigger attempt`);
    return NextResponse.json({ error: 'Unauthorized', executionId }, { status: 401 });
  }

  try {
    // Parse request body
    let body: { source?: string; timestamp?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    const source = body.source || 'watchdog';
    const timestamp = body.timestamp || new Date().toISOString();

    backupLogger.info(`[${executionId}] Backup trigger received`, { source, timestamp });

    // Check if primary cron ran recently (within last 10 minutes)
    const recentExecution = await checkRecentPrimaryExecution();

    if (recentExecution) {
      backupLogger.info(`[${executionId}] Primary cron ran recently, skipping backup`, {
        lastPrimaryExecution: recentExecution.startedAt,
        lastPrimaryExecutionId: recentExecution.executionId,
      });

      return NextResponse.json({
        success: true,
        skipped: true,
        executionId,
        reason: 'Primary cron executed within last 10 minutes',
        lastPrimaryExecution: recentExecution.startedAt.toISOString(),
        lastPrimaryExecutionId: recentExecution.executionId,
        duration: Date.now() - startTime,
      });
    }

    // No recent primary execution - run the pipeline
    backupLogger.info(`[${executionId}] No recent primary execution, triggering backup pipeline`);

    // Queue discovery job (same as tier-aware route)
    const { JobQueueService } = await import('@/lib/job-queue');

    const discoveryJob = await JobQueueService.addJob({
      jobType: 'ASYNC_DISCOVER_FILINGS',
      payload: {
        executionId,
        cronTriggerTime: new Date().toISOString(),
        source: 'backup-trigger',
        watchdogSource: source,
      },
      priority: 10, // High priority for discovery jobs
      maxAttempts: 3,
    });

    if (!discoveryJob) {
      throw new Error('Failed to queue discovery job');
    }

    const duration = Date.now() - startTime;

    backupLogger.info(`[${executionId}] Backup pipeline triggered successfully`, {
      discoveryJobId: discoveryJob.id,
      duration,
      source,
    });

    // Log backup execution to cron executions
    await logBackupExecution(executionId, source, discoveryJob.id);

    return NextResponse.json(
      {
        success: true,
        executionId,
        duration,
        source: 'backup-trigger',
        watchdogSource: source,
        message: 'Backup pipeline triggered - discovery job queued',
        discoveryJob: {
          id: discoveryJob.id,
          status: discoveryJob.status,
        },
      },
      {
        status: 202, // Accepted - processing happens asynchronously
        headers: {
          'X-Processing-Mode': 'backup-trigger',
          'X-Execution-ID': executionId,
          'X-Discovery-Job-ID': discoveryJob.id,
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    backupLogger.error(`[${executionId}] Backup trigger failed`, {
      error: errorMessage,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage,
        duration,
      },
      { status: 500 }
    );
  }
}

/**
 * Check if primary cron executed recently (within last 10 minutes)
 *
 * This prevents duplicate pipeline runs when both primary and backup trigger.
 */
async function checkRecentPrimaryExecution() {
  try {
    const { getPrismaClient } = await import('@/lib/db/prisma');
    const prisma = getPrismaClient();

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Look for recent executions that are NOT from backup-trigger
    const recentExecution = await prisma.cronJobExecution.findFirst({
      where: {
        startedAt: { gte: tenMinutesAgo },
        // Exclude backup-trigger executions
        NOT: {
          jobName: { contains: 'backup-trigger' },
        },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        executionId: true,
        startedAt: true,
        jobName: true,
        status: true,
      },
    });

    return recentExecution;
  } catch (error) {
    backupLogger.warn('Failed to check recent primary execution', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // On error, proceed with backup (fail safe)
    return null;
  }
}

/**
 * Log backup execution for monitoring
 */
async function logBackupExecution(
  executionId: string,
  source: string,
  discoveryJobId: string
): Promise<void> {
  try {
    const { getPrismaClient } = await import('@/lib/db/prisma');
    const prisma = getPrismaClient();

    await prisma.cronJobExecution.create({
      data: {
        executionId,
        jobName: `sec-filing-monitor:backup-trigger:${source}`,
        status: 'SUCCESS',
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0, // Immediate queueing, actual work is async
        environment: process.env.NODE_ENV || 'production',
        // Store additional context in error fields (since we don't have metadata)
        errorMessage: JSON.stringify({
          source,
          discoveryJobId,
          type: 'backup-trigger',
        }),
      },
    });
  } catch (error) {
    backupLogger.warn('Failed to log backup execution', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Non-critical, don't fail the request
  }
}
