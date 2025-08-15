import { getPrismaClient } from '../db/prisma';
import { logger } from '../logging';
import { v4 as uuidv4 } from 'uuid';

const prisma = getPrismaClient();
const cronLogger = logger.child('cron-monitor');

export interface CronExecutionMetrics {
  tickersChecked: number;
  newFilingsFound: number;
  filingsProcessed: number;
  emailsSent: number;
  usersNotified: number;
  totalCostUSD: number;
  aiCostUSD: number;
  emailCostUSD: number;
  tokensUsed: number;
  errorCount: number;
  warningCount: number;
}

export interface FilingProcessingMetrics {
  accessionNumber: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  processingTimeMs: number;
  summaryTokens: number;
  summaryCostUSD: number;
  aiModel: string;
  emailsSent: number;
}

export class CronJobMonitor {
  private executionId: string;
  private jobName: string;
  private startTime: Date;
  private metrics: CronExecutionMetrics;

  constructor(jobName: string, triggerSource: 'VERCEL_CRON' | 'RAILWAY_CRON' | 'MANUAL' | 'EXTERNAL' = 'VERCEL_CRON') {
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

    this.initializeExecution(triggerSource);
  }

  private async initializeExecution(triggerSource: string) {
    try {
      await prisma.cronJobExecution.create({
        data: {
          jobName: this.jobName,
          executionId: this.executionId,
          status: 'STARTED',
          startedAt: this.startTime,
          environment: process.env.NODE_ENV || 'development',
          tickersChecked: this.metrics.tickersChecked,
          newFilingsFound: this.metrics.newFilingsFound,
          filingsProcessed: this.metrics.filingsProcessed,
          emailsSent: this.metrics.emailsSent,
          errorsCount: this.metrics.errorCount
        }
      });

      cronLogger.info(`Started cron job monitoring`, {
        executionId: this.executionId,
        jobName: this.jobName,
        triggerSource,
        startTime: this.startTime
      });
    } catch (error) {
      cronLogger.error('Failed to initialize cron job execution tracking', { error });
    }
  }

  async updateMetrics(updates: Partial<CronExecutionMetrics>) {
    Object.assign(this.metrics, updates);
    
    try {
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

  async complete(status: 'SUCCESS' | 'FAILED' | 'TIMEOUT', errorMessage?: string) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - this.startTime.getTime();

    try {
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
      };

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
        status: 'COMPLETED'
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
        status: 'STARTED'
      },
      orderBy: { startedAt: 'desc' }
    });

    const lastCompletedJob = await prisma.cronJobExecution.findFirst({
      where: {
        status: { in: ['SUCCESS', 'FAILED'] }
      },
      orderBy: { completedAt: 'desc' }
    });

    return {
      runningJobs,
      lastCompletedJob,
      isHealthy: runningJobs.length === 0 && lastCompletedJob?.status === 'SUCCESS'
    };
  }
}