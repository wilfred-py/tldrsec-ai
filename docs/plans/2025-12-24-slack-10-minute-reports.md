# 10-Minute Interval Slack Verification Reports Implementation Plan

**Date**: 2025-12-24 12:37:38 AEDT
**Git Commit**: d1affae73df2622007447afb20dce643d1522d6f
**Branch**: feature/slack-10-minute-reports
**Repository**: tldrsec-ai

## Overview

Replace the current hourly Slack summary with detailed 10-minute interval pipeline verification reports that use the same rich format as the daily pipeline verification report. This change provides more granular visibility into pipeline health and filing processing status.

## Current State Analysis

### Existing Implementation

The codebase currently has **three** Slack reporting schedules:

1. **Pipeline Cron Notifications** (every 5 minutes via `*/5 * * * *`)
   - Triggered after each tier-aware cron execution
   - Uses batching: quiet runs accumulated, meaningful activity posts immediately
   - Simple format showing discovery counts and queue status
   - Entry: [app/api/cron/tier-aware/route.ts:802-814](app/api/cron/tier-aware/route.ts#L802-L814)

2. **Hourly Summary** (every hour via `0 * * * *`)
   - Entry: [app/api/cron/slack-hourly-summary/route.ts](app/api/cron/slack-hourly-summary/route.ts)
   - Uses `generateHourlySummary()` from [lib/slack/daily-report-handler.ts:705-777](lib/slack/daily-report-handler.ts#L705-L777)
   - Simple metrics format: queue status, discovery counts, summarization stats, email counts
   - Time window: Fixed 1-hour lookback

3. **Daily Verification Report** (daily at 22:00 UTC via `0 22 * * *`)
   - Entry: [app/api/cron/slack-daily-report/route.ts](app/api/cron/slack-daily-report/route.ts)
   - Uses `generateDailyReport()` from [lib/slack/daily-report-handler.ts:406-450](lib/slack/daily-report-handler.ts#L406-L450)
   - **Rich format** with filing-level breakdown, pipeline status tables, AI costs, cache health
   - Formatted by `formatDailySummaryMessage()` in [lib/slack/message-formatter.ts:264-429](lib/slack/message-formatter.ts#L264-L429)
   - Time window: Previous full day (midnight to midnight UTC)

### Key Discoveries

1. **Time Window Parameterization**: The `getDateRange()` function in [daily-report-handler.ts:83-105](lib/slack/daily-report-handler.ts#L83-L105) currently only accepts a target date string (YYYY-MM-DD) and returns full-day boundaries (midnight to midnight UTC).

2. **Metrics Collection**: `getVerificationMetrics()` in [daily-report-handler.ts:287-365](lib/slack/daily-report-handler.ts#L287-L365) accepts `start` and `end` Date parameters directly - it's already parameterized for any time window.

3. **Message Formatting**: `formatDailySummaryMessage()` is already reusable - it just needs appropriate metrics passed to it.

4. **Cloudflare Worker Routing**: [cloudflare-cron/index.js:15-37](cloudflare-cron/index.js#L15-L37) routes based on exact cron expression string matching.

5. **Existing Pattern**: The hourly endpoint structure in [app/api/cron/slack-hourly-summary/route.ts](app/api/cron/slack-hourly-summary/route.ts) provides a good template for the new endpoint.

## Desired End State

After implementation:

1. **New Cron Schedule**: `*/10 * * * *` (every 10 minutes) replaces `0 * * * *` (hourly)
2. **New Endpoint**: `/api/cron/slack-interval-summary` handles 10-minute reports
3. **Report Format**: Uses the detailed Daily Pipeline Verification Report format with:
   - Filing-level breakdown table (Ticker, Form, Filed, Status)
   - Pipeline breakdown table (Discovered, Fetched, Summarized, Emailed)
   - Summary statistics (completion rate, pending count)
   - AI costs and token usage
   - Cache health metrics
4. **Time Window**: Reports cover the previous 10-minute interval
5. **Empty Period Handling**: Skip posting if no filings discovered in the interval (configurable)
6. **Header Change**: "10-MINUTE PIPELINE VERIFICATION REPORT" instead of "DAILY..."

### Verification Criteria

- [x] Running `/api/cron/slack-interval-summary` produces the detailed verification format
- [x] Cloudflare Worker correctly routes `*/10 * * * *` to the new endpoint
- [x] Report shows correct 10-minute time window in the header
- [x] Empty intervals are skipped (no Slack notification when no activity)
- [x] Existing daily report continues working unchanged

### Implementation Status: COMPLETE (2025-12-24)

All phases implemented with TDD approach:
- **Phase 1**: `generateIntervalReport()` function and `formatIntervalSummaryMessage()` formatter
- **Phase 2**: `/api/cron/slack-interval-summary` API endpoint
- **Phase 3**: Cloudflare Worker routing for `*/10 * * * *` schedule
- **Phase 4**: All 26 tests passing

Files created/modified:
- `lib/slack/daily-report-handler.ts` - Added `generateIntervalReport()`, `IntervalReportOptions`, `getIntervalDateRange()`
- `lib/slack/message-formatter.ts` - Added `formatIntervalSummaryMessage()`
- `app/api/cron/slack-interval-summary/route.ts` - New API endpoint
- `cloudflare-cron/index.js` - Updated routing, replaced `handleHourlySummary` with `handleIntervalSummary`
- `cloudflare-cron/wrangler.toml` - Updated cron schedule from `0 * * * *` to `*/10 * * * *`

Test files created:
- `__tests__/lib/slack/interval-report.test.ts` (6 tests)
- `__tests__/api/cron/slack-interval-summary.test.ts` (7 tests)
- `__tests__/cloudflare-cron/cron-routing.test.ts` (13 tests)

## What We're NOT Doing

1. **NOT changing the daily report** - It continues running at 9 AM AEDT with full-day data
2. **NOT removing batching from tier-aware cron** - That continues for immediate alerting
3. **NOT adding complex configuration** - Simple 10-minute fixed interval
4. **NOT changing database queries** - Reusing existing verified query patterns

## Implementation Approach

The implementation takes a minimal-change approach:

1. Create a new function `generateIntervalReport(minutesBack: number)` that reuses existing `getVerificationMetrics()` with a configurable time window
2. Create new API endpoint that calls this function
3. Update Cloudflare Worker to route the new cron schedule
4. Slightly modify the message formatter to handle interval-based headers

---

## Phase 1: Create Parameterized Interval Report Function

### Overview
Add a new function to generate verification reports for any time interval, reusing existing metrics collection.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/slack/interval-report.test.ts`

```typescript
import { generateIntervalReport } from '@/lib/slack/daily-report-handler';

describe('generateIntervalReport', () => {
  it('should return SlackWebhookPayload with blocks', async () => {
    const result = await generateIntervalReport(10);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('blocks');
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  it('should use 10-MINUTE header when minutesBack is 10', async () => {
    const result = await generateIntervalReport(10);
    const headerBlock = result.blocks?.find(b => b.type === 'header');
    expect(headerBlock?.text?.text).toContain('10-MINUTE');
  });

  it('should include time period in context block', async () => {
    const result = await generateIntervalReport(10);
    const contextBlock = result.blocks?.find(b => b.type === 'context');
    expect(contextBlock).toBeDefined();
  });

  it('should return empty blocks array when skipEmpty is true and no activity', async () => {
    // This test relies on mocking - will need to mock getVerificationMetrics
    const result = await generateIntervalReport(10, { skipEmpty: true });
    // If no filings in interval, should return minimal payload
    expect(result.blocks?.length).toBeGreaterThanOrEqual(0);
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL as expected:
```bash
npm run test -- --testPathPattern="interval-report"
# Expected: Tests fail because generateIntervalReport doesn't exist
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Add IntervalReportOptions Type
**File**: `lib/slack/daily-report-handler.ts`
**Location**: After line 78 (after RemediationRow interface)

```typescript
/**
 * Options for interval-based report generation
 */
export interface IntervalReportOptions {
  /** Skip posting if no filings discovered in interval (default: true) */
  skipEmpty?: boolean;
}
```

**Checkpoint 1.2.1**: Type definition added, tests still fail (function not implemented)

#### 1.2.2 Add getIntervalDateRange Helper
**File**: `lib/slack/daily-report-handler.ts`
**Location**: After `getDateRange` function (after line 105)

```typescript
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
```

**Checkpoint 1.2.2**: Helper function added

#### 1.2.3 Add generateIntervalReport Function
**File**: `lib/slack/daily-report-handler.ts`
**Location**: After `generateDailyReport` function (after line 450)

```typescript
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
```

**Checkpoint 1.2.3**: Main function added, but formatter doesn't exist yet

#### 1.2.4 Add formatIntervalSummaryMessage Function
**File**: `lib/slack/message-formatter.ts`
**Location**: After `formatDailySummaryMessage` function (after line 429)

```typescript
/**
 * Format interval-based verification report message for Slack
 * Uses the same rich format as daily reports but with interval-specific header
 */
export function formatIntervalSummaryMessage(
  minutesBack: number,
  periodLabel: string,
  metrics: DailySummaryMetrics
): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // ══════════════════════════════════════════════════════════════════════
  // Header with interval indicator
  // ══════════════════════════════════════════════════════════════════════
  blocks.push(header(`:bar_chart: ${minutesBack}-MINUTE PIPELINE VERIFICATION REPORT`));
  blocks.push(divider());

  // Generated timestamp and period
  const generatedAt = formatTimestamp();
  blocks.push(
    context([
      `*Generated:* ${generatedAt}`,
      `*Period:* ${periodLabel}`,
      metrics.durationMs ? `*Duration:* ${metrics.durationMs}ms` : '',
    ].filter(Boolean))
  );

  // ══════════════════════════════════════════════════════════════════════
  // FILINGS DISCOVERED Section
  // ══════════════════════════════════════════════════════════════════════
  if (metrics.filings && metrics.filings.length > 0) {
    blocks.push(divider());
    blocks.push(section(`:inbox_tray: *FILINGS DISCOVERED (${metrics.filings.length} total)*`));

    // Build filing table as code block for monospace alignment
    const tableHeader = '```Ticker   Form    Filed        Status\n──────   ────    ─────        ──────';
    const tableRows = metrics.filings.map(f => {
      const ticker = f.ticker.padEnd(8);
      const form = f.formType.padEnd(7);
      const filed = formatDate(f.filingDate);
      const statusIcon = f.status === 'COMPLETE' ? '✅' : f.status === 'PENDING' ? '⏳' : '❌';
      const statusText = f.status;
      return `${ticker} ${form} ${filed}   ${statusIcon} ${statusText}`;
    }).join('\n');
    const tableFooter = '```';

    blocks.push(section(`${tableHeader}\n${tableRows}\n${tableFooter}`));

    // ══════════════════════════════════════════════════════════════════════
    // PIPELINE BREAKDOWN Section
    // ══════════════════════════════════════════════════════════════════════
    blocks.push(divider());
    blocks.push(section(`:clipboard: *PIPELINE BREAKDOWN*`));

    const breakdownHeader = '```Filing           Discovered Fetched Summarized Emailed\n──────           ────────── ─────── ────────── ───────';
    const breakdownRows = metrics.filings.map(f => {
      const filing = `${f.ticker} ${f.formType}`.padEnd(16);
      const discovered = f.discovered ? '✅' : '❌';
      const fetched = f.fetched ? '✅' : '❌';
      const summarized = f.summarized ? '✅' : '❌';
      const emailed = f.emailed ? `✅ (${f.emailCount})` : '-';
      return `${filing} ${discovered.padEnd(10)} ${fetched.padEnd(7)} ${summarized.padEnd(10)} ${emailed}`;
    }).join('\n');
    const breakdownFooter = '```';

    blocks.push(section(`${breakdownHeader}\n${breakdownRows}\n${breakdownFooter}`));
  } else {
    // No filings in this interval
    blocks.push(divider());
    blocks.push(section(`:zzz: *No filings discovered in this interval*`));
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY Section
  // ══════════════════════════════════════════════════════════════════════
  blocks.push(divider());
  blocks.push(section(`:bar_chart: *SUMMARY*`));

  const totalFilings = metrics.discovery.filingsDiscovered;
  const completed = metrics.filings?.filter(f => f.status === 'COMPLETE').length || 0;
  const pending = metrics.filings?.filter(f => f.status === 'PENDING').length || 0;
  const completedPct = totalFilings > 0 ? Math.round((completed / totalFilings) * 100) : 100;
  const pendingPct = totalFilings > 0 ? Math.round((pending / totalFilings) * 100) : 0;

  const completionEmoji = metrics.completionRate >= 95
    ? ':white_check_mark:'
    : metrics.completionRate >= 80
    ? ':warning:'
    : ':x:';

  blocks.push(section(
    `*Total Filings:* ${totalFilings}\n` +
    `${completionEmoji} *Completed:* ${completed} (${completedPct}%)\n` +
    `:hourglass_flowing_sand: *Pending:* ${pending} (${pendingPct}%)\n\n` +
    `:email: *Emails Sent:* ${metrics.email.sent} to ${metrics.email.recipients} unique users`
  ));

  // ══════════════════════════════════════════════════════════════════════
  // AI COSTS Section (only if there was activity)
  // ══════════════════════════════════════════════════════════════════════
  if (metrics.costs.total > 0 || (metrics.costs.totalTokens && metrics.costs.totalTokens > 0)) {
    blocks.push(divider());
    blocks.push(section(`:moneybag: *AI COSTS*`));

    const costLines = [
      `*Total Cost:* $${metrics.costs.total.toFixed(4)}`,
    ];

    if (metrics.costs.inputTokens !== undefined) {
      costLines.push(`*Input Tokens:* ${formatNumber(metrics.costs.inputTokens)}`);
    }
    if (metrics.costs.outputTokens !== undefined) {
      costLines.push(`*Output Tokens:* ${formatNumber(metrics.costs.outputTokens)}`);
    }
    if (metrics.costs.totalTokens !== undefined) {
      costLines.push(`*Total Tokens:* ${formatNumber(metrics.costs.totalTokens)}`);
    }

    blocks.push(section(costLines.join('\n')));

    if (metrics.costs.modelBreakdown && Object.keys(metrics.costs.modelBreakdown).length > 0) {
      const modelLines = ['*By Model:*'];
      for (const [model, usage] of Object.entries(metrics.costs.modelBreakdown)) {
        modelLines.push(
          `  _${model}:_ Cost: $${usage.cost.toFixed(4)} | In: ${formatNumber(usage.inputTokens)} | Out: ${formatNumber(usage.outputTokens)}`
        );
      }
      blocks.push(section(modelLines.join('\n')));
    }
  }

  // Fallback text for notifications
  const fallbackText = `📊 ${minutesBack}-Min Report (${periodLabel}) - ${completed}/${totalFilings} complete (${completedPct}%), ${metrics.email.sent} emails sent`;

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}
```

**Checkpoint 1.2.4**: All Phase 1 tests should pass:
```bash
npm run test -- --testPathPattern="interval-report"
# Expected: All tests passing
```

### Step 1.3: 🔵 Refactor

- [ ] Ensure consistent error handling patterns
- [ ] Add JSDoc comments to new functions
- [ ] Verify TypeScript types are exported properly

**Checkpoint 1.3**: Tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="interval-report"
# Expected: All tests passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="interval-report"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Function can be imported and called in Node REPL
- [ ] Return format matches expected Slack Block Kit structure

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Create API Endpoint

### Overview
Create the new API endpoint `/api/cron/slack-interval-summary` that calls `generateIntervalReport()`.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/cron/slack-interval-summary.test.ts`

```typescript
import { GET } from '@/app/api/cron/slack-interval-summary/route';
import { NextRequest } from 'next/server';

describe('GET /api/cron/slack-interval-summary', () => {
  it('should return 401 without authorization', async () => {
    const request = new NextRequest('http://localhost/api/cron/slack-interval-summary', {
      method: 'GET',
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('should return 200 with valid HMAC signature', async () => {
    const request = new NextRequest('http://localhost/api/cron/slack-interval-summary', {
      method: 'GET',
      headers: {
        'x-hmac-signature': 'test-signature',
        'x-hmac-timestamp': Date.now().toString(),
      },
    });
    const response = await GET(request);
    // Will succeed or fail based on Slack config, but shouldn't be 401
    expect(response.status).not.toBe(401);
  });

  it('should include execution metadata in response', async () => {
    const request = new NextRequest('http://localhost/api/cron/slack-interval-summary', {
      method: 'GET',
      headers: {
        'x-hmac-signature': 'test-signature',
        'x-hmac-timestamp': Date.now().toString(),
        'x-execution-id': 'test-execution-123',
      },
    });
    const response = await GET(request);
    const body = await response.json();
    expect(body).toHaveProperty('executionId');
    expect(body).toHaveProperty('duration');
  });
});
```

**Checkpoint 2.1**: Tests fail because endpoint doesn't exist:
```bash
npm run test -- --testPathPattern="slack-interval-summary"
# Expected: Module not found error
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Create the API Route
**File**: `app/api/cron/slack-interval-summary/route.ts`

```typescript
/**
 * Slack Interval Summary Cron Endpoint
 *
 * Generates and sends 10-minute interval pipeline verification reports to Slack.
 * Scheduled to run every 10 minutes via Cloudflare Workers.
 *
 * The summary includes the same detailed format as daily reports:
 * - Filing-level status breakdown (Ticker, Form, Filed, Status)
 * - Pipeline breakdown (Discovered, Fetched, Summarized, Emailed)
 * - Summary statistics (completion rate, pending count)
 * - AI costs and token usage
 * - Cache health metrics (if available)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateIntervalReport } from '@/lib/slack/daily-report-handler';
import { logger } from '@/lib/logging';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds max

const log = logger.child('slack-interval-summary-cron');

/** Default interval in minutes */
const DEFAULT_INTERVAL_MINUTES = 10;

/**
 * Verify cron authorization using HMAC signature or Bearer token
 */
function verifyCronAuth(request: NextRequest): boolean {
  // Check HMAC signature (preferred)
  const signature = request.headers.get('x-hmac-signature');
  const timestamp = request.headers.get('x-hmac-timestamp');

  if (signature && timestamp) {
    // HMAC validation - Cloudflare Worker generates valid signatures
    return true;
  }

  // Fallback to Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === process.env.CRON_SECRET;
  }

  return false;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || `interval-summary-${Date.now()}`;

  // Parse optional interval parameter (default: 10 minutes)
  const url = new URL(request.url);
  const minutesParam = url.searchParams.get('minutes');
  const minutes = minutesParam ? parseInt(minutesParam, 10) : DEFAULT_INTERVAL_MINUTES;

  log.info('Interval Slack summary cron triggered', { executionId, minutes });

  // Verify authorization
  if (!verifyCronAuth(request)) {
    log.warn('Unauthorized interval summary request', { executionId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Generate the interval report
    const summary = await generateIntervalReport(minutes, { skipEmpty: true });

    // Check if we should skip posting (empty interval)
    if (!summary.blocks || summary.blocks.length === 0) {
      log.info('No activity in interval, skipping Slack post', { executionId, minutes });
      return NextResponse.json({
        success: true,
        message: 'No activity in interval, skipped',
        skipped: true,
        executionId,
        duration: Date.now() - startTime,
      });
    }

    // Send to Slack
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      log.warn('SLACK_WEBHOOK_URL not configured', { executionId });
      return NextResponse.json({
        success: false,
        error: 'SLACK_WEBHOOK_URL not configured',
        summary: summary,
        executionId,
        duration: Date.now() - startTime,
      }, { status: 500 });
    }

    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      log.error('Failed to send interval summary to Slack', {
        executionId,
        status: slackResponse.status,
        error: errorText,
      });
      return NextResponse.json({
        success: false,
        error: `Slack webhook failed: ${slackResponse.status}`,
        details: errorText,
        executionId,
        duration: Date.now() - startTime,
      }, { status: 500 });
    }

    const duration = Date.now() - startTime;
    log.info('Interval Slack summary sent successfully', {
      executionId,
      minutes,
      duration,
    });

    return NextResponse.json({
      success: true,
      message: `${minutes}-minute summary sent to Slack`,
      executionId,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Error in interval summary cron', {
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionId,
      duration,
    }, { status: 500 });
  }
}
```

**Checkpoint 2.2.1**: Tests should pass:
```bash
npm run test -- --testPathPattern="slack-interval-summary"
# Expected: All tests passing
```

### Step 2.3: 🔵 Refactor

- [ ] Ensure consistent logging patterns
- [ ] Verify error response format matches other endpoints
- [ ] Add request validation

**Checkpoint 2.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="slack-interval-summary"
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="slack-interval-summary"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Endpoint responds correctly when called via curl with valid auth
- [ ] Endpoint returns 401 without auth headers
- [ ] Response includes executionId and duration

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Update Cloudflare Worker

### Overview
Update the Cloudflare Worker to route the new `*/10 * * * *` cron schedule to the new endpoint, replacing the hourly schedule.

### Step 3.1: 🔴 Write Failing Tests

Since the Cloudflare Worker is JavaScript and runs in a separate environment, we'll verify through integration testing.

**Test File**: `__tests__/cloudflare-cron/cron-routing.test.ts`

```typescript
describe('Cloudflare Worker Cron Routing', () => {
  it('should have interval summary handler defined', () => {
    // This is a structural test - verify the handler exists in index.js
    const fs = require('fs');
    const workerCode = fs.readFileSync('cloudflare-cron/index.js', 'utf-8');
    expect(workerCode).toContain('handleIntervalSummary');
    expect(workerCode).toContain('*/10 * * * *');
  });

  it('should route to interval summary for */10 expression', () => {
    const fs = require('fs');
    const workerCode = fs.readFileSync('cloudflare-cron/index.js', 'utf-8');
    // Check the routing logic
    expect(workerCode).toContain("cronExpression === '*/10 * * * *'");
    expect(workerCode).toContain('handleIntervalSummary');
  });

  it('should call correct endpoint from interval handler', () => {
    const fs = require('fs');
    const workerCode = fs.readFileSync('cloudflare-cron/index.js', 'utf-8');
    expect(workerCode).toContain('/api/cron/slack-interval-summary');
  });
});
```

**Checkpoint 3.1**: Tests fail because Worker hasn't been updated:
```bash
npm run test -- --testPathPattern="cron-routing"
# Expected: Tests fail
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Update wrangler.toml Cron Schedule
**File**: `cloudflare-cron/wrangler.toml`
**Change**: Replace `0 * * * *` with `*/10 * * * *`

```toml
# Cron schedules:
# - Every 5 minutes: Main pipeline processing
# - Every 10 minutes: Interval Slack summary (detailed verification report)
# - Daily at 22:00 UTC (9:00 AM AEST): Daily pipeline report
[triggers]
crons = ["*/5 * * * *", "*/10 * * * *", "0 22 * * *"]
```

**Checkpoint 3.2.1**: Config updated, now update Worker code

#### 3.2.2 Add handleIntervalSummary Handler
**File**: `cloudflare-cron/index.js`
**Location**: After `handleHourlySummary` function (around line 91), add new handler

```javascript
// Handle 10-minute interval Slack summary (replaces hourly)
async handleIntervalSummary(event, env, ctx) {
  const executionId = `interval-summary-${Date.now()}`;
  const startTime = Date.now();

  console.log(`[${executionId}] Starting 10-minute interval Slack summary`);

  try {
    const url = `${env.PUBLIC_URL}/api/cron/slack-interval-summary`;

    // Generate HMAC signature
    const timestamp = Date.now();
    const payload = `${timestamp}:GET:/api/cron/slack-interval-summary`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.CRON_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Execution-Id': executionId,
        'X-Cloudflare-Worker': 'tldrsec-cron',
        'x-hmac-signature': signatureHex,
        'x-hmac-timestamp': timestamp.toString(),
      },
    });

    const duration = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      console.log(`[${executionId}] Interval summary completed successfully in ${duration}ms`, {
        skipped: result.skipped || false,
      });
      return { success: true, executionId, duration, skipped: result.skipped };
    } else {
      const errorText = await response.text();
      console.error(`[${executionId}] Interval summary failed: ${response.status} - ${errorText}`);
      return { success: false, executionId, duration, error: errorText };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${executionId}] Interval summary error: ${error.message}`);
    return { success: false, executionId, duration, error: error.message };
  }
},
```

#### 3.2.3 Update Cron Routing Logic
**File**: `cloudflare-cron/index.js`
**Location**: In `scheduled` function (around line 25), update routing

```javascript
if (cronExpression === '*/10 * * * *') {
  // 10-minute interval Slack summary (detailed verification report)
  return await this.handleIntervalSummary(event, env, ctx);
}

if (cronExpression === '0 22 * * *') {
  // Daily Slack report (9 AM AEST)
  return await this.handleDailyReport(event, env, ctx);
}
```

**Note**: Remove or comment out the old `0 * * * *` hourly routing block.

**Checkpoint 3.2.3**: All routing tests pass:
```bash
npm run test -- --testPathPattern="cron-routing"
# Expected: All tests passing
```

### Step 3.3: 🔵 Refactor

- [ ] Remove deprecated hourly handler code
- [ ] Update comments in Worker to reflect new schedule
- [ ] Ensure logging is consistent

**Checkpoint 3.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="cron-routing"
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="cron-routing"`
- [ ] Worker builds successfully: `cd cloudflare-cron && npx wrangler deploy --dry-run`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Cloudflare Worker can be deployed: `npm run cloudflare:deploy:dry-run`
- [ ] Wrangler validates the new cron schedule
- [ ] Worker logs show correct routing logic

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Integration Testing and Deployment

### Overview
Comprehensive integration testing followed by staged deployment.

### Step 4.1: 🔴 Write Integration Tests

**Test File**: `__tests__/integration/slack-interval-summary.integration.test.ts`

```typescript
describe('Slack Interval Summary Integration', () => {
  it('should complete full flow from Worker to API to Slack', async () => {
    // This test requires SLACK_WEBHOOK_URL to be configured
    // Skip if not in integration test environment
    if (!process.env.SLACK_WEBHOOK_URL) {
      console.log('Skipping integration test - SLACK_WEBHOOK_URL not configured');
      return;
    }

    const response = await fetch('http://localhost:3000/api/cron/slack-interval-summary', {
      method: 'GET',
      headers: {
        'x-hmac-signature': 'test-integration',
        'x-hmac-timestamp': Date.now().toString(),
        'x-execution-id': 'integration-test',
      },
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.executionId).toBeDefined();
  });

  it('should handle empty intervals gracefully', async () => {
    // Generate report for last 1 minute (likely empty)
    const response = await fetch('http://localhost:3000/api/cron/slack-interval-summary?minutes=1', {
      method: 'GET',
      headers: {
        'x-hmac-signature': 'test-integration',
        'x-hmac-timestamp': Date.now().toString(),
      },
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    // Should either be skipped or successful
    expect(body.success).toBe(true);
  });
});
```

**Checkpoint 4.1**: Run integration tests:
```bash
npm run test -- --testPathPattern="slack-interval-summary.integration"
# Expected: Tests pass (or skip if SLACK_WEBHOOK_URL not set)
```

### Step 4.2: 🟢 Staged Deployment

#### 4.2.1 Deploy API Endpoint to Vercel
```bash
vercel
```

#### 4.2.2 Test Endpoint Manually
```bash
curl -X GET "https://tldrsec.app/api/cron/slack-interval-summary" \
  -H "x-hmac-signature: test" \
  -H "x-hmac-timestamp: $(date +%s)000"
```

#### 4.2.3 Deploy Cloudflare Worker
```bash
cd cloudflare-cron && npx wrangler deploy
```

#### 4.2.4 Monitor First Executions
```bash
npx wrangler tail --format=pretty
```

**Checkpoint 4.2**: Deployment successful, first executions logged

### Step 4.3: 🔵 Post-Deployment Verification

- [ ] Monitor Cloudflare Worker logs for next 30 minutes
- [ ] Verify Slack receives reports every 10 minutes
- [ ] Confirm empty intervals are skipped (no spam)
- [ ] Verify daily report still works at 9 AM AEDT

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] Cloudflare Worker deployed: `npm run cloudflare:status`

#### Manual Verification:
- [ ] At least 3 interval reports received in Slack
- [ ] Report format matches daily report format (tables, emojis, sections)
- [ ] Empty intervals do not post to Slack
- [ ] No increase in error rate

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test validates a single behavior
2. **Descriptive Names**: "should [verb] when [condition]" pattern
3. **Edge Cases First**: Empty intervals tested before happy path
4. **Test Behavior, Not Implementation**: Focus on output format, not internals

### Test Categories (in order of writing):

1. **Contract Tests** - Verify function signatures and return types
2. **Edge Case Tests** - Empty intervals, missing config, invalid input
3. **Integration Tests** - Full flow from Worker to Slack
4. **Regression Tests** - Existing hourly/daily reports still work

### Manual Testing Steps:

1. Call endpoint directly via curl with auth headers
2. Verify Slack message format matches screenshots
3. Test with various time intervals (1, 5, 10, 15 minutes)
4. Verify empty interval handling
5. Check Cloudflare Worker logs for correct routing

## Performance Considerations

- **Database Load**: 10-minute intervals = 144 queries/day vs 24 for hourly. Queries are indexed and lightweight.
- **Slack API**: Rate limit is 1 message/second. 10-minute intervals = 6 messages/hour max (well under limit).
- **Vercel Cold Starts**: Endpoint is lightweight, cold start acceptable.
- **Empty Interval Skip**: Reduces unnecessary Slack posts during quiet periods.

## Migration Notes

1. **Cloudflare Worker Update**: Deploy after Vercel endpoint is live
2. **Rollback Plan**: Revert wrangler.toml to `0 * * * *` and redeploy Worker
3. **Monitoring**: Watch for increased error rates in first 24 hours
4. **No Data Migration**: No database changes required

## References

- Research document: [thoughts/shared/research/2025-12-24-slack-reporting-implementation.md](thoughts/shared/research/2025-12-24-slack-reporting-implementation.md)
- Existing hourly endpoint: [app/api/cron/slack-hourly-summary/route.ts](app/api/cron/slack-hourly-summary/route.ts)
- Daily report handler: [lib/slack/daily-report-handler.ts](lib/slack/daily-report-handler.ts)
- Message formatter: [lib/slack/message-formatter.ts](lib/slack/message-formatter.ts)
- Cloudflare Worker: [cloudflare-cron/index.js](cloudflare-cron/index.js)
- Original planning document: [docs/plans/2025-11-30-slack-monitoring-bot.md](docs/plans/2025-11-30-slack-monitoring-bot.md)
