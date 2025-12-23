/**
 * Timeout Monitor Service
 * 
 * Monitors for timeout patterns and generates admin alerts with business context
 * including ticker symbols, company names, and user impact analysis
 */

import { logger } from '../logging/index';
import { monitoring } from '../monitoring/index';
import { getPrismaClient } from '../db/prisma';
import { v4 as uuidv4 } from 'uuid';

const timeoutLogger = logger.child('timeout-monitor');
// Lazy accessor to avoid build-time initialization
const getPrisma = () => getPrismaClient();

export interface TimeoutJobInfo {
  jobId: string;
  jobType: string;
  filingId?: string;
  ticker?: string;
  companyName?: string;
  formType?: string;
  userId?: string;
  startedAt: Date;
  runningTimeMinutes: number;
  lastError?: string;
  progressPhase?: string;
  progressPercentage?: number;
  subscribedUsers?: number;
}

export interface AdminAlert {
  alertId: string;
  alertType: 'JOB_TIMEOUT' | 'QUEUE_OVERLOAD' | 'HIGH_COST';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  businessContext: {
    ticker?: string;
    companyName?: string;
    formType?: string;
    usersAffected?: number;
    subscriberCount?: number;
    potentialRevenueLoss?: number;
  };
  technicalDetails: {
    jobId?: string;
    runningTimeMinutes?: number;
    queueDepth?: number;
    cost?: number;
    errorMessage?: string;
    suggestedActions?: string[];
  };
  timestamp: Date;
  adminEmail: string;
}

export interface TimeoutCauseAnalysis {
  primaryCause: string;
  confidence: number;
  contributingFactors: string[];
  recommendedActions: string[];
  similarIncidents: number;
}

/**
 * Timeout Monitor Service
 * Detects timeout conditions and generates actionable admin alerts
 */
export class TimeoutMonitorService {
  private static readonly TIMEOUT_THRESHOLD_MS = 600000; // 10 minutes
  private static readonly QUEUE_OVERLOAD_THRESHOLD = 20; // 20+ jobs
  private static readonly HIGH_COST_THRESHOLD = 1.00; // $1.00
  private static readonly ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'wilfred.chen.python@gmail.com';

  /**
   * Flag timeout jobs and generate admin alerts
   */
  static async flagTimeoutJobs(): Promise<AdminAlert[]> {
    try {
      const tenMinutesAgo = new Date(Date.now() - this.TIMEOUT_THRESHOLD_MS);
      const alerts: AdminAlert[] = [];

      // Find jobs running longer than threshold
      const timeoutJobs = await getPrisma().jobQueue.findMany({
        where: {
          status: {
            in: ['PENDING', 'PROCESSING']
          },
          startedAt: {
            lte: tenMinutesAgo
          },
          timeoutFlagged: false
        },
        include: {
          progress: {
            orderBy: { updatedAt: 'desc' },
            take: 1
          }
        }
      });

      for (const job of timeoutJobs) {
        // Extract business context from job payload
        const jobInfo = await this.extractJobBusinessContext(job);
        
        // Analyze timeout cause
        const causeAnalysis = await this.analyzeTimeoutCause(job);
        
        // Generate admin alert
        const alert = await this.generateTimeoutAlert(jobInfo, causeAnalysis);
        alerts.push(alert);

        // Flag the job to prevent duplicate alerts
        await getPrisma().jobQueue.update({
          where: { id: job.id },
          data: { 
            timeoutFlagged: true,
            lastError: `Timeout detected after ${this.TIMEOUT_THRESHOLD_MS / 60000} minutes - Admin alerted`
          }
        });

        timeoutLogger.warn('Job timeout detected and flagged', {
          jobId: job.id,
          jobType: job.jobType,
          runningTimeMinutes: jobInfo.runningTimeMinutes,
          ticker: jobInfo.ticker,
          usersAffected: jobInfo.subscribedUsers
        });
      }

      // Check for queue overload condition
      const queueDepth = await this.getQueueDepth();
      if (queueDepth >= this.QUEUE_OVERLOAD_THRESHOLD) {
        const overloadAlert = await this.generateQueueOverloadAlert(queueDepth);
        alerts.push(overloadAlert);
      }

      // Send alerts via email if any were generated
      if (alerts.length > 0) {
        await this.sendAdminAlerts(alerts);
      }

      return alerts;

    } catch (error) {
      timeoutLogger.error('Failed to flag timeout jobs', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Extract business context from job payload
   */
  private static async extractJobBusinessContext(job: any): Promise<TimeoutJobInfo> {
    try {
      const payload = job.payload || {};
      const runningTimeMinutes = job.startedAt 
        ? (Date.now() - job.startedAt.getTime()) / 60000 
        : 0;

      // Extract ticker and filing info from payload
      const ticker = payload.ticker || payload.symbol;
      const filingId = payload.filingId || payload.accessionNumber;
      const formType = payload.formType || payload.filingType;
      const userId = payload.userId;

      let companyName: string | undefined;
      let subscribedUsers: number | undefined;

      // Get company name and subscriber count if ticker is available
      if (ticker) {
        try {
          // Get company name from CikMapping
          const cikMapping = await getPrisma().cikMapping.findFirst({
            where: { ticker },
            select: { companyName: true }
          });
          companyName = cikMapping?.companyName;

          // Count users subscribed to this ticker
          const tickerSubscribers = await getPrisma().ticker.count({
            where: { symbol: ticker }
          });
          subscribedUsers = tickerSubscribers;

        } catch (error) {
          timeoutLogger.debug('Could not fetch company context', {
            ticker,
            error: error.message
          });
        }
      }

      // Get progress information
      const lastProgress = job.progress?.[0];
      const progressPhase = lastProgress?.phase;
      const progressPercentage = lastProgress?.progress;

      return {
        jobId: job.id,
        jobType: job.jobType,
        filingId,
        ticker,
        companyName,
        formType,
        userId,
        startedAt: job.startedAt,
        runningTimeMinutes,
        lastError: job.lastError,
        progressPhase,
        progressPercentage,
        subscribedUsers
      };

    } catch (error) {
      timeoutLogger.error('Failed to extract job business context', {
        jobId: job.id,
        error: error.message
      });

      return {
        jobId: job.id,
        jobType: job.jobType,
        startedAt: job.startedAt,
        runningTimeMinutes: job.startedAt 
          ? (Date.now() - job.startedAt.getTime()) / 60000 
          : 0
      };
    }
  }

  /**
   * Analyze potential timeout causes
   */
  private static async analyzeTimeoutCause(job: any): Promise<TimeoutCauseAnalysis> {
    try {
      const payload = job.payload || {};
      const lastError = job.lastError || '';
      
      // Common timeout patterns
      const causes = [
        {
          pattern: /large.*file|size.*exceed|content.*too.*big/i,
          cause: 'Large filing size exceeding processing capacity',
          confidence: 0.8,
          actions: ['Implement content chunking', 'Add file size pre-check', 'Use streaming processing']
        },
        {
          pattern: /network.*timeout|connection.*reset|fetch.*failed/i,
          cause: 'Network connectivity issues with SEC servers',
          confidence: 0.7,
          actions: ['Retry with exponential backoff', 'Check SEC server status', 'Use alternative endpoints']
        },
        {
          pattern: /ai.*timeout|model.*timeout|openrouter.*timeout/i,
          cause: 'AI model processing timeout',
          confidence: 0.9,
          actions: ['Increase AI timeout limits', 'Use faster model variant', 'Implement content preprocessing']
        },
        {
          pattern: /memory|out.*of.*memory|heap/i,
          cause: 'Memory exhaustion during processing',
          confidence: 0.8,
          actions: ['Increase memory allocation', 'Optimize memory usage', 'Process in smaller chunks']
        },
        {
          pattern: /database.*timeout|query.*timeout|connection.*pool/i,
          cause: 'Database connection or query timeout',
          confidence: 0.7,
          actions: ['Optimize database queries', 'Check connection pool', 'Add query timeouts']
        }
      ];

      // Find matching cause
      let primaryCause = 'Unknown timeout cause';
      let confidence = 0.3;
      let recommendedActions = ['Review job logs', 'Check system resources', 'Increase timeout limits'];

      for (const causePattern of causes) {
        if (causePattern.pattern.test(lastError) || causePattern.pattern.test(JSON.stringify(payload))) {
          primaryCause = causePattern.cause;
          confidence = causePattern.confidence;
          recommendedActions = causePattern.actions;
          break;
        }
      }

      // Check for similar incidents in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const similarIncidents = await getPrisma().jobQueue.count({
        where: {
          jobType: job.jobType,
          timeoutFlagged: true,
          createdAt: {
            gte: oneDayAgo
          }
        }
      });

      // Contributing factors based on job context
      const contributingFactors: string[] = [];
      
      if (payload.formType === '10-K') {
        contributingFactors.push('10-K forms are typically larger and more complex');
      }
      if (similarIncidents > 3) {
        contributingFactors.push('Multiple similar timeouts in the last 24 hours');
      }
      if (job.retryCount > 0) {
        contributingFactors.push('Previous retry attempts also failed');
      }

      return {
        primaryCause,
        confidence,
        contributingFactors,
        recommendedActions,
        similarIncidents
      };

    } catch (error) {
      timeoutLogger.error('Failed to analyze timeout cause', {
        jobId: job.id,
        error: error.message
      });

      return {
        primaryCause: 'Unable to determine timeout cause',
        confidence: 0.1,
        contributingFactors: ['Analysis failed'],
        recommendedActions: ['Check system health', 'Review error logs'],
        similarIncidents: 0
      };
    }
  }

  /**
   * Generate timeout admin alert with business context
   */
  private static async generateTimeoutAlert(
    jobInfo: TimeoutJobInfo, 
    causeAnalysis: TimeoutCauseAnalysis
  ): Promise<AdminAlert> {
    const alertId = uuidv4();
    
    // Determine severity based on business impact
    let severity: AdminAlert['severity'] = 'LOW';
    if (jobInfo.subscribedUsers && jobInfo.subscribedUsers > 50) {
      severity = 'HIGH';
    } else if (jobInfo.subscribedUsers && jobInfo.subscribedUsers > 10) {
      severity = 'MEDIUM';
    }
    if (causeAnalysis.similarIncidents > 5) {
      severity = 'CRITICAL';
    }

    // Calculate potential revenue impact (rough estimate)
    const avgRevenuePerUser = 10; // $10 monthly
    const potentialRevenueLoss = (jobInfo.subscribedUsers || 0) * avgRevenuePerUser * 0.1; // 10% churn risk

    const title = jobInfo.ticker 
      ? `Filing Processing Timeout: ${jobInfo.ticker} ${jobInfo.formType || 'Filing'}`
      : `Job Timeout: ${jobInfo.jobType}`;

    const description = `
A ${jobInfo.jobType} job has been running for ${jobInfo.runningTimeMinutes.toFixed(1)} minutes and exceeded the timeout threshold.

Business Impact:
- Company: ${jobInfo.companyName || jobInfo.ticker || 'Unknown'}
- Filing Type: ${jobInfo.formType || 'Unknown'}
- Users Affected: ${jobInfo.subscribedUsers || 0}
- Potential Revenue at Risk: $${potentialRevenueLoss.toFixed(2)}

Technical Analysis:
- Primary Cause: ${causeAnalysis.primaryCause} (${(causeAnalysis.confidence * 100).toFixed(0)}% confidence)
- Contributing Factors: ${causeAnalysis.contributingFactors.join(', ') || 'None identified'}
- Similar Incidents (24h): ${causeAnalysis.similarIncidents}

Current Status:
- Job Phase: ${jobInfo.progressPhase || 'Unknown'}
- Progress: ${jobInfo.progressPercentage || 0}%
- Last Error: ${jobInfo.lastError || 'None'}

Recommended Actions:
${causeAnalysis.recommendedActions.map(action => `- ${action}`).join('\n')}
`;

    return {
      alertId,
      alertType: 'JOB_TIMEOUT',
      severity,
      title,
      description,
      businessContext: {
        ticker: jobInfo.ticker,
        companyName: jobInfo.companyName,
        formType: jobInfo.formType,
        usersAffected: jobInfo.subscribedUsers,
        subscriberCount: jobInfo.subscribedUsers,
        potentialRevenueLoss
      },
      technicalDetails: {
        jobId: jobInfo.jobId,
        runningTimeMinutes: jobInfo.runningTimeMinutes,
        errorMessage: jobInfo.lastError,
        suggestedActions: causeAnalysis.recommendedActions
      },
      timestamp: new Date(),
      adminEmail: this.ADMIN_EMAIL
    };
  }

  /**
   * Generate queue overload alert
   */
  private static async generateQueueOverloadAlert(queueDepth: number): Promise<AdminAlert> {
    const alertId = uuidv4();
    
    // Get job type breakdown
    const jobTypeBreakdown = await getPrisma().jobQueue.groupBy({
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

    const breakdown = jobTypeBreakdown
      .map(group => `${group.jobType}: ${group._count.id}`)
      .join(', ');

    const title = `Queue Overload Alert: ${queueDepth} Jobs Queued`;
    
    const description = `
The job queue has exceeded the overload threshold with ${queueDepth} jobs currently pending or processing.

Queue Breakdown:
${breakdown}

This may indicate:
- High volume of SEC filings requiring processing
- Performance bottleneck in job processing
- Potential system capacity issues

Recommended Actions:
- Scale up worker capacity
- Review job processing efficiency
- Consider implementing job prioritization
- Monitor system resources
`;

    return {
      alertId,
      alertType: 'QUEUE_OVERLOAD',
      severity: queueDepth > 50 ? 'CRITICAL' : 'HIGH',
      title,
      description,
      businessContext: {
        usersAffected: queueDepth // Approximate impact
      },
      technicalDetails: {
        queueDepth,
        suggestedActions: [
          'Scale up worker capacity',
          'Review job processing efficiency',
          'Implement job prioritization',
          'Monitor system resources'
        ]
      },
      timestamp: new Date(),
      adminEmail: this.ADMIN_EMAIL
    };
  }

  /**
   * Send admin alerts via email
   */
  private static async sendAdminAlerts(alerts: AdminAlert[]): Promise<void> {
    try {
      // Use lazy loading to avoid import issues
      const { getNotificationService } = await import('../email/index');
      const notificationService = await getNotificationService();

      for (const alert of alerts) {
        // Send email to admin
        await notificationService.sendAdminAlert({
          to: alert.adminEmail,
          subject: alert.title,
          content: alert.description,
          severity: alert.severity,
          alertType: alert.alertType,
          businessContext: alert.businessContext,
          technicalDetails: alert.technicalDetails
        });

        timeoutLogger.info('Admin alert sent', {
          alertId: alert.alertId,
          alertType: alert.alertType,
          severity: alert.severity,
          adminEmail: alert.adminEmail
        });

        monitoring.incrementCounter('admin_alerts.sent', 1, {
          alert_type: alert.alertType,
          severity: alert.severity
        });
      }

    } catch (error) {
      timeoutLogger.error('Failed to send admin alerts', {
        alertCount: alerts.length,
        error: error.message
      });
    }
  }

  /**
   * Get current queue depth
   */
  private static async getQueueDepth(): Promise<number> {
    try {
      return await getPrisma().jobQueue.count({
        where: {
          status: {
            in: ['PENDING', 'PROCESSING']
          }
        }
      });
    } catch (error) {
      timeoutLogger.error('Failed to get queue depth', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Check for high-cost operations and generate alerts
   */
  static async checkHighCostOperations(): Promise<AdminAlert[]> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const alerts: AdminAlert[] = [];

      // Find high-cost jobs
      const expensiveJobs = await getPrisma().jobQueue.findMany({
        where: {
          costUSD: {
            gte: this.HIGH_COST_THRESHOLD
          },
          completedAt: {
            gte: oneHourAgo
          }
        },
        orderBy: {
          costUSD: 'desc'
        },
        take: 10
      });

      for (const job of expensiveJobs) {
        const jobInfo = await this.extractJobBusinessContext(job);
        const alert = await this.generateHighCostAlert(jobInfo, Number(job.costUSD));
        alerts.push(alert);
      }

      if (alerts.length > 0) {
        await this.sendAdminAlerts(alerts);
      }

      return alerts;

    } catch (error) {
      timeoutLogger.error('Failed to check high-cost operations', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Generate high-cost alert
   */
  private static async generateHighCostAlert(
    jobInfo: TimeoutJobInfo, 
    cost: number
  ): Promise<AdminAlert> {
    const alertId = uuidv4();
    
    const title = `High Cost Alert: $${cost.toFixed(2)} - ${jobInfo.ticker || jobInfo.jobType}`;
    
    const description = `
A job has incurred unusually high costs of $${cost.toFixed(2)}, exceeding the threshold of $${this.HIGH_COST_THRESHOLD}.

Business Context:
- Company: ${jobInfo.companyName || jobInfo.ticker || 'Unknown'}
- Filing Type: ${jobInfo.formType || 'Unknown'}
- Users Affected: ${jobInfo.subscribedUsers || 0}

Technical Details:
- Job Type: ${jobInfo.jobType}
- Job ID: ${jobInfo.jobId}
- Processing Time: ${jobInfo.runningTimeMinutes.toFixed(1)} minutes

Recommended Actions:
- Review cost optimization strategies
- Consider using cheaper model variants
- Implement cost controls and limits
- Analyze content complexity for this filing
`;

    return {
      alertId,
      alertType: 'HIGH_COST',
      severity: cost > 5.0 ? 'CRITICAL' : 'HIGH',
      title,
      description,
      businessContext: {
        ticker: jobInfo.ticker,
        companyName: jobInfo.companyName,
        formType: jobInfo.formType,
        usersAffected: jobInfo.subscribedUsers
      },
      technicalDetails: {
        jobId: jobInfo.jobId,
        cost,
        runningTimeMinutes: jobInfo.runningTimeMinutes,
        suggestedActions: [
          'Review cost optimization strategies',
          'Use cheaper model variants',
          'Implement cost controls',
          'Analyze content complexity'
        ]
      },
      timestamp: new Date(),
      adminEmail: this.ADMIN_EMAIL
    };
  }
}