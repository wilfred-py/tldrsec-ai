import { NextRequest, NextResponse } from 'next/server';
import { QueueMonitoringService } from '@/lib/cron/queue-monitoring';

/**
 * Get queue status and metrics
 * Public endpoint for monitoring dashboards
 */
export async function GET(_request: NextRequest) {
  try {
    const health = await QueueMonitoringService.checkQueueHealth();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...health,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
