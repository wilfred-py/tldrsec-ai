/**
 * AI Cost Tracking Service
 * 
 * Tracks AI API costs per user and globally with budget enforcement
 * Provides cost analytics and budget violation alerts
 */

import { prisma } from '../db/connection';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { alertService } from '../monitoring/alert-service';
import { calculateCost } from './token-counter';

/**
 * Cost tracking types
 */
export interface CostTrackingEntry {
  id?: string;
  userId?: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  actualCost?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface BudgetConfig {
  dailyBudget: number;  // USD per day
  monthlyBudget: number; // USD per month
  userDailyBudget: number; // USD per user per day
  userMonthlyBudget: number; // USD per user per month
  alertThresholds: {
    warning: number; // Percentage (e.g., 0.8 for 80%)
    critical: number; // Percentage (e.g., 0.9 for 90%)
  };
}

export interface CostSummary {
  totalCost: number;
  dailyCost: number;
  monthlyCost: number;
  tokensUsed: number;
  requestCount: number;
  averageCostPerRequest: number;
  topModels: { model: string; cost: number; requests: number }[];
  topOperations: { operation: string; cost: number; requests: number }[];
}

export interface BudgetStatus {
  isWithinBudget: boolean;
  dailyUtilization: number; // Percentage of daily budget used
  monthlyUtilization: number; // Percentage of monthly budget used
  remainingDaily: number; // USD remaining today
  remainingMonthly: number; // USD remaining this month
  violationType?: 'daily' | 'monthly' | 'none';
  alertLevel?: 'warning' | 'critical' | 'none';
}

/**
 * Model pricing configuration
 */
export interface ModelPricing {
  inputCostPerToken: number;  // USD per input token
  outputCostPerToken: number; // USD per output token
}

/**
 * Default model pricing (can be overridden via environment variables).
 *
 * Single live entry: x-ai/grok-4.3 at the ≤200K-input tier ($1.25/$2.50/M).
 * Calls exceeding 200K tokens are billed at the higher tier ($2.50/$5.00/M);
 * use calculateCost() in token-counter.ts for tier-aware reporting.
 *
 * Legacy Claude entries are NOT used (the codebase fully migrated to xAI Grok)
 * but are kept here for backward-compat with stored cost-tracking rows that
 * may reference these slugs from the pre-migration era.
 */
const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'x-ai/grok-4.3': {
    inputCostPerToken: 0.00000125, // $1.25/M
    outputCostPerToken: 0.0000025  // $2.50/M
  },
  'claude-sonnet-4': {
    inputCostPerToken: 0.000003,
    outputCostPerToken: 0.000015
  },
  'claude-haiku-3.5': {
    inputCostPerToken: 0.00000025,
    outputCostPerToken: 0.00000125
  }
};

/**
 * AI Cost Tracker
 */
export class AICostTracker {
  private budgetConfig: BudgetConfig;
  private modelPricing: Record<string, ModelPricing>;

  constructor(budgetConfig?: Partial<BudgetConfig>) {
    this.budgetConfig = {
      dailyBudget: parseFloat(process.env.AI_DAILY_BUDGET || '100.0'),
      monthlyBudget: parseFloat(process.env.AI_MONTHLY_BUDGET || '3000.0'),
      userDailyBudget: parseFloat(process.env.AI_USER_DAILY_BUDGET || '10.0'),
      userMonthlyBudget: parseFloat(process.env.AI_USER_MONTHLY_BUDGET || '300.0'),
      alertThresholds: {
        warning: parseFloat(process.env.AI_BUDGET_WARNING_THRESHOLD || '0.8'),
        critical: parseFloat(process.env.AI_BUDGET_CRITICAL_THRESHOLD || '0.9')
      },
      ...budgetConfig
    };

    this.modelPricing = { ...DEFAULT_MODEL_PRICING };
    this.loadCustomModelPricing();
  }

  /**
   * Load custom model pricing from environment variables
   */
  private loadCustomModelPricing(): void {
    try {
      const customPricing = process.env.AI_MODEL_PRICING;
      if (customPricing) {
        const parsed = JSON.parse(customPricing);
        this.modelPricing = { ...this.modelPricing, ...parsed };
        logger.info('Custom model pricing loaded', {
          modelsCount: Object.keys(parsed).length
        });
      }
    } catch (error) {
      logger.error('Failed to parse custom model pricing', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Estimate cost for an AI operation before execution.
   *
   * For grok-4.3 (and any future grok-4.X.Y variant), routes through
   * token-counter.calculateCost() so tier-aware pricing is honored: requests
   * with >200K input tokens are billed at the high tier ($2.50/$5.00 per M)
   * instead of the low tier ($1.25/$2.50). Without this, large-filing chunked
   * summaries would under-report cost by 2x and silently skew the budget
   * alarms (AI_DAILY_BUDGET / AI_MONTHLY_BUDGET) — the exact failure mode
   * this migration is supposed to eliminate.
   *
   * Legacy/non-Grok models still use the flat per-token rate from modelPricing.
   */
  estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number = 0
  ): number {
    if (/grok-4\.3/.test(model)) {
      return calculateCost(inputTokens, outputTokens, model).totalCost;
    }

    const pricing = this.modelPricing[model];
    if (!pricing) {
      logger.warn('No pricing information for model, using default', {
        model,
        availableModels: Object.keys(this.modelPricing)
      });
      // Use average pricing as fallback
      const avgPricing = this.calculateAveragePricing();
      return (inputTokens * avgPricing.inputCostPerToken) + (outputTokens * avgPricing.outputCostPerToken);
    }

    return (inputTokens * pricing.inputCostPerToken) + (outputTokens * pricing.outputCostPerToken);
  }

  /**
   * Calculate average pricing across all models
   */
  private calculateAveragePricing(): ModelPricing {
    const models = Object.values(this.modelPricing);
    const inputAvg = models.reduce((sum, model) => sum + model.inputCostPerToken, 0) / models.length;
    const outputAvg = models.reduce((sum, model) => sum + model.outputCostPerToken, 0) / models.length;
    
    return {
      inputCostPerToken: inputAvg,
      outputCostPerToken: outputAvg
    };
  }

  /**
   * Check if operation is within budget before execution
   */
  async checkBudget(
    userId: string | undefined,
    estimatedCost: number,
    operation: string
  ): Promise<BudgetStatus> {
    try {
      const _now = new Date();
      const _startOfDay = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
      const _startOfMonth = new Date(_now.getFullYear(), _now.getMonth(), 1);

      // Get current costs
      const [globalDailyCost, globalMonthlyCost, userDailyCost, userMonthlyCost] = await Promise.all([
        this.getDailyCost(),
        this.getMonthlyCost(),
        userId ? this.getUserDailyCost(userId) : 0,
        userId ? this.getUserMonthlyCost(userId) : 0
      ]);

      // Check global budget limits
      const globalDailyAfterOperation = globalDailyCost + estimatedCost;
      const globalMonthlyAfterOperation = globalMonthlyCost + estimatedCost;
      
      const globalDailyExceeded = globalDailyAfterOperation > this.budgetConfig.dailyBudget;
      const globalMonthlyExceeded = globalMonthlyAfterOperation > this.budgetConfig.monthlyBudget;

      // Check user budget limits
      const userDailyAfterOperation = userDailyCost + estimatedCost;
      const userMonthlyAfterOperation = userMonthlyCost + estimatedCost;
      
      const userDailyExceeded = userId && userDailyAfterOperation > this.budgetConfig.userDailyBudget;
      const userMonthlyExceeded = userId && userMonthlyAfterOperation > this.budgetConfig.userMonthlyBudget;

      // Determine budget status
      const isWithinBudget = !globalDailyExceeded && !globalMonthlyExceeded && !userDailyExceeded && !userMonthlyExceeded;
      
      const dailyUtilization = Math.max(
        globalDailyAfterOperation / this.budgetConfig.dailyBudget,
        userId ? userDailyAfterOperation / this.budgetConfig.userDailyBudget : 0
      );
      
      const monthlyUtilization = Math.max(
        globalMonthlyAfterOperation / this.budgetConfig.monthlyBudget,
        userId ? userMonthlyAfterOperation / this.budgetConfig.userMonthlyBudget : 0
      );

      // Determine violation type
      let violationType: 'daily' | 'monthly' | 'none' = 'none';
      if (globalDailyExceeded || userDailyExceeded) {
        violationType = 'daily';
      } else if (globalMonthlyExceeded || userMonthlyExceeded) {
        violationType = 'monthly';
      }

      // Determine alert level
      let alertLevel: 'warning' | 'critical' | 'none' = 'none';
      const maxUtilization = Math.max(dailyUtilization, monthlyUtilization);
      
      if (maxUtilization >= this.budgetConfig.alertThresholds.critical) {
        alertLevel = 'critical';
      } else if (maxUtilization >= this.budgetConfig.alertThresholds.warning) {
        alertLevel = 'warning';
      }

      const budgetStatus: BudgetStatus = {
        isWithinBudget,
        dailyUtilization,
        monthlyUtilization,
        remainingDaily: Math.max(0, this.budgetConfig.dailyBudget - globalDailyAfterOperation),
        remainingMonthly: Math.max(0, this.budgetConfig.monthlyBudget - globalMonthlyAfterOperation),
        violationType: violationType === 'none' ? undefined : violationType,
        alertLevel: alertLevel === 'none' ? undefined : alertLevel
      };

      // Send alerts if necessary
      if (alertLevel !== 'none') {
        await this.sendBudgetAlert(budgetStatus, operation, userId);
      }

      // Record metrics
      monitoring.recordGauge('ai.budget.daily_utilization', dailyUtilization);
      monitoring.recordGauge('ai.budget.monthly_utilization', monthlyUtilization);
      monitoring.recordGauge('ai.budget.remaining_daily', budgetStatus.remainingDaily);
      monitoring.recordGauge('ai.budget.remaining_monthly', budgetStatus.remainingMonthly);

      if (!isWithinBudget) {
        monitoring.incrementCounter('ai.budget.violations', 1, {
          violation_type: violationType,
          user_id: userId || 'global',
          operation
        });
      }

      return budgetStatus;

    } catch (error) {
      logger.error('Budget check failed', {
        userId,
        estimatedCost,
        operation,
        error: error instanceof Error ? error.message : String(error)
      });

      // Fail open - assume within budget if check fails
      return {
        isWithinBudget: true,
        dailyUtilization: 0,
        monthlyUtilization: 0,
        remainingDaily: this.budgetConfig.dailyBudget,
        remainingMonthly: this.budgetConfig.monthlyBudget
      };
    }
  }

  /**
   * Track actual AI operation cost after execution
   */
  async trackCost(entry: CostTrackingEntry): Promise<void> {
    try {
      // Store in database for detailed tracking
      await prisma.aiCostTracking.create({
        data: {
          userId: entry.userId || null,
          operation: entry.operation,
          model: entry.model,
          tokensUsed: entry.inputTokens + entry.outputTokens,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          estimatedCost: entry.estimatedCost,
          actualCost: entry.actualCost || entry.estimatedCost,
          timestamp: entry.timestamp,
          metadata: entry.metadata || {}
        }
      });

      // Record real-time metrics
      monitoring.recordGauge('ai.cost.operation', entry.actualCost || entry.estimatedCost, {
        operation: entry.operation,
        model: entry.model,
        user_id: entry.userId || 'anonymous'
      });

      monitoring.recordGauge('ai.tokens.input', entry.inputTokens, {
        operation: entry.operation,
        model: entry.model
      });

      monitoring.recordGauge('ai.tokens.output', entry.outputTokens, {
        operation: entry.operation,
        model: entry.model
      });

      logger.debug('AI cost tracked', {
        userId: entry.userId,
        operation: entry.operation,
        model: entry.model,
        cost: entry.actualCost || entry.estimatedCost,
        tokens: entry.inputTokens + entry.outputTokens
      });

    } catch (error) {
      logger.error('Failed to track AI cost', {
        entry,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get daily cost summary
   */
  async getDailyCost(userId?: string): Promise<number> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const result = await prisma.aiCostTracking.aggregate({
        where: {
          timestamp: { gte: startOfDay },
          ...(userId && { userId })
        },
        _sum: { actualCost: true }
      });

      return result._sum.actualCost || 0;
    } catch (error) {
      logger.error('Failed to get daily cost', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Get monthly cost summary
   */
  async getMonthlyCost(userId?: string): Promise<number> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const result = await prisma.aiCostTracking.aggregate({
        where: {
          timestamp: { gte: startOfMonth },
          ...(userId && { userId })
        },
        _sum: { actualCost: true }
      });

      return result._sum.actualCost || 0;
    } catch (error) {
      logger.error('Failed to get monthly cost', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Get user-specific daily cost
   */
  async getUserDailyCost(userId: string): Promise<number> {
    return this.getDailyCost(userId);
  }

  /**
   * Get user-specific monthly cost
   */
  async getUserMonthlyCost(userId: string): Promise<number> {
    return this.getMonthlyCost(userId);
  }

  /**
   * Get comprehensive cost summary
   */
  async getCostSummary(
    userId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CostSummary> {
    try {
      const whereClause: Record<string, unknown> = {};
      
      if (userId) {
        whereClause.userId = userId;
      }
      
      if (startDate || endDate) {
        whereClause.timestamp = {};
        if (startDate) whereClause.timestamp.gte = startDate;
        if (endDate) whereClause.timestamp.lte = endDate;
      }

      // Get aggregated data
      const [costData, modelData, operationData] = await Promise.all([
        prisma.aiCostTracking.aggregate({
          where: whereClause,
          _sum: { actualCost: true, tokensUsed: true },
          _count: true
        }),
        prisma.aiCostTracking.groupBy({
          by: ['model'],
          where: whereClause,
          _sum: { actualCost: true },
          _count: true,
          orderBy: { _sum: { actualCost: 'desc' } },
          take: 10
        }),
        prisma.aiCostTracking.groupBy({
          by: ['operation'],
          where: whereClause,
          _sum: { actualCost: true },
          _count: true,
          orderBy: { _sum: { actualCost: 'desc' } },
          take: 10
        })
      ]);

      const totalCost = costData._sum.actualCost || 0;
      const requestCount = costData._count;
      const tokensUsed = costData._sum.tokensUsed || 0;

      // Get daily and monthly costs
      const dailyCost = await this.getDailyCost(userId);
      const monthlyCost = await this.getMonthlyCost(userId);

      return {
        totalCost,
        dailyCost,
        monthlyCost,
        tokensUsed,
        requestCount,
        averageCostPerRequest: requestCount > 0 ? totalCost / requestCount : 0,
        topModels: modelData.map(item => ({
          model: item.model,
          cost: item._sum.actualCost || 0,
          requests: item._count
        })),
        topOperations: operationData.map(item => ({
          operation: item.operation,
          cost: item._sum.actualCost || 0,
          requests: item._count
        }))
      };

    } catch (error) {
      logger.error('Failed to get cost summary', {
        userId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        totalCost: 0,
        dailyCost: 0,
        monthlyCost: 0,
        tokensUsed: 0,
        requestCount: 0,
        averageCostPerRequest: 0,
        topModels: [],
        topOperations: []
      };
    }
  }

  /**
   * Send budget alert
   */
  private async sendBudgetAlert(
    budgetStatus: BudgetStatus,
    operation: string,
    userId?: string
  ): Promise<void> {
    try {
      const alertType = budgetStatus.alertLevel === 'critical' ? 'AI_BUDGET_CRITICAL' : 'AI_BUDGET_WARNING';
      const alertLevel = budgetStatus.alertLevel === 'critical' ? 'critical' : 'warning';

      await alertService.createAlert({
        type: alertType,
        level: alertLevel,
        message: `AI budget ${budgetStatus.alertLevel} threshold reached`,
        details: {
          dailyUtilization: `${(budgetStatus.dailyUtilization * 100).toFixed(1)}%`,
          monthlyUtilization: `${(budgetStatus.monthlyUtilization * 100).toFixed(1)}%`,
          remainingDaily: `$${budgetStatus.remainingDaily.toFixed(2)}`,
          remainingMonthly: `$${budgetStatus.remainingMonthly.toFixed(2)}`,
          operation,
          userId
        },
        context: {
          operation,
          userId: userId || 'global',
          budgetStatus
        }
      });

      logger.warn('Budget alert sent', {
        alertType,
        alertLevel,
        budgetStatus,
        operation,
        userId
      });

    } catch (error) {
      logger.error('Failed to send budget alert', {
        budgetStatus,
        operation,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Reset budget usage (admin function)
   */
  async resetBudgetUsage(userId?: string): Promise<void> {
    try {
      const whereClause: Record<string, unknown> = {};
      if (userId) {
        whereClause.userId = userId;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      await prisma.aiCostTracking.deleteMany({
        where: {
          ...whereClause,
          timestamp: { gte: startOfDay }
        }
      });

      logger.info('Budget usage reset', { userId });

    } catch (error) {
      logger.error('Failed to reset budget usage', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get budget configuration
   */
  getBudgetConfig(): BudgetConfig {
    return { ...this.budgetConfig };
  }

  /**
   * Update budget configuration
   */
  updateBudgetConfig(updates: Partial<BudgetConfig>): void {
    this.budgetConfig = { ...this.budgetConfig, ...updates };
    logger.info('Budget configuration updated', { updates });
  }
}

/**
 * Default cost tracker instance
 */
export const costTracker = new AICostTracker();