/**
 * WatchdogLogic - Independent health monitoring and backup trigger logic
 *
 * This module provides the core logic for an external watchdog that monitors
 * the primary pipeline health and triggers backup processing when failures
 * are detected. It's designed to be used by a Cloudflare Worker running on
 * a separate account/zone from the primary cron worker.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 4
 */

/**
 * Result of a health check against the pipeline
 */
export interface HealthCheckResult {
  healthy: boolean;
  status?: string;
  error?: string;
  responseTimeMs?: number;
  jobs?: { pending: number; processing?: number };
}

/**
 * State tracked by the watchdog for decision making
 */
export interface WatchdogState {
  consecutiveFailures: number;
  lastSuccessTime: Date | null;
  lastCheckTime?: Date | null;
}

/**
 * Options for checking pipeline health
 */
interface CheckOptions {
  mockHealthResponse?: {
    status: string;
    jobs?: { pending: number; processing?: number };
  };
  mockError?: Error;
  publicUrl?: string;
}

/**
 * Options for triggering backup pipeline
 */
interface TriggerOptions {
  mockResponse?: { success: boolean; source?: string; error?: string };
  dryRun?: boolean;
  publicUrl?: string;
  backupSecret?: string;
}

/**
 * Options for formatting alert messages
 */
interface AlertMessageOptions {
  type: 'health-failure' | 'backup-triggered' | 'recovery' | 'warning';
  consecutiveFailures?: number;
  status?: string;
  reason?: string;
  previousFailures?: number;
  error?: string;
}

/**
 * Thresholds for watchdog decision making
 */
const THRESHOLDS = {
  /** Number of consecutive failures before triggering backup */
  FAILURE_THRESHOLD: 3,
  /** Minutes without success before triggering backup (requires 2+ failures) */
  NO_SUCCESS_THRESHOLD_MINUTES: 20,
} as const;

/**
 * WatchdogLogic provides health checking and backup trigger logic
 * for monitoring the SEC filing pipeline from an external worker.
 */
export class WatchdogLogic {
  /**
   * Check the health of the pipeline by calling the health endpoint
   *
   * @param options - Configuration options including mock data for testing
   * @returns Health check result with status and optional error
   */
  static async checkPipelineHealth(options: CheckOptions = {}): Promise<HealthCheckResult> {
    const { mockHealthResponse, mockError, publicUrl } = options;

    // Handle mock error for testing
    if (mockError) {
      return { healthy: false, error: mockError.message };
    }

    // Handle mock response for testing
    if (mockHealthResponse) {
      return {
        healthy: mockHealthResponse.status === 'HEALTHY',
        status: mockHealthResponse.status,
        jobs: mockHealthResponse.jobs,
      };
    }

    // Real implementation - fetch from health endpoint
    const url = publicUrl || process.env.PUBLIC_URL || 'https://tldrsec.app';
    const startTime = Date.now();

    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { 'Cache-Control': 'no-cache' },
      });

      const data = (await response.json()) as {
        status?: string;
        jobs?: { pending: number; processing?: number };
      };
      const responseTimeMs = Date.now() - startTime;

      return {
        healthy: data.status === 'HEALTHY',
        status: data.status,
        jobs: data.jobs,
        responseTimeMs,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Determine if backup pipeline should be triggered based on current state
   *
   * Triggers backup when:
   * - 3 or more consecutive failures, OR
   * - 2+ consecutive failures AND no success for 20+ minutes
   *
   * @param state - Current watchdog state
   * @returns true if backup should be triggered
   */
  static shouldTriggerBackup(state: WatchdogState): boolean {
    // Trigger if 3+ consecutive failures
    if (state.consecutiveFailures >= THRESHOLDS.FAILURE_THRESHOLD) {
      return true;
    }

    // Trigger if no success for 20+ minutes AND at least 2 failures
    if (state.lastSuccessTime && state.consecutiveFailures >= 2) {
      const minutesSinceSuccess = (Date.now() - state.lastSuccessTime.getTime()) / (60 * 1000);
      if (minutesSinceSuccess >= THRESHOLDS.NO_SUCCESS_THRESHOLD_MINUTES) {
        return true;
      }
    }

    return false;
  }

  /**
   * Trigger the backup pipeline by calling the backup trigger endpoint
   *
   * @param options - Configuration options including mock data for testing
   * @returns Result indicating if backup was triggered
   */
  static async triggerBackupPipeline(
    options: TriggerOptions = {}
  ): Promise<{ triggered: boolean; response?: unknown; error?: string }> {
    const { mockResponse, dryRun = false, publicUrl, backupSecret } = options;

    // Handle mock response for testing
    if (mockResponse) {
      return { triggered: true };
    }

    // Dry run mode - just return success without making real request
    if (dryRun) {
      return { triggered: true };
    }

    // Real implementation - call backup endpoint
    const url = publicUrl || process.env.PUBLIC_URL || 'https://tldrsec.app';
    const secret = backupSecret || process.env.BACKUP_TRIGGER_SECRET;

    if (!secret) {
      return { triggered: false, error: 'BACKUP_TRIGGER_SECRET not configured' };
    }

    try {
      const response = await fetch(`${url}/api/cron/backup-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          source: 'watchdog',
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      return { triggered: response.ok, response: data };
    } catch (error) {
      return {
        triggered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get Slack color based on health status
   *
   * @param status - Health status string
   * @returns Slack attachment color: 'good', 'warning', or 'danger'
   */
  static getHealthStatusColor(status: string): 'good' | 'warning' | 'danger' {
    switch (status) {
      case 'HEALTHY':
        return 'good';
      case 'DEGRADED':
      case 'UNKNOWN':
        return 'warning';
      case 'CRITICAL':
      case 'UNREACHABLE':
      default:
        return 'danger';
    }
  }

  /**
   * Format an alert message for Slack notification
   *
   * @param options - Alert message configuration
   * @returns Formatted message string
   */
  static formatAlertMessage(options: AlertMessageOptions): string {
    switch (options.type) {
      case 'health-failure':
        return (
          `:rotating_light: *Watchdog Alert*\n\n` +
          `Pipeline health check failed ${options.consecutiveFailures} times consecutively.\n` +
          `Status: ${options.status || 'UNKNOWN'}\n` +
          (options.error ? `Error: ${options.error}\n` : '') +
          `\n*Will trigger backup on next failure if threshold reached.*`
        );

      case 'backup-triggered':
        return (
          `:sos: *Watchdog: Backup Pipeline Triggered*\n\n` +
          `Reason: ${options.reason || 'Primary worker not responding'}\n` +
          `\n*Backup pipeline has been activated.*`
        );

      case 'recovery':
        return (
          `:white_check_mark: *Watchdog: Pipeline Recovered*\n\n` +
          `Pipeline has recovered after ${options.previousFailures} consecutive failures.\n` +
          `Health status is now HEALTHY.`
        );

      case 'warning':
        return (
          `:warning: *Watchdog Warning*\n\n` +
          `${options.reason || 'Pipeline showing signs of degradation.'}\n` +
          (options.consecutiveFailures
            ? `Consecutive failures: ${options.consecutiveFailures}`
            : '')
        );

      default:
        return `*Watchdog Alert*\n\n${options.reason || 'Unknown alert type'}`;
    }
  }

  /**
   * Send an alert via Slack webhook
   *
   * @param message - Message to send
   * @param webhookUrl - Optional webhook URL (falls back to env var)
   */
  static async sendSlackAlert(message: string, webhookUrl?: string): Promise<void> {
    const url = webhookUrl || process.env.SLACK_ALERTS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
    } catch (error) {
      console.error('[WatchdogLogic] Failed to send Slack alert:', error);
    }
  }
}
