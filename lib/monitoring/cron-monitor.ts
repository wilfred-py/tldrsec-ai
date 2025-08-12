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

  constructor(jobName: string, triggerSource: 'VERCEL_CRON' | 'MANUAL' | 'EXTERNAL' = 'VERCEL_CRON') {
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
          id: this.executionId,
          jobName: this.jobName,
          status: 'RUNNING',
          startTime: this.startTime,
          triggerSource,
          environment: process.env.NODE_ENV || 'development',
          ...this.metrics
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
      await prisma.cronJobExecution.update({
        where: { id: this.executionId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      cronLogger.error('Failed to update cron job metrics', { error, executionId: this.executionId });
    }
  }

  async recordFilingProcessing(filing: FilingProcessingMetrics, status: string) {
    try {
      await prisma.filingProcessingLog.create({
        data: {
          id: uuidv4(),
          cronJobExecutionId: this.executionId,
          accessionNumber: filing.accessionNumber,
          ticker: filing.ticker,
          companyName: filing.companyName,
          filingType: filing.filingType,
          filingDate: filing.filingDate,
          filingUrl: filing.filingUrl,
          status,
          processedAt: new Date(),
          processingTimeMs: filing.processingTimeMs,
          summaryGenerated: status === 'SUMMARIZED' || status === 'STORED',
          summaryTokens: filing.summaryTokens,
          summaryCostUSD: filing.summaryCostUSD,
          aiModel: filing.aiModel,
          emailsSent: filing.emailsSent
        }
      });

      // Update execution metrics
      await this.updateMetrics({
        filingsProcessed: this.metrics.filingsProcessed + 1,
        aiCostUSD: this.metrics.aiCostUSD + filing.summaryCostUSD,
        tokensUsed: this.metrics.tokensUsed + filing.summaryTokens,
        emailsSent: this.metrics.emailsSent + filing.emailsSent
      });

    } catch (error) {
      cronLogger.error('Failed to record filing processing', { error, filing });
      await this.updateMetrics({ errorCount: this.metrics.errorCount + 1 });
    }
  }

  async recordUserNotification(
    filingProcessingLogId: string, 
    userId: string, 
    userEmail: string, 
    ticker: string,
    deliveryStatus: string,
    deliveryCostUSD: number = 0
  ) {
    try {
      await prisma.userNotificationLog.create({
        data: {
          id: uuidv4(),
          cronJobExecutionId: this.executionId,
          filingProcessingLogId,
          userId,
          userEmail,
          ticker,
          notificationType: 'FILING_SUMMARY',
          deliveryStatus,
          sentAt: new Date(),
          deliveryCostUSD
        }
      });

      // Update execution metrics
      await this.updateMetrics({
        usersNotified: this.metrics.usersNotified + 1,
        emailCostUSD: this.metrics.emailCostUSD + deliveryCostUSD,
        totalCostUSD: this.metrics.totalCostUSD + deliveryCostUSD
      });

    } catch (error) {
      cronLogger.error('Failed to record user notification', { error, userId, ticker });
      await this.updateMetrics({ errorCount: this.metrics.errorCount + 1 });
    }
  }

  async recordHealthMetric(metricName: string, value: number, unit: string) {
    try {
      await prisma.cronJobHealthMetric.create({
        data: {
          id: uuidv4(),
          jobName: this.jobName,
          metricName,
          metricValue: value,
          metricUnit: unit,
          recordedAt: new Date(),
          cronJobExecutionId: this.executionId
        }
      });
    } catch (error) {
      cronLogger.error('Failed to record health metric', { error, metricName, value });
    }
  }

  async complete(status: 'COMPLETED' | 'FAILED' | 'TIMEOUT', errorMessage?: string) {
    const endTime = new Date();
    const durationMs = endTime.getTime() - this.startTime.getTime();

    try {
      await prisma.cronJobExecution.update({
        where: { id: this.executionId },
        data: {
          status,
          endTime,
          durationMs,
          errorMessage,
          totalCostUSD: this.metrics.aiCostUSD + this.metrics.emailCostUSD,
          updatedAt: new Date()
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