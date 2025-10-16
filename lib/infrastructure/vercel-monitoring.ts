/**
 * Vercel Infrastructure Monitoring & Alerting Configuration
 * Comprehensive monitoring for async processing and microservices architecture
 */

import { logger } from '../logging';

export interface MonitoringMetrics {
  // Performance metrics
  responseTime: number;
  memoryUsage: number;
  cpuUsage?: number;
  
  // Error metrics
  errorRate: number;
  errorCount: number;
  timeoutCount: number;
  
  // Throughput metrics
  requestsPerMinute: number;
  successfulRequests: number;
  failedRequests: number;
  
  // Cost metrics
  executionCost: number;
  apiCallCost: number;
  totalCost: number;
  
  // Custom metrics
  aiProcessingTime?: number;
  databaseQueryTime?: number;
  emailDeliveryTime?: number;
}

export interface AlertRule {
  metric: keyof MonitoringMetrics;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cooldownMinutes: number;
  message: string;
  action?: 'EMAIL' | 'WEBHOOK' | 'CIRCUIT_BREAKER' | 'RATE_LIMIT';
}

/**
 * Monitoring configurations by endpoint category
 */
export const MONITORING_CONFIGS = {
  // Cron endpoints - Critical for automated processing
  CRON_ENDPOINTS: {
    name: 'Cron Job Monitoring',
    endpoints: [
      '/api/cron/tier-aware',
      '/api/cron/tier-aware-async',
      '/api/cron/tier-aware-optimized',
      '/api/cron/microservices',
      '/api/cron/process-jobs'
    ],
    alertRules: [
      {
        metric: 'errorRate',
        threshold: 5, // 5% error rate
        operator: 'gt',
        severity: 'HIGH',
        cooldownMinutes: 10,
        message: 'Cron job error rate exceeded 5%',
        action: 'EMAIL'
      },
      {
        metric: 'responseTime',
        threshold: 250000, // 4 minutes (250 seconds)
        operator: 'gt',
        severity: 'MEDIUM',
        cooldownMinutes: 5,
        message: 'Cron job response time exceeded 4 minutes',
        action: 'EMAIL'
      },
      {
        metric: 'timeoutCount',
        threshold: 2,
        operator: 'gt',
        severity: 'CRITICAL',
        cooldownMinutes: 15,
        message: 'Multiple cron job timeouts detected',
        action: 'CIRCUIT_BREAKER'
      },
      {
        metric: 'memoryUsage',
        threshold: 90,
        operator: 'gt',
        severity: 'MEDIUM',
        cooldownMinutes: 10,
        message: 'Cron job memory usage exceeded 90%'
      }
    ] as AlertRule[]
  },
  
  // AI Processing endpoints - High cost monitoring
  AI_ENDPOINTS: {
    name: 'AI Processing Monitoring',
    endpoints: [
      '/api/filings/batch-summary',
      '/api/filings/enhanced-summary',
      '/api/filings/optimized-summary',
      '/api/filings/stream-summary'
    ],
    alertRules: [
      {
        metric: 'totalCost',
        threshold: 10, // $10 per hour
        operator: 'gt',
        severity: 'HIGH',
        cooldownMinutes: 60,
        message: 'AI processing costs exceeded $10/hour',
        action: 'RATE_LIMIT'
      },
      {
        metric: 'aiProcessingTime',
        threshold: 180000, // 3 minutes
        operator: 'gt',
        severity: 'MEDIUM',
        cooldownMinutes: 5,
        message: 'AI processing time exceeded 3 minutes'
      },
      {
        metric: 'errorRate',
        threshold: 10, // 10% error rate (higher tolerance for AI)
        operator: 'gt',
        severity: 'HIGH',
        cooldownMinutes: 15,
        message: 'AI endpoint error rate exceeded 10%',
        action: 'EMAIL'
      },
      {
        metric: 'memoryUsage',
        threshold: 95,
        operator: 'gt',
        severity: 'HIGH',
        cooldownMinutes: 5,
        message: 'AI endpoint memory usage exceeded 95%'
      }
    ] as AlertRule[]
  },
  
  // Email endpoints - Delivery monitoring
  EMAIL_ENDPOINTS: {
    name: 'Email Service Monitoring',
    endpoints: [
      '/api/email/filings-summary',
      '/api/email/summary',
      '/api/email/welcome'
    ],
    alertRules: [
      {
        metric: 'errorRate',
        threshold: 2, // 2% error rate
        operator: 'gt',
        severity: 'MEDIUM',
        cooldownMinutes: 10,
        message: 'Email delivery error rate exceeded 2%'
      },
      {
        metric: 'emailDeliveryTime',
        threshold: 30000, // 30 seconds
        operator: 'gt',
        severity: 'LOW',
        cooldownMinutes: 5,
        message: 'Email delivery time exceeded 30 seconds'
      },
      {
        metric: 'requestsPerMinute',
        threshold: 100, // 100 emails per minute (spam protection)
        operator: 'gt',
        severity: 'HIGH',
        cooldownMinutes: 60,
        message: 'Email rate limit exceeded - possible spam detected',
        action: 'RATE_LIMIT'
      }
    ] as AlertRule[]
  },
  
  // Health endpoints - System monitoring
  HEALTH_ENDPOINTS: {
    name: 'Health Check Monitoring',
    endpoints: [
      '/api/health',
      '/api/health/database',
      '/api/health/liveness',
      '/api/health/readiness'
    ],
    alertRules: [
      {
        metric: 'errorRate',
        threshold: 1, // 1% error rate
        operator: 'gt',
        severity: 'CRITICAL',
        cooldownMinutes: 5,
        message: 'Health check failures detected',
        action: 'EMAIL'
      },
      {
        metric: 'responseTime',
        threshold: 5000, // 5 seconds
        operator: 'gt',
        severity: 'MEDIUM',
        cooldownMinutes: 5,
        message: 'Health check response time exceeded 5 seconds'
      },
      {
        metric: 'databaseQueryTime',
        threshold: 10000, // 10 seconds
        operator: 'gt',
        severity: 'HIGH',
        cooldownMinutes: 10,
        message: 'Database response time exceeded 10 seconds',
        action: 'EMAIL'
      }
    ] as AlertRule[]
  }
};

/**
 * Global monitoring thresholds
 */
export const GLOBAL_THRESHOLDS = {
  // Budget alerts
  DAILY_BUDGET: 50, // $50 per day
  WEEKLY_BUDGET: 300, // $300 per week
  MONTHLY_BUDGET: 1000, // $1000 per month
  
  // Performance SLA targets
  P95_RESPONSE_TIME: 2000, // 2 seconds for 95th percentile
  P99_RESPONSE_TIME: 5000, // 5 seconds for 99th percentile
  UPTIME_TARGET: 99.9, // 99.9% uptime
  
  // Error rate targets
  OVERALL_ERROR_RATE: 0.1, // 0.1% overall error rate
  CRITICAL_ERROR_RATE: 0.01, // 0.01% critical error rate
  
  // Resource utilization
  MAX_MEMORY_USAGE: 85, // 85% maximum memory usage
  MAX_CPU_USAGE: 80, // 80% maximum CPU usage
  
  // Rate limiting
  GLOBAL_RATE_LIMIT: 10000, // 10,000 requests per hour per IP
  API_RATE_LIMIT: 1000, // 1,000 API calls per hour per user
  
  // Circuit breaker thresholds
  CIRCUIT_BREAKER_ERROR_THRESHOLD: 50, // 50% error rate
  CIRCUIT_BREAKER_REQUEST_THRESHOLD: 20, // Minimum 20 requests
  CIRCUIT_BREAKER_TIMEOUT: 60000 // 60 seconds
};

/**
 * Monitoring data collector
 */
export class VercelMonitoring {
  private static instance: VercelMonitoring;
  private metrics: Map<string, MonitoringMetrics> = new Map();
  private alertCooldowns: Map<string, number> = new Map();
  
  static getInstance(): VercelMonitoring {
    if (!VercelMonitoring.instance) {
      VercelMonitoring.instance = new VercelMonitoring();
    }
    return VercelMonitoring.instance;
  }
  
  /**
   * Record metrics for an endpoint
   */
  recordMetrics(endpoint: string, metrics: Partial<MonitoringMetrics>): void {
    const existing = this.metrics.get(endpoint) || this.getDefaultMetrics();
    const updated = { ...existing, ...metrics };
    this.metrics.set(endpoint, updated);
    
    // Check alert rules
    this.checkAlertRules(endpoint, updated);
  }
  
  /**
   * Get current metrics for an endpoint
   */
  getMetrics(endpoint: string): MonitoringMetrics | null {
    return this.metrics.get(endpoint) || null;
  }
  
  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, MonitoringMetrics> {
    const result: Record<string, MonitoringMetrics> = {};
    for (const [endpoint, metrics] of this.metrics.entries()) {
      result[endpoint] = metrics;
    }
    return result;
  }
  
  /**
   * Check alert rules for an endpoint
   */
  private checkAlertRules(endpoint: string, metrics: MonitoringMetrics): void {
    // Find the appropriate monitoring config
    let config = null;
    for (const [_key, cfg] of Object.entries(MONITORING_CONFIGS)) {
      if (cfg.endpoints.some(ep => endpoint.startsWith(ep))) {
        config = cfg;
        break;
      }
    }
    
    if (!config) return;
    
    // Check each alert rule
    for (const rule of config.alertRules) {
      const metricValue = metrics[rule.metric] as number;
      if (metricValue === undefined) continue;
      
      const shouldAlert = this.evaluateRule(metricValue, rule.threshold, rule.operator);
      
      if (shouldAlert) {
        this.triggerAlert(endpoint, rule, metricValue);
      }
    }
  }
  
  /**
   * Evaluate an alert rule
   */
  private evaluateRule(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }
  
  /**
   * Trigger an alert with cooldown management
   */
  private triggerAlert(endpoint: string, rule: AlertRule, value: number): void {
    const alertKey = `${endpoint}:${rule.metric}`;
    const now = Date.now();
    const lastAlert = this.alertCooldowns.get(alertKey) || 0;
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    
    // Check cooldown
    if (now - lastAlert < cooldownMs) {
      return; // Still in cooldown
    }
    
    // Record alert
    this.alertCooldowns.set(alertKey, now);
    
    // Log alert
    logger.warn('Infrastructure alert triggered', {
      endpoint,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      severity: rule.severity,
      message: rule.message,
      action: rule.action
    });
    
    // Execute alert action
    this.executeAlertAction(endpoint, rule, value);
  }
  
  /**
   * Execute alert actions
   */
  private executeAlertAction(endpoint: string, rule: AlertRule, value: number): void {
    switch (rule.action) {
      case 'EMAIL':
        this.sendAlertEmail(endpoint, rule, value);
        break;
      case 'WEBHOOK':
        this.sendAlertWebhook(endpoint, rule, value);
        break;
      case 'CIRCUIT_BREAKER':
        this.activateCircuitBreaker(endpoint);
        break;
      case 'RATE_LIMIT':
        this.activateRateLimit(endpoint);
        break;
    }
  }
  
  /**
   * Send alert email
   */
  private async sendAlertEmail(endpoint: string, rule: AlertRule, value: number): Promise<void> {
    try {
      // Implementation would integrate with email service
      logger.info('Alert email sent', {
        endpoint,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        severity: rule.severity
      });
    } catch (error) {
      logger.error('Failed to send alert email', { error, endpoint, rule });
    }
  }
  
  /**
   * Send alert webhook
   */
  private async sendAlertWebhook(endpoint: string, rule: AlertRule, value: number): Promise<void> {
    try {
      // Implementation would send webhook to monitoring service
      logger.info('Alert webhook sent', {
        endpoint,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        severity: rule.severity
      });
    } catch (error) {
      logger.error('Failed to send alert webhook', { error, endpoint, rule });
    }
  }
  
  /**
   * Activate circuit breaker for endpoint
   */
  private activateCircuitBreaker(endpoint: string): void {
    logger.warn('Circuit breaker activated', { endpoint });
    // Implementation would integrate with circuit breaker service
  }
  
  /**
   * Activate rate limiting for endpoint
   */
  private activateRateLimit(endpoint: string): void {
    logger.warn('Emergency rate limit activated', { endpoint });
    // Implementation would integrate with rate limiting service
  }
  
  /**
   * Get default metrics structure
   */
  private getDefaultMetrics(): MonitoringMetrics {
    return {
      responseTime: 0,
      memoryUsage: 0,
      errorRate: 0,
      errorCount: 0,
      timeoutCount: 0,
      requestsPerMinute: 0,
      successfulRequests: 0,
      failedRequests: 0,
      executionCost: 0,
      apiCallCost: 0,
      totalCost: 0
    };
  }
  
  /**
   * Generate monitoring report
   */
  generateReport(): {
    summary: {
      totalEndpoints: number;
      totalRequests: number;
      averageResponseTime: number;
      totalCost: number;
      overallErrorRate: number;
    };
    endpoints: Record<string, MonitoringMetrics>;
    alerts: {
      active: number;
      recent: Array<{ endpoint: string; metric: string; value: number; threshold: number; }>;
    };
  } {
    const endpoints = this.getAllMetrics();
    const endpointList = Object.values(endpoints);
    
    // Calculate summary statistics
    const totalRequests = endpointList.reduce((sum, e) => sum + e.successfulRequests + e.failedRequests, 0);
    const totalResponseTime = endpointList.reduce((sum, e) => sum + e.responseTime, 0);
    const totalCost = endpointList.reduce((sum, e) => sum + e.totalCost, 0);
    const totalErrors = endpointList.reduce((sum, e) => sum + e.failedRequests, 0);
    
    return {
      summary: {
        totalEndpoints: Object.keys(endpoints).length,
        totalRequests,
        averageResponseTime: endpointList.length > 0 ? totalResponseTime / endpointList.length : 0,
        totalCost,
        overallErrorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0
      },
      endpoints,
      alerts: {
        active: this.alertCooldowns.size,
        recent: [] // Implementation would track recent alerts
      }
    };
  }
}

/**
 * Monitoring middleware for automatic metrics collection
 */
export function createMonitoringMiddleware() {
  const monitoring = VercelMonitoring.getInstance();
  
  return async (request: Request, response: Response, next: () => Promise<void>) => {
    const startTime = Date.now();
    const endpoint = new URL(request.url).pathname;
    
    try {
      await next();
      
      // Record successful metrics
      const responseTime = Date.now() - startTime;
      monitoring.recordMetrics(endpoint, {
        responseTime,
        successfulRequests: 1,
        requestsPerMinute: 1, // Would need proper time window calculation
        errorRate: 0
      });
      
    } catch (error) {
      // Record error metrics
      const responseTime = Date.now() - startTime;
      monitoring.recordMetrics(endpoint, {
        responseTime,
        failedRequests: 1,
        errorCount: 1,
        requestsPerMinute: 1,
        errorRate: 100 // Would need proper calculation
      });
      
      throw error;
    }
  };
}

/**
 * Export singleton instance
 */
export const monitoring = VercelMonitoring.getInstance();