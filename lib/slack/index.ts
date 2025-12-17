/**
 * Slack Pipeline Monitor Module
 *
 * Re-exports all Slack-related functionality for easy importing.
 */

// Types
export type {
  CronExecutionResult,
  QueueHealthStatus,
  AlertRule,
  TriggeredAlert,
  AlertSeverity,
  SlackWebhookPayload,
  SlackBlock,
  SlackEventPayload,
  SlackEvent,
  ParsedMention,
  ConversationIntent,
  DailySummaryMetrics,
} from './types';

// Webhook Service
export { slackWebhookService } from './webhook-service';

// Message Formatter
export {
  formatCronCompletionMessage,
  formatAlertMessage,
  formatDailySummaryMessage,
  formatStatusMessage,
  formatHelpMessage,
  formatErrorMessage,
} from './message-formatter';

// Alert Rules
export {
  ALERT_RULES,
  evaluateAlertRules,
  hasCriticalAlerts,
  getAlertSummary,
} from './alert-rules';

// Conversation Handler
export { handleConversation } from './conversation-handler';

// Daily Report Handler
export { generateDailyReport, generateQuickMetrics } from './daily-report-handler';
