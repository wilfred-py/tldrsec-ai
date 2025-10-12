/**
 * Performance Metrics Collection for 524 Timeout Prevention
 * 
 * Provides comprehensive monitoring and alerting to prevent timeout issues
 */

import { logger } from '../logging';
import type { CronJobMonitor } from './cron-monitor';

export interface PerformanceMetrics {
  // Timing metrics
  avgProcessingTime: number;
  maxProcessingTime: number;
  minProcessingTime: number;
  processingTimeP95: number;
  processingTimeP99: number;
  
  // Timeout metrics  
  timeoutRate: number;
  timeoutCount: number;
  successfulProcessingCount: number;
  
  // Capacity metrics
  backlogSize: number;
  maxConcurrentProcessing: number;
  averageConcurrentProcessing: number;
  
  // AI metrics
  aiApiLatency: number;
  aiApiSuccessRate: number;
  aiTokensPerSecond: number;
  aiCostPerFiling: number;
  
  // Database metrics
  avgDatabaseQueryTime: number;
  maxDatabaseQueryTime: number;
  databaseConnectionsUsed: number;
  
  // Circuit breaker metrics
  circuitBreakerActivations: number;
  filingsSkippedDueToTimeout: number;
  timeConstrainedRuns: number;
}

export interface TimeoutAlert {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  details: Record<string, unknown>;
  timestamp: Date;
  thresholdBreached: string;
  recommendedAction?: string;
}

export interface PerformanceThresholds {
  // Timeout prevention thresholds
  timeoutWarningThreshold: number;  // 80% of timeout reached
  timeoutCriticalThreshold: number; // 90% of timeout reached
  
  // Performance thresholds
  maxAcceptableProcessingTime: number; // 5 minutes
  maxAcceptableBacklogSize: number;    // 10 unprocessed filings
  minAcceptableSuccessRate: number;    // 95%
  
  // Circuit breaker thresholds
  maxAcceptableActivations: number;    // 3 per hour
  maxAcceptableSkippedFilings: number; // 5 per run
}

export class PerformanceMetricsCollector {
  private metrics: PerformanceMetrics;
  private thresholds: PerformanceThresholds;
  private alerts: TimeoutAlert[] = [];
  private processingTimes: number[] = [];
  private startTime: number;

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    this.startTime = Date.now();
    this.thresholds = {
      timeoutWarningThreshold: 0.8,     // 80%
      timeoutCriticalThreshold: 0.9,    // 90%
      maxAcceptableProcessingTime: 300000, // 5 minutes
      maxAcceptableBacklogSize: 10,
      minAcceptableSuccessRate: 0.95,   // 95%
      maxAcceptableActivations: 3,
      maxAcceptableSkippedFilings: 5,
      ...thresholds
    };

    this.metrics = this.initializeMetrics();
    
    logger.info('Performance metrics collector initialized', {
      thresholds: this.thresholds
    });
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      avgProcessingTime: 0,
      maxProcessingTime: 0,
      minProcessingTime: Number.MAX_SAFE_INTEGER,
      processingTimeP95: 0,
      processingTimeP99: 0,
      timeoutRate: 0,
      timeoutCount: 0,
      successfulProcessingCount: 0,
      backlogSize: 0,
      maxConcurrentProcessing: 0,
      averageConcurrentProcessing: 0,
      aiApiLatency: 0,
      aiApiSuccessRate: 0,
      aiTokensPerSecond: 0,
      aiCostPerFiling: 0,
      avgDatabaseQueryTime: 0,
      maxDatabaseQueryTime: 0,
      databaseConnectionsUsed: 0,
      circuitBreakerActivations: 0,
      filingsSkippedDueToTimeout: 0,
      timeConstrainedRuns: 0
    };
  }

  /**
   * Record filing processing time
   */
  recordProcessingTime(durationMs: number, success: boolean): void {
    this.processingTimes.push(durationMs);
    
    if (success) {
      this.metrics.successfulProcessingCount++;
    } else {
      this.metrics.timeoutCount++;
    }

    // Update timing metrics
    this.metrics.maxProcessingTime = Math.max(this.metrics.maxProcessingTime, durationMs);
    this.metrics.minProcessingTime = Math.min(this.metrics.minProcessingTime, durationMs);
    this.updateProcessingTimeStats();

    // Check for timeout warning
    this.checkTimeoutThresholds(durationMs);
    
    logger.debug('Processing time recorded', {
      durationMs,
      success,
      avgProcessingTime: this.metrics.avgProcessingTime,
      timeoutRate: this.metrics.timeoutRate
    });
  }

  /**
   * Update processing time statistics
   */
  private updateProcessingTimeStats(): void {
    if (this.processingTimes.length === 0) return;

    const sorted = [...this.processingTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, time) => acc + time, 0);
    
    this.metrics.avgProcessingTime = sum / sorted.length;
    this.metrics.processingTimeP95 = sorted[Math.floor(sorted.length * 0.95)];
    this.metrics.processingTimeP99 = sorted[Math.floor(sorted.length * 0.99)];
    
    const totalProcessing = this.metrics.successfulProcessingCount + this.metrics.timeoutCount;
    this.metrics.timeoutRate = totalProcessing > 0 ? this.metrics.timeoutCount / totalProcessing : 0;
  }

  /**
   * Check timeout thresholds and create alerts
   */
  private checkTimeoutThresholds(processingTimeMs: number): void {
    const timeoutPercent = processingTimeMs / this.thresholds.maxAcceptableProcessingTime;
    
    if (timeoutPercent >= this.thresholds.timeoutCriticalThreshold) {
      this.createAlert('CRITICAL', 'Processing time approaching critical timeout threshold', {
        processingTimeMs,
        thresholdPercent: timeoutPercent * 100,
        maxAcceptableTime: this.thresholds.maxAcceptableProcessingTime
      }, 'timeout_critical_threshold', 'Immediately review and optimize processing pipeline');
    } else if (timeoutPercent >= this.thresholds.timeoutWarningThreshold) {
      this.createAlert('HIGH', 'Processing time approaching timeout warning threshold', {
        processingTimeMs,
        thresholdPercent: timeoutPercent * 100,
        maxAcceptableTime: this.thresholds.maxAcceptableProcessingTime
      }, 'timeout_warning_threshold', 'Monitor closely and prepare optimization');
    }
  }

  /**
   * Record AI API metrics
   */
  recordAIMetrics(
    latencyMs: number,
    success: boolean,
    tokensProcessed: number,
    cost: number
  ): void {
    // Update AI metrics using exponential moving average
    const alpha = 0.3;
    this.metrics.aiApiLatency = alpha * latencyMs + (1 - alpha) * this.metrics.aiApiLatency;
    
    // Update success rate
    const totalAiCalls = this.metrics.successfulProcessingCount + this.metrics.timeoutCount;
    if (totalAiCalls > 0) {
      this.metrics.aiApiSuccessRate = this.metrics.successfulProcessingCount / totalAiCalls;
    }
    
    // Update token and cost metrics
    if (latencyMs > 0) {
      this.metrics.aiTokensPerSecond = tokensProcessed / (latencyMs / 1000);
    }
    this.metrics.aiCostPerFiling = cost;

    // Alert on AI performance issues
    if (!success) {
      this.createAlert('MEDIUM', 'AI API call failed', {
        latencyMs,
        tokensProcessed,
        cost,
        successRate: this.metrics.aiApiSuccessRate
      }, 'ai_api_failure');
    }

    logger.debug('AI metrics recorded', {
      latencyMs,
      success,
      tokensProcessed,
      cost,
      avgLatency: this.metrics.aiApiLatency,
      successRate: this.metrics.aiApiSuccessRate
    });
  }

  /**
   * Record database query metrics
   */
  recordDatabaseMetrics(queryTimeMs: number, connectionsUsed: number): void {
    this.metrics.avgDatabaseQueryTime = 
      (this.metrics.avgDatabaseQueryTime + queryTimeMs) / 2;
    this.metrics.maxDatabaseQueryTime = 
      Math.max(this.metrics.maxDatabaseQueryTime, queryTimeMs);
    this.metrics.databaseConnectionsUsed = connectionsUsed;

    // Alert on slow database queries
    if (queryTimeMs > 5000) { // 5 seconds
      this.createAlert('MEDIUM', 'Slow database query detected', {
        queryTimeMs,
        connectionsUsed,
        avgQueryTime: this.metrics.avgDatabaseQueryTime
      }, 'slow_database_query', 'Review and optimize database query performance');
    }
  }

  /**
   * Record circuit breaker metrics
   */
  recordCircuitBreakerActivation(filingsSkipped: number): void {
    this.metrics.circuitBreakerActivations++;
    this.metrics.filingsSkippedDueToTimeout += filingsSkipped;

    // Alert on frequent circuit breaker activations
    if (this.metrics.circuitBreakerActivations >= this.thresholds.maxAcceptableActivations) {
      this.createAlert('HIGH', 'Circuit breaker activating frequently', {
        activations: this.metrics.circuitBreakerActivations,
        filingsSkipped: this.metrics.filingsSkippedDueToTimeout,
        threshold: this.thresholds.maxAcceptableActivations
      }, 'frequent_circuit_breaker', 'Review processing performance and increase timeout limits');
    }
  }

  /**
   * Record backlog size
   */
  recordBacklogSize(size: number): void {
    this.metrics.backlogSize = size;

    // Alert on large backlog
    if (size > this.thresholds.maxAcceptableBacklogSize) {
      this.createAlert('MEDIUM', 'Large backlog detected', {
        backlogSize: size,
        threshold: this.thresholds.maxAcceptableBacklogSize
      }, 'large_backlog', 'Increase processing capacity or review filing processing efficiency');
    }
  }

  /**
   * Create performance alert
   */
  private createAlert(
    severity: TimeoutAlert['severity'],
    message: string,
    details: Record<string, unknown>,
    thresholdBreached: string,
    recommendedAction?: string
  ): void {
    const alert: TimeoutAlert = {
      severity,
      message,
      details,
      timestamp: new Date(),
      thresholdBreached,
      recommendedAction
    };

    this.alerts.push(alert);
    
    // Keep only last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }

    logger.warn('Performance alert created', alert);
  }

  /**
   * Get current performance status
   */
  getPerformanceStatus(): {
    metrics: PerformanceMetrics;
    alerts: TimeoutAlert[];
    healthScore: number;
    recommendations: string[];
  } {
    const healthScore = this.calculateHealthScore();
    const recommendations = this.generateRecommendations();

    return {
      metrics: { ...this.metrics },
      alerts: [...this.alerts],
      healthScore,
      recommendations
    };
  }

  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(): number {
    let score = 100;

    // Deduct for timeout rate
    score -= this.metrics.timeoutRate * 50; // Max 50 points

    // Deduct for backlog size
    if (this.metrics.backlogSize > this.thresholds.maxAcceptableBacklogSize) {
      score -= 20;
    }

    // Deduct for circuit breaker activations
    if (this.metrics.circuitBreakerActivations > this.thresholds.maxAcceptableActivations) {
      score -= 15;
    }

    // Deduct for slow processing
    if (this.metrics.avgProcessingTime > this.thresholds.maxAcceptableProcessingTime) {
      score -= 10;
    }

    // Deduct for AI failures
    if (this.metrics.aiApiSuccessRate < this.thresholds.minAcceptableSuccessRate) {
      score -= 5;
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.metrics.timeoutRate > 0.1) { // 10%
      recommendations.push('High timeout rate detected - review and optimize processing pipeline');
    }

    if (this.metrics.backlogSize > this.thresholds.maxAcceptableBacklogSize) {
      recommendations.push('Large backlog - consider increasing processing frequency or capacity');
    }

    if (this.metrics.circuitBreakerActivations > this.thresholds.maxAcceptableActivations) {
      recommendations.push('Frequent circuit breaker activations - review timeout limits and processing efficiency');
    }

    if (this.metrics.avgProcessingTime > this.thresholds.maxAcceptableProcessingTime * 0.8) {
      recommendations.push('Processing time approaching limits - optimize AI calls and database queries');
    }

    if (this.metrics.aiApiSuccessRate < this.thresholds.minAcceptableSuccessRate) {
      recommendations.push('AI API failures detected - review API health and retry mechanisms');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is healthy - continue current monitoring');
    }

    return recommendations;
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): Record<string, number> {
    return {
      'tldrsec.processing.avg_time_ms': this.metrics.avgProcessingTime,
      'tldrsec.processing.max_time_ms': this.metrics.maxProcessingTime,
      'tldrsec.processing.timeout_rate': this.metrics.timeoutRate,
      'tldrsec.processing.success_count': this.metrics.successfulProcessingCount,
      'tldrsec.processing.timeout_count': this.metrics.timeoutCount,
      'tldrsec.backlog.size': this.metrics.backlogSize,
      'tldrsec.ai.latency_ms': this.metrics.aiApiLatency,
      'tldrsec.ai.success_rate': this.metrics.aiApiSuccessRate,
      'tldrsec.ai.cost_per_filing': this.metrics.aiCostPerFiling,
      'tldrsec.circuit_breaker.activations': this.metrics.circuitBreakerActivations,
      'tldrsec.circuit_breaker.skipped_filings': this.metrics.filingsSkippedDueToTimeout,
      'tldrsec.database.avg_query_time_ms': this.metrics.avgDatabaseQueryTime,
      'tldrsec.database.connections_used': this.metrics.databaseConnectionsUsed
    };
  }

  /**
   * Reset metrics for new monitoring period
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.processingTimes = [];
    this.alerts = [];
    this.startTime = Date.now();
    
    logger.info('Performance metrics reset for new monitoring period');
  }

  /**
   * Integration with existing CronJobMonitor
   */
  async recordToCronMonitor(monitor: CronJobMonitor): Promise<void> {
    try {
      const status = this.getPerformanceStatus();
      
      await monitor.recordMetric('performance_metrics', {
        healthScore: status.healthScore,
        avgProcessingTime: this.metrics.avgProcessingTime,
        timeoutRate: this.metrics.timeoutRate,
        backlogSize: this.metrics.backlogSize,
        circuitBreakerActivations: this.metrics.circuitBreakerActivations
      });

      // Create alerts in monitor for critical issues
      for (const alert of status.alerts.filter(a => a.severity === 'CRITICAL')) {
        await monitor.createAlert(alert.thresholdBreached.toUpperCase(), {
          severity: alert.severity,
          message: alert.message,
          details: alert.details
        });
      }
    } catch (error) {
      logger.error('Failed to record metrics to cron monitor', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Record batch processing performance metrics
   */
  recordBatchProcessingMetrics(batchResult: {
    totalFilings: number;
    processedFilings: number;
    successfulUsers: number;
    skippedFilings: number;
    errors: string[];
    processingTime: number;
  }): void {
    // Calculate batch efficiency metrics
    const batchEfficiency = batchResult.totalFilings > 0 
      ? (batchResult.processedFilings / batchResult.totalFilings) * 100 
      : 0;
    
    const userSuccessRate = batchResult.processedFilings > 0 
      ? (batchResult.successfulUsers / batchResult.processedFilings) * 100 
      : 0;

    // Update processing time metrics
    this.recordProcessingTime(batchResult.processingTime, batchResult.errors.length === 0);

    // Update backlog metrics
    this.recordBacklogSize(batchResult.skippedFilings);

    // Create alerts for batch processing issues
    if (batchEfficiency < 50 && batchResult.totalFilings > 0) {
      this.createAlert('HIGH', 'Low batch processing efficiency', {
        batchEfficiency: batchEfficiency.toFixed(1) + '%',
        totalFilings: batchResult.totalFilings,
        processedFilings: batchResult.processedFilings,
        skippedFilings: batchResult.skippedFilings,
        errorCount: batchResult.errors.length
      }, 'batch_efficiency_low', 'Consider optimizing circuit breaker thresholds or processing capacity');
    }

    if (userSuccessRate < 70 && batchResult.processedFilings > 0) {
      this.createAlert('MEDIUM', 'Low user processing success rate', {
        userSuccessRate: userSuccessRate.toFixed(1) + '%',
        successfulUsers: batchResult.successfulUsers,
        processedFilings: batchResult.processedFilings,
        errors: batchResult.errors.slice(0, 3) // First 3 errors for debugging
      }, 'user_success_rate_low', 'Investigate user processing failures and AI timeout issues');
    }

    logger.info('Batch processing metrics recorded', {
      batchEfficiency: batchEfficiency.toFixed(1) + '%',
      userSuccessRate: userSuccessRate.toFixed(1) + '%',
      processingTime: batchResult.processingTime,
      totalFilings: batchResult.totalFilings,
      processedFilings: batchResult.processedFilings,
      successfulUsers: batchResult.successfulUsers,
      errors: batchResult.errors.length
    });
  }
}

// Export singleton instance
export const performanceMetrics = new PerformanceMetricsCollector();