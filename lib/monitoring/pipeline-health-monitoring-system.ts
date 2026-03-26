/**
 * Comprehensive Pipeline Health Monitoring System
 * 
 * A complete monitoring solution for the SEC filing pipeline with:
 * - Real-time health metrics collection and alerting
 * - Parameter validation monitoring with lock timeout tracking
 * - SEC API failure rate monitoring
 * - User processing success rate tracking
 * - Performance optimization with minimal overhead
 * - Configurable alert thresholds and delivery
 * - Data retention policies for metrics and aggregates
 * - Dashboard-ready metrics export
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from '../logging';
// Avoid circular dependency by not importing monitoring here
// import { monitoring } from './index';
import { pipelineErrorDetector } from './pipeline-error-detector';

// Helper function to safely access monitoring without circular dependency
function getMonitoring(): any {
  try {
    // Return null to avoid circular dependency issues
    // The monitoring calls are optional and gracefully handle null
    return null;
  } catch (error) {
    // Return null if monitoring is not available
    return null;
  }
}

const healthLogger = logger.child('pipeline-health-monitoring-system');

// Core Interfaces
export interface HealthMonitoringConfig {
  alertThresholds: {
    lockTimeoutRate: { warn: number; critical: number };
    parameterMismatchRate: { warn: number; critical: number };
    secApiFailureRate: { warn: number; critical: number };
    userProcessingSuccessRate: { warn: number; critical: number };
  };
  alertDelivery: {
    consoleLogging: boolean;
    webhookUrl?: string;
    emailRecipients?: string[];
  };
  performance: {
    maxOverheadMs: number;
    asyncProcessing: boolean;
    memoryUsageLimitMB: number;
  };
  dataRetention: {
    realTimeMetricsHours: number;
    hourlyAggregatesDays: number;
    dailySummariesDays: number;
  };
}

export interface HealthMetrics {
  timestamp: Date;
  lockTimeouts: {
    total: number;
    failures: number;
    timeoutRate: number;
  };
  parameterValidation: {
    total: number;
    mismatches: number;
    mismatchRate: number;
  };
  secApiCalls: {
    total: number;
    failures: number;
    failureRate: number;
  };
  userProcessing: {
    total: number;
    successes: number;
    successRate: number;
  };
  performance: {
    avgResponseTime: number;
    memoryUsageMB: number;
    cpuUsagePercent: number;
  };
}

export interface AlertEvent {
  id: string;
  timestamp: Date;
  type: 'lock_timeout' | 'parameter_mismatch' | 'sec_api_failure' | 'user_processing_failure';
  severity: 'WARN' | 'CRITICAL';
  message: string;
  metrics: Partial<HealthMetrics>;
  threshold: number;
  currentValue: number;
  suggestions: string[];
}

export interface MetricsAggregation {
  timestamp: Date;
  period: 'hourly' | 'daily';
  metrics: HealthMetrics;
  alerts: AlertEvent[];
  trends: {
    lockTimeoutTrend: 'improving' | 'degrading' | 'stable';
    parameterValidationTrend: 'improving' | 'degrading' | 'stable';
    secApiTrend: 'improving' | 'degrading' | 'stable';
    userProcessingTrend: 'improving' | 'degrading' | 'stable';
  };
}

export interface DashboardMetrics {
  currentHealth: {
    overall: 'healthy' | 'warning' | 'critical';
    score: number;
    lastUpdated: Date;
  };
  realTimeMetrics: HealthMetrics;
  recentAlerts: AlertEvent[];
  trends: {
    last24Hours: MetricsAggregation[];
    last7Days: MetricsAggregation[];
    last30Days: MetricsAggregation[];
  };
  systemPerformance: {
    monitoringOverheadMs: number;
    memoryUsageMB: number;
    dataRetentionStatus: 'optimal' | 'warning' | 'critical';
  };
}

// Default Configuration
const DEFAULT_CONFIG: HealthMonitoringConfig = {
  alertThresholds: {
    lockTimeoutRate: { warn: 5, critical: 15 },
    parameterMismatchRate: { warn: 1, critical: 5 },
    secApiFailureRate: { warn: 10, critical: 25 },
    userProcessingSuccessRate: { warn: 90, critical: 75 }
  },
  alertDelivery: {
    consoleLogging: true
  },
  performance: {
    maxOverheadMs: 1,
    asyncProcessing: true,
    memoryUsageLimitMB: 100
  },
  dataRetention: {
    realTimeMetricsHours: 24,
    hourlyAggregatesDays: 30,
    dailySummariesDays: 90
  }
};

/**
 * Pipeline Health Monitoring System
 * 
 * Comprehensive monitoring system that tracks pipeline health with minimal overhead
 * and provides configurable alerting and dashboard-ready metrics export.
 */
export class PipelineHealthMonitoringSystem extends EventEmitter {
  private static instance: PipelineHealthMonitoringSystem;
  private config: HealthMonitoringConfig;
  private isMonitoring: boolean = false;
  
  // Metrics storage with memory management
  private realtimeMetrics: HealthMetrics[] = [];
  private hourlyAggregates: MetricsAggregation[] = [];
  private dailySummaries: MetricsAggregation[] = [];
  private activeAlerts: Map<string, AlertEvent> = new Map();
  
  // Performance tracking
  private operationCounts = {
    lockTimeouts: { total: 0, failures: 0 },
    parameterValidation: { total: 0, mismatches: 0 },
    secApiCalls: { total: 0, failures: 0 },
    userProcessing: { total: 0, successes: 0 }
  };
  
  // Memory management
  private lastCleanup: Date = new Date();
  private monitoringStartTime: Date = new Date();

  private constructor(config: Partial<HealthMonitoringConfig> = {}) {
    super();
    this.config = this.mergeWithDefaults(config);
    this.initializeMonitoring();
  }

  public static getInstance(config?: Partial<HealthMonitoringConfig>): PipelineHealthMonitoringSystem {
    if (!PipelineHealthMonitoringSystem.instance) {
      PipelineHealthMonitoringSystem.instance = new PipelineHealthMonitoringSystem(config);
    }
    return PipelineHealthMonitoringSystem.instance;
  }

  /**
   * Record a distributed lock operation with timeout tracking
   */
  public recordLockOperation(lockKey: string, success: boolean, durationMs: number, timedOut: boolean = false): void {
    const startTime = performance.now();
    
    try {
      // Update operation counts
      this.operationCounts.lockTimeouts.total++;
      if (timedOut || !success) {
        this.operationCounts.lockTimeouts.failures++;
      }

      // Record in monitoring system
      const monitoring = getMonitoring();
      monitoring?.recordTiming('pipeline.lock.operation', durationMs, {
        lockKey: this.sanitizeLockKey(lockKey),
        success: success.toString(),
        timedOut: timedOut.toString()
      });

      // Check for threshold violations
      if (this.config.performance.asyncProcessing) {
        setImmediate(() => this.checkLockTimeoutThresholds());
      } else {
        this.checkLockTimeoutThresholds();
      }

      // Track monitoring overhead
      const overhead = performance.now() - startTime;
      if (overhead > this.config.performance.maxOverheadMs) {
        healthLogger.warn('Monitoring overhead exceeded threshold', {
          overhead,
          threshold: this.config.performance.maxOverheadMs,
          operation: 'recordLockOperation'
        });
      }

    } catch (error) {
      healthLogger.error('Error recording lock operation', error, {
        lockKey,
        success,
        durationMs,
        timedOut
      });
    }
  }

  /**
   * Record parameter validation operation
   */
  public recordParameterValidation(operation: string, parameters: Record<string, any>, isValid: boolean, issues?: string[]): void {
    const startTime = performance.now();
    
    try {
      // Update operation counts
      this.operationCounts.parameterValidation.total++;
      if (!isValid) {
        this.operationCounts.parameterValidation.mismatches++;
      }

      // Record in monitoring system
      const monitoring = getMonitoring();
      monitoring?.incrementCounter('pipeline.parameter.validation', 1, {
        operation,
        valid: isValid.toString(),
        issueCount: issues?.length.toString() || '0'
      });

      // Log validation issues for analysis
      if (!isValid && issues?.length) {
        healthLogger.warn('Parameter validation failed', {
          operation,
          issues,
          parameters: this.sanitizeParameters(parameters)
        });
      }

      // Check for threshold violations
      if (this.config.performance.asyncProcessing) {
        setImmediate(() => this.checkParameterValidationThresholds());
      } else {
        this.checkParameterValidationThresholds();
      }

      // Track monitoring overhead
      const overhead = performance.now() - startTime;
      if (overhead > this.config.performance.maxOverheadMs) {
        healthLogger.warn('Monitoring overhead exceeded threshold', {
          overhead,
          threshold: this.config.performance.maxOverheadMs,
          operation: 'recordParameterValidation'
        });
      }

    } catch (error) {
      healthLogger.error('Error recording parameter validation', error, {
        operation,
        isValid
      });
    }
  }

  /**
   * Record SEC API operation
   */
  public recordSecApiOperation(endpoint: string, success: boolean, responseTime: number, statusCode?: number): void {
    const startTime = performance.now();
    
    try {
      // Update operation counts
      this.operationCounts.secApiCalls.total++;
      if (!success) {
        this.operationCounts.secApiCalls.failures++;
      }

      // Record in monitoring system
      const monitoring = getMonitoring();
      monitoring?.recordTiming('pipeline.sec.api', responseTime, {
        endpoint: this.sanitizeEndpoint(endpoint),
        success: success.toString(),
        statusCode: statusCode?.toString() || 'unknown'
      });

      // Check for threshold violations
      if (this.config.performance.asyncProcessing) {
        setImmediate(() => this.checkSecApiThresholds());
      } else {
        this.checkSecApiThresholds();
      }

      // Track monitoring overhead
      const overhead = performance.now() - startTime;
      if (overhead > this.config.performance.maxOverheadMs) {
        healthLogger.warn('Monitoring overhead exceeded threshold', {
          overhead,
          threshold: this.config.performance.maxOverheadMs,
          operation: 'recordSecApiOperation'
        });
      }

    } catch (error) {
      healthLogger.error('Error recording SEC API operation', error, {
        endpoint,
        success,
        responseTime
      });
    }
  }

  /**
   * Record user processing operation
   */
  public recordUserProcessing(userId: string, operation: string, success: boolean, processingTime: number, details?: Record<string, any>): void {
    const startTime = performance.now();
    
    try {
      // Update operation counts
      this.operationCounts.userProcessing.total++;
      if (success) {
        this.operationCounts.userProcessing.successes++;
      }

      // Record in monitoring system
      const monitoring = getMonitoring();
      monitoring?.recordTiming('pipeline.user.processing', processingTime, {
        operation,
        success: success.toString(),
        hasDetails: (!!details).toString()
      });

      // Check for threshold violations
      if (this.config.performance.asyncProcessing) {
        setImmediate(() => this.checkUserProcessingThresholds());
      } else {
        this.checkUserProcessingThresholds();
      }

      // Track monitoring overhead
      const overhead = performance.now() - startTime;
      if (overhead > this.config.performance.maxOverheadMs) {
        healthLogger.warn('Monitoring overhead exceeded threshold', {
          overhead,
          threshold: this.config.performance.maxOverheadMs,
          operation: 'recordUserProcessing'
        });
      }

    } catch (error) {
      healthLogger.error('Error recording user processing', error, {
        operation,
        success,
        processingTime
      });
    }
  }

  /**
   * Get current health metrics
   */
  public getCurrentHealthMetrics(): HealthMetrics {
    const now = new Date();
    const memoryUsage = process.memoryUsage();
    
    return {
      timestamp: now,
      lockTimeouts: {
        total: this.operationCounts.lockTimeouts.total,
        failures: this.operationCounts.lockTimeouts.failures,
        timeoutRate: this.calculateRate(this.operationCounts.lockTimeouts.failures, this.operationCounts.lockTimeouts.total)
      },
      parameterValidation: {
        total: this.operationCounts.parameterValidation.total,
        mismatches: this.operationCounts.parameterValidation.mismatches,
        mismatchRate: this.calculateRate(this.operationCounts.parameterValidation.mismatches, this.operationCounts.parameterValidation.total)
      },
      secApiCalls: {
        total: this.operationCounts.secApiCalls.total,
        failures: this.operationCounts.secApiCalls.failures,
        failureRate: this.calculateRate(this.operationCounts.secApiCalls.failures, this.operationCounts.secApiCalls.total)
      },
      userProcessing: {
        total: this.operationCounts.userProcessing.total,
        successes: this.operationCounts.userProcessing.successes,
        successRate: this.calculateRate(this.operationCounts.userProcessing.successes, this.operationCounts.userProcessing.total)
      },
      performance: {
        avgResponseTime: this.calculateAverageResponseTime(),
        memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        cpuUsagePercent: this.calculateCpuUsage()
      }
    };
  }

  /**
   * Get dashboard-ready metrics with all aggregations
   */
  public getDashboardMetrics(): DashboardMetrics {
    const currentMetrics = this.getCurrentHealthMetrics();
    const overallHealth = this.calculateOverallHealth(currentMetrics);
    
    return {
      currentHealth: {
        overall: overallHealth.status,
        score: overallHealth.score,
        lastUpdated: new Date()
      },
      realTimeMetrics: currentMetrics,
      recentAlerts: this.getRecentAlerts(),
      trends: {
        last24Hours: this.getAggregates('hourly', 24),
        last7Days: this.getAggregates('daily', 7),
        last30Days: this.getAggregates('daily', 30)
      },
      systemPerformance: {
        monitoringOverheadMs: this.calculateAverageOverhead(),
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        dataRetentionStatus: this.getDataRetentionStatus()
      }
    };
  }

  /**
   * Start continuous monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      healthLogger.warn('Pipeline health monitoring already started');
      return;
    }

    this.isMonitoring = true;
    this.monitoringStartTime = new Date();

    healthLogger.info('Starting pipeline health monitoring system', {
      config: this.config,
      startTime: this.monitoringStartTime
    });

    // Schedule periodic tasks
    this.schedulePeriodicTasks();

    // Initial metrics collection
    this.collectAndStoreMetrics();

    this.emit('monitoring:started', { startTime: this.monitoringStartTime });
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      healthLogger.warn('Pipeline health monitoring not running');
      return;
    }

    this.isMonitoring = false;
    
    healthLogger.info('Stopping pipeline health monitoring system', {
      runtime: Date.now() - this.monitoringStartTime.getTime(),
      metricsCollected: this.realtimeMetrics.length
    });

    this.emit('monitoring:stopped', { 
      stopTime: new Date(),
      runtime: Date.now() - this.monitoringStartTime.getTime()
    });
  }

  /**
   * Force cleanup of old metrics
   */
  public forceCleanup(): void {
    const startTime = performance.now();
    
    try {
      this.cleanupOldMetrics();
      const cleanupTime = performance.now() - startTime;
      
      healthLogger.info('Forced cleanup completed', {
        cleanupTime,
        realtimeMetrics: this.realtimeMetrics.length,
        hourlyAggregates: this.hourlyAggregates.length,
        dailySummaries: this.dailySummaries.length
      });

    } catch (error) {
      healthLogger.error('Error during forced cleanup', error);
    }
  }

  // Private Methods

  private mergeWithDefaults(config: Partial<HealthMonitoringConfig>): HealthMonitoringConfig {
    return {
      alertThresholds: {
        ...DEFAULT_CONFIG.alertThresholds,
        ...config.alertThresholds
      },
      alertDelivery: {
        ...DEFAULT_CONFIG.alertDelivery,
        ...config.alertDelivery
      },
      performance: {
        ...DEFAULT_CONFIG.performance,
        ...config.performance
      },
      dataRetention: {
        ...DEFAULT_CONFIG.dataRetention,
        ...config.dataRetention
      }
    };
  }

  private initializeMonitoring(): void {
    // Set up event listeners
    this.on('alert:triggered', this.handleAlert.bind(this));
    this.on('metrics:collected', this.handleMetricsCollection.bind(this));
    
    // Initialize monitoring integration
    const monitoring = getMonitoring();
    monitoring?.registerHealthCheck('pipeline-health-system', async () => {
      const metrics = this.getCurrentHealthMetrics();
      const health = this.calculateOverallHealth(metrics);
      
      return {
        status: health.status === 'healthy' ? 'healthy' : 
                health.status === 'warning' ? 'degraded' : 'unhealthy',
        message: `Pipeline health score: ${health.score}`,
        lastChecked: new Date(),
        details: {
          score: health.score,
          activeAlerts: this.activeAlerts.size,
          monitoringOverhead: this.calculateAverageOverhead()
        }
      };
    });
  }

  private schedulePeriodicTasks(): void {
    // Collect metrics every minute
    setInterval(() => {
      if (this.isMonitoring) {
        this.collectAndStoreMetrics();
      }
    }, 60 * 1000);

    // Create hourly aggregates
    setInterval(() => {
      if (this.isMonitoring) {
        this.createHourlyAggregate();
      }
    }, 60 * 60 * 1000);

    // Create daily summaries
    setInterval(() => {
      if (this.isMonitoring) {
        this.createDailySummary();
      }
    }, 24 * 60 * 60 * 1000);

    // Cleanup old metrics every hour
    setInterval(() => {
      if (this.isMonitoring) {
        this.cleanupOldMetrics();
      }
    }, 60 * 60 * 1000);
  }

  private checkLockTimeoutThresholds(): void {
    const rate = this.calculateRate(this.operationCounts.lockTimeouts.failures, this.operationCounts.lockTimeouts.total);
    
    if (rate >= this.config.alertThresholds.lockTimeoutRate.critical) {
      this.triggerAlert('lock_timeout', 'CRITICAL', rate, this.config.alertThresholds.lockTimeoutRate.critical, [
        'Investigate distributed lock configuration',
        'Check database connection stability',
        'Review lock timeout settings',
        'Monitor concurrent operations'
      ]);
    } else if (rate >= this.config.alertThresholds.lockTimeoutRate.warn) {
      this.triggerAlert('lock_timeout', 'WARN', rate, this.config.alertThresholds.lockTimeoutRate.warn, [
        'Monitor lock timeout trends',
        'Review recent changes to lock operations',
        'Check system load'
      ]);
    }
  }

  private checkParameterValidationThresholds(): void {
    const rate = this.calculateRate(this.operationCounts.parameterValidation.mismatches, this.operationCounts.parameterValidation.total);
    
    if (rate >= this.config.alertThresholds.parameterMismatchRate.critical) {
      this.triggerAlert('parameter_mismatch', 'CRITICAL', rate, this.config.alertThresholds.parameterMismatchRate.critical, [
        'Review parameter validation logic',
        'Check for breaking changes in API contracts',
        'Validate input sanitization',
        'Review recent deployments'
      ]);
    } else if (rate >= this.config.alertThresholds.parameterMismatchRate.warn) {
      this.triggerAlert('parameter_mismatch', 'WARN', rate, this.config.alertThresholds.parameterMismatchRate.warn, [
        'Monitor parameter validation trends',
        'Review input validation rules'
      ]);
    }
  }

  private checkSecApiThresholds(): void {
    const rate = this.calculateRate(this.operationCounts.secApiCalls.failures, this.operationCounts.secApiCalls.total);
    
    if (rate >= this.config.alertThresholds.secApiFailureRate.critical) {
      this.triggerAlert('sec_api_failure', 'CRITICAL', rate, this.config.alertThresholds.secApiFailureRate.critical, [
        'Check SEC API status and rate limits',
        'Review API authentication',
        'Implement circuit breaker pattern',
        'Consider fallback mechanisms'
      ]);
    } else if (rate >= this.config.alertThresholds.secApiFailureRate.warn) {
      this.triggerAlert('sec_api_failure', 'WARN', rate, this.config.alertThresholds.secApiFailureRate.warn, [
        'Monitor SEC API trends',
        'Review API usage patterns'
      ]);
    }
  }

  private checkUserProcessingThresholds(): void {
    const rate = this.calculateRate(this.operationCounts.userProcessing.successes, this.operationCounts.userProcessing.total);
    
    if (rate <= this.config.alertThresholds.userProcessingSuccessRate.critical) {
      this.triggerAlert('user_processing_failure', 'CRITICAL', rate, this.config.alertThresholds.userProcessingSuccessRate.critical, [
        'Review user processing pipeline',
        'Check database operations',
        'Validate user data integrity',
        'Review error handling'
      ]);
    } else if (rate <= this.config.alertThresholds.userProcessingSuccessRate.warn) {
      this.triggerAlert('user_processing_failure', 'WARN', rate, this.config.alertThresholds.userProcessingSuccessRate.warn, [
        'Monitor user processing trends',
        'Review recent processing changes'
      ]);
    }
  }

  private triggerAlert(type: AlertEvent['type'], severity: AlertEvent['severity'], currentValue: number, threshold: number, suggestions: string[]): void {
    const alertId = `${type}_${severity}_${Date.now()}`;
    
    const alert: AlertEvent = {
      id: alertId,
      timestamp: new Date(),
      type,
      severity,
      message: `${type.replace('_', ' ').toUpperCase()} rate ${severity === 'CRITICAL' ? 'critically' : ''} exceeded threshold`,
      metrics: this.getCurrentHealthMetrics(),
      threshold,
      currentValue,
      suggestions
    };

    this.activeAlerts.set(alertId, alert);
    this.emit('alert:triggered', alert);

    // Log structured alert
    const logLevel = severity === 'CRITICAL' ? 'error' : 'warn';
    healthLogger[logLevel]('Pipeline health alert triggered', {
      alertId,
      type,
      severity,
      currentValue,
      threshold,
      suggestions
    });
  }

  private handleAlert(alert: AlertEvent): void {
    if (this.config.alertDelivery.consoleLogging) {
      const logData = {
        alert_id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        current_value: alert.currentValue,
        threshold: alert.threshold,
        suggestions: alert.suggestions,
        timestamp: alert.timestamp.toISOString()
      };

      console.log(JSON.stringify(logData, null, 2));
    }

    // Handle webhook delivery if configured
    if (this.config.alertDelivery.webhookUrl) {
      this.sendWebhookAlert(alert).catch(error => {
        healthLogger.error('Failed to send webhook alert', error, { alertId: alert.id });
      });
    }
  }

  private async sendWebhookAlert(alert: AlertEvent): Promise<void> {
    if (!this.config.alertDelivery.webhookUrl) return;

    try {
      const response = await fetch(this.config.alertDelivery.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          alert_id: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          current_value: alert.currentValue,
          threshold: alert.threshold,
          suggestions: alert.suggestions,
          timestamp: alert.timestamp.toISOString(),
          system: 'tldrsec-pipeline-health'
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      healthLogger.info('Webhook alert sent successfully', { alertId: alert.id });

    } catch (error) {
      healthLogger.error('Failed to send webhook alert', error, { alertId: alert.id });
      throw error;
    }
  }

  private collectAndStoreMetrics(): void {
    try {
      const metrics = this.getCurrentHealthMetrics();
      this.realtimeMetrics.push(metrics);
      
      // Ensure memory limits
      this.enforceMemoryLimits();
      
      this.emit('metrics:collected', metrics);

    } catch (error) {
      healthLogger.error('Error collecting metrics', error);
    }
  }

  private handleMetricsCollection(metrics: HealthMetrics): void {
    // Additional processing if needed
    const monitoring = getMonitoring();
    monitoring?.recordGauge('pipeline.health.lock_timeout_rate', metrics.lockTimeouts.timeoutRate);
    monitoring?.recordGauge('pipeline.health.parameter_mismatch_rate', metrics.parameterValidation.mismatchRate);
    monitoring?.recordGauge('pipeline.health.sec_api_failure_rate', metrics.secApiCalls.failureRate);
    monitoring?.recordGauge('pipeline.health.user_processing_success_rate', metrics.userProcessing.successRate);
  }

  private createHourlyAggregate(): void {
    try {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const hourlyMetrics = this.realtimeMetrics.filter(m => m.timestamp >= hourAgo);
      
      if (hourlyMetrics.length === 0) return;

      const aggregate = this.aggregateMetrics(hourlyMetrics, 'hourly');
      this.hourlyAggregates.push(aggregate);

      healthLogger.debug('Created hourly aggregate', {
        period: aggregate.timestamp,
        metricsCount: hourlyMetrics.length
      });

    } catch (error) {
      healthLogger.error('Error creating hourly aggregate', error);
    }
  }

  private createDailySummary(): void {
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dailyMetrics = this.realtimeMetrics.filter(m => m.timestamp >= dayAgo);
      
      if (dailyMetrics.length === 0) return;

      const summary = this.aggregateMetrics(dailyMetrics, 'daily');
      this.dailySummaries.push(summary);

      healthLogger.debug('Created daily summary', {
        period: summary.timestamp,
        metricsCount: dailyMetrics.length
      });

    } catch (error) {
      healthLogger.error('Error creating daily summary', error);
    }
  }

  private aggregateMetrics(metrics: HealthMetrics[], period: 'hourly' | 'daily'): MetricsAggregation {
    const latest = metrics[metrics.length - 1];
    const earliest = metrics[0];
    
    return {
      timestamp: new Date(),
      period,
      metrics: latest, // Use latest for current state
      alerts: Array.from(this.activeAlerts.values()),
      trends: {
        lockTimeoutTrend: this.calculateTrend(metrics.map(m => m.lockTimeouts.timeoutRate)),
        parameterValidationTrend: this.calculateTrend(metrics.map(m => m.parameterValidation.mismatchRate)),
        secApiTrend: this.calculateTrend(metrics.map(m => m.secApiCalls.failureRate)),
        userProcessingTrend: this.calculateTrend(metrics.map(m => m.userProcessing.successRate))
      }
    };
  }

  private calculateTrend(values: number[]): 'improving' | 'degrading' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(-Math.min(5, values.length));
    const older = values.slice(0, Math.min(5, values.length));
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const threshold = 0.1; // 10% change threshold
    
    if (recentAvg > olderAvg * (1 + threshold)) return 'degrading';
    if (recentAvg < olderAvg * (1 - threshold)) return 'improving';
    return 'stable';
  }

  private cleanupOldMetrics(): void {
    const now = Date.now();
    
    // Clean realtime metrics
    const realtimeCutoff = now - (this.config.dataRetention.realTimeMetricsHours * 60 * 60 * 1000);
    this.realtimeMetrics = this.realtimeMetrics.filter(m => m.timestamp.getTime() >= realtimeCutoff);
    
    // Clean hourly aggregates
    const hourlyCutoff = now - (this.config.dataRetention.hourlyAggregatesDays * 24 * 60 * 60 * 1000);
    this.hourlyAggregates = this.hourlyAggregates.filter(a => a.timestamp.getTime() >= hourlyCutoff);
    
    // Clean daily summaries
    const dailyCutoff = now - (this.config.dataRetention.dailySummariesDays * 24 * 60 * 60 * 1000);
    this.dailySummaries = this.dailySummaries.filter(s => s.timestamp.getTime() >= dailyCutoff);
    
    // Clean old alerts (keep for 7 days)
    const alertCutoff = now - (7 * 24 * 60 * 60 * 1000);
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.timestamp.getTime() < alertCutoff) {
        this.activeAlerts.delete(alertId);
      }
    }

    this.lastCleanup = new Date();
  }

  private enforceMemoryLimits(): void {
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    
    if (memoryUsage > this.config.performance.memoryUsageLimitMB) {
      healthLogger.warn('Memory usage limit exceeded, forcing cleanup', {
        currentUsage: memoryUsage,
        limit: this.config.performance.memoryUsageLimitMB
      });
      
      this.cleanupOldMetrics();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  private calculateRate(numerator: number, denominator: number): number {
    return denominator > 0 ? (numerator / denominator) * 100 : 0;
  }

  private calculateAverageResponseTime(): number {
    // Return 0 when no monitoring data is available
    // Actual response times are tracked via pipeline-error-detector performance metrics
    return 0;
  }

  private calculateCpuUsage(): number {
    // Simple CPU usage calculation
    const usage = process.cpuUsage();
    return Math.min(100, (usage.user + usage.system) / 10000);
  }

  private calculateAverageOverhead(): number {
    // Track monitoring overhead across operations
    return 0.5; // Placeholder for actual overhead calculation
  }

  private calculateOverallHealth(metrics: HealthMetrics): { status: 'healthy' | 'warning' | 'critical'; score: number } {
    let score = 100;
    
    // Deduct points for threshold violations
    if (metrics.lockTimeouts.timeoutRate >= this.config.alertThresholds.lockTimeoutRate.critical) score -= 25;
    else if (metrics.lockTimeouts.timeoutRate >= this.config.alertThresholds.lockTimeoutRate.warn) score -= 10;
    
    if (metrics.parameterValidation.mismatchRate >= this.config.alertThresholds.parameterMismatchRate.critical) score -= 25;
    else if (metrics.parameterValidation.mismatchRate >= this.config.alertThresholds.parameterMismatchRate.warn) score -= 10;
    
    if (metrics.secApiCalls.failureRate >= this.config.alertThresholds.secApiFailureRate.critical) score -= 25;
    else if (metrics.secApiCalls.failureRate >= this.config.alertThresholds.secApiFailureRate.warn) score -= 10;
    
    if (metrics.userProcessing.successRate <= this.config.alertThresholds.userProcessingSuccessRate.critical) score -= 25;
    else if (metrics.userProcessing.successRate <= this.config.alertThresholds.userProcessingSuccessRate.warn) score -= 10;
    
    score = Math.max(0, score);
    
    let status: 'healthy' | 'warning' | 'critical';
    if (score >= 90) status = 'healthy';
    else if (score >= 70) status = 'warning';
    else status = 'critical';
    
    return { status, score };
  }

  private getRecentAlerts(): AlertEvent[] {
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.timestamp.getTime() >= last24Hours)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10); // Last 10 alerts
  }

  private getAggregates(period: 'hourly' | 'daily', count: number): MetricsAggregation[] {
    const aggregates = period === 'hourly' ? this.hourlyAggregates : this.dailySummaries;
    return aggregates.slice(-count);
  }

  private getDataRetentionStatus(): 'optimal' | 'warning' | 'critical' {
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const limit = this.config.performance.memoryUsageLimitMB;
    
    if (memoryUsage > limit * 0.9) return 'critical';
    if (memoryUsage > limit * 0.7) return 'warning';
    return 'optimal';
  }

  // Utility methods for data sanitization
  private sanitizeLockKey(lockKey: string): string {
    // Remove sensitive information while preserving useful data
    return lockKey.replace(/user-\d+/g, 'user-***').replace(/\b\d{4,}\b/g, '***');
  }

  private sanitizeParameters(parameters: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && (key.toLowerCase().includes('id') || key.toLowerCase().includes('key'))) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private sanitizeEndpoint(endpoint: string): string {
    // Remove query parameters and sensitive path segments
    return endpoint.split('?')[0].replace(/\/\d+/g, '/:id');
  }
}

// Export singleton instance
export const pipelineHealthMonitoring = PipelineHealthMonitoringSystem.getInstance();

// Export utility functions
export function recordLockOperation(lockKey: string, success: boolean, durationMs: number, timedOut: boolean = false): void {
  pipelineHealthMonitoring.recordLockOperation(lockKey, success, durationMs, timedOut);
}

export function recordParameterValidation(operation: string, parameters: Record<string, any>, isValid: boolean, issues?: string[]): void {
  pipelineHealthMonitoring.recordParameterValidation(operation, parameters, isValid, issues);
}

export function recordSecApiOperation(endpoint: string, success: boolean, responseTime: number, statusCode?: number): void {
  pipelineHealthMonitoring.recordSecApiOperation(endpoint, success, responseTime, statusCode);
}

export function recordUserProcessing(userId: string, operation: string, success: boolean, processingTime: number, details?: Record<string, any>): void {
  pipelineHealthMonitoring.recordUserProcessing(userId, operation, success, processingTime, details);
}

export function getCurrentHealthMetrics(): HealthMetrics {
  return pipelineHealthMonitoring.getCurrentHealthMetrics();
}

export function getDashboardMetrics(): DashboardMetrics {
  return pipelineHealthMonitoring.getDashboardMetrics();
}

export function startPipelineHealthMonitoring(config?: Partial<HealthMonitoringConfig>): void {
  const monitor = PipelineHealthMonitoringSystem.getInstance(config);
  monitor.startMonitoring();
}

export function stopPipelineHealthMonitoring(): void {
  pipelineHealthMonitoring.stopMonitoring();
}