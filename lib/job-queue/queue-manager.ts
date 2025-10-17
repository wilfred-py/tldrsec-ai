/**
 * Queue Manager Service
 * 
 * Provides dynamic worker scaling based on queue depth and reactive scaling thresholds
 * to optimize job processing throughput while maintaining system stability
 */

import { logger } from '../logging/index';
import { monitoring } from '../monitoring/index';
import { getPrismaClient } from '../db/prisma';
import { JobWorker, getJobWorker } from './worker';

const queueLogger = logger.child('queue-manager');
const prisma = getPrismaClient();

export interface QueueMetrics {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  failedJobs: number;
  avgProcessingTime: number;
  queueDepth: number;
  oldestPendingJobAge: number;
  priorityDistribution: Record<string, number>;
  jobTypeDistribution: Record<string, number>;
}

export interface WorkerScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  targetWorkerCount: number;
  currentWorkerCount: number;
  reason: string;
  queueUtilization: number;
  recommendedAction: string;
}

export interface ScalingConfig {
  minWorkers: number;
  maxWorkers: number;
  maxJobsPerWorker: number;
  scaleUpThreshold: number;    // Queue utilization percentage (75%)
  scaleDownThreshold: number;  // Queue utilization percentage (25%)
  scaleDownDelayMs: number;    // Wait time before scaling down (10 minutes)
  evaluationIntervalMs: number; // How often to check scaling (30 seconds)
}

/**
 * Queue Manager Service
 * Manages dynamic worker scaling based on queue conditions
 */
export class QueueManagerService {
  private static readonly DEFAULT_CONFIG: ScalingConfig = {
    minWorkers: 1,
    maxWorkers: 5,
    maxJobsPerWorker: 3,
    scaleUpThreshold: 0.75,      // 75%
    scaleDownThreshold: 0.25,    // 25%
    scaleDownDelayMs: 600000,    // 10 minutes
    evaluationIntervalMs: 30000  // 30 seconds
  };

  private static workers: JobWorker[] = [];
  private static scalingConfig: ScalingConfig = this.DEFAULT_CONFIG;
  private static lastScaleDown = 0;
  private static isMonitoring = false;

  /**
   * Get current queue metrics for monitoring and scaling decisions
   */
  static async getQueueMetrics(): Promise<QueueMetrics> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get job counts by status
      const statusCounts = await prisma.jobQueue.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      });

      const totalJobs = statusCounts.reduce((sum, group) => sum + group._count.id, 0);
      const pendingJobs = statusCounts.find(g => g.status === 'PENDING')?._count.id || 0;
      const processingJobs = statusCounts.find(g => g.status === 'PROCESSING')?._count.id || 0;
      const failedJobs = statusCounts.find(g => g.status === 'FAILED')?._count.id || 0;

      // Get average processing time from recent completed jobs
      const recentCompletedJobs = await prisma.jobQueue.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: oneHourAgo
          },
          executionTime: {
            not: null
          }
        },
        select: {
          executionTime: true
        },
        take: 100
      });

      const avgProcessingTime = recentCompletedJobs.length > 0
        ? recentCompletedJobs.reduce((sum, job) => sum + (job.executionTime || 0), 0) / recentCompletedJobs.length
        : 45000; // Default 45 seconds

      // Get oldest pending job age
      const oldestPendingJob = await prisma.jobQueue.findFirst({
        where: {
          status: 'PENDING'
        },
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          createdAt: true
        }
      });

      const oldestPendingJobAge = oldestPendingJob
        ? now.getTime() - oldestPendingJob.createdAt.getTime()
        : 0;

      // Get priority distribution
      const priorityGroups = await prisma.jobQueue.groupBy({
        by: ['priority'],
        where: {
          status: {
            in: ['PENDING', 'PROCESSING']
          }
        },
        _count: {
          id: true
        }
      });

      const priorityDistribution = priorityGroups.reduce((acc, group) => {
        acc[`priority_${group.priority}`] = group._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Get job type distribution
      const jobTypeGroups = await prisma.jobQueue.groupBy({
        by: ['jobType'],
        where: {
          status: {
            in: ['PENDING', 'PROCESSING']
          }
        },
        _count: {
          id: true
        }
      });

      const jobTypeDistribution = jobTypeGroups.reduce((acc, group) => {
        acc[group.jobType] = group._count.id;
        return acc;
      }, {} as Record<string, number>);

      const queueDepth = pendingJobs + processingJobs;

      const metrics: QueueMetrics = {
        totalJobs,
        pendingJobs,
        processingJobs,
        failedJobs,
        avgProcessingTime,
        queueDepth,
        oldestPendingJobAge,
        priorityDistribution,
        jobTypeDistribution
      };

      // Record metrics for monitoring
      monitoring.recordValue('queue.total_jobs', totalJobs);
      monitoring.recordValue('queue.pending_jobs', pendingJobs);
      monitoring.recordValue('queue.processing_jobs', processingJobs);
      monitoring.recordValue('queue.queue_depth', queueDepth);
      monitoring.recordValue('queue.avg_processing_time_ms', avgProcessingTime);
      monitoring.recordValue('queue.oldest_pending_age_ms', oldestPendingJobAge);

      return metrics;

    } catch (error) {
      queueLogger.error('Failed to get queue metrics', {
        error: error.message
      });
      
      // Return empty metrics on error
      return {
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        failedJobs: 0,
        avgProcessingTime: 45000,
        queueDepth: 0,
        oldestPendingJobAge: 0,
        priorityDistribution: {},
        jobTypeDistribution: {}
      };
    }
  }

  /**
   * Determine worker scaling decision based on current queue conditions
   */
  static async scaleWorkers(): Promise<WorkerScalingDecision> {
    try {
      const metrics = await this.getQueueMetrics();
      const currentWorkerCount = this.workers.length;
      const currentCapacity = currentWorkerCount * this.scalingConfig.maxJobsPerWorker;
      const queueUtilization = currentCapacity > 0 ? metrics.queueDepth / currentCapacity : 1;

      queueLogger.debug('Evaluating worker scaling', {
        currentWorkerCount,
        currentCapacity,
        queueDepth: metrics.queueDepth,
        queueUtilization,
        scaleUpThreshold: this.scalingConfig.scaleUpThreshold,
        scaleDownThreshold: this.scalingConfig.scaleDownThreshold
      });

      // Determine scaling action
      let action: WorkerScalingDecision['action'] = 'maintain';
      let targetWorkerCount = currentWorkerCount;
      let reason = 'Queue utilization within normal range';

      // Scale up conditions
      if (queueUtilization > this.scalingConfig.scaleUpThreshold && 
          currentWorkerCount < this.scalingConfig.maxWorkers) {
        action = 'scale_up';
        targetWorkerCount = Math.min(
          currentWorkerCount + 1,
          this.scalingConfig.maxWorkers,
          Math.ceil(metrics.queueDepth / this.scalingConfig.maxJobsPerWorker)
        );
        reason = `Queue utilization ${(queueUtilization * 100).toFixed(1)}% exceeds ${(this.scalingConfig.scaleUpThreshold * 100)}% threshold`;
      }
      // Scale down conditions
      else if (queueUtilization < this.scalingConfig.scaleDownThreshold && 
               currentWorkerCount > this.scalingConfig.minWorkers &&
               Date.now() - this.lastScaleDown > this.scalingConfig.scaleDownDelayMs) {
        action = 'scale_down';
        targetWorkerCount = Math.max(
          currentWorkerCount - 1,
          this.scalingConfig.minWorkers,
          Math.ceil(metrics.queueDepth / this.scalingConfig.maxJobsPerWorker)
        );
        reason = `Queue utilization ${(queueUtilization * 100).toFixed(1)}% below ${(this.scalingConfig.scaleDownThreshold * 100)}% threshold for sufficient time`;
      }

      // Generate recommended action
      let recommendedAction = 'Continue monitoring';
      if (action === 'scale_up') {
        recommendedAction = `Add ${targetWorkerCount - currentWorkerCount} worker(s) to handle increased load`;
      } else if (action === 'scale_down') {
        recommendedAction = `Remove ${currentWorkerCount - targetWorkerCount} worker(s) to optimize resource usage`;
      }

      const decision: WorkerScalingDecision = {
        action,
        targetWorkerCount,
        currentWorkerCount,
        reason,
        queueUtilization,
        recommendedAction
      };

      // Execute scaling if needed
      if (action !== 'maintain') {
        await this.executeScaling(decision);
      }

      // Record scaling metrics
      monitoring.recordValue('queue.worker_count', currentWorkerCount);
      monitoring.recordValue('queue.utilization', queueUtilization);
      monitoring.incrementCounter('queue.scaling_evaluation', 1, {
        action,
        current_workers: String(currentWorkerCount),
        target_workers: String(targetWorkerCount)
      });

      return decision;

    } catch (error) {
      queueLogger.error('Failed to scale workers', {
        error: error.message
      });

      return {
        action: 'maintain',
        targetWorkerCount: this.workers.length,
        currentWorkerCount: this.workers.length,
        reason: `Scaling evaluation failed: ${error.message}`,
        queueUtilization: 0,
        recommendedAction: 'Check system health and retry'
      };
    }
  }

  /**
   * Execute worker scaling decision
   */
  private static async executeScaling(decision: WorkerScalingDecision): Promise<void> {
    try {
      const { action, targetWorkerCount, currentWorkerCount } = decision;

      queueLogger.info('Executing worker scaling', {
        action,
        currentWorkerCount,
        targetWorkerCount,
        reason: decision.reason
      });

      if (action === 'scale_up') {
        // Add workers
        const workersToAdd = targetWorkerCount - currentWorkerCount;
        for (let i = 0; i < workersToAdd; i++) {
          const worker = new JobWorker({
            maxConcurrentJobs: this.scalingConfig.maxJobsPerWorker,
            batchSize: 5,
            pollingIntervalMs: 5000,
            timeoutMs: 700000
          });
          
          await worker.start();
          this.workers.push(worker);
          
          queueLogger.info('Started additional worker', {
            workerId: worker.getStatus().workerId,
            totalWorkers: this.workers.length
          });
        }
      } else if (action === 'scale_down') {
        // Remove workers
        const workersToRemove = currentWorkerCount - targetWorkerCount;
        for (let i = 0; i < workersToRemove; i++) {
          const worker = this.workers.pop();
          if (worker) {
            await worker.stop();
            
            queueLogger.info('Stopped worker for scaling down', {
              workerId: worker.getStatus().workerId,
              totalWorkers: this.workers.length
            });
          }
        }
        
        this.lastScaleDown = Date.now();
      }

      monitoring.incrementCounter('queue.scaling_executed', 1, {
        action,
        workers_changed: String(Math.abs(targetWorkerCount - currentWorkerCount))
      });

    } catch (error) {
      queueLogger.error('Failed to execute worker scaling', {
        action: decision.action,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start automatic queue monitoring and scaling
   */
  static async startMonitoring(config: Partial<ScalingConfig> = {}): Promise<void> {
    if (this.isMonitoring) {
      queueLogger.warn('Queue monitoring already running');
      return;
    }

    // Merge with default config
    this.scalingConfig = { ...this.DEFAULT_CONFIG, ...config };
    this.isMonitoring = true;

    // Initialize with minimum workers
    if (this.workers.length === 0) {
      const initialWorker = getJobWorker();
      await initialWorker.start();
      this.workers.push(initialWorker);
    }

    queueLogger.info('Starting queue monitoring and scaling', {
      config: this.scalingConfig,
      initialWorkerCount: this.workers.length
    });

    // Start monitoring loop
    this.monitoringLoop();
  }

  /**
   * Stop automatic queue monitoring and scaling
   */
  static async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    queueLogger.info('Stopping queue monitoring and scaling');

    // Stop all workers except the first one (keep minimum)
    while (this.workers.length > 1) {
      const worker = this.workers.pop();
      if (worker) {
        await worker.stop();
      }
    }
  }

  /**
   * Internal monitoring loop
   */
  private static async monitoringLoop(): Promise<void> {
    while (this.isMonitoring) {
      try {
        await this.scaleWorkers();
        await this.sleep(this.scalingConfig.evaluationIntervalMs);
      } catch (error) {
        queueLogger.error('Error in monitoring loop', {
          error: error.message
        });
        await this.sleep(this.scalingConfig.evaluationIntervalMs * 2); // Back off on error
      }
    }
  }

  /**
   * Sleep utility
   */
  private static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current worker status
   */
  static getWorkerStatus(): Array<{
    workerId: string;
    isRunning: boolean;
    activeJobs: number;
    config: any;
  }> {
    return this.workers.map(worker => worker.getStatus());
  }

  /**
   * Get current scaling configuration
   */
  static getScalingConfig(): ScalingConfig {
    return { ...this.scalingConfig };
  }

  /**
   * Update scaling configuration
   */
  static updateScalingConfig(newConfig: Partial<ScalingConfig>): void {
    this.scalingConfig = { ...this.scalingConfig, ...newConfig };
    
    queueLogger.info('Updated scaling configuration', {
      newConfig: this.scalingConfig
    });
  }
}