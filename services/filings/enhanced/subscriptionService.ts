import { logger } from '../../../lib/logging';
import { PrismaClient, PlanType, UserSubscription as PrismaUserSubscription } from '@prisma/client';
import { SubscriptionTier, OptimizationLevel, getOptimizationLevelForTier } from './tokenOptimizer';
import { 
  validateSubscriptionUpdate, 
  validateFilingUsage, 
  validateUsagePeriod,
  type SubscriptionUpdateInput,
  type FilingUsageInput 
} from '../../../lib/validation/subscription-validation';
import {
  verifySubscriptionOwnership,
  verifyUsageRecordingPermission,
  verifyUserExists,
  checkSubscriptionRateLimit,
  SubscriptionAuthError
} from '../../../lib/auth/subscription-auth';

// Initialize Prisma client
const prisma = new PrismaClient();

// Create a module-specific logger
const subscriptionLogger = logger.child('subscription-service');

/**
 * Map Prisma PlanType to our internal SubscriptionTier
 */
function mapPlanTypeToSubscriptionTier(planType: PlanType): SubscriptionTier {
  const mapping: Record<PlanType, SubscriptionTier> = {
    'BASIC': 'balanced',
    'PROFESSIONAL': 'conservative', 
    'PREMIUM': 'minimal'
  };
  return mapping[planType];
}

/**
 * Map internal SubscriptionTier to Prisma PlanType
 */
function mapSubscriptionTierToPlanType(tier: string): PlanType {
  const mapping: Record<string, PlanType> = {
    'balanced': 'BASIC',
    'conservative': 'PROFESSIONAL',
    'minimal': 'PREMIUM'
  };
  return mapping[tier] || 'BASIC';
}

/**
 * User subscription information
 */
export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  isActive: boolean;
  features: string[];
  limits: {
    monthlyFilings: number;
    usedFilings: number;
    resetDate: Date;
  };
}

/**
 * Subscription tier features and limits
 */
export const SUBSCRIPTION_FEATURES = {
  basic: {
    optimizationLevel: 'balanced' as OptimizationLevel,
    monthlyFilings: 50,
    features: [
      'Basic filing summaries',
      'Standard AI analysis',
      'Email notifications',
      'Balanced token optimization (85% reduction)'
    ],
    description: 'Perfect for individual investors and small teams'
  },
  professional: {
    optimizationLevel: 'conservative' as OptimizationLevel,
    monthlyFilings: 200,
    features: [
      'Enhanced filing summaries',
      'Advanced AI analysis',
      'Priority email notifications',
      'Conservative token optimization (67% reduction)',
      'Detailed business context',
      'Comprehensive risk analysis'
    ],
    description: 'Ideal for investment professionals and analysts'
  },
  premium: {
    optimizationLevel: 'minimal' as OptimizationLevel,
    monthlyFilings: 1000,
    features: [
      'Premium filing summaries',
      'Maximum context preservation',
      'Real-time notifications',
      'Minimal token optimization (55% reduction)',
      'Complete financial statements',
      'Full business narratives',
      'Priority support'
    ],
    description: 'Best for institutional investors and research firms'
  }
} as const;

/**
 * Get user subscription information from database
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  try {
    subscriptionLogger.debug(`Getting subscription for user ${userId}`);
    
    // Get user subscription from database
    const userSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
      include: {
        user: true
      }
    });

    if (!userSubscription) {
      subscriptionLogger.warn(`No subscription found for user ${userId}, creating default`);
      // Create default subscription for new users
      return await createDefaultSubscription(userId);
    }

    // Get current usage period
    const currentPeriod = await getCurrentUsagePeriod(userId, userSubscription.planType);
    
    if (!currentPeriod) {
      subscriptionLogger.warn(`No usage period found for user ${userId}, creating new period`);
      await createNewUsagePeriod(userId, userSubscription.planType);
      const newPeriod = await getCurrentUsagePeriod(userId, userSubscription.planType);
      if (!newPeriod) {
        throw new Error('Failed to create usage period');
      }
    }

    const usagePeriod = currentPeriod || await getCurrentUsagePeriod(userId, userSubscription.planType);
    if (!usagePeriod) {
      throw new Error('Failed to get usage period');
    }

    // Map to our interface
    const subscription: UserSubscription = {
      userId,
      tier: mapPlanTypeToSubscriptionTier(userSubscription.planType),
      isActive: userSubscription.isActive && new Date() < userSubscription.currentPeriodEnd,
      features: SUBSCRIPTION_FEATURES[getPlanKey(userSubscription.planType)].features,
      limits: {
        monthlyFilings: usagePeriod.filingLimit,
        usedFilings: usagePeriod.filingsUsed,
        resetDate: usagePeriod.resetAt
      }
    };
    
    subscriptionLogger.info(`Retrieved subscription for user ${userId}`, {
      tier: subscription.tier,
      isActive: subscription.isActive,
      monthlyLimit: subscription.limits.monthlyFilings,
      used: subscription.limits.usedFilings
    });
    
    return subscription;
  } catch (error) {
    subscriptionLogger.error(`Failed to get subscription for user ${userId}: ${error}`);
    return null;
  }
}

/**
 * Check if user can process a filing based on their subscription limits
 */
export async function canProcessFiling(userId: string): Promise<{
  canProcess: boolean;
  reason?: string;
  remainingFilings?: number;
}> {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      return { canProcess: false, reason: 'No subscription found' };
    }
    
    if (!subscription.isActive) {
      return { canProcess: false, reason: 'Subscription is not active' };
    }
    
    const remainingFilings = subscription.limits.monthlyFilings - subscription.limits.usedFilings;
    
    if (remainingFilings <= 0) {
      return { 
        canProcess: false, 
        reason: 'Monthly filing limit exceeded',
        remainingFilings: 0
      };
    }
    
    return { 
      canProcess: true, 
      remainingFilings 
    };
  } catch (error) {
    subscriptionLogger.error(`Failed to check filing eligibility for user ${userId}: ${error}`);
    return { canProcess: false, reason: 'Error checking subscription' };
  }
}

/**
 * Get optimization level for user based on their subscription
 */
export async function getOptimizationLevelForUser(userId: string): Promise<OptimizationLevel> {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription || !subscription.isActive) {
      // Default to basic tier optimization if no valid subscription
      return 'balanced';
    }
    
    const optimizationLevel = getOptimizationLevelForTier(subscription.tier);
    
    subscriptionLogger.debug(`Determined optimization level for user ${userId}`, {
      tier: subscription.tier,
      optimizationLevel
    });
    
    return optimizationLevel;
  } catch (error) {
    subscriptionLogger.error(`Failed to get optimization level for user ${userId}: ${error}`);
    return 'balanced'; // Safe default
  }
}

/**
 * Record filing usage for a user
 */
export async function recordFilingUsage(
  userId: string, 
  filingType: string,
  ticker?: string,
  accessionNumber?: string,
  optimizationData?: {
    level: string;
    originalTokens?: number;
    optimizedTokens?: number;
    reductionPercentage?: number;
    cost?: number;
    processingTimeMs?: number;
  }
): Promise<void> {
  try {
    // Validate inputs
    await verifyUserExists(userId);
    await verifyUsageRecordingPermission(userId, userId);
    checkSubscriptionRateLimit(userId, 1000); // Allow 1000 operations per hour
    
    const usageData: FilingUsageInput = {
      filingType,
      ticker: ticker || '',
      accessionNumber,
      optimizationLevel: (optimizationData?.level as any) || 'balanced',
      originalTokens: optimizationData?.originalTokens,
      optimizedTokens: optimizationData?.optimizedTokens,
      reductionPercentage: optimizationData?.reductionPercentage,
      cost: optimizationData?.cost,
      processingTimeMs: optimizationData?.processingTimeMs
    };
    
    const validation = validateFilingUsage(usageData);
    if (!validation.success) {
      subscriptionLogger.error('Invalid filing usage data', {
        userId,
        errors: validation.error.errors
      });
      throw new SubscriptionAuthError('Invalid usage data', 'INVALID_INPUT');
    }

    subscriptionLogger.info(`Recording filing usage for user ${userId}`, {
      filingType,
      ticker,
      timestamp: new Date().toISOString()
    });
    
    // Use database transaction to prevent race conditions
    await prisma.$transaction(async (tx) => {
      // Get user's subscription to determine tier
      const userSubscription = await tx.userSubscription.findUnique({
        where: { userId },
        select: { planType: true, isActive: true, currentPeriodEnd: true }
      });
      
      if (!userSubscription || !userSubscription.isActive) {
        subscriptionLogger.warn(`No active subscription found for user ${userId}, skipping usage tracking`);
        return;
      }

      // Get current usage period with row-level locking
      const now = new Date();
      const currentPeriod = await tx.usagePeriod.findFirst({
        where: {
          userId,
          periodStart: { lte: now },
          periodEnd: { gte: now }
        },
        select: { id: true, filingsUsed: true, filingLimit: true }
      });

      if (!currentPeriod) {
        subscriptionLogger.warn(`No current usage period found for user ${userId}`);
        return;
      }

      // Check if usage limit would be exceeded
      if (optimizationData && currentPeriod.filingsUsed >= currentPeriod.filingLimit) {
        throw new SubscriptionAuthError(
          'Monthly filing limit exceeded',
          'USAGE_LIMIT_EXCEEDED'
        );
      }

      // Record detailed filing usage
      await tx.filingUsage.create({
        data: {
          userId,
          filingType: validation.data.filingType,
          ticker: validation.data.ticker,
          accessionNumber: validation.data.accessionNumber,
          optimizationLevel: validation.data.optimizationLevel,
          originalTokens: validation.data.originalTokens,
          optimizedTokens: validation.data.optimizedTokens,
          reductionPercentage: validation.data.reductionPercentage,
          cost: validation.data.cost,
          processingTimeMs: validation.data.processingTimeMs,
          subscriptionTier: mapPlanTypeToSubscriptionTier(userSubscription.planType)
        }
      });

      // Update usage period counter atomically if we have optimization data
      if (optimizationData) {
        await tx.usagePeriod.update({
          where: { id: currentPeriod.id },
          data: { filingsUsed: { increment: 1 } }
        });
      }
    }, {
      isolationLevel: 'Serializable', // Highest isolation level to prevent race conditions
      timeout: 10000 // 10 second timeout
    });
    
    subscriptionLogger.debug(`Filing usage recorded for user ${userId}`, {
      filingType,
      optimizationLevel: optimizationData?.level
    });
  } catch (error) {
    if (error instanceof SubscriptionAuthError) {
      // Re-throw auth errors as they should block processing
      throw error;
    }
    subscriptionLogger.error(`Failed to record filing usage for user ${userId}: ${error}`);
    // Don't throw other errors - usage tracking failure shouldn't block filing processing
  }
}

/**
 * Get subscription tier benefits and features
 */
export function getSubscriptionTierInfo(tier: SubscriptionTier): {
  optimizationLevel: OptimizationLevel;
  monthlyFilings: number;
  features: string[];
  description: string;
} {
  return SUBSCRIPTION_FEATURES[tier];
}

/**
 * Check if user has access to a specific feature
 */
export async function hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription || !subscription.isActive) {
      return false;
    }
    
    return subscription.features.includes(feature);
  } catch (error) {
    subscriptionLogger.error(`Failed to check feature access for user ${userId}: ${error}`);
    return false;
  }
}

/**
 * Helper function to get plan key for SUBSCRIPTION_FEATURES
 */
function getPlanKey(planType: PlanType): 'basic' | 'professional' | 'premium' {
  const mapping: Record<PlanType, 'basic' | 'professional' | 'premium'> = {
    'BASIC': 'basic',
    'PROFESSIONAL': 'professional',
    'PREMIUM': 'premium'
  };
  return mapping[planType];
}

/**
 * Create default subscription for new users
 */
async function createDefaultSubscription(userId: string): Promise<UserSubscription> {
  try {
    // Create default subscription (BASIC plan)
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const userSubscription = await prisma.userSubscription.create({
      data: {
        userId,
        planType: 'BASIC',
        isActive: true,
        currentPeriodEnd: periodEnd
      }
    });

    // Create initial usage period
    await createNewUsagePeriod(userId, 'BASIC');

    // Return formatted subscription
    return {
      userId,
      tier: 'balanced',
      isActive: true,
      features: SUBSCRIPTION_FEATURES.basic.features,
      limits: {
        monthlyFilings: SUBSCRIPTION_FEATURES.basic.monthlyFilings,
        usedFilings: 0,
        resetDate: periodEnd
      }
    };
  } catch (error) {
    subscriptionLogger.error(`Failed to create default subscription for user ${userId}: ${error}`);
    throw error;
  }
}

/**
 * Get current usage period for user
 */
async function getCurrentUsagePeriod(userId: string, planType: PlanType) {
  const now = new Date();
  return await prisma.usagePeriod.findFirst({
    where: {
      userId,
      periodStart: { lte: now },
      periodEnd: { gte: now }
    }
  });
}

/**
 * Create new usage period for user
 */
async function createNewUsagePeriod(userId: string, planType: PlanType) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First of current month
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
  const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1); // First of next month

  const planKey = getPlanKey(planType);
  const filingLimit = SUBSCRIPTION_FEATURES[planKey].monthlyFilings;

  return await prisma.usagePeriod.create({
    data: {
      userId,
      planType,
      periodStart,
      periodEnd,
      filingLimit,
      resetAt
    }
  });
}

/**
 * Format subscription info for display
 */
export function formatSubscriptionInfo(subscription: UserSubscription): {
  tierName: string;
  optimizationLevel: OptimizationLevel;
  usage: string;
  resetDate: string;
  features: string[];
} {
  // Map internal tier to display key
  const tierDisplayMap: Record<string, 'basic' | 'professional' | 'premium'> = {
    'balanced': 'basic',
    'conservative': 'professional',
    'minimal': 'premium'
  };
  
  const displayKey = tierDisplayMap[subscription.tier] || 'basic';
  const tierInfo = SUBSCRIPTION_FEATURES[displayKey];
  const usagePercent = Math.round((subscription.limits.usedFilings / subscription.limits.monthlyFilings) * 100);
  
  return {
    tierName: displayKey.charAt(0).toUpperCase() + displayKey.slice(1),
    optimizationLevel: tierInfo.optimizationLevel,
    usage: `${subscription.limits.usedFilings}/${subscription.limits.monthlyFilings} (${usagePercent}%)`,
    resetDate: subscription.limits.resetDate.toISOString().split('T')[0],
    features: subscription.features
  };
}

/**
 * Get subscription analytics for user
 */
export async function getSubscriptionAnalytics(userId: string, periodDays: number = 30): Promise<{
  totalFilings: number;
  filingsByType: Record<string, number>;
  tokensSaved: number;
  avgReduction: number;
  costSavings: number;
}> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);

    const usage = await prisma.filingUsage.findMany({
      where: {
        userId,
        createdAt: { gte: since }
      }
    });

    const filingsByType = usage.reduce((acc, filing) => {
      acc[filing.filingType] = (acc[filing.filingType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalTokensSaved = usage.reduce((sum, filing) => {
      return sum + ((filing.originalTokens || 0) - (filing.optimizedTokens || 0));
    }, 0);

    const avgReduction = usage.length > 0 
      ? usage.reduce((sum, filing) => sum + (filing.reductionPercentage || 0), 0) / usage.length
      : 0;

    const costSavings = usage.reduce((sum, filing) => sum + (filing.cost || 0), 0);

    return {
      totalFilings: usage.length,
      filingsByType,
      tokensSaved: totalTokensSaved,
      avgReduction,
      costSavings
    };
  } catch (error) {
    subscriptionLogger.error(`Failed to get analytics for user ${userId}: ${error}`);
    return {
      totalFilings: 0,
      filingsByType: {},
      tokensSaved: 0,
      avgReduction: 0,
      costSavings: 0
    };
  }
}

/**
 * Get comprehensive subscription analytics for a user
 */
export async function getSubscriptionAnalytics(
  userId: string, 
  startDate: Date, 
  endDate: Date,
  options: { includeDailyBreakdown?: boolean } = {}
) {
  try {
    await verifyUserExists(userId);
    await verifyUsageRecordingPermission(userId, userId);

    subscriptionLogger.info(`Getting analytics for user ${userId}`, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      includeDailyBreakdown: options.includeDailyBreakdown
    });

    // Get filing usage data
    const usage = await prisma.filingUsage.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (usage.length === 0) {
      return {
        totalFilings: 0,
        totalTokensOriginal: 0,
        totalTokensOptimized: 0,
        averageReduction: 0,
        totalCost: 0,
        costSavings: 0,
        averageProcessingTime: 0,
        filingsByType: {},
        ...(options.includeDailyBreakdown && { dailyUsage: [] })
      };
    }

    // Calculate aggregated metrics
    const totalFilings = usage.length;
    const totalTokensOriginal = usage.reduce((sum, filing) => sum + (filing.originalTokens || 0), 0);
    const totalTokensOptimized = usage.reduce((sum, filing) => sum + (filing.optimizedTokens || 0), 0);
    const totalCost = usage.reduce((sum, filing) => sum + (filing.cost || 0), 0);
    const totalProcessingTime = usage.reduce((sum, filing) => sum + (filing.processingTimeMs || 0), 0);

    // Calculate average reduction percentage
    const validReductions = usage
      .filter(filing => filing.reductionPercentage && filing.reductionPercentage > 0)
      .map(filing => filing.reductionPercentage!);
    const averageReduction = validReductions.length > 0 
      ? validReductions.reduce((sum, reduction) => sum + reduction, 0) / validReductions.length
      : 0;

    // Calculate cost savings (tokens saved * estimated cost per token)
    const tokensSaved = totalTokensOriginal - totalTokensOptimized;
    const estimatedCostPerToken = 0.00001; // Rough estimate
    const costSavings = tokensSaved * estimatedCostPerToken;

    // Group by filing type
    const filingsByType: Record<string, number> = {};
    usage.forEach(filing => {
      filingsByType[filing.filingType] = (filingsByType[filing.filingType] || 0) + 1;
    });

    const result = {
      totalFilings,
      totalTokensOriginal,
      totalTokensOptimized,
      averageReduction,
      totalCost,
      costSavings,
      averageProcessingTime: totalProcessingTime / totalFilings,
      filingsByType
    };

    // Add daily breakdown if requested
    if (options.includeDailyBreakdown) {
      const dailyMap = new Map<string, { filings: number; tokensOptimized: number }>();
      
      // Initialize all days in range with zero values
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0];
        dailyMap.set(dateKey, { filings: 0, tokensOptimized: 0 });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Populate with actual usage data
      usage.forEach(filing => {
        const dateKey = filing.createdAt.toISOString().split('T')[0];
        const existing = dailyMap.get(dateKey) || { filings: 0, tokensOptimized: 0 };
        dailyMap.set(dateKey, {
          filings: existing.filings + 1,
          tokensOptimized: existing.tokensOptimized + (filing.optimizedTokens || 0)
        });
      });

      const dailyUsage = Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        ...data
      }));

      return { ...result, dailyUsage };
    }

    return result;

  } catch (error) {
    if (error instanceof SubscriptionAuthError) {
      throw error;
    }
    subscriptionLogger.error(`Failed to get analytics for user ${userId}: ${error}`);
    throw new Error('Failed to retrieve analytics');
  }
}

/**
 * Update user subscription plan
 */
export async function updateUserSubscription(
  userId: string, 
  newPlanType: PlanType,
  stripeSubscriptionId?: string,
  stripeCustomerId?: string
): Promise<UserSubscription | null> {
  try {
    subscriptionLogger.info(`Updating subscription for user ${userId}`, {
      newPlanType,
      stripeSubscriptionId
    });

    // Update subscription
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.userSubscription.upsert({
      where: { userId },
      update: {
        planType: newPlanType,
        stripeSubscriptionId,
        stripeCustomerId,
        currentPeriodEnd: periodEnd,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        userId,
        planType: newPlanType,
        stripeSubscriptionId,
        stripeCustomerId,
        currentPeriodEnd: periodEnd,
        isActive: true
      }
    });

    // Create new usage period if needed
    const currentPeriod = await getCurrentUsagePeriod(userId, newPlanType);
    if (!currentPeriod) {
      await createNewUsagePeriod(userId, newPlanType);
    }

    return await getUserSubscription(userId);
  } catch (error) {
    subscriptionLogger.error(`Failed to update subscription for user ${userId}: ${error}`);
    return null;
  }
}