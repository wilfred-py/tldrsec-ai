/**
 * Retry Rate Monitoring Service
 *
 * Tracks job retry patterns and detects anomalies in the retry rate.
 *
 * Expected baseline: 100% of successful jobs have retryCount=1 due to serverless cold starts.
 * Anomaly threshold: >10% of jobs with retryCount>1 indicates infrastructure issues.
 *
 * See docs/architecture/job-retry-patterns.md for complete analysis.
 */

import { getPrismaClient } from '@/lib/db/prisma';

export interface RetryRateMetrics {
  totalJobs: number;
  avgRetries: number;
  retryPercentage: number;
  multipleRetryPercentage: number;
  retryDistribution: {
    retryCount0: number;
    retryCount1: number;
    retryCount2Plus: number;
  };
  anomalyDetected: boolean;
  anomalyReason?: string;
}

export interface RetryRateHealth {
  healthy: boolean;
  metrics: RetryRateMetrics;
  baseline: {
    expectedRetryRate: number;
    anomalyThreshold: number;
  };
  recommendations?: string[];
}

export class RetryRateMonitor {
  /**
   * Get retry rate metrics for a time window
   *
   * @param hoursBack - Number of hours to look back (default: 24)
   * @returns Retry rate metrics
   */
  static async getMetrics(hoursBack: number = 24): Promise<RetryRateMetrics> {
    const prisma = getPrismaClient();

    // Calculate time window
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursBack);

    // Query completed jobs in time window
    const jobs = await prisma.jobQueue.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: cutoffTime
        }
      },
      select: {
        id: true,
        retryCount: true,
        createdAt: true,
        completedAt: true
      }
    });

    // Calculate metrics
    const totalJobs = jobs.length;

    if (totalJobs === 0) {
      return {
        totalJobs: 0,
        avgRetries: 0,
        retryPercentage: 0,
        multipleRetryPercentage: 0,
        retryDistribution: {
          retryCount0: 0,
          retryCount1: 0,
          retryCount2Plus: 0
        },
        anomalyDetected: false
      };
    }

    // Calculate retry distribution
    const retryCount0 = jobs.filter(j => j.retryCount === 0).length;
    const retryCount1 = jobs.filter(j => j.retryCount === 1).length;
    const retryCount2Plus = jobs.filter(j => j.retryCount >= 2).length;

    // Calculate percentages
    const retryPercentage = Math.round((retryCount1 / totalJobs) * 100);
    const multipleRetryPercentage = Math.round((retryCount2Plus / totalJobs) * 100);

    // Calculate average
    const totalRetries = jobs.reduce((sum, job) => sum + job.retryCount, 0);
    const avgRetries = parseFloat((totalRetries / totalJobs).toFixed(2));

    // Detect anomalies
    // Baseline: 90-100% of jobs should have retryCount=1
    // Anomaly: >10% of jobs have retryCount>1
    const anomalyDetected = multipleRetryPercentage > 10;
    const anomalyReason = anomalyDetected
      ? `${multipleRetryPercentage}% of jobs required multiple retries (>10% threshold)`
      : undefined;

    return {
      totalJobs,
      avgRetries,
      retryPercentage,
      multipleRetryPercentage,
      retryDistribution: {
        retryCount0,
        retryCount1,
        retryCount2Plus
      },
      anomalyDetected,
      anomalyReason
    };
  }

  /**
   * Get comprehensive health assessment of retry rates
   *
   * @param hoursBack - Number of hours to look back (default: 24)
   * @returns Health assessment with recommendations
   */
  static async getHealth(hoursBack: number = 24): Promise<RetryRateHealth> {
    const metrics = await this.getMetrics(hoursBack);

    // Baseline expectations
    const baseline = {
      expectedRetryRate: 100, // 100% of jobs should have retryCount=1
      anomalyThreshold: 10    // >10% with retryCount>1 is anomaly
    };

    // Determine health status
    const healthy = !metrics.anomalyDetected;

    // Generate recommendations if unhealthy
    const recommendations: string[] = [];

    if (metrics.anomalyDetected) {
      recommendations.push(
        'Investigate jobs with retryCount>1 for persistent errors',
        'Check /api/health for infrastructure issues',
        'Review Dead Letter Queue for completely failed jobs',
        'Consider reviewing error patterns in job logs'
      );
    }

    if (metrics.totalJobs === 0) {
      recommendations.push(
        'No completed jobs found in time window',
        'Check if cron jobs are running',
        'Verify pipeline is processing filings'
      );
    }

    // Unusual pattern: high percentage of retryCount=0
    if (metrics.retryDistribution.retryCount0 > metrics.totalJobs * 0.2) {
      recommendations.push(
        'Unusually high percentage of first-attempt successes',
        'Functions may be staying warm (reduced load or optimization)',
        'This is not a problem, but represents deviation from baseline'
      );
    }

    return {
      healthy,
      metrics,
      baseline,
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };
  }

  /**
   * Get detailed retry breakdown for debugging
   *
   * @param hoursBack - Number of hours to look back (default: 24)
   * @param limit - Maximum number of jobs to return per category
   * @returns Jobs grouped by retry count
   */
  static async getDetailedBreakdown(hoursBack: number = 24, limit: number = 10) {
    const prisma = getPrismaClient();

    // Calculate time window
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursBack);

    // Get jobs by retry count
    const [retryCount0, retryCount1, retryCount2Plus] = await Promise.all([
      // No retries (first attempt success)
      prisma.jobQueue.findMany({
        where: {
          status: 'COMPLETED',
          retryCount: 0,
          completedAt: { gte: cutoffTime }
        },
        select: {
          id: true,
          type: true,
          retryCount: true,
          createdAt: true,
          completedAt: true,
          lastError: true
        },
        take: limit,
        orderBy: { completedAt: 'desc' }
      }),

      // Single retry (expected baseline)
      prisma.jobQueue.findMany({
        where: {
          status: 'COMPLETED',
          retryCount: 1,
          completedAt: { gte: cutoffTime }
        },
        select: {
          id: true,
          type: true,
          retryCount: true,
          createdAt: true,
          completedAt: true,
          lastError: true
        },
        take: limit,
        orderBy: { completedAt: 'desc' }
      }),

      // Multiple retries (anomaly)
      prisma.jobQueue.findMany({
        where: {
          status: 'COMPLETED',
          retryCount: { gte: 2 },
          completedAt: { gte: cutoffTime }
        },
        select: {
          id: true,
          type: true,
          retryCount: true,
          createdAt: true,
          completedAt: true,
          lastError: true
        },
        take: limit,
        orderBy: { retryCount: 'desc' }
      })
    ]);

    return {
      retryCount0: {
        count: retryCount0.length,
        jobs: retryCount0
      },
      retryCount1: {
        count: retryCount1.length,
        jobs: retryCount1
      },
      retryCount2Plus: {
        count: retryCount2Plus.length,
        jobs: retryCount2Plus
      }
    };
  }
}
