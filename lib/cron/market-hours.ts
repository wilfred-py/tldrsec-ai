/**
 * Market Hours Detection and Processing Eligibility System
 * Handles NYSE/NASDAQ trading hours and tier-based processing frequencies
 */

import { logger } from '../logging';
import { SubscriptionTier } from '@prisma/client';

const cronLogger = logger.child('market-hours');

// Market holidays 2025 (NYSE/NASDAQ closed days)
const MARKET_HOLIDAYS_2025: Set<string> = new Set([
  '2025-01-01', // New Year's Day
  '2025-01-20', // Martin Luther King Jr. Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-11-28', // Day after Thanksgiving (half day, treating as closed)
  '2025-12-25', // Christmas Day
]);

// Tier processing frequencies (in minutes)
export const TIER_FREQUENCIES = {
  INSTITUTION: { market: 5, offMarket: 15 },
  ENTERPRISE: { market: 15, offMarket: 30 },
  PROFESSIONAL: { market: 30, offMarket: 120 },
  FREE: { market: 120, offMarket: 240 }
} as const;

// Monthly budget allocations per user (in USD)
export const TIER_BUDGETS = {
  INSTITUTION: 100.0,
  ENTERPRISE: 25.0,
  PROFESSIONAL: 10.0,
  FREE: 2.0
} as const;

// Processing priority order (higher number = higher priority)
export const TIER_PRIORITIES = {
  INSTITUTION: 4,
  ENTERPRISE: 3,
  PROFESSIONAL: 2,
  FREE: 1
} as const;

export interface MarketHoursContext {
  isMarketHours: boolean;
  isMarketDay: boolean;
  currentTime: Date;
  marketOpen: Date | null;
  marketClose: Date | null;
  timeZone: string;
  isHoliday: boolean;
  nextMarketOpen: Date | null;
}

export interface ProcessingEligibility {
  isEligible: boolean;
  nextEligibleTime: Date | null;
  frequency: number; // minutes
  reason?: string;
}

export interface UserProcessingStatus {
  userId: string;
  tier: SubscriptionTier;
  lastProcessedAt: Date | null;
  eligibility: ProcessingEligibility;
  priority: number;
  budgetStatus: {
    monthlyBudget: number;
    budgetUsed: number;
    budgetRemaining: number;
    budgetUtilization: number; // percentage
  };
}

/**
 * Get current market hours context
 */
export function getMarketHoursContext(now = new Date()): MarketHoursContext {
  const context: MarketHoursContext = {
    isMarketHours: false,
    isMarketDay: false,
    currentTime: now,
    marketOpen: null,
    marketClose: null,
    timeZone: 'America/New_York',
    isHoliday: false,
    nextMarketOpen: null
  };

  // Convert to EST/EDT timezone 
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const easternYear = parts.find(p => p.type === 'year')!.value;
  const easternMonth = parts.find(p => p.type === 'month')!.value;
  const easternDay = parts.find(p => p.type === 'day')!.value;
  const easternHour = parts.find(p => p.type === 'hour')!.value;
  const easternMinute = parts.find(p => p.type === 'minute')!.value;
  const easternSecond = parts.find(p => p.type === 'second')!.value;
  
  // Create a new Date object for Eastern time (this is for day of week calculation)
  const easternTime = new Date(`${easternYear}-${easternMonth}-${easternDay}T${easternHour}:${easternMinute}:${easternSecond}`);
  const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Date string for holiday check
  const dateString = `${easternYear}-${easternMonth}-${easternDay}`;

  // Check if it's a holiday
  context.isHoliday = MARKET_HOLIDAYS_2025.has(dateString);

  // Check if it's a weekday (Monday = 1, Friday = 5)
  context.isMarketDay = dayOfWeek >= 1 && dayOfWeek <= 5 && !context.isHoliday;

  if (context.isMarketDay) {
    // Market hours: 9:30 AM - 4:00 PM EST
    const marketOpen = new Date(easternTime);
    marketOpen.setHours(9, 30, 0, 0);

    const marketClose = new Date(easternTime);
    marketClose.setHours(16, 0, 0, 0);

    context.marketOpen = marketOpen;
    context.marketClose = marketClose;
    context.isMarketHours = easternTime >= marketOpen && easternTime < marketClose;
  }

  // Calculate next market open
  context.nextMarketOpen = calculateNextMarketOpen(now);

  cronLogger.debug('Market hours context calculated', {
    isMarketHours: context.isMarketHours,
    isMarketDay: context.isMarketDay,
    isHoliday: context.isHoliday,
    currentEasternTime: easternTime.toISOString(),
    marketOpen: context.marketOpen?.toISOString(),
    marketClose: context.marketClose?.toISOString()
  });

  return context;
}

/**
 * Calculate processing eligibility for a user based on their tier and last processing time
 */
export function calculateProcessingEligibility(
  tier: SubscriptionTier,
  lastProcessedAt: Date | null,
  marketContext: MarketHoursContext
): ProcessingEligibility {
  // Handle invalid tiers by falling back to FREE tier
  const validTier = TIER_FREQUENCIES[tier] ? tier : 'FREE';
  const frequency = marketContext.isMarketHours 
    ? TIER_FREQUENCIES[validTier].market 
    : TIER_FREQUENCIES[validTier].offMarket;

  // If never processed, user is eligible
  if (!lastProcessedAt) {
    return {
      isEligible: true,
      nextEligibleTime: null,
      frequency,
      reason: 'First time processing'
    };
  }

  // Calculate how long ago the user was last processed
  const timeSinceLastProcess = marketContext.currentTime.getTime() - lastProcessedAt.getTime();
  const frequencyMs = frequency * 60 * 1000; // Convert minutes to milliseconds

  const isEligible = timeSinceLastProcess >= frequencyMs;

  // Calculate next eligible time
  const nextEligibleTime = isEligible 
    ? null 
    : new Date(lastProcessedAt.getTime() + frequencyMs);

  return {
    isEligible,
    nextEligibleTime,
    frequency,
    reason: isEligible 
      ? `${Math.round(timeSinceLastProcess / (60 * 1000))} minutes since last processing (${frequency}min frequency)` 
      : `Only ${Math.round(timeSinceLastProcess / (60 * 1000))} minutes since last processing (${frequency}min frequency required)`
  };
}

/**
 * Get processing status for multiple users with tier-based prioritization
 */
export function getUserProcessingStatuses(
  users: Array<{
    id: string;
    subscriptionTier: SubscriptionTier;
    lastProcessedAt: Date | null;
    budgetUsed: number;
  }>,
  marketContext: MarketHoursContext
): UserProcessingStatus[] {
  const statuses = users.map(user => {
    const eligibility = calculateProcessingEligibility(
      user.subscriptionTier,
      user.lastProcessedAt,
      marketContext
    );

    const monthlyBudget = TIER_BUDGETS[user.subscriptionTier] || TIER_BUDGETS.FREE;
    const budgetRemaining = monthlyBudget - user.budgetUsed;
    const budgetUtilization = (user.budgetUsed / monthlyBudget) * 100;

    return {
      userId: user.id,
      tier: user.subscriptionTier,
      lastProcessedAt: user.lastProcessedAt,
      eligibility,
      priority: TIER_PRIORITIES[user.subscriptionTier] || TIER_PRIORITIES.FREE,
      budgetStatus: {
        monthlyBudget,
        budgetUsed: user.budgetUsed,
        budgetRemaining,
        budgetUtilization
      }
    };
  });

  // Sort by priority (higher first), then by time since last processing
  return statuses.sort((a, b) => {
    // First, prioritize by tier (higher priority first)
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // Within the same tier, prioritize by time since last processing
    const aTimeSince = a.lastProcessedAt 
      ? marketContext.currentTime.getTime() - a.lastProcessedAt.getTime()
      : Infinity;
    const bTimeSince = b.lastProcessedAt 
      ? marketContext.currentTime.getTime() - b.lastProcessedAt.getTime()
      : Infinity;

    return bTimeSince - aTimeSince; // Longer time since processing gets higher priority
  });
}

/**
 * Filter users who are eligible for processing and within budget constraints
 */
export function getEligibleUsers(
  userStatuses: UserProcessingStatus[],
  options: {
    maxUsersPerCycle?: number;
    respectBudgetLimits?: boolean;
    budgetThreshold?: number; // percentage of budget utilization limit
  } = {}
): UserProcessingStatus[] {
  const {
    maxUsersPerCycle = 500,
    respectBudgetLimits = true,
    budgetThreshold = 95 // Don't process users over 95% budget utilization
  } = options;

  let eligibleUsers = userStatuses.filter(user => {
    // Must be eligible for processing
    if (!user.eligibility.isEligible) {
      return false;
    }

    // Check budget constraints if enabled
    if (respectBudgetLimits && user.budgetStatus.budgetUtilization >= budgetThreshold) {
      cronLogger.debug(`User ${user.userId} skipped due to budget constraints`, {
        tier: user.tier,
        budgetUtilization: user.budgetStatus.budgetUtilization,
        budgetThreshold
      });
      return false;
    }

    return true;
  });

  // Limit to maximum users per cycle
  if (eligibleUsers.length > maxUsersPerCycle) {
    cronLogger.info(`Limiting processing to ${maxUsersPerCycle} users (${eligibleUsers.length} eligible)`, {
      totalEligible: eligibleUsers.length,
      maxAllowed: maxUsersPerCycle
    });
    eligibleUsers = eligibleUsers.slice(0, maxUsersPerCycle);
  }

  return eligibleUsers;
}

/**
 * Calculate next market open time (for scheduling optimization)
 */
function calculateNextMarketOpen(now: Date): Date | null {
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const nextOpen = new Date(easternTime);

  // Start looking from today
  for (let i = 0; i < 10; i++) { // Look up to 10 days ahead
    const checkDate = new Date(nextOpen);
    checkDate.setDate(nextOpen.getDate() + i);
    
    const dayOfWeek = checkDate.getDay();
    const dateString = checkDate.toISOString().split('T')[0];

    // Check if it's a weekday and not a holiday
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !MARKET_HOLIDAYS_2025.has(dateString)) {
      const marketOpen = new Date(checkDate);
      marketOpen.setHours(9, 30, 0, 0);

      // If it's today and market hasn't opened yet, or it's a future day
      if (i === 0 && easternTime < marketOpen) {
        return marketOpen;
      } else if (i > 0) {
        return marketOpen;
      }
    }
  }

  return null; // Couldn't find next market open within 10 days
}

/**
 * Get tier distribution for monitoring and analytics
 */
export function getTierDistribution(
  userStatuses: UserProcessingStatus[]
): Record<SubscriptionTier, { total: number; eligible: number; withinBudget: number }> {
  const distribution = {
    FREE: { total: 0, eligible: 0, withinBudget: 0 },
    PROFESSIONAL: { total: 0, eligible: 0, withinBudget: 0 },
    ENTERPRISE: { total: 0, eligible: 0, withinBudget: 0 },
    INSTITUTION: { total: 0, eligible: 0, withinBudget: 0 }
  };

  userStatuses.forEach(user => {
    distribution[user.tier].total++;
    
    if (user.eligibility.isEligible) {
      distribution[user.tier].eligible++;
    }

    if (user.budgetStatus.budgetUtilization < 95) {
      distribution[user.tier].withinBudget++;
    }
  });

  return distribution;
}

/**
 * Check if we should process any users during off-market hours
 * (Useful for Railway's continuous cron scheduling)
 */
export function shouldProcessDuringOffHours(
  eligibleUsers: UserProcessingStatus[]
): boolean {
  // Always process Institution tier users (they pay premium for frequent updates)
  const institutionUsers = eligibleUsers.filter(u => u.tier === 'INSTITUTION');
  if (institutionUsers.length > 0) {
    return true;
  }

  // Process Enterprise users if they haven't been processed in a while
  const enterpriseUsers = eligibleUsers.filter(u => u.tier === 'ENTERPRISE');
  const staleEnterpriseUsers = enterpriseUsers.filter(u => {
    if (!u.lastProcessedAt) return true;
    const hoursSinceLastProcess = (Date.now() - u.lastProcessedAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastProcess > 1; // More than 1 hour
  });
  
  return staleEnterpriseUsers.length > 0;
}