import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/prisma';
import { jsonParsingMonitor } from '@/lib/monitoring/json-parsing-monitor';

/**
 * JSON Parsing Metrics API
 *
 * Phase 5: Production Validation & Monitoring
 *
 * Provides parsing metrics and prompt improvement reports
 * for the simplified JSON parsing pipeline.
 */

/**
 * GET /api/monitoring/parsing-metrics
 *
 * Returns JSON parsing metrics and optional prompt improvement report
 *
 * Query params:
 * - includeReport: boolean - Include the prompt improvement report
 * - includeFailures: boolean - Include recent failure records
 * - failureLimit: number - Maximum failures to include (default 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access (ENTERPRISE or INSTITUTION tier)
    const user = await getPrismaClient().user.findUnique({
      where: { authProviderId: userId },
      select: { subscriptionTier: true }
    });

    if (!user || !['ENTERPRISE', 'INSTITUTION'].includes(user.subscriptionTier)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const url = new URL(request.url);
    const includeReport = url.searchParams.get('includeReport') === 'true';
    const includeFailures = url.searchParams.get('includeFailures') === 'true';
    const failureLimit = parseInt(url.searchParams.get('failureLimit') || '10', 10);

    // Get current parsing metrics
    const metrics = jsonParsingMonitor.getMetrics();

    // Build response
    const response: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      metrics: {
        total: metrics.total,
        directSuccess: metrics.directSuccess,
        codeblockStripped: metrics.codeblockStripped,
        bracketRepaired: metrics.bracketRepaired,
        validationFailures: metrics.validationFailures,
        jsonErrors: metrics.jsonErrors,
        successRate: metrics.successRate,
        avgParseTimeMs: metrics.avgParseTimeMs
      },
      health: {
        status: getHealthStatus(metrics),
        indicators: {
          directParsingRatio: metrics.total > 0
            ? Math.round((metrics.directSuccess / metrics.total) * 100 * 100) / 100
            : 100,
          repairRate: metrics.total > 0
            ? Math.round(((metrics.codeblockStripped + metrics.bracketRepaired) / metrics.total) * 100 * 100) / 100
            : 0,
          failureRate: metrics.total > 0
            ? Math.round(((metrics.validationFailures + metrics.jsonErrors) / metrics.total) * 100 * 100) / 100
            : 0
        }
      }
    };

    // Include prompt improvement report if requested
    if (includeReport) {
      response.promptImprovementReport = jsonParsingMonitor.generatePromptImprovementReport();
    }

    // Include recent failures if requested
    if (includeFailures) {
      const failures = jsonParsingMonitor.getRecentFailures(failureLimit);
      response.recentFailures = failures.map(failure => ({
        timestamp: failure.timestamp,
        formType: failure.formType,
        method: failure.method,
        error: failure.error,
        validationErrors: failure.validationErrors,
        responsePreview: failure.diagnostics.responsePreview
      }));
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Failed to retrieve parsing metrics:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve parsing metrics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/parsing-metrics/reset
 *
 * Resets parsing metrics (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const user = await getPrismaClient().user.findUnique({
      where: { authProviderId: userId },
      select: { subscriptionTier: true }
    });

    if (!user || !['ENTERPRISE', 'INSTITUTION'].includes(user.subscriptionTier)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();

    if (body.action === 'reset') {
      // Reset metrics
      jsonParsingMonitor.resetMetrics();

      return NextResponse.json({
        success: true,
        message: 'Parsing metrics have been reset',
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use action: "reset"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Failed to process parsing metrics action:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

/**
 * Determine health status based on parsing metrics
 */
function getHealthStatus(metrics: ReturnType<typeof jsonParsingMonitor.getMetrics>): 'healthy' | 'degraded' | 'critical' {
  // No data yet - assume healthy
  if (metrics.total === 0) {
    return 'healthy';
  }

  const successRate = metrics.successRate;
  const repairRate = ((metrics.codeblockStripped + metrics.bracketRepaired) / metrics.total) * 100;

  // Critical: Success rate below 80%
  if (successRate < 80) {
    return 'critical';
  }

  // Degraded: Success rate below 95% OR repair rate above 15%
  if (successRate < 95 || repairRate > 15) {
    return 'degraded';
  }

  return 'healthy';
}
