import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';
import { type JobType } from '../job-queue';

const monitorLogger = logger.child('queue-monitoring');
const prisma = getPrismaClient();

export interface QueueMetrics {
  queueDepth: number;
  pendingJobs: number;
  processingJobs: number;
  completedLast24h: number;
  failedLast24h: number;
  averageProcessingTime: number;
  oldestPendingJob: Date | null;
  estimatedProcessingTime: number;
}

export class QueueMonitoringService {
  /**
   * Get comprehensive queue metrics
   */
  static async getQueueMetrics(): Promise<QueueMetrics> {
    const jobType: JobType = 'ASYNC_SUMMARIZE_FILING';
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      pendingJobs,
      processingJobs,
      completedJobs,
      failedJobs,
      avgProcessingTime,
      oldestJob,
    ] = await Promise.all([
      // Pending jobs count
      prisma.jobQueue.count({
        where: {
          jobType,
          status: 'PENDING',
        },
      }),

      // Processing jobs count
      prisma.jobQueue.count({
        where: {
          jobType,
          status: 'PROCESSING',
        },
      }),

      // Completed jobs in last 24h
      prisma.jobQueue.count({
        where: {
          jobType,
          status: 'COMPLETED',
          completedAt: { gte: oneDayAgo },
        },
      }),

      // Failed jobs in last 24h
      prisma.jobQueue.count({
        where: {
          jobType,
          status: 'FAILED',
          failedAt: { gte: oneDayAgo },
        },
      }),

      // Average processing time (last 24h)
      prisma.$queryRaw<Array<{ avg_seconds: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
        FROM "JobQueue"
        WHERE job_type = ${jobType}
          AND status = 'COMPLETED'
          AND completed_at >= ${oneDayAgo}
      `,

      // Oldest pending job
      prisma.jobQueue.findFirst({
        where: {
          jobType,
          status: 'PENDING',
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          createdAt: true,
        },
      }),
    ]);

    const avgSeconds = avgProcessingTime[0]?.avg_seconds || 30;
    const queueDepth = pendingJobs + processingJobs;
    const estimatedMinutes = Math.ceil(queueDepth / 3) * (avgSeconds / 60);

    return {
      queueDepth,
      pendingJobs,
      processingJobs,
      completedLast24h: completedJobs,
      failedLast24h: failedJobs,
      averageProcessingTime: avgSeconds,
      oldestPendingJob: oldestJob?.createdAt || null,
      estimatedProcessingTime: estimatedMinutes,
    };
  }

  /**
   * Check queue health and alert if needed
   */
  static async checkQueueHealth(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: QueueMetrics;
  }> {
    const metrics = await this.getQueueMetrics();
    const issues: string[] = [];

    // Check 1: Queue depth too high
    if (metrics.queueDepth > 100) {
      issues.push(`Queue depth exceeds threshold: ${metrics.queueDepth} jobs`);
    }

    // Check 2: Old pending jobs
    if (metrics.oldestPendingJob) {
      const ageMinutes = (Date.now() - metrics.oldestPendingJob.getTime()) / 60000;
      if (ageMinutes > 30) {
        issues.push(`Oldest job pending for ${ageMinutes.toFixed(0)} minutes`);
      }
    }

    // Check 3: High failure rate
    const totalJobs = metrics.completedLast24h + metrics.failedLast24h;
    if (totalJobs > 0) {
      const failureRate = metrics.failedLast24h / totalJobs;
      if (failureRate > 0.2) {
        issues.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
      }
    }

    // Check 4: Processing time too high
    if (metrics.averageProcessingTime > 120) {
      issues.push(`Average processing time high: ${metrics.averageProcessingTime.toFixed(0)}s`);
    }

    const healthy = issues.length === 0;

    if (!healthy) {
      monitorLogger.warn('Queue health issues detected', {
        issues,
        metrics,
      });
    }

    return { healthy, issues, metrics };
  }
}
