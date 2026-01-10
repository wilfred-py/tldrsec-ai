/**
 * Cron Execution Gap Detector
 *
 * Detects gaps in cron execution history that may indicate
 * Cloudflare Worker failures or other pipeline issues.
 *
 * Features:
 * - Detects gaps between cron executions
 * - Detects when no recent executions exist
 * - Rate-limited alerting to prevent duplicate alerts
 * - Configurable thresholds via environment variables
 *
 * Environment Variables:
 * - GAP_LOOKBACK_MINUTES: How far back to look (default: 60)
 * - GAP_THRESHOLD_MINUTES: Minimum gap to detect (default: 15)
 * - GAP_ALERT_COOLDOWN_MINUTES: Cooldown between alerts (default: 30)
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 2
 */

import { getPrismaClient } from '@/lib/db/prisma';

// In-memory cache for last alert time (rate limiting)
let lastAlertTime: Date | null = null;

/**
 * Represents a detected gap in cron executions
 */
export interface ExecutionGap {
  type: 'gap-between-executions' | 'no-recent-executions';
  durationMinutes: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Options for detecting gaps
 */
interface DetectGapsOptions {
  /** How far back to look for executions (default: 60 minutes) */
  lookbackMinutes?: number;
  /** Minimum gap duration to flag (default: 15 minutes) */
  gapThresholdMinutes?: number;
  /** Mock executions for testing */
  mockExecutions?: Array<{ triggeredAt: Date }>;
}

/**
 * Options for determining if a gap should trigger an alert
 */
interface AlertOptions {
  /** Minimum gap duration to alert on (default: 15 minutes) */
  alertThresholdMinutes?: number;
}

/**
 * Result of checking and alerting for gaps
 */
interface CheckAndAlertResult {
  alerted: boolean;
  gaps: ExecutionGap[];
  rateLimited?: boolean;
}

/**
 * Get configured values from environment or use defaults
 */
function getConfig() {
  return {
    lookbackMinutes: parseInt(process.env.GAP_LOOKBACK_MINUTES || '60', 10),
    gapThresholdMinutes: parseInt(process.env.GAP_THRESHOLD_MINUTES || '15', 10),
    alertCooldownMinutes: parseInt(process.env.GAP_ALERT_COOLDOWN_MINUTES || '30', 10),
  };
}

/**
 * CronExecutionGapDetector
 *
 * Monitors cron execution history and detects gaps that may indicate
 * Cloudflare Worker failures or other infrastructure issues.
 */
export class CronExecutionGapDetector {
  /**
   * Detect gaps in cron execution history
   */
  static async detectGaps(options: DetectGapsOptions = {}): Promise<ExecutionGap[]> {
    const {
      lookbackMinutes = 60,
      gapThresholdMinutes = 15,
      mockExecutions,
    } = options;

    const now = new Date();
    const lookbackTime = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

    // Use mock data for testing or query database
    const executions = mockExecutions ?? await this.getRecentExecutions(lookbackTime);

    // If no executions at all, report as no-recent-executions gap
    if (executions.length === 0) {
      return [{
        type: 'no-recent-executions',
        durationMinutes: lookbackMinutes,
        startTime: lookbackTime,
        endTime: now,
      }];
    }

    // Sort by time descending (most recent first)
    const sorted = [...executions].sort(
      (a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime()
    );

    const gaps: ExecutionGap[] = [];

    // Check gap from now to most recent execution
    const mostRecent = sorted[0];
    const timeSinceLastExecution = (now.getTime() - mostRecent.triggeredAt.getTime()) / (60 * 1000);

    if (timeSinceLastExecution > gapThresholdMinutes) {
      gaps.push({
        type: 'no-recent-executions',
        durationMinutes: Math.round(timeSinceLastExecution),
        startTime: mostRecent.triggeredAt,
        endTime: now,
      });
    }

    // Check gaps between executions
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const previous = sorted[i + 1];
      const gapMinutes = (current.triggeredAt.getTime() - previous.triggeredAt.getTime()) / (60 * 1000);

      if (gapMinutes > gapThresholdMinutes) {
        gaps.push({
          type: 'gap-between-executions',
          durationMinutes: Math.round(gapMinutes),
          startTime: previous.triggeredAt,
          endTime: current.triggeredAt,
        });
      }
    }

    return gaps;
  }

  /**
   * Determine if a gap should trigger an alert
   */
  static shouldAlert(gap: ExecutionGap, options: AlertOptions = {}): boolean {
    const { alertThresholdMinutes = 15 } = options;
    return gap.durationMinutes > alertThresholdMinutes;
  }

  /**
   * Get a formatted summary of detected gaps
   */
  static getGapSummary(gaps: ExecutionGap[]): string {
    if (gaps.length === 0) {
      return '';
    }

    return gaps.map(gap =>
      `- ${gap.type}: ${gap.durationMinutes} minutes (${gap.startTime.toISOString()} to ${gap.endTime.toISOString()})`
    ).join('\n');
  }

  /**
   * Get recent cron executions from database
   */
  private static async getRecentExecutions(since: Date): Promise<Array<{ triggeredAt: Date }>> {
    const prisma = getPrismaClient();

    return prisma.cronJobExecution.findMany({
      where: {
        triggeredAt: { gte: since },
        jobType: 'sec-filing-monitor', // Main pipeline job
      },
      select: { triggeredAt: true },
      orderBy: { triggeredAt: 'desc' },
    });
  }

  /**
   * Check for gaps and send alerts if needed (with rate limiting)
   */
  static async checkAndAlert(): Promise<CheckAndAlertResult> {
    const config = getConfig();

    const gaps = await this.detectGaps({
      lookbackMinutes: config.lookbackMinutes,
      gapThresholdMinutes: config.gapThresholdMinutes,
    });

    const alertableGaps = gaps.filter(gap => this.shouldAlert(gap));

    if (alertableGaps.length === 0) {
      return { alerted: false, gaps: [] };
    }

    // Check rate limiting
    if (this.isRateLimited(config.alertCooldownMinutes)) {
      console.log('[CronGapDetector] Alert rate limited, skipping Slack notification');
      return { alerted: false, gaps: alertableGaps, rateLimited: true };
    }

    // Send alert and update rate limit timestamp
    await this.sendSlackAlert(alertableGaps);
    lastAlertTime = new Date();

    return { alerted: true, gaps: alertableGaps };
  }

  /**
   * Check if we're within the rate limit cooldown period
   */
  private static isRateLimited(cooldownMinutes: number): boolean {
    if (!lastAlertTime) {
      return false;
    }

    const timeSinceLastAlert = (Date.now() - lastAlertTime.getTime()) / (60 * 1000);
    return timeSinceLastAlert < cooldownMinutes;
  }

  /**
   * Clear the rate limit (for testing)
   */
  static clearRateLimit(): void {
    lastAlertTime = null;
  }

  /**
   * Send Slack alert for detected gaps
   */
  private static async sendSlackAlert(gaps: ExecutionGap[]): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    const gapDescriptions = this.getGapSummary(gaps);

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:warning: *Cron Execution Gap Detected*\n\n${gapDescriptions}\n\nThis may indicate Cloudflare Worker issues. Check: \`cd cloudflare-cron && npx wrangler tail\``,
      }),
    });
  }
}
