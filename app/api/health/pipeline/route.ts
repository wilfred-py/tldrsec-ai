/**
 * Pipeline Health Monitoring Endpoint
 *
 * This endpoint provides comprehensive health status for the SEC filing pipeline.
 * It monitors:
 * - Lock health (stale/expired locks that can block processing)
 * - Job queue status (pending, processing, completed jobs)
 * - Processing latency (time since last completion)
 * - Pipeline throughput (jobs completed in last hour)
 * - Exhausted RETRYING jobs (retryCount >= maxRetries, CRITICAL condition)
 * - Stale PROCESSING jobs (stuck for >15 minutes)
 * - Invalid job types (jobs with no handler)
 * - Jobs approaching max retries (early warning)
 *
 * Health Statuses:
 * - HEALTHY: All systems operating normally
 * - DEGRADED: Some issues detected but pipeline is functional
 *   - Stale PROCESSING jobs detected
 *   - No completions in >60 minutes
 *   - General issues present
 * - CRITICAL: Pipeline may be stalled or severely impacted
 *   - Exhausted RETRYING jobs (caused 41-hour stall in Jan 2026)
 *   - Invalid job types (can never complete)
 *   - No completions in >180 minutes
 * - ERROR: Unable to determine pipeline status
 *
 * @see docs/plans/2026-01-05-100-percent-pipeline-uptime.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pipelineLogger = logger.child('pipeline-health');

interface DatabaseInfo {
  provider: 'supabase' | 'neon' | 'unknown';
  hasAppSchema: boolean;
  hasPipelineSchema: boolean;
  migrationComplete: boolean;
}

interface PipelineHealthResponse {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
  database: DatabaseInfo;
  locks: {
    healthStatus: string;
    staleCount: number;
    activeCount: number;
  };
  jobs: {
    pending: number;
    processing: number;
    completedLast1h: number;
    completedLast24h: number;
    deadLetter: number;
    retrying: number;
    exhaustedRetrying: number;
    staleProcessing: number;
    invalidJobTypes: number;
    highRetryCount: number;
  };
  lastCompletion: string | null;
  minutesSinceLastCompletion: number | null;
  issues: string[];
  warnings?: string[];
  recommendations: string[];
  timestamp: string;
}

/**
 * Valid job types that have handlers in the system.
 * Jobs with types not in this list are considered invalid and will be cleaned up.
 */
const VALID_JOB_TYPES = [
  'ASYNC_DISCOVER_FILINGS',
  'ASYNC_FETCH_FILING',
  'ASYNC_SUMMARIZE_CACHED'
];

/**
 * Time thresholds for detecting stale jobs
 */
const STALE_PROCESSING_MINUTES = 15;
const HIGH_RETRY_THRESHOLD = 2; // Jobs with retryCount >= this are "approaching" max

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Add rate limiting to prevent abuse of expensive database queries
  try {
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    request.ip || 
                    'unknown';
    
    // Import rate limiter dynamically
    const { rateLimiter } = await import('../../../../lib/security/rate-limiter');
    const rateLimitResult = await rateLimiter.checkLimit('health-endpoint', clientIP);
    
    if (!rateLimitResult || !rateLimitResult.allowed) {
      pipelineLogger.warn('Health endpoint rate limit exceeded', { clientIP });
      return NextResponse.json({
        status: 'ERROR',
        error: 'Rate limit exceeded. Please try again later.',
        timestamp: new Date().toISOString()
      }, { 
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Remaining': '0'
        }
      });
    }
  } catch (rateLimitError) {
    // Continue if rate limiter fails, but log the issue
    pipelineLogger.warn('Rate limiter check failed', { 
      error: rateLimitError instanceof Error ? rateLimitError.message : 'Unknown error' 
    });
  }

  try {
    // Dynamic import to avoid build-time dependencies
    const { getPrismaClient } = await import('../../../../lib/db/prisma');
    const { LockService } = await import('../../../../lib/job-queue/lock-service');
    const { checkDatabaseSchemas } = await import('../../../../lib/db/supabase-config');
    const prisma = getPrismaClient();

    // Get database source information
    const schemaDiagnostic = await checkDatabaseSchemas();
    const databaseInfo: DatabaseInfo = {
      provider: schemaDiagnostic.databaseType,
      hasAppSchema: schemaDiagnostic.foundSchemas.includes('app'),
      hasPipelineSchema: schemaDiagnostic.foundSchemas.includes('pipeline'),
      migrationComplete: schemaDiagnostic.migrationComplete,
    };

    // Check for database configuration issues
    if (!schemaDiagnostic.migrationComplete) {
      if (schemaDiagnostic.databaseType === 'neon') {
        issues.push('DATABASE_URL points to Neon instead of Supabase');
        recommendations.push('Update DATABASE_URL in Vercel to point to Supabase');
      } else if (!schemaDiagnostic.hasExpectedSchemas) {
        issues.push(`Missing required schemas: ${schemaDiagnostic.message}`);
        recommendations.push('Run Prisma migrations to create app and pipeline schemas');
      }
    }

    // Get lock health metrics
    const lockMetrics = await LockService.getLockHealthMetrics();

    // Get job queue statistics
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Count jobs by status - including new stuck job detection
    const staleProcessingCutoff = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60 * 1000);

    const [
      pendingCount,
      processingCount,
      completedLast1h,
      completedLast24h,
      deadLetterCount,
      retryingCount,
      lastCompletedJob,
      // New metrics for stuck job detection
      staleProcessingCount,
      invalidJobTypeCount,
      highRetryCount,
      exhaustedRetryingResult
    ] = await Promise.all([
      prisma.jobQueue.count({
        where: { status: 'PENDING' }
      }),
      prisma.jobQueue.count({
        where: { status: 'PROCESSING' }
      }),
      prisma.jobQueue.count({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: oneHourAgo }
        }
      }),
      prisma.jobQueue.count({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: oneDayAgo }
        }
      }),
      prisma.jobQueue.count({
        where: { status: 'DEAD_LETTER' }
      }),
      prisma.jobQueue.count({
        where: { status: 'RETRYING' }
      }),
      prisma.jobQueue.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true }
      }),
      // Stale PROCESSING jobs (stuck for > 15 minutes)
      prisma.jobQueue.count({
        where: {
          status: 'PROCESSING',
          startedAt: { lt: staleProcessingCutoff }
        }
      }),
      // Invalid job types (no handler exists)
      prisma.jobQueue.count({
        where: {
          status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] },
          jobType: { notIn: VALID_JOB_TYPES }
        }
      }),
      // Jobs approaching max retries (high retry count)
      prisma.jobQueue.count({
        where: {
          status: { in: ['PENDING', 'RETRYING'] },
          retryCount: { gte: HIGH_RETRY_THRESHOLD }
        }
      }),
      // RETRYING jobs with exhausted retries (retryCount >= maxRetries)
      // Using raw query for the comparison between two columns
      prisma.$queryRaw<{count: bigint}[]>`
        SELECT COUNT(*) as count
        FROM pipeline."JobQueue"
        WHERE "status" = 'RETRYING'
          AND "retryCount" >= "maxRetries"
      `
    ]);

    // Extract exhausted retrying count from raw query result
    const exhaustedRetryingCount = Number(exhaustedRetryingResult[0]?.count || 0);

    // Calculate time since last completion
    const lastCompletionTime = lastCompletedJob?.completedAt || null;
    const minutesSinceLastCompletion = lastCompletionTime
      ? Math.floor((now.getTime() - lastCompletionTime.getTime()) / 60000)
      : null;

    // Analyze issues
    if (lockMetrics.staleLocksCount > 0) {
      issues.push(`${lockMetrics.staleLocksCount} stale locks detected`);
      recommendations.push('Run lock cleanup: npx tsx scripts/cleanup-locks.ts');
    }

    if (lockMetrics.healthStatus === 'CRITICAL') {
      issues.push('Lock health is CRITICAL - pipeline may be blocked');
      recommendations.push('URGENT: Clear stale locks immediately');
    }

    if (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 60) {
      issues.push(`No job completions in ${minutesSinceLastCompletion} minutes`);
      if (minutesSinceLastCompletion > 120) {
        recommendations.push('Pipeline appears stalled - check Cloudflare Worker logs');
      }
    }

    if (completedLast1h === 0 && pendingCount > 0) {
      issues.push('Pending jobs exist but no completions in the last hour');
      recommendations.push('Verify Cloudflare Worker is running: wrangler tail');
    }

    if (processingCount === 0 && pendingCount > 100) {
      issues.push(`${pendingCount} pending jobs but none are processing`);
      recommendations.push('Check for lock contention or endpoint availability');
    }

    if (deadLetterCount > 1000) {
      issues.push(`${deadLetterCount} jobs in dead letter queue`);
      recommendations.push('Review dead letter jobs for patterns');
    }

    // NEW: Detect exhausted RETRYING jobs (CRITICAL - caused 41-hour stall)
    if (exhaustedRetryingCount > 0) {
      issues.push(`RETRYING jobs with exhausted retries detected: ${exhaustedRetryingCount}`);
      recommendations.push('Run: npm run verify:daily -- --force-cleanup');
    }

    // NEW: Detect stale PROCESSING jobs
    if (staleProcessingCount > 0) {
      issues.push(`PROCESSING jobs stuck for >${STALE_PROCESSING_MINUTES} minutes: ${staleProcessingCount}`);
      recommendations.push('Check for crashed workers or hung processes');
    }

    // NEW: Detect invalid job types
    if (invalidJobTypeCount > 0) {
      issues.push(`Jobs with invalid/unknown job types detected: ${invalidJobTypeCount}`);
      recommendations.push('Clean up legacy job types with invalid type names');
    }

    // Track warnings separately from critical issues
    const warnings: string[] = [];

    // NEW: Warn about jobs approaching max retries
    if (highRetryCount > 0) {
      warnings.push(`Jobs approaching max retry limit: ${highRetryCount}`);
      recommendations.push('Monitor these jobs for potential failures');
    }

    // Determine overall health status
    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR' = 'HEALTHY';

    // CRITICAL conditions - pipeline is stalled or severely impacted
    if (
      lockMetrics.healthStatus === 'CRITICAL' ||
      (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 180) ||
      exhaustedRetryingCount > 0 ||  // NEW: Jobs stuck forever without intervention
      invalidJobTypeCount > 0        // NEW: Jobs that can never complete
    ) {
      status = 'CRITICAL';
    }
    // DEGRADED conditions - issues detected but pipeline may recover
    else if (
      lockMetrics.healthStatus === 'WARNING' ||
      issues.length > 0 ||
      (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 60) ||
      staleProcessingCount > 0  // NEW: Jobs might be hung
    ) {
      status = 'DEGRADED';
    }

    const response: PipelineHealthResponse = {
      status,
      database: databaseInfo,
      locks: {
        healthStatus: lockMetrics.healthStatus,
        staleCount: lockMetrics.staleLocksCount,
        activeCount: lockMetrics.activeLocks
      },
      jobs: {
        pending: pendingCount,
        processing: processingCount,
        completedLast1h,
        completedLast24h,
        deadLetter: deadLetterCount,
        retrying: retryingCount,
        // NEW: Stuck job detection metrics
        exhaustedRetrying: exhaustedRetryingCount,
        staleProcessing: staleProcessingCount,
        invalidJobTypes: invalidJobTypeCount,
        highRetryCount: highRetryCount
      },
      lastCompletion: lastCompletionTime?.toISOString() || null,
      minutesSinceLastCompletion,
      issues,
      warnings: warnings.length > 0 ? warnings : undefined,
      recommendations,
      timestamp: now.toISOString()
    };

    const duration = Date.now() - startTime;

    pipelineLogger.info('Pipeline health check completed', {
      status,
      duration,
      issues: issues.length,
      lockHealth: lockMetrics.healthStatus,
      pendingJobs: pendingCount,
      completedLast1h
    });

    // Return appropriate HTTP status code
    const httpStatus = status === 'CRITICAL' ? 503 :
                       status === 'ERROR' ? 500 : 200;

    return NextResponse.json(response, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Pipeline-Status': status,
        'X-Response-Time': `${duration}ms`,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    pipelineLogger.error('Pipeline health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration
    });

    return NextResponse.json({
      status: 'ERROR',
      database: {
        provider: 'unknown',
        hasAppSchema: false,
        hasPipelineSchema: false,
        migrationComplete: false,
      },
      locks: {
        healthStatus: 'UNKNOWN',
        staleCount: 0,
        activeCount: 0
      },
      jobs: {
        pending: 0,
        processing: 0,
        completedLast1h: 0,
        completedLast24h: 0,
        deadLetter: 0,
        retrying: 0,
        exhaustedRetrying: 0,
        staleProcessing: 0,
        invalidJobTypes: 0,
        highRetryCount: 0
      },
      lastCompletion: null,
      minutesSinceLastCompletion: null,
      issues: ['Failed to check pipeline health'],
      recommendations: ['Check system health or contact support'],
      timestamp: new Date().toISOString()
    } as PipelineHealthResponse, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
        'X-Pipeline-Status': 'ERROR',
        'X-Response-Time': `${duration}ms`,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      }
    });
  }
}
