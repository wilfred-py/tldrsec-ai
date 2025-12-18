/**
 * Slack Conversation Handler
 *
 * Handles @mention queries by parsing intent and generating responses.
 * Uses the Slack Web API to post responses to channels/threads.
 */

import { WebClient } from '@slack/web-api';
import { logger } from '../logging';
import { QueueMonitoringService } from '../cron/queue-monitoring';
import type {
  ParsedMention,
  ConversationIntent,
  SlackBlock,
} from './types';
import {
  formatHelpMessage,
  formatStatusMessage,
  formatErrorMessage,
} from './message-formatter';
import { generateDailyReport } from './daily-report-handler';
import { requireAuthorization } from './user-authorization';

const conversationLogger = logger.child('slack-conversation');

// =============================================================================
// Slack Web Client
// =============================================================================

let webClient: WebClient | null = null;

function getWebClient(): WebClient | null {
  if (!webClient) {
    // Clean up env var: trim whitespace AND remove literal \n that CLI tools add
    const token = process.env.SLACK_BOT_TOKEN?.trim().replace(/\\n$/, '');
    if (!token) {
      conversationLogger.warn('SLACK_BOT_TOKEN not configured');
      return null;
    }
    webClient = new WebClient(token);
  }
  return webClient;
}

// =============================================================================
// Intent Detection
// =============================================================================

interface IntentPattern {
  intent: ConversationIntent;
  patterns: RegExp[];
  extract?: (text: string) => Record<string, string> | undefined;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'help',
    patterns: [/\bhelp\b/i, /\bcommands?\b/i, /\bwhat can you do\b/i, /\bhow to use\b/i],
  },
  {
    intent: 'status',
    patterns: [/\bstatus\b/i, /\bcurrent\b/i, /\bqueue\b/i, /\bhow('s| is) (it|the pipeline)\b/i],
  },
  {
    intent: 'daily_report',
    patterns: [
      /\bdaily\s*(report|summary)?\b/i,
      /\byesterday('s)?\s*(report|summary)?\b/i,
      /\breport\s+(\d{4}-\d{2}-\d{2})\b/i,
    ],
    extract: (text: string) => {
      const dateMatch = text.match(/\breport\s+(\d{4}-\d{2}-\d{2})\b/i);
      if (dateMatch) {
        return { date: dateMatch[1] };
      }
      return undefined;
    },
  },
  {
    intent: 'weekly_report',
    patterns: [/\bweek(ly)?\s*(report|summary|trends?)?\b/i, /\btrends?\b/i],
  },
  {
    intent: 'failures',
    patterns: [/\bfail(ure|ed|ing)s?\b/i, /\berrors?\b/i, /\bissues?\b/i, /\bproblems?\b/i],
  },
  {
    intent: 'costs',
    patterns: [/\bcosts?\b/i, /\bspend(ing)?\b/i, /\bbudget\b/i, /\bai\s*costs?\b/i],
  },
];

/**
 * Parse @mention text and detect intent
 */
function parseIntent(text: string): { intent: ConversationIntent; parameters?: Record<string, string> } {
  // Remove bot mention from text
  const cleanText = text.replace(/<@[A-Z0-9]+>/gi, '').trim();

  for (const { intent, patterns, extract } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(cleanText)) {
        const parameters = extract ? extract(cleanText) : undefined;
        return { intent, parameters };
      }
    }
  }

  return { intent: 'unknown' };
}

// =============================================================================
// Response Handlers
// =============================================================================

async function handleStatusIntent(): Promise<{ text: string; blocks: SlackBlock[] }> {
  const health = await QueueMonitoringService.checkQueueHealth();
  const message = formatStatusMessage(health);
  return { text: message.text, blocks: message.blocks || [] };
}

async function handleDailyReportIntent(
  parameters?: Record<string, string>
): Promise<{ text: string; blocks: SlackBlock[] }> {
  const date = parameters?.date; // Optional specific date
  const message = await generateDailyReport(date);
  return { text: message.text, blocks: message.blocks || [] };
}

async function handleFailuresIntent(): Promise<{ text: string; blocks: SlackBlock[] }> {
  const health = await QueueMonitoringService.checkQueueHealth();

  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: ':x: Recent Failures', emoji: true } },
    { type: 'divider' },
  ];

  if (health.metrics.failedLast24h === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: ':white_check_mark: No failures in the last 24 hours!' },
    });
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Failed jobs (24h):* ${health.metrics.failedLast24h}\n*Queue depth:* ${health.metrics.queueDepth}\n*Processing:* ${health.metrics.processingJobs}`,
      },
    });

    if (health.issues.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Issues:*\n${health.issues.map(i => `• ${i}`).join('\n')}`,
        },
      });
    }
  }

  return {
    text: `Failures: ${health.metrics.failedLast24h} in last 24h`,
    blocks,
  };
}

async function handleCostsIntent(): Promise<{ text: string; blocks: SlackBlock[] }> {
  // TODO: Integrate with actual cost tracking
  // For now, return placeholder
  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: ':moneybag: AI Costs', emoji: true } },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Cost tracking coming soon!\n\nThis will show:\n• Daily AI costs\n• Model usage breakdown\n• Cost per filing average',
      },
    },
  ];

  return {
    text: 'AI cost tracking coming soon',
    blocks,
  };
}

async function handleWeeklyIntent(): Promise<{ text: string; blocks: SlackBlock[] }> {
  // TODO: Implement weekly trends
  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: ':chart_with_upwards_trend: Weekly Trends', emoji: true } },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Weekly trends coming soon!\n\nThis will show:\n• Filing volume trends\n• Completion rate over time\n• Average processing times',
      },
    },
  ];

  return {
    text: 'Weekly trends coming soon',
    blocks,
  };
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handle a conversation from @mention
 */
export async function handleConversation(mention: ParsedMention): Promise<void> {
  const client = getWebClient();
  if (!client) {
    conversationLogger.error('Slack web client not available');
    return;
  }

  const channelId = mention.channelId;
  const threadTs = mention.threadTs;

  try {
    // Parse intent from text
    const { intent, parameters } = parseIntent(mention.text);
    conversationLogger.info('Handling conversation', { intent, parameters, channelId });

    let response: { text: string; blocks: SlackBlock[] };

    switch (intent) {
      case 'help':
        const helpMessage = formatHelpMessage();
        response = { text: helpMessage.text, blocks: helpMessage.blocks || [] };
        break;

      case 'status':
        const statusAuth = requireAuthorization(mention.userId, 'view_pipeline_status');
        if (!statusAuth.authorized) {
          response = { 
            text: statusAuth.errorMessage!,
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: statusAuth.errorMessage! } }]
          };
          break;
        }
        response = await handleStatusIntent();
        break;

      case 'daily_report':
        const dailyAuth = requireAuthorization(mention.userId, 'view_daily_reports');
        if (!dailyAuth.authorized) {
          response = { 
            text: dailyAuth.errorMessage!,
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: dailyAuth.errorMessage! } }]
          };
          break;
        }
        response = await handleDailyReportIntent(parameters);
        break;

      case 'failures':
        const failuresAuth = requireAuthorization(mention.userId, 'view_failure_details');
        if (!failuresAuth.authorized) {
          response = { 
            text: failuresAuth.errorMessage!,
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: failuresAuth.errorMessage! } }]
          };
          break;
        }
        response = await handleFailuresIntent();
        break;

      case 'costs':
        const costsAuth = requireAuthorization(mention.userId, 'view_cost_data');
        if (!costsAuth.authorized) {
          response = { 
            text: costsAuth.errorMessage!,
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: costsAuth.errorMessage! } }]
          };
          break;
        }
        response = await handleCostsIntent();
        break;

      case 'weekly_report':
      case 'trends':
        const weeklyAuth = requireAuthorization(mention.userId, 'view_daily_reports');
        if (!weeklyAuth.authorized) {
          response = { 
            text: weeklyAuth.errorMessage!,
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: weeklyAuth.errorMessage! } }]
          };
          break;
        }
        response = await handleWeeklyIntent();
        break;

      default:
        // Unknown intent - suggest help
        response = {
          text: "I didn't understand that. Try @pipeline-monitor help for available commands.",
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ":thinking_face: I didn't understand that.\n\nTry one of these:\n• *help* - Show available commands\n• *status* - Current pipeline status\n• *daily report* - Yesterday's summary\n• *failures* - Recent failures",
              },
            },
          ],
        };
    }

    // Post response to Slack
    await client.chat.postMessage({
      channel: channelId,
      text: response.text,
      blocks: response.blocks,
      thread_ts: threadTs, // Reply in thread if original was in thread
    });

    conversationLogger.info('Response posted to Slack', { channelId, intent });
  } catch (error) {
    conversationLogger.error('Error handling conversation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      channelId,
    });

    // Try to post error message
    try {
      const errorMessage = formatErrorMessage('An error occurred while processing your request.');
      await client.chat.postMessage({
        channel: channelId,
        text: errorMessage.text,
        blocks: errorMessage.blocks,
        thread_ts: threadTs,
      });
    } catch {
      // Silently fail if we can't post error message
    }
  }
}
