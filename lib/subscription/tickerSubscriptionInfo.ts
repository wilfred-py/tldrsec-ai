import { logger } from '../logging';
import { prisma } from '../db';

const subscriptionLogger = logger.child('ticker-subscription-info');

/**
 * Custom error for authorization failures
 */
export class TickerAccessError extends Error {
  constructor(message: string, public readonly code: string = 'UNAUTHORIZED_TICKER_ACCESS') {
    super(message);
    this.name = 'TickerAccessError';
  }
}

/**
 * Validate that a user has access to subscription information for a ticker
 * Users can only access subscription info for tickers they are subscribed to
 */
async function validateUserAccessToTicker(userId: string, ticker: string): Promise<void> {
  try {
    const userTicker = await prisma.ticker.findFirst({
      where: {
        userId,
        symbol: ticker.toUpperCase()
      }
    });

    if (!userTicker) {
      subscriptionLogger.warn(`User ${userId} attempted to access subscription info for ticker ${ticker} they're not subscribed to`);
      throw new TickerAccessError(
        `Access denied: You must be subscribed to ${ticker} to view its subscription statistics`,
        'NOT_SUBSCRIBED'
      );
    }

    subscriptionLogger.debug(`User ${userId} authorized to access ${ticker} subscription info`);
  } catch (error) {
    if (error instanceof TickerAccessError) {
      throw error;
    }
    
    subscriptionLogger.error(`Error validating user access to ticker: ${error}`);
    throw new TickerAccessError(
      'Unable to verify ticker access permissions',
      'VALIDATION_ERROR'
    );
  }
}

/**
 * Subscription tier information for a ticker
 */
export interface TickerSubscriptionInfo {
  ticker: string;
  totalSubscribers: number;
  hasProUsers: boolean;
  hasMaxUsers: boolean;
  tierMix: {
    basic: number;
    professional: number;
    max: number;
  };
  estimatedTokenMultiplier: number; // Weighted average based on tier optimization levels
  priority: number; // 1-10 scale, higher = more important (based on pro/max users)
}

/**
 * Token optimization multipliers by subscription tier
 * These represent how much more tokens each tier uses due to less optimization
 */
const TOKEN_MULTIPLIERS = {
  basic: 0.6,        // Balanced optimization (85% reduction) = uses 60% of original tokens
  professional: 0.8, // Conservative optimization (67% reduction) = uses 80% of original tokens
  max: 1.0           // Minimal optimization (55% reduction) = uses 100% of original tokens
} as const;

/**
 * Priority weights by subscription tier for queue prioritization
 */
const PRIORITY_WEIGHTS = {
  basic: 1,
  professional: 3,
  max: 5
} as const;

/**
 * Tier counts interface for type safety
 */
interface TierCounts {
  basic: number;
  professional: number;
  max: number;
}

/**
 * Calculate weighted token multiplier with proper bounds checking and validation
 */
function calculateWeightedMultiplier(tierCounts: TierCounts): number {
  // Validate inputs
  const basic = Math.max(0, Math.floor(tierCounts.basic || 0));
  const professional = Math.max(0, Math.floor(tierCounts.professional || 0));
  const max = Math.max(0, Math.floor(tierCounts.max || 0));

  const totalWeight = basic + professional + max;
  
  if (totalWeight === 0) {
    return TOKEN_MULTIPLIERS.basic;
  }
  
  const weightedMultiplier = (
    (basic * TOKEN_MULTIPLIERS.basic) +
    (professional * TOKEN_MULTIPLIERS.professional) +
    (max * TOKEN_MULTIPLIERS.max)
  ) / totalWeight;
  
  // Bounds checking
  const result = Math.max(TOKEN_MULTIPLIERS.basic, Math.min(TOKEN_MULTIPLIERS.max, weightedMultiplier));
  
  if (!Number.isFinite(result) || result < 0) {
    subscriptionLogger.error('Invalid weighted multiplier calculation', { tierCounts, result });
    return TOKEN_MULTIPLIERS.basic;
  }
  
  return parseFloat(result.toFixed(2));
}

/**
 * Get subscription information for a specific ticker
 * @param ticker The ticker symbol (e.g., 'TSLA', 'KO')
 * @param requestingUserId Optional user ID for authorization checks
 * @returns Subscription info including user count, tier mix, and priority data
 */
export async function getTickerSubscriptionInfo(
  ticker: string, 
  requestingUserId?: string
): Promise<TickerSubscriptionInfo> {
  try {
    subscriptionLogger.debug(`Looking up subscription info for ticker: ${ticker}`, {
      requestingUserId: requestingUserId ? '[REDACTED]' : 'none'
    });
    
    // Authorization check: If a user ID is provided, verify they have access to this ticker
    if (requestingUserId) {
      await validateUserAccessToTicker(requestingUserId, ticker);
    }
    
    // Query the database to get all users subscribed to this ticker
    // Join with UserSubscription to get their subscription tiers
    const tickerSubscriptions = await prisma.ticker.findMany({
      where: {
        symbol: ticker.toUpperCase()
      },
      include: {
        user: {
          include: {
            userSubscription: true // Note: lowercase 'u' based on schema
          }
        }
      }
    });

    if (tickerSubscriptions.length === 0) {
      subscriptionLogger.warn(`No subscribers found for ticker: ${ticker}`);
      return createEmptySubscriptionInfo(ticker);
    }

    // Count users by subscription tier
    const tierCounts: TierCounts = {
      basic: 0,
      professional: 0,
      max: 0
    };

    let totalValidSubscribers = 0;

    for (const subscription of tickerSubscriptions) {
      // Add null safety for user object
      if (!subscription || !subscription.user) {
        subscriptionLogger.warn('Subscription missing user data', { 
          subscriptionId: subscription?.id || 'unknown',
          userId: subscription?.userId || 'unknown'
        });
        continue;
      }
      
      const userSub = subscription.user.userSubscription;
      
      if (userSub && userSub.isActive && userSub.currentPeriodEnd >= new Date()) {
        totalValidSubscribers++;
        
        // Map Prisma PlanType to our internal tier names
        switch (userSub.planType) {
          case 'BASIC':
            tierCounts.basic++;
            break;
          case 'PROFESSIONAL':
            tierCounts.professional++;
            break;
          case 'MAX':
            tierCounts.max++;
            break;
          default:
            subscriptionLogger.warn(`Unknown plan type: ${userSub.planType} for user ${subscription.userId}`);
            tierCounts.basic++; // Default to basic
            break;
        }
      } else {
        // User has no active subscription, count as basic (free tier)
        totalValidSubscribers++;
        tierCounts.basic++;
      }
    }

    // Calculate weighted token multiplier with bounds checking
    const totalWeight = tierCounts.basic + tierCounts.professional + tierCounts.max;
    const weightedMultiplier = calculateWeightedMultiplier(tierCounts);

    // Calculate priority score (1-10 scale)
    const priorityScore = totalWeight > 0 ? Math.min(10, Math.ceil(
      ((tierCounts.basic * PRIORITY_WEIGHTS.basic) +
       (tierCounts.professional * PRIORITY_WEIGHTS.professional) +
       (tierCounts.max * PRIORITY_WEIGHTS.max)) / totalWeight * 2
    )) : 1;

    const result: TickerSubscriptionInfo = {
      ticker: ticker.toUpperCase(),
      totalSubscribers: totalValidSubscribers,
      hasProUsers: tierCounts.professional > 0,
      hasMaxUsers: tierCounts.max > 0,
      tierMix: tierCounts,
      estimatedTokenMultiplier: parseFloat(weightedMultiplier.toFixed(2)),
      priority: priorityScore
    };

    subscriptionLogger.info(`Retrieved subscription info for ${ticker}`, {
      processingTier: result.hasMaxUsers ? 'max' :
                      result.hasProUsers ? 'professional' : 'basic',
      priority: result.priority,
      // Sensitive subscription counts and business metrics removed from logs
    });

    return result;

  } catch (error) {
    subscriptionLogger.error(`Failed to get subscription info for ticker ${ticker}: ${error}`);
    
    // Return mock data as fallback to prevent service failures
    subscriptionLogger.warn(`Using fallback mock data for ticker: ${ticker}`);
    return getMockTickerSubscriptionInfo(ticker);
  }
}

/**
 * Get subscription information for multiple tickers in batch
 * More efficient than calling getTickerSubscriptionInfo multiple times
 */
export async function getBatchTickerSubscriptionInfo(tickers: string[]): Promise<TickerSubscriptionInfo[]> {
  subscriptionLogger.debug(`Looking up subscription info for ${tickers.length} tickers`, { tickers });

  try {
    // Process in parallel for better performance
    const results = await Promise.allSettled(
      tickers.map(ticker => getTickerSubscriptionInfo(ticker))
    );

    const subscriptionInfos: TickerSubscriptionInfo[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const ticker = tickers[i];
      
      if (result.status === 'fulfilled') {
        subscriptionInfos.push(result.value);
      } else {
        subscriptionLogger.error(`Failed to get subscription info for ${ticker}: ${result.reason}`);
        // Use mock data as fallback
        subscriptionInfos.push(getMockTickerSubscriptionInfo(ticker));
      }
    }

    return subscriptionInfos;

  } catch (error) {
    subscriptionLogger.error(`Batch lookup failed: ${error}`);
    
    // Return mock data for all tickers as fallback
    return tickers.map(ticker => getMockTickerSubscriptionInfo(ticker));
  }
}

/**
 * Create empty subscription info for tickers with no subscribers
 */
function createEmptySubscriptionInfo(ticker: string): TickerSubscriptionInfo {
  return {
    ticker: ticker.toUpperCase(),
    totalSubscribers: 0,
    hasProUsers: false,
    hasMaxUsers: false,
    tierMix: {
      basic: 0,
      professional: 0,
      max: 0
    },
    estimatedTokenMultiplier: TOKEN_MULTIPLIERS.basic, // Default to basic optimization
    priority: 1 // Lowest priority
  };
}

/**
 * Mock data for testing and fallback scenarios
 * Based on realistic distribution patterns
 */
function getMockTickerSubscriptionInfo(ticker: string): TickerSubscriptionInfo {
  // Create realistic mock data based on ticker popularity
  const popularTickers = ['TSLA', 'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN'];
  const isPopular = popularTickers.includes(ticker.toUpperCase());
  
  // Popular tickers have more subscribers and higher tier mix
  const mockData = isPopular ? {
    totalSubscribers: Math.floor(Math.random() * 20) + 15, // 15-35 subscribers
    basic: Math.floor(Math.random() * 8) + 5,              // 5-13 basic users
    professional: Math.floor(Math.random() * 8) + 4,       // 4-12 pro users
    max: Math.floor(Math.random() * 6) + 2                 // 2-8 max users
  } : {
    totalSubscribers: Math.floor(Math.random() * 8) + 3,   // 3-11 subscribers
    basic: Math.floor(Math.random() * 6) + 2,              // 2-8 basic users
    professional: Math.floor(Math.random() * 3) + 1,       // 1-4 pro users
    max: Math.floor(Math.random() * 2)                     // 0-2 max users
  };

  // Calculate weighted token multiplier with bounds checking
  const tierCounts: TierCounts = {
    basic: mockData.basic,
    professional: mockData.professional,
    max: mockData.max
  };
  const weightedMultiplier = calculateWeightedMultiplier(tierCounts);

  // Calculate priority score
  const totalWeight = mockData.basic + mockData.professional + mockData.max;
  const priorityScore = totalWeight > 0 ? Math.min(10, Math.ceil(
    ((mockData.basic * PRIORITY_WEIGHTS.basic) +
     (mockData.professional * PRIORITY_WEIGHTS.professional) +
     (mockData.max * PRIORITY_WEIGHTS.max)) / totalWeight * 2
  )) : 1;

  subscriptionLogger.debug(`Generated mock data for ${ticker}`, mockData);

  return {
    ticker: ticker.toUpperCase(),
    totalSubscribers: mockData.totalSubscribers,
    hasProUsers: mockData.professional > 0,
    hasMaxUsers: mockData.max > 0,
    tierMix: {
      basic: mockData.basic,
      professional: mockData.professional,
      max: mockData.max
    },
    estimatedTokenMultiplier: parseFloat(weightedMultiplier.toFixed(2)),
    priority: priorityScore
  };
}

/**
 * Get priority queue position for a ticker based on subscription info
 * Higher priority = processed first
 */
export function getFilingPriority(subscriptionInfo: TickerSubscriptionInfo): number {
  // Priority factors:
  // 1. Premium users get highest priority (5-10)
  // 2. Professional users get medium priority (3-7) 
  // 3. Basic users get lower priority (1-3)
  // 4. No subscribers get lowest priority (1)
  
  if (subscriptionInfo.totalSubscribers === 0) {
    return 1; // Lowest priority for unsubscribed tickers
  }

  return subscriptionInfo.priority;
}

/**
 * Estimate token usage for a filing based on subscription mix
 * @param baseTokens The base token count for the filing
 * @param subscriptionInfo The subscription info for the ticker
 * @returns Estimated actual token usage after optimization
 */
export function estimateTokenUsage(baseTokens: number, subscriptionInfo: TickerSubscriptionInfo): number {
  return Math.ceil(baseTokens * subscriptionInfo.estimatedTokenMultiplier);
}