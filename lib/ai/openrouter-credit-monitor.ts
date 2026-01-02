/**
 * OpenRouter Credit Monitor
 *
 * Monitors OpenRouter API credit status and provides alerts when credits are low.
 * See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md
 */

import { logger } from '../logging';
import { ApiError, ErrorCode } from '../error-handling';

const creditLogger = logger.child('openrouter-credit-monitor');

// Warning threshold in dollars - alert when credits fall below this
const WARNING_THRESHOLD = parseInt(process.env.OPENROUTER_CREDIT_WARNING_THRESHOLD || '50', 10);

export interface CreditStatus {
  credits: number;          // Credits remaining in dollars
  limit: number;            // Credit limit (if set)
  usage: number;            // Credits used
  isLow: boolean;           // True if below warning threshold
  limitReached: boolean;    // True if limit has been reached
  error?: string;           // Error message if fetch failed
}

/**
 * Get current credit status from OpenRouter API
 * Uses the /api/v1/auth/key endpoint to check remaining credits
 */
export async function getOpenRouterCreditStatus(): Promise<CreditStatus> {
  const apiKey = process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    creditLogger.error('No OpenRouter API key configured');
    return {
      credits: 0,
      limit: 0,
      usage: 0,
      isLow: true,
      limitReached: true,
      error: 'No OpenRouter API key configured'
    };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      creditLogger.error('Failed to fetch OpenRouter credit status', {
        status: response.status,
        error: errorText
      });
      return {
        credits: 0,
        limit: 0,
        usage: 0,
        isLow: true,
        limitReached: response.status === 402,
        error: `API error: ${response.status} - ${errorText}`
      };
    }

    const data = await response.json() as {
      data?: {
        limit?: number;
        usage?: number;
        limit_remaining?: number;
        is_free_tier?: boolean;
        rate_limit?: {
          requests?: number;
          interval?: string;
        };
      }
    };

    // OpenRouter returns limit and usage in dollars
    const limit = data.data?.limit ?? 0;
    const usage = data.data?.usage ?? 0;
    const credits = data.data?.limit_remaining ?? (limit - usage);

    const isLow = credits < WARNING_THRESHOLD;
    const limitReached = limit > 0 && usage >= limit;

    creditLogger.info('OpenRouter credit status retrieved', {
      credits,
      limit,
      usage,
      isLow,
      limitReached,
      warningThreshold: WARNING_THRESHOLD,
      isFree: data.data?.is_free_tier
    });

    return {
      credits,
      limit,
      usage,
      isLow,
      limitReached
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    creditLogger.error('Exception fetching OpenRouter credit status', { error: errorMessage });
    return {
      credits: 0,
      limit: 0,
      usage: 0,
      isLow: true,
      limitReached: false,
      error: errorMessage
    };
  }
}

/**
 * Format credit status for display in Slack messages
 */
export function formatCreditStatusForSlack(status: CreditStatus): {
  text: string;
  emoji: string;
  color: string;
} {
  if (status.error) {
    return {
      text: `⚠️ Credit Status: Error - ${status.error}`,
      emoji: '⚠️',
      color: '#ff9800'  // Orange
    };
  }

  if (status.limitReached) {
    return {
      text: `🚨 *Credit Limit Reached!* Usage: $${status.usage.toFixed(2)} / Limit: $${status.limit.toFixed(2)}`,
      emoji: '🚨',
      color: '#dc3545'  // Red
    };
  }

  if (status.isLow) {
    return {
      text: `⚠️ *Low Credits Warning!* Remaining: $${status.credits.toFixed(2)} (below $${WARNING_THRESHOLD} threshold)`,
      emoji: '⚠️',
      color: '#ffc107'  // Yellow
    };
  }

  return {
    text: `✅ Credits: $${status.credits.toFixed(2)} remaining`,
    emoji: '✅',
    color: '#28a745'  // Green
  };
}

/**
 * Check if credits are critically low (should stop processing)
 */
export function shouldStopProcessingDueToCredits(status: CreditStatus): boolean {
  return status.limitReached || status.credits <= 0;
}

/**
 * Get warning threshold
 */
export function getCreditWarningThreshold(): number {
  return WARNING_THRESHOLD;
}

/**
 * Check if an error indicates insufficient OpenRouter credits
 */
export function isInsufficientCreditsError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === ErrorCode.AI_INSUFFICIENT_CREDITS;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('402') ||
           message.includes('payment required') ||
           message.includes('insufficient credits') ||
           message.includes('credit limit') ||
           message.includes('out of credits') ||
           message.includes('no credits');
  }

  return false;
}

/**
 * Send Slack alert for insufficient credits
 * Posts to the pipeline-monitor channel
 */
export async function sendInsufficientCreditsAlert(
  error: Error,
  context?: {
    userId?: string;
    operation?: string;
    filingId?: string;
  }
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.SLACK_ALERTS_WEBHOOK_URL;

  if (!webhookUrl) {
    creditLogger.warn('No Slack webhook configured, cannot send insufficient credits alert');
    return;
  }

  try {
    // Fetch current credit status for additional context
    const creditStatus = await getOpenRouterCreditStatus();

    const payload = {
      text: '🚨 *CRITICAL: OpenRouter Credits Exhausted*',
      attachments: [
        {
          color: '#dc3545',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*AI Processing Halted - No Credits Available*\n\nThe OpenRouter API has returned a payment required error. All AI summarization operations are currently failing.'
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Error:*\n\`${error.message.substring(0, 200)}\``
                },
                {
                  type: 'mrkdwn',
                  text: `*Credit Status:*\n${creditStatus.error ? 'Unable to fetch' : `$${creditStatus.credits.toFixed(2)} remaining`}`
                },
                ...(context?.userId ? [{
                  type: 'mrkdwn',
                  text: `*User:*\n${context.userId}`
                }] : []),
                ...(context?.operation ? [{
                  type: 'mrkdwn',
                  text: `*Operation:*\n${context.operation}`
                }] : [])
              ]
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Required Action:*\n1. Add credits to OpenRouter account: https://openrouter.ai/credits\n2. Verify credit limit settings\n3. Processing will resume automatically once credits are available'
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `⏰ ${new Date().toISOString()}`
                }
              ]
            }
          ]
        }
      ]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      creditLogger.error('Failed to send insufficient credits alert to Slack', {
        status: response.status,
        statusText: response.statusText
      });
    } else {
      creditLogger.info('Insufficient credits alert sent to Slack');
    }
  } catch (alertError) {
    creditLogger.error('Exception sending insufficient credits alert', {
      error: alertError instanceof Error ? alertError.message : 'Unknown error'
    });
  }
}

/**
 * Handle an insufficient credits error - logs and sends alert
 * Call this when catching an AI error to check if it's a credit issue
 */
export async function handlePotentialCreditError(
  error: unknown,
  context?: {
    userId?: string;
    operation?: string;
    filingId?: string;
  }
): Promise<boolean> {
  if (!isInsufficientCreditsError(error)) {
    return false;
  }

  creditLogger.error('🚨 Insufficient OpenRouter credits detected', {
    error: error instanceof Error ? error.message : String(error),
    ...context
  });

  // Send Slack alert
  await sendInsufficientCreditsAlert(
    error instanceof Error ? error : new Error(String(error)),
    context
  );

  return true;
}
