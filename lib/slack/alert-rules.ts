/**
 * Slack Alert Rules
 *
 * Defines alert conditions for the pipeline monitoring system.
 * Alerts are triggered when conditions are met after cron execution.
 */

import type {
  AlertRule,
  TriggeredAlert,
  CronExecutionResult,
  QueueHealthStatus,
} from './types';

// =============================================================================
// Alert Threshold Configuration
// =============================================================================

/**
 * Get configurable alert thresholds from environment variables with fallback defaults
 */
const getAlertThresholds = () => ({
  // Filing error thresholds
  filingErrorsWarning: parseInt(process.env.SLACK_ALERT_FILING_ERRORS_WARNING || '1', 10),
  filingErrorsCritical: parseInt(process.env.SLACK_ALERT_FILING_ERRORS_CRITICAL || '2', 10),
  
  // Queue depth thresholds
  queueDepthWarning: parseInt(process.env.SLACK_ALERT_QUEUE_DEPTH_WARNING || '10', 10),
  queueDepthCritical: parseInt(process.env.SLACK_ALERT_QUEUE_DEPTH_CRITICAL || '50', 10),
  
  // Failure rate thresholds (as percentages)
  failureRateWarning: parseFloat(process.env.SLACK_ALERT_FAILURE_RATE_WARNING || '10'),
  failureRateCritical: parseFloat(process.env.SLACK_ALERT_FAILURE_RATE_CRITICAL || '20'),
  
  // Job age thresholds (in minutes)
  staleJobsWarning: parseInt(process.env.SLACK_ALERT_STALE_JOBS_WARNING || '30', 10),
  staleJobsCritical: parseInt(process.env.SLACK_ALERT_STALE_JOBS_CRITICAL || '60', 10),
  
  // Processing time threshold (in seconds)
  slowProcessingWarning: parseInt(process.env.SLACK_ALERT_SLOW_PROCESSING_WARNING || '120', 10),
  
  // Minimum sample size for failure rate calculations
  minSampleSize: parseInt(process.env.SLACK_ALERT_MIN_SAMPLE_SIZE || '10', 10),
});

// =============================================================================
// Alert Rule Definitions
// =============================================================================

/**
 * Alert rules for pipeline monitoring
 * Rules are evaluated in order; multiple rules can trigger simultaneously
 */
export const ALERT_RULES: AlertRule[] = [
  // Critical: Multiple filing errors
  {
    id: 'filing-errors-critical',
    name: 'Filing Errors',
    severity: 'critical',
    condition: (result) => {
      const thresholds = getAlertThresholds();
      return result.results.filingMonitoring.errors >= thresholds.filingErrorsCritical;
    },
    message: (result) => {
      const thresholds = getAlertThresholds();
      return `${result.results.filingMonitoring.errors} filing errors detected during discovery (threshold: ${thresholds.filingErrorsCritical})`;
    },
  },

  // Warning: Single filing error
  {
    id: 'filing-error-warning',
    name: 'Filing Error',
    severity: 'warning',
    condition: (result) => {
      const thresholds = getAlertThresholds();
      return result.results.filingMonitoring.errors >= thresholds.filingErrorsWarning && 
             result.results.filingMonitoring.errors < thresholds.filingErrorsCritical;
    },
    message: (result) => {
      const thresholds = getAlertThresholds();
      return `${result.results.filingMonitoring.errors} filing error(s) detected during discovery (threshold: ${thresholds.filingErrorsWarning})`;
    },
  },

  // Warning: Backlog growing
  {
    id: 'backlog-growing',
    name: 'Backlog Growing',
    severity: 'warning',
    condition: (_, health) => {
      const thresholds = getAlertThresholds();
      return health.metrics.queueDepth > thresholds.queueDepthWarning && 
             health.metrics.queueDepth <= thresholds.queueDepthCritical;
    },
    message: (_, health) => {
      const thresholds = getAlertThresholds();
      return `Backlog growing: ${health.metrics.queueDepth} jobs queued (threshold: ${thresholds.queueDepthWarning})`;
    },
  },

  // Critical: Large backlog
  {
    id: 'backlog-critical',
    name: 'Critical Backlog',
    severity: 'critical',
    condition: (_, health) => {
      const thresholds = getAlertThresholds();
      return health.metrics.queueDepth > thresholds.queueDepthCritical;
    },
    message: (_, health) => {
      const thresholds = getAlertThresholds();
      return `Critical backlog: ${health.metrics.queueDepth} jobs queued (threshold: ${thresholds.queueDepthCritical})`;
    },
  },

  // Warning: High failure rate
  {
    id: 'high-failure-rate',
    name: 'High Failure Rate',
    severity: 'warning',
    condition: (_, health) => {
      const thresholds = getAlertThresholds();
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      if (total < thresholds.minSampleSize) return false; // Need minimum sample size
      const failureRate = (health.metrics.failedLast24h / total) * 100;
      return failureRate > thresholds.failureRateWarning && failureRate <= thresholds.failureRateCritical;
    },
    message: (_, health) => {
      const thresholds = getAlertThresholds();
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      const failureRate = (health.metrics.failedLast24h / total) * 100;
      return `High failure rate: ${failureRate.toFixed(1)}% (${health.metrics.failedLast24h}/${total} jobs failed in 24h, threshold: ${thresholds.failureRateWarning}%)`;
    },
  },

  // Critical: Very high failure rate
  {
    id: 'critical-failure-rate',
    name: 'Critical Failure Rate',
    severity: 'critical',
    condition: (_, health) => {
      const thresholds = getAlertThresholds();
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      if (total < thresholds.minSampleSize) return false;
      const failureRate = (health.metrics.failedLast24h / total) * 100;
      return failureRate > thresholds.failureRateCritical;
    },
    message: (_, health) => {
      const thresholds = getAlertThresholds();
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      const failureRate = (health.metrics.failedLast24h / total) * 100;
      return `Critical failure rate: ${failureRate.toFixed(1)}% (threshold: ${thresholds.failureRateCritical}%) - immediate attention required`;
    },
  },

  // Warning: Old pending jobs
  {
    id: 'stale-jobs',
    name: 'Stale Jobs',
    severity: 'warning',
    condition: (_, health) => {
      const thresholds = getAlertThresholds();
      if (!health.metrics.oldestPendingJob) return false;
      const ageMinutes = (Date.now() - health.metrics.oldestPendingJob.getTime()) / 60000;
      return ageMinutes > thresholds.staleJobsWarning && ageMinutes <= thresholds.staleJobsCritical;
    },
    message: (_, health) => {
      const thresholds = getAlertThresholds();
      const ageMinutes = Math.round(
        (Date.now() - health.metrics.oldestPendingJob!.getTime()) / 60000
      );
      return `Jobs stuck in queue: oldest pending job is ${ageMinutes} minutes old (threshold: ${thresholds.staleJobsWarning} min)`;
    },
  },

  // Critical: Very old pending jobs
  {
    id: 'stale-jobs-critical',
    name: 'Jobs Stuck',
    severity: 'critical',
    condition: (_, health) => {
      const thresholds = getAlertThresholds();
      if (!health.metrics.oldestPendingJob) return false;
      const ageMinutes = (Date.now() - health.metrics.oldestPendingJob.getTime()) / 60000;
      return ageMinutes > thresholds.staleJobsCritical;
    },
    message: (_, health) => {
      const thresholds = getAlertThresholds();
      const ageMinutes = Math.round(
        (Date.now() - health.metrics.oldestPendingJob!.getTime()) / 60000
      );
      return `CRITICAL: Jobs stuck for ${ageMinutes} minutes (threshold: ${thresholds.staleJobsCritical} min) - processing may be stalled`;
    },
  },

  // Warning: Slow processing time
  {
    id: 'slow-processing',
    name: 'Slow Processing',
    severity: 'warning',
    condition: (_, health) => {
      const thresholds = getAlertThresholds();
      return health.metrics.averageProcessingTime > thresholds.slowProcessingWarning;
    },
    message: (_, health) => {
      const thresholds = getAlertThresholds();
      return `Slow processing: average ${health.metrics.averageProcessingTime.toFixed(0)}s per job (threshold: ${thresholds.slowProcessingWarning}s)`;
    },
  },

  // Warning: Queue health issues detected
  {
    id: 'queue-health-issues',
    name: 'Queue Health Issues',
    severity: 'warning',
    condition: (_, health) => !health.healthy && health.issues.length > 0,
    message: (_, health) =>
      `Queue health issues:\n${health.issues.map(i => `• ${i}`).join('\n')}`,
  },

  // Warning: Cron execution failed
  {
    id: 'cron-failed',
    name: 'Cron Execution Failed',
    severity: 'critical',
    condition: (result) => !result.success,
    message: (result) =>
      `Cron execution failed after ${(result.duration / 1000).toFixed(1)}s`,
  },
];

// =============================================================================
// Alert Evaluation
// =============================================================================

/**
 * Evaluate all alert rules against current cron results and queue health
 * Returns array of triggered alerts
 */
export function evaluateAlertRules(
  result: CronExecutionResult,
  health: QueueHealthStatus
): TriggeredAlert[] {
  const triggeredAlerts: TriggeredAlert[] = [];

  for (const rule of ALERT_RULES) {
    try {
      if (rule.condition(result, health)) {
        triggeredAlerts.push({
          rule,
          triggeredAt: new Date(),
          result,
          health,
        });
      }
    } catch (error) {
      // Log but don't throw - continue evaluating other rules
      console.error(`Error evaluating alert rule ${rule.id}:`, error);
    }
  }

  // Sort by severity (critical first)
  triggeredAlerts.sort((a, b) => {
    if (a.rule.severity === 'critical' && b.rule.severity === 'warning') return -1;
    if (a.rule.severity === 'warning' && b.rule.severity === 'critical') return 1;
    return 0;
  });

  return triggeredAlerts;
}

/**
 * Check if any critical alerts are triggered
 */
export function hasCriticalAlerts(alerts: TriggeredAlert[]): boolean {
  return alerts.some(a => a.rule.severity === 'critical');
}

/**
 * Get alert summary for logging
 */
export function getAlertSummary(alerts: TriggeredAlert[]): {
  total: number;
  critical: number;
  warning: number;
  ruleIds: string[];
} {
  return {
    total: alerts.length,
    critical: alerts.filter(a => a.rule.severity === 'critical').length,
    warning: alerts.filter(a => a.rule.severity === 'warning').length,
    ruleIds: alerts.map(a => a.rule.id),
  };
}
