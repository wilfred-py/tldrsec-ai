/**
 * Pipeline Health Monitoring Endpoint
 *
 * This endpoint provides comprehensive health status for the SEC filing pipeline.
 * It monitors:
 * - Lock health (stale/expired locks that can block processing)
 * - Job queue status (pending, processing, completed jobs)
 * - Processing latency (time since last completion)
 * - Pipeline throughput (jobs completed in last hour)
 *
 * Health Statuses:
 * - HEALTHY: All systems operating normally
 * - DEGRADED: Some issues detected but pipeline is functional
 * - CRITICAL: Pipeline may be stalled or severely impacted
 * - ERROR: Unable to determine pipeline status
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pipelineLogger = logger.child('pipeline-health');

interface PipelineHealthResponse {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
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
  };
  lastCompletion: string | null;
  minutesSinceLastCompletion: number | null;
  issues: string[];
  recommendations: string[];
  timestamp: string;
}

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
    const prisma = getPrismaClient();

    // Get lock health metrics
    const lockMetrics = await LockService.getLockHealthMetrics();

    // Get job queue statistics
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Count jobs by status
    const [
      pendingCount,
      processingCount,
      completedLast1h,
      completedLast24h,
      deadLetterCount,
      retryingCount,
      lastCompletedJob
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
      })
    ]);

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

    // Determine overall health status
    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR' = 'HEALTHY';

    if (lockMetrics.healthStatus === 'CRITICAL' ||
        (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 180)) {
      status = 'CRITICAL';
    } else if (lockMetrics.healthStatus === 'WARNING' ||
               issues.length > 0 ||
               (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 60)) {
      status = 'DEGRADED';
    }

    const response: PipelineHealthResponse = {
      status,
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
        retrying: retryingCount
      },
      lastCompletion: lastCompletionTime?.toISOString() || null,
      minutesSinceLastCompletion,
      issues,
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
        retrying: 0
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
