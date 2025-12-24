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
  JobProcessingResult,
  JobType,
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
// Daily Summary Message - Enhanced to match verify-daily-pipeline.ts output
// =============================================================================

/**
 * Format a number with commas for thousands
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Get status emoji for filing status
 */
function _getStatusEmoji(status: 'COMPLETE' | 'PENDING' | 'FAILED'): string {
  switch (status) {
    case 'COMPLETE': return ':white_check_mark:';
    case 'PENDING': return ':hourglass_flowing_sand:';
    case 'FAILED': return ':x:';
  }
}

/**
 * Get checkmark or X for boolean status
 */
function _getBoolEmoji(value: boolean): string {
  return value ? ':white_check_mark:' : ':x:';
}

export function formatDailySummaryMessage(
  date: string,
  metrics: DailySummaryMetrics
): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // ══════════════════════════════════════════════════════════════════════
  // Header with double lines like the CLI output
  // ══════════════════════════════════════════════════════════════════════
  blocks.push(header(`:bar_chart: DAILY PIPELINE VERIFICATION REPORT`));
  blocks.push(divider());

  // Generated timestamp and verification date
  const generatedAt = formatTimestamp();
  blocks.push(
    context([
      `*Generated:* ${generatedAt}`,
      `*Verification Date:* ${date}`,
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

    // Build pipeline breakdown as code block
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

  // Completion rate with visual indicator
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
  // AI COSTS Section
  // ══════════════════════════════════════════════════════════════════════
  if (metrics.costs.total > 0 || (metrics.costs.totalTokens && metrics.costs.totalTokens > 0)) {
    blocks.push(divider());
    blocks.push(section(`:moneybag: *AI COSTS (OpenRouter)*`));

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

    // Model breakdown
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

  // ══════════════════════════════════════════════════════════════════════
  // CACHE HEALTH Section
  // ══════════════════════════════════════════════════════════════════════
  if (metrics.cacheHealth) {
    blocks.push(divider());
    blocks.push(section(`:floppy_disk: *CACHE HEALTH REPORT*`));

    const cacheSuccessPct = metrics.cacheHealth.totalEntries > 0
      ? ((metrics.cacheHealth.successfulCaches / metrics.cacheHealth.totalEntries) * 100).toFixed(1)
      : '100.0';

    blocks.push(section(
      `*Total cache entries:* ${metrics.cacheHealth.totalEntries}\n` +
      `*Successful caches:* ${metrics.cacheHealth.successfulCaches} (${cacheSuccessPct}%)\n` +
      `*Avg fetch duration:* ${metrics.cacheHealth.avgFetchDurationMs}ms`
    ));
  }

  // ══════════════════════════════════════════════════════════════════════
  // REMEDIATION Section (if any)
  // ══════════════════════════════════════════════════════════════════════
  if (metrics.remediation && metrics.remediation.attempted > 0) {
    blocks.push(divider());
    blocks.push(section(`:hammer_and_wrench: *REMEDIATION RESULTS*`));
    blocks.push(section(
      `*Attempted:* ${metrics.remediation.attempted}\n` +
      `*Succeeded:* ${metrics.remediation.succeeded}\n` +
      `*Failed:* ${metrics.remediation.failed}`
    ));
  }

  // Fallback text for notifications
  const fallbackText = `📊 Daily Pipeline Report (${date}) - ${completed}/${totalFilings} complete (${completedPct}%), ${metrics.email.sent} emails sent, $${metrics.costs.total.toFixed(4)} AI cost`;

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}

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

// =============================================================================
// Job Processing Message (for process-filing-queue notifications)
// =============================================================================

function getJobTypeEmoji(jobType: JobType): string {
  switch (jobType) {
    case 'ASYNC_DISCOVER_FILINGS':
      return ':mag:';
    case 'ASYNC_FETCH_FILING':
      return ':link:';
    case 'ASYNC_SUMMARIZE_CACHED':
      return ':brain:';
    default:
      return ':gear:';
  }
}

function getJobTypeLabel(jobType: JobType): string {
  switch (jobType) {
    case 'ASYNC_DISCOVER_FILINGS':
      return 'Discovery';
    case 'ASYNC_FETCH_FILING':
      return 'Fetch';
    case 'ASYNC_SUMMARIZE_CACHED':
      return 'Summarize';
    default:
      return jobType;
  }
}

/**
 * Format token cost for display
 */
function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

/**
 * Format token count for display
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

export function formatJobProcessingMessage(
  result: JobProcessingResult
): SlackWebhookPayload {
  const blocks: SlackBlock[] = [];

  // Skip notification if no jobs were processed
  if (result.jobs.total === 0) {
    return {
      text: '',
      blocks: [],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  // Count successful and failed
  const successful = result.jobs.processed.filter(j => j.success).length;
  const failed = result.jobs.processed.filter(j => !j.success).length;
  const pipeline = result.pipeline;

  // Header with success/failure indicator
  const headerEmoji = failed === 0 ? ':white_check_mark:' : failed === result.jobs.total ? ':x:' : ':warning:';
  blocks.push(header(`${headerEmoji} Jobs Processed`));
  blocks.push(divider());

  // Timing context
  blocks.push(
    context([
      `:stopwatch: Duration: *${formatDuration(result.duration)}*`,
      `:clock1: ${formatTimestamp()}`,
    ])
  );

  // Summary section
  const summaryParts = [
    `:white_check_mark: ${successful} successful`,
    `:x: ${failed} failed`,
  ];
  blocks.push(section(`*Total:* ${result.jobs.total} jobs\n${summaryParts.join(' | ')}`));

  // Pipeline metrics section (if available)
  if (pipeline) {
    blocks.push(divider());

    // Unique entities overview
    const entityParts: string[] = [];
    if (pipeline.uniqueTickers.length > 0) {
      entityParts.push(`:chart_with_upwards_trend: *Tickers:* ${pipeline.uniqueTickers.length} (${pipeline.uniqueTickers.join(', ')})`);
    }
    if (pipeline.uniqueFormTypes.length > 0) {
      entityParts.push(`:page_facing_up: *Form Types:* ${pipeline.uniqueFormTypes.join(', ')}`);
    }
    if (entityParts.length > 0) {
      blocks.push(section(entityParts.join('\n')));
    }

    // Pipeline flow visualization (Discovery → Fetch → Summarize → Email)
    const flowParts: string[] = [':arrow_right: *Pipeline Flow*'];

    // Discovery phase
    if (pipeline.discovery.jobsRun > 0) {
      flowParts.push(
        `  :mag: *Discovery:* ${pipeline.discovery.filingsDiscovered} filings → ${pipeline.discovery.fetchJobsQueued} fetch jobs queued`
      );
      if (pipeline.discovery.eligibleUsers > 0) {
        flowParts.push(`    • ${pipeline.discovery.eligibleUsers} users, ${pipeline.discovery.uniqueTickers} tickers`);
      }
    }

    // Fetch phase
    if (pipeline.fetch.jobsRun > 0) {
      const cacheInfo = pipeline.fetch.cacheHits > 0
        ? ` (${pipeline.fetch.cacheHits} cache hits)`
        : '';
      flowParts.push(
        `  :link: *Fetch:* ${pipeline.fetch.contentsFetched} contents${cacheInfo} → ${pipeline.fetch.summarizeJobsQueued} summarize jobs queued`
      );
    }

    // Summarize phase
    if (pipeline.summarize.jobsRun > 0) {
      flowParts.push(
        `  :brain: *Summarize:* ${pipeline.summarize.summariesGenerated} summaries → ${pipeline.summarize.emailsSent} emails sent`
      );
    }

    if (flowParts.length > 1) {
      blocks.push(section(flowParts.join('\n')));
    }

    // AI Cost breakdown (if any summarization happened)
    if (pipeline.summarize.totalCost > 0 || pipeline.summarize.totalInputTokens > 0) {
      const costParts: string[] = [':moneybag: *AI Usage*'];
      costParts.push(`  • Cost: *${formatCost(pipeline.summarize.totalCost)}*`);
      costParts.push(`  • Tokens: ${formatTokens(pipeline.summarize.totalInputTokens)} in / ${formatTokens(pipeline.summarize.totalOutputTokens)} out`);
      blocks.push(section(costParts.join('\n')));
    }

    // Users and Emails summary
    if (pipeline.summarize.emailsSent > 0) {
      blocks.push(
        context([
          `:email: *${pipeline.summarize.emailsSent}* emails sent to subscribers`
        ])
      );
    }
  }

  // Breakdown by job type (condensed if we have pipeline metrics)
  const jobTypes = Object.keys(result.jobs.byType) as JobType[];
  if (jobTypes.length > 0 && !pipeline) {
    // Only show detailed breakdown if no pipeline metrics
    const typeBreakdown: string[] = [];
    for (const jobType of jobTypes) {
      const stats = result.jobs.byType[jobType];
      if (stats.total > 0) {
        const emoji = getJobTypeEmoji(jobType);
        const label = getJobTypeLabel(jobType);
        const avgTime = formatDuration(stats.averageTimeMs);
        typeBreakdown.push(
          `${emoji} *${label}*: ${stats.successful}/${stats.total} (avg ${avgTime})`
        );
      }
    }
    if (typeBreakdown.length > 0) {
      blocks.push(section(typeBreakdown.join('\n')));
    }
  } else if (jobTypes.length > 0) {
    // Condensed timing info when we have pipeline metrics
    const timingParts: string[] = [];
    for (const jobType of jobTypes) {
      const stats = result.jobs.byType[jobType];
      if (stats.total > 0) {
        const label = getJobTypeLabel(jobType);
        const avgTime = formatDuration(stats.averageTimeMs);
        timingParts.push(`${label}: avg ${avgTime}`);
      }
    }
    if (timingParts.length > 0) {
      blocks.push(context([`:clock2: ${timingParts.join(' | ')}`]));
    }
  }

  // Show any errors
  const errors = result.jobs.processed.filter(j => !j.success && j.error);
  if (errors.length > 0) {
    blocks.push(divider());
    const errorDetails = errors.slice(0, 3).map(job => {
      const ticker = job.ticker || 'Unknown';
      const label = getJobTypeLabel(job.jobType);
      return `• *${ticker}* (${label}): ${job.error?.substring(0, 100)}`;
    }).join('\n');
    blocks.push(section(`:x: *Errors*\n${errorDetails}`));
  }

  // Recovered jobs (if any)
  if (result.recoveredStaleJobs > 0) {
    blocks.push(
      context([`:recycle: Recovered ${result.recoveredStaleJobs} stale jobs`])
    );
  }

  // Fallback text with key metrics
  let fallbackText = `Jobs Processed: ${successful}/${result.jobs.total} successful`;
  if (failed > 0) fallbackText += ` (${failed} failed)`;
  if (pipeline) {
    if (pipeline.uniqueTickers.length > 0) {
      fallbackText += ` | Tickers: ${pipeline.uniqueTickers.join(', ')}`;
    }
    if (pipeline.summarize.emailsSent > 0) {
      fallbackText += ` | Emails: ${pipeline.summarize.emailsSent}`;
    }
    if (pipeline.summarize.totalCost > 0) {
      fallbackText += ` | Cost: ${formatCost(pipeline.summarize.totalCost)}`;
    }
  }

  return {
    text: fallbackText,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}
