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
 * - Cron execution gaps (Cloudflare Worker failures) - Phase 5
 * - Orphaned filings (unprocessed with no jobs) - Phase 5
 *
 * Health Statuses:
 * - HEALTHY: All systems operating normally
 * - DEGRADED: Some issues detected but pipeline is functional
 *   - Stale PROCESSING jobs detected
 *   - No completions in >60 minutes
 *   - Orphaned filings exist
 *   - General issues present
 * - CRITICAL: Pipeline may be stalled or severely impacted
 *   - Exhausted RETRYING jobs (caused 41-hour stall in Jan 2026)
 *   - Invalid job types (can never complete)
 *   - No completions in >180 minutes
 *   - Cron execution gap >20 minutes (Cloudflare Worker likely failed)
 * - ERROR: Unable to determine pipeline status
 *
 * @see docs/plans/2026-01-05-100-percent-pipeline-uptime.md
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 5
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pipelineLogger = logger.child('pipeline-health');

/**
 * Response cache for health endpoint
 * Caches the full response for 30 seconds to prevent redundant database queries.
 * This is especially important given Supabase's 5-connection pool limit.
 */
interface CachedResponse {
  data: PipelineHealthResponse;
  timestamp: number;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 1000; // 30 seconds
let responseCache: CachedResponse | null = null;

/**
 * Clear the health endpoint cache.
 * Exported for testing purposes.
 */
export function clearHealthCache(): void {
  responseCache = null;
}

/**
 * Check if cached response is still valid.
 */
function getCachedResponse(): PipelineHealthResponse | null {
  if (!responseCache) return null;
  if (Date.now() > responseCache.expiresAt) {
    responseCache = null;
    return null;
  }
  return responseCache.data;
}

/**
 * Store response in cache.
 */
function setCachedResponse(data: PipelineHealthResponse): void {
  responseCache = {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

/**
 * Orphan detection timing (no longer sampled).
 *
 * Previously, orphan detection was sampled every 6th request for performance.
 * Analysis showed the query is lightweight (~5ms), so we now run it on every
 * request for faster detection (target: <15 seconds to detect orphaned filings).
 *
 * @see docs/plans/2026-01-26-pipeline-resilience-zero-intervention.md Phase 2
 */
let lastOrphanCheckTime: Date | null = null;

/**
 * Reset orphan check state.
 * Exported for testing purposes.
 */
export function resetOrphanSampleCounter(): void {
  lastOrphanCheckTime = null;
}

/**
 * Result type for the aggregated JobQueue statistics query.
 * Uses BigInt because PostgreSQL COUNT returns bigint.
 */
interface JobQueueAggregatedStats {
  pending_count: bigint;
  processing_count: bigint;
  completed_1h_count: bigint;
  completed_24h_count: bigint;
  dead_letter_count: bigint;
  retrying_count: bigint;
  stale_processing_count: bigint;
  invalid_job_type_count: bigint;
  high_retry_count: bigint;
  exhausted_retrying_count: bigint;
}

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
  // Phase 5: Cron execution monitoring
  cronExecution: {
    lastExecution: string | null;
    minutesSinceLastCron: number | null;
    gapsDetected: number;
  };
  // Phase 5: Orphaned filing monitoring
  filings: {
    orphanedCount: number;
    unprocessedTotal: number;
    orphanedCountSampled?: boolean;
    lastOrphanCheck?: string | null;
  };
  // NEW: TickerMonitoring health check (critical for discovery)
  tickerMonitoring: {
    totalRecords: number;
    activeRecords: number;
    userTickersWithoutMonitoring: number;
    missingTickers: string[];
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
 * NOTE: These values are hardcoded in the aggregated SQL query for performance.
 * If adding new job types, update the SQL in the aggregated query below.
 */
const _VALID_JOB_TYPES = [
  'ASYNC_DISCOVER_FILINGS',
  'ASYNC_FETCH_FILING',
  'ASYNC_SUMMARIZE_CACHED'
];

/**
 * Time thresholds for detecting stale jobs
 */
const STALE_PROCESSING_MINUTES = 15;
const HIGH_RETRY_THRESHOLD = 2; // Jobs with retryCount >= this are "approaching" max

/**
 * Phase 5: Cron execution gap thresholds
 * - DEGRADED: 15-20 minutes without cron execution
 * - CRITICAL: >20 minutes without cron execution (Cloudflare Worker likely failed)
 */
const CRON_GAP_DEGRADED_MINUTES = 15;
const CRON_GAP_CRITICAL_MINUTES = 20;

/**
 * Phase 5: Orphaned filing thresholds
 * - Only consider filings older than this as potentially orphaned
 */
const ORPHAN_AGE_THRESHOLD_MINUTES = 10;

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

  // Check for cache bypass via header or query parameter
  // Query parameter is used as fallback for test environments where headers may not work
  const url = new URL(request.url);
  const cacheControlHeader = request.headers.get('Cache-Control');
  const bypassCache = cacheControlHeader?.includes('no-cache') ||
                      url.searchParams.get('bypass-cache') === 'true';

  // Check cache first (unless bypass requested)
  if (!bypassCache) {
    const cached = getCachedResponse();
    if (cached) {
      pipelineLogger.debug('Returning cached health response');
      return NextResponse.json(cached, {
        status: cached.status === 'CRITICAL' ? 503 : cached.status === 'ERROR' ? 500 : 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Pipeline-Status': cached.status,
          'X-Cache': 'HIT',
          'X-Cache-Age': String(Math.floor((Date.now() - (responseCache?.timestamp || 0)) / 1000)),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block'
        }
      });
    }
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
    // Phase 5: Thresholds for orphaned filing detection
    const orphanAgeThreshold = new Date(now.getTime() - ORPHAN_AGE_THRESHOLD_MINUTES * 60 * 1000);

    // OPTIMIZED: Single aggregated query for all JobQueue counts
    // This replaces 10 separate Prisma count() queries with 1 SQL query using PostgreSQL FILTER clause.
    // Reduces database round-trips from 10 to 1 for JobQueue metrics, preventing connection pool exhaustion.
    const jobQueueStats = await prisma.$queryRaw<JobQueueAggregatedStats[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND "completedAt" >= ${oneHourAgo}) as completed_1h_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND "completedAt" >= ${oneDayAgo}) as completed_24h_count,
        COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') as dead_letter_count,
        COUNT(*) FILTER (WHERE status = 'RETRYING') as retrying_count,
        COUNT(*) FILTER (WHERE status = 'PROCESSING' AND "startedAt" < ${staleProcessingCutoff}) as stale_processing_count,
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'RETRYING', 'PROCESSING')
          AND "jobType" NOT IN ('ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED')
        ) as invalid_job_type_count,
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'RETRYING')
          AND "retryCount" >= ${HIGH_RETRY_THRESHOLD}
        ) as high_retry_count,
        COUNT(*) FILTER (
          WHERE status = 'RETRYING'
          AND "retryCount" >= "maxRetries"
        ) as exhausted_retrying_count
      FROM pipeline."JobQueue"
    `;

    // Extract counts from aggregated result (convert BigInt to number)
    const stats = jobQueueStats[0];
    const pendingCount = Number(stats.pending_count);
    const processingCount = Number(stats.processing_count);
    const completedLast1h = Number(stats.completed_1h_count);
    const completedLast24h = Number(stats.completed_24h_count);
    const deadLetterCount = Number(stats.dead_letter_count);
    const retryingCount = Number(stats.retrying_count);
    const staleProcessingCount = Number(stats.stale_processing_count);
    const invalidJobTypeCount = Number(stats.invalid_job_type_count);
    const highRetryCount = Number(stats.high_retry_count);
    const exhaustedRetryingCount = Number(stats.exhausted_retrying_count);

    // Remaining queries that still need Prisma (complex operations that can't be aggregated)
    // These run in parallel but are only 7 queries vs the original 14
    const [
      lastCompletedJob,
      recentCronExecutions,
      unprocessedFilingsOlderThanThreshold,
      unprocessedFilingsTotal,
      tickerMonitoringTotal,
      tickerMonitoringActive,
      userTickerSymbols
    ] = await Promise.all([
      // Last completed job (needs findFirst with orderBy)
      prisma.jobQueue.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true }
      }),
      // Phase 5: Get recent cron executions (last 60 minutes)
      prisma.cronJobExecution.findMany({
        where: {
          startedAt: { gte: oneHourAgo },
        },
        select: { startedAt: true },
        orderBy: { startedAt: 'desc' },
      }),
      // Phase 5: Unprocessed filings older than threshold (potentially orphaned)
      // NOTE: processed field is on RssFilingCheck, not SecFiling
      prisma.rssFilingCheck.findMany({
        where: {
          processed: false,
          createdAt: { lt: orphanAgeThreshold },
        },
        select: { id: true },
        take: 100, // Limit for performance
      }),
      // Phase 5: Total unprocessed filings count
      prisma.rssFilingCheck.count({
        where: { processed: false },
      }),
      // NEW: TickerMonitoring health check - total records
      prisma.tickerMonitoring.count(),
      // NEW: TickerMonitoring health check - active records
      prisma.tickerMonitoring.count({
        where: { isActive: true },
      }),
      // NEW: Get all unique user ticker symbols to check for missing monitoring
      prisma.ticker.findMany({
        select: { symbol: true },
        distinct: ['symbol'],
      }),
    ]);

    // Phase 5: Calculate cron execution metrics
    const lastCronExecution = recentCronExecutions[0]?.startedAt || null;
    const minutesSinceLastCron = lastCronExecution
      ? Math.floor((now.getTime() - lastCronExecution.getTime()) / 60000)
      : null;

    // Phase 5: Detect cron execution gaps
    let cronGapsDetected = 0;
    if (recentCronExecutions.length === 0) {
      // No executions in last hour = one big gap
      cronGapsDetected = 1;
    } else {
      // Check for gaps >15 minutes between executions
      const sortedExecutions = [...recentCronExecutions].sort(
        (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
      );

      // Check gap from now to most recent execution
      if (minutesSinceLastCron !== null && minutesSinceLastCron > CRON_GAP_DEGRADED_MINUTES) {
        cronGapsDetected++;
      }

      // Check gaps between executions
      for (let i = 0; i < sortedExecutions.length - 1; i++) {
        const gapMinutes = (sortedExecutions[i].startedAt.getTime() - sortedExecutions[i + 1].startedAt.getTime()) / (60 * 1000);
        if (gapMinutes > CRON_GAP_DEGRADED_MINUTES) {
          cronGapsDetected++;
        }
      }
    }

    // Phase 5 + Zero-Intervention Phase 2: Calculate orphaned filings count (ALWAYS, no sampling)
    // Orphaned = unprocessed AND old enough AND no active job referencing them
    // The query is lightweight (~5ms), so we run it on every request for faster detection.
    // @see docs/plans/2026-01-26-pipeline-resilience-zero-intervention.md Phase 2
    let orphanedFilingCount = 0;
    const orphanedCountSampled = false; // No longer sampled

    if (unprocessedFilingsOlderThanThreshold.length > 0) {
      const potentialOrphanIds = unprocessedFilingsOlderThanThreshold.map(f => f.id);

      // Check which of these have active jobs
      const jobsForFilings = await prisma.jobQueue.findMany({
        where: {
          status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] },
          OR: potentialOrphanIds.map(id => ({
            payload: { path: ['filingId'], equals: id },
          })),
        },
        select: { payload: true },
      });

      const filingIdsWithJobs = new Set(
        jobsForFilings
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(j => (j.payload as any)?.filingId)
          .filter(Boolean)
      );

      orphanedFilingCount = potentialOrphanIds.filter(id => !filingIdsWithJobs.has(id)).length;
      lastOrphanCheckTime = now;
    } else {
      // No candidates older than threshold
      orphanedFilingCount = 0;
      lastOrphanCheckTime = now;
    }

    // Calculate time since last completion
    const lastCompletionTime = lastCompletedJob?.completedAt || null;
    const minutesSinceLastCompletion = lastCompletionTime
      ? Math.floor((now.getTime() - lastCompletionTime.getTime()) / 60000)
      : null;

    // NEW: Check TickerMonitoring health (critical for discovery phase)
    // Get all ticker monitoring symbols to compare against user tickers
    const tickerMonitoringSymbols = await prisma.tickerMonitoring.findMany({
      where: { isActive: true },
      select: { symbol: true },
    });
    const monitoredSymbolSet = new Set(tickerMonitoringSymbols.map(t => t.symbol));
    const userSymbols = userTickerSymbols.map(t => t.symbol);
    const missingTickers = userSymbols.filter(s => !monitoredSymbolSet.has(s));
    const userTickersWithoutMonitoring = missingTickers.length;

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

    // Phase 5: Detect cron execution gaps
    if (minutesSinceLastCron !== null && minutesSinceLastCron > CRON_GAP_CRITICAL_MINUTES) {
      issues.push(`Cron execution gap detected: ${minutesSinceLastCron} minutes since last execution`);
      recommendations.push('Check Cloudflare Worker status and logs');
    } else if (minutesSinceLastCron !== null && minutesSinceLastCron > CRON_GAP_DEGRADED_MINUTES) {
      issues.push(`Cron execution gap warning: ${minutesSinceLastCron} minutes since last execution`);
      recommendations.push('Monitor Cloudflare Worker for potential issues');
    }

    // Phase 5: Detect orphaned filings
    if (orphanedFilingCount > 0) {
      issues.push(`Orphaned filings detected: ${orphanedFilingCount} unprocessed filings with no active jobs`);
      recommendations.push('Run orphaned filing recovery: OrphanedFilingDetector.checkAndRecover()');
    }

    // NEW: Detect TickerMonitoring issues (CRITICAL - empty table caused complete discovery failure)
    // This was a critical bug discovered 2026-01-27 where the 3-phase pipeline didn't create
    // TickerMonitoring records, causing discovery to silently skip all tickers.
    if (tickerMonitoringActive === 0 && userSymbols.length > 0) {
      issues.push(`CRITICAL: TickerMonitoring table is EMPTY - discovery will skip ALL tickers`);
      recommendations.push('URGENT: Run discovery job manually or restart pipeline to populate TickerMonitoring');
    } else if (userTickersWithoutMonitoring > 0) {
      issues.push(`${userTickersWithoutMonitoring} user tickers missing from TickerMonitoring: ${missingTickers.slice(0, 5).join(', ')}${missingTickers.length > 5 ? '...' : ''}`);
      recommendations.push('Run getActiveTickersForMonitoring() to create missing records');
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
      invalidJobTypeCount > 0 ||     // NEW: Jobs that can never complete
      // Phase 5: Cron execution gap >20 minutes (Cloudflare Worker likely failed)
      (minutesSinceLastCron !== null && minutesSinceLastCron > CRON_GAP_CRITICAL_MINUTES) ||
      // NEW: Empty TickerMonitoring with active user tickers - discovery will fail completely
      (tickerMonitoringActive === 0 && userSymbols.length > 0)
    ) {
      status = 'CRITICAL';
    }
    // DEGRADED conditions - issues detected but pipeline may recover
    else if (
      lockMetrics.healthStatus === 'WARNING' ||
      issues.length > 0 ||
      (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > 60) ||
      staleProcessingCount > 0 ||  // NEW: Jobs might be hung
      // Phase 5: Orphaned filings exist
      orphanedFilingCount > 0 ||
      // Phase 5: Cron execution gap 15-20 minutes
      (minutesSinceLastCron !== null && minutesSinceLastCron > CRON_GAP_DEGRADED_MINUTES)
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
      // Phase 5: Cron execution monitoring
      cronExecution: {
        lastExecution: lastCronExecution?.toISOString() || null,
        minutesSinceLastCron,
        gapsDetected: cronGapsDetected,
      },
      // Phase 5: Orphaned filing monitoring (with sampling for performance)
      filings: {
        orphanedCount: orphanedFilingCount,
        unprocessedTotal: unprocessedFilingsTotal,
        orphanedCountSampled,
        lastOrphanCheck: lastOrphanCheckTime?.toISOString() || null,
      },
      // NEW: TickerMonitoring health check (critical for discovery)
      tickerMonitoring: {
        totalRecords: tickerMonitoringTotal,
        activeRecords: tickerMonitoringActive,
        userTickersWithoutMonitoring,
        missingTickers: missingTickers.slice(0, 10), // Limit to first 10 for response size
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

    // Cache the response
    setCachedResponse(response);

    return NextResponse.json(response, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Pipeline-Status': status,
        'X-Response-Time': `${duration}ms`,
        'X-Cache': 'MISS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    pipelineLogger.error('Pipeline health check failed', {
      error: errorMessage,
      errorName,
      stack: errorStack,
      duration
    });

    console.error('[Pipeline Health] Detailed error:', {
      message: errorMessage,
      name: errorName,
      stack: errorStack,
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
      // Phase 5: Cron execution monitoring
      cronExecution: {
        lastExecution: null,
        minutesSinceLastCron: null,
        gapsDetected: 0,
      },
      // Phase 5: Orphaned filing monitoring
      filings: {
        orphanedCount: 0,
        unprocessedTotal: 0,
      },
      // NEW: TickerMonitoring health check
      tickerMonitoring: {
        totalRecords: 0,
        activeRecords: 0,
        userTickersWithoutMonitoring: 0,
        missingTickers: [],
      },
      lastCompletion: null,
      minutesSinceLastCompletion: null,
      issues: [`Failed to check pipeline health: ${errorMessage}`],
      recommendations: ['Check system health or contact support'],
      timestamp: new Date().toISOString(),
      // Add debug info in development/error responses
      debug: {
        errorName,
        errorMessage: errorMessage.substring(0, 500), // Limit length
        duration
      }
    } as PipelineHealthResponse & { debug?: unknown }, {
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
