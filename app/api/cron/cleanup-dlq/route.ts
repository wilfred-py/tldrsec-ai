/**
 * Dead Letter Queue Cleanup Cron Endpoint
 *
 * Runs daily at 02:00 UTC to clean up old failed jobs and DLQ entries.
 *
 * Cleanup actions:
 * 1. Remove reprocessed DLQ entries older than 30 days
 * 2. Archive FAILED jobs older than 14 days from main JobQueue
 * 3. Report DLQ metrics (size, error patterns, age distribution)
 * 4. Alert if DLQ size exceeds thresholds (50=WARNING, 100=CRITICAL)
 *
 * Authentication: HMAC via CronAuthService
 * Scheduled: Daily at 02:00 UTC via Cloudflare Worker
 */

import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { DeadLetterQueueService } from '@/lib/job-queue/dead-letter-queue';
import { CronJobMonitor } from '@/lib/monitoring/cron-monitor';
import { CronAuthService } from '@/lib/cron/auth-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/cleanup-dlq
 *
 * Daily cleanup of Dead Letter Queue and old failed jobs.
 */
export async function POST(request: Request) {
  const monitor = CronJobMonitor.start('cleanup-dlq');

  try {
    // Authenticate the request using HMAC
    const authResult = await CronAuthService.authenticateRequest(request);

    if (!authResult.authenticated) {
      console.error('DLQ cleanup authentication failed:', authResult.error);
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    console.log('Starting DLQ cleanup job');

    const prisma = getPrismaClient();
    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      dlqCleaned: 0,
      failedJobsCleaned: 0,
      dlqMetrics: {
        pendingCount: 0,
        reprocessedCount: 0,
        errorPatterns: {},
        ageDistribution: {}
      },
      alerts: []
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
      results.errors.push({
        step: 'dlq_cleanup',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Step 2: Clean old FAILED jobs from main JobQueue (>14 days)
    try {
      console.log('Cleaning old FAILED jobs from main queue (>14 days)');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14);

      const oldFailedJobs = await prisma.jobQueue.deleteMany({
        where: {
          status: 'FAILED',
          createdAt: {
            lt: cutoffDate
          }
        }
      });

      results.failedJobsCleaned = oldFailedJobs.count;
      console.log(`Cleaned ${oldFailedJobs.count} old FAILED jobs from main queue`);
    } catch (error) {
      console.error('Error cleaning old FAILED jobs:', error);
      results.errors = results.errors || [];
      results.errors.push({
        step: 'failed_jobs_cleanup',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Step 3: Get DLQ metrics
    try {
      console.log('Gathering DLQ metrics');

      // Count pending and reprocessed entries
      const [pendingCount, reprocessedCount] = await Promise.all([
        prisma.deadLetterQueue.count({
          where: { reprocessed: false }
        }),
        prisma.deadLetterQueue.count({
          where: { reprocessed: true }
        })
      ]);

      results.dlqMetrics.pendingCount = pendingCount;
      results.dlqMetrics.reprocessedCount = reprocessedCount;

      // Get error patterns for pending entries
      const pendingEntries = await prisma.deadLetterQueue.findMany({
        where: { reprocessed: false },
        select: {
          lastError: true,
          createdAt: true
        }
      });

      // Analyze error patterns
      const errorPatterns: Record<string, number> = {};
      const now = Date.now();
      const ageDistribution = {
        lessThan1Hour: 0,
        lessThan1Day: 0,
        lessThan1Week: 0,
        moreThan1Week: 0
      };

      for (const entry of pendingEntries) {
        // Error patterns
        if (entry.lastError) {
          const errorKey = entry.lastError.substring(0, 50); // First 50 chars
          errorPatterns[errorKey] = (errorPatterns[errorKey] || 0) + 1;
        }

        // Age distribution
        const age = now - entry.createdAt.getTime();
        const hourMs = 60 * 60 * 1000;
        const dayMs = 24 * hourMs;
        const weekMs = 7 * dayMs;

        if (age < hourMs) {
          ageDistribution.lessThan1Hour++;
        } else if (age < dayMs) {
          ageDistribution.lessThan1Day++;
        } else if (age < weekMs) {
          ageDistribution.lessThan1Week++;
        } else {
          ageDistribution.moreThan1Week++;
        }
      }

      results.dlqMetrics.errorPatterns = errorPatterns;
      results.dlqMetrics.ageDistribution = ageDistribution;

      console.log('DLQ metrics:', {
        pending: pendingCount,
        reprocessed: reprocessedCount,
        errorPatterns: Object.keys(errorPatterns).length
      });
    } catch (error) {
      console.error('Error gathering DLQ metrics:', error);
      results.errors = results.errors || [];
      results.errors.push({
        step: 'dlq_metrics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Step 4: Alert if DLQ size exceeds thresholds
    const dlqCount = results.dlqMetrics.pendingCount;
    let alertLevel: 'WARNING' | 'CRITICAL' | null = null;

    if (dlqCount >= 100) {
      alertLevel = 'CRITICAL';
      results.alerts.push({
        level: 'CRITICAL',
        message: `DLQ has ${dlqCount} pending entries (>= 100 threshold)`,
        recommendation: 'Investigate failed jobs immediately and address systemic issues'
      });
    } else if (dlqCount >= 50) {
      alertLevel = 'WARNING';
      results.alerts.push({
        level: 'WARNING',
        message: `DLQ has ${dlqCount} pending entries (>= 50 threshold)`,
        recommendation: 'Monitor DLQ growth and investigate error patterns'
      });
    }

    if (alertLevel) {
      console.warn(`DLQ alert: ${alertLevel} - ${dlqCount} pending entries`);
    }

    // Mark job as completed
    monitor.complete({
      source: 'cleanup-dlq',
      dlqCleaned: results.dlqCleaned,
      failedJobsCleaned: results.failedJobsCleaned,
      dlqPendingCount: results.dlqMetrics.pendingCount,
      alertLevel: alertLevel || 'NONE'
    });

    console.log('DLQ cleanup job completed successfully');

    return NextResponse.json(
      {
        success: true,
        ...results
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('DLQ cleanup job failed:', errorMessage);

    monitor.fail(errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/cleanup-dlq
 *
 * Not supported - cleanup must be triggered via POST with authentication.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Method not allowed',
      message: 'DLQ cleanup must be triggered via POST with HMAC authentication',
      documentation: 'See CLAUDE.md for usage instructions'
    },
    { status: 405 }
  );
}
