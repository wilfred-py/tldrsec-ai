# Slack Pipeline Monitoring Bot Implementation Plan

**Date**: 2025-11-30 12:27:14 AEDT
**Git Commit**: df6aaa3fe8851742107b514a712d06c1fc61669f
**Branch**: main
**Repository**: tldrsec-ai

## Overview

Create a Slack bot for the TLDRSec workspace (`tldrsecworkspace.slack.com`) that:
1. Posts automated daily pipeline verification reports to `#pipeline-monitoring` at 8:30 AM AEST
2. Responds to natural language conversational queries about pipeline health
3. Posts weekly trend analysis on Monday mornings
4. Serves as a foundation for future test and monitoring integrations

## Current State Analysis

### Existing Infrastructure
- **DailyPipelineVerification table** (prisma/schema.prisma:775-816): Stores complete daily metrics including filing counts, phase breakdowns, AI costs, and remediation results
- **Monitoring API endpoints**: `/api/monitoring/pipeline-health`, `/api/monitoring/metrics`, `/api/monitoring/health-trends`
- **verify:daily script** (scripts/verify-daily-pipeline.ts): Generates comprehensive verification reports with all required metrics
- **Cloudflare Workers cron**: Currently triggers `/api/cron/tier-aware` every 10 minutes

### Key Discoveries
- `DailyPipelineVerification.filingDetails` (JSON field) contains complete per-filing status including phase-by-phase breakdown
- Existing `aggregateAiCosts()` function calculates costs with model breakdown
- Pipeline phases tracked: Discovery → Fetch → Summarize → Email
- Completion rate calculation already implemented in verify script

## Desired End State

A fully functional Slack bot that:
1. Automatically posts daily reports at 8:30 AM AEST to `#pipeline-monitoring`
2. Responds to conversational queries like:
   - "What was yesterday's completion rate?"
   - "Show me the last week's trends"
   - "Any failures in the last 24 hours?"
   - "What's the current pipeline status?"
3. Posts Monday morning weekly summaries with trend analysis
4. Uses `@vercel/slack-bolt` for robust Slack integration
5. Stores conversation context in PostgreSQL for multi-turn conversations

### Verification
- Bot appears in Slack workspace and responds to mentions
- Daily reports post automatically at 8:30 AM AEST
- Reports show phase-by-phase breakdown (Discovery, Fetch, Summarize, Email)
- Conversational queries return accurate data from `DailyPipelineVerification` table
- Weekly summaries include trend analysis and failure pattern detection

## What We're NOT Doing

- Socket Mode (using HTTP mode for serverless compatibility)
- Slash commands (conversational mentions only per requirements)
- DM support (channel-only initially)
- Real-time pipeline event streaming
- Alert escalation to Slack (future enhancement)
- Multi-workspace support (single workspace: tldrsecworkspace.slack.com)

## Implementation Approach

Use **@vercel/slack-bolt** adapter with Next.js App Router for:
- HTTP mode event handling (serverless-compatible)
- Built-in 3-second timeout handling via `waitUntil`
- Automatic request verification and token management

Use **Vercel Cron Jobs** for scheduled reports:
- Daily report at 8:30 AM AEST (22:30 UTC previous day)
- Weekly summary Monday 9:00 AM AEST (23:00 UTC Sunday)

---

## Phase 1: Slack App Setup & Basic Infrastructure

### Overview
Create the Slack app, configure OAuth, and set up the basic Next.js API routes with `@vercel/slack-bolt`.

### Changes Required:

#### 1. Install Dependencies
**File**: `package.json`
**Changes**: Add Slack dependencies

```json
{
  "dependencies": {
    "@vercel/slack-bolt": "^1.0.0",
    "@slack/web-api": "^7.0.0"
  }
}
```

#### 2. Create Slack App Configuration
**File**: `docs/slack-app-setup.md` (documentation only)
**Changes**: Document Slack app setup steps

```markdown
# Slack App Setup for TLDRSec Pipeline Monitor

## 1. Create Slack App
1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "TLDRSec Pipeline Monitor"
4. Workspace: tldrsecworkspace.slack.com

## 2. Configure OAuth Scopes (Bot Token Scopes)
- `app_mentions:read` - Detect @mentions
- `chat:write` - Post messages to channels
- `channels:read` - List public channels
- `channels:history` - Read channel messages for context

## 3. Enable Event Subscriptions
- Request URL: https://tldrsec.app/api/slack/events
- Subscribe to bot events:
  - `app_mention`
  - `message.channels`

## 4. Install to Workspace
- Click "Install to Workspace"
- Copy Bot User OAuth Token (xoxb-...)
- Copy Signing Secret from Basic Information

## 5. Invite Bot to Channel
- Go to #pipeline-monitoring
- Type `/invite @TLDRSec Pipeline Monitor`
```

#### 3. Environment Variables
**File**: `.env.local` (and Vercel dashboard)
**Changes**: Add Slack configuration

```bash
# Slack Bot Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_CHANNEL_ID=C0XXXXXXXXX  # #pipeline-monitoring channel ID
```

#### 4. Create Slack Event Handler Route
**File**: `app/api/slack/events/route.ts`
**Changes**: New file - main Slack event handler

```typescript
import { App, VercelReceiver } from '@vercel/slack-bolt';
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/client';
import { handleConversationalQuery } from '@/lib/slack/conversation-handler';

const receiver = new VercelReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  receiver,
});

// Handle URL verification challenge
app.event('url_verification', async ({ event, ack }) => {
  // @ts-ignore - url_verification has challenge property
  await ack({ challenge: event.challenge });
});

// Handle app mentions (@TLDRSec Pipeline Monitor)
app.event('app_mention', async ({ event, say, client }) => {
  const messageText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  try {
    const response = await handleConversationalQuery(messageText, {
      userId: event.user,
      channelId: event.channel,
      threadTs: event.thread_ts || event.ts,
    });

    await say({
      text: response.text,
      blocks: response.blocks,
      thread_ts: event.thread_ts || event.ts,
    });
  } catch (error) {
    console.error('Error handling app mention:', error);
    await say({
      text: "Sorry, I encountered an error processing your request. Please try again.",
      thread_ts: event.thread_ts || event.ts,
    });
  }
});

export async function POST(request: NextRequest) {
  // Handle Slack's URL verification challenge
  const body = await request.clone().json();
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  return receiver.requestHandler(request);
}

// Export GET for health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'slack-events' });
}
```

#### 5. Create Conversation Handler
**File**: `lib/slack/conversation-handler.ts`
**Changes**: New file - handles natural language queries

```typescript
import { getPrismaClient } from '@/lib/db/client';
import { formatDailyReport, formatWeeklyTrends, formatPipelineStatus } from './report-formatter';

interface ConversationContext {
  userId: string;
  channelId: string;
  threadTs?: string;
}

interface SlackResponse {
  text: string;
  blocks?: any[];
}

// Simple intent detection patterns
const INTENT_PATTERNS = {
  yesterdayStatus: /yesterday|yesterday's|last day/i,
  weeklyTrends: /week|weekly|last 7 days|trend/i,
  currentStatus: /current|now|today|status|health/i,
  failures: /fail|error|issue|problem/i,
  completionRate: /completion|rate|percentage|success/i,
  costs: /cost|spend|budget|ai cost|token/i,
  help: /help|what can you|how do i/i,
};

export async function handleConversationalQuery(
  message: string,
  context: ConversationContext
): Promise<SlackResponse> {
  const prisma = getPrismaClient();

  // Detect intent from message
  if (INTENT_PATTERNS.help.test(message)) {
    return getHelpResponse();
  }

  if (INTENT_PATTERNS.weeklyTrends.test(message)) {
    const weekData = await getWeeklyData(prisma);
    return formatWeeklyTrends(weekData);
  }

  if (INTENT_PATTERNS.yesterdayStatus.test(message) || INTENT_PATTERNS.completionRate.test(message)) {
    const yesterdayData = await getYesterdayData(prisma);
    return formatDailyReport(yesterdayData);
  }

  if (INTENT_PATTERNS.currentStatus.test(message)) {
    const statusData = await getCurrentPipelineStatus(prisma);
    return formatPipelineStatus(statusData);
  }

  if (INTENT_PATTERNS.failures.test(message)) {
    const failureData = await getRecentFailures(prisma);
    return formatFailureReport(failureData);
  }

  if (INTENT_PATTERNS.costs.test(message)) {
    const costData = await getCostData(prisma);
    return formatCostReport(costData);
  }

  // Default: show yesterday's status
  const yesterdayData = await getYesterdayData(prisma);
  return {
    text: "I'm not sure what you're asking. Here's yesterday's pipeline status:",
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "I'm not sure what you're asking. Here's yesterday's pipeline status:",
        },
      },
      ...formatDailyReport(yesterdayData).blocks || [],
    ],
  };
}

function getHelpResponse(): SlackResponse {
  return {
    text: 'TLDRSec Pipeline Monitor - Help',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'TLDRSec Pipeline Monitor' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Ask me about:*\n' +
            '• "What was yesterday\'s completion rate?"\n' +
            '• "Show me the last week\'s trends"\n' +
            '• "Any failures in the last 24 hours?"\n' +
            '• "What\'s the current pipeline status?"\n' +
            '• "How much did AI cost yesterday?"\n' +
            '\nI post daily reports here at 8:30 AM AEST and weekly summaries on Monday mornings.',
        },
      },
    ],
  };
}

async function getYesterdayData(prisma: any) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  return prisma.dailyPipelineVerification.findUnique({
    where: { verificationDate: yesterday },
  });
}

async function getWeeklyData(prisma: any) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  return prisma.dailyPipelineVerification.findMany({
    where: {
      verificationDate: { gte: weekAgo },
    },
    orderBy: { verificationDate: 'desc' },
  });
}

async function getCurrentPipelineStatus(prisma: any) {
  // Get latest cron execution and job queue status
  const [latestCron, pendingJobs] = await Promise.all([
    prisma.cronJobExecution.findFirst({
      orderBy: { startedAt: 'desc' },
    }),
    prisma.jobQueue.count({
      where: { status: 'pending' },
    }),
  ]);

  return { latestCron, pendingJobs };
}

async function getRecentFailures(prisma: any) {
  const dayAgo = new Date();
  dayAgo.setDate(dayAgo.getDate() - 1);

  return prisma.dailyPipelineVerification.findFirst({
    where: {
      verificationDate: { gte: dayAgo },
      filingsFailed: { gt: 0 },
    },
    orderBy: { verificationDate: 'desc' },
  });
}

async function getCostData(prisma: any) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  return prisma.dailyPipelineVerification.findUnique({
    where: { verificationDate: yesterday },
    select: {
      aiTotalCostUsd: true,
      aiInputTokens: true,
      aiOutputTokens: true,
      aiTotalTokens: true,
      aiModelBreakdown: true,
    },
  });
}

function formatFailureReport(data: any): SlackResponse {
  if (!data || data.filingsFailed === 0) {
    return {
      text: 'No failures in the last 24 hours!',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':white_check_mark: *No failures in the last 24 hours!*',
          },
        },
      ],
    };
  }

  return {
    text: `${data.filingsFailed} failures found`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: *${data.filingsFailed} filing(s) failed*\n` +
            `• Fetch failures: ${data.fetchFailedCount || 0}\n` +
            `• Summarize failures: ${data.summarizeFailedCount || 0}\n` +
            `• Remediation attempted: ${data.remediationAttempted || 0}\n` +
            `• Remediation succeeded: ${data.remediationSucceeded || 0}`,
        },
      },
    ],
  };
}

function formatCostReport(data: any): SlackResponse {
  if (!data) {
    return {
      text: 'No cost data available for yesterday',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: 'No cost data available for yesterday.' },
        },
      ],
    };
  }

  const modelBreakdown = data.aiModelBreakdown as Record<string, any> || {};
  const breakdownText = Object.entries(modelBreakdown)
    .map(([model, stats]: [string, any]) => `• ${model}: $${stats.cost?.toFixed(4) || '0.00'}`)
    .join('\n');

  return {
    text: `AI costs: $${data.aiTotalCostUsd?.toFixed(4) || '0.00'}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'AI Cost Report' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Total Cost:* $${data.aiTotalCostUsd?.toFixed(4) || '0.00'}\n` +
            `*Total Tokens:* ${data.aiTotalTokens?.toLocaleString() || 0}\n` +
            `• Input: ${data.aiInputTokens?.toLocaleString() || 0}\n` +
            `• Output: ${data.aiOutputTokens?.toLocaleString() || 0}\n\n` +
            `*By Model:*\n${breakdownText || 'No breakdown available'}`,
        },
      },
    ],
  };
}
```

#### 6. Create Report Formatter
**File**: `lib/slack/report-formatter.ts`
**Changes**: New file - formats reports with Block Kit

```typescript
interface DailyVerification {
  verificationDate: Date;
  filingsDiscovered: number;
  filingsCompleted: number;
  filingsPending: number;
  filingsFailed: number;
  fetchSuccessCount: number;
  fetchFailedCount: number;
  summarizeSuccessCount: number;
  summarizeFailedCount: number;
  emailsSentCount: number;
  uniqueUsersNotified: number;
  aiTotalCostUsd: number | null;
  aiTotalTokens: number | null;
  remediationAttempted: number;
  remediationSucceeded: number;
  remediationFailed: number;
}

interface SlackResponse {
  text: string;
  blocks?: any[];
}

export function formatDailyReport(data: DailyVerification | null): SlackResponse {
  if (!data) {
    return {
      text: 'No verification data available for yesterday.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':warning: No verification data available for yesterday. The daily verification may not have run.',
          },
        },
      ],
    };
  }

  const completionRate = data.filingsDiscovered > 0
    ? ((data.filingsCompleted / data.filingsDiscovered) * 100).toFixed(1)
    : '0.0';

  const statusEmoji = parseFloat(completionRate) >= 100 ? ':white_check_mark:' :
    parseFloat(completionRate) >= 80 ? ':large_yellow_circle:' : ':red_circle:';

  const dateStr = data.verificationDate.toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    text: `Pipeline Report for ${dateStr}: ${completionRate}% completion`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Pipeline Report - ${dateStr}` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusEmoji} *Completion Rate: ${completionRate}%*`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Pipeline Phase Breakdown:*',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Discovery*\n${data.filingsDiscovered} filings found`,
          },
          {
            type: 'mrkdwn',
            text: `*Fetch*\n:white_check_mark: ${data.fetchSuccessCount} | :x: ${data.fetchFailedCount}`,
          },
          {
            type: 'mrkdwn',
            text: `*Summarize*\n:white_check_mark: ${data.summarizeSuccessCount} | :x: ${data.summarizeFailedCount}`,
          },
          {
            type: 'mrkdwn',
            text: `*Email*\n:email: ${data.emailsSentCount} sent to ${data.uniqueUsersNotified} users`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Status Summary*\n` +
              `:white_check_mark: Completed: ${data.filingsCompleted}\n` +
              `:hourglass: Pending: ${data.filingsPending}\n` +
              `:x: Failed: ${data.filingsFailed}`,
          },
          {
            type: 'mrkdwn',
            text: `*AI Costs*\n` +
              `$${data.aiTotalCostUsd?.toFixed(4) || '0.00'}\n` +
              `${data.aiTotalTokens?.toLocaleString() || 0} tokens`,
          },
        ],
      },
      ...(data.remediationAttempted > 0 ? [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Remediation Results:*\n` +
              `Attempted: ${data.remediationAttempted} | ` +
              `Succeeded: ${data.remediationSucceeded} | ` +
              `Failed: ${data.remediationFailed}`,
          },
        },
      ] : []),
    ],
  };
}

export function formatWeeklyTrends(data: DailyVerification[]): SlackResponse {
  if (!data || data.length === 0) {
    return {
      text: 'No data available for the last week.',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: ':warning: No data available for the last week.' },
        },
      ],
    };
  }

  // Calculate averages and trends
  const avgCompletionRate = data.reduce((sum, d) => {
    const rate = d.filingsDiscovered > 0 ? (d.filingsCompleted / d.filingsDiscovered) * 100 : 100;
    return sum + rate;
  }, 0) / data.length;

  const totalFilings = data.reduce((sum, d) => sum + d.filingsDiscovered, 0);
  const totalCompleted = data.reduce((sum, d) => sum + d.filingsCompleted, 0);
  const totalFailed = data.reduce((sum, d) => sum + d.filingsFailed, 0);
  const totalCost = data.reduce((sum, d) => sum + (d.aiTotalCostUsd || 0), 0);

  // Find problematic form types (from filingDetails JSON)
  const failureDays = data.filter(d => d.filingsFailed > 0).length;

  const trendEmoji = avgCompletionRate >= 95 ? ':chart_with_upwards_trend:' :
    avgCompletionRate >= 80 ? ':chart_with_downwards_trend:' : ':warning:';

  // Build daily breakdown
  const dailyBreakdown = data.map(d => {
    const rate = d.filingsDiscovered > 0
      ? ((d.filingsCompleted / d.filingsDiscovered) * 100).toFixed(0)
      : '100';
    const emoji = parseInt(rate) >= 100 ? ':white_check_mark:' :
      parseInt(rate) >= 80 ? ':large_yellow_circle:' : ':red_circle:';
    const dateStr = d.verificationDate.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
    return `${emoji} ${dateStr}: ${rate}% (${d.filingsCompleted}/${d.filingsDiscovered})`;
  }).join('\n');

  return {
    text: `Weekly Pipeline Summary: ${avgCompletionRate.toFixed(1)}% avg completion`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Weekly Pipeline Summary' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${trendEmoji} *Average Completion Rate: ${avgCompletionRate.toFixed(1)}%*`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total Filings*\n${totalFilings} discovered\n${totalCompleted} completed`,
          },
          {
            type: 'mrkdwn',
            text: `*Issues*\n${totalFailed} failed\n${failureDays} days with failures`,
          },
          {
            type: 'mrkdwn',
            text: `*AI Costs*\n$${totalCost.toFixed(2)} total\n$${(totalCost / data.length).toFixed(2)}/day avg`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Daily Breakdown:*\n${dailyBreakdown}`,
        },
      },
    ],
  };
}

export function formatPipelineStatus(data: { latestCron: any; pendingJobs: number }): SlackResponse {
  const { latestCron, pendingJobs } = data;

  const cronStatus = latestCron?.status === 'success' ? ':white_check_mark: Healthy' :
    latestCron?.status === 'running' ? ':hourglass: Running' : ':warning: Unknown';

  const lastRunTime = latestCron?.startedAt
    ? new Date(latestCron.startedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })
    : 'Unknown';

  return {
    text: `Pipeline Status: ${cronStatus}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Current Pipeline Status' },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Status*\n${cronStatus}`,
          },
          {
            type: 'mrkdwn',
            text: `*Last Cron Run*\n${lastRunTime}`,
          },
          {
            type: 'mrkdwn',
            text: `*Pending Jobs*\n${pendingJobs} in queue`,
          },
          {
            type: 'mrkdwn',
            text: `*Cron Duration*\n${latestCron?.durationMs ? `${latestCron.durationMs}ms` : 'N/A'}`,
          },
        ],
      },
    ],
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Dependencies install successfully: `npm install`
- [ ] TypeScript compiles: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test`

#### Manual Verification:
- [ ] Slack app created at api.slack.com/apps
- [ ] Bot token and signing secret configured in Vercel environment
- [ ] Bot appears in `#pipeline-monitoring` channel
- [ ] Event subscription URL verified by Slack
- [ ] Mentioning bot returns help response

**Implementation Note**: After completing this phase, pause for manual Slack app configuration before proceeding.

---

## Phase 2: Scheduled Daily Reports

### Overview
Set up Vercel Cron Job to post daily pipeline reports at 8:30 AM AEST to `#pipeline-monitoring`.

### Changes Required:

#### 1. Configure Vercel Cron Job
**File**: `vercel.json`
**Changes**: Add cron configuration

```json
{
  "crons": [
    {
      "path": "/api/slack/daily-report",
      "schedule": "30 22 * * *"
    },
    {
      "path": "/api/slack/weekly-report",
      "schedule": "0 23 * * 0"
    }
  ]
}
```

Note: 8:30 AM AEST = 22:30 UTC (previous day during AEDT/daylight saving)
      9:00 AM AEST Monday = 23:00 UTC Sunday

#### 2. Create Daily Report Endpoint
**File**: `app/api/slack/daily-report/route.ts`
**Changes**: New file - cron-triggered daily report

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { getPrismaClient } from '@/lib/db/client';
import { formatDailyReport } from '@/lib/slack/report-formatter';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow Vercel cron (no auth header but from Vercel)
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    if (!isVercelCron && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const prisma = getPrismaClient();

  try {
    // Get yesterday's verification data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const verification = await prisma.dailyPipelineVerification.findUnique({
      where: { verificationDate: yesterday },
    });

    const report = formatDailyReport(verification);

    // Post to #pipeline-monitoring
    await slack.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID!,
      text: report.text,
      blocks: report.blocks,
    });

    console.log(`[Slack Daily Report] Posted report for ${yesterday.toISOString()}`);

    return NextResponse.json({
      success: true,
      date: yesterday.toISOString(),
      hasData: !!verification,
    });
  } catch (error) {
    console.error('[Slack Daily Report] Error:', error);

    // Try to notify channel of error
    try {
      await slack.chat.postMessage({
        channel: process.env.SLACK_CHANNEL_ID!,
        text: ':warning: Failed to generate daily pipeline report. Check logs for details.',
      });
    } catch (notifyError) {
      console.error('[Slack Daily Report] Failed to notify channel:', notifyError);
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

#### 3. Create Weekly Report Endpoint
**File**: `app/api/slack/weekly-report/route.ts`
**Changes**: New file - cron-triggered weekly report

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { getPrismaClient } from '@/lib/db/client';
import { formatWeeklyTrends } from '@/lib/slack/report-formatter';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    if (!isVercelCron && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const prisma = getPrismaClient();

  try {
    // Get last 7 days of verification data
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyData = await prisma.dailyPipelineVerification.findMany({
      where: {
        verificationDate: { gte: weekAgo },
      },
      orderBy: { verificationDate: 'desc' },
    });

    const report = formatWeeklyTrends(weeklyData);

    // Post to #pipeline-monitoring
    await slack.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID!,
      text: report.text,
      blocks: report.blocks,
    });

    console.log(`[Slack Weekly Report] Posted report for week ending ${new Date().toISOString()}`);

    return NextResponse.json({
      success: true,
      daysIncluded: weeklyData.length,
    });
  } catch (error) {
    console.error('[Slack Weekly Report] Error:', error);

    try {
      await slack.chat.postMessage({
        channel: process.env.SLACK_CHANNEL_ID!,
        text: ':warning: Failed to generate weekly pipeline report. Check logs for details.',
      });
    } catch (notifyError) {
      console.error('[Slack Weekly Report] Failed to notify channel:', notifyError);
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Daily report endpoint responds: `curl http://localhost:3000/api/slack/daily-report`
- [ ] Weekly report endpoint responds: `curl http://localhost:3000/api/slack/weekly-report`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Manually trigger daily report endpoint and verify message appears in `#pipeline-monitoring`
- [ ] Report shows phase breakdown (Discovery, Fetch, Summarize, Email)
- [ ] Completion rate calculation is accurate
- [ ] Status emojis reflect actual status
- [ ] Verify Vercel cron jobs appear in Vercel dashboard after deployment

**Implementation Note**: Deploy to Vercel and verify cron job configuration before proceeding.

---

## Phase 3: Enhanced Conversational Queries

### Overview
Improve the conversation handler with better intent detection and context awareness.

### Changes Required:

#### 1. Add Conversation State Schema
**File**: `prisma/schema.prisma`
**Changes**: Add conversation state model

```prisma
model SlackConversationState {
  id          String   @id @default(cuid())

  // Slack identifiers
  userId      String
  channelId   String
  threadTs    String?

  // Conversation tracking
  lastIntent  String?
  lastQuery   String?
  context     Json?    @default("{}")

  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  expiresAt   DateTime // Auto-expire after 30 minutes

  @@unique([userId, channelId, threadTs])
  @@index([userId])
  @@index([expiresAt])
}
```

#### 2. Enhanced Conversation Handler
**File**: `lib/slack/conversation-handler.ts`
**Changes**: Update with context awareness

```typescript
// Add to existing file after the imports

interface ConversationState {
  lastIntent: string | null;
  lastQuery: string | null;
  context: Record<string, any>;
}

async function getOrCreateConversationState(
  prisma: any,
  context: ConversationContext
): Promise<ConversationState> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const state = await prisma.slackConversationState.upsert({
    where: {
      userId_channelId_threadTs: {
        userId: context.userId,
        channelId: context.channelId,
        threadTs: context.threadTs || '',
      },
    },
    update: {
      expiresAt,
    },
    create: {
      userId: context.userId,
      channelId: context.channelId,
      threadTs: context.threadTs || '',
      expiresAt,
      context: {},
    },
  });

  return {
    lastIntent: state.lastIntent,
    lastQuery: state.lastQuery,
    context: state.context as Record<string, any>,
  };
}

async function updateConversationState(
  prisma: any,
  context: ConversationContext,
  intent: string,
  query: string
): Promise<void> {
  await prisma.slackConversationState.update({
    where: {
      userId_channelId_threadTs: {
        userId: context.userId,
        channelId: context.channelId,
        threadTs: context.threadTs || '',
      },
    },
    data: {
      lastIntent: intent,
      lastQuery: query,
      updatedAt: new Date(),
    },
  });
}

// Add follow-up patterns
const FOLLOWUP_PATTERNS = {
  moreDetails: /more|detail|expand|explain|breakdown/i,
  compare: /compare|vs|versus|difference/i,
  specific: /which|what|why|how/i,
  timeRange: /(\d+)\s*(day|week|month)s?/i,
};

// Update handleConversationalQuery to use state
export async function handleConversationalQuery(
  message: string,
  context: ConversationContext
): Promise<SlackResponse> {
  const prisma = getPrismaClient();
  const state = await getOrCreateConversationState(prisma, context);

  // Check for follow-up questions
  if (state.lastIntent && FOLLOWUP_PATTERNS.moreDetails.test(message)) {
    // Provide more details on last query
    return handleFollowUp(prisma, state, 'details');
  }

  // Extract custom time range
  const timeMatch = message.match(FOLLOWUP_PATTERNS.timeRange);
  if (timeMatch) {
    const amount = parseInt(timeMatch[1]);
    const unit = timeMatch[2];
    const days = unit.startsWith('week') ? amount * 7 :
                 unit.startsWith('month') ? amount * 30 : amount;
    return handleCustomTimeRange(prisma, days);
  }

  // ... rest of existing intent detection ...

  // Update state after successful query
  const detectedIntent = detectIntent(message);
  await updateConversationState(prisma, context, detectedIntent, message);

  // ... continue with existing logic ...
}

function detectIntent(message: string): string {
  if (INTENT_PATTERNS.help.test(message)) return 'help';
  if (INTENT_PATTERNS.weeklyTrends.test(message)) return 'weekly';
  if (INTENT_PATTERNS.yesterdayStatus.test(message)) return 'yesterday';
  if (INTENT_PATTERNS.currentStatus.test(message)) return 'current';
  if (INTENT_PATTERNS.failures.test(message)) return 'failures';
  if (INTENT_PATTERNS.costs.test(message)) return 'costs';
  return 'unknown';
}

async function handleFollowUp(
  prisma: any,
  state: ConversationState,
  type: string
): Promise<SlackResponse> {
  // Provide expanded details based on last query
  if (state.lastIntent === 'yesterday' || state.lastIntent === 'weekly') {
    const data = await getYesterdayData(prisma);
    return formatDetailedFilingBreakdown(data);
  }

  return {
    text: "I'm not sure what you'd like more details on. Try asking about yesterday's status or weekly trends.",
    blocks: [],
  };
}

async function handleCustomTimeRange(prisma: any, days: number): Promise<SlackResponse> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const data = await prisma.dailyPipelineVerification.findMany({
    where: {
      verificationDate: { gte: startDate },
    },
    orderBy: { verificationDate: 'desc' },
  });

  return formatWeeklyTrends(data); // Reuse weekly formatter
}

function formatDetailedFilingBreakdown(data: any): SlackResponse {
  if (!data?.filingDetails) {
    return {
      text: 'No detailed filing data available.',
      blocks: [],
    };
  }

  const details = data.filingDetails as any[];
  const byFormType: Record<string, { total: number; completed: number; failed: number }> = {};

  details.forEach((filing: any) => {
    const formType = filing.formType || 'Unknown';
    if (!byFormType[formType]) {
      byFormType[formType] = { total: 0, completed: 0, failed: 0 };
    }
    byFormType[formType].total++;
    if (filing.status === 'COMPLETE') byFormType[formType].completed++;
    if (filing.status === 'FAILED') byFormType[formType].failed++;
  });

  const breakdownText = Object.entries(byFormType)
    .map(([type, stats]) => `• ${type}: ${stats.completed}/${stats.total} completed`)
    .join('\n');

  return {
    text: 'Filing breakdown by form type',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Filing Breakdown by Form Type' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: breakdownText || 'No breakdown available',
        },
      },
    ],
  };
}
```

#### 3. Add Cleanup Job for Expired Conversations
**File**: `lib/slack/cleanup.ts`
**Changes**: New file - cleanup expired conversation state

```typescript
import { getPrismaClient } from '@/lib/db/client';

export async function cleanupExpiredConversations(): Promise<number> {
  const prisma = getPrismaClient();

  const result = await prisma.slackConversationState.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return result.count;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Database migration runs: `npm run db:migrate`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Bot responds to "what was yesterday's status?"
- [ ] Bot responds to "show me the last 3 days"
- [ ] Bot responds to "any failures?"
- [ ] Bot responds to "more details" as a follow-up
- [ ] Conversation state persists within a thread

**Implementation Note**: Test conversation flows thoroughly before proceeding.

---

## Phase 4: Testing & Documentation

### Overview
Add tests for Slack integration and update documentation.

### Changes Required:

#### 1. Create Slack Integration Tests
**File**: `__tests__/slack/conversation-handler.test.ts`
**Changes**: New file - unit tests

```typescript
import { handleConversationalQuery } from '@/lib/slack/conversation-handler';
import { formatDailyReport, formatWeeklyTrends } from '@/lib/slack/report-formatter';

// Mock Prisma
jest.mock('@/lib/db/client', () => ({
  getPrismaClient: jest.fn(() => ({
    dailyPipelineVerification: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    slackConversationState: {
      upsert: jest.fn(() => ({ context: {} })),
      update: jest.fn(),
    },
    cronJobExecution: {
      findFirst: jest.fn(),
    },
    jobQueue: {
      count: jest.fn(() => 0),
    },
  })),
}));

describe('Slack Conversation Handler', () => {
  describe('formatDailyReport', () => {
    it('returns warning when no data', () => {
      const result = formatDailyReport(null);
      expect(result.text).toContain('No verification data');
    });

    it('shows correct completion rate', () => {
      const data = {
        verificationDate: new Date('2025-11-29'),
        filingsDiscovered: 10,
        filingsCompleted: 8,
        filingsPending: 1,
        filingsFailed: 1,
        fetchSuccessCount: 9,
        fetchFailedCount: 1,
        summarizeSuccessCount: 8,
        summarizeFailedCount: 1,
        emailsSentCount: 8,
        uniqueUsersNotified: 3,
        aiTotalCostUsd: 0.05,
        aiTotalTokens: 5000,
        remediationAttempted: 1,
        remediationSucceeded: 0,
        remediationFailed: 1,
      };

      const result = formatDailyReport(data as any);
      expect(result.text).toContain('80.0%');
    });

    it('shows green emoji for 100% completion', () => {
      const data = {
        verificationDate: new Date('2025-11-29'),
        filingsDiscovered: 5,
        filingsCompleted: 5,
        filingsPending: 0,
        filingsFailed: 0,
        fetchSuccessCount: 5,
        fetchFailedCount: 0,
        summarizeSuccessCount: 5,
        summarizeFailedCount: 0,
        emailsSentCount: 5,
        uniqueUsersNotified: 2,
        aiTotalCostUsd: 0.03,
        aiTotalTokens: 3000,
        remediationAttempted: 0,
        remediationSucceeded: 0,
        remediationFailed: 0,
      };

      const result = formatDailyReport(data as any);
      expect(result.blocks).toBeDefined();
      const statusBlock = result.blocks?.find((b: any) =>
        b.text?.text?.includes('white_check_mark')
      );
      expect(statusBlock).toBeDefined();
    });
  });

  describe('formatWeeklyTrends', () => {
    it('returns warning when no data', () => {
      const result = formatWeeklyTrends([]);
      expect(result.text).toContain('No data available');
    });

    it('calculates correct averages', () => {
      const data = [
        { filingsDiscovered: 10, filingsCompleted: 10, filingsFailed: 0, aiTotalCostUsd: 0.05, verificationDate: new Date() },
        { filingsDiscovered: 10, filingsCompleted: 8, filingsFailed: 2, aiTotalCostUsd: 0.05, verificationDate: new Date() },
      ];

      const result = formatWeeklyTrends(data as any);
      expect(result.text).toContain('90.0%'); // Average of 100% and 80%
    });
  });
});
```

#### 2. Add npm Script for Slack Tests
**File**: `package.json`
**Changes**: Add test script

```json
{
  "scripts": {
    "test:slack": "jest --testPathPattern=__tests__/slack"
  }
}
```

#### 3. Update CLAUDE.md
**File**: `CLAUDE.md`
**Changes**: Add Slack bot section

```markdown
### Slack Bot Integration
- **Bot**: TLDRSec Pipeline Monitor in tldrsecworkspace.slack.com
- **Channel**: #pipeline-monitoring
- **Daily Report**: 8:30 AM AEST (Vercel Cron)
- **Weekly Report**: Monday 9:00 AM AEST (Vercel Cron)

#### Slack Bot Commands (via @mention)
- `npm run test:slack` - Run Slack integration tests
- Ask naturally: "What was yesterday's completion rate?"
- Ask for trends: "Show me the last week's trends"
- Check failures: "Any failures in the last 24 hours?"

#### Environment Variables (Slack)
- `SLACK_BOT_TOKEN` - Bot User OAuth Token (xoxb-...)
- `SLACK_SIGNING_SECRET` - App Signing Secret
- `SLACK_CHANNEL_ID` - #pipeline-monitoring channel ID
```

### Success Criteria:

#### Automated Verification:
- [ ] Slack tests pass: `npm run test:slack`
- [ ] All tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Documentation is accurate and complete
- [ ] Slack app manifest documented for future reference

**Implementation Note**: After completing all phases, perform end-to-end testing.

---

## Testing Strategy

### Unit Tests
- Intent detection patterns
- Report formatting functions
- Completion rate calculations
- Date handling (AEST/UTC conversions)

### Integration Tests
- Slack event handler responds to mentions
- Daily report endpoint generates correct data
- Weekly report aggregates correctly
- Conversation state persists and expires

### Manual Testing Steps
1. Create Slack app and install to workspace
2. Invite bot to `#pipeline-monitoring`
3. Mention bot with "help" and verify response
4. Mention bot with "what was yesterday's status?"
5. Manually trigger `/api/slack/daily-report` and verify message
6. Wait for scheduled cron (or manually trigger) and verify automated post
7. Test follow-up questions in a thread

## Performance Considerations

- **Vercel Function Timeout**: 10 seconds on Hobby, 60 seconds on Pro
- **Slack 3-second rule**: `@vercel/slack-bolt` handles this with `waitUntil`
- **Database queries**: Add indexes on `verificationDate` (already exists)
- **Rate limits**: Max 1 message/second per channel (sufficient for our use)

## Migration Notes

- No migration of existing data required
- New `SlackConversationState` table is optional (for enhanced context)
- Can deploy Phase 1-2 independently of Phase 3

## Security Considerations

- Store `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in Vercel environment variables
- Request verification handled automatically by `@vercel/slack-bolt`
- Cron endpoints verify `x-vercel-cron` header or `CRON_SECRET`
- No sensitive data exposed in Slack messages (costs are in USD, no PII)

## References

- Slack app setup: docs/slack-app-setup.md (created in Phase 1)
- DailyPipelineVerification schema: prisma/schema.prisma:775-816
- Verify daily script: scripts/verify-daily-pipeline.ts
- Monitoring APIs: app/api/monitoring/
- @vercel/slack-bolt: https://vercel.com/changelog/build-slack-agents-with-vercel-slack-bolt
