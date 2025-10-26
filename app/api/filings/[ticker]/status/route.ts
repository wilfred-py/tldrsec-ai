import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const resolvedParams = await params;
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ticker = resolvedParams.ticker.toUpperCase();
    
    // Check if user tracks this ticker
    const trackedTicker = await prisma.ticker.findFirst({
      where: {
        symbol: ticker,
        userId: user.id
      }
    });

    if (!trackedTicker) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check for recent RSS filing checks for this ticker
    const recentFilingChecks = await prisma.rssFilingCheck.findMany({
      where: {
        ticker: ticker,
        createdAt: { gte: oneDayAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Check for pending processing
    const pendingFilings = recentFilingChecks.filter(f => !f.processed);
    const processedRecently = recentFilingChecks.filter(f => 
      f.processed && f.createdAt >= oneHourAgo
    );

    // Check for recent summaries
    const recentSummaries = await prisma.summary.findMany({
      where: {
        ticker: ticker,
        createdAt: { gte: oneDayAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Determine status
    let status: 'processing' | 'completed' | 'delayed' | 'error' = 'completed';
    let message: string | undefined;
    let estimatedCompletion: Date | undefined;

    const lastCheck = recentFilingChecks.length > 0 
      ? recentFilingChecks[0].createdAt 
      : oneDayAgo;

    // Check for errors in recent summaries
    const recentErrors = recentSummaries.filter(s => 
      s.processingError !== null || s.processingStatus === 'FAILED'
    );

    if (recentErrors.length > 0) {
      status = 'error';
      message = 'Recent filing processing encountered errors';
    } else if (pendingFilings.length > 0) {
      const oldestPending = pendingFilings[pendingFilings.length - 1];
      const pendingDuration = now.getTime() - oldestPending.createdAt.getTime();
      
      if (pendingDuration > 2 * 60 * 60 * 1000) { // 2 hours
        status = 'delayed';
        message = `${pendingFilings.length} filings pending for over 2 hours`;
        // Estimate completion based on average processing rate
        estimatedCompletion = new Date(now.getTime() + pendingFilings.length * 30 * 60 * 1000); // 30 min per filing estimate
      } else {
        status = 'processing';
        message = `Processing ${pendingFilings.length} recent filings`;
        estimatedCompletion = new Date(now.getTime() + pendingFilings.length * 15 * 60 * 1000); // 15 min per filing estimate
      }
    } else if (processedRecently.length > 0) {
      status = 'completed';
      message = `Processed ${processedRecently.length} filings in the last hour`;
    }

    const response = {
      ticker,
      lastCheck,
      status,
      estimatedCompletion,
      message,
      metadata: {
        pendingCount: pendingFilings.length,
        processedLastHour: processedRecently.length,
        recentErrorCount: recentErrors.length,
        totalChecksToday: recentFilingChecks.length
      }
    };

    // Cache for 2 minutes to reduce database load
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, s-maxage=120, stale-while-revalidate=240'
      }
    });

  } catch (error) {
    console.error('Filing status check failed:', error);
    
    return NextResponse.json({
      ticker: resolvedParams.ticker.toUpperCase(),
      lastCheck: new Date(),
      status: 'error',
      message: 'Unable to check filing status',
      error: 'Status check unavailable'
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
  }
}