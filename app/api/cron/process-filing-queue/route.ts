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

const routeLogger = logger.child('process-filing-queue');

/**
 * API endpoint to trigger background filing processing
 * Processes one batch of queued jobs and returns
 */
export async function GET(request: NextRequest) {
  const executionId = `queue-processor-${Date.now()}`;

  routeLogger.info('Filing queue processing triggered', { executionId });

  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (providedSecret !== process.env.CRON_SECRET) {
      routeLogger.warn('Unauthorized filing queue processing attempt', {
        executionId,
        hasAuthHeader: !!authHeader,
      });

      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create worker instance for this execution
    const worker = new BackgroundFilingWorker({
      batchSize: 3,           // Process 3 filings at a time
      processingInterval: 0,  // No wait between batches (single run)
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
