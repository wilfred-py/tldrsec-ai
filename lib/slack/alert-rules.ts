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
    condition: (result) => result.results.filingMonitoring.errors > 1,
    message: (result) =>
      `${result.results.filingMonitoring.errors} filing errors detected during discovery`,
  },

  // Warning: Single filing error
  {
    id: 'filing-error-warning',
    name: 'Filing Error',
    severity: 'warning',
    condition: (result) => result.results.filingMonitoring.errors === 1,
    message: (_result) =>
      `1 filing error detected during discovery`,
  },

  // Warning: Backlog growing (queue depth > 10)
  {
    id: 'backlog-growing',
    name: 'Backlog Growing',
    severity: 'warning',
    condition: (_, health) => health.metrics.queueDepth > 10,
    message: (_, health) =>
      `Backlog growing: ${health.metrics.queueDepth} jobs queued (threshold: 10)`,
  },

  // Critical: Large backlog (queue depth > 50)
  {
    id: 'backlog-critical',
    name: 'Critical Backlog',
    severity: 'critical',
    condition: (_, health) => health.metrics.queueDepth > 50,
    message: (_, health) =>
      `Critical backlog: ${health.metrics.queueDepth} jobs queued (threshold: 50)`,
  },

  // Warning: High failure rate (>10%)
  {
    id: 'high-failure-rate',
    name: 'High Failure Rate',
    severity: 'warning',
    condition: (_, health) => {
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      if (total < 10) return false; // Need minimum sample size
      const failureRate = health.metrics.failedLast24h / total;
      return failureRate > 0.1;
    },
    message: (_, health) => {
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      const failureRate = (health.metrics.failedLast24h / total) * 100;
      return `High failure rate: ${failureRate.toFixed(1)}% (${health.metrics.failedLast24h}/${total} jobs failed in 24h)`;
    },
  },

  // Critical: Very high failure rate (>20%)
  {
    id: 'critical-failure-rate',
    name: 'Critical Failure Rate',
    severity: 'critical',
    condition: (_, health) => {
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      if (total < 10) return false;
      const failureRate = health.metrics.failedLast24h / total;
      return failureRate > 0.2;
    },
    message: (_, health) => {
      const total = health.metrics.completedLast24h + health.metrics.failedLast24h;
      const failureRate = (health.metrics.failedLast24h / total) * 100;
      return `Critical failure rate: ${failureRate.toFixed(1)}% - immediate attention required`;
    },
  },

  // Warning: Old pending jobs (>30 minutes)
  {
    id: 'stale-jobs',
    name: 'Stale Jobs',
    severity: 'warning',
    condition: (_, health) => {
      if (!health.metrics.oldestPendingJob) return false;
      const ageMinutes = (Date.now() - health.metrics.oldestPendingJob.getTime()) / 60000;
      return ageMinutes > 30;
    },
    message: (_, health) => {
      const ageMinutes = Math.round(
        (Date.now() - health.metrics.oldestPendingJob!.getTime()) / 60000
      );
      return `Jobs stuck in queue: oldest pending job is ${ageMinutes} minutes old`;
    },
  },

  // Critical: Very old pending jobs (>60 minutes)
  {
    id: 'stale-jobs-critical',
    name: 'Jobs Stuck',
    severity: 'critical',
    condition: (_, health) => {
      if (!health.metrics.oldestPendingJob) return false;
      const ageMinutes = (Date.now() - health.metrics.oldestPendingJob.getTime()) / 60000;
      return ageMinutes > 60;
    },
    message: (_, health) => {
      const ageMinutes = Math.round(
        (Date.now() - health.metrics.oldestPendingJob!.getTime()) / 60000
      );
      return `CRITICAL: Jobs stuck for ${ageMinutes} minutes - processing may be stalled`;
    },
  },

  // Warning: Slow processing time (>2 minutes average)
  {
    id: 'slow-processing',
    name: 'Slow Processing',
    severity: 'warning',
    condition: (_, health) => health.metrics.averageProcessingTime > 120,
    message: (_, health) =>
      `Slow processing: average ${health.metrics.averageProcessingTime.toFixed(0)}s per job (threshold: 120s)`,
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
