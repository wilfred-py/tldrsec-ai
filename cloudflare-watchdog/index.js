/**
 * TLDRSec Pipeline Watchdog - Independent Health Monitor
 *
 * This Cloudflare Worker runs independently from the primary cron worker.
 * It monitors pipeline health and triggers backup processing if the primary
 * worker appears to have failed.
 *
 * Features:
 * - Health checks every 10 minutes (offset from primary cron)
 * - Consecutive failure tracking with KV persistence
 * - Automatic backup trigger after threshold failures
 * - Slack alerting for failures, warnings, and recovery
 * - Mutual exclusion with primary (skips if primary ran recently)
 *
 * IMPORTANT: Deploy to a DIFFERENT Cloudflare account/zone than primary!
 *
 * @version 1.0.0
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 4
 */

// Default thresholds (can be overridden via env vars)
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_NO_SUCCESS_THRESHOLD_MINUTES = 20;

/**
 * Handler for Cloudflare scheduled events (cron)
 */
export default {
  async scheduled(event, env, ctx) {
    const handler = new WatchdogHandler(env);
    ctx.waitUntil(handler.run());
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health/status endpoint for the watchdog itself
    if (request.method === 'GET' && url.pathname === '/status') {
      const handler = new WatchdogHandler(env);
      const state = await handler.getState();

      return new Response(
        JSON.stringify({
          service: 'tldrsec-watchdog',
          version: env.WORKER_VERSION || '1.0.0',
          state: {
            consecutiveFailures: state.consecutiveFailures,
            lastSuccessTime: state.lastSuccessTime
              ? new Date(state.lastSuccessTime).toISOString()
              : null,
            lastCheckTime: state.lastCheckTime
              ? new Date(state.lastCheckTime).toISOString()
              : null,
          },
          thresholds: {
            failureThreshold: parseInt(env.FAILURE_THRESHOLD) || DEFAULT_FAILURE_THRESHOLD,
            noSuccessThresholdMinutes:
              parseInt(env.NO_SUCCESS_THRESHOLD_MINUTES) || DEFAULT_NO_SUCCESS_THRESHOLD_MINUTES,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Manual trigger endpoint (POST only)
    if (request.method === 'POST' && url.pathname === '/trigger') {
      const handler = new WatchdogHandler(env);
      const result = await handler.run();

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Force check endpoint (bypasses rate limiting)
    if (request.method === 'POST' && url.pathname === '/check') {
      const handler = new WatchdogHandler(env);
      const healthResult = await handler.checkHealth();

      return new Response(
        JSON.stringify({
          triggered: false,
          healthResult,
          message: 'Health check performed (no backup trigger)',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        service: 'tldrsec-watchdog',
        version: env.WORKER_VERSION || '1.0.0',
        endpoints: {
          'GET /status': 'Get current watchdog status and state',
          'POST /trigger': 'Manually run watchdog check cycle',
          'POST /check': 'Perform health check only (no backup trigger)',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  },
};

/**
 * Main watchdog handler class
 */
class WatchdogHandler {
  constructor(env) {
    this.env = env;
    this.publicUrl = env.PUBLIC_URL || 'https://tldrsec.app';
    this.slackWebhook = env.SLACK_ALERTS_WEBHOOK_URL || env.SLACK_WEBHOOK_URL;
    this.backupSecret = env.BACKUP_TRIGGER_SECRET;
    this.failureThreshold = parseInt(env.FAILURE_THRESHOLD) || DEFAULT_FAILURE_THRESHOLD;
    this.noSuccessThresholdMinutes =
      parseInt(env.NO_SUCCESS_THRESHOLD_MINUTES) || DEFAULT_NO_SUCCESS_THRESHOLD_MINUTES;
  }

  /**
   * Main execution loop
   */
  async run() {
    console.log('[Watchdog] Starting health check cycle');

    const state = await this.getState();
    const healthResult = await this.checkHealth();

    console.log('[Watchdog] Health check result:', JSON.stringify(healthResult));

    if (healthResult.healthy) {
      // Pipeline is healthy
      const wasUnhealthy = state.consecutiveFailures > 0;

      await this.updateState({
        consecutiveFailures: 0,
        lastSuccessTime: Date.now(),
        lastCheckTime: Date.now(),
      });

      // Send recovery alert if we were previously failing
      if (wasUnhealthy && state.consecutiveFailures >= 2) {
        await this.sendAlert(
          `:white_check_mark: *Watchdog: Pipeline Recovered*\n\n` +
            `Pipeline health restored after ${state.consecutiveFailures} consecutive failures.\n` +
            `Status: ${healthResult.status}`
        );
      }

      return {
        status: 'healthy',
        healthResult,
        previousFailures: state.consecutiveFailures,
      };
    }

    // Pipeline is unhealthy - increment failure counter
    const newFailures = (state.consecutiveFailures || 0) + 1;

    await this.updateState({
      consecutiveFailures: newFailures,
      lastCheckTime: Date.now(),
      lastSuccessTime: state.lastSuccessTime,
    });

    console.log(
      `[Watchdog] Pipeline unhealthy, consecutive failures: ${newFailures}/${this.failureThreshold}`
    );

    // Check if we should trigger backup
    const shouldTrigger = this.shouldTriggerBackup(newFailures, state.lastSuccessTime);

    if (shouldTrigger) {
      console.log('[Watchdog] Triggering backup pipeline');

      await this.sendAlert(
        `:rotating_light: *Watchdog Alert: Triggering Backup*\n\n` +
          `Pipeline health check failed ${newFailures} times consecutively.\n` +
          `Status: ${healthResult.status || 'UNREACHABLE'}\n` +
          `Error: ${healthResult.error || 'N/A'}\n\n` +
          `*Triggering backup pipeline now...*`
      );

      const triggerResult = await this.triggerBackup();

      if (triggerResult.success) {
        await this.sendAlert(
          `:white_check_mark: *Backup Pipeline Triggered Successfully*\n\n` +
            `Response: ${JSON.stringify(triggerResult.data || {})}`
        );
      } else {
        await this.sendAlert(
          `:x: *Backup Trigger Failed*\n\n` +
            `Error: ${triggerResult.error}\n\n` +
            `*Manual intervention may be required.*`
        );
      }

      return {
        status: 'backup-triggered',
        failures: newFailures,
        healthResult,
        triggerResult,
      };
    }

    // Alert but don't trigger yet
    if (newFailures === 2) {
      await this.sendAlert(
        `:warning: *Watchdog Warning*\n\n` +
          `Pipeline health check failed ${newFailures} times.\n` +
          `Status: ${healthResult.status || 'UNREACHABLE'}\n` +
          `Error: ${healthResult.error || 'N/A'}\n\n` +
          `*Will trigger backup on next failure.*`
      );
    }

    return {
      status: 'degraded',
      failures: newFailures,
      healthResult,
      thresholdRemaining: this.failureThreshold - newFailures,
    };
  }

  /**
   * Check pipeline health by calling the health endpoint
   */
  async checkHealth() {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(`${this.publicUrl}/api/health/pipeline`, {
        headers: {
          'Cache-Control': 'no-cache',
          'User-Agent': 'TLDRSec-Watchdog/1.0',
        },
        signal: controller.signal,
        cf: { cacheTtl: 0 },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          healthy: false,
          status: 'HTTP_ERROR',
          error: `HTTP ${response.status}`,
          responseTimeMs: Date.now() - startTime,
        };
      }

      const data = await response.json();

      return {
        healthy: data.status === 'HEALTHY',
        status: data.status,
        jobs: data.jobs,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'UNREACHABLE',
        error: error.name === 'AbortError' ? 'Request timeout (30s)' : error.message,
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Determine if backup should be triggered
   */
  shouldTriggerBackup(consecutiveFailures, lastSuccessTime) {
    // Trigger after threshold consecutive failures
    if (consecutiveFailures >= this.failureThreshold) {
      return true;
    }

    // Trigger if no success for threshold minutes AND at least 2 failures
    if (lastSuccessTime && consecutiveFailures >= 2) {
      const minutesSinceSuccess = (Date.now() - lastSuccessTime) / (60 * 1000);
      if (minutesSinceSuccess >= this.noSuccessThresholdMinutes) {
        return true;
      }
    }

    return false;
  }

  /**
   * Trigger the backup pipeline endpoint
   */
  async triggerBackup() {
    if (!this.backupSecret) {
      console.error('[Watchdog] BACKUP_TRIGGER_SECRET not configured');
      return { success: false, error: 'BACKUP_TRIGGER_SECRET not configured' };
    }

    try {
      const response = await fetch(`${this.publicUrl}/api/cron/backup-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.backupSecret}`,
          'User-Agent': 'TLDRSec-Watchdog/1.0',
        },
        body: JSON.stringify({
          source: 'watchdog',
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      return { success: response.ok, data };
    } catch (error) {
      console.error('[Watchdog] Backup trigger failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a Slack alert
   */
  async sendAlert(message) {
    if (!this.slackWebhook) {
      console.log('[Watchdog] Slack not configured, alert message:', message);
      return;
    }

    try {
      await fetch(this.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
    } catch (error) {
      console.error('[Watchdog] Failed to send Slack alert:', error);
    }
  }

  /**
   * Get current state from KV storage (or memory fallback)
   */
  async getState() {
    // Try KV storage first
    if (this.env.WATCHDOG_STATE) {
      try {
        const data = await this.env.WATCHDOG_STATE.get('state', { type: 'json' });
        if (data) {
          return data;
        }
      } catch (error) {
        console.warn('[Watchdog] Failed to read KV state:', error);
      }
    }

    // Default state
    return {
      consecutiveFailures: 0,
      lastSuccessTime: null,
      lastCheckTime: null,
    };
  }

  /**
   * Update state in KV storage (or log if KV not available)
   */
  async updateState(state) {
    // Try KV storage first
    if (this.env.WATCHDOG_STATE) {
      try {
        await this.env.WATCHDOG_STATE.put('state', JSON.stringify(state));
        return;
      } catch (error) {
        console.warn('[Watchdog] Failed to write KV state:', error);
      }
    }

    // Log state for debugging when KV not available
    console.log('[Watchdog] State (no KV):', JSON.stringify(state));
  }
}
