/**
 * Retry Rate Monitoring Endpoint
 *
 * Provides health metrics for job retry patterns.
 *
 * Expected baseline: 100% of jobs have retryCount=1 (cold start pattern)
 * Anomaly detection: >10% of jobs with retryCount>1
 *
 * See docs/architecture/job-retry-patterns.md for complete analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RetryRateMonitor } from '@/lib/monitoring/retry-rate-monitor';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/retry-rates
 *
 * Query params:
 * - hours: Number of hours to look back (default: 24)
 * - detailed: Include detailed job breakdown (default: false)
 *
 * Example:
 * - /api/monitoring/retry-rates
 * - /api/monitoring/retry-rates?hours=48
 * - /api/monitoring/retry-rates?hours=24&detailed=true
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const hoursParam = searchParams.get('hours');
    const detailedParam = searchParams.get('detailed');

    const hours = hoursParam ? parseInt(hoursParam, 10) : 24;
    const detailed = detailedParam === 'true';

    // Validate hours parameter
    if (isNaN(hours) || hours < 1 || hours > 168) {
      return NextResponse.json(
        {
          error: 'Invalid hours parameter',
          message: 'Hours must be between 1 and 168 (7 days)'
        },
        { status: 400 }
      );
    }

    // Get health metrics
    const health = await RetryRateMonitor.getHealth(hours);

    // Get detailed breakdown if requested
    let breakdown;
    if (detailed) {
      breakdown = await RetryRateMonitor.getDetailedBreakdown(hours, 10);
    }

    // Build response
    const response: Record<string, unknown> = {
      healthy: health.healthy,
      timeWindow: {
        hours,
        description: `Last ${hours} hours`
      },
      metrics: {
        totalJobs: health.metrics.totalJobs,
        avgRetries: health.metrics.avgRetries,
        retryPercentage: health.metrics.retryPercentage,
        multipleRetryPercentage: health.metrics.multipleRetryPercentage,
        distribution: {
          retryCount0: {
            count: health.metrics.retryDistribution.retryCount0,
            percentage: health.metrics.totalJobs > 0
              ? Math.round((health.metrics.retryDistribution.retryCount0 / health.metrics.totalJobs) * 100)
              : 0,
            description: 'First attempt success (unusual for cold starts)'
          },
          retryCount1: {
            count: health.metrics.retryDistribution.retryCount1,
            percentage: health.metrics.retryPercentage,
            description: 'Single retry (expected baseline for cold starts)'
          },
          retryCount2Plus: {
            count: health.metrics.retryDistribution.retryCount2Plus,
            percentage: health.metrics.multipleRetryPercentage,
            description: 'Multiple retries (anomaly - investigate)'
          }
        },
        anomalyDetected: health.metrics.anomalyDetected,
        anomalyReason: health.metrics.anomalyReason
      },
      baseline: health.baseline,
      recommendations: health.recommendations
    };

    // Add detailed breakdown if requested
    if (detailed && breakdown) {
      response.detailed = breakdown;
    }

    // Add interpretation
    response.interpretation = {
      status: health.healthy ? 'NORMAL' : 'ANOMALY_DETECTED',
      message: health.healthy
        ? 'Retry patterns are within expected baseline. The retryCount=1 pattern is normal for serverless cold starts.'
        : 'Anomaly detected in retry patterns. Multiple retries indicate persistent errors beyond cold starts.',
      nextSteps: health.healthy
        ? [
            'Continue monitoring for changes',
            'retryCount=1 is expected and optimal'
          ]
        : [
            'Investigate jobs with retryCount>1',
            'Check /api/health/pipeline for infrastructure issues',
            'Review Dead Letter Queue for failed jobs'
          ]
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('Error fetching retry rate metrics:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
