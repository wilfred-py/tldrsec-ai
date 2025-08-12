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
          executionId: this.executionId, // The existing schema has this field
          jobName: this.jobName,
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
      await prisma.cronJobExecution.update({
        where: { id: this.executionId },
        data: {
          tickersChecked: this.metrics.tickersChecked,
          newFilingsFound: this.metrics.newFilingsFound,
          filingsProcessed: this.metrics.filingsProcessed,
          emailsSent: this.metrics.emailsSent,
          errorsCount: this.metrics.errorCount
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

    const finalStatus = status === 'COMPLETED' ? 'SUCCESS' : 'FAILED';

    try {
      await prisma.cronJobExecution.update({
        where: { id: this.executionId },
        data: {
          status: finalStatus,
          completedAt: endTime,
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
        status: finalStatus,
        durationMs,
        metrics: this.metrics
      });

      return {
        executionId: this.executionId,
        duration: durationMs,
        status: finalStatus,
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
        status: 'SUCCESS'
      },
      _sum: {
        filingsProcessed: true,
        emailsSent: true
      },
      _avg: {
        durationMs: true
      },
      _count: {
        id: true
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