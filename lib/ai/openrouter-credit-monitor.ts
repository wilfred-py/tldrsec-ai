/**
 * OpenRouter Credit Monitor
 *
 * Fetches OpenRouter API credit status and renders it for the daily Slack
 * report. The only production caller is `lib/slack/daily-report-handler.ts`.
 *
 * See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md
 */

import { logger } from '../logging';

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
