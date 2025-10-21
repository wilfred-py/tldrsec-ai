import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuth } from '@clerk/nextjs/server';

/**
 * Health Trends Analytics API
 * Provides historical trend analysis and predictive insights
 */

interface TrendQuery {
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d';
  metrics: string[];
  granularity: 'minute' | 'hour' | 'day';
}

interface TrendDataPoint {
  timestamp: string;
  metrics: Record<string, number>;
}

interface TrendAnalysis {
  timeRange: string;
  granularity: string;
  dataPoints: TrendDataPoint[];
  analysis: {
    trends: Record<string, 'improving' | 'stable' | 'degrading'>;
    correlations: Array<{
      metric1: string;
      metric2: string;
      correlation: number;
      strength: 'weak' | 'moderate' | 'strong';
    }>;
    anomalies: Array<{
      timestamp: string;
      metric: string;
      value: number;
      expected: number;
      deviation: number;
    }>;
    forecasting: Record<string, {
      next1h: number;
      next6h: number;
      next24h: number;
      confidence: number;
    }>;
  };
}

/**
 * GET /api/monitoring/health-trends
 * Returns historical trend analysis for pipeline health metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const user = await prisma.user.findUnique({
      where: { authProviderId: userId },
      select: { subscriptionTier: true }
    });

    if (!user || !['ENTERPRISE', 'INSTITUTION'].includes(user.subscriptionTier)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const url = new URL(request.url);
    const timeRange = (url.searchParams.get('timeRange') || '24h') as TrendQuery['timeRange'];
    const metricsParam = url.searchParams.get('metrics') || 'all';
    const granularity = (url.searchParams.get('granularity') || 'hour') as TrendQuery['granularity'];

    const metrics = metricsParam === 'all' 
      ? ['processingLatency', 'successRate', 'errorCount', 'queueDepth', 'memoryUsage']
      : metricsParam.split(',');

    // Get time range boundaries
    const { startTime, endTime, intervalMinutes } = getTimeRange(timeRange, granularity);

    // Fetch historical data
    const historicalData = await fetchHistoricalData(startTime, endTime, metrics);

    // Group data by time intervals
    const aggregatedData = aggregateDataByInterval(historicalData, intervalMinutes, startTime, endTime);

    // Perform trend analysis
    const analysis = await performTrendAnalysis(aggregatedData, metrics);

    const response: TrendAnalysis = {
      timeRange,
      granularity,
      dataPoints: aggregatedData,
      analysis
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Failed to retrieve health trends:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve health trends' }, 
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/health-trends/analysis
 * Performs custom trend analysis with user-defined parameters
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
      metrics = ['processingLatency', 'successRate', 'errorCount'],
      analysisType = 'standard',
      includeForecasting = false
    } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' }, 
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end <= start) {
      return NextResponse.json(
        { error: 'endDate must be after startDate' }, 
        { status: 400 }
      );
    }

    // Limit analysis to 30 days for performance
    const maxDays = 30;
    if ((end.getTime() - start.getTime()) > maxDays * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: `Analysis period cannot exceed ${maxDays} days` }, 
        { status: 400 }
      );
    }

    const historicalData = await fetchHistoricalData(start, end, metrics);
    const intervalMinutes = calculateOptimalInterval(start, end);
    const aggregatedData = aggregateDataByInterval(historicalData, intervalMinutes, start, end);

    let analysis;
    switch (analysisType) {
      case 'detailed':
        analysis = await performDetailedAnalysis(aggregatedData, metrics);
        break;
      case 'anomaly':
        analysis = await performAnomalyDetection(aggregatedData, metrics);
        break;
      default:
        analysis = await performTrendAnalysis(aggregatedData, metrics);
    }

    if (includeForecasting) {
      analysis.forecasting = await generateForecasts(aggregatedData, metrics);
    }

    return NextResponse.json({
      timeRange: `${startDate} to ${endDate}`,
      dataPoints: aggregatedData,
      analysis,
      metadata: {
        totalDataPoints: aggregatedData.length,
        intervalMinutes,
        metricsAnalyzed: metrics
      }
    });

  } catch (error) {
    console.error('Failed to perform custom analysis:', error);
    return NextResponse.json(
      { error: 'Failed to perform custom analysis' }, 
      { status: 500 }
    );
  }
}

function getTimeRange(timeRange: string, granularity: string) {
  const now = new Date();
  let startTime: Date;
  let intervalMinutes: number;

  switch (timeRange) {
    case '1h':
      startTime = new Date(now.getTime() - 60 * 60 * 1000);
      intervalMinutes = granularity === 'minute' ? 1 : 5;
      break;
    case '6h':
      startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      intervalMinutes = granularity === 'minute' ? 5 : 15;
      break;
    case '24h':
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      intervalMinutes = granularity === 'hour' ? 60 : 15;
      break;
    case '7d':
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      intervalMinutes = granularity === 'day' ? 1440 : 60;
      break;
    case '30d':
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      intervalMinutes = granularity === 'day' ? 1440 : 360;
      break;
    default:
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      intervalMinutes = 60;
  }

  return { startTime, endTime: now, intervalMinutes };
}

async function fetchHistoricalData(startTime: Date, endTime: Date, _metrics: string[]) {
  return await prisma.pipelineHealthHistory.findMany({
    where: {
      timestamp: {
        gte: startTime,
        lte: endTime
      }
    },
    orderBy: { timestamp: 'asc' },
    select: {
      timestamp: true,
      processingLatency: true,
      successRate: true,
      errorCount: true,
      queueDepth: true,
      memoryUsage: true,
      cpuUsage: true,
      pipelineStatus: true,
      metadata: true
    }
  });
}

function aggregateDataByInterval(
  data: Array<{
    timestamp: Date;
    processingLatency: number;
    successRate: number;
    errorCount: number;
    queueDepth: number;
    memoryUsage: number;
    cpuUsage: number | null;
  }>, 
  intervalMinutes: number, 
  startTime: Date, 
  endTime: Date
): TrendDataPoint[] {
  const intervals: TrendDataPoint[] = [];
  const intervalMs = intervalMinutes * 60 * 1000;
  
  for (let time = startTime.getTime(); time < endTime.getTime(); time += intervalMs) {
    const intervalStart = new Date(time);
    const intervalEnd = new Date(time + intervalMs);
    
    const intervalData = data.filter(d => 
      d.timestamp >= intervalStart && d.timestamp < intervalEnd
    );

    if (intervalData.length > 0) {
      const metrics: Record<string, number> = {
        processingLatency: average(intervalData.map(d => d.processingLatency)),
        successRate: average(intervalData.map(d => d.successRate)),
        errorCount: sum(intervalData.map(d => d.errorCount)),
        queueDepth: average(intervalData.map(d => d.queueDepth)),
        memoryUsage: average(intervalData.map(d => d.memoryUsage)),
        cpuUsage: average(intervalData.map(d => d.cpuUsage).filter(v => v !== null))
      };

      intervals.push({
        timestamp: intervalStart.toISOString(),
        metrics
      });
    }
  }

  return intervals;
}

async function performTrendAnalysis(data: TrendDataPoint[], metrics: string[]) {
  const trends: Record<string, 'improving' | 'stable' | 'degrading'> = {};
  
  // Calculate trends for each metric
  for (const metric of metrics) {
    const values = data.map(d => d.metrics[metric]).filter(v => v !== undefined && v !== null);
    if (values.length < 2) continue;

    const trend = calculateLinearTrend(values);
    trends[metric] = classifyTrend(metric, trend);
  }

  // Calculate correlations between metrics
  const correlations = calculateCorrelations(data, metrics);

  // Detect anomalies
  const anomalies = detectAnomalies(data, metrics);

  return {
    trends,
    correlations,
    anomalies,
    forecasting: {} // Placeholder for forecasting
  };
}

function calculateLinearTrend(values: number[]): number {
  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * values[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return slope;
}

function classifyTrend(metric: string, slope: number): 'improving' | 'stable' | 'degrading' {
  const threshold = 0.01;
  
  // For some metrics, positive slope is bad (errors, latency)
  const negativeTrendMetrics = ['processingLatency', 'errorCount', 'queueDepth', 'memoryUsage'];
  const isNegativeTrendMetric = negativeTrendMetrics.includes(metric);

  if (Math.abs(slope) < threshold) return 'stable';
  
  if (isNegativeTrendMetric) {
    return slope > 0 ? 'degrading' : 'improving';
  } else {
    return slope > 0 ? 'improving' : 'degrading';
  }
}

function calculateCorrelations(data: TrendDataPoint[], metrics: string[]) {
  const correlations = [];
  
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      const metric1 = metrics[i];
      const metric2 = metrics[j];
      
      const values1 = data.map(d => d.metrics[metric1]).filter(v => v !== undefined && v !== null);
      const values2 = data.map(d => d.metrics[metric2]).filter(v => v !== undefined && v !== null);
      
      if (values1.length === values2.length && values1.length > 1) {
        const correlation = calculatePearsonCorrelation(values1, values2);
        const strength = Math.abs(correlation) > 0.7 ? 'strong' : 
                        Math.abs(correlation) > 0.3 ? 'moderate' : 'weak';
        
        correlations.push({
          metric1,
          metric2,
          correlation: Math.round(correlation * 1000) / 1000,
          strength
        });
      }
    }
  }
  
  return correlations;
}

function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumYY = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

function detectAnomalies(data: TrendDataPoint[], metrics: string[]) {
  const anomalies = [];
  
  for (const metric of metrics) {
    const values = data.map(d => d.metrics[metric]).filter(v => v !== undefined && v !== null);
    if (values.length < 3) continue;

    const mean = average(values);
    const stdDev = standardDeviation(values, mean);
    const threshold = 2.5; // Z-score threshold for anomalies

    data.forEach(point => {
      const value = point.metrics[metric];
      if (value !== undefined && value !== null) {
        const zScore = Math.abs((value - mean) / stdDev);
        if (zScore > threshold) {
          anomalies.push({
            timestamp: point.timestamp,
            metric,
            value,
            expected: mean,
            deviation: zScore
          });
        }
      }
    });
  }
  
  return anomalies;
}

async function performDetailedAnalysis(data: TrendDataPoint[], metrics: string[]) {
  // Enhanced analysis with more sophisticated algorithms
  const baseAnalysis = await performTrendAnalysis(data, metrics);
  
  // Add seasonal decomposition, change point detection, etc.
  // This is a placeholder for more advanced analysis
  
  return {
    ...baseAnalysis,
    seasonality: analyzeSeasonality(data, metrics),
    changePoints: detectChangePoints(data, metrics)
  };
}

async function performAnomalyDetection(data: TrendDataPoint[], metrics: string[]) {
  return {
    anomalies: detectAnomalies(data, metrics),
    anomalyScore: calculateAnomalyScore(data, metrics),
    patterns: identifyAnomalyPatterns(data, metrics)
  };
}

async function generateForecasts(data: TrendDataPoint[], metrics: string[]) {
  const forecasts: Record<string, {
    next1h: number;
    next6h: number;
    next24h: number;
    confidence: number;
  }> = {};
  
  for (const metric of metrics) {
    const values = data.map(d => d.metrics[metric]).filter(v => v !== undefined && v !== null);
    if (values.length < 5) continue;

    // Simple linear extrapolation for forecasting
    const trend = calculateLinearTrend(values);
    const lastValue = values[values.length - 1];
    
    forecasts[metric] = {
      next1h: lastValue + trend * 1,
      next6h: lastValue + trend * 6,
      next24h: lastValue + trend * 24,
      confidence: Math.max(0.1, Math.min(0.9, 1 - Math.abs(trend) * 0.1))
    };
  }
  
  return forecasts;
}

// Utility functions
function average(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function standardDeviation(values: number[], mean?: number): number {
  const avg = mean ?? average(values);
  const squaredDiffs = values.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(average(squaredDiffs));
}

function calculateOptimalInterval(start: Date, end: Date): number {
  const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  
  if (diffHours <= 6) return 15; // 15 minutes
  if (diffHours <= 24) return 60; // 1 hour
  if (diffHours <= 168) return 360; // 6 hours
  return 1440; // 1 day
}

function analyzeSeasonality(_data: TrendDataPoint[], _metrics: string[]) {
  // Placeholder for seasonal analysis
  return {};
}

function detectChangePoints(_data: TrendDataPoint[], _metrics: string[]) {
  // Placeholder for change point detection
  return [];
}

function calculateAnomalyScore(_data: TrendDataPoint[], _metrics: string[]): number {
  // Placeholder for anomaly scoring
  return 0;
}

function identifyAnomalyPatterns(_data: TrendDataPoint[], _metrics: string[]) {
  // Placeholder for pattern identification
  return [];
}