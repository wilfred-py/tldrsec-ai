/**
 * Slack Webhook Service
 *
 * Singleton service for posting pipeline monitoring messages to Slack
 * via Incoming Webhooks. Handles rate limiting, retries, and error handling.
 */

import { logger } from '../logging';
import type {
  SlackWebhookPayload,
  SlackWebhookResponse,
  CronExecutionResult,
  QueueHealthStatus,
  TriggeredAlert,
  WebhookServiceConfig,
  AlertDeduplicationEntry,
  JobProcessingResult,
} from './types';
import {
  formatCronCompletionMessage,
  formatAlertMessage,
  formatDailySummaryMessage,
  formatStatusMessage,
  formatErrorMessage,
  formatJobProcessingMessage,
} from './message-formatter';
import type { DailySummaryMetrics } from './types';

const slackLogger = logger.child('slack-webhook');

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG: Omit<WebhookServiceConfig, 'webhookUrl'> = {
  rateLimitMs: 1000, // Slack allows 1 msg/sec per webhook
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// Alert deduplication window (15 minutes)
const ALERT_DEDUP_WINDOW_MS = 15 * 60 * 1000;

// =============================================================================
// Webhook Service Class
// =============================================================================

class SlackWebhookService {
  private config: WebhookServiceConfig | null = null;
  private lastMessageTime = 0;
  private alertDeduplication: Map<string, AlertDeduplicationEntry> = new Map();

  /**
   * Initialize the service with configuration
   */
  initialize(): void {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    const alertsWebhookUrl = process.env.SLACK_ALERTS_WEBHOOK_URL;

    if (!webhookUrl) {
      slackLogger.warn('SLACK_WEBHOOK_URL not configured - Slack notifications disabled');
      return;
    }

    this.config = {
      webhookUrl,
      alertsWebhookUrl,
      ...DEFAULT_CONFIG,
    };

    slackLogger.info('Slack webhook service initialized');
  }

  /**
   * Check if the service is configured and ready
   */
  isConfigured(): boolean {
    if (!this.config) {
      this.initialize();
    }
    return this.config !== null;
  }

  /**
   * Post a message to Slack webhook
   */
  private async postToWebhook(
    payload: SlackWebhookPayload,
    webhookUrl: string
  ): Promise<SlackWebhookResponse> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    if (timeSinceLastMessage < (this.config?.rateLimitMs || DEFAULT_CONFIG.rateLimitMs)) {
      const delay = (this.config?.rateLimitMs || DEFAULT_CONFIG.rateLimitMs) - timeSinceLastMessage;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    let lastError: Error | null = null;
    const maxAttempts = this.config?.retryAttempts || DEFAULT_CONFIG.retryAttempts;
    const retryDelay = this.config?.retryDelayMs || DEFAULT_CONFIG.retryDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        this.lastMessageTime = Date.now();

        if (response.ok) {
          const text = await response.text();
          return { ok: true, error: text === 'ok' ? undefined : text };
        }

        const errorText = await response.text();
        lastError = new Error(`Slack webhook returned ${response.status}: ${errorText}`);

        // Don't retry on 4xx errors (except 429 rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          break;
        }

        slackLogger.warn(`Slack webhook attempt ${attempt} failed`, {
          status: response.status,
          error: errorText,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        slackLogger.warn(`Slack webhook attempt ${attempt} error`, {
          error: lastError.message,
        });
      }

      // Wait before retry
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }

    slackLogger.error('Slack webhook failed after all retries', {
      error: lastError?.message,
    });

    return { ok: false, error: lastError?.message };
  }

  /**
   * Check if an alert should be deduplicated
   */
  private shouldDeduplicateAlert(ruleId: string): boolean {
    const entry = this.alertDeduplication.get(ruleId);
    if (!entry) return false;

    const timeSinceLastAlert = Date.now() - entry.lastTriggered.getTime();
    return timeSinceLastAlert < ALERT_DEDUP_WINDOW_MS;
  }

  /**
   * Record an alert for deduplication
   */
  private recordAlertTriggered(ruleId: string): void {
    const existing = this.alertDeduplication.get(ruleId);
    this.alertDeduplication.set(ruleId, {
      ruleId,
      lastTriggered: new Date(),
      count: (existing?.count || 0) + 1,
    });
  }

  /**
   * Clean up old deduplication entries
   */
  private cleanupDeduplication(): void {
    const now = Date.now();
    for (const [ruleId, entry] of this.alertDeduplication) {
      if (now - entry.lastTriggered.getTime() > ALERT_DEDUP_WINDOW_MS * 2) {
        this.alertDeduplication.delete(ruleId);
      }
    }
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Post cron execution results to Slack
   */
  async postCronResults(
    result: CronExecutionResult,
    health: QueueHealthStatus
  ): Promise<void> {
    if (!this.isConfigured() || !this.config) {
      slackLogger.debug('Slack not configured, skipping cron results post');
      return;
    }

    try {
      const payload = formatCronCompletionMessage(result, health);
      const response = await this.postToWebhook(payload, this.config.webhookUrl);

      if (response.ok) {
        slackLogger.debug('Posted cron results to Slack', {
          executionId: result.executionId,
          newFilings: result.results.filingMonitoring.newFilingsFound,
        });
      } else {
        slackLogger.warn('Failed to post cron results to Slack', {
          error: response.error,
        });
      }
    } catch (error) {
      slackLogger.error('Error posting cron results to Slack', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Post alerts to Slack (with deduplication)
   */
  async postAlerts(
    alerts: TriggeredAlert[],
    result: CronExecutionResult,
    health: QueueHealthStatus
  ): Promise<void> {
    if (!this.isConfigured() || !this.config) {
      slackLogger.debug('Slack not configured, skipping alerts post');
      return;
    }

    // Clean up old entries periodically
    this.cleanupDeduplication();

    // Filter out deduplicated alerts
    const newAlerts = alerts.filter(alert => {
      if (this.shouldDeduplicateAlert(alert.rule.id)) {
        slackLogger.debug('Deduplicating alert', { ruleId: alert.rule.id });
        return false;
      }
      this.recordAlertTriggered(alert.rule.id);
      return true;
    });

    if (newAlerts.length === 0) {
      slackLogger.debug('All alerts deduplicated, skipping post');
      return;
    }

    try {
      const payload = formatAlertMessage(newAlerts, result, health);
      const webhookUrl = this.config.alertsWebhookUrl || this.config.webhookUrl;
      const response = await this.postToWebhook(payload, webhookUrl);

      if (response.ok) {
        slackLogger.info('Posted alerts to Slack', {
          alertCount: newAlerts.length,
          rules: newAlerts.map(a => a.rule.id),
        });
      } else {
        slackLogger.warn('Failed to post alerts to Slack', {
          error: response.error,
        });
      }
    } catch (error) {
      slackLogger.error('Error posting alerts to Slack', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Post daily summary to Slack
   */
  async postDailySummary(
    date: string,
    metrics: DailySummaryMetrics
  ): Promise<void> {
    if (!this.isConfigured() || !this.config) {
      slackLogger.debug('Slack not configured, skipping daily summary post');
      return;
    }

    try {
      const payload = formatDailySummaryMessage(date, metrics);
      const response = await this.postToWebhook(payload, this.config.webhookUrl);

      if (response.ok) {
        slackLogger.info('Posted daily summary to Slack', { date });
      } else {
        slackLogger.warn('Failed to post daily summary to Slack', {
          error: response.error,
        });
      }
    } catch (error) {
      slackLogger.error('Error posting daily summary to Slack', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Post status response to Slack (for bot responses)
   */
  async postStatus(
    health: QueueHealthStatus,
    channelOrThread?: string
  ): Promise<void> {
    if (!this.isConfigured() || !this.config) {
      return;
    }

    try {
      const payload = formatStatusMessage(health);
      if (channelOrThread) {
        payload.thread_ts = channelOrThread;
      }
      await this.postToWebhook(payload, this.config.webhookUrl);
    } catch (error) {
      slackLogger.error('Error posting status to Slack', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Post error message to Slack
   */
  async postError(errorMessage: string): Promise<void> {
    if (!this.isConfigured() || !this.config) {
      return;
    }

    try {
      const payload = formatErrorMessage(errorMessage);
      await this.postToWebhook(payload, this.config.webhookUrl);
    } catch (error) {
      slackLogger.error('Error posting error to Slack', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Post a raw payload to Slack (for custom messages)
   */
  async postRaw(payload: SlackWebhookPayload): Promise<SlackWebhookResponse> {
    if (!this.isConfigured() || !this.config) {
      return { ok: false, error: 'Slack not configured' };
    }

    return this.postToWebhook(payload, this.config.webhookUrl);
  }

  /**
   * Post job processing results to Slack
   * Called after process-filing-queue completes a batch
   */
  async postJobProcessingResults(
    result: JobProcessingResult
  ): Promise<void> {
    if (!this.isConfigured() || !this.config) {
      slackLogger.debug('Slack not configured, skipping job processing post');
      return;
    }

    // Skip notification if no jobs were processed
    if (result.jobs.total === 0) {
      slackLogger.debug('No jobs processed, skipping Slack notification');
      return;
    }

    try {
      const payload = formatJobProcessingMessage(result);

      // Double-check payload has content (formatter returns empty for 0 jobs)
      if (!payload.text && (!payload.blocks || payload.blocks.length === 0)) {
        slackLogger.debug('Empty payload, skipping Slack notification');
        return;
      }

      const response = await this.postToWebhook(payload, this.config.webhookUrl);

      if (response.ok) {
        slackLogger.debug('Posted job processing results to Slack', {
          executionId: result.executionId,
          totalJobs: result.jobs.total,
          successful: result.jobs.processed.filter(j => j.success).length,
          failed: result.jobs.processed.filter(j => !j.success).length,
        });
      } else {
        slackLogger.warn('Failed to post job processing results to Slack', {
          error: response.error,
        });
      }
    } catch (error) {
      slackLogger.error('Error posting job processing results to Slack', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const slackWebhookService = new SlackWebhookService();
