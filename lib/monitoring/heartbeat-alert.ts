/**
 * Heartbeat Alert Generator for Pipeline Watchdog
 *
 * Generates alert emails when the pipeline watchdog detects issues:
 * - No successful job completions in 15+ minutes
 * - Health endpoint returning CRITICAL status
 * - Health endpoint unreachable
 *
 * Used by the GitHub Action watchdog to send email alerts via Resend.
 *
 * @see docs/plans/2026-01-26-pipeline-resilience-zero-intervention.md Phase 3
 */

export interface PipelineStatus {
  status: string;
  minutesSinceLastCompletion: number;
  lastExecution: string;
  pendingJobs: number;
  healthEndpoint: string;
}

export interface AlertEmail {
  subject: string;
  body: string;
  html: string;
}

/**
 * Generates a formatted alert email for pipeline issues.
 *
 * @param status - Pipeline status information from the health endpoint
 * @returns Email content with subject, plain text body, and HTML body
 *
 * @example
 * ```typescript
 * const alert = generateAlertEmail({
 *   status: 'CRITICAL',
 *   minutesSinceLastCompletion: 45,
 *   lastExecution: '2026-01-26T00:00:00Z',
 *   pendingJobs: 156,
 *   healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
 * });
 * // Use with Resend API to send email
 * ```
 */
export function generateAlertEmail(status: PipelineStatus): AlertEmail {
  const subject = `🚨 TLDRSec Pipeline Stall Alert - ${status.status}`;

  const body = `
Pipeline Health Alert
=====================

Status: ${status.status}
Last Completion: ${status.minutesSinceLastCompletion} minutes ago
Last Execution: ${status.lastExecution}
Pending Jobs: ${status.pendingJobs}

Health Dashboard: ${status.healthEndpoint}

This alert was triggered because no successful job completions have been
recorded in the last 15 minutes. The pipeline may require investigation.

Recommended Actions:
1. Check health endpoint: ${status.healthEndpoint}
2. Review Cloudflare Worker logs: npx wrangler tail
3. Check Vercel function logs
4. See runbook: docs/runbooks/pipeline-stall-recovery.md

This is an automated alert from the TLDRSec Pipeline Watchdog.
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .alert { background: #fee2e2; border: 1px solid #ef4444; padding: 20px; border-radius: 12px 12px 0 0; }
  .status { font-size: 28px; font-weight: bold; color: #dc2626; margin: 0; }
  .content { padding: 24px; }
  .metric { margin: 16px 0; padding: 12px; background: #f3f4f6; border-radius: 8px; }
  .metric-row { display: flex; justify-content: space-between; align-items: center; }
  .label { color: #6b7280; font-size: 14px; }
  .value { font-weight: 600; font-size: 18px; color: #111827; }
  .actions { background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin-top: 20px; }
  .actions h3 { margin: 0 0 12px 0; color: #92400e; font-size: 16px; }
  .actions ol { margin: 0; padding-left: 20px; }
  .actions li { margin: 8px 0; color: #92400e; }
  .actions a { color: #1d4ed8; text-decoration: none; }
  .actions a:hover { text-decoration: underline; }
  .footer { padding: 16px 24px; background: #f9fafb; border-radius: 0 0 12px 12px; text-align: center; color: #6b7280; font-size: 12px; }
</style></head>
<body>
  <div class="container">
    <div class="alert">
      <p class="status">🚨 Pipeline ${status.status}</p>
    </div>
    <div class="content">
      <div class="metric">
        <div class="metric-row">
          <span class="label">Time Since Last Completion</span>
          <span class="value">${status.minutesSinceLastCompletion} minutes</span>
        </div>
      </div>
      <div class="metric">
        <div class="metric-row">
          <span class="label">Pending Jobs</span>
          <span class="value">${status.pendingJobs}</span>
        </div>
      </div>
      <div class="metric">
        <div class="metric-row">
          <span class="label">Last Execution</span>
          <span class="value">${status.lastExecution}</span>
        </div>
      </div>
      <div class="actions">
        <h3>⚡ Recommended Actions</h3>
        <ol>
          <li><a href="${status.healthEndpoint}">Check health endpoint</a></li>
          <li>Review Cloudflare Worker logs: <code>npx wrangler tail</code></li>
          <li>Check Vercel function logs in dashboard</li>
          <li>See runbook: <code>docs/runbooks/pipeline-stall-recovery.md</code></li>
        </ol>
      </div>
    </div>
    <div class="footer">
      This is an automated alert from the TLDRSec Pipeline Watchdog.
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, body, html };
}

/**
 * Determines if an alert should be sent based on pipeline status.
 *
 * @param minutesSinceLastCompletion - Minutes since last successful job completion
 * @param status - Current pipeline status string
 * @param threshold - Minutes threshold before alerting (default: 15)
 * @returns True if an alert should be sent
 */
export function shouldSendAlert(
  minutesSinceLastCompletion: number | null,
  status: string,
  threshold: number = 15
): boolean {
  // Alert if status is CRITICAL
  if (status === 'CRITICAL') {
    return true;
  }

  // Alert if no completions in threshold minutes
  if (minutesSinceLastCompletion !== null && minutesSinceLastCompletion > threshold) {
    return true;
  }

  return false;
}
