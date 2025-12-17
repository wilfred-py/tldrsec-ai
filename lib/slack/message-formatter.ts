/**
 * Slack Message Formatter
 *
 * Creates rich Block Kit messages for pipeline monitoring notifications.
 * Handles cron completion, alerts, and daily summary formatting.
 */

import type {
  SlackBlock,
  SlackWebhookPayload,
  CronExecutionResult,
  QueueHealthStatus,
  TriggeredAlert,
  DailySummaryMetrics,
  AlertSeverity,
  TextObject,
  SectionBlock,
  HeaderBlock,
  ContextBlock,
  DividerBlock,
} from './types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a markdown text object for Slack Block Kit
 * @param text - The markdown-formatted text content
 * @returns TextObject with markdown formatting
 */
function mrkdwn(text: string): TextObject {
  return { type: 'mrkdwn', text };
}

/**
 * Creates a plain text object for Slack Block Kit
 * @param text - The plain text content
 * @param emoji - Whether to parse emoji (default: true)
 * @returns TextObject with plain text formatting
 */
function plainText(text: string, emoji = true): TextObject {
  return { type: 'plain_text', text, emoji };
}

/**
 * Creates a header block for Slack messages
 * @param text - The header text content
 * @returns HeaderBlock for use in Slack Block Kit
 */
function header(text: string): HeaderBlock {
  return { type: 'header', text: plainText(text) };
}

/**
 * Creates a section block with optional fields for Slack messages
 * @param text - The main section text content (markdown supported)
 * @param fields - Optional array of field strings for side-by-side display
 * @returns SectionBlock for use in Slack Block Kit
 */
function section(text: string, fields?: string[]): SectionBlock {
  const block: SectionBlock = { type: 'section', text: mrkdwn(text) };
  if (fields) {
    block.fields = fields.map(f => mrkdwn(f));
  }
  return block;
}

function divider(): DividerBlock {
  return { type: 'divider' };
}

function context(texts: string[]): ContextBlock {
  return {
    type: 'context',
    elements: texts.map(t => mrkdwn(t)),
  };
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' AEDT';
}

function getSeverityEmoji(severity: AlertSeverity): string {
  return severity === 'critical' ? ':rotating_light:' : ':warning:';
}

// =============================================================================
// Cron Completion Message
// =============================================================================

export function formatCronCompletionMessage(
  result: CronExecutionResult,
  health: QueueHealthStatus
): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(header(':bar_chart: Pipeline Cron Completed'));
  blocks.push(divider());

  // Timing info
  blocks.push(
    context([
      `:stopwatch: Duration: *${formatDuration(result.duration)}*`,
      `:clock1: ${formatTimestamp()}`,
    ])
  );

  // Discovery section
  const discoveryText = [
    ':inbox_tray: *Discovery*',
    `• Tickers checked: ${result.results.filingMonitoring.tickersChecked}`,
    `• New filings found: ${result.results.filingMonitoring.newFilingsFound}`,
  ];
  if (result.results.filingMonitoring.errors > 0) {
    discoveryText.push(`:x: Errors: ${result.results.filingMonitoring.errors}`);
  }
  blocks.push(section(discoveryText.join('\n')));

  // Queue status section
  const queueEmoji = health.healthy ? ':package:' : ':warning:';
  const queueText = [
    `${queueEmoji} *Queue Status*`,
    `• Pending: ${health.metrics.pendingJobs} jobs`,
    `• Processing: ${health.metrics.processingJobs} jobs`,
    `• Completed (24h): ${health.metrics.completedLast24h} jobs`,
  ];
  if (health.metrics.failedLast24h > 0) {
    queueText.push(`:x: Failed (24h): ${health.metrics.failedLast24h} jobs`);
  }
  if (result.results.backlogQueueing.backlogQueued > 0) {
    queueText.push(`:arrow_right: Newly queued: ${result.results.backlogQueueing.backlogQueued} jobs`);
  }
  blocks.push(section(queueText.join('\n')));

  // Health status
  if (health.healthy) {
    blocks.push(section(':white_check_mark: No alerts'));
  } else {
    const issuesText = health.issues.map(i => `• ${i}`).join('\n');
    blocks.push(section(`:warning: *Issues Detected*\n${issuesText}`));
  }

  // Fallback text for notifications
  const fallbackText = `Pipeline Cron Completed - ${result.results.filingMonitoring.newFilingsFound} new filings, ${health.metrics.queueDepth} queued`;

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}

// =============================================================================
// Alert Message
// =============================================================================

export function formatAlertMessage(
  alerts: TriggeredAlert[],
  result: CronExecutionResult,
  health: QueueHealthStatus
): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // Determine highest severity
  const hasCritical = alerts.some(a => a.rule.severity === 'critical');
  const severity: AlertSeverity = hasCritical ? 'critical' : 'warning';
  const severityEmoji = getSeverityEmoji(severity);
  const severityText = severity === 'critical' ? 'Critical' : 'Warning';

  // Header
  blocks.push(header(`${severityEmoji} Pipeline Alert - ${severityText}`));
  blocks.push(divider());

  // Alert details
  for (const alert of alerts) {
    const alertEmoji = getSeverityEmoji(alert.rule.severity);
    const message = alert.rule.message(result, health);
    blocks.push(section(`${alertEmoji} *${alert.rule.name}*\n${message}`));
  }

  blocks.push(divider());

  // Queue context
  const queueContext = [
    `Queue depth: ${health.metrics.queueDepth}`,
    `Pending: ${health.metrics.pendingJobs}`,
    `Failed (24h): ${health.metrics.failedLast24h}`,
  ];
  blocks.push(context(queueContext));

  // Timestamp
  blocks.push(context([`:clock1: ${formatTimestamp()}`]));

  // Fallback text
  const alertMessages = alerts.map(a => a.rule.message(result, health)).join('; ');
  const fallbackText = `Pipeline Alert [${severityText}]: ${alertMessages}`;

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}

// =============================================================================
// Daily Summary Message
// =============================================================================

export function formatDailySummaryMessage(
  date: string,
  metrics: DailySummaryMetrics
): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(header(`:bar_chart: Daily Pipeline Report - ${date}`));
  blocks.push(divider());

  // Completion rate with visual indicator
  const completionEmoji = metrics.completionRate >= 95
    ? ':white_check_mark:'
    : metrics.completionRate >= 80
    ? ':warning:'
    : ':x:';
  blocks.push(
    section(`${completionEmoji} *Completion Rate: ${metrics.completionRate.toFixed(1)}%*`)
  );

  blocks.push(divider());

  // Phase breakdown
  blocks.push(section('*Phase Breakdown*'));

  // Discovery
  blocks.push(
    section(
      `:inbox_tray: *Discovery*: ${metrics.discovery.filingsDiscovered} filings (${metrics.discovery.tickersChecked} tickers checked)`
    )
  );

  // Fetch
  const fetchTotal = metrics.fetch.completed + metrics.fetch.failed;
  const fetchText = fetchTotal > 0
    ? `:white_check_mark: ${metrics.fetch.completed} | :x: ${metrics.fetch.failed}`
    : 'No fetch operations';
  blocks.push(section(`:link: *Fetch*: ${fetchText}`));

  // Summarize
  const summarizeTotal = metrics.summarize.completed + metrics.summarize.failed;
  let summarizeText = summarizeTotal > 0
    ? `:white_check_mark: ${metrics.summarize.completed} | :x: ${metrics.summarize.failed}`
    : 'No summarizations';
  if (metrics.summarize.cached > 0) {
    summarizeText += ` | :floppy_disk: ${metrics.summarize.cached} cached`;
  }
  blocks.push(section(`:brain: *Summarize*: ${summarizeText}`));

  // Email
  blocks.push(
    section(
      `:email: *Email*: ${metrics.email.sent} sent to ${metrics.email.recipients} users`
    )
  );

  blocks.push(divider());

  // Cache performance (if applicable)
  if (metrics.summarize.cached > 0) {
    const cacheRate = (metrics.summarize.cached / (metrics.summarize.completed + metrics.summarize.cached)) * 100;
    blocks.push(
      section(
        `:floppy_disk: *Cache Performance*\n• Cache hits: ${metrics.summarize.cached} (${cacheRate.toFixed(0)}%)`
      )
    );
  }

  // AI Costs
  if (metrics.costs.total > 0) {
    blocks.push(
      section(
        `:moneybag: *AI Costs*\n• Total: $${metrics.costs.total.toFixed(4)}\n• Model: ${metrics.costs.model}`
      )
    );
  }

  // Remediation (if any)
  if (metrics.remediation && metrics.remediation.attempted > 0) {
    blocks.push(divider());
    blocks.push(
      section(
        `:hammer_and_wrench: *Remediation*\n• Attempted: ${metrics.remediation.attempted}\n• Succeeded: ${metrics.remediation.succeeded}\n• Failed: ${metrics.remediation.failed}`
      )
    );
  }

  // Timestamp
  blocks.push(context([`:clock1: Generated at ${formatTimestamp()}`]));

  // Fallback text
  const fallbackText = `Daily Pipeline Report (${date}) - Completion: ${metrics.completionRate.toFixed(1)}%, Filings: ${metrics.discovery.filingsDiscovered}, Emails: ${metrics.email.sent}`;

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}

// =============================================================================
// Status Response (for @mention queries)
// =============================================================================

export function formatStatusMessage(health: QueueHealthStatus): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // Header
  const statusEmoji = health.healthy ? ':white_check_mark:' : ':warning:';
  blocks.push(header(`${statusEmoji} Pipeline Status`));
  blocks.push(divider());

  // Queue metrics
  blocks.push(section('*Queue Metrics*', [
    `Pending: *${health.metrics.pendingJobs}*`,
    `Processing: *${health.metrics.processingJobs}*`,
    `Completed (24h): *${health.metrics.completedLast24h}*`,
    `Failed (24h): *${health.metrics.failedLast24h}*`,
  ]));

  // Processing time
  blocks.push(
    section(
      `:clock1: Avg processing time: *${health.metrics.averageProcessingTime.toFixed(1)}s*\n` +
      `:hourglass: Est. completion: *${health.metrics.estimatedProcessingTime.toFixed(0)} min*`
    )
  );

  // Health status
  if (health.healthy) {
    blocks.push(section(':white_check_mark: *All systems healthy*'));
  } else {
    const issuesText = health.issues.map(i => `• ${i}`).join('\n');
    blocks.push(section(`:warning: *Issues*\n${issuesText}`));
  }

  // Oldest pending job
  if (health.metrics.oldestPendingJob) {
    const ageMinutes = Math.round(
      (Date.now() - health.metrics.oldestPendingJob.getTime()) / 60000
    );
    blocks.push(
      context([`Oldest pending job: ${ageMinutes} minutes ago`])
    );
  }

  // Fallback text
  const fallbackText = health.healthy
    ? `Pipeline healthy - ${health.metrics.queueDepth} jobs in queue`
    : `Pipeline issues: ${health.issues.join(', ')}`;

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}

// =============================================================================
// Help Response (for @mention)
// =============================================================================

export function formatHelpMessage(): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  blocks.push(header(':wave: Pipeline Monitor Bot'));
  blocks.push(divider());

  blocks.push(section(
    '*Available Commands*\n' +
    'Mention me with any of these:\n\n' +
    ':question: *help* - Show this message\n' +
    ':bar_chart: *status* - Current pipeline status\n' +
    ':calendar: *daily report* - Yesterday\'s full report\n' +
    ':date: *report YYYY-MM-DD* - Report for specific date\n' +
    ':x: *failures* - Recent failure details\n' +
    ':moneybag: *costs* - AI cost breakdown\n' +
    ':chart_with_upwards_trend: *trends* - Weekly trends'
  ));

  blocks.push(divider());
  blocks.push(context(['Tip: I also post automatic updates after each cron run']));

  return {
    text: 'Pipeline Monitor Bot - Use @pipeline-monitor help for commands',
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}

// =============================================================================
// Error Response
// =============================================================================

export function formatErrorMessage(error: string): SlackWebhookPayload {
  return {
    text: `Error: ${error}`,
    blocks: [
      section(`:x: *Error*\n${error}`),
      context([`If this persists, check the logs or contact support.`]),
    ],
    unfurl_links: false,
    unfurl_media: false,
  };
}
