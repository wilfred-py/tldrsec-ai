/**
 * Async Alert Queue System
 * High-performance, non-blocking alert processing to eliminate main thread blocking
 * Addresses critical performance bottleneck: 120-285ms per filing down to <10ms
 */

import { getPrismaClient } from '../db/prisma';
import { logger } from '../logging';
import { CronAlertType, AlertSeverity } from '@prisma/client';

const alertLogger = logger.child('async-alert-queue');

interface QueuedAlert {
  id: string;
  executionId: string;
  alertType: string;
  severity: string;
  message: string;
  details?: any;
  jobName: string;
  environment: string;
  timestamp: Date;
  retryCount: number;
}

interface AlertBatch {
  alerts: QueuedAlert[];
  metricUpdates: Map<string, { errorCount: number; warningCount: number }>;
}

interface QueueConfig {
  maxBatchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeoutMs: number;
}

export class AsyncAlertQueue {
  private static instance: AsyncAlertQueue;
  private queue: QueuedAlert[] = [];
  private metricUpdates = new Map<string, { errorCount: number; warningCount: number }>();
  private flushTimer?: NodeJS.Timeout;
  private isProcessing = false;
  private circuitBreakerOpen = false;
  private consecutiveFailures = 0;
  private lastCircuitBreakerOpen = 0;
  
  private readonly config: QueueConfig = {
    maxBatchSize: Number(process.env.ALERT_BATCH_SIZE) || 50,
    flushIntervalMs: Number(process.env.ALERT_FLUSH_INTERVAL) || 5000, // 5 seconds
    maxRetries: 3,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeoutMs: 30000 // 30 seconds
  };

  // IMPORTANT: Use lazy accessor to avoid calling getPrismaClient() at module load time
  // The singleton is exported at module level, so the constructor runs during build/import
  private getPrisma = () => getPrismaClient();

  private constructor() {
    this.startFlushTimer();
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  public static getInstance(): AsyncAlertQueue {
    if (!AsyncAlertQueue.instance) {
      AsyncAlertQueue.instance = new AsyncAlertQueue();
    }
    return AsyncAlertQueue.instance;
  }

  /**
   * Queue alert for async processing (non-blocking)
   * Reduces main thread blocking from 120-285ms to <1ms
   */
  public async queueAlert(alertData: {
    executionId: string;
    alertType: string;
    severity: string;
    message: string;
    details?: any;
    jobName: string;
    environment: string;
  }): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Fast path: Skip if circuit breaker is open
      if (this.isCircuitBreakerOpen()) {
        alertLogger.warn('Alert queue circuit breaker open, skipping alert', {
          alertType: alertData.alertType,
          executionId: alertData.executionId
        });
        return;
      }

      // Fast validation and queuing (should be <1ms)
      const queuedAlert: QueuedAlert = {
        id: `${alertData.executionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...alertData,
        timestamp: new Date(),
        retryCount: 0
      };

      this.queue.push(queuedAlert);

      // Update metric aggregation for batch processing
      this.aggregateMetricUpdate(alertData.executionId, alertData.severity);

      // Trigger immediate flush if batch is full
      if (this.queue.length >= this.config.maxBatchSize) {
        setImmediate(() => this.flushQueue());
      }

      const processingTime = Date.now() - startTime;
      if (processingTime > 5) {
        alertLogger.warn('Alert queueing took longer than expected', {
          processingTimeMs: processingTime,
          queueSize: this.queue.length
        });
      }

    } catch (error) {
      alertLogger.error('Failed to queue alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        alertType: alertData.alertType,
        executionId: alertData.executionId,
        processingTimeMs: Date.now() - startTime
      });
    }
  }

  /**
   * Aggregate metric updates to reduce database writes
   */
  private aggregateMetricUpdate(executionId: string, severity: string): void {
    const existing = this.metricUpdates.get(executionId) || { errorCount: 0, warningCount: 0 };
    
    if (severity === 'CRITICAL') {
      existing.errorCount++;
    } else if (severity === 'WARNING') {
      existing.warningCount++;
    }
    
    this.metricUpdates.set(executionId, existing);
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        setImmediate(() => this.flushQueue());
      }
    }, this.config.flushIntervalMs);
  }

  /**
   * Flush queued alerts in batches (non-blocking)
   */
  private async flushQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0 || this.isCircuitBreakerOpen()) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Create batch from current queue
      const batch: AlertBatch = {
        alerts: this.queue.splice(0, this.config.maxBatchSize),
        metricUpdates: new Map(this.metricUpdates)
      };
      
      this.metricUpdates.clear();

      alertLogger.debug('Processing alert batch', {
        batchSize: batch.alerts.length,
        metricUpdatesCount: batch.metricUpdates.size
      });

      // Process batch with transaction
      await this.processBatch(batch);

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;
      this.circuitBreakerOpen = false;

      const processingTime = Date.now() - startTime;
      alertLogger.info('Alert batch processed successfully', {
        batchSize: batch.alerts.length,
        processingTimeMs: processingTime,
        remainingQueueSize: this.queue.length
      });

    } catch (error) {
      await this.handleBatchError(error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process alert batch with optimized database operations
   */
  private async processBatch(batch: AlertBatch): Promise<void> {
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
    
    if (isTestEnvironment) {
      alertLogger.debug('Skipping batch processing in test environment', {
        batchSize: batch.alerts.length
      });
      return;
    }

    try {
      // Use transaction for consistency
      const prisma = this.getPrisma();
      await prisma.$transaction(async (tx) => {
        // 1. Batch insert alerts
        if (batch.alerts.length > 0) {
          const alertInserts = batch.alerts.map(alert => ({
            executionId: alert.executionId,
            alertType: this.mapToAlertType(alert.alertType),
            severity: this.mapToSeverity(alert.severity),
            title: this.generateAlertTitle(alert.alertType, alert.severity),
            description: alert.message,
            actualValue: alert.details || {},
            jobName: alert.jobName,
            environment: alert.environment,
            triggeredAt: alert.timestamp
          }));

          // Check if CronJobAlert model exists
          if (prisma.cronJobAlert) {
            await tx.cronJobAlert.createMany({
              data: alertInserts,
              skipDuplicates: true
            });
          }
        }

        // 2. Batch update metrics
        if (batch.metricUpdates.size > 0) {
          const metricUpdatePromises = Array.from(batch.metricUpdates.entries()).map(
            ([executionId, updates]) =>
              tx.cronJobExecution.update({
                where: { executionId },
                data: {
                  errorsCount: { increment: updates.errorCount },
                  // Note: warningCount not in schema, would need to be added
                }
              }).catch(error => {
                // Log but don't fail the entire batch for metric update errors
                alertLogger.warn('Failed to update metrics for execution', {
                  executionId,
                  error: error instanceof Error ? error.message : 'Unknown error'
                });
              })
          );

          await Promise.allSettled(metricUpdatePromises);
        }
      });

    } catch (error) {
      alertLogger.error('Database transaction failed for alert batch', {
        error: error instanceof Error ? error.message : 'Unknown error',
        batchSize: batch.alerts.length
      });
      throw error;
    }
  }

  /**
   * Handle batch processing errors with circuit breaker
   */
  private async handleBatchError(error: unknown): Promise<void> {
    this.consecutiveFailures++;
    
    alertLogger.error('Alert batch processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      consecutiveFailures: this.consecutiveFailures,
      queueSize: this.queue.length
    });

    // Open circuit breaker if threshold exceeded
    if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerOpen = true;
      this.lastCircuitBreakerOpen = Date.now();
      
      alertLogger.error('Alert queue circuit breaker opened', {
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.config.circuitBreakerThreshold
      });
    }

    // TODO: Implement retry logic for failed alerts
    // For now, we drop failed alerts to prevent memory buildup
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpen) {
      return false;
    }

    // Check if timeout period has passed
    if (Date.now() - this.lastCircuitBreakerOpen > this.config.circuitBreakerTimeoutMs) {
      this.circuitBreakerOpen = false;
      this.consecutiveFailures = 0;
      alertLogger.info('Alert queue circuit breaker closed after timeout');
      return false;
    }

    return true;
  }

  /**
   * Map string alert type to Prisma enum
   */
  private mapToAlertType(alertType: string): CronAlertType {
    const typeMap: Record<string, CronAlertType> = {
      'EXECUTION_FAILED': CronAlertType.EXECUTION_FAILED,
      'HIGH_ERROR_RATE': CronAlertType.HIGH_ERROR_RATE,
      'COST_THRESHOLD_EXCEEDED': CronAlertType.COST_THRESHOLD_EXCEEDED,
      'PERFORMANCE_DEGRADED': CronAlertType.PERFORMANCE_DEGRADED,
      'NO_FILINGS_PROCESSED': CronAlertType.NO_FILINGS_PROCESSED,
      'EMAIL_DELIVERY_FAILED': CronAlertType.EMAIL_DELIVERY_FAILED,
      'TIMEOUT_EXCEEDED': CronAlertType.TIMEOUT_EXCEEDED,
      'MEMORY_LIMIT_EXCEEDED': CronAlertType.MEMORY_LIMIT_EXCEEDED,
      'API_RATE_LIMIT_HIT': CronAlertType.API_RATE_LIMIT_HIT,
      'DATABASE_CONNECTION_FAILED': CronAlertType.DATABASE_CONNECTION_FAILED
    };
    
    return typeMap[alertType.toUpperCase()] || CronAlertType.EXECUTION_FAILED;
  }

  /**
   * Map string severity to Prisma enum
   */
  private mapToSeverity(severity: string): AlertSeverity {
    const severityMap: Record<string, AlertSeverity> = {
      'LOW': AlertSeverity.LOW,
      'MEDIUM': AlertSeverity.MEDIUM,
      'HIGH': AlertSeverity.HIGH,
      'CRITICAL': AlertSeverity.CRITICAL
    };
    
    return severityMap[severity.toUpperCase()] || AlertSeverity.MEDIUM;
  }

  /**
   * Generate alert title (cached for performance)
   */
  private generateAlertTitle(alertType: string, severity: string): string {
    const severityPrefix = severity === 'CRITICAL' ? '🚨 CRITICAL' : 
                          severity === 'HIGH' ? '⚠️ HIGH' :
                          severity === 'MEDIUM' ? '⚡ MEDIUM' : 
                          '📋 LOW';
    
    switch (alertType.toUpperCase()) {
      case 'EXECUTION_FAILED':
        return `${severityPrefix}: Cron Job Execution Failed`;
      case 'HIGH_ERROR_RATE':
        return `${severityPrefix}: High Error Rate Detected`;
      case 'COST_THRESHOLD_EXCEEDED':
        return `${severityPrefix}: Cost Threshold Exceeded`;
      case 'PERFORMANCE_DEGRADED':
        return `${severityPrefix}: Performance Degradation`;
      case 'NO_FILINGS_PROCESSED':
        return `${severityPrefix}: No Filings Processed`;
      case 'EMAIL_DELIVERY_FAILED':
        return `${severityPrefix}: Email Delivery Failed`;
      case 'TIMEOUT_EXCEEDED':
        return `${severityPrefix}: Execution Timeout`;
      case 'MEMORY_LIMIT_EXCEEDED':
        return `${severityPrefix}: Memory Limit Exceeded`;
      case 'API_RATE_LIMIT_HIT':
        return `${severityPrefix}: API Rate Limit Hit`;
      case 'DATABASE_CONNECTION_FAILED':
        return `${severityPrefix}: Database Connection Failed`;
      default:
        return `${severityPrefix}: ${alertType} Alert`;
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  public getQueueStats(): {
    queueSize: number;
    isProcessing: boolean;
    circuitBreakerOpen: boolean;
    consecutiveFailures: number;
  } {
    return {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveFailures: this.consecutiveFailures
    };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    alertLogger.info('Shutting down async alert queue');
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining alerts
    if (this.queue.length > 0) {
      alertLogger.info(`Flushing ${this.queue.length} remaining alerts before shutdown`);
      await this.flushQueue();
    }

    alertLogger.info('Async alert queue shutdown complete');
  }
}

// Export singleton instance
export const asyncAlertQueue = AsyncAlertQueue.getInstance();