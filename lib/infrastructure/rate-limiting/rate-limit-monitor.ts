/**
 * Rate Limiting Monitoring and Alerting System
 * 
 * Provides comprehensive monitoring, metrics collection, and alerting
 * for all rate limiting components in the system.
 * 
 * Features:
 * - Real-time metrics collection
 * - Alert generation for rate limiting events
 * - Performance tracking and analysis
 * - Dashboard data export
 * - Automated remediation suggestions
 */

import { logger } from '../../logging';
import { monitoring } from '../../monitoring';
import { cloudflareWorkerRateLimiter } from './cloudflare-worker-enhancer';
import { vercelEndpointRateLimiter } from './vercel-endpoint-enhancer';
import { externalApiRateLimiter } from './external-api-limiter';

// Alert severity levels
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Rate limiting event types
export enum RateLimitEventType {
  RATE_LIMIT_HIT = 'rate_limit_hit',
  CIRCUIT_BREAKER_OPENED = 'circuit_breaker_opened',
  CIRCUIT_BREAKER_CLOSED = 'circuit_breaker_closed',
  QUEUE_OVERFLOW = 'queue_overflow',
  REQUEST_TIMEOUT = 'request_timeout',
  BURST_DETECTED = 'burst_detected',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  PERFORMANCE_DEGRADATION = 'performance_degradation'
}

// Rate limiting metrics
export interface RateLimitMetrics {
  timestamp: number;
  component: string;
  serviceKey: string;
  eventType: RateLimitEventType;
  severity: AlertSeverity;
  details: Record<string, unknown>;
  impact: {
    requestsBlocked: number;
    avgResponseTime: number;
    errorRate: number;
  };
  remediation?: string;
}

// Alert configuration
interface AlertConfig {
  eventType: RateLimitEventType;
  severity: AlertSeverity;
  threshold: number;
  windowMs: number;
  enabled: boolean;
  notificationChannels: string[];
}

// Default alert configurations
const DEFAULT_ALERT_CONFIGS: Record<RateLimitEventType, AlertConfig> = {
  [RateLimitEventType.RATE_LIMIT_HIT]: {
    eventType: RateLimitEventType.RATE_LIMIT_HIT,
    severity: AlertSeverity.MEDIUM,
    threshold: 10,
    windowMs: 300000, // 5 minutes
    enabled: true,
    notificationChannels: ['log', 'metrics']
  },
  [RateLimitEventType.CIRCUIT_BREAKER_OPENED]: {
    eventType: RateLimitEventType.CIRCUIT_BREAKER_OPENED,
    severity: AlertSeverity.HIGH,
    threshold: 1,
    windowMs: 60000, // 1 minute
    enabled: true,
    notificationChannels: ['log', 'metrics', 'slack']
  },
  [RateLimitEventType.CIRCUIT_BREAKER_CLOSED]: {
    eventType: RateLimitEventType.CIRCUIT_BREAKER_CLOSED,
    severity: AlertSeverity.LOW,
    threshold: 1,
    windowMs: 60000,
    enabled: true,
    notificationChannels: ['log', 'metrics']
  },
  [RateLimitEventType.QUEUE_OVERFLOW]: {
    eventType: RateLimitEventType.QUEUE_OVERFLOW,
    severity: AlertSeverity.HIGH,
    threshold: 3,
    windowMs: 600000, // 10 minutes
    enabled: true,
    notificationChannels: ['log', 'metrics', 'slack']
  },
  [RateLimitEventType.REQUEST_TIMEOUT]: {
    eventType: RateLimitEventType.REQUEST_TIMEOUT,
    severity: AlertSeverity.MEDIUM,
    threshold: 5,
    windowMs: 300000, // 5 minutes
    enabled: true,
    notificationChannels: ['log', 'metrics']
  },
  [RateLimitEventType.BURST_DETECTED]: {
    eventType: RateLimitEventType.BURST_DETECTED,
    severity: AlertSeverity.MEDIUM,
    threshold: 2,
    windowMs: 180000, // 3 minutes
    enabled: true,
    notificationChannels: ['log', 'metrics']
  },
  [RateLimitEventType.SUSPICIOUS_ACTIVITY]: {
    eventType: RateLimitEventType.SUSPICIOUS_ACTIVITY,
    severity: AlertSeverity.CRITICAL,
    threshold: 1,
    windowMs: 300000, // 5 minutes
    enabled: true,
    notificationChannels: ['log', 'metrics', 'slack', 'security']
  },
  [RateLimitEventType.PERFORMANCE_DEGRADATION]: {
    eventType: RateLimitEventType.PERFORMANCE_DEGRADATION,
    severity: AlertSeverity.HIGH,
    threshold: 2,
    windowMs: 900000, // 15 minutes
    enabled: true,
    notificationChannels: ['log', 'metrics', 'slack']
  }
};

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  RESPONSE_TIME_MS: {
    WARNING: 5000,   // 5 seconds
    CRITICAL: 15000  // 15 seconds
  },
  ERROR_RATE_PERCENT: {
    WARNING: 5,      // 5%
    CRITICAL: 15     // 15%
  },
  QUEUE_LENGTH: {
    WARNING: 50,
    CRITICAL: 100
  }
};

// Rate limiting monitor class
export class RateLimitMonitor {
  private metrics: RateLimitMetrics[] = [];
  private alertCounts = new Map<string, { count: number; windowStart: number }>();
  private readonly logger = logger.child('rate-limit-monitor');

  constructor() {
    this.logger.info('RateLimitMonitor initialized');
    
    // Start periodic monitoring
    this.startPeriodicMonitoring();
    
    // Clean up old metrics every hour
    setInterval(() => this.cleanupOldMetrics(), 3600000);
  }

  /**
   * Record a rate limiting event
   */
  recordEvent(
    component: string,
    serviceKey: string,
    eventType: RateLimitEventType,
    details: Record<string, unknown> = {},
    impact?: Partial<RateLimitMetrics['impact']>
  ): void {
    const metrics: RateLimitMetrics = {
      timestamp: Date.now(),
      component,
      serviceKey,
      eventType,
      severity: this.calculateSeverity(eventType, details),
      details,
      impact: {
        requestsBlocked: impact?.requestsBlocked || 0,
        avgResponseTime: impact?.avgResponseTime || 0,
        errorRate: impact?.errorRate || 0
      },
      remediation: this.generateRemediation(eventType, details)
    };

    // Store metrics
    this.metrics.push(metrics);

    // Log the event
    this.logEvent(metrics);

    // Check if alert should be triggered
    this.checkAndTriggerAlert(metrics);

    // Record to monitoring system
    this.recordToMonitoring(metrics);
  }

  /**
   * Calculate severity based on event type and details
   */
  private calculateSeverity(
    eventType: RateLimitEventType,
    details: Record<string, unknown>
  ): AlertSeverity {
    const baseConfig = DEFAULT_ALERT_CONFIGS[eventType];
    let severity = baseConfig.severity;

    // Escalate severity based on specific conditions
    switch (eventType) {
      case RateLimitEventType.RATE_LIMIT_HIT:
        if (details.consecutiveHits > 10) {
          severity = AlertSeverity.HIGH;
        }
        break;
        
      case RateLimitEventType.QUEUE_OVERFLOW:
        if (details.queueLength > PERFORMANCE_THRESHOLDS.QUEUE_LENGTH.CRITICAL) {
          severity = AlertSeverity.CRITICAL;
        }
        break;
        
      case RateLimitEventType.PERFORMANCE_DEGRADATION:
        if (details.responseTime > PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS.CRITICAL ||
            details.errorRate > PERFORMANCE_THRESHOLDS.ERROR_RATE_PERCENT.CRITICAL) {
          severity = AlertSeverity.CRITICAL;
        }
        break;
    }

    return severity;
  }

  /**
   * Generate remediation suggestions
   */
  private generateRemediation(
    eventType: RateLimitEventType,
    _details: Record<string, unknown>
  ): string {
    const remediations: Record<RateLimitEventType, string> = {
      [RateLimitEventType.RATE_LIMIT_HIT]: 
        'Consider increasing rate limits or implementing request queuing. Check for traffic spikes.',
      [RateLimitEventType.CIRCUIT_BREAKER_OPENED]: 
        'Investigate downstream service health. Check for high error rates or timeouts.',
      [RateLimitEventType.CIRCUIT_BREAKER_CLOSED]: 
        'Circuit breaker recovered. Monitor for stability.',
      [RateLimitEventType.QUEUE_OVERFLOW]: 
        'Increase queue capacity or processing rate. Check for processing bottlenecks.',
      [RateLimitEventType.REQUEST_TIMEOUT]: 
        'Investigate slow upstream services. Consider increasing timeout values.',
      [RateLimitEventType.BURST_DETECTED]: 
        'Normal traffic burst detected. Monitor for sustained high traffic.',
      [RateLimitEventType.SUSPICIOUS_ACTIVITY]: 
        'Potential attack detected. Review request patterns and consider blocking sources.',
      [RateLimitEventType.PERFORMANCE_DEGRADATION]: 
        'Performance issues detected. Check system resources and optimize processing.'
    };

    return remediations[eventType] || 'No specific remediation available.';
  }

  /**
   * Log the event with appropriate level
   */
  private logEvent(metrics: RateLimitMetrics): void {
    const logData = {
      component: metrics.component,
      serviceKey: metrics.serviceKey,
      eventType: metrics.eventType,
      severity: metrics.severity,
      details: metrics.details,
      impact: metrics.impact,
      remediation: metrics.remediation
    };

    switch (metrics.severity) {
      case AlertSeverity.CRITICAL:
        this.logger.error('CRITICAL rate limiting event', logData);
        break;
      case AlertSeverity.HIGH:
        this.logger.warn('HIGH severity rate limiting event', logData);
        break;
      case AlertSeverity.MEDIUM:
        this.logger.warn('MEDIUM severity rate limiting event', logData);
        break;
      case AlertSeverity.LOW:
        this.logger.info('Rate limiting event', logData);
        break;
    }
  }

  /**
   * Check if alert should be triggered
   */
  private checkAndTriggerAlert(metrics: RateLimitMetrics): void {
    const config = DEFAULT_ALERT_CONFIGS[metrics.eventType];
    if (!config.enabled) return;

    const alertKey = `${metrics.component}:${metrics.eventType}`;
    const now = Date.now();
    
    // Get or initialize alert count
    let alertData = this.alertCounts.get(alertKey);
    if (!alertData || (now - alertData.windowStart) > config.windowMs) {
      alertData = { count: 0, windowStart: now };
      this.alertCounts.set(alertKey, alertData);
    }

    // Increment count
    alertData.count++;

    // Check if threshold is met
    if (alertData.count >= config.threshold) {
      this.triggerAlert(metrics, config, alertData.count);
      // Reset count after triggering alert
      alertData.count = 0;
      alertData.windowStart = now;
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(
    metrics: RateLimitMetrics,
    config: AlertConfig,
    eventCount: number
  ): void {
    const alertData = {
      title: `Rate Limiting Alert: ${metrics.eventType}`,
      severity: metrics.severity,
      component: metrics.component,
      serviceKey: metrics.serviceKey,
      eventType: metrics.eventType,
      eventCount,
      timeWindow: `${config.windowMs / 1000}s`,
      details: metrics.details,
      impact: metrics.impact,
      remediation: metrics.remediation,
      timestamp: new Date(metrics.timestamp).toISOString()
    };

    // Send to configured notification channels
    for (const channel of config.notificationChannels) {
      this.sendNotification(channel, alertData);
    }

    this.logger.warn('Rate limiting alert triggered', alertData);
  }

  /**
   * Send notification to specific channel
   */
  private sendNotification(channel: string, alertData: unknown): void {
    switch (channel) {
      case 'log':
        // Already logged above
        break;
      case 'metrics':
        monitoring.incrementCounter('rate_limiter.alert.triggered', 1, {
          severity: alertData.severity,
          eventType: alertData.eventType,
          component: alertData.component
        });
        break;
      case 'slack':
        // Could implement Slack webhook integration
        this.logger.info('Slack notification would be sent', { alertData });
        break;
      case 'security':
        // Could implement security team notification
        this.logger.error('Security team notification required', { alertData });
        break;
    }
  }

  /**
   * Record metrics to monitoring system
   */
  private recordToMonitoring(metrics: RateLimitMetrics): void {
    // Record event occurrence
    monitoring.incrementCounter('rate_limiter.events', 1, {
      component: metrics.component,
      serviceKey: metrics.serviceKey,
      eventType: metrics.eventType,
      severity: metrics.severity
    });

    // Record impact metrics
    if (metrics.impact.requestsBlocked > 0) {
      monitoring.incrementCounter('rate_limiter.requests_blocked', metrics.impact.requestsBlocked, {
        component: metrics.component,
        serviceKey: metrics.serviceKey
      });
    }

    if (metrics.impact.avgResponseTime > 0) {
      monitoring.recordTiming('rate_limiter.response_time', metrics.impact.avgResponseTime, {
        component: metrics.component,
        serviceKey: metrics.serviceKey
      });
    }

    if (metrics.impact.errorRate > 0) {
      monitoring.recordGauge('rate_limiter.error_rate', metrics.impact.errorRate, {
        component: metrics.component,
        serviceKey: metrics.serviceKey
      });
    }
  }

  /**
   * Start periodic monitoring of rate limiting components
   */
  private startPeriodicMonitoring(): void {
    // Monitor every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Perform health checks every 5 minutes
    setInterval(() => {
      this.performHealthChecks();
    }, 300000);
  }

  /**
   * Collect metrics from all rate limiting components
   */
  private collectSystemMetrics(): void {
    try {
      // Collect Cloudflare Worker rate limiter status
      const cfStatus = cloudflareWorkerRateLimiter.getStatus();
      this.processComponentStatus('cloudflare-worker', cfStatus);

      // Collect Vercel endpoint rate limiter status
      const vercelStatus = vercelEndpointRateLimiter.getMetrics();
      this.processComponentStatus('vercel-endpoint', vercelStatus);

      // Collect external API rate limiter status
      const externalStatus = externalApiRateLimiter.getStatus();
      this.processComponentStatus('external-api', externalStatus);

    } catch (error) {
      this.logger.error('Error collecting system metrics', {
        error: error.message
      });
    }
  }

  /**
   * Process status from a component
   */
  private processComponentStatus(component: string, status: unknown): void {
    // Check for circuit breaker states
    if (status.circuitBreakers) {
      for (const cb of status.circuitBreakers) {
        if (cb.isOpen) {
          this.recordEvent(
            component,
            cb.key,
            RateLimitEventType.CIRCUIT_BREAKER_OPENED,
            { circuitBreakerState: cb }
          );
        }
      }
    }

    // Check queue lengths
    if (status.queueLengths) {
      for (const queue of status.queueLengths) {
        if (queue.length > PERFORMANCE_THRESHOLDS.QUEUE_LENGTH.WARNING) {
          this.recordEvent(
            component,
            queue.priority || 'default',
            RateLimitEventType.QUEUE_OVERFLOW,
            { queueLength: queue.length, threshold: PERFORMANCE_THRESHOLDS.QUEUE_LENGTH.WARNING }
          );
        }
      }
    }

    // Check for performance issues
    if (status.averageWaitTime > PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS.WARNING) {
      this.recordEvent(
        component,
        'system',
        RateLimitEventType.PERFORMANCE_DEGRADATION,
        { 
          responseTime: status.averageWaitTime,
          threshold: PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS.WARNING
        },
        { avgResponseTime: status.averageWaitTime }
      );
    }
  }

  /**
   * Perform health checks on rate limiting system
   */
  private performHealthChecks(): void {
    const healthStatus = {
      cloudflareWorker: this.checkComponentHealth('cloudflare-worker'),
      vercelEndpoint: this.checkComponentHealth('vercel-endpoint'),
      externalApi: this.checkComponentHealth('external-api')
    };

    this.logger.debug('Rate limiting health check completed', healthStatus);

    // Record overall health metrics
    monitoring.recordGauge('rate_limiter.health_score', this.calculateOverallHealth(healthStatus), {
      timestamp: Date.now().toString()
    });
  }

  /**
   * Check health of a specific component
   */
  private checkComponentHealth(component: string): number {
    const recentMetrics = this.getRecentMetrics(component, 300000); // Last 5 minutes
    
    if (recentMetrics.length === 0) return 100; // No issues

    const criticalEvents = recentMetrics.filter(m => 
      m.severity === AlertSeverity.CRITICAL
    ).length;
    
    const highEvents = recentMetrics.filter(m => 
      m.severity === AlertSeverity.HIGH
    ).length;

    // Calculate health score (0-100)
    let healthScore = 100;
    healthScore -= criticalEvents * 30;
    healthScore -= highEvents * 15;

    return Math.max(0, healthScore);
  }

  /**
   * Calculate overall system health
   */
  private calculateOverallHealth(healthStatus: Record<string, number>): number {
    const scores = Object.values(healthStatus);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Get recent metrics for a component
   */
  private getRecentMetrics(component: string, windowMs: number): RateLimitMetrics[] {
    const cutoff = Date.now() - windowMs;
    return this.metrics.filter(m => 
      m.component === component && m.timestamp >= cutoff
    );
  }

  /**
   * Clean up old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const originalLength = this.metrics.length;
    
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    const cleaned = originalLength - this.metrics.length;
    if (cleaned > 0) {
      this.logger.debug('Cleaned up old metrics', {
        removed: cleaned,
        remaining: this.metrics.length
      });
    }
  }

  /**
   * Get metrics for dashboard
   */
  public getDashboardMetrics(windowMs: number = 3600000): Record<string, unknown> {
    const cutoff = Date.now() - windowMs;
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);

    return {
      totalEvents: recentMetrics.length,
      eventsByType: this.groupBy(recentMetrics, 'eventType'),
      eventsBySeverity: this.groupBy(recentMetrics, 'severity'),
      eventsByComponent: this.groupBy(recentMetrics, 'component'),
      averageResponseTime: this.calculateAverage(recentMetrics, 'impact.avgResponseTime'),
      totalRequestsBlocked: recentMetrics.reduce((sum, m) => sum + m.impact.requestsBlocked, 0),
      healthScores: {
        cloudflareWorker: this.checkComponentHealth('cloudflare-worker'),
        vercelEndpoint: this.checkComponentHealth('vercel-endpoint'),
        externalApi: this.checkComponentHealth('external-api')
      }
    };
  }

  /**
   * Group metrics by field
   */
  private groupBy(metrics: RateLimitMetrics[], field: string): Record<string, number> {
    return metrics.reduce((acc, metric) => {
      const key = this.getNestedProperty(metric, field);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Calculate average of a numeric field
   */
  private calculateAverage(metrics: RateLimitMetrics[], field: string): number {
    const values = metrics
      .map(m => this.getNestedProperty(m, field))
      .filter(v => typeof v === 'number' && v > 0);
    
    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  }

  /**
   * Get nested property value
   */
  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

// Export singleton instance
export const rateLimitMonitor = new RateLimitMonitor();