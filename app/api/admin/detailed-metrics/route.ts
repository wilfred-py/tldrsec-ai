import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

// Admin user check function
async function isAdminUser(): Promise<boolean> {
  try {
    const user = await currentUser();
    if (!user) return false;

    const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',') || [];
    
    return ADMIN_USER_IDS.includes(user.id) || 
      user.emailAddresses.some(email => 
        email.emailAddress.endsWith('@yourdomain.com') // Replace with your admin domain
      );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Check admin permissions
  const isAdmin = await isAdminUser();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Collect comprehensive metrics (similar to production-pipeline-monitor.ts)
    
    // Cron metrics
    const recentCronExecutions = await prisma.cronJobExecution.findMany({
      where: { startedAt: { gte: oneDayAgo } },
      orderBy: { startedAt: 'desc' },
      take: 20
    });

    const cronSuccessful = recentCronExecutions.filter(e => e.status === 'SUCCESS').length;
    const cronSuccessRate = recentCronExecutions.length > 0 ? (cronSuccessful / recentCronExecutions.length) * 100 : 0;

    let avgCronInterval = 15;
    if (recentCronExecutions.length > 1) {
      const intervals = [];
      for (let i = 1; i < Math.min(recentCronExecutions.length, 10); i++) {
        const interval = (recentCronExecutions[i-1].startedAt.getTime() - recentCronExecutions[i].startedAt.getTime()) / (1000 * 60);
        intervals.push(interval);
      }
      avgCronInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 15;
    }

    // Processing metrics
    const backlogSize = await prisma.rssFilingCheck.count({
      where: { processed: false }
    });

    const processedLastHour = await prisma.rssFilingCheck.count({
      where: {
        processed: true,
        createdAt: { gte: oneHourAgo }
      }
    });

    const recentSummaries = await prisma.summary.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
        processingTimeMs: { not: null }
      },
      select: { processingTimeMs: true, processingStatus: true }
    });

    const avgProcessingTime = recentSummaries.length > 0 
      ? recentSummaries
          .filter(s => s.processingTimeMs !== null)
          .reduce((sum, s) => sum + (s.processingTimeMs || 0), 0) / recentSummaries.length / 1000
      : 0;

    const processingSuccessful = recentSummaries.filter(s => s.processingStatus === 'COMPLETED').length;
    const processingSuccessRate = recentSummaries.length > 0 ? (processingSuccessful / recentSummaries.length) * 100 : 100;

    const estimatedClearTime = processedLastHour > 0 ? backlogSize / processedLastHour : Infinity;

    // AI metrics
    const aiSummaries = await prisma.summary.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
        cost: { not: null },
        tokensUsed: { not: null }
      },
      select: { cost: true, tokensUsed: true, processingError: true }
    });

    const avgAiCost = aiSummaries.length > 0 
      ? aiSummaries.reduce((sum, s) => sum + (s.cost || 0), 0) / aiSummaries.length 
      : 0;

    const avgAiTokens = aiSummaries.length > 0
      ? aiSummaries.reduce((sum, s) => sum + (s.tokensUsed || 0), 0) / aiSummaries.length
      : 0;

    const aiErrors = aiSummaries.filter(s => s.processingError !== null).length;
    const aiErrorRate = aiSummaries.length > 0 ? (aiErrors / aiSummaries.length) * 100 : 0;

    // Email metrics
    const emailsSentLastHour = await prisma.notificationSent.count({
      where: { sentAt: { gte: oneHourAgo } }
    });

    const recentEmails = await prisma.notificationSent.findMany({
      where: { sentAt: { gte: oneHourAgo } },
      select: { deliveryStatus: true }
    });

    const emailsDelivered = recentEmails.filter(e => e.deliveryStatus === 'delivered').length;
    const emailsBounced = recentEmails.filter(e => e.deliveryStatus === 'bounced').length;

    const emailDeliveryRate = recentEmails.length > 0 ? (emailsDelivered / recentEmails.length) * 100 : 100;
    const emailBounceRate = recentEmails.length > 0 ? (emailsBounced / recentEmails.length) * 100 : 0;

    // Database health check
    const dbStartTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbQueryTime = Date.now() - dbStartTime;

    const metrics = {
      timestamp: now,
      cron: {
        lastExecution: recentCronExecutions.length > 0 ? recentCronExecutions[0].startedAt : null,
        executionInterval: avgCronInterval,
        successRate: cronSuccessRate,
        recentErrors: recentCronExecutions.length - cronSuccessful
      },
      processing: {
        backlogSize,
        processingRate: processedLastHour,
        avgProcessingTime,
        successRate: processingSuccessRate,
        estimatedClearTime
      },
      ai: {
        summariesLastHour: aiSummaries.length,
        avgCost: avgAiCost,
        avgTokens: avgAiTokens,
        errorRate: aiErrorRate
      },
      email: {
        sentLastHour: emailsSentLastHour,
        deliveryRate: emailDeliveryRate,
        bounceRate: emailBounceRate,
        recentFailures: emailsBounced
      },
      database: {
        connectionStatus: dbQueryTime < 500 ? 'healthy' : dbQueryTime < 1000 ? 'degraded' : 'failed',
        avgQueryTime: dbQueryTime,
        activeConnections: 1
      }
    };

    // Generate alerts based on thresholds
    const alerts = [];
    
    if (cronSuccessRate < 85) {
      alerts.push({
        metric: 'cron.successRate',
        severity: 'critical',
        message: `Cron success rate is ${cronSuccessRate.toFixed(1)}%`,
        current: cronSuccessRate,
        threshold: 85
      });
    }

    if (backlogSize > 300) {
      alerts.push({
        metric: 'processing.backlogSize',
        severity: 'critical',
        message: `Large backlog: ${backlogSize} unprocessed filings`,
        current: backlogSize,
        threshold: 300
      });
    }

    if (aiErrorRate > 15) {
      alerts.push({
        metric: 'ai.errorRate',
        severity: 'critical',
        message: `AI error rate is ${aiErrorRate.toFixed(1)}%`,
        current: aiErrorRate,
        threshold: 15
      });
    }

    if (emailDeliveryRate < 85) {
      alerts.push({
        metric: 'email.deliveryRate',
        severity: 'critical',
        message: `Email delivery rate is ${emailDeliveryRate.toFixed(1)}%`,
        current: emailDeliveryRate,
        threshold: 85
      });
    }

    return NextResponse.json({
      metrics,
      alerts,
      lastUpdate: now
    }, {
      headers: {
        'Cache-Control': 'private, no-cache' // Admin data should not be cached
      }
    });

  } catch (error) {
    console.error('Admin metrics failed:', error);
    
    return NextResponse.json({
      error: 'Failed to fetch detailed metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 500 
    });
  }
}