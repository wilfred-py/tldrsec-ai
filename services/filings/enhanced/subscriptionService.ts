import { logger } from '../../../lib/logging';
import { PrismaClient, PlanType, UserSubscription as PrismaUserSubscription } from '@prisma/client';
import { SubscriptionTier, OptimizationLevel, getOptimizationLevelForTier } from './tokenOptimizer';

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
    subscriptionLogger.info(`Recording filing usage for user ${userId}`, {
      filingType,
      ticker,
      timestamp: new Date().toISOString()
    });
    
    // Get user's subscription to determine tier
    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      subscriptionLogger.warn(`No subscription found for user ${userId}, skipping usage tracking`);
      return;
    }

    // Record detailed filing usage
    await prisma.filingUsage.create({
      data: {
        userId,
        filingType,
        ticker: ticker || 'UNKNOWN',
        accessionNumber,
        optimizationLevel: optimizationData?.level || 'unknown',
        originalTokens: optimizationData?.originalTokens,
        optimizedTokens: optimizationData?.optimizedTokens,
        reductionPercentage: optimizationData?.reductionPercentage,
        cost: optimizationData?.cost,
        processingTimeMs: optimizationData?.processingTimeMs,
        subscriptionTier: subscription.tier
      }
    });

    // Increment usage count in current period
    const userSubscription = await prisma.userSubscription.findUnique({
      where: { userId }
    });

    if (userSubscription) {
      await prisma.usagePeriod.updateMany({
        where: {
          userId,
          periodStart: { lte: new Date() },
          periodEnd: { gte: new Date() }
        },
        data: {
          filingsUsed: { increment: 1 }
        }
      });
    }
    
    subscriptionLogger.debug(`Filing usage recorded for user ${userId}`, {
      filingType,
      tier: subscription.tier,
      optimizationLevel: optimizationData?.level
    });
  } catch (error) {
    subscriptionLogger.error(`Failed to record filing usage for user ${userId}: ${error}`);
    // Don't throw error - usage tracking failure shouldn't block filing processing
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