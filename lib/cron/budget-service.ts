/**
 * Budget management service for tier-aware cron processing
 * Handles subscription tiers, cost validation, and budget limits
 * Extracted from app/api/cron/tier-aware/route.ts
 */

import { logger } from '../logging';
import { updateUserBudgetWithLock } from '../db/concurrency';
import { validateCostUpdate } from '../db/cost-validation';
import { createAsyncAuditLog } from '../db/async-audit';
import type {
  SubscriptionTier,
  ProcessingContext,
  BudgetUpdateOptions,
  BudgetUpdateResult
} from './types';
import { TIER_BATCH_SIZES, DAILY_COST_LIMITS } from './types';

const budgetLogger = logger.child('cron-budget');

export class CronBudgetService {
  /**
   * Normalize subscription tiers for backward compatibility with legacy tiers
   * Maps old tier names to new simplified tier structure
   */
  static normalizeTier(tier: string): SubscriptionTier {
    const tierUpper = (tier || '').toUpperCase();
    
    // Map legacy tiers to new two-tier system (PRO and HOBBY)
    switch (tierUpper) {
      case 'INSTITUTION':
      case 'ENTERPRISE':
      case 'PROFESSIONAL':
        return 'PRO';
      case 'FREE':
        return 'HOBBY';  // Map FREE to HOBBY
      case 'HOBBY':
        return 'HOBBY';
      case 'PRO':
        return 'PRO';
      default:
        // Default unknown tiers to HOBBY for safety
        budgetLogger.warn(`Unknown subscription tier: ${tier}, defaulting to HOBBY`);
        return 'HOBBY';
    }
  }

  /**
   * Get batch size limit for a subscription tier
   */
  static getBatchSizeForTier(tier: string): number {
    const normalizedTier = this.normalizeTier(tier);
    return TIER_BATCH_SIZES[normalizedTier] || TIER_BATCH_SIZES.HOBBY;
  }

  /**
   * Get daily cost limit for a subscription tier
   */
  static getDailyCostLimit(tier: string): number {
    const normalizedTier = this.normalizeTier(tier);
    return DAILY_COST_LIMITS[normalizedTier] || DAILY_COST_LIMITS.HOBBY;
  }

  /**
   * Validate cost update with comprehensive security checks
   */
  static validateProcessingCost(
    cost: number,
    tier: string,
    context: ProcessingContext
  ): { valid: boolean; sanitizedCost: number; error?: string } {
    try {
      // Normalize tier first to ensure consistency with cost validation system
      const normalizedTier = this.normalizeTier(tier);
      
      // Log context flow for debugging
      budgetLogger.debug('Processing cost validation with context', {
        userId: context.userId,
        tier,
        normalizedTier,
        cost,
        context: {
          operation: context.operation,
          operationType: context.operationType,
          isCached: context.isCached
        },
        contextFlow: 'budget-service -> cost-validation'
      });
      
      const costValidation = validateCostUpdate(cost, normalizedTier, {
        userId: context.userId,
        tier: normalizedTier,
        operation: context.operation,
        operationType: context.operationType,
        isCached: context.isCached
      });

      if (!costValidation.valid) {
        budgetLogger.error(`Cost validation failed`, {
          userId: context.userId,
          tier,
          normalizedTier,
          originalCost: cost,
          contextProvided: {
            operation: context.operation,
            operationType: context.operationType,
            isCached: context.isCached
          },
          error: costValidation.error
        });

        // Queue audit log for failed cost validation asynchronously  
        setImmediate(() => {
          createAsyncAuditLog({
            userId: context.userId,
            action: 'BUDGET_UPDATE_FAILED',
            details: {
              originalCost: cost,
              tier,
              error: costValidation.error,
              timestamp: new Date().toISOString(),
              processingType: context.operation
            },
            success: false
          }).catch(err => budgetLogger.error('Failed to create async audit log', { err }));
        });

        return {
          valid: false,
          sanitizedCost: 0,
          error: `Cost validation failed: ${costValidation.error}`
        };
      }

      return {
        valid: true,
        sanitizedCost: costValidation.sanitizedCost
      };

    } catch (error) {
      budgetLogger.error('Cost validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: context.userId,
        tier,
        cost
      });

      return {
        valid: false,
        sanitizedCost: 0,
        error: 'Cost validation system error'
      };
    }
  }

  /**
   * Update user budget with atomic operations and audit logging
   */
  static async updateUserBudget(
    userId: string,
    cost: number,
    currentBudgetUsed: number,
    tier: string
  ): Promise<BudgetUpdateResult> {
    try {
      const normalizedTier = this.normalizeTier(tier);
      const dailyLimit = this.getDailyCostLimit(normalizedTier);

      const updateOptions: BudgetUpdateOptions = {
        maxRetries: 5,
        baseDelay: 50,
        maxDelay: 1000,
        isolationLevel: 'ReadCommitted',
        tier: normalizedTier,
        originalCost: cost,
        enableAuditLogging: true
      };

      const updateResult = await updateUserBudgetWithLock(
        userId,
        cost,
        currentBudgetUsed,
        dailyLimit,
        updateOptions
      );

      if (!updateResult) {
        throw new Error('Budget update failed - no result returned');
      }

      budgetLogger.info('Budget updated successfully', {
        userId,
        tier: normalizedTier,
        cost,
        previousBudget: updateResult.previousBudget,
        newBudget: updateResult.newBudget
      });

      return {
        previousBudget: updateResult.previousBudget || 0,
        newBudget: updateResult.newBudget || 0,
        success: true
      };

    } catch (error) {
      budgetLogger.error('Budget update failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        tier,
        cost
      });

      throw error;
    }
  }

  /**
   * Check if user is within budget limits
   */
  static isWithinBudgetLimit(
    currentBudgetUsed: number,
    additionalCost: number,
    tier: string,
    thresholdPercentage: number = 90
  ): boolean {
    const dailyLimit = this.getDailyCostLimit(tier);
    const projectedUsage = currentBudgetUsed + additionalCost;
    const threshold = dailyLimit * (thresholdPercentage / 100);
    
    return projectedUsage <= threshold;
  }

  /**
   * Calculate remaining budget for a user
   */
  static calculateRemainingBudget(currentBudgetUsed: number, tier: string): number {
    const dailyLimit = this.getDailyCostLimit(tier);
    return Math.max(0, dailyLimit - currentBudgetUsed);
  }

  /**
   * Get budget utilization percentage
   */
  static getBudgetUtilization(currentBudgetUsed: number, tier: string): number {
    const dailyLimit = this.getDailyCostLimit(tier);
    if (dailyLimit === 0) return 0;
    return Math.min(100, (currentBudgetUsed / dailyLimit) * 100);
  }

  /**
   * Validate subscription tier compatibility
   */
  static validateTierCompatibility(
    expectedTier: string,
    actualTier: string
  ): { isValid: boolean; error?: string } {
    const normalizedExpected = this.normalizeTier(expectedTier);
    const normalizedActual = this.normalizeTier(actualTier);

    if (normalizedExpected !== normalizedActual) {
      return {
        isValid: false,
        error: `Subscription tier mismatch: expected ${normalizedExpected}, got ${normalizedActual}`
      };
    }

    return { isValid: true };
  }

  /**
   * Get processing limits summary for a tier
   */
  static getTierLimits(tier: string): {
    batchSize: number;
    dailyCostLimit: number;
    normalizedTier: SubscriptionTier;
  } {
    const normalizedTier = this.normalizeTier(tier);
    
    return {
      batchSize: this.getBatchSizeForTier(normalizedTier),
      dailyCostLimit: this.getDailyCostLimit(normalizedTier),
      normalizedTier
    };
  }

  /**
   * Check if cost is reasonable for the tier and operation type
   */
  static isReasonableCost(
    cost: number,
    tier: string,
    operationType: 'ai_generation' | 'cached_summary' | 'other'
  ): boolean {
    const dailyLimit = this.getDailyCostLimit(tier);
    
    // Cached operations should have zero or minimal cost
    if (operationType === 'cached_summary') {
      return cost === 0 || cost < 0.001;
    }

    // AI generation should not exceed a reasonable percentage of daily limit per operation
    if (operationType === 'ai_generation') {
      const maxCostPerOperation = dailyLimit * 0.1; // Max 10% of daily budget per operation
      return cost <= maxCostPerOperation;
    }

    // Other operations should be minimal
    return cost < dailyLimit * 0.05; // Max 5% of daily budget
  }

  /**
   * Log budget metrics for monitoring
   */
  static logBudgetMetrics(
    userId: string,
    tier: string,
    cost: number,
    currentBudgetUsed: number,
    operationType: string
  ): void {
    const utilization = this.getBudgetUtilization(currentBudgetUsed, tier);
    const remainingBudget = this.calculateRemainingBudget(currentBudgetUsed, tier);
    
    budgetLogger.info('Budget metrics', {
      userId,
      tier: this.normalizeTier(tier),
      operationType,
      cost,
      currentBudgetUsed,
      budgetUtilization: `${utilization.toFixed(1)}%`,
      remainingBudget: remainingBudget.toFixed(4),
      dailyLimit: this.getDailyCostLimit(tier)
    });
  }

  /**
   * Check if user's daily budget needs to be reset
   * @param user User object with budget tracking fields
   * @returns true if budget should be reset
   */
  static shouldResetDailyBudget(user: {
    dailyBudgetResetAt?: Date | null;
    budgetUsed?: number | null;
  }): boolean {
    // If no reset date set, budget needs reset
    if (!user.dailyBudgetResetAt) {
      return true;
    }

    // If reset date is in the past, budget needs reset
    const now = new Date();
    return user.dailyBudgetResetAt <= now;
  }

  /**
   * Calculate next daily budget reset time (midnight UTC)
   * @returns Date for next midnight UTC
   */
  static getNextDailyResetTime(): Date {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setUTCHours(24, 0, 0, 0); // Next midnight UTC
    return nextMidnight;
  }

  /**
   * Reset user's daily budget to zero and set next reset time
   * @param userId User ID to reset
   * @returns Budget reset result
   */
  static async resetUserDailyBudget(userId: string): Promise<{
    success: boolean;
    previousBudget: number;
    nextResetAt: Date;
    error?: string;
  }> {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      const nextResetAt = this.getNextDailyResetTime();
      
      // Update user's budget with atomic operation
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          budgetUsed: 0,
          dailyBudgetResetAt: nextResetAt,
        },
        select: {
          id: true,
          budgetUsed: true,
          dailyBudgetResetAt: true,
          subscriptionTier: true
        }
      });

      budgetLogger.info('Daily budget reset completed', {
        userId,
        nextResetAt: nextResetAt.toISOString(),
        tier: updatedUser.subscriptionTier
      });

      return {
        success: true,
        previousBudget: updatedUser.budgetUsed || 0,
        nextResetAt
      };

    } catch (error) {
      budgetLogger.error('Failed to reset daily budget', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        previousBudget: 0,
        nextResetAt: this.getNextDailyResetTime(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check and reset daily budgets for all users who need it
   * @returns Array of reset results
   */
  static async resetAllEligibleDailyBudgets(): Promise<Array<{
    userId: string;
    success: boolean;
    previousBudget: number;
    nextResetAt: Date;
    error?: string;
  }>> {
    try {
      // Dynamic import to avoid build-time dependencies
      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();
      
      const now = new Date();
      
      // Find users whose budget needs to be reset
      const usersNeedingReset = await prisma.user.findMany({
        where: {
          OR: [
            { dailyBudgetResetAt: null }, // Never been set
            { dailyBudgetResetAt: { lte: now } } // Reset time has passed
          ]
        },
        select: {
          id: true,
          budgetUsed: true,
          dailyBudgetResetAt: true,
          subscriptionTier: true
        }
      });

      budgetLogger.info('Found users needing daily budget reset', {
        count: usersNeedingReset.length,
        users: usersNeedingReset.map(u => ({
          id: u.id,
          tier: u.subscriptionTier,
          currentBudget: u.budgetUsed,
          lastReset: u.dailyBudgetResetAt?.toISOString()
        }))
      });

      // Reset budgets for all eligible users
      const results = await Promise.all(
        usersNeedingReset.map(user => this.resetUserDailyBudget(user.id))
      );

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;

      budgetLogger.info('Daily budget reset batch completed', {
        totalUsers: usersNeedingReset.length,
        successful: successCount,
        errors: errorCount
      });

      return results;

    } catch (error) {
      budgetLogger.error('Failed to reset daily budgets', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return [];
    }
  }
}