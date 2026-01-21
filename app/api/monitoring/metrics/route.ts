import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { getAuth } from '@clerk/nextjs/server';

/**
 * System Metrics Aggregation API
 * Provides comprehensive system metrics and KPIs
 */

interface MetricsQuery {
  category?: 'performance' | 'business' | 'operational' | 'all';
  timeRange?: '1h' | '24h' | '7d' | '30d';
  format?: 'summary' | 'detailed' | 'dashboard';
}

interface MetricsResponse {
  timestamp: string;
  timeRange: string;
  category: string;
  metrics: {
    performance: PerformanceMetrics;
    business: BusinessMetrics;
    operational: OperationalMetrics;
    quality: QualityMetrics;
    cost: CostMetrics;
  };
  alerts: {
    active: number;
    critical: number;
    warnings: number;
  };
  health: {
    overall: 'healthy' | 'degraded' | 'critical';
    components: Record<string, 'healthy' | 'degraded' | 'critical'>;
  };
}

interface PerformanceMetrics {
  avgProcessingTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  throughput: number;
  errorRate: number;
  successRate: number;
  queueDepth: number;
  activeJobs: number;
  memoryUtilization: number;
  cpuUtilization: number;
}

interface BusinessMetrics {
  totalUsers: number;
  activeUsers: number;
  summariesGenerated: number;
  emailsSent: number;
  userEngagement: number;
  subscriptionDistribution: Record<string, number>;
  revenueMetrics: {
    monthlyRecurring: number;
    churnRate: number;
    growthRate: number;
  };
}

interface OperationalMetrics {
  uptime: number;
  apiCalls: number;
  secApiCalls: number;
  databaseConnections: number;
  cronExecutions: number;
  cronSuccessRate: number;
  dataVolumeProcessed: number;
  systemLoadAverage: number;
}

interface QualityMetrics {
  summaryQualityScore: number;
  extractionSuccessRate: number;
  parsingErrorRate: number;
  userSatisfactionScore: number;
  dataAccuracy: number;
  completenessScore: number;
}

interface CostMetrics {
  totalOperationalCost: number;
  aiProcessingCost: number;
  emailDeliveryCost: number;
  infrastructureCost: number;
  costPerUser: number;
  costPerSummary: number;
  budgetUtilization: number;
}

/**
 * GET /api/monitoring/metrics
 * Returns comprehensive system metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const user = await getPrismaClient().user.findUnique({
      where: { authProviderId: userId },
      select: { subscriptionTier: true }
    });

    if (!user || !['ENTERPRISE', 'INSTITUTION'].includes(user.subscriptionTier)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const url = new URL(request.url);
    const category = (url.searchParams.get('category') || 'all') as MetricsQuery['category'];
    const timeRange = (url.searchParams.get('timeRange') || '24h') as MetricsQuery['timeRange'];
    const format = (url.searchParams.get('format') || 'summary') as MetricsQuery['format'];

    const { startTime, endTime } = getTimeRangeForMetrics(timeRange);

    // Fetch metrics based on category
    const metrics = await aggregateMetrics(category, startTime, endTime);

    // Get alert summary
    const alerts = await getAlertSummary();

    // Calculate health scores
    const health = await calculateHealthScores(metrics);

    const response: MetricsResponse = {
      timestamp: new Date().toISOString(),
      timeRange: timeRange!,
      category: category!,
      metrics,
      alerts,
      health
    };

    // Filter response based on format
    if (format === 'dashboard') {
      return NextResponse.json(createDashboardView(response));
    } else if (format === 'summary') {
      return NextResponse.json(createSummaryView(response));
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Failed to retrieve metrics:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve metrics' }, 
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/metrics/custom
 * Generate custom metrics report
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      startDate,
      endDate,
      metrics: requestedMetrics = [],
      groupBy = 'day',
      includeBreakdown = false
    } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' }, 
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Generate custom metrics report
    const customReport = await generateCustomMetricsReport(
      start, 
      end, 
      requestedMetrics, 
      groupBy, 
      includeBreakdown
    );

    return NextResponse.json(customReport);

  } catch (error) {
    console.error('Failed to generate custom metrics:', error);
    return NextResponse.json(
      { error: 'Failed to generate custom metrics' }, 
      { status: 500 }
    );
  }
}

function getTimeRangeForMetrics(timeRange: string) {
  const now = new Date();
  let startTime: Date;

  switch (timeRange) {
    case '1h':
      startTime = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  return { startTime, endTime: now };
}

async function aggregateMetrics(
  category: string, 
  startTime: Date, 
  endTime: Date
): Promise<MetricsResponse['metrics']> {
  
  const [
    performance,
    business,
    operational,
    quality,
    cost
  ] = await Promise.all([
    category === 'all' || category === 'performance' ? getPerformanceMetrics(startTime, endTime) : {} as PerformanceMetrics,
    category === 'all' || category === 'business' ? getBusinessMetrics(startTime, endTime) : {} as BusinessMetrics,
    category === 'all' || category === 'operational' ? getOperationalMetrics(startTime, endTime) : {} as OperationalMetrics,
    category === 'all' ? getQualityMetrics(startTime, endTime) : {} as QualityMetrics,
    category === 'all' ? getCostMetrics(startTime, endTime) : {} as CostMetrics
  ]);

  return {
    performance,
    business,
    operational,
    quality,
    cost
  };
}

async function getPerformanceMetrics(startTime: Date, endTime: Date): Promise<PerformanceMetrics> {
  // Get processing time statistics from summaries
  const summaryStats = await getPrismaClient().summary.aggregate({
    where: {
      createdAt: { gte: startTime, lte: endTime },
      processingTimeMs: { not: null }
    },
    _avg: { processingTimeMs: true },
    _count: { id: true }
  });

  // Get processing times for percentile calculations
  const processingTimes = await getPrismaClient().summary.findMany({
    where: {
      createdAt: { gte: startTime, lte: endTime },
      processingTimeMs: { not: null }
    },
    select: { processingTimeMs: true },
    orderBy: { processingTimeMs: 'asc' }
  });

  const times = processingTimes.map(s => s.processingTimeMs!).filter(t => t > 0);
  const p95 = calculatePercentile(times, 95);
  const p99 = calculatePercentile(times, 99);

  // Get error rate
  const errorCount = await getPrismaClient().summary.count({
    where: {
      createdAt: { gte: startTime, lte: endTime },
      processingError: { not: null }
    }
  });

  const totalSummaries = summaryStats._count.id;
  const errorRate = totalSummaries > 0 ? (errorCount / totalSummaries) * 100 : 0;

  // Get queue metrics
  const queueStats = await getPrismaClient().jobQueue.aggregate({
    where: {
      createdAt: { gte: startTime, lte: endTime }
    },
    _count: { id: true }
  });

  const activeJobs = await getPrismaClient().jobQueue.count({
    where: { status: 'running' }
  });

  // Get latest performance data
  const latestPerformance = await getPrismaClient().cronJobExecution.findFirst({
    where: { startedAt: { gte: startTime } },
    orderBy: { startedAt: 'desc' },
    select: { memoryUsageMb: true, cpuUsagePercent: true }
  });

  return {
    avgProcessingTime: summaryStats._avg.processingTimeMs || 0,
    p95ProcessingTime: p95,
    p99ProcessingTime: p99,
    throughput: calculateThroughput(totalSummaries, startTime, endTime),
    errorRate: Math.round(errorRate * 100) / 100,
    successRate: Math.round((100 - errorRate) * 100) / 100,
    queueDepth: queueStats._count.id,
    activeJobs,
    memoryUtilization: latestPerformance?.memoryUsageMb || 0,
    cpuUtilization: latestPerformance?.cpuUsagePercent || 0
  };
}

async function getBusinessMetrics(startTime: Date, endTime: Date): Promise<BusinessMetrics> {
  const [
    totalUsers,
    activeUsers,
    summariesGenerated,
    emailsSent,
    subscriptionBreakdown
  ] = await Promise.all([
    getPrismaClient().user.count(),
    getPrismaClient().user.count({
      where: {
        lastProcessedAt: { gte: startTime }
      }
    }),
    getPrismaClient().summary.count({
      where: {
        createdAt: { gte: startTime, lte: endTime }
      }
    }),
    getPrismaClient().summaryEmailDelivery.count({
      where: {
        sentAt: { gte: startTime, lte: endTime }
      }
    }),
    getPrismaClient().user.groupBy({
      by: ['subscriptionTier'],
      _count: { id: true }
    })
  ]);

  const subscriptionDistribution = Object.fromEntries(
    subscriptionBreakdown.map(item => [item.subscriptionTier, item._count.id])
  );

  // Calculate engagement rate
  const userEngagement = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;

  return {
    totalUsers,
    activeUsers,
    summariesGenerated,
    emailsSent,
    userEngagement: Math.round(userEngagement * 100) / 100,
    subscriptionDistribution,
    revenueMetrics: {
      monthlyRecurring: 0, // Placeholder - would integrate with billing system
      churnRate: 0,
      growthRate: 0
    }
  };
}

async function getOperationalMetrics(startTime: Date, endTime: Date): Promise<OperationalMetrics> {
  const cronExecutions = await getPrismaClient().cronJobExecution.findMany({
    where: {
      startedAt: { gte: startTime, lte: endTime }
    },
    select: {
      status: true,
      durationMs: true
    }
  });

  const successfulExecutions = cronExecutions.filter(e => e.status === 'SUCCESS').length;
  const cronSuccessRate = cronExecutions.length > 0 
    ? (successfulExecutions / cronExecutions.length) * 100 
    : 100;

  // Get API call metrics from audit logs
  const apiCalls = await getPrismaClient().auditLog.count({
    where: {
      createdAt: { gte: startTime, lte: endTime },
      action: { contains: 'api' }
    }
  });

  return {
    uptime: 99.9, // Placeholder - would integrate with uptime monitoring
    apiCalls,
    secApiCalls: 0, // Placeholder - would track SEC API calls
    databaseConnections: 0, // Placeholder - would monitor DB connections
    cronExecutions: cronExecutions.length,
    cronSuccessRate: Math.round(cronSuccessRate * 100) / 100,
    dataVolumeProcessed: 0, // Placeholder
    systemLoadAverage: 0 // Placeholder
  };
}

async function getQualityMetrics(startTime: Date, endTime: Date): Promise<QualityMetrics> {
  const summaries = await getPrismaClient().summary.findMany({
    where: {
      createdAt: { gte: startTime, lte: endTime }
    },
    select: {
      qualityScore: true,
      extractionSuccess: true,
      parsingErrors: true
    }
  });

  const qualityScores = summaries
    .map(s => s.qualityScore)
    .filter(score => score !== null) as number[];

  const avgQualityScore = qualityScores.length > 0 
    ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length 
    : 0;

  const extractionSuccessCount = summaries.filter(s => s.extractionSuccess).length;
  const extractionSuccessRate = summaries.length > 0 
    ? (extractionSuccessCount / summaries.length) * 100 
    : 100;

  const totalParsingErrors = summaries.reduce((sum, s) => sum + s.parsingErrors, 0);
  const parsingErrorRate = summaries.length > 0 
    ? (totalParsingErrors / summaries.length) 
    : 0;

  return {
    summaryQualityScore: Math.round(avgQualityScore * 100) / 100,
    extractionSuccessRate: Math.round(extractionSuccessRate * 100) / 100,
    parsingErrorRate: Math.round(parsingErrorRate * 100) / 100,
    userSatisfactionScore: 0, // Placeholder - would integrate with feedback system
    dataAccuracy: 0, // Placeholder
    completenessScore: 0 // Placeholder
  };
}

async function getCostMetrics(startTime: Date, endTime: Date): Promise<CostMetrics> {
  const costData = await getPrismaClient().cronJobExecution.findMany({
    where: {
      startedAt: { gte: startTime, lte: endTime }
    },
    include: { metrics: true }
  });

  const totalAiCost = costData.reduce((sum, execution) => {
    return sum + (execution.metrics[0]?.aiCostTotal || 0);
  }, 0);

  const totalEmailCost = costData.reduce((sum, execution) => {
    return sum + (execution.metrics[0]?.emailCostTotal || 0);
  }, 0);

  const totalOperationalCost = totalAiCost + totalEmailCost;

  const activeUsers = await getPrismaClient().user.count({
    where: { lastProcessedAt: { gte: startTime } }
  });

  const summariesGenerated = await getPrismaClient().summary.count({
    where: { createdAt: { gte: startTime, lte: endTime } }
  });

  return {
    totalOperationalCost: Math.round(totalOperationalCost * 100) / 100,
    aiProcessingCost: Math.round(totalAiCost * 100) / 100,
    emailDeliveryCost: Math.round(totalEmailCost * 100) / 100,
    infrastructureCost: 0, // Placeholder
    costPerUser: activeUsers > 0 ? Math.round((totalOperationalCost / activeUsers) * 100) / 100 : 0,
    costPerSummary: summariesGenerated > 0 ? Math.round((totalOperationalCost / summariesGenerated) * 100) / 100 : 0,
    budgetUtilization: 0 // Placeholder
  };
}

async function getAlertSummary() {
  const [activeAlerts, criticalAlerts, warningAlerts] = await Promise.all([
    getPrismaClient().errorAlert.count({ where: { resolved: false } }),
    getPrismaClient().errorAlert.count({ where: { resolved: false, alertType: 'critical' } }),
    getPrismaClient().errorAlert.count({ where: { resolved: false, alertType: 'warning' } })
  ]);

  return {
    active: activeAlerts,
    critical: criticalAlerts,
    warnings: warningAlerts
  };
}

async function calculateHealthScores(metrics: MetricsResponse['metrics']) {
  // Calculate overall health based on key metrics
  const performanceScore = calculatePerformanceHealth(metrics.performance);
  const operationalScore = calculateOperationalHealth(metrics.operational);
  const qualityScore = calculateQualityHealth(metrics.quality);

  const overallScore = (performanceScore + operationalScore + qualityScore) / 3;

  return {
    overall: overallScore > 0.8 ? 'healthy' : overallScore > 0.6 ? 'degraded' : 'critical',
    components: {
      performance: performanceScore > 0.8 ? 'healthy' : performanceScore > 0.6 ? 'degraded' : 'critical',
      operational: operationalScore > 0.8 ? 'healthy' : operationalScore > 0.6 ? 'degraded' : 'critical',
      quality: qualityScore > 0.8 ? 'healthy' : qualityScore > 0.6 ? 'degraded' : 'critical'
    }
  };
}

function calculatePerformanceHealth(performance: PerformanceMetrics): number {
  let score = 1.0;
  
  // Penalize high error rates
  if (performance.errorRate > 15) score -= 0.5;
  else if (performance.errorRate > 5) score -= 0.2;
  
  // Penalize high latency
  if (performance.avgProcessingTime > 60000) score -= 0.3;
  else if (performance.avgProcessingTime > 30000) score -= 0.1;
  
  // Penalize large queue depth
  if (performance.queueDepth > 500) score -= 0.3;
  else if (performance.queueDepth > 100) score -= 0.1;
  
  return Math.max(0, score);
}

function calculateOperationalHealth(operational: OperationalMetrics): number {
  let score = 1.0;
  
  // Penalize low cron success rate
  if (operational.cronSuccessRate < 85) score -= 0.4;
  else if (operational.cronSuccessRate < 95) score -= 0.2;
  
  // Penalize low uptime
  if (operational.uptime < 99) score -= 0.3;
  else if (operational.uptime < 99.5) score -= 0.1;
  
  return Math.max(0, score);
}

function calculateQualityHealth(quality: QualityMetrics): number {
  let score = 1.0;
  
  // Penalize low extraction success rate
  if (quality.extractionSuccessRate < 85) score -= 0.3;
  else if (quality.extractionSuccessRate < 95) score -= 0.1;
  
  // Penalize high parsing error rate
  if (quality.parsingErrorRate > 10) score -= 0.3;
  else if (quality.parsingErrorRate > 5) score -= 0.1;
  
  return Math.max(0, score);
}

function createDashboardView(response: MetricsResponse) {
  return {
    timestamp: response.timestamp,
    health: response.health,
    alerts: response.alerts,
    kpis: {
      throughput: response.metrics.performance.throughput,
      errorRate: response.metrics.performance.errorRate,
      activeUsers: response.metrics.business.activeUsers,
      queueDepth: response.metrics.performance.queueDepth,
      totalCost: response.metrics.cost.totalOperationalCost
    },
    trends: {
      // Would include trend indicators
    }
  };
}

function createSummaryView(response: MetricsResponse) {
  return {
    timestamp: response.timestamp,
    health: response.health.overall,
    performance: {
      avgProcessingTime: response.metrics.performance.avgProcessingTime,
      errorRate: response.metrics.performance.errorRate,
      throughput: response.metrics.performance.throughput
    },
    business: {
      activeUsers: response.metrics.business.activeUsers,
      summariesGenerated: response.metrics.business.summariesGenerated
    },
    alerts: response.alerts
  };
}

async function generateCustomMetricsReport(
  startDate: Date,
  endDate: Date,
  requestedMetrics: string[],
  groupBy: string,
  includeBreakdown: boolean
) {
  // Implementation for custom metrics report
  // This would be a more flexible version of the standard metrics
  return {
    period: `${startDate.toISOString()} to ${endDate.toISOString()}`,
    groupBy,
    metrics: {}, // Would contain the requested metrics
    breakdown: includeBreakdown ? {} : undefined
  };
}

// Utility functions
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * values.length) - 1;
  return values[Math.max(0, Math.min(index, values.length - 1))];
}

function calculateThroughput(count: number, startTime: Date, endTime: Date): number {
  const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  return durationHours > 0 ? count / durationHours : 0;
}