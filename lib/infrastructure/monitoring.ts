/**
 * Infrastructure Monitoring for 524 Timeout Prevention
 * 
 * Provides real-time monitoring, alerting, and performance tracking
 * for all infrastructure components to prevent timeout issues
 */

import { logger } from '../logging';

export interface InfrastructureMetrics {
  timestamp: Date;
  
  // Vercel Function Metrics
  vercel: {
    functionExecutionTime: number;
    functionMemoryUsage: number;
    functionCpuUsage: number;
    functionTimeouts: number;
    functionErrors: number;
    concurrentExecutions: number;
  };
  
  // Database Metrics
  database: {
    connectionPoolUsage: number;
    activeConnections: number;
    queryExecutionTime: number;
    slowQueries: number;
    connectionErrors: number;
    transactionTimeouts: number;
  };
  
  // AI API Metrics
  aiApi: {
    requestDuration: number;
    tokenUsage: number;
    costPerRequest: number;
    rateLimitHits: number;
    timeouts: number;
    modelFallbacks: number;
  };
  
  // Queue Metrics
  queue: {
    activeJobs: number;
    queuedJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageWaitTime: number;
    averageProcessingTime: number;
  };
  
  // Circuit Breaker Metrics
  circuitBreaker: {
    state: string;
    failureRate: number;
    successRate: number;
    totalRequests: number;
    circuitOpenEvents: number;
  };
}

export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

export interface Alert {
  id: string;
  timestamp: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metric: string;
  currentValue: number;
  threshold: number;
  description: string;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Infrastructure monitoring system with 524 timeout prevention
 */
export class InfrastructureMonitor {
  private metrics: InfrastructureMetrics[] = [];
  private alerts: Alert[] = [];
  private alertThresholds: AlertThreshold[];
  private isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;
  
  constructor() {
    this.alertThresholds = this.getDefaultAlertThresholds();
    logger.info('Infrastructure monitor initialized', {
      alertThresholds: this.alertThresholds.length
    });
  }

  /**
   * Start monitoring infrastructure components
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      logger.warn('Infrastructure monitoring already started');
      return;
    }

    this.isMonitoring = true;
    
    logger.info('Starting infrastructure monitoring', {
      interval: intervalMs,
      alertThresholds: this.alertThresholds.length
    });

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        this.checkAlertThresholds();
        this.cleanupOldData();
      } catch (error) {
        logger.error('Error in monitoring cycle', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Infrastructure monitoring stopped');
  }

  /**
   * Collect current infrastructure metrics
   */
  async collectMetrics(): Promise<InfrastructureMetrics> {
    const timestamp = new Date();
    
    // Note: In a real implementation, these would connect to actual monitoring APIs
    // For now, we provide the structure and simulate some metrics
    const metrics: InfrastructureMetrics = {
      timestamp,
      
      vercel: {
        functionExecutionTime: await this.measureVercelFunctionTime(),
        functionMemoryUsage: this.getMemoryUsage(),
        functionCpuUsage: this.getCpuUsage(),
        functionTimeouts: 0, // Would be tracked from Vercel API
        functionErrors: 0,   // Would be tracked from Vercel API
        concurrentExecutions: 1 // Current execution count
      },
      
      database: {
        connectionPoolUsage: await this.getDatabaseConnectionUsage(),
        activeConnections: 0, // Would query database
        queryExecutionTime: 0, // Average query time
        slowQueries: 0,       // Queries > 1 second
        connectionErrors: 0,   // Connection failures
        transactionTimeouts: 0 // Transaction timeouts
      },
      
      aiApi: {
        requestDuration: 0,    // Average AI API request time
        tokenUsage: 0,         // Tokens consumed
        costPerRequest: 0,     // USD per request
        rateLimitHits: 0,      // Rate limit encounters
        timeouts: 0,           // AI API timeouts
        modelFallbacks: 0      // Model fallback events
      },
      
      queue: {
        activeJobs: 0,         // Currently processing
        queuedJobs: 0,         // Waiting to process
        completedJobs: 0,      // Successfully completed
        failedJobs: 0,         // Failed jobs
        averageWaitTime: 0,    // Time in queue
        averageProcessingTime: 0 // Processing duration
      },
      
      circuitBreaker: {
        state: 'CLOSED',       // Circuit breaker state
        failureRate: 0,        // Failure percentage
        successRate: 100,      // Success percentage
        totalRequests: 0,      // Total requests
        circuitOpenEvents: 0   // Times circuit opened
      }
    };

    this.metrics.push(metrics);
    
    logger.debug('Infrastructure metrics collected', {
      vercelExecutionTime: metrics.vercel.functionExecutionTime,
      memoryUsage: metrics.vercel.functionMemoryUsage,
      cpuUsage: metrics.vercel.functionCpuUsage
    });

    return metrics;
  }

  /**
   * Check if any metrics exceed alert thresholds
   */
  private checkAlertThresholds(): void {
    if (this.metrics.length === 0) return;

    const latestMetrics = this.metrics[this.metrics.length - 1];
    
    for (const threshold of this.alertThresholds) {
      const currentValue = this.extractMetricValue(latestMetrics, threshold.metric);
      if (currentValue === null) continue;

      const shouldAlert = this.shouldTriggerAlert(currentValue, threshold);
      
      if (shouldAlert) {
        this.createAlert(threshold, currentValue);
      }
    }
  }

  /**
   * Create and log an alert
   */
  private createAlert(threshold: AlertThreshold, currentValue: number): void {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: Alert = {
      id: alertId,
      timestamp: new Date(),
      severity: threshold.severity,
      metric: threshold.metric,
      currentValue,
      threshold: threshold.value,
      description: threshold.description,
      resolved: false
    };

    this.alerts.push(alert);
    
    logger.error(`Infrastructure alert triggered`, {
      alertId,
      severity: threshold.severity,
      metric: threshold.metric,
      currentValue,
      threshold: threshold.value,
      description: threshold.description
    });

    // Trigger immediate action for critical alerts
    if (threshold.severity === 'CRITICAL') {
      this.handleCriticalAlert(alert);
    }
  }

  /**
   * Handle critical alerts with immediate actions
   */
  private handleCriticalAlert(alert: Alert): void {
    logger.error('CRITICAL INFRASTRUCTURE ALERT', {
      alert,
      action: 'immediate_intervention_required'
    });

    // In a real implementation, this would:
    // 1. Send immediate notifications (email, Slack, PagerDuty)
    // 2. Trigger auto-scaling if available
    // 3. Execute emergency procedures
    // 4. Create incident tickets
  }

  /**
   * Get infrastructure health summary
   */
  getHealthSummary(): {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    metrics: InfrastructureMetrics | null;
    activeAlerts: Alert[];
    recommendations: string[];
  } {
    const latestMetrics = this.metrics[this.metrics.length - 1] || null;
    const activeAlerts = this.alerts.filter(alert => !alert.resolved);
    
    // Determine overall health status
    let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    
    if (activeAlerts.some(alert => alert.severity === 'CRITICAL')) {
      status = 'CRITICAL';
    } else if (activeAlerts.some(alert => alert.severity === 'HIGH' || alert.severity === 'MEDIUM')) {
      status = 'WARNING';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(latestMetrics, activeAlerts);

    return {
      status,
      metrics: latestMetrics,
      activeAlerts,
      recommendations
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(metrics: InfrastructureMetrics | null, alerts: Alert[]): string[] {
    const recommendations: string[] = [];

    if (!metrics) {
      recommendations.push('No metrics available - start monitoring to get recommendations');
      return recommendations;
    }

    // Function execution time recommendations
    if (metrics.vercel.functionExecutionTime > 300000) { // > 5 minutes
      recommendations.push('Consider splitting long-running functions into smaller operations');
      recommendations.push('Implement async job queuing for heavy processing tasks');
    }

    // Memory usage recommendations
    if (metrics.vercel.functionMemoryUsage > 80) { // > 80% usage
      recommendations.push('Consider increasing Vercel function memory allocation');
      recommendations.push('Optimize memory usage in AI processing pipeline');
    }

    // Database recommendations
    if (metrics.database.connectionPoolUsage > 80) {
      recommendations.push('Increase database connection pool size');
      recommendations.push('Optimize database queries to reduce connection time');
    }

    // Critical alert recommendations
    const criticalAlerts = alerts.filter(alert => alert.severity === 'CRITICAL');
    if (criticalAlerts.length > 0) {
      recommendations.push('URGENT: Address critical infrastructure alerts immediately');
      recommendations.push('Consider implementing circuit breaker pattern for failing services');
    }

    return recommendations;
  }

  // Private helper methods
  private async measureVercelFunctionTime(): Promise<number> {
    // In real implementation, this would measure actual function execution time
    return Date.now() % 600000; // Simulate 0-10 minute execution times
  }

  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return Math.round((usage.heapUsed / usage.heapTotal) * 100);
    }
    return 0;
  }

  private getCpuUsage(): number {
    // Simplified CPU usage simulation
    return Math.round(Math.random() * 100);
  }

  private async getDatabaseConnectionUsage(): Promise<number> {
    // In real implementation, this would query Prisma/database metrics
    return Math.round(Math.random() * 100);
  }

  private extractMetricValue(metrics: InfrastructureMetrics, metricPath: string): number | null {
    const parts = metricPath.split('.');
    let value: unknown = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  }

  private shouldTriggerAlert(currentValue: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case 'gt': return currentValue > threshold.value;
      case 'gte': return currentValue >= threshold.value;
      case 'lt': return currentValue < threshold.value;
      case 'lte': return currentValue <= threshold.value;
      case 'eq': return currentValue === threshold.value;
      default: return false;
    }
  }

  private cleanupOldData(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    
    // Keep only recent metrics
    this.metrics = this.metrics.filter(metric => metric.timestamp >= cutoff);
    
    // Keep only recent unresolved alerts
    this.alerts = this.alerts.filter(alert => 
      alert.timestamp >= cutoff || !alert.resolved
    );
  }

  private getDefaultAlertThresholds(): AlertThreshold[] {
    return [
      // Function execution time thresholds
      {
        metric: 'vercel.functionExecutionTime',
        operator: 'gt',
        value: 240000, // 4 minutes
        severity: 'HIGH',
        description: 'Vercel function execution time approaching timeout limit'
      },
      {
        metric: 'vercel.functionExecutionTime',
        operator: 'gt',
        value: 480000, // 8 minutes  
        severity: 'CRITICAL',
        description: 'Vercel function execution time critically high - 524 timeout risk'
      },
      
      // Memory usage thresholds
      {
        metric: 'vercel.functionMemoryUsage',
        operator: 'gt',
        value: 85,
        severity: 'HIGH',
        description: 'High memory usage detected'
      },
      
      // Database connection thresholds
      {
        metric: 'database.connectionPoolUsage',
        operator: 'gt',
        value: 80,
        severity: 'MEDIUM',
        description: 'Database connection pool usage high'
      },
      {
        metric: 'database.connectionPoolUsage',
        operator: 'gt',
        value: 95,
        severity: 'CRITICAL',
        description: 'Database connection pool near exhaustion'
      },
      
      // AI API timeout thresholds
      {
        metric: 'aiApi.timeouts',
        operator: 'gt',
        value: 3,
        severity: 'HIGH',
        description: 'Multiple AI API timeouts detected'
      }
    ];
  }
}

// Export singleton instance
export const infrastructureMonitor = new InfrastructureMonitor();