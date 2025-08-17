import { getPrismaClient } from '../db/prisma';
import { logger } from '../logging';
import { v4 as uuidv4 } from 'uuid';
import { 
  CronJobStatus,
  CronTriggerSource,
  CronExecutionMetrics,
  FilingProcessingMetrics,
  CronExecutionResult,
  MonitoringConfig
} from '../../types/cron';

const prisma = getPrismaClient();
const cronLogger = logger.child('cron-monitor');

// Import interfaces from centralized types - removing local duplicates
// All metrics interfaces are now imported from types/cron.ts

export class CronJobMonitor {
  private executionId: string;
  private jobName: string;
  private startTime: Date;
  private metrics: CronExecutionMetrics;
  private initialized: boolean = false;
  private initializationPromise: Promise<void>;

  constructor(jobName: string, triggerSource: CronTriggerSource = 'VERCEL_CRON') {
    this.executionId = uuidv4();
    this.jobName = jobName;
    this.startTime = new Date();
    this.metrics = {
      tickersChecked: 0,
      newFilingsFound: 0,
      filingsProcessed: 0,
      emailsSent: 0,
      usersNotified: 0,
      totalCostUSD: 0,
      aiCostUSD: 0,
      emailCostUSD: 0,
      tokensUsed: 0,
      errorCount: 0,
      warningCount: 0
    };

    this.initializationPromise = this.initializeExecution(triggerSource);
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initializationPromise;
    }
  }

  private async initializeExecution(triggerSource: string) {
    try {
      await prisma.cronJobExecution.create({
        data: {
          jobName: this.jobName,
          executionId: this.executionId,
          status: CronJobStatus.STARTED,
          startedAt: this.startTime,
          environment: process.env.NODE_ENV || 'development',
          tickersChecked: this.metrics.tickersChecked,
          newFilingsFound: this.metrics.newFilingsFound,
          filingsProcessed: this.metrics.filingsProcessed,
          emailsSent: this.metrics.emailsSent,
          errorsCount: this.metrics.errorCount
        }
      });

      this.initialized = true;
      cronLogger.info(`Started cron job monitoring`, {
        executionId: this.executionId,
        jobName: this.jobName,
        triggerSource,
        startTime: this.startTime
      });
    } catch (error) {
      cronLogger.error('Failed to initialize cron job execution tracking', { error });
      this.initialized = false;
    }
  }

  async updateMetrics(updates: Partial<CronExecutionMetrics>) {
    Object.assign(this.metrics, updates);
    
    try {
      await this.ensureInitialized();
      
      if (!this.initialized) {
        cronLogger.warn('Skipping metrics update - initialization failed', { executionId: this.executionId });
        return;
      }
      
      const updateData: any = {};
      if (updates.tickersChecked !== undefined) updateData.tickersChecked = updates.tickersChecked;
      if (updates.newFilingsFound !== undefined) updateData.newFilingsFound = updates.newFilingsFound;
      if (updates.filingsProcessed !== undefined) updateData.filingsProcessed = updates.filingsProcessed;
      if (updates.emailsSent !== undefined) updateData.emailsSent = updates.emailsSent;
      if (updates.errorCount !== undefined) updateData.errorsCount = updates.errorCount;
      
      await prisma.cronJobExecution.update({
        where: { executionId: this.executionId },
        data: updateData
      });
    } catch (error) {
      cronLogger.error('Failed to update cron job metrics', { error, executionId: this.executionId });
    }
  }

  async recordFilingProcessing(filing: FilingProcessingMetrics, status: string) {
    try {
      // For now, just log the filing processing - we can add detailed logging later
      cronLogger.debug('Recording filing processing', {
        accessionNumber: filing.accessionNumber,
        ticker: filing.ticker,
        status
      });

      // Update execution metrics
      await this.updateMetrics({
        filingsProcessed: this.metrics.filingsProcessed + 1,
        emailsSent: this.metrics.emailsSent + filing.emailsSent
      });

    } catch (error) {
      cronLogger.error('Failed to record filing processing', { error, filing });
      await this.updateMetrics({ errorCount: this.metrics.errorCount + 1 });
    }
  }

  async recordUserNotification(
    userId: string, 
    userEmail: string, 
    ticker: string,
    deliveryStatus: string,
    deliveryCostUSD: number = 0
  ) {
    try {
      cronLogger.debug('Recording user notification', {
        userId,
        ticker,
        deliveryStatus
      });

      // Update execution metrics
      await this.updateMetrics({
        usersNotified: this.metrics.usersNotified + 1
      });

    } catch (error) {
      cronLogger.error('Failed to record user notification', { error, userId, ticker });
      await this.updateMetrics({ errorCount: this.metrics.errorCount + 1 });
    }
  }

  async recordMetric(metricName: string, value: any) {
    try {
      cronLogger.debug('Recording metric', { metricName, value });
      
      // For now, just log metrics - we can store them in the future if needed
      if (typeof value === 'object') {
        cronLogger.info(`Metric: ${metricName}`, value);
      } else {
        cronLogger.info(`Metric: ${metricName} = ${value}`);
      }
    } catch (error) {
      cronLogger.error('Failed to record metric', { error, metricName, value });
    }
  }

  async complete(status: CronJobStatus, errorMessage?: string): Promise<CronExecutionResult> {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - this.startTime.getTime();

    try {
      await this.ensureInitialized();
      
      if (!this.initialized) {
        cronLogger.warn('Skipping completion update - initialization failed', { 
          executionId: this.executionId, 
          status,
          durationMs 
        });
        return {
          executionId: this.executionId,
          duration: durationMs,
          status,
          metrics: this.metrics
        } as CronExecutionResult;
      }
      
      await prisma.cronJobExecution.update({
        where: { executionId: this.executionId },
        data: {
          status,
          completedAt,
          durationMs,
          errorMessage,
          tickersChecked: this.metrics.tickersChecked,
          newFilingsFound: this.metrics.newFilingsFound,
          filingsProcessed: this.metrics.filingsProcessed,
          emailsSent: this.metrics.emailsSent,
          errorsCount: this.metrics.errorCount
        }
      });

      cronLogger.info(`Completed cron job monitoring`, {
        executionId: this.executionId,
        jobName: this.jobName,
        status,
        durationMs,
        metrics: this.metrics
      });

      return {
        executionId: this.executionId,
        duration: durationMs,
        status,
        metrics: this.metrics
      } as CronExecutionResult;

    } catch (error) {
      cronLogger.error('Failed to complete cron job execution tracking', { error });
      throw error;
    }
  }

  getExecutionId() {
    return this.executionId;
  }

  getCurrentMetrics() {
    return { ...this.metrics };
  }
}

// Utility functions for dashboard queries
export class CronJobAnalytics {
  
  static async getRecentExecutions(limit: number = 10) {
    return prisma.cronJobExecution.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        filingProcessingLogs: {
          select: {
            ticker: true,
            filingType: true,
            status: true,
            summaryCostUSD: true
          }
        },
        userNotificationLogs: {
          select: {
            deliveryStatus: true,
            deliveryCostUSD: true
          }
        }
      }
    });
  }

  static async getDailyCostSummary(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return prisma.cronJobExecution.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: {
          gte: startDate
        },
        status: CronJobStatus.SUCCESS
      },
      _sum: {
        totalCostUSD: true,
        aiCostUSD: true,
        emailCostUSD: true,
        tokensUsed: true
      },
      _count: {
        filingsProcessed: true,
        usersNotified: true
      }
    });
  }

  static async getTickerActivity(days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return prisma.filingProcessingLog.groupBy({
      by: ['ticker'],
      where: {
        processedAt: {
          gte: startDate
        }
      },
      _count: {
        id: true
      },
      _sum: {
        summaryCostUSD: true,
        emailsSent: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });
  }

  static async getCurrentJobStatus() {
    const runningJobs = await prisma.cronJobExecution.findMany({
      where: {
        status: CronJobStatus.STARTED
      },
      orderBy: { startedAt: 'desc' }
    });

    const lastCompletedJob = await prisma.cronJobExecution.findFirst({
      where: {
        status: { in: [CronJobStatus.SUCCESS, CronJobStatus.FAILED] }
      },
      orderBy: { completedAt: 'desc' }
    });

    return {
      runningJobs,
      lastCompletedJob,
      isHealthy: runningJobs.length === 0 && lastCompletedJob?.status === CronJobStatus.SUCCESS
    };
  }
}