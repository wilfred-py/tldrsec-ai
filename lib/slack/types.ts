/**
 * Slack Pipeline Monitor Types
 *
 * TypeScript interfaces for Slack webhook messages, cron results,
 * and alert configurations for the pipeline monitoring bot.
 */

import type { QueueMetrics } from '../cron/queue-monitoring';

// =============================================================================
// Cron Results Types (from tier-aware cron endpoint)
// =============================================================================

export interface FilingMonitoringResults {
  tickersChecked: number;
  newFilingsFound: number;
  errors: number;
}

export interface BacklogQueueingResults {
  unprocessedFound: number;
  backlogQueued: number;
}

export interface CronQueueStatus {
  filingsQueued: number;
  userFilingsQueued: number;
  totalQueued: number;
  queueDepth: number;
  estimatedCompletionMinutes: number;
  healthy: boolean;
}

export interface QueueHealthStatus {
  healthy: boolean;
  issues: string[];
  metrics: QueueMetrics;
}

/**
 * Complete cron execution result used for Slack notifications
 */
export interface CronExecutionResult {
  success: boolean;
  executionId: string;
  duration: number;
  processingMode: 'async' | 'sync';
  message: string;
  queue: CronQueueStatus;
  results: {
    filingMonitoring: FilingMonitoringResults;
    backlogQueueing: BacklogQueueingResults;
  };
}

// =============================================================================
// Alert Types
// =============================================================================

export type AlertSeverity = 'warning' | 'critical';

export interface AlertRule {
  id: string;
  name: string;
  condition: (result: CronExecutionResult, health: QueueHealthStatus) => boolean;
  severity: AlertSeverity;
  message: (result: CronExecutionResult, health: QueueHealthStatus) => string;
}

export interface TriggeredAlert {
  rule: AlertRule;
  triggeredAt: Date;
  result: CronExecutionResult;
  health: QueueHealthStatus;
}

// =============================================================================
// Slack Block Kit Types
// =============================================================================

export type BlockType = 'section' | 'divider' | 'context' | 'header' | 'actions';

export interface TextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

export interface SectionBlock {
  type: 'section';
  text?: TextObject;
  fields?: TextObject[];
  accessory?: ButtonElement | ImageElement;
}

export interface DividerBlock {
  type: 'divider';
}

export interface ContextBlock {
  type: 'context';
  elements: (TextObject | ImageElement)[];
}

export interface HeaderBlock {
  type: 'header';
  text: TextObject;
}

export interface ButtonElement {
  type: 'button';
  text: TextObject;
  action_id: string;
  url?: string;
  style?: 'primary' | 'danger';
}

export interface ImageElement {
  type: 'image';
  image_url: string;
  alt_text: string;
}

export interface ActionsBlock {
  type: 'actions';
  elements: ButtonElement[];
}

export type SlackBlock =
  | SectionBlock
  | DividerBlock
  | ContextBlock
  | HeaderBlock
  | ActionsBlock;

// =============================================================================
// Slack Message Types
// =============================================================================

export interface SlackWebhookPayload {
  text: string; // Fallback text for notifications
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  thread_ts?: string;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

export interface SlackAttachment {
  color?: string;
  fallback?: string;
  blocks?: SlackBlock[];
}

export interface SlackWebhookResponse {
  ok: boolean;
  error?: string;
}

// =============================================================================
// Message Types for Different Notifications
// =============================================================================

export type SlackMessageType =
  | 'cron_completion'
  | 'alert'
  | 'daily_summary'
  | 'weekly_summary'
  | 'bot_response';

export interface CronCompletionMessage {
  type: 'cron_completion';
  result: CronExecutionResult;
  health: QueueHealthStatus;
  timestamp: Date;
}

export interface AlertMessage {
  type: 'alert';
  alerts: TriggeredAlert[];
  result: CronExecutionResult;
  health: QueueHealthStatus;
  timestamp: Date;
}

export interface DailySummaryMessage {
  type: 'daily_summary';
  date: string;
  metrics: DailySummaryMetrics;
  timestamp: Date;
}

export interface DailySummaryMetrics {
  completionRate: number;
  discovery: {
    filingsDiscovered: number;
    tickersChecked: number;
  };
  fetch: {
    completed: number;
    failed: number;
  };
  summarize: {
    completed: number;
    failed: number;
    cached: number;
  };
  email: {
    sent: number;
    recipients: number;
  };
  costs: {
    total: number;
    model: string;
  };
  remediation?: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
}

// =============================================================================
// Bot Conversation Types
// =============================================================================

export type ConversationIntent =
  | 'help'
  | 'status'
  | 'daily_report'
  | 'weekly_report'
  | 'failures'
  | 'costs'
  | 'trends'
  | 'unknown';

export interface ParsedMention {
  text: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  intent: ConversationIntent;
  parameters?: Record<string, string>;
}

export interface BotResponse {
  type: 'bot_response';
  intent: ConversationIntent;
  blocks: SlackBlock[];
  text: string;
}

// =============================================================================
// Slack Event Types (for @mention handling)
// =============================================================================

export interface SlackEventPayload {
  type: 'url_verification' | 'event_callback';
  challenge?: string;
  token?: string;
  team_id?: string;
  event?: SlackEvent;
}

export interface SlackEvent {
  type: 'app_mention' | 'message';
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  event_ts: string;
}

export interface SlackUrlVerification {
  type: 'url_verification';
  challenge: string;
  token: string;
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface SlackConfig {
  webhookUrl: string;
  alertsWebhookUrl?: string;
  botToken?: string;
  signingSecret?: string;
  channelId?: string;
}

export interface WebhookServiceConfig {
  webhookUrl: string;
  alertsWebhookUrl?: string;
  rateLimitMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

// =============================================================================
// Alert Deduplication
// =============================================================================

export interface AlertDeduplicationEntry {
  ruleId: string;
  lastTriggered: Date;
  count: number;
}

export interface AlertDeduplicationWindow {
  windowMs: number;
  maxAlerts: number;
}
