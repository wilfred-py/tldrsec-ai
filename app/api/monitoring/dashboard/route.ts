/**
 * Production Monitoring Dashboard API
 * 
 * Provides real-time monitoring data for system health, performance metrics,
 * alerts, and operational insights.
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitoring } from '@/lib/monitoring';
import { infrastructureMonitor } from '@/lib/infrastructure/monitoring';
import { databaseMonitor } from '@/lib/monitoring/database-monitor';
import { memoryManager } from '@/lib/monitoring/memory-manager';
import { alertService } from '@/lib/monitoring/alert-service';
import { configValidator } from '@/lib/monitoring/config-validation';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logging';
import * as os from 'os';
import * as fs from 'fs/promises';

interface DashboardMetrics {
  timestamp: Date;
  system: {
    health: 'healthy' | 'warning' | 'critical';
    uptime: number;
    version: string;
  };
  performance: {
    cpu: number;
    memory: number;
    diskIO: number;
    networkIO: number;
  };
  database: {
    connectionUsage: number;
    queryPerformance: number;
    health: string;
    slowQueries: number;
  };
  pipeline: {
    activeJobs: number;
    queueDepth: number;
    successRate: number;
    errorRate: number;
    avgProcessingTime: number;
  };
  alerts: {
    total: number;
    critical: number;
    warning: number;
    resolved: number;
    resolutionRate: number;
  };
  infrastructure: {
    circuitBreakerState: string;
    memoryHealth: string;
    connectionPoolHealth: string;
  };
}

interface TimeSeriesData {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  errorRate: number;
  responseTime: number;
  activeConnections: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '1h';
    const metrics = searchParams.get('metrics')?.split(',') || ['all'];
    
    logger.info('Monitoring dashboard request', { timeRange, metrics });
    
    // Get current system health
    const systemHealth = await monitoring.checkHealth();
    const _infrastructureHealth = infrastructureMonitor.getHealthSummary();
    const databaseMetrics = databaseMonitor.getCurrentMetrics();
    const memoryHealth = memoryManager.getHealthStatus();
    const alertStats = await alertService.getAlertStatistics(timeRange as '1h' | '6h' | '24h' | '7d' | '30d');
    
    // Get performance metrics
    const performanceMetrics = await getPerformanceMetrics();
    const pipelineMetrics = await getPipelineMetrics();
    
    // Build dashboard response
    const dashboardData: DashboardMetrics = {
      timestamp: new Date(),
      system: {
        health: systemHealth.status as 'healthy' | 'warning' | 'critical',
        uptime: systemHealth.uptime,
        version: systemHealth.version
      },
      performance: performanceMetrics,
      database: {
        connectionUsage: databaseMetrics?.connectionPool.usage || 0,
        queryPerformance: databaseMetrics?.queryPerformance.avgQueryTime || 0,
        health: databaseMetrics?.health.status || 'unknown',
        slowQueries: databaseMetrics?.queryPerformance.slowQueries || 0
      },
      pipeline: pipelineMetrics,
      alerts: alertStats,
      infrastructure: {
        circuitBreakerState: memoryManager.isCircuitBreakerOpen() ? 'OPEN' : 'CLOSED',
        memoryHealth: memoryHealth.status,
        connectionPoolHealth: databaseMonitor.getConnectionPoolHealth().status
      }
    };
    
    // Get time series data if requested
    let timeSeriesData: TimeSeriesData[] = [];
    if (metrics.includes('timeseries') || metrics.includes('all')) {
      timeSeriesData = await getTimeSeriesData(timeRange);
    }
    
    // Get detailed component status
    let componentDetails = {};
    if (metrics.includes('components') || metrics.includes('all')) {
      componentDetails = await getComponentDetails();
    }
    
    // Get configuration status
    let configStatus = {};
    if (metrics.includes('config') || metrics.includes('all')) {
      configStatus = configValidator.validateRuntimeConfig();
    }
    
    return NextResponse.json({
      success: true,
      data: {
        dashboard: dashboardData,
        timeSeries: timeSeriesData,
        components: componentDetails,
        configuration: configStatus,
        recommendations: generateRecommendations(dashboardData)
      }
    });
    
  } catch (error) {
    logger.error('Monitoring dashboard error', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch monitoring data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, parameters } = body;
    
    logger.info('Monitoring dashboard action', { action, parameters });
    
    switch (action) {
      case 'acknowledge_alert':
        if (parameters.alertId && parameters.acknowledgedBy) {
          await alertService.acknowledgeAlert(parameters.alertId, parameters.acknowledgedBy);
          return NextResponse.json({ success: true, message: 'Alert acknowledged' });
        }
        break;
        
      case 'resolve_alert':
        if (parameters.alertId) {
          await alertService.resolveAlert(parameters.alertId, parameters.resolvedBy);
          return NextResponse.json({ success: true, message: 'Alert resolved' });
        }
        break;
        
      case 'mute_notifications':
        if (parameters.durationMinutes) {
          await alertService.muteNotifications(parameters.durationMinutes);
          return NextResponse.json({ success: true, message: 'Notifications muted' });
        }
        break;
        
      case 'unmute_notifications':
        await alertService.unmuteNotifications();
        return NextResponse.json({ success: true, message: 'Notifications unmuted' });
        break;
        
      case 'force_cleanup':
        const freedBytes = await memoryManager.forceCleanup();
        return NextResponse.json({ 
          success: true, 
          message: 'Cleanup completed',
          freedMB: Math.round(freedBytes / 1024 / 1024)
        });
        
      case 'trigger_health_check':
        const health = await monitoring.checkHealth();
        return NextResponse.json({ success: true, data: health });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid parameters'
    }, { status: 400 });
    
  } catch (error) {
    logger.error('Monitoring dashboard action error', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Action failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function getPerformanceMetrics() {
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  
  // Get real system metrics
  let cpuUsage = 0;
  try {
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    cpuUsage = Math.min(100, (loadAvg[0] / cpuCount) * 100);
  } catch (error) {
    logger.warn('Failed to get CPU usage', { error });
  }
  
  let diskIO = 0;
  try {
    const startTime = process.hrtime.bigint();
    await fs.access('/tmp');
    const endTime = process.hrtime.bigint();
    const accessTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    diskIO = Math.min(100, Math.max(0, (accessTime - 1) * 20));
  } catch {
    diskIO = 25; // Default moderate I/O
  }
  
  let networkIO = 0;
  try {
    const networkInterfaces = os.networkInterfaces();
    const activeInterfaces = Object.values(networkInterfaces)
      .flat()
      .filter((iface): iface is os.NetworkInterfaceInfo => iface && !iface.internal && iface.family === 'IPv4');
    networkIO = Math.min(100, activeInterfaces.length * 15);
  } catch {
    networkIO = 10; // Default low network usage
  }
  
  return {
    cpu: Math.round(cpuUsage),
    memory: Math.round((memoryUsage.heapUsed / totalMemory) * 100),
    diskIO: Math.round(diskIO),
    networkIO: Math.round(networkIO)
  };
}

async function getPipelineMetrics() {
  try {
    // Get recent job statistics
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const [activeJobs, completedJobs, failedJobs] = await Promise.all([
      prisma.jobQueue.count({
        where: { status: 'running' }
      }),
      prisma.jobQueue.count({
        where: { 
          status: 'completed',
          completedAt: { gte: hourAgo }
        }
      }),
      prisma.jobQueue.count({
        where: { 
          status: 'failed',
          failedAt: { gte: hourAgo }
        }
      })
    ]);
    
    const queueDepth = await prisma.jobQueue.count({
      where: { status: 'pending' }
    });
    
    const totalJobs = completedJobs + failedJobs;
    const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 100;
    const errorRate = totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0;
    
    // Get average processing time
    const avgProcessingResult = await prisma.jobQueue.aggregate({
      where: {
        status: 'completed',
        completedAt: { gte: hourAgo },
        executionTime: { not: null }
      },
      _avg: {
        executionTime: true
      }
    });
    
    return {
      activeJobs,
      queueDepth,
      successRate: Math.round(successRate),
      errorRate: Math.round(errorRate),
      avgProcessingTime: Math.round(avgProcessingResult._avg.executionTime || 0)
    };
    
  } catch (error) {
    logger.error('Failed to get pipeline metrics', { error });
    return {
      activeJobs: 0,
      queueDepth: 0,
      successRate: 0,
      errorRate: 0,
      avgProcessingTime: 0
    };
  }
}

async function getTimeSeriesData(timeRange: string): Promise<TimeSeriesData[]> {
  try {
    let hoursBack = 1;
    switch (timeRange) {
      case '30m': hoursBack = 0.5; break;
      case '1h': hoursBack = 1; break;
      case '6h': hoursBack = 6; break;
      case '24h': hoursBack = 24; break;
      case '7d': hoursBack = 168; break;
      default: hoursBack = 1;
    }
    
    const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    // Get pipeline health history
    const healthHistory = await prisma.pipelineHealthHistory.findMany({
      where: {
        timestamp: { gte: startTime }
      },
      orderBy: { timestamp: 'asc' },
      take: 100 // Limit to prevent overwhelming the client
    });
    
    // Get cron job performance data
    const performanceData = await prisma.cronJobPerformance.findMany({
      where: {
        timestamp: { gte: startTime }
      },
      orderBy: { timestamp: 'asc' },
      take: 100
    });
    
    // Combine and format data
    const timeSeriesMap = new Map<string, TimeSeriesData>();
    
    // Add health history data
    healthHistory.forEach(record => {
      const key = record.timestamp.toISOString();
      timeSeriesMap.set(key, {
        timestamp: record.timestamp,
        cpuUsage: record.cpuUsage || 0,
        memoryUsage: record.memoryUsage,
        errorRate: (1 - record.successRate / 100) * 100,
        responseTime: record.processingLatency,
        activeConnections: record.activeJobs
      });
    });
    
    // Add performance data
    performanceData.forEach(record => {
      const key = record.timestamp.toISOString();
      const existing = timeSeriesMap.get(key);
      if (existing) {
        existing.cpuUsage = record.cpuUsagePercent || existing.cpuUsage;
        existing.memoryUsage = record.memoryUsageMb;
        existing.activeConnections = record.activeConnections || existing.activeConnections;
      } else {
        timeSeriesMap.set(key, {
          timestamp: record.timestamp,
          cpuUsage: record.cpuUsagePercent || 0,
          memoryUsage: record.memoryUsageMb,
          errorRate: 0,
          responseTime: record.operationDurationMs || 0,
          activeConnections: record.activeConnections || 0
        });
      }
    });
    
    return Array.from(timeSeriesMap.values()).sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
  } catch (error) {
    logger.error('Failed to get time series data', { error });
    return [];
  }
}

async function getComponentDetails() {
  try {
    const systemHealth = await monitoring.checkHealth();
    const dbHealth = databaseMonitor.getConnectionPoolHealth();
    const memoryHealth = memoryManager.getHealthStatus();
    const configStatus = configValidator.validateRuntimeConfig();
    
    return {
      database: {
        status: systemHealth.components.database?.status || 'unknown',
        connectionPool: dbHealth,
        slowQueries: databaseMonitor.getQueryStats(60)
      },
      memory: {
        status: memoryHealth.status,
        currentUsage: memoryHealth.currentUsage,
        trend: memoryHealth.trend,
        recommendations: memoryHealth.recommendations
      },
      configuration: {
        isValid: configStatus.isValid,
        errors: configStatus.errors,
        warnings: configStatus.warnings
      },
      monitoring: {
        uptime: systemHealth.uptime,
        metricsCollected: monitoring.getAllMetrics().length,
        alertsActive: await alertService.getAlertStatistics('hour')
      }
    };
    
  } catch (error) {
    logger.error('Failed to get component details', { error });
    return {};
  }
}

function generateRecommendations(metrics: DashboardMetrics): string[] {
  const recommendations: string[] = [];
  
  // Memory recommendations
  if (metrics.performance.memory > 80) {
    recommendations.push('High memory usage detected - consider enabling memory cleanup');
  }
  
  // CPU recommendations
  if (metrics.performance.cpu > 80) {
    recommendations.push('High CPU usage - investigate active processes');
  }
  
  // Database recommendations
  if (metrics.database.connectionUsage > 80) {
    recommendations.push('Database connection pool usage high - consider increasing pool size');
  }
  
  if (metrics.database.slowQueries > 5) {
    recommendations.push('Multiple slow queries detected - optimize database queries');
  }
  
  // Pipeline recommendations
  if (metrics.pipeline.errorRate > 10) {
    recommendations.push('High error rate in pipeline - investigate recent failures');
  }
  
  if (metrics.pipeline.queueDepth > 50) {
    recommendations.push('Large queue depth - consider increasing processing capacity');
  }
  
  // Alert recommendations
  if (metrics.alerts.critical > 0) {
    recommendations.push('Critical alerts require immediate attention');
  }
  
  if (metrics.alerts.resolutionRate < 80) {
    recommendations.push('Low alert resolution rate - review alert handling processes');
  }
  
  // Infrastructure recommendations
  if (metrics.infrastructure.circuitBreakerState === 'OPEN') {
    recommendations.push('Circuit breaker is open - system protection active');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('System operating normally - no immediate actions required');
  }
  
  return recommendations;
}