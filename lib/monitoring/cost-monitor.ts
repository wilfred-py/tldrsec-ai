/**
 * Cost Monitor Service
 * 
 * Tracks OpenRouter API costs and generates immediate alerts for high-cost operations
 * Provides token usage analytics and cost optimization insights
 */

import { logger } from '../logging/index';
import { monitoring } from '../monitoring/index';
import { getPrismaClient } from '../db/prisma';
import { getDefaultModel, getFallbackModel } from '../ai/config';
import { v4 as uuidv4 } from 'uuid';

const costLogger = logger.child('cost-monitor');
// Lazy accessor to avoid build-time initialization
const getPrisma = () => getPrismaClient();

export interface ApiCallCost {
  callId: string;
  jobId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUSD: number;
  outputCostUSD: number;
  totalCostUSD: number;
  requestTime: Date;
  responseTime: Date;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

export interface CostAlert {
  alertId: string;
  jobId?: string;
  model: string;
  costUSD: number;
  threshold: number;
  tokensUsed: number;
  timestamp: Date;
  businessContext?: {
    ticker?: string;
    companyName?: string;
    formType?: string;
    usersAffected?: number;
  };
  recommendedActions: string[];
}

export interface CostAnalytics {
  totalCostToday: number;
  totalCostThisMonth: number;
  averageCostPerJob: number;
  costTrend: 'increasing' | 'decreasing' | 'stable';
  topCostlyOperations: Array<{
    jobType: string;
    averageCost: number;
    totalJobs: number;
    totalCost: number;
  }>;
  modelUsageBreakdown: Array<{
    model: string;
    callCount: number;
    totalCost: number;
    averageCost: number;
  }>;
  costEfficiencyMetrics: {
    tokensPerDollar: number;
    avgTokensPerJob: number;
    costPerSuccessfulJob: number;
  };
}

/**
 * Cost Monitor Service
 * Tracks API costs and provides real-time cost optimization insights
 */
export class CostMonitorService {
  private static readonly HIGH_COST_THRESHOLD = 1.00; // $1.00
  private static readonly ALERT_EMAIL = process.env.ADMIN_EMAIL || 'wilfred.chen.python@gmail.com';
  
  // xAI model pricing via OpenRouter (per million tokens) - using environment variables
  private static readonly MODEL_PRICING = {
    'x-ai/grok-4-fast-reasoning': {
      inputCost: parseFloat(process.env.XAI_GROK4_INPUT_COST || '0.30'),
      outputCost: parseFloat(process.env.XAI_GROK4_OUTPUT_COST || '0.50')
    },
    'x-ai/grok-code-fast-1': {
      inputCost: parseFloat(process.env.XAI_GROK2_INPUT_COST || '0.15'),
      outputCost: parseFloat(process.env.XAI_GROK2_OUTPUT_COST || '0.25')
    },
    'meta-llama/llama-3.1-405b-instruct:free': {
      inputCost: 0.0,    // Free
      outputCost: 0.0    // Free
    }
  };

  /**
   * Track an API call and calculate costs
   */
  static async trackApiCall(params: {
    jobId?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    requestTime: Date;
    responseTime: Date;
    success: boolean;
    errorMessage?: string;
  }): Promise<ApiCallCost> {
    try {
      const callId = uuidv4();
      const durationMs = params.responseTime.getTime() - params.requestTime.getTime();
      
      // Calculate costs based on model pricing
      const pricing = this.MODEL_PRICING[params.model] || this.MODEL_PRICING[getDefaultModel()] || this.MODEL_PRICING[getFallbackModel()];
      const inputCostUSD = (params.inputTokens / 1000000) * pricing.inputCost;
      const outputCostUSD = (params.outputTokens / 1000000) * pricing.outputCost;
      const totalCostUSD = inputCostUSD + outputCostUSD;

      const apiCall: ApiCallCost = {
        callId,
        jobId: params.jobId,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        inputCostUSD,
        outputCostUSD,
        totalCostUSD,
        requestTime: params.requestTime,
        responseTime: params.responseTime,
        durationMs,
        success: params.success,
        errorMessage: params.errorMessage
      };

      // Update job cost if jobId provided
      if (params.jobId && params.success) {
        await this.updateJobCost(params.jobId, apiCall);
      }

      // Record metrics
      monitoring.recordValue('api_cost.total_usd', totalCostUSD);
      monitoring.recordValue('api_cost.input_tokens', params.inputTokens);
      monitoring.recordValue('api_cost.output_tokens', params.outputTokens);
      monitoring.recordValue('api_cost.duration_ms', durationMs);
      monitoring.incrementCounter('api_cost.calls', 1, {
        model: params.model,
        success: String(params.success)
      });

      costLogger.info('API call cost tracked', {
        callId,
        jobId: params.jobId,
        model: params.model,
        totalCostUSD: totalCostUSD.toFixed(4),
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        durationMs,
        success: params.success
      });

      // Check for high cost threshold
      if (totalCostUSD >= this.HIGH_COST_THRESHOLD) {
        await this.handleHighCostAlert(apiCall);
      }

      return apiCall;

    } catch (error) {
      costLogger.error('Failed to track API call cost', {
        jobId: params.jobId,
        model: params.model,
        error: error.message
      });
      
      // Return minimal cost structure on error
      return {
        callId: uuidv4(),
        jobId: params.jobId,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        inputCostUSD: 0,
        outputCostUSD: 0,
        totalCostUSD: 0,
        requestTime: params.requestTime,
        responseTime: params.responseTime,
        durationMs: 0,
        success: false,
        errorMessage: error.message
      };
    }
  }

  /**
   * Update job with cost and token usage data
   */
  private static async updateJobCost(jobId: string, apiCall: ApiCallCost): Promise<void> {
    try {
      await getPrisma().jobQueue.update({
        where: { id: jobId },
        data: {
          costUSD: apiCall.totalCostUSD,
          tokenUsage: {
            model: apiCall.model,
            inputTokens: apiCall.inputTokens,
            outputTokens: apiCall.outputTokens,
            totalTokens: apiCall.inputTokens + apiCall.outputTokens,
            inputCostUSD: apiCall.inputCostUSD,
            outputCostUSD: apiCall.outputCostUSD,
            totalCostUSD: apiCall.totalCostUSD,
            durationMs: apiCall.durationMs,
            timestamp: apiCall.responseTime.toISOString()
          }
        }
      });

      costLogger.debug('Job cost updated', {
        jobId,
        totalCostUSD: apiCall.totalCostUSD.toFixed(4),
        totalTokens: apiCall.inputTokens + apiCall.outputTokens
      });

    } catch (error) {
      costLogger.error('Failed to update job cost', {
        jobId,
        error: error.message
      });
    }
  }

  /**
   * Handle high-cost alert generation and notification
   */
  private static async handleHighCostAlert(apiCall: ApiCallCost): Promise<void> {
    try {
      // Get business context if job ID is available
      let businessContext: CostAlert['businessContext'] | undefined;
      
      if (apiCall.jobId) {
        const job = await getPrisma().jobQueue.findUnique({
          where: { id: apiCall.jobId },
          select: { payload: true }
        });

        if (job?.payload) {
          const payload = job.payload as any;
          businessContext = await this.extractBusinessContext(payload);
        }
      }

      // Generate cost alert
      const alert: CostAlert = {
        alertId: uuidv4(),
        jobId: apiCall.jobId,
        model: apiCall.model,
        costUSD: apiCall.totalCostUSD,
        threshold: this.HIGH_COST_THRESHOLD,
        tokensUsed: apiCall.inputTokens + apiCall.outputTokens,
        timestamp: new Date(),
        businessContext,
        recommendedActions: this.generateCostOptimizationRecommendations(apiCall)
      };

      // Send immediate alert
      await this.sendCostAlert(alert);

      costLogger.warn('High-cost API call detected', {
        alertId: alert.alertId,
        jobId: apiCall.jobId,
        costUSD: apiCall.totalCostUSD.toFixed(4),
        threshold: this.HIGH_COST_THRESHOLD,
        model: apiCall.model,
        tokensUsed: alert.tokensUsed
      });

      monitoring.incrementCounter('cost_alerts.high_cost', 1, {
        model: apiCall.model,
        cost_range: this.getCostRange(apiCall.totalCostUSD)
      });

    } catch (error) {
      costLogger.error('Failed to handle high-cost alert', {
        jobId: apiCall.jobId,
        costUSD: apiCall.totalCostUSD,
        error: error.message
      });
    }
  }

  /**
   * Extract business context from job payload
   */
  private static async extractBusinessContext(payload: any): Promise<CostAlert['businessContext']> {
    try {
      const ticker = payload.ticker || payload.symbol;
      const formType = payload.formType || payload.filingType;
      
      if (!ticker) return undefined;

      // Get company name and subscriber count
      const [cikMapping, subscriberCount] = await Promise.all([
        prisma.cikMapping.findFirst({
          where: { ticker },
          select: { companyName: true }
        }),
        prisma.ticker.count({
          where: { symbol: ticker }
        })
      ]);

      return {
        ticker,
        companyName: cikMapping?.companyName,
        formType,
        usersAffected: subscriberCount
      };

    } catch (error) {
      costLogger.debug('Could not extract business context', {
        error: error.message
      });
      return undefined;
    }
  }

  /**
   * Generate cost optimization recommendations
   */
  private static generateCostOptimizationRecommendations(apiCall: ApiCallCost): string[] {
    const recommendations: string[] = [];
    
    // High token usage recommendations
    if (apiCall.inputTokens > 500000) { // > 500K input tokens
      recommendations.push('Consider implementing content preprocessing to reduce input token count');
      recommendations.push('Use document chunking to process large filings in smaller segments');
    }
    
    if (apiCall.outputTokens > 10000) { // > 10K output tokens
      recommendations.push('Review output requirements - consider more concise summary formats');
      recommendations.push('Implement output length controls in AI prompts');
    }

    // Model selection recommendations
    if (apiCall.model === getDefaultModel() && apiCall.totalCostUSD > 2.0) {
      recommendations.push(`Consider using ${getFallbackModel()} for less complex filings to reduce costs`);
      recommendations.push('Implement filing complexity analysis to choose appropriate model');
    }

    // Performance recommendations
    if (apiCall.durationMs > 300000) { // > 5 minutes
      recommendations.push('Long processing time suggests content optimization opportunities');
      recommendations.push('Consider parallel processing for multi-section documents');
    }

    // Default recommendations if none specific
    if (recommendations.length === 0) {
      recommendations.push('Review input content for optimization opportunities');
      recommendations.push('Consider using more cost-effective model variants');
      recommendations.push('Implement token usage monitoring and alerts');
    }

    return recommendations;
  }

  /**
   * Send cost alert email
   */
  private static async sendCostAlert(alert: CostAlert): Promise<void> {
    try {
      const { getNotificationService } = await import('../email/index');
      const notificationService = await getNotificationService();

      const subject = `High Cost Alert: $${alert.costUSD.toFixed(2)} - ${alert.businessContext?.ticker || alert.model}`;
      
      const content = `
A high-cost API operation has been detected, exceeding the $${alert.threshold} threshold.

Cost Details:
- Total Cost: $${alert.costUSD.toFixed(4)}
- Model: ${alert.model}
- Tokens Used: ${alert.tokensUsed.toLocaleString()}
- Threshold: $${alert.threshold}

${alert.businessContext ? `
Business Context:
- Company: ${alert.businessContext.companyName || alert.businessContext.ticker || 'Unknown'}
- Filing Type: ${alert.businessContext.formType || 'Unknown'}
- Users Affected: ${alert.businessContext.usersAffected || 0}
` : ''}

Job Details:
- Job ID: ${alert.jobId || 'Not specified'}
- Timestamp: ${alert.timestamp.toISOString()}

Recommended Actions:
${alert.recommendedActions.map(action => `- ${action}`).join('\n')}

This alert was generated automatically to help monitor and optimize API costs.
`;

      await notificationService.sendAdminAlert({
        to: this.ALERT_EMAIL,
        subject,
        content,
        severity: 'HIGH',
        alertType: 'HIGH_COST',
        businessContext: alert.businessContext,
        technicalDetails: {
          cost: alert.costUSD,
          model: alert.model,
          tokensUsed: alert.tokensUsed,
          suggestedActions: alert.recommendedActions
        }
      });

      costLogger.info('Cost alert email sent', {
        alertId: alert.alertId,
        costUSD: alert.costUSD,
        adminEmail: this.ALERT_EMAIL
      });

    } catch (error) {
      costLogger.error('Failed to send cost alert email', {
        alertId: alert.alertId,
        error: error.message
      });
    }
  }

  /**
   * Get cost analytics for admin dashboard
   */
  static async getCostAnalytics(
    startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate: Date = new Date()
  ): Promise<CostAnalytics> {
    try {
      // Get jobs with cost data in the date range
      const jobsWithCosts = await getPrisma().jobQueue.findMany({
        where: {
          costUSD: { not: null },
          completedAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          jobType: true,
          costUSD: true,
          tokenUsage: true,
          completedAt: true,
          status: true
        }
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Calculate basic metrics
      const totalCostToday = jobsWithCosts
        .filter(job => job.completedAt && job.completedAt >= today)
        .reduce((sum, job) => sum + Number(job.costUSD || 0), 0);

      const totalCostThisMonth = jobsWithCosts
        .filter(job => job.completedAt && job.completedAt >= thisMonth)
        .reduce((sum, job) => sum + Number(job.costUSD || 0), 0);

      const successfulJobs = jobsWithCosts.filter(job => job.status === 'COMPLETED');
      const averageCostPerJob = successfulJobs.length > 0
        ? successfulJobs.reduce((sum, job) => sum + Number(job.costUSD || 0), 0) / successfulJobs.length
        : 0;

      // Analyze cost trend (compare last 7 days vs previous 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const lastWeekCost = jobsWithCosts
        .filter(job => job.completedAt && job.completedAt >= sevenDaysAgo)
        .reduce((sum, job) => sum + Number(job.costUSD || 0), 0);

      const previousWeekCost = jobsWithCosts
        .filter(job => job.completedAt && 
          job.completedAt >= fourteenDaysAgo && 
          job.completedAt < sevenDaysAgo)
        .reduce((sum, job) => sum + Number(job.costUSD || 0), 0);

      let costTrend: CostAnalytics['costTrend'] = 'stable';
      if (lastWeekCost > previousWeekCost * 1.1) {
        costTrend = 'increasing';
      } else if (lastWeekCost < previousWeekCost * 0.9) {
        costTrend = 'decreasing';
      }

      // Top costly operations by job type
      const jobTypeCosts = new Map<string, { totalCost: number; totalJobs: number }>();
      
      for (const job of successfulJobs) {
        const current = jobTypeCosts.get(job.jobType) || { totalCost: 0, totalJobs: 0 };
        current.totalCost += Number(job.costUSD || 0);
        current.totalJobs += 1;
        jobTypeCosts.set(job.jobType, current);
      }

      const topCostlyOperations = Array.from(jobTypeCosts.entries())
        .map(([jobType, data]) => ({
          jobType,
          averageCost: data.totalCost / data.totalJobs,
          totalJobs: data.totalJobs,
          totalCost: data.totalCost
        }))
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, 10);

      // Model usage breakdown
      const modelUsage = new Map<string, { callCount: number; totalCost: number }>();
      
      for (const job of jobsWithCosts) {
        if (job.tokenUsage && typeof job.tokenUsage === 'object') {
          const tokenData = job.tokenUsage as any;
          const model = tokenData.model || 'unknown';
          const current = modelUsage.get(model) || { callCount: 0, totalCost: 0 };
          current.callCount += 1;
          current.totalCost += Number(job.costUSD || 0);
          modelUsage.set(model, current);
        }
      }

      const modelUsageBreakdown = Array.from(modelUsage.entries())
        .map(([model, data]) => ({
          model,
          callCount: data.callCount,
          totalCost: data.totalCost,
          averageCost: data.totalCost / data.callCount
        }))
        .sort((a, b) => b.totalCost - a.totalCost);

      // Cost efficiency metrics
      const totalTokens = jobsWithCosts.reduce((sum, job) => {
        if (job.tokenUsage && typeof job.tokenUsage === 'object') {
          const tokenData = job.tokenUsage as any;
          return sum + (tokenData.totalTokens || 0);
        }
        return sum;
      }, 0);

      const totalCost = jobsWithCosts.reduce((sum, job) => sum + Number(job.costUSD || 0), 0);
      
      const costEfficiencyMetrics = {
        tokensPerDollar: totalCost > 0 ? totalTokens / totalCost : 0,
        avgTokensPerJob: successfulJobs.length > 0 ? totalTokens / successfulJobs.length : 0,
        costPerSuccessfulJob: successfulJobs.length > 0 ? totalCost / successfulJobs.length : 0
      };

      return {
        totalCostToday,
        totalCostThisMonth,
        averageCostPerJob,
        costTrend,
        topCostlyOperations,
        modelUsageBreakdown,
        costEfficiencyMetrics
      };

    } catch (error) {
      costLogger.error('Failed to get cost analytics', {
        error: error.message
      });

      // Return empty analytics on error
      return {
        totalCostToday: 0,
        totalCostThisMonth: 0,
        averageCostPerJob: 0,
        costTrend: 'stable',
        topCostlyOperations: [],
        modelUsageBreakdown: [],
        costEfficiencyMetrics: {
          tokensPerDollar: 0,
          avgTokensPerJob: 0,
          costPerSuccessfulJob: 0
        }
      };
    }
  }

  /**
   * Check cost threshold for a specific operation
   */
  static checkCostThreshold(costUSD: number, threshold: number = this.HIGH_COST_THRESHOLD): boolean {
    return costUSD >= threshold;
  }

  /**
   * Get cost range category for metrics
   */
  private static getCostRange(costUSD: number): string {
    if (costUSD < 0.10) return 'low';
    if (costUSD < 0.50) return 'medium';
    if (costUSD < 1.00) return 'high';
    if (costUSD < 5.00) return 'very_high';
    return 'extreme';
  }

  /**
   * Get current cost thresholds
   */
  static getCostThresholds(): { highCost: number; alertEmail: string } {
    return {
      highCost: this.HIGH_COST_THRESHOLD,
      alertEmail: this.ALERT_EMAIL
    };
  }

  /**
   * Update cost thresholds (for admin configuration)
   */
  static updateCostThresholds(newThreshold: number): void {
    if (newThreshold > 0 && newThreshold <= 10.0) {
      (this as any).HIGH_COST_THRESHOLD = newThreshold;
      
      costLogger.info('Cost threshold updated', {
        newThreshold,
        previousThreshold: this.HIGH_COST_THRESHOLD
      });
    } else {
      throw new Error('Cost threshold must be between $0.01 and $10.00');
    }
  }
}