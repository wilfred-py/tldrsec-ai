/**
 * Railway Production Alerting System
 * Critical infrastructure monitoring for production environment
 */

import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';

const prisma = getPrismaClient();
const alertLogger = logger.child('railway-alerts');

export interface AlertThreshold {
  metric: string;
  threshold: number;
  comparison: 'gt' | 'lt' | 'eq';
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

export interface AlertNotification {
  id: string;
  metric: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  environment: string;
}

export class RailwayAlertManager {
  private static readonly ALERT_THRESHOLDS: AlertThreshold[] = [
    // Critical cron job failures
    {
      metric: 'cron_job_failure_rate',
      threshold: 20, // 20% failure rate
      comparison: 'gt',
      severity: 'critical',
      description: 'High cron job failure rate detected'
    },
    
    // Database connection issues
    {
      metric: 'database_error_rate',
      threshold: 5, // 5% error rate
      comparison: 'gt',
      severity: 'critical',
      description: 'Database connection errors detected'
    },
    
    // Memory usage alerts
    {
      metric: 'memory_usage_percent',
      threshold: 85, // 85% memory usage
      comparison: 'gt',
      severity: 'warning',
      description: 'High memory usage detected'
    },
    
    // API response time degradation
    {
      metric: 'api_response_time_p95',
      threshold: 2000, // 2 second p95 response time
      comparison: 'gt',
      severity: 'warning',
      description: 'API response time degradation'
    },
    
    // Filing processing errors
    {
      metric: 'filing_processing_error_rate',
      threshold: 10, // 10% error rate
      comparison: 'gt',
      severity: 'critical',
      description: 'High filing processing error rate'
    },
    
    // Email delivery failures
    {
      metric: 'email_failure_rate',
      threshold: 15, // 15% failure rate
      comparison: 'gt',
      severity: 'warning',
      description: 'Email delivery issues detected'
    }
  ];

  /**
   * Check all alert thresholds and send notifications if needed
   */
  static async checkAlerts(): Promise<AlertNotification[]> {
    const alerts: AlertNotification[] = [];
    const environment = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'unknown';

    for (const threshold of this.ALERT_THRESHOLDS) {
      try {
        const currentValue = await this.getMetricValue(threshold.metric);
        
        if (this.isThresholdBreached(currentValue, threshold)) {
          const alert: AlertNotification = {
            id: `${threshold.metric}-${Date.now()}`,
            metric: threshold.metric,
            severity: threshold.severity,
            message: `${threshold.description}: ${currentValue}${this.getUnit(threshold.metric)} (threshold: ${threshold.threshold}${this.getUnit(threshold.metric)})`,
            value: currentValue,
            threshold: threshold.threshold,
            timestamp: new Date(),
            environment
          };

          alerts.push(alert);
          
          // Log alert
          alertLogger.warn('Alert threshold breached', {
            metric: threshold.metric,
            severity: threshold.severity,
            value: currentValue,
            threshold: threshold.threshold,
            environment
          });
          
          // Send notification (implement based on your notification system)
          await this.sendAlert(alert);
        }
        
      } catch (error) {
        alertLogger.error(`Failed to check alert for ${threshold.metric}`, { error });
      }
    }

    return alerts;
  }

  /**
   * Get current value for a specific metric
   */
  private static async getMetricValue(metric: string): Promise<number> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    switch (metric) {
      case 'cron_job_failure_rate':
        return await this.getCronJobFailureRate(fiveMinutesAgo, now);
      
      case 'database_error_rate':
        return await this.getDatabaseErrorRate(fiveMinutesAgo, now);
      
      case 'memory_usage_percent':
        return this.getMemoryUsagePercent();
      
      case 'api_response_time_p95':
        return 500; // Placeholder - implement based on your metrics
      
      case 'filing_processing_error_rate':
        return await this.getFilingProcessingErrorRate(fiveMinutesAgo, now);
      
      case 'email_failure_rate':
        return 2; // Placeholder - implement based on your metrics
      
      default:
        return 0;
    }
  }

  /**
   * Calculate cron job failure rate
   */
  private static async getCronJobFailureRate(startTime: Date, endTime: Date): Promise<number> {
    try {
      const totalJobs = await prisma.cronJobExecution.count({
        where: {
          startedAt: {
            gte: startTime,
            lte: endTime
          }
        }
      });

      if (totalJobs === 0) return 0;

      const failedJobs = await prisma.cronJobExecution.count({
        where: {
          startedAt: {
            gte: startTime,
            lte: endTime
          },
          status: 'FAILED'
        }
      });

      return (failedJobs / totalJobs) * 100;
    } catch (error) {
      alertLogger.error('Failed to calculate cron job failure rate', { error });
      return 0;
    }
  }

  /**
   * Calculate database error rate (placeholder implementation)
   */
  private static async getDatabaseErrorRate(startTime: Date, endTime: Date): Promise<number> {
    try {
      // Test database connectivity
      await prisma.$queryRaw`SELECT 1`;
      return 0; // If query succeeds, no errors
    } catch (error) {
      return 100; // If query fails, 100% error rate
    }
  }

  /**
   * Get current memory usage percentage
   */
  private static getMemoryUsagePercent(): number {
    const memoryUsage = process.memoryUsage();
    return (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  }

  /**
   * Calculate filing processing error rate
   */
  private static async getFilingProcessingErrorRate(startTime: Date, endTime: Date): Promise<number> {
    try {
      const totalExecutions = await prisma.cronJobExecution.count({
        where: {
          startedAt: {
            gte: startTime,
            lte: endTime
          }
        }
      });

      if (totalExecutions === 0) return 0;

      const executionsWithErrors = await prisma.cronJobExecution.count({
        where: {
          startedAt: {
            gte: startTime,
            lte: endTime
          },
          errorsCount: {
            gt: 0
          }
        }
      });

      return (executionsWithErrors / totalExecutions) * 100;
    } catch (error) {
      alertLogger.error('Failed to calculate filing processing error rate', { error });
      return 0;
    }
  }

  /**
   * Check if threshold is breached
   */
  private static isThresholdBreached(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.comparison) {
      case 'gt':
        return value > threshold.threshold;
      case 'lt':
        return value < threshold.threshold;
      case 'eq':
        return value === threshold.threshold;
      default:
        return false;
    }
  }

  /**
   * Get unit for metric display
   */
  private static getUnit(metric: string): string {
    if (metric.includes('rate') || metric.includes('percent')) {
      return '%';
    }
    if (metric.includes('time')) {
      return 'ms';
    }
    return '';
  }

  /**
   * Send alert notification
   */
  private static async sendAlert(alert: AlertNotification): Promise<void> {
    try {
      // For now, just log. In production, integrate with:
      // - Email notifications
      // - Slack/Discord webhooks
      // - PagerDuty
      // - Railway notifications
      
      alertLogger.error('PRODUCTION ALERT', {
        id: alert.id,
        metric: alert.metric,
        severity: alert.severity,
        message: alert.message,
        environment: alert.environment,
        timestamp: alert.timestamp.toISOString()
      });

      // TODO: Implement actual notification delivery
      // Example integrations:
      
      // 1. Email notification
      // await this.sendEmailAlert(alert);
      
      // 2. Slack webhook
      // await this.sendSlackAlert(alert);
      
      // 3. Railway webhook
      // await this.sendRailwayAlert(alert);

    } catch (error) {
      alertLogger.error('Failed to send alert notification', { error, alertId: alert.id });
    }
  }

  /**
   * Get recent alerts for dashboard
   */
  static async getRecentAlerts(hours: number = 24): Promise<AlertNotification[]> {
    // This would be stored in database in production
    // For now, return empty array
    return [];
  }

  /**
   * Health check for alerting system
   */
  static async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      // Verify database connectivity
      await prisma.$queryRaw`SELECT 1`;
      
      // Check memory usage
      const memoryUsage = this.getMemoryUsagePercent();
      
      return {
        healthy: memoryUsage < 90,
        details: {
          database: 'connected',
          memoryUsage: `${memoryUsage.toFixed(2)}%`,
          alertThresholds: this.ALERT_THRESHOLDS.length,
          environment: process.env.RAILWAY_ENVIRONMENT || 'local'
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}