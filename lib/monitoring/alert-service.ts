import { prisma } from '../db';
import { resendClient } from '../email/resend-client';
import { logger } from '../logging';

/**
 * Alert Service
 * Handles detection, creation, escalation, and notification of system alerts
 */

export interface AlertThreshold {
  metricName: string;
  thresholdType: 'warning' | 'critical';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  value: number;
  enabled: boolean;
  alertFrequencyMins: number;
  escalationDelayMins: number;
  description?: string;
}

export interface AlertNotificationSettings {
  emailRecipients: string[];
  webhookUrls?: string[];
  escalationRecipients?: string[];
  muteUntil?: Date;
}

export interface CreateAlertOptions {
  alertType: 'critical' | 'warning' | 'info';
  source: 'pipeline' | 'api' | 'database' | 'external';
  message: string;
  errorCode?: string;
  stackTrace?: string;
  context?: Record<string, any>;
  autoNotify?: boolean;
}

export interface SystemMetrics {
  errorRate: number;
  avgProcessingLatency: number;
  queueDepth: number;
  memoryUsage: number;
  successRate: number;
  activeJobs: number;
  errorCount: number;
}

interface RateLimitConfig {
  maxAlertsPerHour: number;
  maxAlertsPerDay: number;
  burstLimit: number;
  cooldownPeriod: number; // minutes
}

interface DeduplicationConfig {
  similarityThreshold: number; // 0-1
  timeWindow: number; // minutes
  maxDuplicates: number;
}

class AlertService {
  private notificationSettings: AlertNotificationSettings;
  private rateLimitConfig: RateLimitConfig;
  private deduplicationConfig: DeduplicationConfig;
  private alertCounts = new Map<string, { count: number; lastReset: Date }>();
  private lastNotificationTime = new Map<string, Date>();

  constructor() {
    this.notificationSettings = {
      emailRecipients: this.getDefaultAlertRecipients(),
      escalationRecipients: this.getEscalationRecipients()
    };
    
    this.rateLimitConfig = {
      maxAlertsPerHour: 10,
      maxAlertsPerDay: 50,
      burstLimit: 3,
      cooldownPeriod: 15
    };
    
    this.deduplicationConfig = {
      similarityThreshold: 0.8,
      timeWindow: 30,
      maxDuplicates: 5
    };
  }

  /**
   * Check system metrics against configured thresholds and create alerts
   */
  async checkThresholds(metrics: SystemMetrics): Promise<void> {
    try {
      const thresholds = await this.getActiveThresholds();
      
      for (const threshold of thresholds) {
        const metricValue = this.getMetricValue(metrics, threshold.metricName);
        if (metricValue === null) continue;

        const isTriggered = this.evaluateThreshold(metricValue, threshold);
        
        if (isTriggered) {
          await this.handleThresholdAlert(threshold, metricValue, metrics);
        }
      }
    } catch (error) {
      console.error('Failed to check thresholds:', error);
    }
  }

  /**
   * Create a new alert with optional immediate notification
   */
  async createAlert(options: CreateAlertOptions): Promise<string> {
    try {
      // Check for recent duplicate alerts to prevent spam
      const isDuplicate = await this.isDuplicateAlert(options);
      if (isDuplicate) {
        console.log('Duplicate alert detected, skipping creation');
        return '';
      }

      // Create the alert record
      const alert = await prisma.errorAlert.create({
        data: {
          alertType: options.alertType,
          source: options.source,
          message: options.message,
          errorCode: options.errorCode,
          stackTrace: options.stackTrace,
          context: options.context || {}
        }
      });

      // Send immediate notification for critical alerts or if requested
      if (options.autoNotify !== false && (options.alertType === 'critical' || options.autoNotify)) {
        await this.sendAlertNotification(alert);
      }

      console.log(`Alert created: ${alert.id} (${options.alertType})`);
      return alert.id;

    } catch (error) {
      console.error('Failed to create alert:', error);
      throw error;
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    await prisma.errorAlert.update({
      where: { id: alertId },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy
      }
    });
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<void> {
    await prisma.errorAlert.update({
      where: { id: alertId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        acknowledgedAt: new Date(),
        acknowledgedBy: resolvedBy
      }
    });
  }

  /**
   * Escalate unacknowledged critical alerts
   */
  async escalateAlerts(): Promise<void> {
    try {
      const now = new Date();
      const escalationThreshold = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour

      const unescalatedCriticalAlerts = await prisma.errorAlert.findMany({
        where: {
          alertType: 'critical',
          resolved: false,
          escalatedAt: null,
          createdAt: { lte: escalationThreshold }
        }
      });

      for (const alert of unescalatedCriticalAlerts) {
        await this.escalateAlert(alert);
      }

    } catch (error) {
      console.error('Failed to escalate alerts:', error);
    }
  }

  /**
   * Get active alert statistics
   */
  async getAlertStatistics(timeRange: 'hour' | 'day' | 'week' = 'day') {
    const now = new Date();
    let startTime: Date;

    switch (timeRange) {
      case 'hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }

    const [total, critical, warning, resolved] = await Promise.all([
      prisma.errorAlert.count({
        where: { createdAt: { gte: startTime } }
      }),
      prisma.errorAlert.count({
        where: { 
          createdAt: { gte: startTime },
          alertType: 'critical'
        }
      }),
      prisma.errorAlert.count({
        where: { 
          createdAt: { gte: startTime },
          alertType: 'warning'
        }
      }),
      prisma.errorAlert.count({
        where: { 
          createdAt: { gte: startTime },
          resolved: true
        }
      })
    ]);

    return {
      total,
      critical,
      warning,
      resolved,
      resolutionRate: total > 0 ? (resolved / total) * 100 : 0
    };
  }

  private async getActiveThresholds(): Promise<AlertThreshold[]> {
    return await prisma.monitoringThreshold.findMany({
      where: { enabled: true }
    });
  }

  private getMetricValue(metrics: SystemMetrics, metricName: string): number | null {
    const metricMap: Record<string, number> = {
      'error_rate_percent': metrics.errorRate,
      'avg_processing_latency_ms': metrics.avgProcessingLatency,
      'queue_depth': metrics.queueDepth,
      'memory_usage_mb': metrics.memoryUsage,
      'success_rate_percent': metrics.successRate,
      'active_jobs': metrics.activeJobs,
      'error_count': metrics.errorCount
    };

    return metricMap[metricName] ?? null;
  }

  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case 'gt': return value > threshold.value;
      case 'gte': return value >= threshold.value;
      case 'lt': return value < threshold.value;
      case 'lte': return value <= threshold.value;
      case 'eq': return value === threshold.value;
      default: return false;
    }
  }

  private async handleThresholdAlert(
    threshold: AlertThreshold, 
    metricValue: number, 
    metrics: SystemMetrics
  ): Promise<void> {
    // Check if we've recently alerted for this threshold
    const recentAlert = await this.getRecentThresholdAlert(threshold);
    if (recentAlert) return;

    // Create threshold-based alert
    const alertOptions: CreateAlertOptions = {
      alertType: threshold.thresholdType,
      source: 'pipeline',
      message: `${threshold.description || `${threshold.metricName} threshold exceeded`}. Current: ${metricValue}, Threshold: ${threshold.value}`,
      context: {
        threshold: threshold.value,
        actual: metricValue,
        metricName: threshold.metricName,
        operator: threshold.operator,
        fullMetrics: metrics
      },
      autoNotify: true
    };

    await this.createAlert(alertOptions);
  }

  private async getRecentThresholdAlert(threshold: AlertThreshold) {
    const alertWindow = new Date(Date.now() - threshold.alertFrequencyMins * 60 * 1000);
    
    return await prisma.errorAlert.findFirst({
      where: {
        source: 'pipeline',
        message: { contains: threshold.metricName },
        resolved: false,
        createdAt: { gte: alertWindow }
      }
    });
  }

  private async isDuplicateAlert(options: CreateAlertOptions): Promise<boolean> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const duplicateAlert = await prisma.errorAlert.findFirst({
      where: {
        source: options.source,
        message: options.message,
        resolved: false,
        createdAt: { gte: fiveMinutesAgo }
      }
    });

    return !!duplicateAlert;
  }

  private async sendAlertNotification(alert: any): Promise<void> {
    try {
      // Check rate limiting
      if (!await this.checkRateLimit(alert)) {
        logger.warn('Alert notification rate limited', { alertId: alert.id, alertType: alert.alertType });
        return;
      }
      
      // Check for advanced deduplication
      const duplicateInfo = await this.checkAdvancedDuplication(alert);
      if (duplicateInfo.isDuplicate) {
        await this.handleDuplicateAlert(alert, duplicateInfo);
        return;
      }
      
      const emailTemplate = this.generateAlertEmailTemplate(alert);
      const recipients = await this.getActiveRecipients();
      
      // Send to primary recipients
      for (const recipient of recipients) {
        try {
          await resendClient.sendEmail({
            to: recipient,
            subject: `[${alert.alertType.toUpperCase()}] System Alert: ${alert.source}`,
            html: emailTemplate.html,
            text: emailTemplate.text,
            tags: ['system-alert', alert.alertType, alert.source]
          });
          
          // Track notification time for rate limiting
          this.lastNotificationTime.set(recipient, new Date());
          
        } catch (emailError) {
          logger.error('Failed to send alert email to recipient', { 
            recipient, 
            alertId: alert.id, 
            error: emailError 
          });
        }
      }

      // Update notification timestamp
      await prisma.errorAlert.update({
        where: { id: alert.id },
        data: { notifiedAt: new Date() }
      });

      logger.info('Alert notification sent', { 
        alertId: alert.id, 
        alertType: alert.alertType,
        recipientCount: recipients.length 
      });

    } catch (error) {
      logger.error('Failed to send alert notification', { 
        alertId: alert.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private async escalateAlert(alert: any): Promise<void> {
    try {
      const escalationTemplate = this.generateEscalationEmailTemplate(alert);
      
      // Send to escalation recipients
      for (const recipient of this.notificationSettings.escalationRecipients || []) {
        await resendClient.sendEmail({
          to: recipient,
          subject: `[ESCALATED] Critical Alert: ${alert.source}`,
          html: escalationTemplate.html,
          text: escalationTemplate.text,
          tags: ['alert-escalation', 'critical', alert.source]
        });
      }

      // Update escalation timestamp
      await prisma.errorAlert.update({
        where: { id: alert.id },
        data: { escalatedAt: new Date() }
      });

      console.log(`Alert escalated: ${alert.id}`);

    } catch (error) {
      console.error('Failed to escalate alert:', error);
    }
  }

  private generateAlertEmailTemplate(alert: any) {
    const severity = alert.alertType === 'critical' ? '🚨' : alert.alertType === 'warning' ? '⚠️' : 'ℹ️';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${alert.alertType === 'critical' ? '#fee2e2' : '#fef3c7'}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: ${alert.alertType === 'critical' ? '#dc2626' : '#d97706'};">
            ${severity} System Alert
          </h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; font-weight: bold;">
            ${alert.alertType.toUpperCase()} - ${alert.source.toUpperCase()}
          </p>
        </div>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin-top: 0;">Alert Details</h3>
          <p><strong>Message:</strong> ${alert.message}</p>
          <p><strong>Time:</strong> ${new Date(alert.createdAt).toLocaleString()}</p>
          <p><strong>Alert ID:</strong> ${alert.id}</p>
          ${alert.errorCode ? `<p><strong>Error Code:</strong> ${alert.errorCode}</p>` : ''}
        </div>

        ${alert.context ? `
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin-top: 0;">Additional Context</h4>
            <pre style="font-size: 12px; overflow-x: auto;">${JSON.stringify(alert.context, null, 2)}</pre>
          </div>
        ` : ''}

        <div style="text-align: center; padding: 20px;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/monitoring" 
             style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Monitoring Dashboard
          </a>
        </div>

        <div style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 20px;">
          <p>This is an automated alert from tldr;sec AI monitoring system.</p>
        </div>
      </div>
    `;

    const text = `
      ${severity} SYSTEM ALERT - ${alert.alertType.toUpperCase()}
      
      Source: ${alert.source}
      Message: ${alert.message}
      Time: ${new Date(alert.createdAt).toLocaleString()}
      Alert ID: ${alert.id}
      ${alert.errorCode ? `Error Code: ${alert.errorCode}` : ''}
      
      ${alert.context ? `Context: ${JSON.stringify(alert.context, null, 2)}` : ''}
      
      View monitoring dashboard: ${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/monitoring
    `;

    return { html, text };
  }

  private generateEscalationEmailTemplate(alert: any) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #dc2626;">
          <h1 style="margin: 0; color: #dc2626;">🚨 ESCALATED CRITICAL ALERT</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; font-weight: bold; color: #dc2626;">
            REQUIRES IMMEDIATE ATTENTION
          </p>
        </div>
        
        <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #dc2626;">Unresolved Critical Alert</h3>
          <p><strong>Message:</strong> ${alert.message}</p>
          <p><strong>Created:</strong> ${new Date(alert.createdAt).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${this.getAlertDuration(alert.createdAt)}</p>
          <p><strong>Alert ID:</strong> ${alert.id}</p>
        </div>

        <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
          <h3 style="margin: 0;">⚡ IMMEDIATE ACTION REQUIRED ⚡</h3>
          <p style="margin: 10px 0 0 0;">This critical alert has not been acknowledged and requires immediate investigation.</p>
        </div>

        <div style="text-align: center; padding: 20px;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/monitoring" 
             style="background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            INVESTIGATE NOW
          </a>
        </div>
      </div>
    `;

    const text = `
      🚨 ESCALATED CRITICAL ALERT - IMMEDIATE ACTION REQUIRED
      
      This critical alert has not been acknowledged and requires immediate investigation.
      
      Message: ${alert.message}
      Created: ${new Date(alert.createdAt).toLocaleString()}
      Duration: ${this.getAlertDuration(alert.createdAt)}
      Alert ID: ${alert.id}
      
      INVESTIGATE NOW: ${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/monitoring
    `;

    return { html, text };
  }

  private getAlertDuration(createdAt: string): string {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
  }

  private getDefaultAlertRecipients(): string[] {
    // In production, this would come from environment variables or database config
    const defaultRecipients = process.env.ALERT_EMAIL_RECIPIENTS;
    if (defaultRecipients) {
      return defaultRecipients.split(',').map(email => email.trim());
    }
    
    // Fallback for development
    return ['admin@tldrsec.app'];
  }

  private getEscalationRecipients(): string[] {
    const escalationRecipients = process.env.ESCALATION_EMAIL_RECIPIENTS;
    if (escalationRecipients) {
      return escalationRecipients.split(',').map(email => email.trim());
    }
    
    // Fallback to default recipients
    return this.getDefaultAlertRecipients();
  }
  
  /**
   * Check if alert can be sent based on rate limiting rules
   */
  private async checkRateLimit(alert: any): Promise<boolean> {
    const now = new Date();
    const alertKey = `${alert.alertType}-${alert.source}`;
    
    // Get current alert counts
    let alertCount = this.alertCounts.get(alertKey);
    if (!alertCount) {
      alertCount = { count: 0, lastReset: now };
      this.alertCounts.set(alertKey, alertCount);
    }
    
    // Reset counters if enough time has passed
    const hoursSinceReset = (now.getTime() - alertCount.lastReset.getTime()) / (1000 * 60 * 60);
    if (hoursSinceReset >= 1) {
      alertCount.count = 0;
      alertCount.lastReset = now;
    }
    
    // Check burst limit for critical alerts
    if (alert.alertType === 'critical') {
      const recentCriticalAlerts = await this.getRecentAlertCount('critical', 15); // Last 15 minutes
      if (recentCriticalAlerts >= this.rateLimitConfig.burstLimit) {
        return false;
      }
    }
    
    // Check hourly limit
    if (alertCount.count >= this.rateLimitConfig.maxAlertsPerHour) {
      return false;
    }
    
    // Check daily limit
    const dailyCount = await this.getDailyAlertCount(alertKey);
    if (dailyCount >= this.rateLimitConfig.maxAlertsPerDay) {
      return false;
    }
    
    // Check cooldown period
    const lastNotification = this.lastNotificationTime.get(alertKey);
    if (lastNotification) {
      const minutesSinceLastNotification = (now.getTime() - lastNotification.getTime()) / (1000 * 60);
      if (minutesSinceLastNotification < this.rateLimitConfig.cooldownPeriod && alert.alertType !== 'critical') {
        return false;
      }
    }
    
    // Increment counter
    alertCount.count++;
    return true;
  }
  
  /**
   * Advanced deduplication checking
   */
  private async checkAdvancedDuplication(alert: any): Promise<{
    isDuplicate: boolean;
    duplicateCount: number;
    originalAlert?: any;
    similarity?: number;
  }> {
    const timeWindow = new Date(Date.now() - this.deduplicationConfig.timeWindow * 60 * 1000);
    
    // Find recent similar alerts
    const recentAlerts = await prisma.errorAlert.findMany({
      where: {
        source: alert.source,
        alertType: alert.alertType,
        resolved: false,
        createdAt: { gte: timeWindow }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Check for exact duplicates first
    const exactDuplicate = recentAlerts.find(existing => 
      existing.message === alert.message && 
      existing.errorCode === alert.errorCode
    );
    
    if (exactDuplicate) {
      const duplicateCount = recentAlerts.filter(existing => 
        existing.message === alert.message
      ).length;
      
      return {
        isDuplicate: duplicateCount >= this.deduplicationConfig.maxDuplicates,
        duplicateCount,
        originalAlert: exactDuplicate,
        similarity: 1.0
      };
    }
    
    // Check for similar alerts using fuzzy matching
    for (const existing of recentAlerts) {
      const similarity = this.calculateMessageSimilarity(alert.message, existing.message);
      if (similarity >= this.deduplicationConfig.similarityThreshold) {
        const similarCount = recentAlerts.filter(otherAlert => 
          this.calculateMessageSimilarity(alert.message, otherAlert.message) >= this.deduplicationConfig.similarityThreshold
        ).length;
        
        return {
          isDuplicate: similarCount >= this.deduplicationConfig.maxDuplicates,
          duplicateCount: similarCount,
          originalAlert: existing,
          similarity
        };
      }
    }
    
    return { isDuplicate: false, duplicateCount: 0 };
  }
  
  /**
   * Handle duplicate alert by updating the original
   */
  private async handleDuplicateAlert(alert: any, duplicateInfo: any): Promise<void> {
    if (duplicateInfo.originalAlert) {
      // Update the original alert with occurrence count
      const context = duplicateInfo.originalAlert.context || {};
      context.duplicateCount = (context.duplicateCount || 1) + 1;
      context.lastDuplicateAt = new Date();
      context.duplicateSimilarity = duplicateInfo.similarity;
      
      await prisma.errorAlert.update({
        where: { id: duplicateInfo.originalAlert.id },
        data: {
          context: context,
          updatedAt: new Date()
        }
      });
      
      logger.info('Duplicate alert handled', {
        originalAlertId: duplicateInfo.originalAlert.id,
        duplicateCount: context.duplicateCount,
        similarity: duplicateInfo.similarity
      });
    }
  }
  
  /**
   * Calculate message similarity using Levenshtein distance
   */
  private calculateMessageSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;
    
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
    
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len1][len2]) / maxLen;
  }
  
  /**
   * Get recent alert count for a specific type
   */
  private async getRecentAlertCount(alertType: string, minutes: number): Promise<number> {
    const timeWindow = new Date(Date.now() - minutes * 60 * 1000);
    
    return await prisma.errorAlert.count({
      where: {
        alertType,
        createdAt: { gte: timeWindow }
      }
    });
  }
  
  /**
   * Get daily alert count for rate limiting
   */
  private async getDailyAlertCount(alertKey: string): Promise<number> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    
    const [alertType, source] = alertKey.split('-');
    
    return await prisma.errorAlert.count({
      where: {
        alertType,
        source,
        createdAt: { gte: dayStart }
      }
    });
  }
  
  /**
   * Get active recipients (excluding muted ones)
   */
  private async getActiveRecipients(): Promise<string[]> {
    // Check if notifications are globally muted
    if (this.notificationSettings.muteUntil && new Date() < this.notificationSettings.muteUntil) {
      return [];
    }
    
    return this.notificationSettings.emailRecipients;
  }
  
  /**
   * Temporarily mute notifications
   */
  async muteNotifications(durationMinutes: number): Promise<void> {
    this.notificationSettings.muteUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    logger.info('Notifications muted', { until: this.notificationSettings.muteUntil });
  }
  
  /**
   * Unmute notifications
   */
  async unmuteNotifications(): Promise<void> {
    this.notificationSettings.muteUntil = undefined;
    logger.info('Notifications unmuted');
  }
}

// Export both class and singleton instance
export { AlertService };
export const alertService = new AlertService();