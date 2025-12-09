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
import { logger } from '@/lib/logging';
import { CronAuthService } from '@/lib/cron/auth-service';
import type { JobType } from '@/lib/job-queue';

const routeLogger = logger.child('process-filing-queue');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    await worker.processBatch();
    const duration = Date.now() - startTime;

    routeLogger.info('Filing queue batch processed', {
      executionId,
      duration,
    });

    return NextResponse.json({
      success: true,
      executionId,
      duration,
      message: 'Filing queue batch processed',
      jobTypesFilter: jobTypesFilter || 'all',  // Show what was filtered
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
