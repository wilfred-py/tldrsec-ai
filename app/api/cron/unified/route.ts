import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { getMarketHoursContext } from '../../../../lib/cron/market-hours';

const cronLogger = logger.child('unified-cron');

/**
 * Unified cron endpoint for Railway's single cron limitation
 * Always routes to tier-aware SEC filing monitoring since filings can be published 24/7
 * Market context affects processing frequency, not whether to process
 * Runs every 5 minutes continuously
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    cronLogger.info('Starting unified cron job router');

    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      cronLogger.warn('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get market context for intelligent routing
    const marketContext = getMarketHoursContext();
    const { isMarketHours, isMarketDay, currentTime } = marketContext;

    // SEC filings can be published 24/7, so always use tier-aware processing
    // Market context only affects processing frequencies, not whether to process
    
    // Always route to tier-aware processing
    // Market hours only affect processing frequency within tier-aware logic
    const targetEndpoint = 'tier-aware';
    let jobType: string;
    let routingReason: string;
    
    if (isMarketDay && isMarketHours) {
      jobType = 'TIER_AWARE_MARKET_HOURS';
      routingReason = 'Market hours active - high frequency processing';
    } else if (isMarketDay) {
      jobType = 'TIER_AWARE_OFF_HOURS';
      routingReason = 'Off-market hours on trading day - reduced frequency';
    } else {
      jobType = 'TIER_AWARE_WEEKEND';
      routingReason = 'Weekend/holiday - SEC filings still possible';
    }

    cronLogger.info(`Routing to ${targetEndpoint} job`, {
      isMarketHours,
      isMarketDay,
      jobType,
      routingReason,
      estTime: currentTime.toISOString()
    });

    // Call the appropriate endpoint
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : `http://localhost:${process.env.PORT || 3000}`;
    
    const targetUrl = `${baseUrl}/api/cron/${targetEndpoint}`;
    
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'User-Agent': 'tldrSEC-AI Unified Cron Router',
        'X-Forwarded-From': 'unified-cron'
      },
      // Set reasonable timeout
      signal: AbortSignal.timeout(240000) // 4 minutes
    });

    if (!response.ok) {
      throw new Error(`Target endpoint returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;

    cronLogger.info(`Unified cron routing completed successfully`, {
      targetEndpoint,
      jobType,
      routingReason,
      success: result.success,
      duration,
      targetDuration: result.duration
    });

    return NextResponse.json({
      success: true,
      routedTo: targetEndpoint,
      jobType,
      routingReason,
      marketContext: {
        isMarketHours,
        isMarketDay
      },
      duration,
      result
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    cronLogger.error('Unified cron routing failed', {
      error: error instanceof Error ? error.message : String(error),
      duration
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    }, { status: 500 });
  }
}