# Daily Pipeline Verification Implementation Plan

**Date**: 2025-11-29T20:27:18+11:00
**Git Commit**: fabb9c35d894aca537c532e025431bf649b42c81
**Branch**: feature/validation-dry-run-testing
**Repository**: tldrsec-ai

## Overview

Implement an automated daily pipeline verification system that:
1. Queries all SEC filings discovered in the previous day (midnight to midnight)
2. Verifies each filing completed the full pipeline (Discovery → Fetch → Summarize → Email)
3. Attempts auto-remediation for failed filings with retry logic
4. Persists verification results to a new Supabase table for historical tracking
5. Generates a detailed console report with actionable insights

This addresses the gap identified in `thoughts/shared/research/2025-11-29-production-pipeline-validation-confidence.md`:
> "Consider adding: Automated daily report email summarizing pipeline health metrics"

## Current State Analysis

### Existing Infrastructure
- **RssFilingCheck** table tracks discovered filings with `processed` flag and `createdAt` timestamp
- **SecFetchAttempt** table tracks fetch success/failure per filing
- **Summary** table stores AI summaries linked via `secFilingId`
- **SummaryEmailDelivery** table tracks emails sent per user/summary with deduplication
- **Existing scripts** (`check-pending-jobs.ts`, `analyze-database-state.ts`) provide patterns for database queries and reporting

### Key Patterns Identified
- Time-range queries: `createdAt: { gte: startOfDay, lt: endOfDay }`
- Accession number lookup: Join via `SecFiling.accessionNumber` or URL pattern matching
- Email correlation: `SummaryEmailDelivery.summaryId` → `Summary.id`
- Retry logic: Existing `JobQueue` table with `retryCount` and `maxRetries` fields

### Missing Capabilities
- No single script that traces a filing through all 4 pipeline phases
- No historical record of daily verification results
- No auto-remediation for stuck/failed filings

## Desired End State

After implementation:
1. Run `npm run verify:daily` to generate a full pipeline verification report
2. Verification results stored in `DailyPipelineVerification` table for trend analysis
3. Failed filings automatically re-queued with configurable retry limits
4. Clear actionable output for any filings requiring manual intervention

### Verification Criteria
- Script executes in <30 seconds for typical day (0-20 filings)
- All 4 pipeline phases verified per filing
- Auto-remediation succeeds for transient failures
- Historical data queryable via Prisma

## What We're NOT Doing

- Real-time monitoring (existing `monitor:pipeline` handles this)
- Email report generation (future enhancement)
- Slack/Discord notifications (future enhancement)
- Synthetic test filings (out of scope)
- Modifying existing cron job behavior

## Implementation Approach

**Strategy**: Build a standalone script following existing patterns from `analyze-database-state.ts` and `check-pending-jobs.ts`, with new database schema for persistence.

**Phases**:
1. Database schema for verification results
2. Core verification logic (4 phases)
3. Auto-remediation with retry
4. Console reporting
5. npm script integration

---

## Phase 1: Database Schema

### Overview
Create a new Prisma model to store daily verification results, enabling historical trend analysis.

### Changes Required:

#### 1. Prisma Schema
**File**: `prisma/schema.prisma`
**Changes**: Add new model after `CronJobDailySummary`

```prisma
model DailyPipelineVerification {
  id                    String   @id @default(uuid())
  verificationDate      DateTime @db.Date
  runAt                 DateTime @default(now())

  // Filing counts
  filingsDiscovered     Int      @default(0)
  filingsCompleted      Int      @default(0)
  filingsPending        Int      @default(0)
  filingsFailed         Int      @default(0)

  // Phase breakdown
  fetchSuccessCount     Int      @default(0)
  fetchFailedCount      Int      @default(0)
  summarizeSuccessCount Int      @default(0)
  summarizeFailedCount  Int      @default(0)
  emailsSentCount       Int      @default(0)
  uniqueUsersNotified   Int      @default(0)

  // OpenRouter API costs (aggregated from summaries generated this day)
  aiTotalCostUsd        Float    @default(0)
  aiInputTokens         Int      @default(0)
  aiOutputTokens        Int      @default(0)
  aiTotalTokens         Int      @default(0)
  aiModelBreakdown      Json?    // { "model-name": { cost, inputTokens, outputTokens } }

  // Remediation stats
  remediationAttempted  Int      @default(0)
  remediationSucceeded  Int      @default(0)
  remediationFailed     Int      @default(0)

  // Detailed results (JSON array of filing verification results)
  filingDetails         Json?

  // Execution metadata
  durationMs            Int?
  errors                String[]

  @@unique([verificationDate])
  @@index([verificationDate])
  @@index([runAt])
}
```

### Success Criteria:

#### Automated Verification:
- [x] Migration applies cleanly: `npm run db:push` (used db:push due to migration drift)
- [x] Prisma client generates: `npm run db:generate`
- [x] TypeScript compiles: `npm run build`

#### Manual Verification:
- [ ] Table visible in Prisma Studio: `npm run db:studio`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Core Verification Logic

### Overview
Create the main verification script with 4-phase pipeline checking.

### Changes Required:

#### 1. Verification Script
**File**: `scripts/verify-daily-pipeline.ts`
**Changes**: New file

```typescript
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
async function checkFetchStatus(accessionNumber: string): Promise<{
  fetched: boolean;
  error?: string;
}> {
  // First find the SecFiling record
  const secFiling = await prisma.secFiling.findFirst({
    where: {
      accessionNumber: accessionNumber,
    },
    include: {
      fetchAttempts: {
        orderBy: {
          attemptedAt: 'desc',
        },
        take: 1,
      },
    },
  });

  if (!secFiling) {
    return { fetched: false, error: 'SecFiling record not found' };
  }

  if (secFiling.fetchAttempts.length === 0) {
    return { fetched: false, error: 'No fetch attempts recorded' };
  }

  const latestAttempt = secFiling.fetchAttempts[0];
  if (latestAttempt.status === 'success') {
    return { fetched: true };
  }

  return {
    fetched: false,
    error: latestAttempt.errorMessage || `Fetch status: ${latestAttempt.status}`
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
    durationMs,
    errors,
  };
}

// Export for use by other modules
export {
  runVerification,
  getYesterdayRange,
  verifyFiling,
  type FilingVerification,
  type VerificationReport
};
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `npm run build`
- [x] Script runs without errors: `npx tsx scripts/verify-daily-pipeline.ts`

#### Manual Verification:
- [ ] Verification results match expected state for yesterday's filings

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Auto-Remediation

### Overview
Add retry logic for failed filings, attempting to re-queue them for processing.

### Changes Required:

#### 1. Remediation Logic
**File**: `scripts/verify-daily-pipeline.ts`
**Changes**: Add remediation functions after the verification functions

```typescript
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
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `npm run build`
- [ ] Remediation creates JobQueue entries (verify in Prisma Studio)

#### Manual Verification:
- [ ] Failed filing gets re-queued with correct job type
- [ ] Retry count increments correctly
- [ ] Max retries respected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Console Reporting & Database Persistence

### Overview
Add formatted console output and save results to the new database table.

### Changes Required:

#### 1. Report Display Function
**File**: `scripts/verify-daily-pipeline.ts`
**Changes**: Add display and persistence functions

```typescript
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

// Run
main().catch(console.error);
```

#### 2. Package.json Script
**File**: `package.json`
**Changes**: Add npm script in the scripts section

```json
{
  "scripts": {
    "verify:daily": "tsx scripts/verify-daily-pipeline.ts",
    "verify:daily:no-remediation": "tsx scripts/verify-daily-pipeline.ts --no-remediation"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] Script runs: `npm run verify:daily`
- [x] Results saved to database (check via Prisma Studio)
- [ ] Lint passes: `npm run lint` (pre-existing lint errors in other files)
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Console output is readable and formatted correctly
- [ ] Status icons display correctly (✅⏳❌)
- [ ] Database record created with correct data
- [ ] Re-running for same date updates existing record (upsert works)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Integration Testing

### Overview
Add integration test and update CLAUDE.md documentation.

### Changes Required:

#### 1. Update CLAUDE.md
**File**: `CLAUDE.md`
**Changes**: Add new command to Development Commands section

Add under "### Real Pipeline Testing":
```markdown
### Daily Verification
- `npm run verify:daily` - **NEW** Verify yesterday's filings completed full pipeline
- `npm run verify:daily -- --date=2025-11-28` - Verify specific date
- `npm run verify:daily:no-remediation` - Skip auto-remediation for dry-run
```

#### 2. Update Research Document
**File**: `thoughts/shared/research/2025-11-29-production-pipeline-validation-confidence.md`
**Changes**: Update the "Open Questions" section to mark this as implemented

Change:
```markdown
## Open Questions

1. **Consider adding**: Automated daily report email summarizing pipeline health metrics
```

To:
```markdown
## Open Questions (Resolved)

1. ✅ **IMPLEMENTED**: `npm run verify:daily` - Automated daily pipeline verification with database persistence
   - See `docs/plans/2025-11-29-daily-pipeline-verification.md` for implementation details
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run verify:daily` executes successfully
- [ ] `npm run verify:daily -- --date=2025-11-28` works with past dates
- [ ] Build still passes: `npm run build`

#### Manual Verification:
- [ ] Documentation updated and accurate
- [ ] Script is discoverable via `npm run` (shows in list)

---

## Testing Strategy

### Unit Tests:
- Date range calculation (`getYesterdayRange`)
- Status determination logic
- Report aggregation

### Integration Tests:
- Full verification flow with test database
- Remediation job creation
- Database persistence (upsert)

### Manual Testing Steps:
1. Run `npm run verify:daily` on a day with known filings
2. Verify all phases report correctly
3. Intentionally fail a filing and verify remediation triggers
4. Check Prisma Studio for saved results
5. Re-run and verify upsert updates existing record

## Performance Considerations

- Script should complete in <30 seconds for typical day (0-20 filings)
- Database queries use indexed fields (`createdAt`, `accessionNumber`)
- Filings processed sequentially to avoid rate limiting
- Remediation jobs queued with high priority (10) for fast processing

## Migration Notes

- New `DailyPipelineVerification` table requires migration
- No data migration needed (new table)
- Backwards compatible - doesn't modify existing tables

## References

- Original research: `thoughts/shared/research/2025-11-29-production-pipeline-validation-confidence.md`
- Existing patterns: `scripts/analyze-database-state.ts`, `scripts/check-pending-jobs.ts`
- Schema reference: `prisma/schema.prisma`
- Validation patterns: `lib/validation/filing-content-verifier.ts`
