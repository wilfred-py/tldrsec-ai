/**
 * Dashboard Metrics Exporter
 * 
 * Provides a unified interface for exporting all monitoring metrics in a format
 * suitable for dashboard consumption. Aggregates data from all monitoring systems
 * including pipeline health, error detection, and individual component monitors.
 */

import { logger } from '../logging';
import { monitoring } from './index';
import { pipelineHealthMonitoring, getDashboardMetrics } from './pipeline-health-monitoring-system';
import { pipelineErrorDetector, generatePipelineHealthReport } from './pipeline-error-detector';
import { userProcessingMonitor } from './user-processing-monitor';
import { monitoredSecClient } from './sec-api-monitor';

const dashboardLogger = logger.child('dashboard-metrics-exporter');

// Dashboard-specific interfaces
export interface DashboardOverview {
  timestamp: Date;
  overallHealth: {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    lastUpdated: Date;
  };
  systemMetrics: {
    uptime: number;
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    activeConnections: number;
    processingLoad: number;
  };
  recentActivity: {
    usersProcessed: number;
    filingsProcessed: number;
    emailsSent: number;
    apiCallsMade: number;
    errors: number;
  };
  alerts: {
    critical: number;
    warnings: number;
    recent: Array<{
      id: string;
      severity: 'critical' | 'warning';
      message: string;
      timestamp: Date;
      component: string;
    }>;
  };
}

export interface ComponentMetrics {
  pipelineHealth: {
    lockTimeouts: {
      rate: number;
      trend: 'improving' | 'degrading' | 'stable';
      threshold: { warn: number; critical: number };
    };
    parameterValidation: {
      rate: number;
      trend: 'improving' | 'degrading' | 'stable';
      threshold: { warn: number; critical: number };
    };
    secApiFailures: {
      rate: number;
      trend: 'improving' | 'degrading' | 'stable';
      threshold: { warn: number; critical: number };
    };
    userProcessingSuccess: {
      rate: number;
      trend: 'improving' | 'degrading' | 'stable';
      threshold: { warn: number; critical: number };
    };
  };
  performance: {
    averageResponseTime: number;
    p95ResponseTime: number;
    throughput: number;
    errorRate: number;
    trend: 'improving' | 'degrading' | 'stable';
  };
  costs: {
    totalSpent: number;
    budgetUtilization: number;
    averageCostPerFiling: number;
    trend: 'optimizing' | 'increasing' | 'stable';
  };
  security: {
    failedAuthAttempts: number;
    injectionAttempts: number;
    suspiciousActivity: number;
    lastSecurityEvent: Date | null;
  };
}

export interface TrendData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
    unit?: string;
  }>;
}

export interface DashboardMetricsExport {
  overview: DashboardOverview;
  components: ComponentMetrics;
  trends: {
    last24Hours: Record<string, TrendData>;
    last7Days: Record<string, TrendData>;
    last30Days: Record<string, TrendData>;
  };
  realTimeMetrics: {
    timestamp: Date;
    lockOperations: number;
    parameterValidations: number;
    secApiCalls: number;
    userProcessingOperations: number;
    activeAlerts: number;
    systemLoad: number;
  };
  alertHistory: Array<{
    id: string;
    timestamp: Date;
    severity: 'critical' | 'warning' | 'info';
    component: string;
    message: string;
    resolved: boolean;
    resolvedAt?: Date;
  }>;
  healthScore: {
    overall: number;
    breakdown: {
      performance: number;
      reliability: number;
      security: number;
      costs: number;
    };
    lastCalculated: Date;
  };
}

/**
 * Dashboard Metrics Exporter Class
 * 
 * Aggregates metrics from all monitoring systems and provides dashboard-ready data
 */
export class DashboardMetricsExporter {
  private static instance: DashboardMetricsExporter;
  private lastExport: Date = new Date();
  private cachedMetrics: DashboardMetricsExport | null = null;
  private cacheValidityMs = 30000; // 30 seconds cache

  private constructor() {}

  public static getInstance(): DashboardMetricsExporter {
    if (!DashboardMetricsExporter.instance) {
      DashboardMetricsExporter.instance = new DashboardMetricsExporter();
    }
    return DashboardMetricsExporter.instance;
  }

  /**
   * Export comprehensive dashboard metrics
   */
  async exportDashboardMetrics(): Promise<DashboardMetricsExport> {
    try {
      // Return cached metrics if still valid
      if (this.cachedMetrics && 
          (Date.now() - this.lastExport.getTime()) < this.cacheValidityMs) {
        dashboardLogger.debug('Returning cached dashboard metrics');
        return this.cachedMetrics;
      }

      dashboardLogger.info('Generating fresh dashboard metrics export');

      // Collect metrics from all monitoring systems
      const [
        pipelineHealth,
        pipelineErrorReport,
        userProcessingMetrics,
        secApiMetrics,
        systemHealth
      ] = await Promise.all([
        this.getPipelineHealthMetrics(),
        this.getPipelineErrorMetrics(),
        this.getUserProcessingMetrics(),
        this.getSecApiMetrics(),
        this.getSystemHealthMetrics()
      ]);

      // Generate comprehensive metrics export
      const metricsExport: DashboardMetricsExport = {
        overview: this.generateOverview(
          pipelineHealth,
          pipelineErrorReport,
          userProcessingMetrics,
          systemHealth
        ),
        components: this.generateComponentMetrics(
          pipelineHealth,
          pipelineErrorReport,
          userProcessingMetrics,
          secApiMetrics
        ),
        trends: this.generateTrendData(pipelineHealth),
        realTimeMetrics: this.generateRealTimeMetrics(pipelineHealth),
        alertHistory: this.generateAlertHistory(pipelineErrorReport),
        healthScore: this.calculateHealthScore(
          pipelineErrorReport,
          userProcessingMetrics,
          secApiMetrics
        )
      };

      // Cache the result
      this.cachedMetrics = metricsExport;
      this.lastExport = new Date();

      dashboardLogger.info('Dashboard metrics export completed', {
        overallHealth: metricsExport.overview.overallHealth.status,
        healthScore: metricsExport.healthScore.overall,
        activeAlerts: metricsExport.realTimeMetrics.activeAlerts,
        cacheExpiry: new Date(Date.now() + this.cacheValidityMs)
      });

      return metricsExport;

    } catch (error) {
      dashboardLogger.error('Failed to export dashboard metrics', error);
      
      // Return fallback metrics
      return this.generateFallbackMetrics();
    }
  }

  /**
   * Export metrics for specific dashboard widget
   */
  async exportWidgetMetrics(
    widgetType: 'overview' | 'pipeline-health' | 'performance' | 'alerts' | 'trends'
  ): Promise<any> {
    try {
      const fullMetrics = await this.exportDashboardMetrics();

      switch (widgetType) {
        case 'overview':
          return fullMetrics.overview;
        case 'pipeline-health':
          return fullMetrics.components.pipelineHealth;
        case 'performance':
          return fullMetrics.components.performance;
        case 'alerts':
          return {
            alerts: fullMetrics.overview.alerts,
            history: fullMetrics.alertHistory.slice(0, 10) // Last 10 alerts
          };
        case 'trends':
          return fullMetrics.trends;
        default:
          throw new Error(`Unknown widget type: ${widgetType}`);
      }

    } catch (error) {
      dashboardLogger.error(`Failed to export metrics for widget: ${widgetType}`, error);
      throw error;
    }
  }

  /**
   * Get real-time metrics for live dashboard updates
   */
  async getRealTimeMetrics(): Promise<DashboardMetricsExport['realTimeMetrics']> {
    try {
      const pipelineHealth = await this.getPipelineHealthMetrics();
      return this.generateRealTimeMetrics(pipelineHealth);

    } catch (error) {
      dashboardLogger.error('Failed to get real-time metrics', error);
      return {
        timestamp: new Date(),
        lockOperations: 0,
        parameterValidations: 0,
        secApiCalls: 0,
        userProcessingOperations: 0,
        activeAlerts: 0,
        systemLoad: 0
      };
    }
  }

  /**
   * Clear cached metrics (force refresh)
   */
  clearCache(): void {
    this.cachedMetrics = null;
    this.lastExport = new Date(0);
    dashboardLogger.info('Dashboard metrics cache cleared');
  }

  // Private helper methods

  private async getPipelineHealthMetrics() {
    try {
      return await getDashboardMetrics();
    } catch (error) {
      dashboardLogger.warn('Failed to get pipeline health metrics', error);
      return null;
    }
  }

  private async getPipelineErrorMetrics() {
    try {
      return await generatePipelineHealthReport();
    } catch (error) {
      dashboardLogger.warn('Failed to get pipeline error metrics', error);
      return null;
    }
  }

  private getUserProcessingMetrics() {
    try {
      return userProcessingMonitor.getCurrentMetrics();
    } catch (error) {
      dashboardLogger.warn('Failed to get user processing metrics', error);
      return null;
    }
  }

  private getSecApiMetrics() {
    try {
      return monitoredSecClient.getMetrics();
    } catch (error) {
      dashboardLogger.warn('Failed to get SEC API metrics', error);
      return null;
    }
  }

  private async getSystemHealthMetrics() {
    try {
      return await monitoring.checkHealth();
    } catch (error) {
      dashboardLogger.warn('Failed to get system health metrics', error);
      return null;
    }
  }

  private generateOverview(
    pipelineHealth: any,
    pipelineErrorReport: any,
    userProcessingMetrics: any,
    systemHealth: any
  ): DashboardOverview {
    const now = new Date();
    
    // Determine overall health status
    const healthSources = [
      pipelineHealth?.currentHealth?.overall,
      userProcessingMetrics ? 'healthy' : 'degraded',
      systemHealth?.status
    ].filter(Boolean);

    const overallStatus = healthSources.includes('critical') ? 'critical' :
                         healthSources.includes('warning') || healthSources.includes('degraded') ? 'warning' : 'healthy';

    return {
      timestamp: now,
      overallHealth: {
        status: overallStatus,
        score: pipelineHealth?.currentHealth?.score || 85,
        lastUpdated: pipelineHealth?.currentHealth?.lastUpdated || now
      },
      systemMetrics: {
        uptime: systemHealth?.uptime || 0,
        memoryUsage: {
          used: systemHealth?.components?.memory?.details?.usedMemoryMB || 0,
          total: systemHealth?.components?.memory?.details?.totalMemoryMB || 0,
          percentage: systemHealth?.components?.memory?.details?.memoryUsagePercent || 0
        },
        activeConnections: 0, // Would come from connection pool monitoring
        processingLoad: this.calculateProcessingLoad(userProcessingMetrics)
      },
      recentActivity: {
        usersProcessed: userProcessingMetrics?.totalUsers || 0,
        filingsProcessed: userProcessingMetrics?.totalFilingsProcessed || 0,
        emailsSent: 0, // Would come from email monitoring
        apiCallsMade: pipelineHealth?.realTimeMetrics?.secApiCalls?.total || 0,
        errors: pipelineErrorReport?.activeAlerts?.length || 0
      },
      alerts: {
        critical: pipelineErrorReport?.activeAlerts?.filter((a: any) => a.severity === 'critical').length || 0,
        warnings: pipelineErrorReport?.activeAlerts?.filter((a: any) => a.severity === 'high' || a.severity === 'medium').length || 0,
        recent: this.formatRecentAlerts(pipelineErrorReport?.activeAlerts || [])
      }
    };
  }

  private generateComponentMetrics(
    pipelineHealth: any,
    pipelineErrorReport: any,
    userProcessingMetrics: any,
    secApiMetrics: any
  ): ComponentMetrics {
    return {
      pipelineHealth: {
        lockTimeouts: {
          rate: pipelineHealth?.realTimeMetrics?.lockTimeouts?.timeoutRate || 0,
          trend: 'stable',
          threshold: { warn: 5, critical: 15 }
        },
        parameterValidation: {
          rate: pipelineHealth?.realTimeMetrics?.parameterValidation?.mismatchRate || 0,
          trend: 'stable',
          threshold: { warn: 1, critical: 5 }
        },
        secApiFailures: {
          rate: pipelineHealth?.realTimeMetrics?.secApiCalls?.failureRate || 0,
          trend: 'stable',
          threshold: { warn: 10, critical: 25 }
        },
        userProcessingSuccess: {
          rate: pipelineHealth?.realTimeMetrics?.userProcessing?.successRate || 0,
          trend: 'stable',
          threshold: { warn: 90, critical: 75 }
        }
      },
      performance: {
        averageResponseTime: pipelineErrorReport?.metrics?.performance?.avgResponseTime || 0,
        p95ResponseTime: pipelineErrorReport?.metrics?.performance?.p95ResponseTime || 0,
        throughput: pipelineErrorReport?.metrics?.performance?.throughput || 0,
        errorRate: pipelineErrorReport?.metrics?.performance?.errorRate || 0,
        trend: pipelineErrorReport?.trends?.performance || 'stable'
      },
      costs: {
        totalSpent: pipelineErrorReport?.metrics?.cost?.totalSpent || 0,
        budgetUtilization: pipelineErrorReport?.metrics?.cost?.budgetUtilization || 0,
        averageCostPerFiling: pipelineErrorReport?.metrics?.cost?.avgCostPerFiling || 0,
        trend: pipelineErrorReport?.trends?.cost || 'stable'
      },
      security: {
        failedAuthAttempts: pipelineErrorReport?.metrics?.security?.failedAuthAttempts || 0,
        injectionAttempts: pipelineErrorReport?.metrics?.security?.injectionAttempts || 0,
        suspiciousActivity: pipelineErrorReport?.metrics?.security?.unauthorizedAccess || 0,
        lastSecurityEvent: null // Would come from security logs
      }
    };
  }

  private generateTrendData(pipelineHealth: any): DashboardMetricsExport['trends'] {
    return {
      last24Hours: this.generateTimeSeriesData(pipelineHealth?.trends?.last24Hours || [], '24h'),
      last7Days: this.generateTimeSeriesData(pipelineHealth?.trends?.last7Days || [], '7d'),
      last30Days: this.generateTimeSeriesData(pipelineHealth?.trends?.last30Days || [], '30d')
    };
  }

  private generateTimeSeriesData(data: any[], period: string): Record<string, TrendData> {
    const labels = this.generateTimeLabels(period);
    
    return {
      'lock-timeouts': {
        labels,
        datasets: [{
          label: 'Lock Timeout Rate',
          data: this.extractMetricData(data, 'lockTimeouts', 'timeoutRate'),
          color: '#ef4444',
          unit: '%'
        }]
      },
      'parameter-validation': {
        labels,
        datasets: [{
          label: 'Parameter Mismatch Rate',
          data: this.extractMetricData(data, 'parameterValidation', 'mismatchRate'),
          color: '#f59e0b',
          unit: '%'
        }]
      },
      'sec-api': {
        labels,
        datasets: [{
          label: 'SEC API Failure Rate',
          data: this.extractMetricData(data, 'secApiCalls', 'failureRate'),
          color: '#10b981',
          unit: '%'
        }]
      },
      'user-processing': {
        labels,
        datasets: [{
          label: 'User Processing Success Rate',
          data: this.extractMetricData(data, 'userProcessing', 'successRate'),
          color: '#3b82f6',
          unit: '%'
        }]
      }
    };
  }

  private generateRealTimeMetrics(pipelineHealth: any): DashboardMetricsExport['realTimeMetrics'] {
    return {
      timestamp: new Date(),
      lockOperations: pipelineHealth?.realTimeMetrics?.lockTimeouts?.total || 0,
      parameterValidations: pipelineHealth?.realTimeMetrics?.parameterValidation?.total || 0,
      secApiCalls: pipelineHealth?.realTimeMetrics?.secApiCalls?.total || 0,
      userProcessingOperations: pipelineHealth?.realTimeMetrics?.userProcessing?.total || 0,
      activeAlerts: pipelineHealth?.recentAlerts?.length || 0,
      systemLoad: pipelineHealth?.systemPerformance?.memoryUsageMB || 0
    };
  }

  private generateAlertHistory(pipelineErrorReport: any): DashboardMetricsExport['alertHistory'] {
    if (!pipelineErrorReport?.activeAlerts) return [];

    return pipelineErrorReport.activeAlerts.map((alert: any) => ({
      id: alert.id,
      timestamp: new Date(alert.timestamp),
      severity: this.mapSeverity(alert.severity),
      component: alert.type,
      message: alert.description,
      resolved: false
    }));
  }

  private calculateHealthScore(
    pipelineErrorReport: any,
    userProcessingMetrics: any,
    secApiMetrics: any
  ): DashboardMetricsExport['healthScore'] {
    const performance = Math.max(0, 100 - (pipelineErrorReport?.metrics?.performance?.errorRate || 0) * 10);
    const reliability = Math.max(0, 100 - (pipelineErrorReport?.activeAlerts?.length || 0) * 5);
    const security = Math.max(0, 100 - (pipelineErrorReport?.metrics?.security?.injectionAttempts || 0) * 20);
    const costs = Math.max(0, 100 - Math.max(0, (pipelineErrorReport?.metrics?.cost?.budgetUtilization || 0) - 70));
    
    const overall = Math.round((performance + reliability + security + costs) / 4);

    return {
      overall,
      breakdown: {
        performance: Math.round(performance),
        reliability: Math.round(reliability),
        security: Math.round(security),
        costs: Math.round(costs)
      },
      lastCalculated: new Date()
    };
  }

  private generateFallbackMetrics(): DashboardMetricsExport {
    const now = new Date();
    
    return {
      overview: {
        timestamp: now,
        overallHealth: {
          status: 'warning',
          score: 50,
          lastUpdated: now
        },
        systemMetrics: {
          uptime: 0,
          memoryUsage: { used: 0, total: 0, percentage: 0 },
          activeConnections: 0,
          processingLoad: 0
        },
        recentActivity: {
          usersProcessed: 0,
          filingsProcessed: 0,
          emailsSent: 0,
          apiCallsMade: 0,
          errors: 0
        },
        alerts: {
          critical: 1,
          warnings: 0,
          recent: [{
            id: 'fallback-alert',
            severity: 'critical',
            message: 'Monitoring system unavailable',
            timestamp: now,
            component: 'monitoring'
          }]
        }
      },
      components: {
        pipelineHealth: {
          lockTimeouts: { rate: 0, trend: 'stable', threshold: { warn: 5, critical: 15 } },
          parameterValidation: { rate: 0, trend: 'stable', threshold: { warn: 1, critical: 5 } },
          secApiFailures: { rate: 0, trend: 'stable', threshold: { warn: 10, critical: 25 } },
          userProcessingSuccess: { rate: 0, trend: 'stable', threshold: { warn: 90, critical: 75 } }
        },
        performance: {
          averageResponseTime: 0,
          p95ResponseTime: 0,
          throughput: 0,
          errorRate: 0,
          trend: 'stable'
        },
        costs: {
          totalSpent: 0,
          budgetUtilization: 0,
          averageCostPerFiling: 0,
          trend: 'stable'
        },
        security: {
          failedAuthAttempts: 0,
          injectionAttempts: 0,
          suspiciousActivity: 0,
          lastSecurityEvent: null
        }
      },
      trends: {
        last24Hours: {},
        last7Days: {},
        last30Days: {}
      },
      realTimeMetrics: {
        timestamp: now,
        lockOperations: 0,
        parameterValidations: 0,
        secApiCalls: 0,
        userProcessingOperations: 0,
        activeAlerts: 1,
        systemLoad: 0
      },
      alertHistory: [],
      healthScore: {
        overall: 50,
        breakdown: {
          performance: 50,
          reliability: 50,
          security: 50,
          costs: 50
        },
        lastCalculated: now
      }
    };
  }

  // Utility methods

  private calculateProcessingLoad(userProcessingMetrics: any): number {
    if (!userProcessingMetrics) return 0;
    const { successfulUsers, failedUsers } = userProcessingMetrics;
    const total = successfulUsers + failedUsers;
    return total > 0 ? Math.min(100, (total / 100) * 100) : 0; // Scale to 0-100
  }

  private formatRecentAlerts(alerts: any[]): DashboardOverview['alerts']['recent'] {
    return alerts.slice(0, 5).map(alert => ({
      id: alert.id,
      severity: this.mapSeverity(alert.severity),
      message: alert.description || alert.message,
      timestamp: new Date(alert.timestamp),
      component: alert.type
    }));
  }

  private mapSeverity(severity: string): 'critical' | 'warning' {
    return severity === 'critical' ? 'critical' : 'warning';
  }

  private generateTimeLabels(period: string): string[] {
    const now = new Date();
    const labels: string[] = [];
    
    if (period === '24h') {
      for (let i = 23; i >= 0; i--) {
        const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
        labels.push(hour.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } else if (period === '7d') {
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        labels.push(day.toLocaleDateString([], { weekday: 'short' }));
      }
    } else if (period === '30d') {
      for (let i = 29; i >= 0; i--) {
        const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        labels.push(day.toLocaleDateString([], { month: 'short', day: 'numeric' }));
      }
    }
    
    return labels;
  }

  private extractMetricData(data: any[], category: string, metric: string): number[] {
    return data.map(item => {
      return item?.metrics?.[category]?.[metric] || 0;
    });
  }
}

// Export singleton instance
export const dashboardMetricsExporter = DashboardMetricsExporter.getInstance();

// Export convenience functions
export async function exportDashboardMetrics(): Promise<DashboardMetricsExport> {
  return dashboardMetricsExporter.exportDashboardMetrics();
}

export async function exportWidgetMetrics(widgetType: string): Promise<any> {
  return dashboardMetricsExporter.exportWidgetMetrics(widgetType as any);
}

export async function getRealTimeMetrics(): Promise<DashboardMetricsExport['realTimeMetrics']> {
  return dashboardMetricsExporter.getRealTimeMetrics();
}

export function clearDashboardCache(): void {
  dashboardMetricsExporter.clearCache();
}

export default dashboardMetricsExporter;