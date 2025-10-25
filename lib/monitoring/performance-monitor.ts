/**
 * Performance Monitor
 * Tracks performance metrics for the optimized alert and context systems
 * Provides regression detection and performance analytics
 */

import { logger } from '../logging';
import { asyncAlertQueue } from './async-alert-queue';
import { boundedContextManager } from '../cron/bounded-context-manager';

const perfLogger = logger.child('performance-monitor');

interface PerformanceMetrics {
  alertProcessingTime: {
    avg: number;
    max: number;
    min: number;
    count: number;
  };
  contextMemoryUsage: {
    current: number;
    peak: number;
    evicted: number;
  };
  databaseOperations: {
    batched: number;
    individual: number;
    batchRatio: number;
  };
  mainThreadBlocking: {
    totalBlockingTime: number;
    maxBlockingTime: number;
    blockingEvents: number;
  };
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics;
  private alertTimings: number[] = [];
  private blockingTimings: number[] = [];
  private lastReportTime = 0;
  private reportIntervalMs = 300000; // 5 minutes

  private constructor() {
    this.resetMetrics();
    this.startPeriodicReporting();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Record alert processing time
   */
  public recordAlertProcessingTime(durationMs: number): void {
    this.alertTimings.push(durationMs);
    
    // Keep only recent timings to prevent memory growth
    if (this.alertTimings.length > 1000) {
      this.alertTimings = this.alertTimings.slice(-500);
    }

    // Update metrics
    this.updateAlertMetrics();

    // Alert if processing time exceeds target
    if (durationMs > 10) {
      perfLogger.warn('Alert processing time exceeded target', {
        durationMs,
        targetMs: 10,
        overheadMs: durationMs - 10
      });
    }
  }

  /**
   * Record main thread blocking time
   */
  public recordMainThreadBlocking(durationMs: number): void {
    this.blockingTimings.push(durationMs);
    
    // Keep only recent timings
    if (this.blockingTimings.length > 1000) {
      this.blockingTimings = this.blockingTimings.slice(-500);
    }

    // Update metrics
    this.updateBlockingMetrics();

    // Alert if blocking time is excessive
    if (durationMs > 50) {
      perfLogger.warn('Excessive main thread blocking detected', {
        durationMs,
        targetMs: 10,
        excessiveThresholdMs: 50
      });
    }
  }

  /**
   * Record database operation type
   */
  public recordDatabaseOperation(type: 'batched' | 'individual'): void {
    if (type === 'batched') {
      this.metrics.databaseOperations.batched++;
    } else {
      this.metrics.databaseOperations.individual++;
    }

    this.updateDatabaseMetrics();
  }

  /**
   * Get current performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    this.updateAllMetrics();
    return JSON.parse(JSON.stringify(this.metrics)); // Deep copy
  }

  /**
   * Check if performance has regressed
   */
  public checkPerformanceRegression(): {
    hasRegression: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check alert processing time
    if (this.metrics.alertProcessingTime.avg > 10) {
      issues.push(`Alert processing average (${this.metrics.alertProcessingTime.avg}ms) exceeds target (10ms)`);
    }

    // Check memory usage
    const contextStats = boundedContextManager.getStats();
    if (contextStats.memoryUsageMB > 500) {
      issues.push(`Memory usage (${contextStats.memoryUsageMB}MB) is excessive`);
    }

    // Check batch ratio
    if (this.metrics.databaseOperations.batchRatio < 0.8) {
      issues.push(`Database batch ratio (${this.metrics.databaseOperations.batchRatio}) is below target (0.8)`);
    }

    // Check main thread blocking
    if (this.metrics.mainThreadBlocking.maxBlockingTime > 100) {
      issues.push(`Max blocking time (${this.metrics.mainThreadBlocking.maxBlockingTime}ms) exceeds threshold (100ms)`);
    }

    return {
      hasRegression: issues.length > 0,
      issues
    };
  }

  /**
   * Generate performance report
   */
  public generateReport(): string {
    const metrics = this.getMetrics();
    const queueStats = asyncAlertQueue.getQueueStats();
    const contextStats = boundedContextManager.getStats();
    const regression = this.checkPerformanceRegression();

    const report = `
PERFORMANCE MONITOR REPORT
=========================

ALERT SYSTEM PERFORMANCE:
- Queue Size: ${queueStats.queueSize}
- Processing: ${queueStats.isProcessing ? 'Yes' : 'No'}
- Circuit Breaker: ${queueStats.circuitBreakerOpen ? 'OPEN' : 'Closed'}
- Consecutive Failures: ${queueStats.consecutiveFailures}

PROCESSING TIMES:
- Alert Avg: ${metrics.alertProcessingTime.avg}ms (Target: <10ms)
- Alert Max: ${metrics.alertProcessingTime.max}ms
- Alert Count: ${metrics.alertProcessingTime.count}

MEMORY MANAGEMENT:
- Total Contexts: ${contextStats.totalContexts}
- Active Contexts: ${contextStats.activeContexts}
- Memory Usage: ${contextStats.memoryUsageMB}MB
- Evicted Contexts: ${contextStats.evictedContexts}
- Cache Hit Ratio: ${contextStats.cacheHitRatio}

DATABASE OPERATIONS:
- Batched: ${metrics.databaseOperations.batched}
- Individual: ${metrics.databaseOperations.individual}
- Batch Ratio: ${metrics.databaseOperations.batchRatio} (Target: >0.8)

MAIN THREAD BLOCKING:
- Total Blocking: ${metrics.mainThreadBlocking.totalBlockingTime}ms
- Max Blocking: ${metrics.mainThreadBlocking.maxBlockingTime}ms
- Blocking Events: ${metrics.mainThreadBlocking.blockingEvents}

PERFORMANCE STATUS: ${regression.hasRegression ? '❌ REGRESSION DETECTED' : '✅ HEALTHY'}
${regression.issues.length > 0 ? '\nISSUES:\n' + regression.issues.map(issue => `- ${issue}`).join('\n') : ''}
`;

    return report;
  }

  /**
   * Update alert processing metrics
   */
  private updateAlertMetrics(): void {
    if (this.alertTimings.length === 0) return;

    const sum = this.alertTimings.reduce((a, b) => a + b, 0);
    this.metrics.alertProcessingTime = {
      avg: Math.round(sum / this.alertTimings.length * 100) / 100,
      max: Math.max(...this.alertTimings),
      min: Math.min(...this.alertTimings),
      count: this.alertTimings.length
    };
  }

  /**
   * Update blocking time metrics
   */
  private updateBlockingMetrics(): void {
    if (this.blockingTimings.length === 0) return;

    const sum = this.blockingTimings.reduce((a, b) => a + b, 0);
    this.metrics.mainThreadBlocking = {
      totalBlockingTime: sum,
      maxBlockingTime: Math.max(...this.blockingTimings),
      blockingEvents: this.blockingTimings.length
    };
  }

  /**
   * Update database operation metrics
   */
  private updateDatabaseMetrics(): void {
    const total = this.metrics.databaseOperations.batched + this.metrics.databaseOperations.individual;
    this.metrics.databaseOperations.batchRatio = total > 0 
      ? Math.round((this.metrics.databaseOperations.batched / total) * 100) / 100
      : 0;
  }

  /**
   * Update all metrics
   */
  private updateAllMetrics(): void {
    this.updateAlertMetrics();
    this.updateBlockingMetrics();
    this.updateDatabaseMetrics();

    // Update context memory metrics
    const contextStats = boundedContextManager.getStats();
    this.metrics.contextMemoryUsage = {
      current: contextStats.memoryUsageMB,
      peak: Math.max(this.metrics.contextMemoryUsage.peak, contextStats.memoryUsageMB),
      evicted: contextStats.evictedContexts
    };
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): void {
    this.metrics = {
      alertProcessingTime: { avg: 0, max: 0, min: 0, count: 0 },
      contextMemoryUsage: { current: 0, peak: 0, evicted: 0 },
      databaseOperations: { batched: 0, individual: 0, batchRatio: 0 },
      mainThreadBlocking: { totalBlockingTime: 0, maxBlockingTime: 0, blockingEvents: 0 }
    };
    this.alertTimings = [];
    this.blockingTimings = [];
  }

  /**
   * Start periodic performance reporting
   */
  private startPeriodicReporting(): void {
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastReportTime >= this.reportIntervalMs) {
        this.generatePeriodicReport();
        this.lastReportTime = now;
      }
    }, 60000); // Check every minute
  }

  /**
   * Generate periodic performance report
   */
  private generatePeriodicReport(): void {
    try {
      const report = this.generateReport();
      const regression = this.checkPerformanceRegression();

      if (regression.hasRegression) {
        perfLogger.error('Performance regression detected', {
          issues: regression.issues,
          report
        });
      } else {
        perfLogger.info('Performance status healthy', {
          metrics: this.getMetrics()
        });
      }

    } catch (error) {
      perfLogger.error('Failed to generate performance report', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Measure function execution time
   */
  public measureExecutionTime<T>(
    fn: () => Promise<T>,
    category: 'alert' | 'blocking' | 'context'
  ): Promise<T> {
    const startTime = Date.now();

    return fn().then(
      result => {
        const duration = Date.now() - startTime;
        
        switch (category) {
          case 'alert':
            this.recordAlertProcessingTime(duration);
            break;
          case 'blocking':
            this.recordMainThreadBlocking(duration);
            break;
          case 'context':
            // Context operations should be very fast
            if (duration > 5) {
              perfLogger.warn('Slow context operation detected', { duration });
            }
            break;
        }

        return result;
      },
      error => {
        const duration = Date.now() - startTime;
        perfLogger.warn('Function execution failed', {
          category,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    );
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();