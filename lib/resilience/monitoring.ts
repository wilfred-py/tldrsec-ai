/**
 * Production monitoring and alerting utilities
 * 
 * Features:
 * - Health check endpoint utilities
 * - Metrics collection and reporting
 * - Alert trigger conditions
 * - Service status aggregation
 * - Performance monitoring
 * - Cost tracking integration
 */

import { logger } from '../logging';
import { CircuitBreakerRegistry, CircuitState } from './circuit-breaker';
import { GlobalErrorHandler, ErrorSeverity } from './error-handling';

const monitoringLogger = logger.child('monitoring');

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  responseTime: number;
  details?: Record<string, any>;
  error?: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  uptime: number;
  dependencies: Record<string, HealthCheckResult>;
}

export interface SystemMetrics {
  timestamp: Date;
  services: Record<string, ServiceHealth>;
  circuitBreakers: Record<string, any>;
  errors: {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    recent: any[];
  };
  performance: {
    averageResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
  };
  costs: {
    totalToday: number;
    byTier: Record<string, number>;
    averagePerOperation: number;
  };
}

export interface AlertCondition {
  name: string;
  condition: (metrics: SystemMetrics) => boolean;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  cooldownMinutes: number;
}

/**
 * Health check utility for individual services
 */
export abstract class HealthCheck {
  protected name: string;
  protected startTime: Date = new Date();

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Perform health check
   */
  abstract check(): Promise<HealthCheckResult>;

  /**
   * Get service uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Execute health check with timeout and error handling
   */
  async executeCheck(timeoutMs: number = 5000): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Health check timeout after ${timeoutMs}ms`)), timeoutMs)
      );
      
      const result = await Promise.race([
        this.check(),
        timeoutPromise
      ]);
      
      const responseTime = Date.now() - startTime;
      
      return {
        ...result,
        timestamp: new Date(),
        responseTime
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Database health check
 */
export class DatabaseHealthCheck extends HealthCheck {
  constructor(private prisma: any) {
    super('database');
  }

  async check(): Promise<HealthCheckResult> {
    try {
      // Simple query to test database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'healthy',
        timestamp: new Date(),
        responseTime: 0, // Will be set by executeCheck
        details: {
          connection: 'active'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime: 0,
        error: error instanceof Error ? error.message : 'Database connection failed'
      };
    }
  }
}

/**
 * AI service health check
 */
export class AIServiceHealthCheck extends HealthCheck {
  constructor(private apiKey: string) {
    super('ai-service');
  }

  async check(): Promise<HealthCheckResult> {
    if (!this.apiKey) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime: 0,
        error: 'API key not configured'
      };
    }

    try {
      // Simple test request to AI service
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      if (response.ok || response.status === 400) {
        // 400 is expected for minimal test request
        return {
          status: 'healthy',
          timestamp: new Date(),
          responseTime: 0,
          details: {
            apiAvailable: true,
            statusCode: response.status
          }
        };
      } else {
        return {
          status: 'degraded',
          timestamp: new Date(),
          responseTime: 0,
          details: {
            apiAvailable: false,
            statusCode: response.status
          }
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime: 0,
        error: error instanceof Error ? error.message : 'AI service unavailable'
      };
    }
  }
}

/**
 * Email service health check
 */
export class EmailServiceHealthCheck extends HealthCheck {
  constructor(private apiKey: string) {
    super('email-service');
  }

  async check(): Promise<HealthCheckResult> {
    if (!this.apiKey) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime: 0,
        error: 'Email API key not configured'
      };
    }

    try {
      // Test email service availability
      const response = await fetch('https://api.resend.com/domains', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (response.ok) {
        return {
          status: 'healthy',
          timestamp: new Date(),
          responseTime: 0,
          details: {
            serviceAvailable: true
          }
        };
      } else {
        return {
          status: 'degraded',
          timestamp: new Date(),
          responseTime: 0,
          details: {
            serviceAvailable: false,
            statusCode: response.status
          }
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime: 0,
        error: error instanceof Error ? error.message : 'Email service unavailable'
      };
    }
  }
}

/**
 * Comprehensive system monitor
 */
export class SystemMonitor {
  private static instance: SystemMonitor;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private metrics: SystemMetrics[] = [];
  private alertConditions: AlertCondition[] = [];
  private lastAlerts: Map<string, Date> = new Map();
  private performanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    errorCount: 0,
    lastMinuteRequests: 0,
    lastMinuteTimestamp: Date.now()
  };

  private constructor() {}

  static getInstance(): SystemMonitor {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  /**
   * Register health check
   */
  registerHealthCheck(healthCheck: HealthCheck): void {
    this.healthChecks.set(healthCheck['name'], healthCheck);
    monitoringLogger.info(`Health check registered: ${healthCheck['name']}`);
  }

  /**
   * Register alert condition
   */
  registerAlert(condition: AlertCondition): void {
    this.alertConditions.push(condition);
    monitoringLogger.info(`Alert condition registered: ${condition.name}`);
  }

  /**
   * Record performance metrics
   */
  recordRequest(responseTime: number, success: boolean): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    
    if (!success) {
      this.performanceMetrics.errorCount++;
    }

    // Update per-minute metrics
    const now = Date.now();
    if (now - this.performanceMetrics.lastMinuteTimestamp >= 60000) {
      this.performanceMetrics.lastMinuteRequests = 0;
      this.performanceMetrics.lastMinuteTimestamp = now;
    }
    this.performanceMetrics.lastMinuteRequests++;
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<SystemMetrics> {
    const timestamp = new Date();
    const services: Record<string, ServiceHealth> = {};

    // Execute all health checks
    for (const [name, healthCheck] of this.healthChecks) {
      try {
        const result = await healthCheck.executeCheck();
        
        services[name] = {
          name,
          status: result.status,
          lastCheck: result.timestamp,
          responseTime: result.responseTime,
          uptime: healthCheck.getUptime(),
          dependencies: {}
        };
      } catch (error) {
        services[name] = {
          name,
          status: 'unhealthy',
          lastCheck: timestamp,
          responseTime: 0,
          uptime: healthCheck.getUptime(),
          dependencies: {}
        };
      }
    }

    // Get circuit breaker status
    const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();
    const circuitBreakers = circuitBreakerRegistry.getAllMetrics();

    // Get error statistics
    const errorHandler = GlobalErrorHandler.getInstance();
    const errorStats = errorHandler.getStatistics();

    // Calculate performance metrics
    const averageResponseTime = this.performanceMetrics.requestCount > 0 
      ? this.performanceMetrics.totalResponseTime / this.performanceMetrics.requestCount 
      : 0;
    
    const errorRate = this.performanceMetrics.requestCount > 0 
      ? (this.performanceMetrics.errorCount / this.performanceMetrics.requestCount) * 100 
      : 0;

    // TODO: Integrate with cost tracking system
    const costs = {
      totalToday: 0,
      byTier: {},
      averagePerOperation: 0
    };

    const metrics: SystemMetrics = {
      timestamp,
      services,
      circuitBreakers,
      errors: {
        total: errorStats.totalErrors,
        byCategory: errorStats.errorsByCategory,
        bySeverity: errorStats.errorsBySeverity,
        recent: errorStats.recentErrors.map(e => e.serialize())
      },
      performance: {
        averageResponseTime,
        requestsPerMinute: this.performanceMetrics.lastMinuteRequests,
        errorRate
      },
      costs
    };

    // Store metrics (keep last 100 entries)
    this.metrics.push(metrics);
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }

    // Check alert conditions
    await this.checkAlerts(metrics);

    return metrics;
  }

  /**
   * Check alert conditions and trigger alerts if needed
   */
  private async checkAlerts(metrics: SystemMetrics): Promise<void> {
    for (const alertCondition of this.alertConditions) {
      try {
        const shouldAlert = alertCondition.condition(metrics);
        
        if (shouldAlert) {
          const lastAlert = this.lastAlerts.get(alertCondition.name);
          const cooldownMs = alertCondition.cooldownMinutes * 60 * 1000;
          
          // Check cooldown period
          if (!lastAlert || Date.now() - lastAlert.getTime() >= cooldownMs) {
            await this.triggerAlert(alertCondition, metrics);
            this.lastAlerts.set(alertCondition.name, new Date());
          }
        }
      } catch (error) {
        monitoringLogger.error('Error checking alert condition', {
          alertName: alertCondition.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Trigger alert (log for now, can be extended to send notifications)
   */
  private async triggerAlert(condition: AlertCondition, metrics: SystemMetrics): Promise<void> {
    const alertData = {
      name: condition.name,
      severity: condition.severity,
      description: condition.description,
      timestamp: new Date(),
      metrics: {
        services: Object.keys(metrics.services).length,
        unhealthyServices: Object.values(metrics.services)
          .filter(s => s.status === 'unhealthy').length,
        errorRate: metrics.performance.errorRate,
        avgResponseTime: metrics.performance.averageResponseTime
      }
    };

    const logMethod = condition.severity === 'critical' 
      ? monitoringLogger.error 
      : condition.severity === 'warning' 
        ? monitoringLogger.warn 
        : monitoringLogger.info;

    logMethod('Alert triggered', alertData);

    // TODO: Integrate with notification system (email, Slack, etc.)
  }

  /**
   * Get current system status
   */
  getCurrentStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const latestMetrics = this.metrics[this.metrics.length - 1];
    if (!latestMetrics) return 'healthy';

    const services = Object.values(latestMetrics.services);
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;

    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    
    return 'healthy';
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit: number = 10): SystemMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.performanceMetrics = {
      requestCount: 0,
      totalResponseTime: 0,
      errorCount: 0,
      lastMinuteRequests: 0,
      lastMinuteTimestamp: Date.now()
    };
    monitoringLogger.info('Performance metrics reset');
  }
}

/**
 * Default alert conditions for common scenarios
 */
export const DEFAULT_ALERT_CONDITIONS: AlertCondition[] = [
  {
    name: 'high-error-rate',
    condition: (metrics) => metrics.performance.errorRate > 10,
    severity: 'critical',
    description: 'Error rate exceeds 10%',
    cooldownMinutes: 5
  },
  {
    name: 'slow-response-time',
    condition: (metrics) => metrics.performance.averageResponseTime > 5000,
    severity: 'warning',
    description: 'Average response time exceeds 5 seconds',
    cooldownMinutes: 10
  },
  {
    name: 'service-unhealthy',
    condition: (metrics) => Object.values(metrics.services).some(s => s.status === 'unhealthy'),
    severity: 'critical',
    description: 'One or more services are unhealthy',
    cooldownMinutes: 5
  },
  {
    name: 'circuit-breaker-open',
    condition: (metrics) => Object.values(metrics.circuitBreakers)
      .some((cb: any) => cb.state === CircuitState.OPEN),
    severity: 'warning',
    description: 'One or more circuit breakers are open',
    cooldownMinutes: 15
  },
  {
    name: 'high-error-count',
    condition: (metrics) => metrics.errors.total > 100,
    severity: 'warning',
    description: 'High total error count',
    cooldownMinutes: 30
  }
];