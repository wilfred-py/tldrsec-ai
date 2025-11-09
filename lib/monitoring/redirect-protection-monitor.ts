/**
 * Monitoring and alerting system for redirect loop protection
 * Tracks patterns, performance, and security issues
 */

import { logger } from '@/lib/logging';

const redirectLogger = logger.child('redirect-protection');

export interface RedirectMetrics {
  timestamp: number;
  path: string;
  redirectCount: number;
  isLoop: boolean;
  reason?: string;
  variant?: string;
  bypassUsed: boolean;
  bypassReason?: string;
  targetValid: boolean;
  executionTimeMs: number;
  userAgent?: string;
  ipAddress?: string;
}

export interface RedirectAlert {
  id: string;
  type: 'LOOP_DETECTED' | 'HIGH_REDIRECT_RATE' | 'BYPASS_ABUSE' | 'TARGET_INVALID' | 'PERFORMANCE_DEGRADATION';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: number;
  count?: number;
}

/**
 * Redirect Protection Monitoring System
 */
export class RedirectProtectionMonitor {
  private static instance: RedirectProtectionMonitor;
  private metrics: RedirectMetrics[] = [];
  private alerts: RedirectAlert[] = [];
  private readonly MAX_METRICS_HISTORY = 1000;
  private readonly MAX_ALERTS_HISTORY = 100;
  private readonly ALERT_THRESHOLDS = {
    LOOP_RATE_PER_MINUTE: 10,
    HIGH_REDIRECT_RATE_PER_MINUTE: 50,
    BYPASS_RATE_PER_HOUR: 100,
    INVALID_TARGET_RATE_PER_HOUR: 20,
    MAX_EXECUTION_TIME_MS: 100
  };

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): RedirectProtectionMonitor {
    if (!this.instance) {
      this.instance = new RedirectProtectionMonitor();
    }
    return this.instance;
  }

  /**
   * Record redirect metrics
   */
  recordRedirect(metrics: RedirectMetrics): void {
    try {
      // Add to metrics history
      this.metrics.push(metrics);

      // Trim history to prevent memory growth
      if (this.metrics.length > this.MAX_METRICS_HISTORY) {
        this.metrics.splice(0, this.metrics.length - this.MAX_METRICS_HISTORY);
      }

      // Log the metric
      redirectLogger.info('Redirect metric recorded', {
        path: metrics.path,
        redirectCount: metrics.redirectCount,
        isLoop: metrics.isLoop,
        bypassUsed: metrics.bypassUsed,
        targetValid: metrics.targetValid,
        executionTimeMs: metrics.executionTimeMs
      });

      // Check for alert conditions
      this.checkAlertConditions(metrics);

    } catch (error) {
      redirectLogger.error('Failed to record redirect metric', { error, metrics });
    }
  }

  /**
   * Record loop detection event
   */
  recordLoop(path: string, count: number, reason: string, details?: Record<string, any>): void {
    const metrics: RedirectMetrics = {
      timestamp: Date.now(),
      path,
      redirectCount: count,
      isLoop: true,
      reason,
      bypassUsed: false,
      targetValid: true,
      executionTimeMs: 0,
      ...details
    };

    this.recordRedirect(metrics);

    // Create immediate alert for loops
    this.createAlert({
      type: 'LOOP_DETECTED',
      severity: 'high',
      message: `Redirect loop detected on ${path}`,
      details: { count, reason, ...details }
    });
  }

  /**
   * Record bypass usage
   */
  recordBypass(path: string, reason: string, details?: Record<string, any>): void {
    const metrics: RedirectMetrics = {
      timestamp: Date.now(),
      path,
      redirectCount: 0,
      isLoop: false,
      bypassUsed: true,
      bypassReason: reason,
      targetValid: true,
      executionTimeMs: 0,
      ...details
    };

    this.recordRedirect(metrics);
  }

  /**
   * Record invalid target detection
   */
  recordInvalidTarget(path: string, targetPath: string, details?: Record<string, any>): void {
    const metrics: RedirectMetrics = {
      timestamp: Date.now(),
      path,
      redirectCount: 0,
      isLoop: false,
      bypassUsed: false,
      targetValid: false,
      executionTimeMs: 0,
      ...details
    };

    this.recordRedirect(metrics);

    // Create alert for invalid targets
    this.createAlert({
      type: 'TARGET_INVALID',
      severity: 'medium',
      message: `Invalid redirect target detected: ${targetPath}`,
      details: { path, targetPath, ...details }
    });
  }

  /**
   * Record performance metrics
   */
  recordPerformance(path: string, executionTimeMs: number, details?: Record<string, any>): void {
    const metrics: RedirectMetrics = {
      timestamp: Date.now(),
      path,
      redirectCount: 0,
      isLoop: false,
      bypassUsed: false,
      targetValid: true,
      executionTimeMs,
      ...details
    };

    this.recordRedirect(metrics);

    // Check for performance degradation
    if (executionTimeMs > this.ALERT_THRESHOLDS.MAX_EXECUTION_TIME_MS) {
      this.createAlert({
        type: 'PERFORMANCE_DEGRADATION',
        severity: 'medium',
        message: `Slow redirect processing detected: ${executionTimeMs}ms`,
        details: { path, executionTimeMs, ...details }
      });
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(timeWindowMs: number = 3600000): {
    totalRedirects: number;
    loopCount: number;
    bypassCount: number;
    invalidTargetCount: number;
    avgExecutionTime: number;
    topPaths: Array<{ path: string; count: number }>;
    alertCount: number;
  } {
    const cutoffTime = Date.now() - timeWindowMs;
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoffTime);
    const recentAlerts = this.alerts.filter(a => a.timestamp > cutoffTime);

    // Calculate path frequency
    const pathCounts = recentMetrics.reduce((acc, m) => {
      acc[m.path] = (acc[m.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topPaths = Object.entries(pathCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate averages
    const executionTimes = recentMetrics
      .filter(m => m.executionTimeMs > 0)
      .map(m => m.executionTimeMs);
    
    const avgExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;

    return {
      totalRedirects: recentMetrics.length,
      loopCount: recentMetrics.filter(m => m.isLoop).length,
      bypassCount: recentMetrics.filter(m => m.bypassUsed).length,
      invalidTargetCount: recentMetrics.filter(m => !m.targetValid).length,
      avgExecutionTime,
      topPaths,
      alertCount: recentAlerts.length
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 20): RedirectAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get redirect patterns for analysis
   */
  getRedirectPatterns(timeWindowMs: number = 3600000): {
    hourlyDistribution: Array<{ hour: string; count: number }>;
    pathDistribution: Array<{ path: string; loops: number; bypasses: number; total: number }>;
    userAgentDistribution: Array<{ userAgent: string; count: number }>;
    reasonDistribution: Array<{ reason: string; count: number }>;
  } {
    const cutoffTime = Date.now() - timeWindowMs;
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoffTime);

    // Hourly distribution
    const hourlyData = recentMetrics.reduce((acc, m) => {
      const hour = new Date(m.timestamp).toISOString().slice(0, 13) + ':00';
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const hourlyDistribution = Object.entries(hourlyData)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Path distribution
    const pathData = recentMetrics.reduce((acc, m) => {
      if (!acc[m.path]) {
        acc[m.path] = { loops: 0, bypasses: 0, total: 0 };
      }
      acc[m.path].total += 1;
      if (m.isLoop) acc[m.path].loops += 1;
      if (m.bypassUsed) acc[m.path].bypasses += 1;
      return acc;
    }, {} as Record<string, { loops: number; bypasses: number; total: number }>);

    const pathDistribution = Object.entries(pathData)
      .map(([path, stats]) => ({ path, ...stats }))
      .sort((a, b) => b.total - a.total);

    // User agent distribution
    const userAgentData = recentMetrics
      .filter(m => m.userAgent)
      .reduce((acc, m) => {
        const ua = m.userAgent!.slice(0, 100); // Truncate for grouping
        acc[ua] = (acc[ua] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const userAgentDistribution = Object.entries(userAgentData)
      .map(([userAgent, count]) => ({ userAgent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Reason distribution
    const reasonData = recentMetrics
      .filter(m => m.reason || m.bypassReason)
      .reduce((acc, m) => {
        const reason = m.reason || m.bypassReason || 'unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const reasonDistribution = Object.entries(reasonData)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      hourlyDistribution,
      pathDistribution,
      userAgentDistribution,
      reasonDistribution
    };
  }

  /**
   * Check for alert conditions
   */
  private checkAlertConditions(metrics: RedirectMetrics): void {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    // Check loop rate
    const loopsInLastMinute = this.metrics.filter(m => 
      m.timestamp > now - oneMinute && m.isLoop
    ).length;

    if (loopsInLastMinute >= this.ALERT_THRESHOLDS.LOOP_RATE_PER_MINUTE) {
      this.createAlert({
        type: 'LOOP_DETECTED',
        severity: 'critical',
        message: `High loop rate detected: ${loopsInLastMinute} loops in last minute`,
        details: { count: loopsInLastMinute, threshold: this.ALERT_THRESHOLDS.LOOP_RATE_PER_MINUTE }
      });
    }

    // Check redirect rate
    const redirectsInLastMinute = this.metrics.filter(m => 
      m.timestamp > now - oneMinute
    ).length;

    if (redirectsInLastMinute >= this.ALERT_THRESHOLDS.HIGH_REDIRECT_RATE_PER_MINUTE) {
      this.createAlert({
        type: 'HIGH_REDIRECT_RATE',
        severity: 'medium',
        message: `High redirect rate detected: ${redirectsInLastMinute} redirects in last minute`,
        details: { count: redirectsInLastMinute, threshold: this.ALERT_THRESHOLDS.HIGH_REDIRECT_RATE_PER_MINUTE }
      });
    }

    // Check bypass abuse
    const bypassesInLastHour = this.metrics.filter(m => 
      m.timestamp > now - oneHour && m.bypassUsed
    ).length;

    if (bypassesInLastHour >= this.ALERT_THRESHOLDS.BYPASS_RATE_PER_HOUR) {
      this.createAlert({
        type: 'BYPASS_ABUSE',
        severity: 'medium',
        message: `High bypass usage detected: ${bypassesInLastHour} bypasses in last hour`,
        details: { count: bypassesInLastHour, threshold: this.ALERT_THRESHOLDS.BYPASS_RATE_PER_HOUR }
      });
    }
  }

  /**
   * Create and store alert
   */
  private createAlert(alertData: Omit<RedirectAlert, 'id' | 'timestamp' | 'count'>): void {
    try {
      const alert: RedirectAlert = {
        id: `redirect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        count: 1,
        ...alertData
      };

      // Check for duplicate alerts in last 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const duplicateAlert = this.alerts.find(a => 
        a.type === alert.type &&
        a.timestamp > fiveMinutesAgo &&
        JSON.stringify(a.details) === JSON.stringify(alert.details)
      );

      if (duplicateAlert) {
        // Update count instead of creating new alert
        duplicateAlert.count = (duplicateAlert.count || 1) + 1;
        duplicateAlert.timestamp = alert.timestamp;
        
        redirectLogger.warn('Updated duplicate redirect alert', {
          alertId: duplicateAlert.id,
          count: duplicateAlert.count,
          type: duplicateAlert.type
        });
      } else {
        // Add new alert
        this.alerts.push(alert);

        // Trim alerts history
        if (this.alerts.length > this.MAX_ALERTS_HISTORY) {
          this.alerts.splice(0, this.alerts.length - this.MAX_ALERTS_HISTORY);
        }

        redirectLogger.warn('Redirect protection alert created', {
          alertId: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message
        });

        // Send to external alerting if critical
        if (alert.severity === 'critical') {
          this.sendCriticalAlert(alert);
        }
      }

    } catch (error) {
      redirectLogger.error('Failed to create redirect alert', { error, alertData });
    }
  }

  /**
   * Send critical alert to external systems
   */
  private async sendCriticalAlert(alert: RedirectAlert): Promise<void> {
    try {
      // In a real implementation, you might send to:
      // - Slack/Discord webhook
      // - PagerDuty
      // - Email notification
      // - Monitoring service (DataDog, New Relic, etc.)
      
      redirectLogger.error('CRITICAL REDIRECT ALERT', {
        alertId: alert.id,
        type: alert.type,
        message: alert.message,
        details: alert.details,
        timestamp: new Date(alert.timestamp).toISOString()
      });

      // Example: Send to webhook (commented out for now)
      /*
      if (process.env.ALERT_WEBHOOK_URL) {
        await fetch(process.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 CRITICAL: ${alert.message}`,
            details: alert.details,
            timestamp: alert.timestamp
          })
        });
      }
      */

    } catch (error) {
      redirectLogger.error('Failed to send critical alert', { error, alert });
    }
  }

  /**
   * Clear old data to prevent memory leaks
   */
  cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - olderThanMs;
    
    const initialMetricsCount = this.metrics.length;
    const initialAlertsCount = this.alerts.length;

    this.metrics = this.metrics.filter(m => m.timestamp > cutoffTime);
    this.alerts = this.alerts.filter(a => a.timestamp > cutoffTime);

    const removedMetrics = initialMetricsCount - this.metrics.length;
    const removedAlerts = initialAlertsCount - this.alerts.length;

    if (removedMetrics > 0 || removedAlerts > 0) {
      redirectLogger.info('Redirect monitoring data cleaned up', {
        removedMetrics,
        removedAlerts,
        remainingMetrics: this.metrics.length,
        remainingAlerts: this.alerts.length
      });
    }
  }
}

// Export singleton instance
export const redirectMonitor = RedirectProtectionMonitor.getInstance();