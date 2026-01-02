/**
 * Daily Report Handler for Slack
 *
 * Generates daily pipeline verification reports for Slack.
 * Integrates with the verify-daily-pipeline script functionality.
 *
 * Enhanced to provide detailed filing-level breakdown matching
 * the verify-daily-pipeline.ts output format.
 *
 * NOTE: Uses raw SQL queries to work with the actual database schema
 * (tables are in 'app' and 'pipeline' schemas after Supabase migration)
 */

import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';
import type {
  SlackWebhookPayload,
  SlackBlock,
  DailySummaryMetrics,
  FilingVerificationDetail,
  AiModelCost,
  CacheHealthMetrics
} from './types';
import { formatDailySummaryMessage, formatIntervalSummaryMessage } from './message-formatter';
import {
  getOpenRouterCreditStatus,
  formatCreditStatusForSlack,
  type CreditStatus
} from '../ai/openrouter-credit-monitor';

const dailyReportLogger = logger.child('slack-daily-report');

// =============================================================================
// Database Queries using Raw SQL (app and pipeline schemas)
// =============================================================================

interface RssFilingRow {
  id: string;
  accessionNumber: string;
  filingType: string;
  filingDate: Date;
  createdAt: Date;
  symbol: string;
}

interface FilingCacheRow {
  accessionNumber: string;
  status: string;
}

interface SummaryRow {
  id: string;
  summaryText: string | null;
  processingStatus: string | null;
}

interface EmailDeliveryRow {
  id: string;
  deliveryStatus: string;
}

interface SummaryStatsRow {
  totalCost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  tokensUsed: number | null;
  model: string | null;
}

interface CacheStatsRow {
  status: string;
  fetchDuration: number;
}

interface CronExecRow {
  tickersChecked: number | null;
}

interface RemediationRow {
  remediationAttempted: number;
  remediationSucceeded: number;
  remediationFailed: number;
}

/**
 * Options for interval-based report generation
 */
export interface IntervalReportOptions {
  /** Skip posting if no filings discovered in interval (default: true) */
  skipEmpty?: boolean;
}

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

  // Start of day (midnight UTC)
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);

  // End of day (23:59:59.999 UTC)
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);

  // Format date string
  const dateStr = date.toISOString().split('T')[0];

  return { start, end, dateStr };
}

/**
 * Get date range for a specific interval (in minutes)
 * @param minutesBack - Number of minutes to look back from now
 * @returns { start: Date, end: Date, label: string }
 */
function getIntervalDateRange(minutesBack: number): { start: Date; end: Date; label: string } {
  const end = new Date();
  const start = new Date(end.getTime() - minutesBack * 60 * 1000);

  const formatTime = (date: Date) => date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const label = `${formatTime(start)} - ${formatTime(end)} AEDT`;

  return { start, end, label };
}

/**
 * Get all discovered filings in date range with their full verification status
 * Uses raw SQL to query the public schema directly
 */
async function getDiscoveredFilingsWithStatus(
  start: Date,
  end: Date
): Promise<FilingVerificationDetail[]> {
  const prisma = getPrismaClient();

  // Get discovered filings from RssFilingCheck joined with TickerMonitoring
  const discoveredFilings = await prisma.$queryRaw<RssFilingRow[]>`
    SELECT
      r.id,
      r."accessionNumber",
      r."filingType",
      r."filingDate",
      r."createdAt",
      t.symbol
    FROM app."RssFilingCheck" r
    JOIN app."TickerMonitoring" t ON r."tickerMonitoringId" = t.id
    WHERE r."createdAt" >= ${start} AND r."createdAt" <= ${end}
    ORDER BY r."createdAt" DESC
  `;

  const filingDetails: FilingVerificationDetail[] = [];

  for (const filing of discoveredFilings) {
    const detail: FilingVerificationDetail = {
      ticker: filing.symbol,
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
    const cacheResult = await prisma.$queryRaw<FilingCacheRow[]>`
      SELECT "accessionNumber", status
      FROM pipeline."FilingContentCache"
      WHERE "accessionNumber" = ${filing.accessionNumber}
      LIMIT 1
    `;
    detail.fetched = cacheResult.length > 0 && cacheResult[0].status === 'CACHED';

    if (detail.fetched) {
      // Check summarization status
      const accessionNoDashes = filing.accessionNumber.replace(/-/g, '');
      const summaryResult = await prisma.$queryRaw<SummaryRow[]>`
        SELECT s.id, s."summaryText", s."processingStatus"
        FROM app."Summary" s
        LEFT JOIN app."SecFiling" sf ON s."secFilingId" = sf.id
        WHERE sf."accessionNumber" = ${filing.accessionNumber}
           OR s."filingUrl" LIKE ${'%' + accessionNoDashes + '%'}
        LIMIT 1
      `;

      if (summaryResult.length > 0) {
        const summary = summaryResult[0];
        detail.summarized = !!(summary.summaryText && summary.summaryText.trim().length > 0);

        if (detail.summarized) {
          // Check email delivery status
          const deliveries = await prisma.$queryRaw<EmailDeliveryRow[]>`
            SELECT id, "deliveryStatus"
            FROM pipeline."SummaryEmailDelivery"
            WHERE "summaryId" = ${summary.id}
              AND "deliveryStatus" IN ('sent', 'delivered')
          `;
          detail.emailed = deliveries.length > 0;
          detail.emailCount = deliveries.length;
        }
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

  const summaries = await prisma.$queryRaw<SummaryStatsRow[]>`
    SELECT "totalCost", "inputTokens", "outputTokens", "tokensUsed", model
    FROM app."Summary"
    WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
  `;

  const modelBreakdown: Record<string, AiModelCost> = {};
  let total = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const summary of summaries) {
    const cost = Number(summary.totalCost) || 0;
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

  const cacheEntries = await prisma.$queryRaw<CacheStatsRow[]>`
    SELECT status, "fetchDuration"
    FROM pipeline."FilingContentCache"
    WHERE "fetchedAt" >= ${start} AND "fetchedAt" <= ${end}
  `;

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
  const cronExecutions = await prisma.$queryRaw<CronExecRow[]>`
    SELECT "tickersChecked"
    FROM pipeline."CronJobExecution"
    WHERE "startedAt" >= ${start} AND "startedAt" <= ${end}
      AND "jobName" = 'tier-aware'
  `;

  const tickersChecked = cronExecutions.reduce((sum, c) => sum + (c.tickersChecked || 0), 0);
  const avgTickersPerRun = cronExecutions.length > 0 ? Math.round(tickersChecked / cronExecutions.length) : 0;

  // Calculate aggregates from filings
  const totalCompleted = filings.filter(f => f.status === 'COMPLETE').length;
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
    const verification = await prisma.$queryRaw<RemediationRow[]>`
      SELECT "remediationAttempted", "remediationSucceeded", "remediationFailed"
      FROM pipeline."DailyPipelineVerification"
      WHERE "verificationDate" >= ${start} AND "verificationDate" <= ${end}
      LIMIT 1
    `;

    if (verification.length === 0) return undefined;

    return {
      attempted: verification[0].remediationAttempted,
      succeeded: verification[0].remediationSucceeded,
      failed: verification[0].remediationFailed,
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
 * Generate an interval-based verification report for Slack
 * Uses the same rich format as daily reports but for shorter time windows
 *
 * @param minutesBack - Number of minutes to look back (default: 10)
 * @param options - Report generation options
 */
export async function generateIntervalReport(
  minutesBack: number = 10,
  options: IntervalReportOptions = {}
): Promise<SlackWebhookPayload> {
  const { skipEmpty = true } = options;
  const { start, end, label } = getIntervalDateRange(minutesBack);

  dailyReportLogger.info('Generating interval report', { minutesBack, start, end });

  try {
    // Get metrics using the same function as daily reports
    const metrics = await getVerificationMetrics(start, end);

    // Skip if no activity and skipEmpty is true
    if (skipEmpty && metrics.discovery.filingsDiscovered === 0) {
      dailyReportLogger.info('No filings in interval, skipping report', { minutesBack, start, end });
      return {
        text: '',
        blocks: [],
        unfurl_links: false,
        unfurl_media: false,
      };
    }

    dailyReportLogger.info('Interval report generated', {
      minutesBack,
      completionRate: metrics.completionRate,
      discovered: metrics.discovery.filingsDiscovered,
      emailsSent: metrics.email.sent,
    });

    // Format using interval-specific formatter
    return formatIntervalSummaryMessage(minutesBack, label, metrics);
  } catch (error) {
    dailyReportLogger.error('Error generating interval report', {
      error: error instanceof Error ? error.message : 'Unknown error',
      minutesBack,
    });

    return {
      text: `Error generating ${minutesBack}-minute report`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:x: *Error generating ${minutesBack}-minute report*\n\n${error instanceof Error ? error.message : 'Unknown error'}`,
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

  interface QueueStatusRow {
    status: string;
    count: bigint;
  }

  interface EmailCountRow {
    count: bigint;
  }

  const [queueStatus, emailCountResult] = await Promise.all([
    // Queue metrics
    prisma.$queryRaw<QueueStatusRow[]>`
      SELECT status, COUNT(*)::bigint as count
      FROM pipeline."JobQueue"
      WHERE status IN ('PENDING', 'PROCESSING')
         OR (status = 'COMPLETED' AND "completedAt" >= ${since})
         OR (status = 'FAILED' AND "failedAt" >= ${since})
      GROUP BY status
    `,

    // Email count
    prisma.$queryRaw<EmailCountRow[]>`
      SELECT COUNT(*)::bigint as count
      FROM pipeline."SummaryEmailDelivery"
      WHERE "sentAt" >= ${since}
    `,
  ]);

  const pending = Number(queueStatus.find(s => s.status === 'PENDING')?.count || 0n);
  const processing = Number(queueStatus.find(s => s.status === 'PROCESSING')?.count || 0n);
  const completed = Number(queueStatus.find(s => s.status === 'COMPLETED')?.count || 0n);
  const failed = Number(queueStatus.find(s => s.status === 'FAILED')?.count || 0n);
  const emailCount = Number(emailCountResult[0]?.count || 0n);

  return {
    queueDepth: pending + processing,
    completedJobs: completed,
    failedJobs: failed,
    emailsSent: emailCount,
  };
}

// =============================================================================
// Hourly Summary Types and Functions
// =============================================================================

export interface HourlySummaryMetrics {
  periodStart: Date;
  periodEnd: Date;
  queue: {
    pending: number;
    processing: number;
    completedLastHour: number;
    failedLastHour: number;
  };
  discovery: {
    filingsDiscovered: number;
    uniqueTickers: string[];
  };
  summarization: {
    summariesGenerated: number;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  email: {
    sent: number;
    uniqueRecipients: number;
  };
  pipelineHealth: {
    healthy: boolean;
    issues: string[];
    staleJobsCount: number;
    oldestPendingMinutes: number | null;
  };
  /** OpenRouter credit status for monitoring */
  creditStatus?: CreditStatus;
}

/**
 * Get hourly summary metrics for the past hour
 */
async function getHourlySummaryMetrics(): Promise<HourlySummaryMetrics> {
  const prisma = getPrismaClient();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Queue status
  interface QueueStatusRow {
    status: string;
    count: bigint;
  }

  const queueStatus = await prisma.$queryRaw<QueueStatusRow[]>`
    SELECT status, COUNT(*)::bigint as count
    FROM pipeline."JobQueue"
    WHERE status IN ('PENDING', 'PROCESSING')
       OR (status = 'COMPLETED' AND "completedAt" >= ${oneHourAgo})
       OR (status = 'FAILED' AND "failedAt" >= ${oneHourAgo})
    GROUP BY status
  `;

  const pending = Number(queueStatus.find(s => s.status === 'PENDING')?.count || 0n);
  const processing = Number(queueStatus.find(s => s.status === 'PROCESSING')?.count || 0n);
  const completed = Number(queueStatus.find(s => s.status === 'COMPLETED')?.count || 0n);
  const failed = Number(queueStatus.find(s => s.status === 'FAILED')?.count || 0n);

  // Filings discovered in the last hour
  interface DiscoveryRow {
    symbol: string;
  }

  const discoveries = await prisma.$queryRaw<DiscoveryRow[]>`
    SELECT DISTINCT t.symbol
    FROM app."RssFilingCheck" r
    JOIN app."TickerMonitoring" t ON r."tickerMonitoringId" = t.id
    WHERE r."createdAt" >= ${oneHourAgo}
  `;

  interface FilingCountRow {
    count: bigint;
  }

  const discoveryCount = await prisma.$queryRaw<FilingCountRow[]>`
    SELECT COUNT(*)::bigint as count
    FROM app."RssFilingCheck"
    WHERE "createdAt" >= ${oneHourAgo}
  `;

  // Summaries generated in the last hour
  interface SummaryStatsRow {
    count: bigint;
    totalCost: number | null;
    inputTokens: bigint | null;
    outputTokens: bigint | null;
  }

  const summaryStats = await prisma.$queryRaw<SummaryStatsRow[]>`
    SELECT
      COUNT(*)::bigint as count,
      COALESCE(SUM("totalCost"), 0) as "totalCost",
      COALESCE(SUM("inputTokens"), 0)::bigint as "inputTokens",
      COALESCE(SUM("outputTokens"), 0)::bigint as "outputTokens"
    FROM app."Summary"
    WHERE "createdAt" >= ${oneHourAgo}
      AND "summaryText" IS NOT NULL
  `;

  // Emails sent in the last hour
  interface EmailStatsRow {
    sent: bigint;
    uniqueRecipients: bigint;
  }

  const emailStats = await prisma.$queryRaw<EmailStatsRow[]>`
    SELECT
      COUNT(*)::bigint as sent,
      COUNT(DISTINCT "emailAddress")::bigint as "uniqueRecipients"
    FROM pipeline."SummaryEmailDelivery"
    WHERE "sentAt" >= ${oneHourAgo}
      AND "deliveryStatus" IN ('sent', 'delivered')
  `;

  // Pipeline health checks
  interface StaleJobRow {
    count: bigint;
  }

  const staleJobs = await prisma.$queryRaw<StaleJobRow[]>`
    SELECT COUNT(*)::bigint as count
    FROM pipeline."JobQueue"
    WHERE status = 'PROCESSING'
      AND "startedAt" < ${new Date(now.getTime() - 15 * 60 * 1000)}
  `;

  interface OldestPendingRow {
    createdAt: Date | null;
  }

  const oldestPending = await prisma.$queryRaw<OldestPendingRow[]>`
    SELECT MIN("createdAt") as "createdAt"
    FROM pipeline."JobQueue"
    WHERE status = 'PENDING'
  `;

  // Calculate health issues
  const issues: string[] = [];
  const staleCount = Number(staleJobs[0]?.count || 0n);
  if (staleCount > 0) {
    issues.push(`${staleCount} jobs stuck in PROCESSING for >15 minutes`);
  }
  if (pending > 100) {
    issues.push(`High queue depth: ${pending} pending jobs`);
  }
  if (failed > 5) {
    issues.push(`${failed} jobs failed in the last hour`);
  }

  const oldestPendingTime = oldestPending[0]?.createdAt;
  const oldestPendingMinutes = oldestPendingTime
    ? Math.round((now.getTime() - new Date(oldestPendingTime).getTime()) / 60000)
    : null;

  if (oldestPendingMinutes && oldestPendingMinutes > 30) {
    issues.push(`Oldest pending job is ${oldestPendingMinutes} minutes old`);
  }

  return {
    periodStart: oneHourAgo,
    periodEnd: now,
    queue: {
      pending,
      processing,
      completedLastHour: completed,
      failedLastHour: failed,
    },
    discovery: {
      filingsDiscovered: Number(discoveryCount[0]?.count || 0n),
      uniqueTickers: discoveries.map(d => d.symbol),
    },
    summarization: {
      summariesGenerated: Number(summaryStats[0]?.count || 0n),
      totalCost: Number(summaryStats[0]?.totalCost || 0),
      totalInputTokens: Number(summaryStats[0]?.inputTokens || 0n),
      totalOutputTokens: Number(summaryStats[0]?.outputTokens || 0n),
    },
    email: {
      sent: Number(emailStats[0]?.sent || 0n),
      uniqueRecipients: Number(emailStats[0]?.uniqueRecipients || 0n),
    },
    pipelineHealth: {
      healthy: issues.length === 0,
      issues,
      staleJobsCount: staleCount,
      oldestPendingMinutes,
    },
  };
}

/**
 * Generate an hourly summary report for Slack
 */
export async function generateHourlySummary(): Promise<SlackWebhookPayload> {
  dailyReportLogger.info('Generating hourly summary');

  try {
    const metrics = await getHourlySummaryMetrics();

    // Fetch OpenRouter credit status
    try {
      metrics.creditStatus = await getOpenRouterCreditStatus();
      dailyReportLogger.info('Credit status fetched', {
        credits: metrics.creditStatus.credits,
        isLow: metrics.creditStatus.isLow,
        limitReached: metrics.creditStatus.limitReached
      });

      // Add credit warning to issues if low
      if (metrics.creditStatus.isLow || metrics.creditStatus.limitReached) {
        metrics.pipelineHealth.issues.push(
          metrics.creditStatus.limitReached
            ? `OpenRouter credit limit reached! Usage: $${metrics.creditStatus.usage.toFixed(2)}`
            : `OpenRouter credits low: $${metrics.creditStatus.credits.toFixed(2)} remaining`
        );
        metrics.pipelineHealth.healthy = false;
      }
    } catch (creditError) {
      dailyReportLogger.warn('Failed to fetch credit status', {
        error: creditError instanceof Error ? creditError.message : 'Unknown error'
      });
    }

    dailyReportLogger.info('Hourly summary generated', {
      filingsDiscovered: metrics.discovery.filingsDiscovered,
      summariesGenerated: metrics.summarization.summariesGenerated,
      emailsSent: metrics.email.sent,
      healthy: metrics.pipelineHealth.healthy,
    });

    return formatHourlySummaryMessage(metrics);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dailyReportLogger.error('Error generating hourly summary', { error: errorMessage });

    // Check for schema-related errors (indicates DATABASE_URL misconfiguration)
    const isSchemaError =
      errorMessage.includes('does not exist') &&
      (errorMessage.includes('pipeline.') || errorMessage.includes('app.'));

    if (isSchemaError) {
      // Import schema diagnostic dynamically to avoid circular deps
      const { checkDatabaseSchemas } = await import('@/lib/db/supabase-config');
      const diagnostic = await checkDatabaseSchemas();

      return {
        text: 'Database Configuration Error - Hourly Summary Failed',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:rotating_light: *Database Configuration Error*\n\n` +
                `The hourly summary failed because the database schemas are misconfigured.\n\n` +
                `*Diagnostic:*\n` +
                `• Database Type: \`${diagnostic.databaseType}\`\n` +
                `• Found Schemas: \`[${diagnostic.foundSchemas.join(', ') || 'none'}]\`\n` +
                `• Expected: \`[app, pipeline]\`\n` +
                `• Migration Complete: ${diagnostic.migrationComplete ? ':white_check_mark:' : ':x:'}\n\n` +
                `*Root Cause:* ${diagnostic.message}\n\n` +
                `*Fix Required:* Update \`DATABASE_URL\` in Vercel to point to Supabase with \`app\` and \`pipeline\` schemas.`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Original error: \`${errorMessage.substring(0, 200)}\``,
              },
            ],
          },
        ],
      };
    }

    return {
      text: 'Error generating hourly summary',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:x: *Error generating hourly summary*\n\n${errorMessage}`,
          },
        },
      ],
    };
  }
}

/**
 * Format hourly summary message for Slack
 */
function formatHourlySummaryMessage(metrics: HourlySummaryMetrics): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // Header with health indicator
  const healthEmoji = metrics.pipelineHealth.healthy ? ':white_check_mark:' : ':warning:';
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `${healthEmoji} Hourly Pipeline Summary`, emoji: true },
  });

  blocks.push({ type: 'divider' });

  // Time range context
  const formatTime = (date: Date) => date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `:clock1: *Period:* ${formatTime(metrics.periodStart)} - ${formatTime(metrics.periodEnd)} AEDT` },
    ],
  });

  // Queue Status
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `:package: *Queue Status*\n` +
        `• Pending: ${metrics.queue.pending}\n` +
        `• Processing: ${metrics.queue.processing}\n` +
        `• Completed: ${metrics.queue.completedLastHour}\n` +
        `• Failed: ${metrics.queue.failedLastHour}`,
    },
  });

  // Discovery (only show if there's activity)
  if (metrics.discovery.filingsDiscovered > 0) {
    const tickerList = metrics.discovery.uniqueTickers.length > 0
      ? ` (${metrics.discovery.uniqueTickers.join(', ')})`
      : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:inbox_tray: *Discovery*\n` +
          `• Filings discovered: ${metrics.discovery.filingsDiscovered}${tickerList}`,
      },
    });
  }

  // Summarization (only show if there's activity)
  if (metrics.summarization.summariesGenerated > 0) {
    const tokenInfo = metrics.summarization.totalInputTokens > 0
      ? `\n• Tokens: ${(metrics.summarization.totalInputTokens / 1000).toFixed(1)}k in / ${(metrics.summarization.totalOutputTokens / 1000).toFixed(1)}k out`
      : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:brain: *Summarization*\n` +
          `• Summaries generated: ${metrics.summarization.summariesGenerated}\n` +
          `• Cost: $${metrics.summarization.totalCost.toFixed(4)}${tokenInfo}`,
      },
    });
  }

  // Email delivery (only show if there's activity)
  if (metrics.email.sent > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:email: *Email Delivery*\n` +
          `• Emails sent: ${metrics.email.sent}\n` +
          `• Unique recipients: ${metrics.email.uniqueRecipients}`,
      },
    });
  }

  // Show "No activity" if nothing happened
  if (
    metrics.discovery.filingsDiscovered === 0 &&
    metrics.summarization.summariesGenerated === 0 &&
    metrics.email.sent === 0 &&
    metrics.queue.completedLastHour === 0
  ) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:zzz: *No pipeline activity in the last hour*`,
      },
    });
  }

  // OpenRouter Credit Status
  if (metrics.creditStatus) {
    const creditInfo = formatCreditStatusForSlack(metrics.creditStatus);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:dollar: *OpenRouter Credits*\n${creditInfo.text}`,
      },
    });
  }

  // Health issues (if any)
  if (!metrics.pipelineHealth.healthy) {
    blocks.push({ type: 'divider' });
    const issuesText = metrics.pipelineHealth.issues.map(i => `• ${i}`).join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:warning: *Issues Detected*\n${issuesText}`,
      },
    });
  }

  // Fallback text
  const activity = metrics.queue.completedLastHour > 0 || metrics.discovery.filingsDiscovered > 0
    ? `${metrics.queue.completedLastHour} jobs, ${metrics.discovery.filingsDiscovered} filings, ${metrics.email.sent} emails`
    : 'No activity';
  const healthStatus = metrics.pipelineHealth.healthy ? 'Healthy' : `${metrics.pipelineHealth.issues.length} issues`;
  const fallbackText = `Hourly Summary: ${activity} | ${healthStatus}`;

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}
