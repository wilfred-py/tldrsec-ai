import { getPrismaClient } from '@/lib/prisma';
import { alertService, SystemMetrics } from './alert-service';

/**
 * Monitoring Integration Service
 * Coordinates monitoring data collection, analysis, and alerting
 */

export interface MonitoringData {
  timestamp: Date;
  metrics: SystemMetrics;
  systemHealth: 'healthy' | 'degraded' | 'critical';
  activeAlerts: number;
  trends: {
    latency: 'improving' | 'stable' | 'degrading';
    errors: 'improving' | 'stable' | 'degrading';
    queue: 'improving' | 'stable' | 'degrading';
  };
}

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'degraded' | 'critical';
  responseTime: number;
  details?: Record<string, any>;
  error?: string;
}

class MonitoringIntegration {
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMinutes: number = 5): void {
    if (this.isMonitoring) {
      console.log('Monitoring already running');
      return;
    }

    this.isMonitoring = true;
    console.log(`Starting monitoring with ${intervalMinutes} minute intervals`);

    // Run initial check
    this.runMonitoringCycle();

    // Schedule recurring checks
    this.monitoringInterval = setInterval(() => {
      this.runMonitoringCycle();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Monitoring stopped');
  }

  /**
   * Run a single monitoring cycle
   */
  async runMonitoringCycle(): Promise<MonitoringData> {
    try {
      console.log('Running monitoring cycle...');
      
      // Collect current metrics
      const metrics = await this.collectSystemMetrics();
      
      // Record health snapshot
      await this.recordHealthSnapshot(metrics);
      
      // Check thresholds and create alerts
      await alertService.checkThresholds(metrics);
      
      // Escalate unacknowledged critical alerts
      await alertService.escalateAlerts();
      
      // Calculate trends
      const trends = await this.calculateTrends();
      
      // Get active alerts count
      const activeAlerts = await this.getActiveAlertsCount();
      
      // Determine overall system health
      const systemHealth = this.calculateSystemHealth(metrics, activeAlerts);
      
      const monitoringData: MonitoringData = {
        timestamp: new Date(),
        metrics,
        systemHealth,
        activeAlerts,
        trends
      };

      console.log('Monitoring cycle completed:', {
        systemHealth,
        activeAlerts,
        errorRate: metrics.errorRate,
        queueDepth: metrics.queueDepth
      });

      return monitoringData;

    } catch (error) {
      console.error('Monitoring cycle failed:', error);
      
      // Create alert for monitoring failure
      await alertService.createAlert({
        alertType: 'critical',
        source: 'pipeline',
        message: 'Monitoring system failure',
        errorCode: 'MONITORING_FAILURE',
        stackTrace: error instanceof Error ? error.stack : undefined,
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      });

      throw error;
    }
  }

  /**
   * Perform comprehensive health check of all system components
   */
  async performHealthCheck(): Promise<HealthCheckResult[]> {
    const healthChecks: HealthCheckResult[] = [];
    
    // Database health check
    const dbHealth = await this.checkDatabaseHealth();
    healthChecks.push(dbHealth);
    
    // Email service health check
    const emailHealth = await this.checkEmailServiceHealth();
    healthChecks.push(emailHealth);
    
    // External API health check
    const apiHealth = await this.checkExternalAPIHealth();
    healthChecks.push(apiHealth);
    
    // Queue health check
    const queueHealth = await this.checkQueueHealth();
    healthChecks.push(queueHealth);
    
    return healthChecks;
  }

  /**
   * Get comprehensive monitoring dashboard data
   */
  async getDashboardData(timeRange: '1h' | '6h' | '24h' | '7d' = '24h') {
    const { startTime, endTime } = this.getTimeRange(timeRange);
    
    const [
      currentMetrics,
      historicalData,
      alertStats,
      healthChecks,
      trends
    ] = await Promise.all([
      this.collectSystemMetrics(),
      this.getHistoricalData(startTime, endTime),
      alertService.getAlertStatistics(timeRange === '1h' ? 'hour' : timeRange === '24h' ? 'day' : 'week'),
      this.performHealthCheck(),
      this.calculateTrends()
    ]);

    return {
      current: {
        timestamp: new Date(),
        metrics: currentMetrics,
        systemHealth: this.calculateSystemHealth(currentMetrics, alertStats.critical),
        activeAlerts: alertStats.total - alertStats.resolved
      },
      historical: historicalData,
      alerts: alertStats,
      healthChecks,
      trends,
      timeRange
    };
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get recent summaries for error rate calculation
    const recentSummaries = await getPrismaClient().summary.findMany({
      where: {
        createdAt: { gte: oneHourAgo }
      },
      select: {
        processingError: true,
        processingTimeMs: true,
        processingStatus: true
      }
    });

    const totalSummaries = recentSummaries.length;
    const errorCount = recentSummaries.filter(s => s.processingError).length;
    const errorRate = totalSummaries > 0 ? (errorCount / totalSummaries) * 100 : 0;
    const successRate = 100 - errorRate;

    // Calculate average processing latency
    const validProcessingTimes = recentSummaries
      .filter(s => s.processingTimeMs && s.processingTimeMs > 0)
      .map(s => s.processingTimeMs!);
    
    const avgProcessingLatency = validProcessingTimes.length > 0 
      ? validProcessingTimes.reduce((sum, time) => sum + time, 0) / validProcessingTimes.length
      : 0;

    // Get queue metrics
    const [queueDepth, activeJobs] = await Promise.all([
      getPrismaClient().jobQueue.count({
        where: { status: { in: ['pending', 'running'] } }
      }),
      getPrismaClient().jobQueue.count({
        where: { status: 'running' }
      })
    ]);

    // Get latest system resource usage
    const latestExecution = await getPrismaClient().cronJobExecution.findFirst({
      where: { startedAt: { gte: oneHourAgo } },
      orderBy: { startedAt: 'desc' },
      select: { memoryUsageMb: true }
    });

    return {
      errorRate: Math.round(errorRate * 100) / 100,
      avgProcessingLatency: Math.round(avgProcessingLatency),
      queueDepth,
      memoryUsage: latestExecution?.memoryUsageMb || 0,
      successRate: Math.round(successRate * 100) / 100,
      activeJobs,
      errorCount
    };
  }

  private async recordHealthSnapshot(metrics: SystemMetrics): Promise<void> {
    // Determine pipeline status based on metrics
    let pipelineStatus: string = 'healthy';
    if (metrics.errorRate > 15 || metrics.avgProcessingLatency > 60000 || metrics.queueDepth > 500) {
      pipelineStatus = 'critical';
    } else if (metrics.errorRate > 5 || metrics.avgProcessingLatency > 30000 || metrics.queueDepth > 100) {
      pipelineStatus = 'degraded';
    }

    await getPrismaClient().pipelineHealthHistory.create({
      data: {
        pipelineStatus,
        processingLatency: metrics.avgProcessingLatency,
        successRate: metrics.successRate,
        errorCount: metrics.errorCount,
        activeJobs: metrics.activeJobs,
        queueDepth: metrics.queueDepth,
        memoryUsage: metrics.memoryUsage,
        metadata: {
          collectedAt: new Date().toISOString(),
          monitoringVersion: '1.0'
        }
      }
    });
  }

  private async calculateTrends() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [currentPeriod, previousPeriod] = await Promise.all([
      getPrismaClient().pipelineHealthHistory.findMany({
        where: { timestamp: { gte: oneHourAgo } },
        select: { processingLatency: true, errorCount: true, queueDepth: true }
      }),
      getPrismaClient().pipelineHealthHistory.findMany({
        where: { 
          timestamp: { gte: twoHoursAgo, lt: oneHourAgo } 
        },
        select: { processingLatency: true, errorCount: true, queueDepth: true }
      })
    ]);

    const currentAvg = this.calculateAverages(currentPeriod);
    const previousAvg = this.calculateAverages(previousPeriod);

    return {
      latency: this.getTrend(currentAvg.latency, previousAvg.latency, false),
      errors: this.getTrend(currentAvg.errors, previousAvg.errors, false),
      queue: this.getTrend(currentAvg.queue, previousAvg.queue, false)
    };
  }

  private calculateAverages(data: Array<{ processingLatency: number; errorCount: number; queueDepth: number }>) {
    if (data.length === 0) return { latency: 0, errors: 0, queue: 0 };
    
    return {
      latency: data.reduce((sum, d) => sum + d.processingLatency, 0) / data.length,
      errors: data.reduce((sum, d) => sum + d.errorCount, 0) / data.length,
      queue: data.reduce((sum, d) => sum + d.queueDepth, 0) / data.length
    };
  }

  private getTrend(current: number, previous: number, higherIsBetter: boolean = true): 'improving' | 'stable' | 'degrading' {
    const threshold = 0.05; // 5% change threshold
    const change = previous > 0 ? (current - previous) / previous : 0;
    
    if (Math.abs(change) < threshold) return 'stable';
    
    const isImproving = higherIsBetter ? change > 0 : change < 0;
    return isImproving ? 'improving' : 'degrading';
  }

  private async getActiveAlertsCount(): Promise<number> {
    return await getPrismaClient().errorAlert.count({
      where: { resolved: false }
    });
  }

  private calculateSystemHealth(metrics: SystemMetrics, activeAlerts: number): 'healthy' | 'degraded' | 'critical' {
    // Critical conditions
    if (
      metrics.errorRate > 15 ||
      metrics.avgProcessingLatency > 60000 ||
      metrics.queueDepth > 500 ||
      activeAlerts > 5
    ) {
      return 'critical';
    }

    // Degraded conditions
    if (
      metrics.errorRate > 5 ||
      metrics.avgProcessingLatency > 30000 ||
      metrics.queueDepth > 100 ||
      activeAlerts > 2
    ) {
      return 'degraded';
    }

    return 'healthy';
  }

  private async checkDatabaseHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      await getPrismaClient().$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;
      
      return {
        component: 'database',
        status: responseTime < 1000 ? 'healthy' : responseTime < 3000 ? 'degraded' : 'critical',
        responseTime,
        details: { connectionPool: 'active' }
      };
    } catch (error) {
      return {
        component: 'database',
        status: 'critical',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Database connection failed'
      };
    }
  }

  private async checkEmailServiceHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // This would ping the email service health endpoint
      // For now, we'll just check if the service is configured
      const isConfigured = !!process.env.RESEND_API_KEY;
      const responseTime = Date.now() - startTime;
      
      return {
        component: 'email_service',
        status: isConfigured ? 'healthy' : 'critical',
        responseTime,
        details: { configured: isConfigured }
      };
    } catch (error) {
      return {
        component: 'email_service',
        status: 'critical',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Email service check failed'
      };
    }
  }

  private async checkExternalAPIHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // This would check Claude API or SEC API availability
      // For now, we'll check if keys are configured
      const claudeConfigured = !!process.env.ANTHROPIC_API_KEY;
      const responseTime = Date.now() - startTime;
      
      return {
        component: 'external_apis',
        status: claudeConfigured ? 'healthy' : 'critical',
        responseTime,
        details: { claude_api: claudeConfigured }
      };
    } catch (error) {
      return {
        component: 'external_apis',
        status: 'critical',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'External API check failed'
      };
    }
  }

  private async checkQueueHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const [totalJobs, stuckJobs] = await Promise.all([
        getPrismaClient().jobQueue.count(),
        getPrismaClient().jobQueue.count({
          where: {
            status: 'running',
            startedAt: {
              lt: new Date(Date.now() - 2 * 60 * 60 * 1000) // Jobs running for more than 2 hours
            }
          }
        })
      ]);

      const responseTime = Date.now() - startTime;
      const queueHealth = stuckJobs === 0 ? 'healthy' : stuckJobs < 5 ? 'degraded' : 'critical';
      
      return {
        component: 'job_queue',
        status: queueHealth,
        responseTime,
        details: { totalJobs, stuckJobs }
      };
    } catch (error) {
      return {
        component: 'job_queue',
        status: 'critical',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Queue health check failed'
      };
    }
  }

  private async getHistoricalData(startTime: Date, endTime: Date) {
    return await getPrismaClient().pipelineHealthHistory.findMany({
      where: {
        timestamp: { gte: startTime, lte: endTime }
      },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        pipelineStatus: true,
        processingLatency: true,
        successRate: true,
        errorCount: true,
        queueDepth: true,
        memoryUsage: true
      }
    });
  }

  private getTimeRange(timeRange: string) {
    const now = new Date();
    let startTime: Date;

    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { startTime, endTime: now };
  }
}

// Export singleton instance
export const monitoringIntegration = new MonitoringIntegration();