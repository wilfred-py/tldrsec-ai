import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuth } from '@clerk/nextjs/server';

/**
 * Pipeline Health Monitoring API
 * Provides real-time pipeline status and health metrics
 */

interface PipelineMetrics {
  pipelineStatus: 'healthy' | 'degraded' | 'critical';
  processingLatency: number;
  successRate: number;
  errorCount: number;
  activeJobs: number;
  queueDepth: number;
  memoryUsage: number;
  cpuUsage?: number;
  metadata?: Record<string, any>;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  metrics: PipelineMetrics;
  trends: {
    latencyTrend: '↑' | '↓' | '→';
    errorTrend: '↑' | '↓' | '→';
    queueTrend: '↑' | '↓' | '→';
  };
  alerts: Array<{
    type: string;
    severity: 'warning' | 'critical';
    message: string;
    threshold: number;
    actual: number;
  }>;
}

/**
 * GET /api/monitoring/pipeline-health
 * Returns current pipeline health status and metrics
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check for admin access
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin access
    const user = await prisma.user.findUnique({
      where: { authProviderId: userId },
      select: { subscriptionTier: true }
    });

    if (!user || !['ENTERPRISE', 'INSTITUTION'].includes(user.subscriptionTier)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get current metrics from various sources
    const metrics = await calculatePipelineMetrics();
    
    // Get historical trends for comparison
    const trends = await calculateHealthTrends();
    
    // Check for active alerts
    const alerts = await checkThresholdAlerts(metrics);
    
    // Record current health status
    await recordHealthSnapshot(metrics);

    const response: HealthResponse = {
      status: metrics.pipelineStatus,
      timestamp: new Date().toISOString(),
      metrics,
      trends,
      alerts
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Pipeline health check failed:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve pipeline health' }, 
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/pipeline-health
 * Records a custom health snapshot (for external monitoring systems)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const metrics: PipelineMetrics = {
      pipelineStatus: body.pipelineStatus || 'healthy',
      processingLatency: body.processingLatency || 0,
      successRate: body.successRate || 100,
      errorCount: body.errorCount || 0,
      activeJobs: body.activeJobs || 0,
      queueDepth: body.queueDepth || 0,
      memoryUsage: body.memoryUsage || 0,
      cpuUsage: body.cpuUsage,
      metadata: body.metadata
    };

    await recordHealthSnapshot(metrics);

    return NextResponse.json({ success: true, recorded: new Date().toISOString() });

  } catch (error) {
    console.error('Failed to record health snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to record health data' }, 
      { status: 500 }
    );
  }
}

async function calculatePipelineMetrics(): Promise<PipelineMetrics> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Get job queue metrics
  const queueStats = await prisma.jobQueue.aggregate({
    _count: { id: true },
    where: {
      status: { in: ['pending', 'running'] }
    }
  });

  const activeJobs = await prisma.jobQueue.count({
    where: { status: 'running' }
  });

  // Get recent cron execution metrics
  const recentExecution = await prisma.cronJobExecution.findFirst({
    where: {
      startedAt: { gte: oneHourAgo }
    },
    orderBy: { startedAt: 'desc' },
    include: { metrics: true }
  });

  // Calculate error rate from recent summaries
  const recentSummaries = await prisma.summary.findMany({
    where: {
      createdAt: { gte: oneHourAgo }
    },
    select: {
      processingError: true,
      processingStatus: true,
      processingTimeMs: true
    }
  });

  const totalSummaries = recentSummaries.length;
  const errorCount = recentSummaries.filter(s => s.processingError).length;
  const successRate = totalSummaries > 0 ? ((totalSummaries - errorCount) / totalSummaries) * 100 : 100;

  // Calculate average processing latency
  const validProcessingTimes = recentSummaries
    .filter(s => s.processingTimeMs && s.processingTimeMs > 0)
    .map(s => s.processingTimeMs!);
  
  const avgLatency = validProcessingTimes.length > 0 
    ? validProcessingTimes.reduce((sum, time) => sum + time, 0) / validProcessingTimes.length
    : 0;

  // Determine overall pipeline status
  let pipelineStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (successRate < 85 || avgLatency > 60000 || queueStats._count.id > 500) {
    pipelineStatus = 'critical';
  } else if (successRate < 95 || avgLatency > 30000 || queueStats._count.id > 100) {
    pipelineStatus = 'degraded';
  }

  return {
    pipelineStatus,
    processingLatency: Math.round(avgLatency),
    successRate: Math.round(successRate * 100) / 100,
    errorCount,
    activeJobs,
    queueDepth: queueStats._count.id,
    memoryUsage: recentExecution?.memoryUsageMb || 0,
    cpuUsage: recentExecution?.cpuUsagePercent,
    metadata: {
      totalRecentSummaries: totalSummaries,
      lastExecutionId: recentExecution?.id,
      samplingPeriod: '1 hour'
    }
  };
}

async function calculateHealthTrends() {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [currentPeriod, previousPeriod] = await Promise.all([
    prisma.pipelineHealthHistory.findMany({
      where: { timestamp: { gte: oneHourAgo } },
      select: { processingLatency: true, errorCount: true, queueDepth: true }
    }),
    prisma.pipelineHealthHistory.findMany({
      where: { 
        timestamp: { gte: twoHoursAgo, lt: oneHourAgo } 
      },
      select: { processingLatency: true, errorCount: true, queueDepth: true }
    })
  ]);

  const avgCurrent = calculateAverages(currentPeriod);
  const avgPrevious = calculateAverages(previousPeriod);

  return {
    latencyTrend: getTrend(avgCurrent.latency, avgPrevious.latency),
    errorTrend: getTrend(avgCurrent.errors, avgPrevious.errors),
    queueTrend: getTrend(avgCurrent.queue, avgPrevious.queue)
  };
}

function calculateAverages(data: Array<{ processingLatency: number; errorCount: number; queueDepth: number }>) {
  if (data.length === 0) return { latency: 0, errors: 0, queue: 0 };
  
  return {
    latency: data.reduce((sum, d) => sum + d.processingLatency, 0) / data.length,
    errors: data.reduce((sum, d) => sum + d.errorCount, 0) / data.length,
    queue: data.reduce((sum, d) => sum + d.queueDepth, 0) / data.length
  };
}

function getTrend(current: number, previous: number): '↑' | '↓' | '→' {
  const threshold = 0.05; // 5% change threshold
  const change = previous > 0 ? (current - previous) / previous : 0;
  
  if (change > threshold) return '↑';
  if (change < -threshold) return '↓';
  return '→';
}

async function checkThresholdAlerts(metrics: PipelineMetrics) {
  const thresholds = await prisma.monitoringThreshold.findMany({
    where: { enabled: true }
  });

  const alerts = [];

  for (const threshold of thresholds) {
    const metricValue = getMetricValue(metrics, threshold.metricName);
    if (metricValue === null) continue;

    const isTriggered = checkThreshold(metricValue, threshold.operator, threshold.value);
    
    if (isTriggered) {
      alerts.push({
        type: threshold.metricName,
        severity: threshold.thresholdType as 'warning' | 'critical',
        message: threshold.description || `${threshold.metricName} threshold exceeded`,
        threshold: threshold.value,
        actual: metricValue
      });
    }
  }

  return alerts;
}

function getMetricValue(metrics: PipelineMetrics, metricName: string): number | null {
  const metricMap: Record<string, number> = {
    'error_rate_percent': 100 - metrics.successRate,
    'avg_processing_latency_ms': metrics.processingLatency,
    'queue_depth': metrics.queueDepth,
    'memory_usage_mb': metrics.memoryUsage,
    'success_rate_percent': metrics.successRate,
    'active_jobs': metrics.activeJobs,
    'error_count': metrics.errorCount
  };

  return metricMap[metricName] ?? null;
}

function checkThreshold(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
    default: return false;
  }
}

async function recordHealthSnapshot(metrics: PipelineMetrics) {
  await prisma.pipelineHealthHistory.create({
    data: {
      pipelineStatus: metrics.pipelineStatus,
      processingLatency: metrics.processingLatency,
      successRate: metrics.successRate,
      errorCount: metrics.errorCount,
      activeJobs: metrics.activeJobs,
      queueDepth: metrics.queueDepth,
      memoryUsage: metrics.memoryUsage,
      cpuUsage: metrics.cpuUsage,
      metadata: metrics.metadata
    }
  });
}