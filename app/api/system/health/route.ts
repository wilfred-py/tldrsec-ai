import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check cron execution health
    const recentCronExecutions = await prisma.cronJobExecution.findMany({
      where: { startedAt: { gte: oneDayAgo } },
      orderBy: { startedAt: 'desc' },
      take: 10
    });

    const cronSuccessful = recentCronExecutions.filter(e => e.status === 'SUCCESS').length;
    const cronSuccessRate = recentCronExecutions.length > 0 
      ? (cronSuccessful / recentCronExecutions.length) * 100 
      : 100;

    // Check processing backlog
    const backlogSize = await prisma.rssFilingCheck.count({
      where: { processed: false }
    });

    // Check recent processing activity
    const processedLastHour = await prisma.rssFilingCheck.count({
      where: {
        processed: true,
        createdAt: { gte: oneHourAgo }
      }
    });

    // Determine system status
    let status: 'healthy' | 'degraded' | 'maintenance' = 'healthy';
    let message: string | undefined;
    let estimatedDelay: string | undefined;

    if (cronSuccessRate < 85) {
      status = 'degraded';
      message = 'Cron jobs experiencing failures - filing processing may be delayed';
    } else if (backlogSize > 300) {
      status = 'degraded';
      message = 'Large processing backlog - expect longer delays for new filings';
      estimatedDelay = backlogSize > 500 ? '6+ hours' : '2-4 hours';
    } else if (backlogSize > 100) {
      status = 'degraded';
      message = 'Moderate processing backlog - filing summaries may be delayed';
      estimatedDelay = '30-90 minutes';
    }

    // Check if system is in maintenance mode (can be set via env var)
    if (process.env.MAINTENANCE_MODE === 'true') {
      status = 'maintenance';
      message = 'Scheduled maintenance in progress';
    }

    const response = {
      status,
      processingBacklog: backlogSize,
      estimatedDelay,
      message,
      lastUpdate: now,
      metadata: {
        cronSuccessRate: cronSuccessRate.toFixed(1),
        processedLastHour,
        uptime: process.uptime()
      }
    };

    // Cache for 30 seconds to reduce database load
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    });

  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: 'degraded',
      processingBacklog: 0,
      message: 'System health check failed - please try again later',
      lastUpdate: new Date(),
      error: 'Health check unavailable'
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
  }
}