/**
 * Daily Report Handler for Slack
 *
 * Generates daily pipeline verification reports for Slack.
 * Integrates with the verify-daily-pipeline script functionality.
 *
 * Enhanced to provide detailed filing-level breakdown matching
 * the verify-daily-pipeline.ts output format.
 */

import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';
import type {
  SlackWebhookPayload,
  DailySummaryMetrics,
  FilingVerificationDetail,
  AiModelCost,
  CacheHealthMetrics
} from './types';
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
 * Get all discovered filings in date range with their full verification status
 * Mirrors the verify-daily-pipeline.ts approach for consistency
 */
async function getDiscoveredFilingsWithStatus(
  start: Date,
  end: Date
): Promise<FilingVerificationDetail[]> {
  const prisma = getPrismaClient();

  // Get discovered filings from RssFilingCheck
  const discoveredFilings = await prisma.rssFilingCheck.findMany({
    where: {
      createdAt: { gte: start, lte: end },
    },
    include: {
      tickerMonitoring: {
        select: {
          symbol: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const filingDetails: FilingVerificationDetail[] = [];

  for (const filing of discoveredFilings) {
    const detail: FilingVerificationDetail = {
      ticker: filing.tickerMonitoring.symbol,
      formType: filing.filingType,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      status: 'PENDING',
      discovered: true,
      fetched: false,
      summarized: false,
      emailed: false,
      emailCount: 0,
    };

    // Check fetch status via FilingContentCache
    const cachedContent = await prisma.filingContentCache.findUnique({
      where: { accessionNumber: filing.accessionNumber },
    });
    detail.fetched = cachedContent?.status === 'CACHED';

    if (detail.fetched) {
      // Check summarization status
      const accessionNoDashes = filing.accessionNumber.replace(/-/g, '');
      const summary = await prisma.summary.findFirst({
        where: {
          OR: [
            { secFiling: { accessionNumber: filing.accessionNumber } },
            { filingUrl: { contains: accessionNoDashes } },
          ],
        },
        select: {
          id: true,
          summaryText: true,
          processingStatus: true,
        },
      });

      detail.summarized = !!(summary?.summaryText && summary.summaryText.trim().length > 0);

      if (detail.summarized && summary?.id) {
        // Check email delivery status
        const deliveries = await prisma.summaryEmailDelivery.findMany({
          where: {
            summaryId: summary.id,
            deliveryStatus: { in: ['sent', 'delivered'] },
          },
        });
        detail.emailed = deliveries.length > 0;
        detail.emailCount = deliveries.length;
      }
    }

    // Determine overall status
    if (detail.fetched && detail.summarized && detail.emailed) {
      detail.status = 'COMPLETE';
    } else if (!detail.fetched) {
      detail.status = 'FAILED';
    } else {
      detail.status = 'PENDING';
    }

    filingDetails.push(detail);
  }

  return filingDetails;
}

/**
 * Get AI cost breakdown by model
 */
async function getAiCostBreakdown(
  start: Date,
  end: Date
): Promise<{
  total: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelBreakdown: Record<string, AiModelCost>;
}> {
  const prisma = getPrismaClient();

  const summaries = await prisma.summary.findMany({
    where: {
      createdAt: { gte: start, lte: end },
    },
    select: {
      totalCost: true,
      inputTokens: true,
      outputTokens: true,
      tokensUsed: true,
      model: true,
    },
  });

  const modelBreakdown: Record<string, AiModelCost> = {};
  let total = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const summary of summaries) {
    const cost = summary.totalCost || 0;
    const input = summary.inputTokens || 0;
    const output = summary.outputTokens || 0;
    const tokens = summary.tokensUsed || (input + output);
    const model = summary.model || 'unknown';

    total += cost;
    inputTokens += input;
    outputTokens += output;
    totalTokens += tokens;

    if (!modelBreakdown[model]) {
      modelBreakdown[model] = { cost: 0, inputTokens: 0, outputTokens: 0 };
    }
    modelBreakdown[model].cost += cost;
    modelBreakdown[model].inputTokens += input;
    modelBreakdown[model].outputTokens += output;
  }

  return { total, inputTokens, outputTokens, totalTokens, modelBreakdown };
}

/**
 * Get cache health metrics
 */
async function getCacheHealthMetrics(
  start: Date,
  end: Date
): Promise<CacheHealthMetrics> {
  const prisma = getPrismaClient();

  const cacheEntries = await prisma.filingContentCache.findMany({
    where: {
      fetchedAt: { gte: start, lte: end },
    },
    select: {
      status: true,
      fetchDuration: true,
    },
  });

  const successfulCaches = cacheEntries.filter(c => c.status === 'CACHED').length;
  const errorCaches = cacheEntries.filter(c => c.status === 'ERROR').length;

  const entriesWithDuration = cacheEntries.filter(c => c.fetchDuration > 0);
  const avgFetchDurationMs = entriesWithDuration.length > 0
    ? entriesWithDuration.reduce((sum, c) => sum + c.fetchDuration, 0) / entriesWithDuration.length
    : 0;

  return {
    totalEntries: cacheEntries.length,
    successfulCaches,
    errorCaches,
    avgFetchDurationMs: Math.round(avgFetchDurationMs),
  };
}

/**
 * Get verification metrics for a date range
 * Enhanced to include detailed filing-level data
 */
async function getVerificationMetrics(
  start: Date,
  end: Date
): Promise<DailySummaryMetrics> {
  const startTime = Date.now();
  const prisma = getPrismaClient();

  // Get detailed filing-level data
  const filings = await getDiscoveredFilingsWithStatus(start, end);

  // Get AI cost breakdown
  const aiCosts = await getAiCostBreakdown(start, end);

  // Get cache health metrics
  const cacheHealth = await getCacheHealthMetrics(start, end);

  // Get cron execution stats for tickers checked
  const cronExecutions = await prisma.cronJobExecution.findMany({
    where: {
      startTime: { gte: start, lte: end },
      jobType: 'TIER_AWARE',
    },
    select: {
      tickersChecked: true,
    },
  });

  const tickersChecked = cronExecutions.reduce((sum, c) => sum + (c.tickersChecked || 0), 0);
  const avgTickersPerRun = cronExecutions.length > 0 ? Math.round(tickersChecked / cronExecutions.length) : 0;

  // Calculate aggregates from filings
  const totalCompleted = filings.filter(f => f.status === 'COMPLETE').length;
  const totalPending = filings.filter(f => f.status === 'PENDING').length;
  const fetchSuccess = filings.filter(f => f.fetched).length;
  const fetchFailed = filings.filter(f => !f.fetched).length;
  const summarizeSuccess = filings.filter(f => f.summarized).length;
  const summarizeFailed = filings.filter(f => f.fetched && !f.summarized).length;
  const emailsSent = filings.reduce((sum, f) => sum + f.emailCount, 0);
  const uniqueUsers = new Set(filings.filter(f => f.emailed).map(f => f.ticker)).size; // Using ticker as proxy for unique emails

  // Calculate completion rate
  const completionRate = filings.length > 0
    ? (totalCompleted / filings.length) * 100
    : 100;

  // Get models used
  const models = Object.keys(aiCosts.modelBreakdown);
  const modelStr = models.length > 0 ? models.join(', ') : 'N/A';

  const durationMs = Date.now() - startTime;

  return {
    completionRate: Math.min(100, completionRate),
    discovery: {
      filingsDiscovered: filings.length,
      tickersChecked: avgTickersPerRun,
    },
    fetch: {
      completed: fetchSuccess,
      failed: fetchFailed,
    },
    summarize: {
      completed: summarizeSuccess,
      failed: summarizeFailed,
      cached: 0, // TODO: Track cache hits separately
    },
    email: {
      sent: emailsSent,
      recipients: uniqueUsers,
    },
    costs: {
      total: aiCosts.total,
      model: modelStr,
      inputTokens: aiCosts.inputTokens,
      outputTokens: aiCosts.outputTokens,
      totalTokens: aiCosts.totalTokens,
      modelBreakdown: aiCosts.modelBreakdown,
    },
    filings,
    cacheHealth,
    durationMs,
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
