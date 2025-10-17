/**
 * Job Status and Monitoring API Endpoint
 * 
 * Provides comprehensive status information for job processing,
 * including progress tracking, timeout monitoring, and cost analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging/index';
import { monitoring } from '../../../../lib/monitoring/index';
import { ProgressCheckpointService } from '../../../../lib/job-queue/progress-checkpoint';
import { TimeoutMonitorService } from '../../../../lib/monitoring/timeout-monitor';
import { CostMonitorService } from '../../../../lib/monitoring/cost-monitor';
import { QueueManagerService } from '../../../../lib/job-queue/queue-manager';
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { generateSecureExecutionId } from '../../../../lib/security/secure-random';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10; // 10 seconds for status checks

const statusLogger = logger.child('job-status-api');

/**
 * Get comprehensive job processing status
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('job-status');
  
  statusLogger.info('Job status request started', {
    executionId,
    timestamp: new Date().toISOString()
  });

  try {
    // Optional authentication check
    const requireAuth = request.headers.get('x-require-auth') === 'true';
    
    if (requireAuth) {
      const authResult = await CronAuthService.validateCronRequest(request);
      if (!authResult.isValid) {
        statusLogger.error('Authentication failed for job status request', {
          executionId,
          error: authResult.error,
          clientIP: authResult.clientIP
        });
        
        return NextResponse.json(
          { 
            success: false, 
            executionId,
            error: 'Authentication failed',
            reason: authResult.error || 'Invalid credentials'
          },
          { status: 401 }
        );
      }
    }

    // Gather comprehensive status information
    const [
      queueMetrics,
      workerStatus,
      scalingConfig,
      costAnalytics,
      timeoutPatterns
    ] = await Promise.all([
      QueueManagerService.getQueueMetrics(),
      QueueManagerService.getWorkerStatus(),
      QueueManagerService.getScalingConfig(),
      CostMonitorService.getCostAnalytics(),
      ProgressCheckpointService.analyzeTimeoutPatterns()
    ]);

    // Calculate system health scores
    const queueHealth = calculateQueueHealth(queueMetrics);
    const costHealth = calculateCostHealth(costAnalytics);
    const timeoutHealth = calculateTimeoutHealth(timeoutPatterns);
    
    const overallHealth = Math.min(queueHealth, costHealth, timeoutHealth);

    const totalTime = Date.now() - startTime;

    // Record metrics
    monitoring.incrementCounter('job_status_api.requests', 1);
    monitoring.recordTiming('job_status_api.duration', totalTime);
    monitoring.recordValue('job_status_api.overall_health', overallHealth);

    statusLogger.info('Job status request completed', {
      executionId,
      totalTime,
      overallHealth,
      queueDepth: queueMetrics.queueDepth,
      activeWorkers: workerStatus.length
    });

    return NextResponse.json({
      success: true,
      executionId,
      status: {
        overall: overallHealth >= 80 ? 'healthy' : overallHealth >= 60 ? 'warning' : 'critical',
        overallHealth,
        lastUpdated: new Date().toISOString()
      },
      queue: {
        metrics: queueMetrics,
        health: queueHealth,
        recommendations: generateQueueRecommendations(queueMetrics)
      },
      workers: {
        status: workerStatus,
        scaling: {
          config: scalingConfig,
          utilization: queueMetrics.queueDepth > 0 ? 
            queueMetrics.queueDepth / (workerStatus.length * scalingConfig.maxJobsPerWorker) : 0
        }
      },
      costs: {
        analytics: costAnalytics,
        health: costHealth,
        thresholds: CostMonitorService.getCostThresholds()
      },
      timeouts: {
        patterns: timeoutPatterns,
        health: timeoutHealth,
        flaggedJobs: await ProgressCheckpointService.flagLongRunningJobs()
      },
      metadata: {
        processingTime: totalTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    statusLogger.error('Job status request failed', {
      executionId,
      error: errorMessage,
      totalTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Record error metrics
    monitoring.incrementCounter('job_status_api.errors', 1);

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage,
        code: 'STATUS_CHECK_ERROR',
        metadata: {
          processingTime: totalTime,
          retryable: true
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Trigger timeout monitoring and admin alerts
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('timeout-check');
  
  statusLogger.info('Timeout monitoring request started', {
    executionId,
    timestamp: new Date().toISOString()
  });

  try {
    // Require authentication for timeout monitoring
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      statusLogger.error('Authentication failed for timeout monitoring', {
        executionId,
        error: authResult.error,
        clientIP: authResult.clientIP
      });
      
      return NextResponse.json(
        { 
          success: false, 
          executionId,
          error: 'Authentication failed',
          reason: authResult.error || 'Invalid credentials'
        },
        { status: 401 }
      );
    }

    // Run timeout monitoring and admin alerts
    const [timeoutAlerts, costAlerts] = await Promise.all([
      TimeoutMonitorService.flagTimeoutJobs(),
      CostMonitorService.checkHighCostOperations()
    ]);

    const totalAlerts = timeoutAlerts.length + costAlerts.length;
    const totalTime = Date.now() - startTime;

    // Record metrics
    monitoring.incrementCounter('timeout_monitoring.executions', 1);
    monitoring.recordTiming('timeout_monitoring.duration', totalTime);
    monitoring.recordValue('timeout_monitoring.alerts_generated', totalAlerts);

    statusLogger.info('Timeout monitoring completed', {
      executionId,
      timeoutAlerts: timeoutAlerts.length,
      costAlerts: costAlerts.length,
      totalAlerts,
      totalTime
    });

    return NextResponse.json({
      success: true,
      executionId,
      message: `Monitoring completed - generated ${totalAlerts} alerts`,
      data: {
        timeoutAlerts: {
          count: timeoutAlerts.length,
          alerts: timeoutAlerts.map(alert => ({
            alertId: alert.alertId,
            alertType: alert.alertType,
            severity: alert.severity,
            title: alert.title,
            businessContext: alert.businessContext
          }))
        },
        costAlerts: {
          count: costAlerts.length,
          alerts: costAlerts.map(alert => ({
            alertId: alert.alertId,
            costUSD: alert.costUSD,
            model: alert.model,
            threshold: alert.threshold,
            businessContext: alert.businessContext
          }))
        }
      },
      metadata: {
        processingTime: totalTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    statusLogger.error('Timeout monitoring failed', {
      executionId,
      error: errorMessage,
      totalTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Record error metrics
    monitoring.incrementCounter('timeout_monitoring.errors', 1);

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage,
        code: 'TIMEOUT_MONITORING_ERROR',
        metadata: {
          processingTime: totalTime,
          retryable: true
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate queue health score (0-100)
 */
function calculateQueueHealth(metrics: { queueDepth: number; oldestPendingJobAge: number; pendingJobs: number; processingJobs: number; failedJobs: number }): number {
  let score = 100;
  
  // Penalize high queue depth
  if (metrics.queueDepth > 50) score -= 30;
  else if (metrics.queueDepth > 20) score -= 15;
  else if (metrics.queueDepth > 10) score -= 5;
  
  // Penalize old pending jobs
  const ageInMinutes = metrics.oldestPendingJobAge / 60000;
  if (ageInMinutes > 30) score -= 25;
  else if (ageInMinutes > 15) score -= 10;
  else if (ageInMinutes > 5) score -= 5;
  
  // Penalize high failed job rate
  const totalActiveJobs = metrics.pendingJobs + metrics.processingJobs;
  if (totalActiveJobs > 0) {
    const failureRate = metrics.failedJobs / (totalActiveJobs + metrics.failedJobs);
    if (failureRate > 0.2) score -= 20;
    else if (failureRate > 0.1) score -= 10;
  }
  
  return Math.max(0, score);
}

/**
 * Calculate cost health score (0-100)
 */
function calculateCostHealth(analytics: { costTrend: string; averageCostPerJob: number; totalCostToday: number }): number {
  let score = 100;
  
  // Check cost trends
  if (analytics.costTrend === 'increasing') score -= 15;
  
  // Check average cost per job
  if (analytics.averageCostPerJob > 0.50) score -= 20;
  else if (analytics.averageCostPerJob > 0.25) score -= 10;
  
  // Check daily costs
  if (analytics.totalCostToday > 10.0) score -= 25;
  else if (analytics.totalCostToday > 5.0) score -= 10;
  
  return Math.max(0, score);
}

/**
 * Calculate timeout health score (0-100)
 */
function calculateTimeoutHealth(patterns: { timeoutRate: number; timeoutCount: number }[]): number {
  if (patterns.length === 0) return 100;
  
  let score = 100;
  
  // Penalize high timeout rates
  const avgTimeoutRate = patterns.reduce((sum, p) => sum + p.timeoutRate, 0) / patterns.length;
  if (avgTimeoutRate > 0.1) score -= 30; // >10% timeout rate
  else if (avgTimeoutRate > 0.05) score -= 15; // >5% timeout rate
  else if (avgTimeoutRate > 0.02) score -= 5; // >2% timeout rate
  
  // Penalize recent timeout clusters
  const recentTimeouts = patterns.filter(p => p.timeoutCount > 3);
  if (recentTimeouts.length > 2) score -= 20;
  else if (recentTimeouts.length > 0) score -= 10;
  
  return Math.max(0, score);
}

/**
 * Generate queue recommendations
 */
function generateQueueRecommendations(metrics: { queueDepth: number; oldestPendingJobAge: number; avgProcessingTime: number }): string[] {
  const recommendations: string[] = [];
  
  if (metrics.queueDepth > 20) {
    recommendations.push('Consider scaling up workers to handle high queue depth');
  }
  
  if (metrics.oldestPendingJobAge > 300000) { // 5 minutes
    recommendations.push('Review job priorities - some jobs have been waiting too long');
  }
  
  if (metrics.avgProcessingTime > 120000) { // 2 minutes
    recommendations.push('Optimize job processing time or increase timeouts');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Queue is operating within normal parameters');
  }
  
  return recommendations;
}