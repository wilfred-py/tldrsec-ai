/**
 * Database Monitoring Integration
 * 
 * Extends the existing monitoring system with database-specific metrics
 * for connection health, retry operations, and performance tracking
 */

import { monitoring } from '@/lib/monitoring';
import { logger } from '@/lib/logging';

// Database-specific metrics
export interface DatabaseMetrics {
  connectionAttempts: number;
  connectionSuccesses: number;
  connectionFailures: number;
  retryAttempts: number;
  retrySuccesses: number;
  retryFailures: number;
  coldStartEvents: number;
  warmupOperations: number;
  responseTimeMs: number;
}

export interface DatabaseHealthDetails {
  connectionPoolSize?: number;
  activeConnections?: number;
  idleConnections?: number;
  lastSuccessfulConnection?: Date;
  lastConnectionError?: string;
  avgResponseTime?: number;
  retrySuccessRate?: number;
}

// Component logger for database monitoring
const dbMonitoringLogger = logger.child('db-monitoring');

/**
 * Database Monitoring Service
 * Provides database-specific monitoring and metrics collection
 */
class DatabaseMonitoring {
  private coldStartDetected = false;
  private lastHealthCheck?: Date;
  private connectionErrors: string[] = [];
  private maxErrorHistory = 10;

  /**
   * Track database connection attempt
   */
  trackConnectionAttempt(success: boolean, error?: Error): void {
    monitoring.incrementCounter('db.connection.attempts', 1);
    
    if (success) {
      monitoring.incrementCounter('db.connection.successes', 1);
      this.coldStartDetected = false;
    } else {
      monitoring.incrementCounter('db.connection.failures', 1);
      
      if (error) {
        this.addConnectionError(error.message);
        
        // Detect cold start scenarios
        if (this.isColdStartError(error)) {
          this.trackColdStart();
        }
      }
    }
    
    dbMonitoringLogger.debug('Database connection attempt tracked', {
      success,
      error: error?.message,
      coldStart: this.coldStartDetected
    });
  }

  /**
   * Track retry operation
   */
  trackRetryOperation(
    attempt: number,
    success: boolean,
    error?: Error,
    operationType: 'query' | 'mutation' | 'healthCheck' = 'query'
  ): void {
    monitoring.incrementCounter('db.retry.attempts', 1, {
      attempt: attempt.toString(),
      operationType
    });
    
    if (success) {
      monitoring.incrementCounter('db.retry.successes', 1, {
        attempt: attempt.toString(),
        operationType
      });
    } else {
      monitoring.incrementCounter('db.retry.failures', 1, {
        attempt: attempt.toString(),
        operationType
      });
    }
    
    dbMonitoringLogger.info('Database retry operation tracked', {
      attempt,
      success,
      operationType,
      error: error?.message
    });
  }

  /**
   * Track cold start event
   */
  trackColdStart(): void {
    if (!this.coldStartDetected) {
      monitoring.incrementCounter('db.cold_starts', 1);
      this.coldStartDetected = true;
      
      dbMonitoringLogger.warn('Database cold start detected', {
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Track connection warmup operation
   */
  trackWarmupOperation(success: boolean, responseTimeMs: number): void {
    monitoring.incrementCounter('db.warmup.operations', 1);
    monitoring.recordTiming('db.warmup.response_time', responseTimeMs);
    
    if (success) {
      monitoring.incrementCounter('db.warmup.successes', 1);
    } else {
      monitoring.incrementCounter('db.warmup.failures', 1);
    }
    
    dbMonitoringLogger.info('Database warmup operation tracked', {
      success,
      responseTimeMs
    });
  }

  /**
   * Track database operation response time
   */
  trackResponseTime(operationType: string, responseTimeMs: number): void {
    monitoring.recordTiming(`db.${operationType}.response_time`, responseTimeMs);
    
    // Track response time buckets for alerting
    const bucket = this.getResponseTimeBucket(responseTimeMs);
    monitoring.incrementCounter(`db.${operationType}.response_bucket`, 1, {
      bucket
    });
  }

  /**
   * Track health check operation
   */
  trackHealthCheck(success: boolean, responseTimeMs: number, userCount?: number): void {
    this.lastHealthCheck = new Date();
    
    monitoring.incrementCounter('db.health_checks', 1);
    monitoring.recordTiming('db.health_check.response_time', responseTimeMs);
    
    if (success) {
      monitoring.incrementCounter('db.health_check.successes', 1);
      
      if (userCount !== undefined) {
        monitoring.recordValue('db.user_count', userCount);
      }
    } else {
      monitoring.incrementCounter('db.health_check.failures', 1);
    }
    
    dbMonitoringLogger.info('Database health check tracked', {
      success,
      responseTimeMs,
      userCount
    });
  }

  /**
   * Get current database health status
   */
  async getDatabaseHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
    details: DatabaseHealthDetails;
  }> {
    const now = new Date();
    const timeSinceLastCheck = this.lastHealthCheck 
      ? now.getTime() - this.lastHealthCheck.getTime()
      : Infinity;
    
    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string | undefined;
    
    if (timeSinceLastCheck > 300000) { // 5 minutes
      status = 'unhealthy';
      message = 'No recent health checks';
    } else if (this.connectionErrors.length > 5) {
      status = 'degraded';
      message = `Multiple connection errors: ${this.connectionErrors.length}`;
    } else if (this.coldStartDetected) {
      status = 'degraded';
      message = 'Recent cold start detected';
    } else {
      status = 'healthy';
    }
    
    const details: DatabaseHealthDetails = {
      lastSuccessfulConnection: this.lastHealthCheck,
      lastConnectionError: this.connectionErrors[this.connectionErrors.length - 1],
      retrySuccessRate: await this.calculateRetrySuccessRate()
    };
    
    return { status, message, details };
  }

  /**
   * Register database health check with monitoring system
   */
  registerHealthCheck(): void {
    monitoring.registerHealthCheck('database', async () => {
      const health = await this.getDatabaseHealth();
      return {
        status: health.status,
        message: health.message,
        details: health.details,
        lastChecked: new Date()
      };
    });
    
    dbMonitoringLogger.info('Database health check registered with monitoring system');
  }

  /**
   * Get monitoring dashboard data
   */
  getDashboardMetrics(): {
    connectionSuccess: number;
    retrySuccessRate: number;
    avgResponseTime: number;
    coldStartsToday: number;
    healthStatus: string;
  } {
    // This would typically fetch from the monitoring system
    // For now, return placeholder structure
    return {
      connectionSuccess: 0.95, // 95% success rate
      retrySuccessRate: 0.85,  // 85% retry success rate
      avgResponseTime: 250,    // 250ms average
      coldStartsToday: 3,      // 3 cold starts today
      healthStatus: this.coldStartDetected ? 'degraded' : 'healthy'
    };
  }

  /**
   * Reset monitoring state (useful for testing)
   */
  reset(): void {
    this.coldStartDetected = false;
    this.lastHealthCheck = undefined;
    this.connectionErrors = [];
    
    dbMonitoringLogger.debug('Database monitoring state reset');
  }

  // Private helper methods

  private isColdStartError(error: Error): boolean {
    const coldStartIndicators = [
      "can't reach database server",
      'connection timeout',
      'server closed the connection',
      'connection refused',
      'initialization error'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return coldStartIndicators.some(indicator => 
      errorMessage.includes(indicator)
    );
  }

  private addConnectionError(errorMessage: string): void {
    this.connectionErrors.push(errorMessage);
    
    // Keep only recent errors
    if (this.connectionErrors.length > this.maxErrorHistory) {
      this.connectionErrors = this.connectionErrors.slice(-this.maxErrorHistory);
    }
  }

  private getResponseTimeBucket(responseTimeMs: number): string {
    if (responseTimeMs < 100) return 'fast';
    if (responseTimeMs < 500) return 'normal';
    if (responseTimeMs < 1000) return 'slow';
    return 'very_slow';
  }

  private async calculateRetrySuccessRate(): Promise<number> {
    // This would typically calculate from stored metrics
    // For now, return a placeholder
    return 0.85; // 85% success rate
  }
}

// Export singleton instance
export const databaseMonitoring = new DatabaseMonitoring();

// Register health check on module load
databaseMonitoring.registerHealthCheck();

// Export types and utilities
export { DatabaseMonitoring };
export type { DatabaseMetrics, DatabaseHealthDetails };