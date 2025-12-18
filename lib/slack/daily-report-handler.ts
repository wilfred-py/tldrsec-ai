/**
 * Daily Report Handler for Slack
 *
 * Generates daily pipeline verification reports for Slack.
 * Integrates with the verify-daily-pipeline script functionality.
 */

import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';
import type { SlackWebhookPayload, DailySummaryMetrics } from './types';
import { formatDailySummaryMessage } from './message-formatter';

const dailyReportLogger = logger.child('slack-daily-report');

// =============================================================================
// Database Queries (based on verify-daily-pipeline.ts)
// =============================================================================

/**
 * Get date range for a specific date or yesterday
 */
function getDateRange(targetDate?: string): { start: Date; end: Date; dateStr: string } {
  let date: Date;

  if (targetDate) {
    date = new Date(targetDate);
  } else {
    date = new Date();
    date.setDate(date.getDate() - 1); // Yesterday
  }

  // Start of day (midnight)
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  // End of day (23:59:59.999)
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  // Format date string
  const dateStr = date.toISOString().split('T')[0];

  return { start, end, dateStr };
}

/**
 * Get verification metrics for a date range
 */
async function getVerificationMetrics(
  start: Date,
  end: Date
): Promise<DailySummaryMetrics> {
  const prisma = getPrismaClient();

  // Parallel queries for efficiency
  const [
    discoveredFilings,
    fetchAttempts,
    summaries,
    emailDeliveries,
    cronExecutions,
  ] = await Promise.all([
    // 1. Discovered filings (RssFilingCheck)
    prisma.rssFilingCheck.count({
      where: {
        createdAt: { gte: start, lte: end },
      },
    }),

    // 2. Fetch attempts (use attemptedAt, not createdAt)
    prisma.secFetchAttempt.groupBy({
      by: ['status'],
      where: {
        attemptedAt: { gte: start, lte: end },
      },
      _count: true,
    }),

    // 3. Summaries generated
    prisma.summary.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        isCacheHit: true,
        totalCostUsd: true,
        modelId: true,
      },
    }),

    // 4. Email deliveries
    prisma.summaryEmailDelivery.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      select: {
        userId: true,
      },
    }),

    // 5. Cron executions (for tickers checked)
    prisma.cronJobExecution.findMany({
      where: {
        startTime: { gte: start, lte: end },
        jobType: 'TIER_AWARE',
      },
      select: {
        tickersChecked: true,
        newFilingsFound: true,
      },
    }),
  ]);

  // Process fetch attempts
  const fetchSuccessful = fetchAttempts.find(f => f.status === 'success')?._count || 0;
  const fetchFailed = fetchAttempts.filter(f => f.status !== 'success').reduce((sum, f) => sum + f._count, 0);

  // Process summaries
  const summariesCompleted = summaries.length;
  const summariesCached = summaries.filter(s => s.isCacheHit).length;
  const totalCost = summaries.reduce((sum, s) => sum + (s.totalCostUsd || 0), 0);
  const models = new Set(summaries.map(s => s.modelId).filter(Boolean));
  const modelStr = models.size > 0 ? Array.from(models).join(', ') : 'N/A';

  // Process emails
  const emailsSent = emailDeliveries.length;
  const uniqueUsers = new Set(emailDeliveries.map(e => e.userId)).size;

  // Process cron executions
  const tickersChecked = cronExecutions.reduce((sum, c) => sum + (c.tickersChecked || 0), 0);
  const avgTickersPerRun = cronExecutions.length > 0 ? Math.round(tickersChecked / cronExecutions.length) : 0;

  // Calculate completion rate
  // A filing is complete if it was discovered, fetched, summarized
  // Using fetched as denominator since some discovered may not need processing
  const completionRate = fetchSuccessful > 0
    ? (summariesCompleted / fetchSuccessful) * 100
    : discoveredFilings > 0 ? 0 : 100;

  return {
    completionRate: Math.min(100, completionRate),
    discovery: {
      filingsDiscovered: discoveredFilings,
      tickersChecked: avgTickersPerRun,
    },
    fetch: {
      completed: fetchSuccessful,
      failed: fetchFailed,
    },
    summarize: {
      completed: summariesCompleted,
      failed: fetchSuccessful - summariesCompleted,
      cached: summariesCached,
    },
    email: {
      sent: emailsSent,
      recipients: uniqueUsers,
    },
    costs: {
      total: totalCost,
      model: modelStr,
    },
  };
}

/**
 * Get remediation metrics for a date range (if DailyPipelineVerification exists)
 */
async function getRemediationMetrics(
  start: Date,
  end: Date
): Promise<{ attempted: number; succeeded: number; failed: number } | undefined> {
  try {
    const prisma = getPrismaClient();

    // Check if the table exists and has data
    const verification = await prisma.dailyPipelineVerification.findFirst({
      where: {
        verificationDate: { gte: start, lte: end },
      },
      select: {
        remediationAttempted: true,
        remediationSucceeded: true,
        remediationFailed: true,
      },
    });

    if (!verification) return undefined;

    return {
      attempted: verification.remediationAttempted,
      succeeded: verification.remediationSucceeded,
      failed: verification.remediationFailed,
    };
  } catch {
    // Table may not exist or query failed
    return undefined;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a daily report for Slack
 * @param targetDate Optional date in YYYY-MM-DD format, defaults to yesterday
 */
export async function generateDailyReport(targetDate?: string): Promise<SlackWebhookPayload> {
  const { start, end, dateStr } = getDateRange(targetDate);

  dailyReportLogger.info('Generating daily report', { date: dateStr, start, end });

  try {
    // Get metrics
    const metrics = await getVerificationMetrics(start, end);

    // Try to get remediation metrics
    const remediation = await getRemediationMetrics(start, end);
    if (remediation) {
      metrics.remediation = remediation;
    }

    dailyReportLogger.info('Daily report generated', {
      date: dateStr,
      completionRate: metrics.completionRate,
      discovered: metrics.discovery.filingsDiscovered,
      emailsSent: metrics.email.sent,
    });

    // Format the message
    return formatDailySummaryMessage(dateStr, metrics);
  } catch (error) {
    dailyReportLogger.error('Error generating daily report', {
      error: error instanceof Error ? error.message : 'Unknown error',
      date: dateStr,
    });

    // Return error message
    return {
      text: `Error generating daily report for ${dateStr}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:x: *Error generating daily report for ${dateStr}*\n\n${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        },
      ],
    };
  }
}

/**
 * Generate metrics summary for the current period (last N hours)
 * Useful for quick status checks
 */
export async function generateQuickMetrics(hoursBack: number = 24): Promise<{
  queueDepth: number;
  completedJobs: number;
  failedJobs: number;
  emailsSent: number;
}> {
  const prisma = getPrismaClient();
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const [queueStatus, emailCount] = await Promise.all([
    // Queue metrics
    prisma.jobQueue.groupBy({
      by: ['status'],
      where: {
        OR: [
          { status: { in: ['PENDING', 'PROCESSING'] } },
          {
            status: { in: ['COMPLETED', 'FAILED'] },
            updatedAt: { gte: since },
          },
        ],
      },
      _count: true,
    }),

    // Email count
    prisma.summaryEmailDelivery.count({
      where: {
        createdAt: { gte: since },
      },
    }),
  ]);

  const pending = queueStatus.find(s => s.status === 'PENDING')?._count || 0;
  const processing = queueStatus.find(s => s.status === 'PROCESSING')?._count || 0;
  const completed = queueStatus.find(s => s.status === 'COMPLETED')?._count || 0;
  const failed = queueStatus.find(s => s.status === 'FAILED')?._count || 0;

  return {
    queueDepth: pending + processing,
    completedJobs: completed,
    failedJobs: failed,
    emailsSent: emailCount,
  };
}
