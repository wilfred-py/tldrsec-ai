import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(_request: NextRequest) {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get backlog size
    const backlogSize = await prisma.rssFilingCheck.count({
      where: { processed: false }
    });

    // Get processing rate (filings processed in last hour)
    const processedLastHour = await prisma.rssFilingCheck.count({
      where: {
        processed: true,
        createdAt: { gte: oneHourAgo }
      }
    });

    // Get recent summaries for timing and success rate data
    const recentSummaries = await prisma.summary.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
        processingTimeMs: { not: null }
      },
      select: { 
        processingTimeMs: true, 
        processingStatus: true 
      }
    });

    // Calculate average processing time
    const avgProcessingTime = recentSummaries.length > 0 
      ? recentSummaries
          .filter(s => s.processingTimeMs !== null)
          .reduce((sum, s) => sum + (s.processingTimeMs || 0), 0) / recentSummaries.length / 1000
      : 0;

    // Calculate success rate
    const processingSuccessful = recentSummaries.filter(s => 
      s.processingStatus === 'COMPLETED' || s.processingStatus === 'SUCCESS'
    ).length;
    const successRate = recentSummaries.length > 0 
      ? (processingSuccessful / recentSummaries.length) * 100 
      : 100;

    // Get emails sent last hour
    const emailsSentLastHour = await prisma.notificationSent.count({
      where: { sentAt: { gte: oneHourAgo } }
    });

    // Estimate clear time based on processing rate
    const estimatedClearTime = processedLastHour > 0 
      ? backlogSize / processedLastHour 
      : 0;

    const response = {
      backlogSize,
      processingRate: processedLastHour,
      avgProcessingTime: Math.round(avgProcessingTime),
      successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
      emailsSentLastHour,
      estimatedClearTime: Math.round(estimatedClearTime * 10) / 10, // Round to 1 decimal
      lastUpdate: now
    };

    // Cache for 60 seconds
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    });

  } catch (error) {
    console.error('Processing metrics failed:', error);
    
    return NextResponse.json({
      backlogSize: 0,
      processingRate: 0,
      avgProcessingTime: 0,
      successRate: 0,
      emailsSentLastHour: 0,
      estimatedClearTime: 0,
      lastUpdate: new Date(),
      error: 'Metrics unavailable'
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
  }
}