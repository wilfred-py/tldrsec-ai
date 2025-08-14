import { NextRequest, NextResponse } from 'next/server';

/**
 * Unified cron job handler that routes to different tasks based on time
 * Runs every 3 hours: 0 9,12,15 * * 1-5
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current hour (UTC)
    const currentHour = new Date().getUTCHours();
    
    // Route to appropriate endpoint based on time
    let endpoint: string;
    let taskName: string;
    
    if (currentHour === 9) {
      // 9am: SEC Filing Monitor
      endpoint = '/api/cron/monitor-sec-filings';
      taskName = 'SEC Filing Monitor';
    } else if (currentHour === 12) {
      // 12pm: Job Processor
      endpoint = '/api/cron/process-jobs';
      taskName = 'Job Processor';
    } else {
      // Skip execution for other times
      return NextResponse.json({
        success: true,
        message: `Skipping execution at ${currentHour}:00 UTC - not a scheduled time`,
        currentHour
      });
    }

    console.log(`🚂 Railway Unified Cron: Running ${taskName} at ${currentHour}:00 UTC`);

    // Make internal API call
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3000';
    const protocol = baseUrl.includes('localhost') ? 'http' : 'https';
    const url = `${protocol}://${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'User-Agent': 'Railway-Unified-Cron/1.0'
      }
    });

    const data = await response.json();

    return NextResponse.json({
      success: response.ok,
      task: taskName,
      executedAt: new Date().toISOString(),
      currentHour,
      result: data
    });

  } catch (error) {
    console.error('Unified cron job failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}