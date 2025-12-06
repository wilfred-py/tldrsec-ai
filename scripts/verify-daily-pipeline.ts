#!/usr/bin/env tsx
/**
 * Daily Pipeline Verification Script
 *
 * Verifies that all SEC filings discovered yesterday were successfully:
 * 1. Discovered (RssFilingCheck created)
 * 2. Fetched (SecFetchAttempt with status='success')
 * 3. Summarized (Summary record exists)
 * 4. Emailed (SummaryEmailDelivery records exist)
 *
 * Usage:
 *   npm run verify:daily              # Verify yesterday
 *   npm run verify:daily -- --date=2025-11-28  # Verify specific date
 */

import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import path from 'path';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Types
interface FilingVerification {
  accessionNumber: string;
  ticker: string;
  formType: string;
  filingDate: Date;
  discoveredAt: Date;

  // Phase results
  discovered: boolean;
  fetched: boolean;
  fetchError?: string;
  summarized: boolean;
  summarizeError?: string;
  emailed: boolean;
  emailCount: number;
  uniqueUsers: number;

  // Overall status
  status: 'COMPLETE' | 'PENDING' | 'FAILED';
  failurePhase?: 'FETCH' | 'SUMMARIZE' | 'EMAIL';

  // Remediation
  remediationAttempted: boolean;
  remediationSucceeded: boolean;
  remediationError?: string;
}

interface AiModelUsage {
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

// Cache health metrics for Phase 2 enhanced reporting
interface CacheHealthReport {
  totalCacheEntries: number;
  successfulCaches: number;
  errorCaches: number;
  avgFetchDuration: number;
  topErrors: Array<{ error: string; count: number }>;
}

interface VerificationReport {
  verificationDate: Date;
  startTime: Date;
  endTime: Date;

  filings: FilingVerification[];

  // Aggregates
  totalDiscovered: number;
  totalCompleted: number;
  totalPending: number;
  totalFailed: number;

  fetchSuccess: number;
  fetchFailed: number;
  summarizeSuccess: number;
  summarizeFailed: number;
  emailsSent: number;
  uniqueUsersNotified: number;

  // OpenRouter API costs
  aiTotalCostUsd: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiTotalTokens: number;
  aiModelBreakdown: Record<string, AiModelUsage>;

  remediationAttempted: number;
  remediationSucceeded: number;
  remediationFailed: number;

  // Phase 2: Cache health metrics
  cacheHealth?: CacheHealthReport;

  durationMs: number;
  errors: string[];
}

// Get date range for "yesterday" (midnight to midnight in local timezone)
function getYesterdayRange(targetDate?: string): { start: Date; end: Date } {
  let date: Date;

  if (targetDate) {
    date = new Date(targetDate);
  } else {
    date = new Date();
    date.setDate(date.getDate() - 1);
  }

  // Start of day (midnight)
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  // End of day (23:59:59.999)
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// Phase 1: Get all filings discovered in date range
async function getDiscoveredFilings(start: Date, end: Date): Promise<Array<{
  id: string;
  accessionNumber: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  createdAt: Date;
  tickerMonitoring: {
    symbol: string;
    companyName: string;
    cik: string;
  };
}>> {
  return prisma.rssFilingCheck.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      tickerMonitoring: {
        select: {
          symbol: true,
          companyName: true,
          cik: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

// Phase 2: Check fetch status for a filing
// Uses FilingContentCache (current data model) instead of legacy SecFetchAttempt
async function checkFetchStatus(accessionNumber: string): Promise<{
  fetched: boolean;
  error?: string;
}> {
  // Query FilingContentCache instead of SecFetchAttempt
  const cachedContent = await prisma.filingContentCache.findUnique({
    where: {
      accessionNumber: accessionNumber,
    },
  });

  if (!cachedContent) {
    return { fetched: false, error: 'No fetch attempt recorded in cache' };
  }

  // Check if content was successfully cached
  if (cachedContent.status === 'CACHED') {
    return { fetched: true };
  }

  // Handle error cases
  if (cachedContent.status === 'ERROR') {
    return {
      fetched: false,
      error: cachedContent.fetchError || `Fetch status: ${cachedContent.status}`
    };
  }

  return {
    fetched: false,
    error: `Unknown cache status: ${cachedContent.status}`
  };
}

// Phase 2: Generate cache health report for enhanced error reporting
async function generateCacheHealthReport(startDate: Date, endDate: Date): Promise<CacheHealthReport> {
  const cacheEntries = await prisma.filingContentCache.findMany({
    where: {
      fetchedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      status: true,
      fetchError: true,
      fetchDuration: true,
    },
  });

  const successfulCaches = cacheEntries.filter(c => c.status === 'CACHED').length;
  const errorCaches = cacheEntries.filter(c => c.status === 'ERROR').length;

  const entriesWithDuration = cacheEntries.filter(c => c.fetchDuration > 0);
  const avgFetchDuration = entriesWithDuration.length > 0
    ? entriesWithDuration.reduce((sum, c) => sum + c.fetchDuration, 0) / entriesWithDuration.length
    : 0;

  // Aggregate error messages
  const errorCounts = new Map<string, number>();
  cacheEntries
    .filter(c => c.status === 'ERROR' && c.fetchError)
    .forEach(c => {
      const error = c.fetchError!;
      errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
    });

  const topErrors = Array.from(errorCounts.entries())
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalCacheEntries: cacheEntries.length,
    successfulCaches,
    errorCaches,
    avgFetchDuration: Math.round(avgFetchDuration),
    topErrors,
  };
}

// Phase 3: Check summarization status for a filing
async function checkSummarizeStatus(accessionNumber: string): Promise<{
  summarized: boolean;
  summaryId?: string;
  error?: string;
}> {
  // Try to find summary by secFiling relation
  let summary = await prisma.summary.findFirst({
    where: {
      secFiling: {
        accessionNumber: accessionNumber,
      },
    },
    select: {
      id: true,
      summaryText: true,
      processingStatus: true,
      processingError: true,
    },
  });

  // Fallback: search by filingUrl containing accession number
  if (!summary) {
    const accessionNoDashes = accessionNumber.replace(/-/g, '');
    summary = await prisma.summary.findFirst({
      where: {
        filingUrl: {
          contains: accessionNoDashes,
        },
      },
      select: {
        id: true,
        summaryText: true,
        processingStatus: true,
        processingError: true,
      },
    });
  }

  if (!summary) {
    return { summarized: false, error: 'Summary record not found' };
  }

  if (summary.processingStatus === 'failed') {
    return {
      summarized: false,
      summaryId: summary.id,
      error: summary.processingError || 'Processing failed'
    };
  }

  if (!summary.summaryText || summary.summaryText.trim().length === 0) {
    return {
      summarized: false,
      summaryId: summary.id,
      error: 'Summary text is empty'
    };
  }

  return { summarized: true, summaryId: summary.id };
}

// Phase 4: Check email delivery status for a summary
async function checkEmailStatus(summaryId: string): Promise<{
  emailed: boolean;
  emailCount: number;
  uniqueUsers: number;
}> {
  const deliveries = await prisma.summaryEmailDelivery.findMany({
    where: {
      summaryId: summaryId,
    },
    select: {
      userId: true,
      deliveryStatus: true,
    },
  });

  const successfulDeliveries = deliveries.filter(d =>
    d.deliveryStatus === 'sent' || d.deliveryStatus === 'delivered'
  );

  const uniqueUserIds = new Set(successfulDeliveries.map(d => d.userId));

  return {
    emailed: successfulDeliveries.length > 0,
    emailCount: successfulDeliveries.length,
    uniqueUsers: uniqueUserIds.size,
  };
}

// Verify a single filing through all phases
async function verifyFiling(filing: Awaited<ReturnType<typeof getDiscoveredFilings>>[0]): Promise<FilingVerification> {
  const result: FilingVerification = {
    accessionNumber: filing.accessionNumber,
    ticker: filing.tickerMonitoring.symbol,
    formType: filing.filingType,
    filingDate: filing.filingDate,
    discoveredAt: filing.createdAt,

    discovered: true, // We got it from RssFilingCheck
    fetched: false,
    summarized: false,
    emailed: false,
    emailCount: 0,
    uniqueUsers: 0,

    status: 'PENDING',
    remediationAttempted: false,
    remediationSucceeded: false,
  };

  // Phase 2: Check fetch
  const fetchResult = await checkFetchStatus(filing.accessionNumber);
  result.fetched = fetchResult.fetched;
  result.fetchError = fetchResult.error;

  if (!result.fetched) {
    result.status = 'FAILED';
    result.failurePhase = 'FETCH';
    return result;
  }

  // Phase 3: Check summarization
  const summarizeResult = await checkSummarizeStatus(filing.accessionNumber);
  result.summarized = summarizeResult.summarized;
  result.summarizeError = summarizeResult.error;

  if (!result.summarized) {
    result.status = summarizeResult.summaryId ? 'FAILED' : 'PENDING';
    result.failurePhase = 'SUMMARIZE';
    return result;
  }

  // Phase 4: Check email delivery
  if (summarizeResult.summaryId) {
    const emailResult = await checkEmailStatus(summarizeResult.summaryId);
    result.emailed = emailResult.emailed;
    result.emailCount = emailResult.emailCount;
    result.uniqueUsers = emailResult.uniqueUsers;

    if (!result.emailed) {
      result.status = 'PENDING';
      result.failurePhase = 'EMAIL';
      return result;
    }
  }

  result.status = 'COMPLETE';
  return result;
}

// Aggregate AI costs from summaries generated in date range
async function aggregateAiCosts(start: Date, end: Date): Promise<{
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelBreakdown: Record<string, AiModelUsage>;
}> {
  const summaries = await prisma.summary.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: {
      totalCost: true,
      inputTokens: true,
      outputTokens: true,
      tokensUsed: true,
      model: true,
    },
  });

  const modelBreakdown: Record<string, AiModelUsage> = {};

  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const summary of summaries) {
    const cost = summary.totalCost || 0;
    const input = summary.inputTokens || 0;
    const output = summary.outputTokens || 0;
    const total = summary.tokensUsed || (input + output);
    const model = summary.model || 'unknown';

    totalCost += cost;
    inputTokens += input;
    outputTokens += output;
    totalTokens += total;

    // Aggregate by model
    if (!modelBreakdown[model]) {
      modelBreakdown[model] = { cost: 0, inputTokens: 0, outputTokens: 0 };
    }
    modelBreakdown[model].cost += cost;
    modelBreakdown[model].inputTokens += input;
    modelBreakdown[model].outputTokens += output;
  }

  return { totalCost, inputTokens, outputTokens, totalTokens, modelBreakdown };
}

// Main verification function
async function runVerification(targetDate?: string): Promise<VerificationReport> {
  const startTime = new Date();
  const { start, end } = getYesterdayRange(targetDate);
  const errors: string[] = [];

  console.log(chalk.blue(`\nVerifying filings from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}...\n`));

  // Get all discovered filings
  const discoveredFilings = await getDiscoveredFilings(start, end);
  console.log(chalk.gray(`Found ${discoveredFilings.length} filings discovered in date range\n`));

  // Verify each filing
  const filings: FilingVerification[] = [];
  for (const filing of discoveredFilings) {
    try {
      const result = await verifyFiling(filing);
      filings.push(result);
    } catch (err) {
      const errorMsg = `Error verifying ${filing.accessionNumber}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errorMsg);
      console.error(chalk.red(errorMsg));
    }
  }

  // Calculate aggregates
  const totalCompleted = filings.filter(f => f.status === 'COMPLETE').length;
  const totalPending = filings.filter(f => f.status === 'PENDING').length;
  const totalFailed = filings.filter(f => f.status === 'FAILED').length;

  const fetchSuccess = filings.filter(f => f.fetched).length;
  const fetchFailed = filings.filter(f => !f.fetched).length;
  const summarizeSuccess = filings.filter(f => f.summarized).length;
  const summarizeFailed = filings.filter(f => f.fetched && !f.summarized).length;

  const emailsSent = filings.reduce((sum, f) => sum + f.emailCount, 0);
  const uniqueUsersNotified = filings.reduce((sum, f) => sum + f.uniqueUsers, 0);

  // Aggregate AI costs from summaries generated in this date range
  const aiCosts = await aggregateAiCosts(start, end);

  // Phase 2: Generate cache health report
  const cacheHealth = await generateCacheHealthReport(start, end);

  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  return {
    verificationDate: start,
    startTime,
    endTime,
    filings,
    totalDiscovered: filings.length,
    totalCompleted,
    totalPending,
    totalFailed,
    fetchSuccess,
    fetchFailed,
    summarizeSuccess,
    summarizeFailed,
    emailsSent,
    uniqueUsersNotified,
    aiTotalCostUsd: aiCosts.totalCost,
    aiInputTokens: aiCosts.inputTokens,
    aiOutputTokens: aiCosts.outputTokens,
    aiTotalTokens: aiCosts.totalTokens,
    aiModelBreakdown: aiCosts.modelBreakdown,
    remediationAttempted: 0,
    remediationSucceeded: 0,
    remediationFailed: 0,
    cacheHealth,
    durationMs,
    errors,
  };
}

// Auto-remediation: Re-queue failed filing for processing
async function attemptRemediation(
  filing: FilingVerification,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  console.log(chalk.yellow(`  Attempting remediation for ${filing.ticker} ${filing.formType}...`));

  // Check existing retry count
  const existingJob = await prisma.jobQueue.findFirst({
    where: {
      payload: {
        path: ['accessionNumber'],
        equals: filing.accessionNumber,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const currentRetries = existingJob?.retryCount || 0;

  if (currentRetries >= maxRetries) {
    return {
      success: false,
      error: `Max retries (${maxRetries}) exceeded. Manual intervention required.`
    };
  }

  // Determine which phase to restart from
  let jobType: string;
  if (!filing.fetched) {
    jobType = 'filing_fetch';
  } else if (!filing.summarized) {
    jobType = 'filing_summarize';
  } else {
    jobType = 'filing_email';
  }

  try {
    // Create a new job in the queue
    await prisma.jobQueue.create({
      data: {
        jobType: jobType,
        status: 'PENDING',
        priority: 10, // High priority for remediation
        payload: {
          accessionNumber: filing.accessionNumber,
          ticker: filing.ticker,
          formType: filing.formType,
          isRemediation: true,
          previousFailurePhase: filing.failurePhase,
        } as Prisma.InputJsonValue,
        scheduledFor: new Date(),
        retryCount: currentRetries + 1,
        maxRetries: maxRetries,
      },
    });

    console.log(chalk.green(`    ✓ Re-queued as ${jobType} job (retry ${currentRetries + 1}/${maxRetries})`));
    return { success: true };

  } catch (err) {
    const error = `Failed to create remediation job: ${err instanceof Error ? err.message : String(err)}`;
    console.log(chalk.red(`    ✗ ${error}`));
    return { success: false, error };
  }
}

// Run remediation for all failed filings
async function runRemediation(
  filings: FilingVerification[],
  maxRetries: number = 3
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const failedFilings = filings.filter(f => f.status === 'FAILED' || f.status === 'PENDING');

  if (failedFilings.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  console.log(chalk.yellow(`\n🔧 AUTO-REMEDIATION`));
  console.log(chalk.gray('-'.repeat(70)));

  let succeeded = 0;
  let failed = 0;

  for (const filing of failedFilings) {
    const result = await attemptRemediation(filing, maxRetries);
    filing.remediationAttempted = true;
    filing.remediationSucceeded = result.success;
    filing.remediationError = result.error;

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { attempted: failedFilings.length, succeeded, failed };
}

// Display formatted report
function displayReport(report: VerificationReport): void {
  const { filings, verificationDate } = report;

  console.clear();
  console.log(chalk.cyan.bold('\n' + '═'.repeat(70)));
  console.log(chalk.cyan.bold('📊 DAILY PIPELINE VERIFICATION REPORT'));
  console.log(chalk.cyan.bold('═'.repeat(70)));
  console.log(chalk.gray(`Generated: ${new Date().toLocaleString()}`));
  console.log(chalk.gray(`Verification Date: ${verificationDate.toLocaleDateString()}`));
  console.log(chalk.gray(`Duration: ${report.durationMs}ms`));

  // No filings case
  if (filings.length === 0) {
    console.log(chalk.yellow('\n📭 No new filings found for this date.'));
    console.log(chalk.gray('   This is normal for weekends and market holidays.\n'));
    return;
  }

  // Filings discovered section
  console.log(chalk.blue(`\n📥 FILINGS DISCOVERED (${filings.length} total)`));
  console.log(chalk.gray('-'.repeat(70)));
  console.log(chalk.gray('  Ticker   Form       Accession               Filed        Status'));
  console.log(chalk.gray('  ──────   ────       ─────────               ─────        ──────'));

  for (const filing of filings) {
    const statusIcon = filing.status === 'COMPLETE' ? chalk.green('✅') :
                       filing.status === 'PENDING' ? chalk.yellow('⏳') :
                       chalk.red('❌');
    const statusText = filing.status === 'COMPLETE' ? chalk.green('COMPLETE') :
                       filing.status === 'PENDING' ? chalk.yellow('PENDING') :
                       chalk.red('FAILED');

    console.log(
      `  ${filing.ticker.padEnd(8)} ${filing.formType.padEnd(10)} ` +
      `${filing.accessionNumber.padEnd(23)} ` +
      `${filing.filingDate.toLocaleDateString().padEnd(12)} ` +
      `${statusIcon} ${statusText}`
    );
  }

  // Pipeline breakdown
  console.log(chalk.blue('\n📋 PIPELINE BREAKDOWN'));
  console.log(chalk.gray('-'.repeat(70)));
  console.log(chalk.gray('  Filing               Discovered  Fetched   Summarized  Emailed'));
  console.log(chalk.gray('  ──────               ──────────  ───────   ──────────  ───────'));

  for (const filing of filings) {
    const discovered = chalk.green('✅');
    const fetched = filing.fetched ? chalk.green('✅') : chalk.red('❌');
    const summarized = filing.summarized ? chalk.green('✅') :
                       filing.fetched ? chalk.red('❌') : chalk.gray('-');
    const emailed = filing.emailed ? chalk.green(`✅ (${filing.uniqueUsers})`) :
                    filing.summarized ? chalk.yellow('⏳') : chalk.gray('-');

    const label = `${filing.ticker} ${filing.formType}`.substring(0, 18);
    console.log(
      `  ${label.padEnd(20)} ${discovered.padEnd(12)}${fetched.padEnd(10)}` +
      `${summarized.padEnd(12)}${emailed}`
    );
  }

  // Summary statistics
  console.log(chalk.blue('\n📊 SUMMARY'));
  console.log(chalk.gray('-'.repeat(70)));
  console.log(`  Total Filings:     ${report.totalDiscovered}`);

  const completePercent = report.totalDiscovered > 0
    ? Math.round(report.totalCompleted / report.totalDiscovered * 100)
    : 0;
  const pendingPercent = report.totalDiscovered > 0
    ? Math.round(report.totalPending / report.totalDiscovered * 100)
    : 0;
  const failedPercent = report.totalDiscovered > 0
    ? Math.round(report.totalFailed / report.totalDiscovered * 100)
    : 0;

  console.log(chalk.green(`  ✅ Completed:      ${report.totalCompleted} (${completePercent}%)`));
  if (report.totalPending > 0) {
    console.log(chalk.yellow(`  ⏳ Pending:        ${report.totalPending} (${pendingPercent}%)`));
  }
  if (report.totalFailed > 0) {
    console.log(chalk.red(`  ❌ Failed:         ${report.totalFailed} (${failedPercent}%)`));
  }

  console.log(chalk.gray(`\n  📧 Emails Sent:    ${report.emailsSent} to ${report.uniqueUsersNotified} unique users`));

  // AI costs section
  if (report.aiTotalTokens > 0) {
    console.log(chalk.blue('\n💰 AI COSTS (OpenRouter)'));
    console.log(chalk.gray('-'.repeat(70)));
    console.log(`  Total Cost:        $${report.aiTotalCostUsd.toFixed(4)}`);
    console.log(`  Input Tokens:      ${report.aiInputTokens.toLocaleString()}`);
    console.log(`  Output Tokens:     ${report.aiOutputTokens.toLocaleString()}`);
    console.log(`  Total Tokens:      ${report.aiTotalTokens.toLocaleString()}`);

    // Model breakdown
    const models = Object.entries(report.aiModelBreakdown);
    if (models.length > 0) {
      console.log(chalk.gray('\n  By Model:'));
      for (const [model, usage] of models) {
        console.log(chalk.gray(`    ${model}:`));
        console.log(chalk.gray(`      Cost: $${usage.cost.toFixed(4)} | In: ${usage.inputTokens.toLocaleString()} | Out: ${usage.outputTokens.toLocaleString()}`));
      }
    }
  }

  // Phase 2: Cache health report
  if (report.cacheHealth) {
    const ch = report.cacheHealth;
    console.log(chalk.blue('\n📊 CACHE HEALTH REPORT'));
    console.log(chalk.gray('-'.repeat(70)));
    console.log(`  Total cache entries: ${ch.totalCacheEntries}`);

    if (ch.totalCacheEntries > 0) {
      const successRate = ((ch.successfulCaches / ch.totalCacheEntries) * 100).toFixed(1);
      const errorRate = ((ch.errorCaches / ch.totalCacheEntries) * 100).toFixed(1);

      console.log(chalk.green(`  Successful caches:   ${ch.successfulCaches} (${successRate}%)`));
      if (ch.errorCaches > 0) {
        console.log(chalk.red(`  Error caches:        ${ch.errorCaches} (${errorRate}%)`));
      }
      console.log(`  Avg fetch duration:  ${ch.avgFetchDuration}ms`);

      if (ch.topErrors.length > 0) {
        console.log(chalk.gray('\n  Top errors:'));
        ch.topErrors.forEach(({ error, count }) => {
          const truncatedError = error.length > 50 ? error.substring(0, 50) + '...' : error;
          console.log(chalk.red(`    • ${truncatedError}: ${count} occurrences`));
        });
      }
    }
  }

  // Remediation results
  if (report.remediationAttempted > 0) {
    console.log(chalk.yellow('\n🔧 REMEDIATION RESULTS'));
    console.log(chalk.gray('-'.repeat(70)));
    console.log(`  Attempted:  ${report.remediationAttempted}`);
    console.log(chalk.green(`  Succeeded:  ${report.remediationSucceeded}`));
    if (report.remediationFailed > 0) {
      console.log(chalk.red(`  Failed:     ${report.remediationFailed}`));
    }
  }

  // Action required section
  const needsAction = filings.filter(f =>
    f.status === 'FAILED' && f.remediationAttempted && !f.remediationSucceeded
  );

  if (needsAction.length > 0) {
    console.log(chalk.red.bold('\n⚠️  ACTION REQUIRED'));
    console.log(chalk.gray('-'.repeat(70)));

    needsAction.forEach((filing, idx) => {
      console.log(chalk.red(`  ${idx + 1}. ${filing.ticker} ${filing.formType} (${filing.accessionNumber})`));
      console.log(chalk.gray(`     Phase: ${filing.failurePhase}`));
      console.log(chalk.gray(`     Error: ${filing.fetchError || filing.summarizeError || filing.remediationError}`));
      console.log(chalk.gray(`     Action: Manual investigation required`));
    });
  }

  // Errors section
  if (report.errors.length > 0) {
    console.log(chalk.red('\n❌ ERRORS'));
    console.log(chalk.gray('-'.repeat(70)));
    report.errors.forEach(err => console.log(chalk.red(`  • ${err}`)));
  }

  console.log(chalk.cyan.bold('\n' + '═'.repeat(70) + '\n'));
}

// Save results to database
async function saveVerificationResults(report: VerificationReport): Promise<void> {
  try {
    await prisma.dailyPipelineVerification.upsert({
      where: {
        verificationDate: report.verificationDate,
      },
      update: {
        runAt: report.startTime,
        filingsDiscovered: report.totalDiscovered,
        filingsCompleted: report.totalCompleted,
        filingsPending: report.totalPending,
        filingsFailed: report.totalFailed,
        fetchSuccessCount: report.fetchSuccess,
        fetchFailedCount: report.fetchFailed,
        summarizeSuccessCount: report.summarizeSuccess,
        summarizeFailedCount: report.summarizeFailed,
        emailsSentCount: report.emailsSent,
        uniqueUsersNotified: report.uniqueUsersNotified,
        aiTotalCostUsd: report.aiTotalCostUsd,
        aiInputTokens: report.aiInputTokens,
        aiOutputTokens: report.aiOutputTokens,
        aiTotalTokens: report.aiTotalTokens,
        aiModelBreakdown: report.aiModelBreakdown as unknown as Prisma.InputJsonValue,
        remediationAttempted: report.remediationAttempted,
        remediationSucceeded: report.remediationSucceeded,
        remediationFailed: report.remediationFailed,
        filingDetails: report.filings as unknown as Prisma.InputJsonValue,
        durationMs: report.durationMs,
        errors: report.errors,
      },
      create: {
        verificationDate: report.verificationDate,
        runAt: report.startTime,
        filingsDiscovered: report.totalDiscovered,
        filingsCompleted: report.totalCompleted,
        filingsPending: report.totalPending,
        filingsFailed: report.totalFailed,
        fetchSuccessCount: report.fetchSuccess,
        fetchFailedCount: report.fetchFailed,
        summarizeSuccessCount: report.summarizeSuccess,
        summarizeFailedCount: report.summarizeFailed,
        emailsSentCount: report.emailsSent,
        uniqueUsersNotified: report.uniqueUsersNotified,
        aiTotalCostUsd: report.aiTotalCostUsd,
        aiInputTokens: report.aiInputTokens,
        aiOutputTokens: report.aiOutputTokens,
        aiTotalTokens: report.aiTotalTokens,
        aiModelBreakdown: report.aiModelBreakdown as unknown as Prisma.InputJsonValue,
        remediationAttempted: report.remediationAttempted,
        remediationSucceeded: report.remediationSucceeded,
        remediationFailed: report.remediationFailed,
        filingDetails: report.filings as unknown as Prisma.InputJsonValue,
        durationMs: report.durationMs,
        errors: report.errors,
      },
    });

    console.log(chalk.green('✓ Results saved to database'));
  } catch (err) {
    console.error(chalk.red(`Failed to save results: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// Main entry point
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let targetDate: string | undefined;
  let skipRemediation = false;

  for (const arg of args) {
    if (arg.startsWith('--date=')) {
      targetDate = arg.replace('--date=', '');
    }
    if (arg === '--no-remediation') {
      skipRemediation = true;
    }
  }

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    console.log(chalk.green('✓ Database connection established'));

    // Run verification
    const report = await runVerification(targetDate);

    // Run remediation if there are failures
    if (!skipRemediation && (report.totalFailed > 0 || report.totalPending > 0)) {
      const remediationResult = await runRemediation(report.filings);
      report.remediationAttempted = remediationResult.attempted;
      report.remediationSucceeded = remediationResult.succeeded;
      report.remediationFailed = remediationResult.failed;
    }

    // Display report
    displayReport(report);

    // Save to database
    await saveVerificationResults(report);

    // Exit with appropriate code
    if (report.totalFailed > 0 && report.remediationFailed > 0) {
      process.exit(1); // Failures that couldn't be remediated
    }
    process.exit(0);

  } catch (err) {
    console.error(chalk.red('\n❌ Verification failed:'), err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only if this file is executed directly (not imported)
// ES module equivalent of require.main === module
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && (
  path.resolve(process.argv[1]) === __filename ||
  path.resolve(process.argv[1]) === path.resolve(__filename)
);

if (isMainModule) {
  main().catch(console.error);
}

// Helper functions for testing
export function parseTargetDate(dateString: string | undefined): Date {
  if (!dateString) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD format.');
  }

  const today = new Date();
  if (parsed > today) {
    throw new Error('Cannot verify future date');
  }

  return parsed;
}

export function classifyFilingStatus(filing: Partial<FilingVerification>): Pick<FilingVerification, 'status' | 'failurePhase'> {
  if (!filing.discovered) {
    return { status: 'FAILED', failurePhase: 'FETCH' };
  }
  
  if (!filing.fetched) {
    return { status: 'FAILED', failurePhase: 'FETCH' };
  }
  
  if (!filing.summarized) {
    return { status: 'FAILED', failurePhase: 'SUMMARIZE' };
  }
  
  if (!filing.emailed && (filing.uniqueUsers || 0) > 0) {
    return { status: 'PENDING' };
  }
  
  return { status: 'COMPLETE' };
}

export function calculateSummaryStats(filings: Pick<FilingVerification, 'status'>[]): {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  completionRate: number;
} {
  const total = filings.length;
  const completed = filings.filter(f => f.status === 'COMPLETE').length;
  const pending = filings.filter(f => f.status === 'PENDING').length;
  const failed = filings.filter(f => f.status === 'FAILED').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, failed, completionRate };
}

export function shouldAttemptRemediation(filing: Pick<FilingVerification, 'status' | 'remediationAttempted'>): boolean {
  return filing.status === 'FAILED' && !filing.remediationAttempted;
}

export function formatVerificationResults(filings: Pick<FilingVerification, 'accessionNumber' | 'ticker' | 'formType' | 'status' | 'failurePhase' | 'fetchError'>[]): string {
  if (filings.length === 0) {
    return 'No filings found for verification date.';
  }

  let output = '\n📋 Filing Details:\n';
  output += '┌─────────────────┬──────────┬──────────┬────────────────┬─────────────────────┐\n';
  output += '│ Accession       │ Ticker   │ Form     │ Status         │ Notes               │\n';
  output += '├─────────────────┼──────────┼──────────┼────────────────┼─────────────────────┤\n';

  filings.forEach(filing => {
    const statusIcon = filing.status === 'COMPLETE' ? '✅' : filing.status === 'PENDING' ? '⏳' : '❌';
    const notes = filing.status === 'FAILED' && filing.fetchError ? filing.fetchError.substring(0, 18) : '';
    
    output += `│ ${filing.accessionNumber.padEnd(15)} │ ${filing.ticker.padEnd(8)} │ ${filing.formType.padEnd(8)} │ ${statusIcon} ${filing.status.padEnd(11)} │ ${notes.padEnd(19)} │\n`;
  });

  output += '└─────────────────┴──────────┴──────────┴────────────────┴─────────────────────┘\n';
  return output;
}

// Export for use by other modules
export {
  runVerification,
  runRemediation,
  attemptRemediation,
  displayReport,
  saveVerificationResults,
  getYesterdayRange,
  verifyFiling,
  type FilingVerification,
  type VerificationReport
};
