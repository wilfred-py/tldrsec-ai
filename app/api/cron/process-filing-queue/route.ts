/**
 * Process Filing Queue API Endpoint
 *
 * Triggers background filing processing from the job queue.
 * Called by:
 * 1. Vercel Cron (every 5 minutes)
 * 2. Manual trigger for debugging
 * 3. Cloudflare Worker (alternative trigger)
 *
 * Pattern: Process one batch per invocation (5-10 minutes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { BackgroundFilingWorker } from '@/lib/cron/background-filing-worker';
import type { BatchProcessingResult } from '@/lib/cron/background-filing-worker';
import { logger } from '@/lib/logging';
import { CronAuthService } from '@/lib/cron/auth-service';
import type { JobType } from '@/lib/job-queue';
import { slackWebhookService } from '@/lib/slack/webhook-service';
import type { JobProcessingResult, JobType as SlackJobType, JobProcessingStats, PipelineMetrics } from '@/lib/slack/types';

const routeLogger = logger.child('process-filing-queue');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Convert batch processing result to Slack-compatible format
 * Aggregates pipeline metrics across all jobs for visibility
 */
function convertToSlackResult(
  executionId: string,
  duration: number,
  jobTypesFilter: JobType[] | undefined,
  batchResult: BatchProcessingResult
): JobProcessingResult {
  // Group jobs by type for stats
  const byType: Record<SlackJobType, JobProcessingStats> = {
    'ASYNC_DISCOVER_FILINGS': { total: 0, successful: 0, failed: 0, averageTimeMs: 0 },
    'ASYNC_FETCH_FILING': { total: 0, successful: 0, failed: 0, averageTimeMs: 0 },
    'ASYNC_SUMMARIZE_CACHED': { total: 0, successful: 0, failed: 0, averageTimeMs: 0 },
  };

  const timeSums: Record<SlackJobType, number> = {
    'ASYNC_DISCOVER_FILINGS': 0,
    'ASYNC_FETCH_FILING': 0,
    'ASYNC_SUMMARIZE_CACHED': 0,
  };

  // Initialize pipeline metrics aggregation
  const pipeline: PipelineMetrics = {
    discovery: {
      jobsRun: 0,
      filingsDiscovered: 0,
      fetchJobsQueued: 0,
      eligibleUsers: 0,
      uniqueTickers: 0,
    },
    fetch: {
      jobsRun: 0,
      contentsFetched: 0,
      cacheHits: 0,
      summarizeJobsQueued: 0,
    },
    summarize: {
      jobsRun: 0,
      summariesGenerated: 0,
      emailsSent: 0,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    },
    uniqueTickers: [],
    uniqueFormTypes: [],
  };

  // Track unique entities
  const tickerSet = new Set<string>();
  const formTypeSet = new Set<string>();

  for (const job of batchResult.jobsProcessed) {
    const jobType = job.jobType as SlackJobType;

    // Aggregate per-type stats
    if (byType[jobType]) {
      byType[jobType].total++;
      if (job.success) {
        byType[jobType].successful++;
      } else {
        byType[jobType].failed++;
      }
      timeSums[jobType] += job.durationMs;
    }

    // Track unique entities
    if (job.ticker) tickerSet.add(job.ticker);
    if (job.formType) formTypeSet.add(job.formType);

    // Aggregate pipeline metrics by job type
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

  // Set unique entities
  pipeline.uniqueTickers = Array.from(tickerSet);
  pipeline.uniqueFormTypes = Array.from(formTypeSet);

  // Calculate averages
  for (const jobType of Object.keys(byType) as SlackJobType[]) {
    if (byType[jobType].total > 0) {
      byType[jobType].averageTimeMs = timeSums[jobType] / byType[jobType].total;
    }
  }

  return {
    executionId,
    duration,
    jobTypesFilter: jobTypesFilter as SlackJobType[] || 'all',
    jobs: {
      total: batchResult.jobsProcessed.length,
      byType,
      processed: batchResult.jobsProcessed.map(job => ({
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
}

/**
 * API endpoint to trigger background filing processing
 * Processes one batch of queued jobs and returns
 */
export async function GET(request: NextRequest) {
  const executionId = `queue-processor-${Date.now()}`;

  routeLogger.info('Filing queue processing triggered', { executionId });

  // Extract and validate jobTypes query parameter
  const searchParams = request.nextUrl.searchParams;
  const jobTypesParam = searchParams.get('jobTypes');

  let jobTypesFilter: JobType[] | undefined;
  if (jobTypesParam) {
    const requestedTypes = jobTypesParam.split(',').map(t => t.trim()).filter(Boolean);

    // Validate against allowed job types
    const allowedTypes: JobType[] = [
      'ASYNC_DISCOVER_FILINGS',
      'ASYNC_FETCH_FILING',
      'ASYNC_SUMMARIZE_CACHED'
    ];

    const invalidTypes = requestedTypes.filter(t => !allowedTypes.includes(t as JobType));
    if (invalidTypes.length > 0) {
      routeLogger.warn('Invalid job types requested', {
        executionId,
        invalidTypes,
        requestedTypes,
      });
      return NextResponse.json(
        { error: 'Invalid job types', invalidTypes },
        { status: 400 }
      );
    }

    jobTypesFilter = requestedTypes as JobType[];
    routeLogger.info('Job type filter applied', {
      executionId,
      jobTypes: jobTypesFilter,
    });
  }

  try {
    // Verify authentication using CronAuthService (handles both Vercel cron and Bearer token)
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      routeLogger.warn('Unauthorized filing queue processing attempt', {
        executionId,
        error: authResult.error,
        clientIP: authResult.clientIP,
      });

      return NextResponse.json(
        { error: 'Unauthorized', details: authResult.error },
        { status: 401 }
      );
    }

    routeLogger.info('Authentication successful', {
      executionId,
      clientIP: authResult.clientIP
    });

    // Create worker with dynamic batch sizing
    // Worker now handles batch size selection based on job type:
    // - Discovery jobs: 10 per batch (fast, 2-5s each)
    // - Fetch jobs: 2 per batch (medium, 60-120s each)
    // - Summarize jobs: 3 per batch (slow, 17-90s each)
    // This maximizes throughput while staying within Vercel's 180s timeout
    const worker = new BackgroundFilingWorker({
      batchSize: 10,          // Max batch size (discovery jobs), worker will adjust per type
      processingInterval: 0,  // No wait between batches (single run)
      jobTypes: jobTypesFilter,  // Pass filter if provided
    });

    // Process one batch and return
    const startTime = Date.now();
    const batchResult = await worker.processBatch();
    const duration = Date.now() - startTime;

    routeLogger.info('Filing queue batch processed', {
      executionId,
      duration,
      jobsProcessed: batchResult.jobsProcessed.length,
      recoveredStaleJobs: batchResult.recoveredStaleJobs,
    });

    // Post results to Slack (async, non-blocking)
    if (batchResult.jobsProcessed.length > 0) {
      const slackResult = convertToSlackResult(executionId, duration, jobTypesFilter, batchResult);
      slackWebhookService.postJobProcessingResults(slackResult).catch(err => {
        routeLogger.warn('Failed to post to Slack', { error: err instanceof Error ? err.message : 'Unknown error' });
      });
    }

    return NextResponse.json({
      success: true,
      executionId,
      duration,
      message: 'Filing queue batch processed',
      jobTypesFilter: jobTypesFilter || 'all',  // Show what was filtered
      jobsProcessed: batchResult.jobsProcessed.length,
      recoveredStaleJobs: batchResult.recoveredStaleJobs,
    });
  } catch (error) {
    routeLogger.error('Filing queue processing failed', {
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function HEAD(_request: NextRequest) {
  return new NextResponse(null, { status: 200 });
}
