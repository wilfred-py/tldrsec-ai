import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CronJobAnalytics } from '../../../../lib/monitoring/cron-monitor';
import { logger } from '../../../../lib/logging';

const monitoringLogger = logger.child('cron-monitoring-api');

/**
 * API endpoint for cron job monitoring dashboard
 * 
 * GET /api/monitoring/cron-status
 * 
 * Returns comprehensive cron job execution data including:
 * - Recent execution history
 * - Current job status
 * - Cost analysis
 * - Ticker activity
 * - Performance metrics
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const adminEmail = process.env.ADMIN_EMAIL;
    const userEmail = user.emailAddresses[0]?.emailAddress;
    
    if (!adminEmail || userEmail !== adminEmail) {
      return NextResponse.json(
        { error: 'Access forbidden' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    const limit = parseInt(searchParams.get('limit') || '10');

    monitoringLogger.info('Fetching cron job status', {
      userId: user.id,
      days,
      limit
    });

    // Fetch monitoring data in parallel
    const [
      recentExecutions,
      currentStatus,
      tickerActivity
    ] = await Promise.all([
      CronJobAnalytics.getRecentExecutions(limit),
      CronJobAnalytics.getCurrentJobStatus(),
      CronJobAnalytics.getTickerActivity(days)
    ]);

    // Calculate summary metrics
    const totalExecutions = recentExecutions.length;
    const successfulExecutions = recentExecutions.filter(e => e.status === 'SUCCESS').length;
    const failedExecutions = recentExecutions.filter(e => e.status === 'FAILED').length;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    const totalCost = recentExecutions.reduce((sum, e) => sum + (e.totalCostUSD || 0), 0);
    const totalFilings = recentExecutions.reduce((sum, e) => sum + (e.filingsProcessed || 0), 0);
    const totalUsers = recentExecutions.reduce((sum, e) => sum + (e.usersNotified || 0), 0);

    // Calculate average processing metrics
    const completedExecutions = recentExecutions.filter(e => e.status === 'SUCCESS' && e.durationMs);
    const avgDuration = completedExecutions.length > 0 
      ? completedExecutions.reduce((sum, e) => sum + (e.durationMs || 0), 0) / completedExecutions.length
      : 0;

    const avgCostPerFiling = totalFilings > 0 ? totalCost / totalFilings : 0;
    const avgCostPerUser = totalUsers > 0 ? totalCost / totalUsers : 0;

    // Format response
    const response = {
      success: true,
      data: {
        // Current Status
        currentStatus: {
          isHealthy: currentStatus.isHealthy,
          runningJobs: currentStatus.runningJobs.length,
          lastJobStatus: currentStatus.lastCompletedJob?.status || 'UNKNOWN',
          lastJobTime: currentStatus.lastCompletedJob?.completedAt || null,
          nextScheduledRun: getNextCronRun() // Helper function for Vercel cron schedule
        },

        // Summary Metrics
        summary: {
          totalExecutions,
          successfulExecutions,
          failedExecutions,
          successRate: Math.round(successRate * 100) / 100,
          totalCost: Math.round(totalCost * 10000) / 10000,
          totalFilings,
          totalUsers,
          avgDuration: Math.round(avgDuration),
          avgCostPerFiling: Math.round(avgCostPerFiling * 10000) / 10000,
          avgCostPerUser: Math.round(avgCostPerUser * 10000) / 10000
        },

        // Recent Executions
        recentExecutions: recentExecutions.map(execution => ({
          id: execution.id,
          jobName: execution.jobName,
          status: execution.status,
          startTime: execution.startedAt,
          endTime: execution.completedAt,
          durationMs: execution.durationMs,
          durationHuman: formatDuration(execution.durationMs || 0),
          
          // Metrics
          tickersChecked: execution.tickersChecked,
          newFilingsFound: execution.newFilingsFound,
          filingsProcessed: execution.filingsProcessed,
          usersNotified: execution.usersNotified,
          emailsSent: execution.emailsSent,
          
          // Costs
          totalCost: (execution.filingProcessingLogs?.reduce((sum, f) => sum + (f.summaryCostUSD || 0), 0) || 0) + 
                    (execution.userNotificationLogs?.reduce((sum, n) => sum + (n.deliveryCostUSD || 0), 0) || 0),
          aiCost: execution.filingProcessingLogs?.reduce((sum, f) => sum + (f.summaryCostUSD || 0), 0) || 0,
          emailCost: execution.userNotificationLogs?.reduce((sum, n) => sum + (n.deliveryCostUSD || 0), 0) || 0,
          tokensUsed: execution.filingProcessingLogs?.reduce((sum, f) => sum + (f.summaryTokens || 0), 0) || 0,
          
          // Health
          errorCount: execution.errorsCount,
          warningCount: 0, // Not tracked in current schema
          errorMessage: execution.errorMessage,

          // Filing breakdown
          filingsByType: groupFilingsByType(execution.filingProcessingLogs),
          emailDeliveryStats: getEmailStats(execution.userNotificationLogs)
        })),

        // Cost Analysis
        costAnalysis: {
          projectedMonthlyCost: projectMonthlyCost(recentExecutions)
        },

        // Ticker Activity
        tickerActivity: tickerActivity.map(ticker => ({
          symbol: ticker.ticker,
          filingsCount: ticker._count.id,
          totalCost: ticker._sum.summaryCostUSD || 0,
          emailsSent: ticker._sum.emailsSent || 0,
          avgCostPerFiling: ticker._count.id > 0 
            ? Math.round((ticker._sum.summaryCostUSD || 0) / ticker._count.id * 10000) / 10000
            : 0
        }))
      },
      timestamp: new Date(),
      queryParams: { days, limit }
    };

    return NextResponse.json(response);

  } catch (error) {
    monitoringLogger.error('Error fetching cron job status', { error });

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch cron job monitoring data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper functions
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function groupFilingsByType(filings: { filingType: string }[]): Record<string, number> {
  return filings.reduce((acc, filing) => {
    acc[filing.filingType] = (acc[filing.filingType] || 0) + 1;
    return acc;
  }, {});
}

function getEmailStats(notifications: { deliveryStatus: string }[]): { sent: number; failed: number; pending: number } {
  return notifications.reduce((acc, notif) => {
    if (notif.deliveryStatus === 'SENT') acc.sent++;
    else if (notif.deliveryStatus === 'FAILED') acc.failed++;
    else acc.pending++;
    return acc;
  }, { sent: 0, failed: 0, pending: 0 });
}

function projectMonthlyCost(executions: { filingProcessingLogs?: { summaryCostUSD?: number }[]; userNotificationLogs?: { deliveryCostUSD?: number }[] }[]): number {
  if (executions.length === 0) return 0;
  
  const totalCost = executions.reduce((sum, execution) => {
    const aiCost = execution.filingProcessingLogs?.reduce((acc, f) => acc + (f.summaryCostUSD || 0), 0) || 0;
    const emailCost = execution.userNotificationLogs?.reduce((acc, n) => acc + (n.deliveryCostUSD || 0), 0) || 0;
    return sum + aiCost + emailCost;
  }, 0);
  
  // Assuming daily execution, project monthly cost
  const avgDailyCost = totalCost / Math.max(executions.length, 1);
  return Math.round(avgDailyCost * 30 * 100) / 100;
}

function getNextCronRun(): string {
  // For Vercel cron, this would be based on your cron schedule
  // For daily jobs, calculate next midnight UTC
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}