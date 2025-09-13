/**
 * Real-Time Alerting Service for Security Monitoring
 * 
 * Provides intelligent alert delivery with rate limiting, deduplication,
 * and multiple delivery channels for security events and performance issues.
 */

import { logger } from '../logging';

const alertLogger = logger.child('alerting-service');

export interface AlertConfig {
  webhooks: {
    enabled: boolean;
    urls: string[];
    timeout: number;
    retry_attempts: number;
  };
  email: {
    enabled: boolean;
    recipients: string[];
    smtp_config?: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
  };
  slack: {
    enabled: boolean;
    webhook_url?: string;
    channel?: string;
  };
  rate_limiting: {
    max_alerts_per_minute: number;
    max_alerts_per_hour: number;
    cooldown_period_ms: number;
  };
  severity_thresholds: {
    critical: {
      immediate_delivery: boolean;
      escalation_delay_ms: number;
    };
    warning: {
      batch_delivery: boolean;
      batch_interval_ms: number;
    };
    info: {
      digest_only: boolean;
      digest_interval_ms: number;
    };
  };
}

export interface Alert {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  details?: Record<string, any>;
  fingerprint?: string; // For deduplication
  tags?: string[];
}

export interface AlertDeliveryResult {
  success: boolean;
  channel: string;
  delivered_at: number;
  error?: string;
  delivery_time_ms: number;
}

interface AlertBatch {
  alerts: Alert[];
  created_at: number;
  level: 'info' | 'warning' | 'critical';
}

/**
 * Intelligent alerting service with multi-channel delivery
 */
export class AlertingService {
  private static instance: AlertingService;
  private config: AlertConfig;
  private alertHistory: Map<string, Alert> = new Map();
  private rateLimitState = {
    alerts_this_minute: 0,
    alerts_this_hour: 0,
    last_minute_reset: Date.now(),
    last_hour_reset: Date.now(),
    cooldown_until: 0
  };
  private pendingBatches: Map<string, AlertBatch> = new Map();
  private deliveryHistory: AlertDeliveryResult[] = [];

  private constructor() {
    this.config = this.loadDefaultConfig();
    alertLogger.info('Alerting service initialized', {
      enabled_channels: this.getEnabledChannels(),
      rate_limits: this.config.rate_limiting
    });

    // Start batch processing interval
    setInterval(() => {
      this.processPendingBatches();
    }, 30000); // Every 30 seconds

    // Rate limit reset intervals
    setInterval(() => {
      this.resetRateLimits();
    }, 60000); // Every minute
  }

  public static getInstance(): AlertingService {
    if (!AlertingService.instance) {
      AlertingService.instance = new AlertingService();
    }
    return AlertingService.instance;
  }

  /**
   * Send alert through appropriate channels based on severity
   */
  public async sendAlert(alert: Alert): Promise<AlertDeliveryResult[]> {
    try {
      // Generate unique ID if not provided
      if (!alert.id) {
        alert.id = this.generateAlertId(alert);
      }

      // Check for duplicates
      if (this.isDuplicate(alert)) {
        alertLogger.debug('Duplicate alert suppressed', {
          alert_id: alert.id,
          fingerprint: alert.fingerprint
        });
        return [];
      }

      // Check rate limits
      if (!this.canSendAlert(alert.level)) {
        alertLogger.warn('Alert rate limited', {
          alert_id: alert.id,
          level: alert.level,
          rate_limit_state: this.rateLimitState
        });
        return [];
      }

      // Store in history
      this.alertHistory.set(alert.id, alert);
      this.updateRateLimitCounters();

      const results: AlertDeliveryResult[] = [];

      // Immediate delivery for critical alerts
      if (alert.level === 'critical') {
        const deliveryResults = await this.deliverImmediate(alert);
        results.push(...deliveryResults);
      }
      // Batch delivery for warnings
      else if (alert.level === 'warning' && this.config.severity_thresholds.warning.batch_delivery) {
        this.addToBatch(alert);
      }
      // Digest for info alerts
      else if (alert.level === 'info' && this.config.severity_thresholds.info.digest_only) {
        this.addToDigest(alert);
      }
      // Default immediate delivery
      else {
        const deliveryResults = await this.deliverImmediate(alert);
        results.push(...deliveryResults);
      }

      alertLogger.info('Alert processed', {
        alert_id: alert.id,
        level: alert.level,
        delivery_mode: this.getDeliveryMode(alert.level),
        results_count: results.length
      });

      return results;

    } catch (error) {
      alertLogger.error('Error processing alert', {
        alert: alert.id || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Send bulk security report
   */
  public async sendSecurityDigest(
    threats: any[],
    metrics: any,
    timeframe: string
  ): Promise<AlertDeliveryResult[]> {
    const digest: Alert = {
      id: `digest-${Date.now()}`,
      timestamp: Date.now(),
      level: 'info',
      title: `Security Digest - ${timeframe}`,
      message: this.generateDigestMessage(threats, metrics),
      source: 'security-monitoring',
      details: {
        threats_count: threats.length,
        metrics_summary: metrics,
        timeframe
      },
      tags: ['digest', 'security', 'periodic']
    };

    return this.deliverImmediate(digest);
  }

  /**
   * Update alerting configuration
   */
  public updateConfig(newConfig: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...newConfig };
    alertLogger.info('Alerting configuration updated', {
      enabled_channels: this.getEnabledChannels()
    });
  }

  /**
   * Get alerting statistics
   */
  public getStatistics(): {
    alerts_sent_last_hour: number;
    delivery_success_rate: number;
    average_delivery_time_ms: number;
    channel_performance: Record<string, any>;
    rate_limit_hits: number;
  } {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentDeliveries = this.deliveryHistory.filter(d => d.delivered_at > oneHourAgo);

    const successfulDeliveries = recentDeliveries.filter(d => d.success).length;
    const totalDeliveries = recentDeliveries.length;
    const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 100;

    const avgDeliveryTime = recentDeliveries.length > 0
      ? recentDeliveries.reduce((sum, d) => sum + d.delivery_time_ms, 0) / recentDeliveries.length
      : 0;

    // Channel performance breakdown
    const channelPerformance: Record<string, any> = {};
    const channels = [...new Set(recentDeliveries.map(d => d.channel))];

    channels.forEach(channel => {
      const channelDeliveries = recentDeliveries.filter(d => d.channel === channel);
      const channelSuccessful = channelDeliveries.filter(d => d.success).length;
      const channelAvgTime = channelDeliveries.length > 0
        ? channelDeliveries.reduce((sum, d) => sum + d.delivery_time_ms, 0) / channelDeliveries.length
        : 0;

      channelPerformance[channel] = {
        deliveries: channelDeliveries.length,
        success_rate: channelDeliveries.length > 0 ? (channelSuccessful / channelDeliveries.length) * 100 : 100,
        avg_delivery_time_ms: Math.round(channelAvgTime)
      };
    });

    return {
      alerts_sent_last_hour: recentDeliveries.length,
      delivery_success_rate: Math.round(successRate * 100) / 100,
      average_delivery_time_ms: Math.round(avgDeliveryTime),
      channel_performance: channelPerformance,
      rate_limit_hits: this.rateLimitState.alerts_this_hour
    };
  }

  /**
   * Deliver alert immediately through all enabled channels
   */
  private async deliverImmediate(alert: Alert): Promise<AlertDeliveryResult[]> {
    const results: AlertDeliveryResult[] = [];
    const startTime = Date.now();

    // Webhook delivery
    if (this.config.webhooks.enabled) {
      const webhookResults = await this.deliverWebhook(alert);
      results.push(...webhookResults);
    }

    // Email delivery
    if (this.config.email.enabled) {
      const emailResult = await this.deliverEmail(alert);
      results.push(emailResult);
    }

    // Slack delivery
    if (this.config.slack.enabled) {
      const slackResult = await this.deliverSlack(alert);
      results.push(slackResult);
    }

    // Store delivery results
    this.deliveryHistory.push(...results);

    // Keep only last 1000 delivery records
    if (this.deliveryHistory.length > 1000) {
      this.deliveryHistory = this.deliveryHistory.slice(-500);
    }

    const totalDeliveryTime = Date.now() - startTime;
    alertLogger.debug('Immediate alert delivery completed', {
      alert_id: alert.id,
      channels_attempted: results.length,
      successful_deliveries: results.filter(r => r.success).length,
      total_delivery_time_ms: totalDeliveryTime
    });

    return results;
  }

  /**
   * Deliver alert via webhook
   */
  private async deliverWebhook(alert: Alert): Promise<AlertDeliveryResult[]> {
    const results: AlertDeliveryResult[] = [];

    for (const url of this.config.webhooks.urls) {
      const startTime = Date.now();
      let success = false;
      let error: string | undefined;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.webhooks.timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TLDRSec-AlertingService/1.0'
          },
          body: JSON.stringify({
            alert_id: alert.id,
            timestamp: alert.timestamp,
            level: alert.level,
            title: alert.title,
            message: alert.message,
            source: alert.source,
            details: alert.details,
            tags: alert.tags
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          success = true;
        } else {
          error = `HTTP ${response.status}: ${response.statusText}`;
        }

      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      }

      const deliveryTime = Date.now() - startTime;
      results.push({
        success,
        channel: `webhook:${new URL(url).hostname}`,
        delivered_at: Date.now(),
        error,
        delivery_time_ms: deliveryTime
      });

      if (!success) {
        alertLogger.warn('Webhook delivery failed', {
          alert_id: alert.id,
          webhook_url: url,
          error,
          delivery_time_ms: deliveryTime
        });
      }
    }

    return results;
  }

  /**
   * Deliver alert via email
   */
  private async deliverEmail(alert: Alert): Promise<AlertDeliveryResult> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // TODO: Implement email delivery using Resend or SMTP
      // For now, just log the email content
      alertLogger.info('Email alert (placeholder)', {
        alert_id: alert.id,
        recipients: this.config.email.recipients,
        subject: `[${alert.level.toUpperCase()}] ${alert.title}`,
        message: alert.message
      });

      success = true;

    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const deliveryTime = Date.now() - startTime;
    return {
      success,
      channel: 'email',
      delivered_at: Date.now(),
      error,
      delivery_time_ms: deliveryTime
    };
  }

  /**
   * Deliver alert via Slack
   */
  private async deliverSlack(alert: Alert): Promise<AlertDeliveryResult> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      if (!this.config.slack.webhook_url) {
        throw new Error('Slack webhook URL not configured');
      }

      const color = alert.level === 'critical' ? 'danger' : 
                   alert.level === 'warning' ? 'warning' : 'good';

      const payload = {
        channel: this.config.slack.channel,
        username: 'TLDRSec Security',
        icon_emoji: ':warning:',
        attachments: [{
          color,
          title: alert.title,
          text: alert.message,
          fields: [
            {
              title: 'Level',
              value: alert.level.toUpperCase(),
              short: true
            },
            {
              title: 'Source',
              value: alert.source,
              short: true
            },
            {
              title: 'Time',
              value: new Date(alert.timestamp).toISOString(),
              short: false
            }
          ],
          footer: 'TLDRSec Security Monitoring',
          ts: Math.floor(alert.timestamp / 1000)
        }]
      };

      const response = await fetch(this.config.slack.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        success = true;
      } else {
        error = `HTTP ${response.status}: ${response.statusText}`;
      }

    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const deliveryTime = Date.now() - startTime;
    return {
      success,
      channel: 'slack',
      delivered_at: Date.now(),
      error,
      delivery_time_ms: deliveryTime
    };
  }

  /**
   * Add alert to batch for later delivery
   */
  private addToBatch(alert: Alert): void {
    const batchKey = `${alert.level}-${Math.floor(Date.now() / this.config.severity_thresholds.warning.batch_interval_ms)}`;
    
    if (!this.pendingBatches.has(batchKey)) {
      this.pendingBatches.set(batchKey, {
        alerts: [],
        created_at: Date.now(),
        level: alert.level
      });
    }

    this.pendingBatches.get(batchKey)!.alerts.push(alert);
  }

  /**
   * Add alert to digest
   */
  private addToDigest(alert: Alert): void {
    // For now, just store in batch with longer interval
    this.addToBatch(alert);
  }

  /**
   * Process pending batches
   */
  private async processPendingBatches(): Promise<void> {
    const now = Date.now();

    for (const [batchKey, batch] of this.pendingBatches.entries()) {
      const age = now - batch.created_at;
      const threshold = batch.level === 'warning' 
        ? this.config.severity_thresholds.warning.batch_interval_ms
        : this.config.severity_thresholds.info.digest_interval_ms;

      if (age > threshold) {
        await this.deliverBatch(batch);
        this.pendingBatches.delete(batchKey);
      }
    }
  }

  /**
   * Deliver a batch of alerts
   */
  private async deliverBatch(batch: AlertBatch): Promise<void> {
    const batchAlert: Alert = {
      id: `batch-${Date.now()}`,
      timestamp: Date.now(),
      level: batch.level,
      title: `Security Alert Batch (${batch.alerts.length} alerts)`,
      message: this.generateBatchMessage(batch.alerts),
      source: 'alerting-service',
      details: {
        batch_size: batch.alerts.length,
        batch_created_at: batch.created_at,
        individual_alerts: batch.alerts.map(a => ({
          id: a.id,
          title: a.title,
          timestamp: a.timestamp
        }))
      },
      tags: ['batch', batch.level]
    };

    await this.deliverImmediate(batchAlert);

    alertLogger.info('Alert batch delivered', {
      batch_size: batch.alerts.length,
      batch_level: batch.level,
      batch_id: batchAlert.id
    });
  }

  /**
   * Generate batch message
   */
  private generateBatchMessage(alerts: Alert[]): string {
    const summary = alerts.reduce((acc, alert) => {
      acc[alert.source] = (acc[alert.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let message = `Security alert summary for the last period:\n\n`;
    
    Object.entries(summary).forEach(([source, count]) => {
      message += `• ${source}: ${count} alert${count > 1 ? 's' : ''}\n`;
    });

    message += `\nTotal alerts: ${alerts.length}`;
    
    return message;
  }

  /**
   * Generate digest message
   */
  private generateDigestMessage(threats: any[], metrics: any): string {
    return `Security monitoring digest:\n\n` +
           `• Threats detected: ${threats.length}\n` +
           `• System status: ${metrics.overall_status || 'unknown'}\n` +
           `• Performance score: ${metrics.performance_score || 'N/A'}\n\n` +
           `See dashboard for detailed information.`;
  }

  /**
   * Check if alert is a duplicate
   */
  private isDuplicate(alert: Alert): boolean {
    if (!alert.fingerprint) {
      return false;
    }

    const recentAlerts = Array.from(this.alertHistory.values())
      .filter(a => a.fingerprint === alert.fingerprint && 
                   (Date.now() - a.timestamp) < 300000); // 5 minutes

    return recentAlerts.length > 0;
  }

  /**
   * Check rate limits
   */
  private canSendAlert(level: 'info' | 'warning' | 'critical'): boolean {
    // Critical alerts bypass rate limits
    if (level === 'critical') {
      return true;
    }

    // Check if in cooldown
    if (Date.now() < this.rateLimitState.cooldown_until) {
      return false;
    }

    // Check rate limits
    if (this.rateLimitState.alerts_this_minute >= this.config.rate_limiting.max_alerts_per_minute ||
        this.rateLimitState.alerts_this_hour >= this.config.rate_limiting.max_alerts_per_hour) {
      
      // Trigger cooldown
      this.rateLimitState.cooldown_until = Date.now() + this.config.rate_limiting.cooldown_period_ms;
      return false;
    }

    return true;
  }

  /**
   * Update rate limit counters
   */
  private updateRateLimitCounters(): void {
    this.rateLimitState.alerts_this_minute++;
    this.rateLimitState.alerts_this_hour++;
  }

  /**
   * Reset rate limit counters
   */
  private resetRateLimits(): void {
    const now = Date.now();
    
    // Reset minute counter every minute
    if (now - this.rateLimitState.last_minute_reset > 60000) {
      this.rateLimitState.alerts_this_minute = 0;
      this.rateLimitState.last_minute_reset = now;
    }

    // Reset hour counter every hour
    if (now - this.rateLimitState.last_hour_reset > 3600000) {
      this.rateLimitState.alerts_this_hour = 0;
      this.rateLimitState.last_hour_reset = now;
    }
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(alert: Alert): string {
    const hash = alert.fingerprint || 
                 `${alert.source}-${alert.level}-${alert.title}`.replace(/[^a-zA-Z0-9]/g, '');
    return `alert-${Date.now()}-${hash.substring(0, 8)}`;
  }

  /**
   * Get delivery mode for alert level
   */
  private getDeliveryMode(level: 'info' | 'warning' | 'critical'): string {
    if (level === 'critical') return 'immediate';
    if (level === 'warning' && this.config.severity_thresholds.warning.batch_delivery) return 'batch';
    if (level === 'info' && this.config.severity_thresholds.info.digest_only) return 'digest';
    return 'immediate';
  }

  /**
   * Get enabled delivery channels
   */
  private getEnabledChannels(): string[] {
    const channels: string[] = [];
    if (this.config.webhooks.enabled) channels.push('webhook');
    if (this.config.email.enabled) channels.push('email');
    if (this.config.slack.enabled) channels.push('slack');
    return channels;
  }

  /**
   * Load default configuration
   */
  private loadDefaultConfig(): AlertConfig {
    return {
      webhooks: {
        enabled: false,
        urls: [],
        timeout: 10000,
        retry_attempts: 3
      },
      email: {
        enabled: false,
        recipients: []
      },
      slack: {
        enabled: false
      },
      rate_limiting: {
        max_alerts_per_minute: 10,
        max_alerts_per_hour: 100,
        cooldown_period_ms: 300000 // 5 minutes
      },
      severity_thresholds: {
        critical: {
          immediate_delivery: true,
          escalation_delay_ms: 60000 // 1 minute
        },
        warning: {
          batch_delivery: true,
          batch_interval_ms: 300000 // 5 minutes
        },
        info: {
          digest_only: true,
          digest_interval_ms: 1800000 // 30 minutes
        }
      }
    };
  }
}

// Export singleton instance
export const alertingService = AlertingService.getInstance();